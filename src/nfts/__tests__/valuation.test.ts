/**
 * NFT inventory + market valuation tests (automatic top-bid model).
 * Deterministic fixtures — no live OpenSea calls.
 */
import { describe, it, expect } from 'vitest';
import {
  convertUsdToRfUnits,
  parseUsdToScaled,
  isUsableBidValue,
  isFreshEnoughForPublish,
  MAX_PUBLISH_DATA_AGE_MS,
} from '../valuation.ts';
import {
  detectGenerationTrait,
  detectGenerationTraitType,
  groupAndSortCollections,
  bidBadgeLabel,
} from '../normalize.ts';
import { __clearMarketCaches } from '../marketData.ts';
import type { NftAsset } from '../types.ts';

function asset(partial: Partial<NftAsset> & { tokenId: string }): NftAsset {
  return {
    chain: 'robinhood',
    contract: '0x0000000000000000000000000000000000000001',
    tokenStandard: 'erc721',
    collectionSlug: 'test-collection',
    collectionName: 'Test Collection',
    name: `Test #${partial.tokenId}`,
    imageUrl: '',
    displayImageUrl: '',
    openseaUrl: 'https://opensea.io/',
    traits: [],
    ownerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    reportedOwner: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    isRareFriends: false,
    ownershipVerified: false,
    ...partial,
  } as NftAsset;
}

function priced(child: Partial<NftAsset> & { tokenId: string }, topBidUsd: string, refUnits: bigint): NftAsset {
  return asset({
    ...child,
    pricing: {
      state: 'priced',
      method: 'collection_top_bid',
      topBidUsd,
      rfUsd: '0.002',
      referenceRfUnits: refUnits,
      fallbackUsed: false,
      valuedAt: Date.now(),
    },
  });
}

describe('valuation math (valuation.ts)', () => {
  it('converts top-bid USD / RF USD to exact RF reference (100 / 0.002 = 50,000 RF)', () => {
    const units = convertUsdToRfUnits('100', '0.002');
    // 50,000 RF = 50,000,000 internal units.
    expect(units).toBe(50_000_000n);
  });

  it('handles generation fixtures exactly (25/0.0025=10k, 50/0.0025=20k, 125/0.0025=50k)', () => {
    expect(convertUsdToRfUnits('25', '0.0025')).toBe(10_000_000n);
    expect(convertUsdToRfUnits('50', '0.0025')).toBe(20_000_000n);
    expect(convertUsdToRfUnits('125', '0.0025')).toBe(50_000_000n);
  });

  it('uses precise decimal math (no float drift for tiny RF prices)', () => {
    // Live RF price shape: 0.0013825448626950097
    const units = convertUsdToRfUnits('0.05', '0.0013825448626950097');
    expect(typeof units).toBe('bigint');
    expect(units! > 0n).toBe(true);
    // Cross-check: 0.05 / 0.0013825448 ≈ 36.165 RF → 36165 units.
    expect(units).toBe(36165n);
  });

  it('rejects zero/malformed bids (never silently values at zero)', () => {
    expect(convertUsdToRfUnits('0', '0.002')).toBeNull();
    expect(convertUsdToRfUnits('-5', '0.002')).toBeNull();
    expect(convertUsdToRfUnits('abc', '0.002')).toBeNull();
    expect(convertUsdToRfUnits('100', '0')).toBeNull();
    expect(convertUsdToRfUnits(null, '0.002')).toBeNull();
  });

  it('parses USD strings to scaled integers', () => {
    expect(parseUsdToScaled('1')).toBe(1_000_000_000n);
    expect(parseUsdToScaled('0.05')).toBe(50_000_000n);
    expect(parseUsdToScaled('1647')).toBe(1_647_000_000_000n);
    expect(parseUsdToScaled('bad')).toBeNull();
  });

  it('validates bid usability', () => {
    expect(isUsableBidValue(100)).toBe(true);
    expect(isUsableBidValue(0)).toBe(false);
    expect(isUsableBidValue(-1)).toBe(false);
    expect(isUsableBidValue(NaN)).toBe(false);
    expect(isUsableBidValue('100')).toBe(false);
  });

  it('enforces publish freshness (15-minute threshold)', () => {
    const now = Date.now();
    expect(isFreshEnoughForPublish(now, now)).toBe(true);
    expect(isFreshEnoughForPublish(now - MAX_PUBLISH_DATA_AGE_MS + 1000, now)).toBe(true);
    expect(isFreshEnoughForPublish(now - MAX_PUBLISH_DATA_AGE_MS - 1000, now)).toBe(false);
    expect(isFreshEnoughForPublish(0, now)).toBe(false);
  });
});

