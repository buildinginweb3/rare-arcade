/**
 * Generalized NFT domain model.
 *
 * Rare Friends are a SPECIAL collection within the broader model — no longer
 * the only type. RareFriendAsset is preserved for backward compatibility and
 * narrows NftAsset via `isRareFriends`.
 */

import type { NftCollectionType } from '../domain/types.ts';

export interface NftTrait {
  traitType: string;
  value: string;
  displayType?: string;
}

/** Immutable market valuation snapshot locked at publish time. */
export type ValuationMethod =
  | 'collection_top_bid'
  | 'item_top_bid'
  | 'rare_friends_generation_bid'
  | 'rare_friends_collection_bid_fallback'
  | 'collection_top_bid_fallback'
  | 'legacy_manual'
  | 'demo_snapshot';

export interface ValuationSnapshot {
  method: ValuationMethod;
  source: 'opensea' | 'demo' | 'legacy';
  collectionSlug: string;
  /** Generation trait context for Generations NFTs. */
  traitType?: string;
  traitValue?: string;
  topBidUsd: string;
  bidNative?: string;
  bidCurrency?: string;
  /** USDG reference value as a decimal string. USDG is pegged 1:1 to USD. */
  referenceUsdg: string;
  valuedAt: number;
  fallbackUsed: boolean;
}

/** Top-bid pricing attached to a wallet inventory asset. */
export interface NftPricing {
  state: 'priced' | 'unpriced' | 'loading' | 'stale';
  method?: ValuationMethod;
  topBidUsd?: string;
  bidNative?: string;
  bidCurrency?: string;
  /** USDG reference value in USDG internal units (top bid, 1:1 with USD). */
  usdgValueUnits?: bigint;
  traitType?: string;
  traitValue?: string;
  fallbackUsed?: boolean;
  valuedAt?: number;
  stale?: boolean;
  bidLabel?: string;
}

/**
 * Generic wallet-owned NFT. `isRareFriends` marks the special pinned
 * collection; `collectionType` is only set for Genesis/Generations.
 */
export interface NftAsset {
  /**
   * OpenSea chain slug. Always `robinhood` for assets Rare Arcade discovers —
   * the platform is single-chain. Retained on the record so stored rows and
   * reservation keys stay stable.
   */
  chain: string;
  chainId?: number;
  contract: string;
  tokenId: string; // canonical decimal string
  tokenStandard?: string;

  collectionSlug: string;
  collectionName: string;
  collectionImage?: string;

  name: string;
  description?: string;

  imageUrl: string;
  displayImageUrl: string;
  animationUrl?: string;
  openseaUrl: string;

  traits: NftTrait[];
  ownerAddress: string;

  isRareFriends: boolean;
  rareFriendsType?: NftCollectionType;
  /** Canonical Generation value for Generations NFTs (string, e.g. "3"). */
  rareFriendsGeneration?: string;

  /** Safety flags from OpenSea (spam/hidden handling). */
  isDisabled?: boolean;
  isNsfw?: boolean;
  isSuspicious?: boolean;

  /** Informational only — never used for machine economics. */
  estimatedValueUsd?: number | null;

  /** True when a fresh verification confirmed ownerAddress. */
  ownershipVerified: boolean;
  /** `opensea` is no longer produced: every prize NFT verifies on-chain. */
  verificationSource?: 'onchain' | 'mock' | 'none';

  /** Live market pricing (undefined while loading). */
  pricing?: NftPricing;

  /** Legacy alias kept for Rare-Friends-only callers. */
  reportedOwner: string;
  collectionType?: NftCollectionType;
}

/** Back-compat: Rare-Friends-only asset narrows NftAsset. */
export interface RareFriendAsset extends NftAsset {
  chainId: number;
  collectionType: NftCollectionType;
}

export function isRareFriendAsset(a: NftAsset): a is RareFriendAsset {
  return a.isRareFriends && !!a.rareFriendsType;
}

/** Stable reservation key: chainSlug:contract:tokenId (lowercased). */
export function nftAssetKey(a: Pick<NftAsset, 'chain' | 'contract' | 'tokenId'>): string {
  return `${a.chain.toLowerCase()}:${a.contract.toLowerCase()}:${a.tokenId}`;
}

export interface NftInventoryResult {
  assets: NftAsset[];
  /** True when more pages may exist but the safe app limit was reached. */
  truncated: boolean;
  /** Opaque cursor passthrough (server-managed). */
  next: string | null;
}

export type NftFetchState =
  | { status: 'idle' }
  | { status: 'connecting' }
  | { status: 'loading' }
  | { status: 'ready'; assets: NftAsset[]; truncated: boolean }
  | { status: 'empty' }
  | { status: 'error'; message: string; retryable: boolean };

/** Collection group for the picker (top-bid USD DESC, unpriced last). */
export interface CollectionGroup {
  key: string;
  collectionSlug: string;
  collectionName: string;
  collectionImage?: string;
  chain: string;
  isRareFriends: boolean;
  assets: NftAsset[];
  ownedCount: number;
  topBidUsd?: string;
  referenceRfUnits?: bigint;
  priced: boolean;
}
