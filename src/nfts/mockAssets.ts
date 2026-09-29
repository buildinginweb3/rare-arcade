/**
 * Deterministic mock Rare Friend assets for unit tests, E2E (via request
 * interception), and offline demo mode. Shapes mirror verified live OpenSea
 * responses (Generations #8283 / #5147, Genesis #773).
 */

import type { RareFriendAsset } from './types.ts';
import { GENERATIONS_CONTRACT, GENESIS_CONTRACT, ROBINHOOD_CHAIN_ID } from './collections.ts';

// Useagogue: mock media uses picsum-free deterministic SVG data URIs? No —
// E2E needs "actual-looking fixture image URLs". Use stable placeholder image
// hosts that resolve without API keys. These are clearly mock (not Rare
// Friends art) and are ONLY used when VITE_MOCK_NFTS=1 / intercepted routes.
export const MOCK_GENERATIONS_ASSET: RareFriendAsset = {
  chain: 'robinhood',
  chainId: ROBINHOOD_CHAIN_ID,
  contract: GENERATIONS_CONTRACT,
  tokenId: '8283',
  collectionType: 'GENERATIONS',
  collectionName: 'Rare Friends Generations',
  collectionSlug: 'rare-friends-generations',
  name: 'Friend #8283',
  imageUrl: 'https://raw2.seadn.io/robinhood/0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d/536fdc9943dda517fed786a0126f64/1d536fdc9943dda517fed786a0126f64.svg',
  displayImageUrl: 'https://raw2.seadn.io/robinhood/0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d/536fdc9943dda517fed786a0126f64/1d536fdc9943dda517fed786a0126f64.svg',
  openseaUrl: 'https://opensea.io/assets/robinhood/0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d/8283',
  traits: [
    { traitType: 'Character', value: 'Mask' },
    { traitType: 'Generation', value: '0' },
  ],
  ownerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  reportedOwner: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  isRareFriends: true,
  rareFriendsType: 'GENERATIONS',
  rareFriendsGeneration: '0',
  ownershipVerified: false,
};

export const MOCK_GENESIS_ASSET: RareFriendAsset = {
  chain: 'robinhood',
  chainId: ROBINHOOD_CHAIN_ID,
  contract: GENESIS_CONTRACT,
  tokenId: '773',
  collectionType: 'GENESIS',
  collectionName: 'Rare Friends Genesis',
  collectionSlug: 'rare-friends-genesis',
  name: 'Genesis #773',
  imageUrl: 'https://raw2.seadn.io/robinhood/0x116eaa62241751e0c98da43d458600c6c17cd361/2e6ad320983e993caa09777ee98030/e52e6ad320983e993caa09777ee98030.svg',
  displayImageUrl: 'https://raw2.seadn.io/robinhood/0x116eaa62241751e0c98da43d458600c6c17cd361/2e6ad320983e993caa09777ee98030/e52e6ad320983e993caa09777ee98030.svg',
  openseaUrl: 'https://opensea.io/assets/robinhood/0x116eaa62241751e0c98da43d458600c6c17cd361/773',
  traits: [{ traitType: 'Eyes', value: 'Dot' }],
  ownerAddress: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  reportedOwner: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  isRareFriends: true,
  rareFriendsType: 'GENESIS',
  ownershipVerified: false,
};

export const MOCK_ASSETS: RareFriendAsset[] = [MOCK_GENESIS_ASSET, MOCK_GENERATIONS_ASSET];

/** Mocked raw OpenSea account-page payload (for normalize unit tests). */
export function mockAccountPageRaw(owner: string): unknown[] {
  return [
    {
      identifier: '8283',
      contract: GENERATIONS_CONTRACT,
      collection: 'rare-friends-generations',
      name: 'Friend #8283',
      image_url: MOCK_GENERATIONS_ASSET.imageUrl,
      display_image_url: MOCK_GENERATIONS_ASSET.displayImageUrl,
      display_animation_url: null,
      opensea_url: MOCK_GENERATIONS_ASSET.openseaUrl,
      traits: [
        { trait_type: 'Character', value: 'Mask' },
        { trait_type: 'Generation', value: '0' },
      ],
      _owner: owner,
    },
    {
      identifier: '773',
      contract: GENESIS_CONTRACT,
      collection: 'rare-friends-genesis',
      name: 'Genesis #773',
      image_url: MOCK_GENESIS_ASSET.imageUrl,
      display_image_url: MOCK_GENESIS_ASSET.displayImageUrl,
      display_animation_url: null,
      opensea_url: MOCK_GENESIS_ASSET.openseaUrl,
      traits: [{ trait_type: 'Eyes', value: 'Dot' }],
      _owner: owner,
    },
    // Unrelated contract — must be filtered.
    {
      identifier: '999',
      contract: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      collection: 'not-rare-friends',
      name: 'Fake Friend',
      image_url: 'https://example.com/fake.png',
      display_image_url: 'https://example.com/fake.png',
      opensea_url: 'https://opensea.io/assets/ethereum/0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef/999',
      traits: [],
      _owner: owner,
    },
    // Duplicate of 8283 — must be deduped.
    {
      identifier: '8283',
      contract: GENERATIONS_CONTRACT,
      collection: 'rare-friends-generations',
      name: 'Friend #8283',
      image_url: MOCK_GENERATIONS_ASSET.imageUrl,
      display_image_url: MOCK_GENERATIONS_ASSET.displayImageUrl,
      opensea_url: MOCK_GENERATIONS_ASSET.openseaUrl,
      traits: [],
      _owner: owner,
    },
    // Malformed token id — must be rejected.
    {
      identifier: 'abc',
      contract: GENERATIONS_CONTRACT,
      collection: 'rare-friends-generations',
      name: 'Broken',
      image_url: 'https://example.com/broken.png',
      display_image_url: '',
      opensea_url: '',
      traits: [],
      _owner: owner,
    },
  ];
}