describe('generation trait detection (normalize.ts)', () => {
  it('detects canonical Generation trait (live shape: trait_type=Generation)', () => {
    const det = detectGenerationTrait([
      { traitType: 'Character', value: 'Family' },
      { traitType: 'Generation', value: '3' },
    ]);
    expect(det).toEqual({ traitType: 'Generation', value: '3' });
  });

  it('handles alternate spellings without assuming one name', () => {
    expect(detectGenerationTrait([{ traitType: 'generation', value: '1' }])?.value).toBe('1');
    expect(detectGenerationTrait([{ traitType: 'Gen', value: '2' }])?.traitType).toBe('Gen');
    expect(detectGenerationTrait([{ traitType: 'Series', value: '4' }])?.value).toBe('4');
    expect(detectGenerationTrait([{ traitType: 'Eyes', value: 'Dot' }])).toBeNull();
  });

  it('detects generation trait type from collection categories', () => {
    expect(
      detectGenerationTraitType({ Generation: 'number', Character: 'string' })
    ).toBe('Generation');
    expect(detectGenerationTraitType({ Eyes: 'string' })).toBeNull();
  });
});

describe('wallet inventory ordering (normalize.ts groupAndSortCollections)', () => {
  it('pins Rare Friends first, then high→low top bid, unpriced last', () => {
    const assets: NftAsset[] = [
      priced(
        { tokenId: '1', collectionSlug: 'low-floor', collectionName: 'Low Floor', chain: 'ethereum', contract: '0x000000000000000000000000000000000000000a' },
        '630',
        315_000_000n
      ),
      asset({
        tokenId: '9',
        collectionSlug: 'unpriced-x',
        collectionName: 'Collection X',
        chain: 'ethereum',
        contract: '0x000000000000000000000000000000000000000b',
        pricing: { state: 'unpriced', valuedAt: Date.now() },
      }),
      priced(
        {
          tokenId: '773',
          collectionSlug: 'rare-friends-genesis',
          collectionName: 'Rare Friends Genesis',
          chain: 'robinhood',
          contract: '0x116eaa62241751e0c98da43d458600c6c17cd361',
          name: 'Genesis #773',
          isRareFriends: true,
          rareFriendsType: 'GENESIS',
        },
        '1647',
        823_500_000n
      ),
      priced(
        { tokenId: '2', collectionSlug: 'high-floor', collectionName: 'Collection A', chain: 'ethereum', contract: '0x000000000000000000000000000000000000000c' },
        '8200',
        4_100_000_000n
      ),
      priced(
        { tokenId: '3', collectionSlug: 'mid-floor', collectionName: 'Collection B', chain: 'base', contract: '0x000000000000000000000000000000000000000d' },
        '2400',
        1_200_000_000n
      ),
    ];
    const groups = groupAndSortCollections(assets);
    expect(groups[0]!.isRareFriends).toBe(true);
    const rest = groups.slice(1).map((g) => g.collectionSlug);
    expect(rest).toEqual(['high-floor', 'mid-floor', 'low-floor', 'unpriced-x']);
  });

  it('keeps Rare Friends first even when another top bid is 500x higher', () => {
    const assets: NftAsset[] = [
      priced(
        { tokenId: '1', collectionSlug: 'whale', collectionName: 'Whale', chain: 'ethereum', contract: '0x00000000000000000000000000000000000000aa' },
        '10000',
        5_000_000_000n
      ),
      priced(
        {
          tokenId: '8283',
          collectionSlug: 'rare-friends-generations',
          collectionName: 'Rare Friends Generations',
          chain: 'robinhood',
          contract: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d',
          name: 'Friend #8283',
          isRareFriends: true,
          rareFriendsType: 'GENERATIONS',
          rareFriendsGeneration: '0',
        },
        '20',
        10_000_000n
      ),
    ];
    const groups = groupAndSortCollections(assets);
    expect(groups[0]!.isRareFriends).toBe(true);
  });

  it('sorts Rare Friends internally by calculated RF reference DESC', () => {
    const assets: NftAsset[] = [
      priced(
        {
          tokenId: '1',
          collectionSlug: 'rare-friends-generations',
          collectionName: 'Rare Friends Generations',
          chain: 'robinhood',
          contract: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d',
          name: 'Friend #1',
          isRareFriends: true,
          rareFriendsType: 'GENERATIONS',
          rareFriendsGeneration: '1',
          pricing: undefined,
        },
        '25',
        10_000_000n
      ),
      priced(
        {
          tokenId: '3',
          collectionSlug: 'rare-friends-generations',
          collectionName: 'Rare Friends Generations',
          chain: 'robinhood',
          contract: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d',
          name: 'Friend #3',
          isRareFriends: true,
          rareFriendsType: 'GENERATIONS',
          rareFriendsGeneration: '3',
        },
        '125',
        50_000_000n
      ),
    ];
    const groups = groupAndSortCollections(assets);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.assets[0]!.tokenId).toBe('3');
    expect(groups[0]!.assets[1]!.tokenId).toBe('1');
  });

  it('orders within a collection by RF ref DESC then token ID', () => {
    const mk = (id: string): NftAsset =>
      priced(
        { tokenId: id, collectionSlug: 'same', collectionName: 'Same', chain: 'base', contract: '0x00000000000000000000000000000000000000bb' },
        '100',
        50_000_000n
      );
    const groups = groupAndSortCollections([mk('99'), mk('7'), mk('42')]);
    expect(groups[0]!.assets.map((a) => a.tokenId)).toEqual(['7', '42', '99']);
  });

  it('breaks bid ties alphabetically, unpriced last', () => {
    const a = priced({ tokenId: '1', collectionSlug: 'b-coll', collectionName: 'B Coll', chain: 'base', contract: '0x00000000000000000000000000000000000000c1' }, '100', 50_000_000n);
    const b = priced({ tokenId: '2', collectionSlug: 'a-coll', collectionName: 'A Coll', chain: 'base', contract: '0x00000000000000000000000000000000000000c2' }, '100', 50_000_000n);
    const groups = groupAndSortCollections([a, b]);
    expect(groups.map((g) => g.collectionSlug)).toEqual(['a-coll', 'b-coll']);
  });
});

