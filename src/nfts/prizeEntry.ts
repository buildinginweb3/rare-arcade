/**
 * Pure builder: verified wallet NFT + automatic top-bid valuation →
 * machine prize entry. Each NFT becomes its OWN entry (multi-select adds N
 * entries, each carrying the full per-prize odds — never split).
 */

import type { PrizeEntry, NftValuationSnapshot } from '../domain/types.ts';
import type { NftAsset, NftPricing } from './types.ts';
import { detectGenerationTrait } from './normalize.ts';

export interface NftPrizeBuildInput {
  /** Freshly verified asset (ownership already confirmed). */
  asset: NftAsset;
  /** Priced valuation from the inventory pipeline (caller guarantees priced). */
  pricing: NftPricing;
  /** RF reference in internal units, derived from pricing. */
  refValUnits: bigint;
  /** Fallback $RF price when the pricing snapshot lacks one. */
  rfUsdFallback?: string | null;
  /** Fixed-odds chance per pull (same value stamped on EVERY entry). */
  oddsPpm?: number;
}

/** Build one immutable prize entry + valuation snapshot for a verified NFT. */
export function buildNftPrizeEntry(input: NftPrizeBuildInput): PrizeEntry {
  const { asset: verified, pricing, refValUnits, rfUsdFallback, oddsPpm } = input;
  const det = detectGenerationTrait(verified.traits);
  const method =
    pricing.method ??
    (verified.isRareFriends && verified.rareFriendsType === 'GENERATIONS'
      ? 'rare_friends_collection_bid_fallback'
      : 'collection_top_bid_fallback');
  const snapshot: NftValuationSnapshot = {
    method,
    source: 'opensea' as const,
    collectionSlug: verified.collectionSlug,
    traitType: pricing.traitType ?? det?.traitType,
    traitValue: pricing.traitValue ?? det?.value ?? verified.rareFriendsGeneration,
    topBidUsd: pricing.topBidUsd ?? '0',
    bidNative: pricing.bidNative,
    bidCurrency: pricing.bidCurrency,
    rfUsd: pricing.rfUsd ?? rfUsdFallback ?? '0',
    referenceRf: refValUnits.toString(),
    valuedAt: pricing.valuedAt ?? Date.now(),
    fallbackUsed: pricing.fallbackUsed ?? false,
  };
  const genNum =
    verified.rareFriendsGeneration !== undefined
      ? Number(verified.rareFriendsGeneration)
      : det
        ? Number(det.value)
        : 0;
  return {
    id: `prize-friend-${verified.contract}-${verified.tokenId}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    type: 'FRIEND_PRIZE',
    tokenId: BigInt(verified.tokenId),
    name: verified.name,
    familyName: verified.collectionName,
    generation: Number.isFinite(genNum) ? genNum : 0,
    referenceValueUnits: refValUnits,
    initialQuantity: 1,
    remainingQuantity: 1,
    ...(oddsPpm !== undefined ? { oddsPpm } : {}),
    origin: 'real-nft',
    chainId: verified.chainId,
    chainSlug: verified.chain,
    contractAddress: verified.contract,
    collectionType: verified.collectionType,
    collectionSlug: verified.collectionSlug,
    collectionName: verified.collectionName,
    collectionImage: verified.collectionImage,
    tokenStandard: verified.tokenStandard,
    description: verified.description,
    traits: verified.traits,
    imageUrl: verified.imageUrl,
    displayImageUrl: verified.displayImageUrl,
    animationUrl: verified.animationUrl,
    openseaUrl: verified.openseaUrl,
    verifiedOwnerAddress: verified.reportedOwner,
    valuationSnapshot: snapshot,
  };
}
