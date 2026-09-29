/**
 * buildNftPrizeEntry: each verified NFT becomes its OWN prize entry carrying
 * the full per-prize odds (multi-select never splits odds across entries).
 */
import { describe, it, expect } from 'vitest';
import { buildNftPrizeEntry } from '../prizeEntry.ts';
import type { NftAsset } from '../types.ts';

function nft(partial: { tokenId: string; contract: string } & Partial<NftAsset>): NftAsset {
  const { tokenId, contract, ...rest } = partial;
  return {
    chain: 'robinhood',
    chainId: 4663,
    contract,
    tokenId,
    tokenStandard: 'erc721',
    collectionSlug: 'rare-friends-generations',
    collectionName: 'Rare Friends Generations',
    name: `Friend #${partial.tokenId}`,
    imageUrl: '',
    displayImageUrl: '',
    openseaUrl: 'https://opensea.io/',
    traits: [{ traitType: 'Generation', value: '0' }],
    ownerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    reportedOwner: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    isRareFriends: true,
    rareFriendsType: 'GENERATIONS',
    rareFriendsGeneration: '0',
    ownershipVerified: true,
    verificationSource: 'onchain',
    ...rest,
  } as NftAsset;
}

function pricedRef() {
  return {
    state: 'priced' as const,
    method: 'collection_top_bid' as const,
    topBidUsd: '100',
    bidNative: '100',
    bidCurrency: 'USDC',
    rfUsd: '0.002',
    referenceRfUnits: 50_000_000n,
    fallbackUsed: false,
    valuedAt: Date.now(),
  };
}

describe('buildNftPrizeEntry', () => {
  it('builds one immutable entry with snapshot per NFT', () => {
    const a = nft({ tokenId: '1', contract: '0x0000000000000000000000000000000000000001' });
    const entry = buildNftPrizeEntry({ asset: a, pricing: pricedRef(), refValUnits: 50_000_000n });
    expect(entry.type).toBe('FRIEND_PRIZE');
    if (entry.type !== 'FRIEND_PRIZE') throw new Error('unreachable');
    expect(entry.tokenId).toBe(1n);
    expect(entry.referenceValueUnits).toBe(50_000_000n);
    expect(entry.initialQuantity).toBe(1);
    expect(entry.origin).toBe('real-nft');
    expect(entry.valuationSnapshot?.topBidUsd).toBe('100');
    expect(entry.valuationSnapshot?.referenceRf).toBe('50000000');
    expect(entry.valuationSnapshot?.source).toBe('opensea');
    expect(entry.oddsPpm).toBeUndefined();
  });

  it('stamps the SAME odds on every entry (3 NFTs at 1% = three 1% lines)', () => {
    const assets = ['1', '2', '3'].map((t) =>
      nft({ tokenId: t, contract: '0x0000000000000000000000000000000000000001' })
    );
    const entries = assets.map((a) =>
      buildNftPrizeEntry({ asset: a, pricing: pricedRef(), refValUnits: 50_000_000n, oddsPpm: 10000 })
    );
    expect(entries).toHaveLength(3);
    const ids = new Set(entries.map((e) => e.id));
    expect(ids.size).toBe(3);
    for (const e of entries) {
      expect(e.type).toBe('FRIEND_PRIZE');
      if (e.type !== 'FRIEND_PRIZE') throw new Error('unreachable');
      expect(e.oddsPpm).toBe(10000);
      expect(e.referenceValueUnits).toBe(50_000_000n);
    }
    // Total configured chance is the SUM (3%), never an even split.
    const totalPpm = entries.reduce(
      (n, e) => n + (e.type === 'FRIEND_PRIZE' ? (e.oddsPpm ?? 0) : 0),
      0
    );
    expect(totalPpm).toBe(30000);
  });

  it('derives generation + trait context for Generations NFTs', () => {
    const a = nft({ tokenId: '9', contract: '0x0000000000000000000000000000000000000001' });
    const entry = buildNftPrizeEntry({
      asset: a,
      pricing: {
        ...pricedRef(),
        method: 'rare_friends_generation_bid',
        traitType: 'Generation',
        traitValue: '3',
      },
      refValUnits: 20_000_000n,
    });
    if (entry.type !== 'FRIEND_PRIZE') throw new Error('unreachable');
    expect(entry.generation).toBe(0);
    expect(entry.valuationSnapshot?.method).toBe('rare_friends_generation_bid');
    expect(entry.valuationSnapshot?.traitValue).toBe('3');
  });
});