describe('bid badges (normalize.ts bidBadgeLabel)', () => {
  it('labels generation bids, genesis, fallback, unpriced distinctly', () => {
    const gen = asset({
      tokenId: '1',
      isRareFriends: true,
      rareFriendsType: 'GENERATIONS',
      pricing: {
        state: 'priced',
        method: 'rare_friends_generation_bid',
        topBidUsd: '50',
        rfUsd: '0.0025',
        referenceRfUnits: 20_000_000n,
        traitType: 'Generation',
        traitValue: '2',
        fallbackUsed: false,
        valuedAt: Date.now(),
      },
    });
    expect(bidBadgeLabel(gen)).toBe('GEN 2 TOP BID');

    const fallback = asset({
      tokenId: '5',
      isRareFriends: true,
      rareFriendsType: 'GENERATIONS',
      pricing: {
        state: 'priced',
        method: 'rare_friends_collection_bid_fallback',
        topBidUsd: '30',
        rfUsd: '0.0025',
        referenceRfUnits: 12_000_000n,
        fallbackUsed: true,
        valuedAt: Date.now(),
      },
    });
    expect(bidBadgeLabel(fallback)).toBe('COLLECTION BID FALLBACK');

    const genesis = asset({
      tokenId: '773',
      isRareFriends: true,
      rareFriendsType: 'GENESIS',
      pricing: {
        state: 'priced',
        method: 'collection_top_bid',
        topBidUsd: '1647',
        rfUsd: '0.002',
        referenceRfUnits: 823_500_000n,
        fallbackUsed: false,
        valuedAt: Date.now(),
      },
    });
    expect(bidBadgeLabel(genesis)).toBe('GENESIS TOP BID');

    const ordinary = asset({
      tokenId: '7',
      pricing: {
        state: 'priced',
        method: 'collection_top_bid',
        topBidUsd: '100',
        rfUsd: '0.002',
        referenceRfUnits: 50_000_000n,
        fallbackUsed: false,
        valuedAt: Date.now(),
      },
    });
    expect(bidBadgeLabel(ordinary)).toBe('COLLECTION TOP BID');

    const legacyItem = asset({
      tokenId: '8',
      pricing: {
        state: 'priced',
        method: 'item_top_bid',
        topBidUsd: '100',
        rfUsd: '0.002',
        referenceRfUnits: 50_000_000n,
        fallbackUsed: false,
        valuedAt: Date.now(),
      },
    });
    expect(bidBadgeLabel(legacyItem)).toBe('TOP BID');

    const unpriced = asset({ tokenId: '9', pricing: { state: 'unpriced', valuedAt: Date.now() } });
    expect(bidBadgeLabel(unpriced)).toBe('NO BIDS');
  });
});

describe('market cache hygiene', () => {
  it('clears caches without throwing', () => {
    expect(() => __clearMarketCaches()).not.toThrow();
  });
});
