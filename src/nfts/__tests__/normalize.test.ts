import { describe, it, expect } from 'vitest';
import {
  normalizeOpenSeaNft,
  normalizeInventoryPage,
  normalizeTokenId,
} from '../normalize.ts';
import {
  matchAllowedCollection,
  nftReservationKey,
  buildOpenseaItemUrl,
  normalizeAddress,
  GENESIS_CONTRACT,
  GENERATIONS_CONTRACT,
  ROBINHOOD_CHAIN_ID,
} from '../collections.ts';
import { mockAccountPageRaw } from '../mockAssets.ts';

const OWNER = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('Contract allowlist (collections.ts)', () => {
  it('matches Genesis and Generations contracts (case-insensitive)', () => {
    expect(matchAllowedCollection(GENESIS_CONTRACT)?.type).toBe('GENESIS');
    expect(matchAllowedCollection(GENERATIONS_CONTRACT.toUpperCase())?.type).toBe('GENERATIONS');
  });
  it('rejects unrelated contracts and names', () => {
    expect(matchAllowedCollection('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef')).toBeNull();
    expect(matchAllowedCollection('Rare Friends')).toBeNull();
    expect(matchAllowedCollection('')).toBeNull();
  });
  it('validates wallet addresses', () => {
    expect(normalizeAddress(OWNER)).toBe(OWNER.toLowerCase());
    expect(normalizeAddress('not-an-address')).toBe('');
    expect(normalizeAddress('')).toBe('');
  });
  it('builds reservation keys and OpenSea URLs from verified parts only', () => {
    expect(nftReservationKey(4663, GENERATIONS_CONTRACT, '8283')).toBe(
      `4663:${GENERATIONS_CONTRACT.toLowerCase()}:8283`
    );
    expect(buildOpenseaItemUrl('robinhood', GENERATIONS_CONTRACT, '8283')).toBe(
      `https://opensea.io/assets/robinhood/${GENERATIONS_CONTRACT}/8283`
    );
  });
});

describe('Token ID normalization', () => {
  it('accepts decimal strings and strips leading zeros', () => {
    expect(normalizeTokenId('8283')).toBe('8283');
    expect(normalizeTokenId('00042')).toBe('42');
    expect(normalizeTokenId(7)).toBe('7');
  });
  it('rejects malformed ids', () => {
    expect(normalizeTokenId('abc')).toBe('');
    expect(normalizeTokenId('-5')).toBe('');
    expect(normalizeTokenId('12.5')).toBe('');
    expect(normalizeTokenId('')).toBe('');
    expect(normalizeTokenId(null)).toBe('');
  });
});

describe('OpenSea normalization (normalize.ts)', () => {
  it('normalizes a Generations response', () => {
    const raw = mockAccountPageRaw(OWNER)[0]!;
    const asset = normalizeOpenSeaNft(raw as never, OWNER);
    expect(asset).not.toBeNull();
    expect(asset!.chainId).toBe(ROBINHOOD_CHAIN_ID);
    expect(asset!.contract).toBe(GENERATIONS_CONTRACT);
    expect(asset!.tokenId).toBe('8283');
    expect(asset!.collectionType).toBe('GENERATIONS');
    expect(asset!.name).toBe('Friend #8283');
    expect(asset!.imageUrl).toContain('seadn.io');
    expect(asset!.displayImageUrl).toBe(asset!.imageUrl);
    expect(asset!.openseaUrl).toContain('/8283');
    expect(asset!.reportedOwner).toBe(OWNER.toLowerCase());
    expect(asset!.ownershipVerified).toBe(false);
  });

  it('normalizes a Genesis response', () => {
    const raw = mockAccountPageRaw(OWNER)[1]!;
    const asset = normalizeOpenSeaNft(raw as never, OWNER);
    expect(asset?.collectionType).toBe('GENESIS');
    expect(asset?.tokenId).toBe('773');
  });

  it('prefers display image over standard/original image', () => {
    const asset = normalizeOpenSeaNft(
      {
        identifier: '1',
        contract: GENERATIONS_CONTRACT,
        name: 'Friend #1',
        image_url: 'https://example.com/standard.png',
        display_image_url: 'https://example.com/display.png',
        original_image_url: 'https://example.com/original.png',
        opensea_url: 'https://opensea.io/x',
        traits: [],
      },
      OWNER
    );
    expect(asset?.imageUrl).toBe('https://example.com/display.png');
  });

  it('falls back to constructed OpenSea URL when missing', () => {
    const asset = normalizeOpenSeaNft(
      { identifier: '5', contract: GENESIS_CONTRACT, traits: [] },
      OWNER
    );
    expect(asset?.openseaUrl).toBe(
      `https://opensea.io/assets/robinhood/${GENESIS_CONTRACT}/5`
    );
    expect(asset?.name).toBe('Genesis #5');
  });

  it('keeps an empty image (fallback UI handles it, never substitutes art)', () => {
    const asset = normalizeOpenSeaNft(
      { identifier: '6', contract: GENESIS_CONTRACT, traits: [] },
      OWNER
    );
    expect(asset?.imageUrl).toBe('');
  });

  it('rejects wrong-contract items', () => {
    const raw = mockAccountPageRaw(OWNER)[2]!;
    expect(normalizeOpenSeaNft(raw as never, OWNER)).toBeNull();
  });

  it('rejects malformed token ids', () => {
    const raw = mockAccountPageRaw(OWNER)[4]!;
    expect(normalizeOpenSeaNft(raw as never, OWNER)).toBeNull();
  });

  it('dedupes repeated NFTs in a page', () => {
    const assets = normalizeInventoryPage(mockAccountPageRaw(OWNER), OWNER);
    const ids = assets.map((a) => `${a.contract}:${a.tokenId}`);
    expect(assets.length).toBe(2);
    expect(new Set(ids).size).toBe(2);
  });

  it('normalizes traits and drops malformed ones', () => {
    const asset = normalizeOpenSeaNft(
      {
        identifier: '9',
        contract: GENERATIONS_CONTRACT,
        traits: [
          { trait_type: 'Character', value: 'Mask' },
          { trait_type: '', value: 'x' },
          { trait_type: 'Seed', value: '' },
          null,
        ],
      },
      OWNER
    );
    expect(asset?.traits).toEqual([{ traitType: 'Character', value: 'Mask' }]);
  });
});
