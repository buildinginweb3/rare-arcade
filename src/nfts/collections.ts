/**
 * Canonical Rare Friends collections on Robinhood Chain.
 * Eligibility is based on EXACT normalized contract match — never on
 * collection display names or slugs alone.
 */

import type { NftCollectionType } from '../domain/types.ts';

export const ROBINHOOD_CHAIN_ID = 4663;
export const OPENSEA_ROBINHOOD_SLUG = 'robinhood';

export const GENESIS_CONTRACT = '0x116eaa62241751e0c98da43d458600c6c17cd361';
export const GENERATIONS_CONTRACT = '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d';

export const GENESIS_OPENSEA_URL = 'https://opensea.io/collection/rare-friends-genesis';
export const GENERATIONS_OPENSEA_URL = 'https://opensea.io/collection/rare-friends-generations';

export interface AllowedCollection {
  type: NftCollectionType;
  contract: string;
  collectionSlug: string;
  displayName: string;
  openseaUrl: string;
}

export const ALLOWED_COLLECTIONS: readonly AllowedCollection[] = [
  {
    type: 'GENESIS',
    contract: GENESIS_CONTRACT,
    collectionSlug: 'rare-friends-genesis',
    displayName: 'Rare Friends Genesis',
    openseaUrl: GENESIS_OPENSEA_URL,
  },
  {
    type: 'GENERATIONS',
    contract: GENERATIONS_CONTRACT,
    collectionSlug: 'rare-friends-generations',
    displayName: 'Rare Friends Generations',
    openseaUrl: GENERATIONS_OPENSEA_URL,
  },
];

/** Normalize an EVM address for comparison (lowercase). Returns '' for invalid. */
export function normalizeAddress(address: string | null | undefined): string {
  if (!address || typeof address !== 'string') return '';
  const trimmed = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(trimmed)) return '';
  return trimmed;
}

export function isValidAddress(address: string | null | undefined): boolean {
  return normalizeAddress(address) !== '';
}

/** Exact contract allowlist match. Returns the collection or null. */
export function matchAllowedCollection(
  contractAddress: string | null | undefined
): AllowedCollection | null {
  const normalized = (contractAddress ?? '').trim().toLowerCase();
  for (const c of ALLOWED_COLLECTIONS) {
    if (c.contract.toLowerCase() === normalized) return c;
  }
  return null;
}

/**
 * Canonical local reservation key for demo simulated-funding:
 * "chainId:contract:tokenId" (all lowercase).
 */
export function nftReservationKey(
  chainId: number,
  contractAddress: string,
  tokenId: string | bigint
): string {
  return `${chainId}:${contractAddress.trim().toLowerCase()}:${String(tokenId)}`;
}

/** Build an OpenSea item URL only from verified chain/contract/tokenId. */
export function buildOpenseaItemUrl(
  chainSlug: string,
  contractAddress: string,
  tokenId: string | bigint
): string {
  return `https://opensea.io/assets/${chainSlug}/${contractAddress}/${String(tokenId)}`;
}
