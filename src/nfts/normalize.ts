/**
 * Pure normalization of OpenSea API v2 NFT payloads into RareFriendAsset.
 * Used by the client apiClient and unit tests. No network, no secrets.
 */

import {
  ROBINHOOD_CHAIN_ID,
  OPENSEA_ROBINHOOD_SLUG,
  matchAllowedCollection,
  buildOpenseaItemUrl,
  normalizeAddress,
} from './collections.ts';
import type { RareFriendAsset, NftTrait, NftAsset } from './types.ts';

// Raw shapes (subset) returned by OpenSea API v2.
export interface OpenSeaTraitRaw {
  trait_type?: unknown;
  value?: unknown;
  display_type?: unknown;
}

export interface OpenSeaNftRaw {
  identifier?: unknown;
  contract?: unknown;
  collection?: unknown;
  name?: unknown;
  image_url?: unknown;
  display_image_url?: unknown;
  display_animation_url?: unknown;
  animation_url?: unknown;
  original_image_url?: unknown;
  opensea_url?: unknown;
  traits?: unknown;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** Normalize a token identifier to canonical decimal string. Returns '' if invalid. */
export function normalizeTokenId(identifier: unknown): string {
  if (typeof identifier === 'number') {
    if (!Number.isInteger(identifier) || identifier < 0) return '';
    return String(identifier);
  }
  if (typeof identifier !== 'string') return '';
  const trimmed = identifier.trim();
  if (!/^\d+$/.test(trimmed)) return '';
  // Strip leading zeros canonically (keep single zero).
  const canonical = trimmed.replace(/^0+(?=\d)/, '');
  return canonical;
}

function normalizeTraits(traits: unknown): NftTrait[] {
  if (!Array.isArray(traits)) return [];
  const out: NftTrait[] = [];
  const seen = new Set<string>();
  for (const t of traits as OpenSeaTraitRaw[]) {
    if (!t || typeof t !== 'object') continue;
    const traitType = asString(t.trait_type).slice(0, 64);
    const value = String(t.value ?? '').slice(0, 128);
    if (!traitType || !value) continue;
    const key = `${traitType}::${value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      traitType,
      value,
      displayType: asString(t.display_type) || undefined,
    });
    if (out.length >= 64) break;
  }
  return out;
}

/**
 * Normalize one raw OpenSea NFT into a RareFriendAsset.
 * Returns null when the item is ineligible (wrong contract, bad token id, etc.).
 * `reportedOwner` must be the wallet address the item was discovered under.
 */
export function normalizeOpenSeaNft(
  raw: OpenSeaNftRaw | null | undefined,
  reportedOwner: string
): RareFriendAsset | null {
  if (!raw || typeof raw !== 'object') return null;

  const allowed = matchAllowedCollection(asString(raw.contract));
  if (!allowed) return null;

  const tokenId = normalizeTokenId(raw.identifier);
  if (!tokenId) return null;

  const owner = normalizeAddress(reportedOwner);
  if (!owner) return null;

  // Media priority: display_image_url -> image_url -> original_image_url.
  const displayImage = asString(raw.display_image_url);
  const image = asString(raw.image_url);
  const original = asString(raw.original_image_url);
  const imageUrl = displayImage || image || original;

  const animation =
    asString(raw.animation_url) || asString(raw.display_animation_url) || '';

  const openseaUrl =
    asString(raw.opensea_url) ||
    buildOpenseaItemUrl(OPENSEA_ROBINHOOD_SLUG, allowed.contract, tokenId);

  const name =
    asString(raw.name) ||
    (allowed.type === 'GENESIS' ? `Genesis #${tokenId}` : `Friend #${tokenId}`);

  const collectionName = allowed.displayName;

  return {
    chain: OPENSEA_ROBINHOOD_SLUG,
    chainId: ROBINHOOD_CHAIN_ID,
    contract: allowed.contract,
    tokenId,
    collectionType: allowed.type,
    collectionName,
    collectionSlug: allowed.collectionSlug,
    name,
    imageUrl,
    displayImageUrl: displayImage || imageUrl,
    animationUrl: animation || undefined,
    openseaUrl,
    traits: normalizeTraits(raw.traits),
    ownerAddress: owner,
    reportedOwner: owner,
    isRareFriends: true,
    rareFriendsType: allowed.type,
    ownershipVerified: false,
    verificationSource: 'none',
  };
}

/**
 * Normalize a full account-inventory page. Filters + dedupes by
 * chainId:contract:tokenId so a repeated item can never appear twice.
 */
export function normalizeInventoryPage(
  rawNfts: unknown,
  reportedOwner: string
): RareFriendAsset[] {
  if (!Array.isArray(rawNfts)) return [];
  const seen = new Set<string>();
  const out: RareFriendAsset[] = [];
  for (const raw of rawNfts as OpenSeaNftRaw[]) {
    const asset = normalizeOpenSeaNft(raw, reportedOwner);
    if (!asset) continue;
    const key = `${asset.chainId}:${asset.contract.toLowerCase()}:${asset.tokenId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Generic multi-collection normalization (NEW: beyond Rare Friends)
// ---------------------------------------------------------------------------

export interface GenericRawNft extends OpenSeaNftRaw {
  description?: unknown;
  token_standard?: unknown;
  is_disabled?: unknown;
  is_nsfw?: unknown;
  is_suspicious?: unknown;
  estimated_value_usd?: unknown;
}

function asOptionalString(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

/**
 * Normalize ANY OpenSea NFT into the generic NftAsset model.
 * Rare Friends are detected via exact contract allowlist and flagged
 * (isRareFriends) — never by name/slug alone.
 */
export function normalizeGenericNft(
  raw: GenericRawNft | null | undefined,
  chainSlug: string,
  reportedOwner: string,
  opts: { chainId?: number; collectionImage?: string } = {}
): NftAsset | null {
  if (!raw || typeof raw !== 'object') return null;
  const contract = asString(raw.contract);
  if (!/^0x[0-9a-fA-F]{40}$/.test(contract)) return null;
  const tokenId = normalizeTokenId(raw.identifier);
  if (!tokenId) return null;
  const owner = normalizeAddress(reportedOwner);
  if (!owner) return null;

  const allowed = matchAllowedCollection(contract);
  const slug = asString(raw.collection) || (allowed ? allowed.collectionSlug : '');
  if (!slug) return null;

  const displayImage = asString(raw.display_image_url);
  const image = asString(raw.image_url);
  const original = asString(raw.original_image_url);
  const imageUrl = displayImage || image || original;
  const animation = asString(raw.animation_url) || asString(raw.display_animation_url) || '';
  const openseaUrl =
    asString(raw.opensea_url) || buildOpenseaItemUrl(chainSlug, contract, tokenId);
  const traits = normalizeTraits(raw.traits);
  const name =
    asString(raw.name) ||
    (allowed
      ? allowed.type === 'GENESIS'
        ? `Genesis #${tokenId}`
        : `Friend #${tokenId}`
      : `#${tokenId}`);
  const collectionName = allowed
    ? allowed.displayName
    : slug
        .split('-')
        .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1) : w))
        .join(' ');

  const estRaw = (raw as Record<string, unknown>).estimated_value_usd;
  const estimatedValueUsd =
    typeof estRaw === 'number' && Number.isFinite(estRaw) ? estRaw : null;

  const gen = allowed?.type === 'GENERATIONS' ? detectGenerationTrait(traits) : undefined;

  return {
    chain: chainSlug,
    chainId: opts.chainId,
    contract,
    tokenId,
    tokenStandard: asOptionalString((raw as Record<string, unknown>).token_standard),
    collectionSlug: slug,
    collectionName,
    collectionImage: opts.collectionImage,
    name,
    description: asOptionalString((raw as Record<string, unknown>).description),
    imageUrl,
    displayImageUrl: displayImage || imageUrl,
    animationUrl: animation || undefined,
    openseaUrl,
    traits,
    ownerAddress: owner,
    reportedOwner: owner,
    isRareFriends: !!allowed,
    rareFriendsType: allowed?.type,
    rareFriendsGeneration: gen?.value,
    isDisabled: (raw as Record<string, unknown>).is_disabled === true,
    isNsfw: (raw as Record<string, unknown>).is_nsfw === true,
    isSuspicious: (raw as Record<string, unknown>).is_suspicious === true,
    estimatedValueUsd,
    ownershipVerified: false,
    verificationSource: 'none',
    collectionType: allowed?.type,
  };
}

/** Normalize a full multi-chain page into generic assets (dedupe by chain:contract:id). */
export function normalizeGenericPage(
  rawNfts: unknown,
  chainSlug: string,
  reportedOwner: string,
  opts: { chainId?: number } = {}
): NftAsset[] {
  if (!Array.isArray(rawNfts)) return [];
  const seen = new Set<string>();
  const out: NftAsset[] = [];
  for (const raw of rawNfts as GenericRawNft[]) {
    const asset = normalizeGenericNft(raw, chainSlug, reportedOwner, opts);
    if (!asset) continue;
    const key = `${asset.chain.toLowerCase()}:${asset.contract.toLowerCase()}:${asset.tokenId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Generation trait detection
// ---------------------------------------------------------------------------

/** Candidate trait-type spellings, in preference order. */
const GENERATION_CANDIDATES = ['generation', 'gen', 'series'];

export interface DetectedGeneration {
  traitType: string;
  value: string;
}

/**
 * Detect the canonical Generation trait from live NFT traits.
 * Matches case-insensitively against known spellings; returns the ACTUAL
 * on-chain traitType spelling (e.g. "Generation") and normalized value.
 * Live-verified 2026-09-28: trait_type="Generation", values "0".."6".
 */
export function detectGenerationTrait(traits: NftTrait[]): DetectedGeneration | null {
  for (const t of traits) {
    const lower = t.traitType.trim().toLowerCase();
    if (GENERATION_CANDIDATES.includes(lower)) {
      const value = String(t.value ?? '').trim();
      if (!value) continue;
      return { traitType: t.traitType, value };
    }
  }
  return null;
}

/** Detect generation from collection-level trait categories (prefers canonical). */
export function detectGenerationTraitType(categories: Record<string, string>): string | null {
  const keys = Object.keys(categories);
  for (const cand of ['Generation', 'generation', 'Gen', 'gen', 'Series', 'series']) {
    if (keys.includes(cand)) return cand;
  }
  const lower = keys.find((k) => GENERATION_CANDIDATES.includes(k.trim().toLowerCase()));
  return lower ?? null;
}

// ---------------------------------------------------------------------------
// Picker ordering
// ---------------------------------------------------------------------------

import type { CollectionGroup } from './types.ts';

function pricingRef(a: NftAsset): bigint | null {
  const u = a.pricing?.referenceRfUnits;
  return typeof u === 'bigint' ? u : null;
}

function topBidUsdNum(g: CollectionGroup): number | null {
  if (!g.topBidUsd) return null;
  const n = Number(g.topBidUsd);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Group assets by collection and sort per product rules:
 * 1. RARE FRIENDS pinned first (internally sorted by RF ref DESC, then type/token).
 * 2. Other priced collections by top-bid USD DESC (ties: name A–Z).
 * 3. Unpriced collections last (name A–Z).
 * Within a collection: RF ref DESC, then tokenId/name deterministically.
 */
export function groupAndSortCollections(assets: NftAsset[]): CollectionGroup[] {
  const byKey = new Map<string, NftAsset[]>();
  for (const a of assets) {
    const key = `${a.chain.toLowerCase()}::${a.collectionSlug.toLowerCase()}`;
    const list = byKey.get(key);
    if (list) list.push(a);
    else byKey.set(key, [a]);
  }
  const groups: CollectionGroup[] = [];
  for (const list of byKey.values()) {
    const first = list[0]!;
    const pricedRefs = list
      .map((a) => a.pricing?.referenceRfUnits)
      .filter((u): u is bigint => typeof u === 'bigint');
    // Collection top-bid USD: prefer max asset bid, else null.
    let topBidUsd: string | undefined;
    let maxBid = -1;
    for (const a of list) {
      const f = a.pricing?.topBidUsd;
      if (f !== undefined) {
        const n = Number(f);
        if (Number.isFinite(n) && n > maxBid) {
          maxBid = n;
          topBidUsd = f;
        }
      }
    }
    let maxRef: bigint | undefined;
    for (const r of pricedRefs) {
      if (maxRef === undefined || r > maxRef) maxRef = r;
    }
    const sorted = [...list].sort((a, b) => {
      const ra = pricingRef(a);
      const rb = pricingRef(b);
      if (ra !== null && rb !== null && ra !== rb) return rb > ra ? 1 : -1;
      if (ra !== null && rb === null) return -1;
      if (ra === null && rb !== null) return 1;
      // Rare Friends secondary: GENESIS before GENERATIONS? No — by ref then
      // generation rank then token id. Others: token id / name.
      if (a.isRareFriends && b.isRareFriends) {
        const ga = a.rareFriendsGeneration !== undefined ? Number(a.rareFriendsGeneration) : 999;
        const gb = b.rareFriendsGeneration !== undefined ? Number(b.rareFriendsGeneration) : 999;
        if (Number.isFinite(ga) && Number.isFinite(gb) && ga !== gb) return ga - gb;
        const ta = a.rareFriendsType ?? '';
        const tb = b.rareFriendsType ?? '';
        if (ta !== tb) return ta.localeCompare(tb);
      }
      const na = BigIntSafe(a.tokenId);
      const nb = BigIntSafe(b.tokenId);
      if (na !== null && nb !== null && na !== nb) return na < nb ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    groups.push({
      key: `${first.chain.toLowerCase()}::${first.collectionSlug.toLowerCase()}`,
      collectionSlug: first.collectionSlug,
      collectionName: first.collectionName,
      collectionImage: first.collectionImage,
      chain: first.chain,
      isRareFriends: first.isRareFriends,
      assets: sorted,
      ownedCount: list.length,
      topBidUsd,
      referenceRfUnits: maxRef,
      priced: maxBid > 0 || maxRef !== undefined,
    });
  }
  // Split: rare friends first (preserve internal ref-desc order across the
  // whole section by sorting groups? Rare Friends is ONE section — but two
  // slugs (genesis/generations) may form two groups. Pin both at top, Genesis
  // group first only when refs equal; otherwise higher-ref group first.
  const rare = groups.filter((g) => g.isRareFriends);
  const rest = groups.filter((g) => !g.isRareFriends);
  rare.sort((a, b) => {
    const ra = a.referenceRfUnits;
    const rb = b.referenceRfUnits;
    if (ra !== undefined && rb !== undefined && ra !== rb) return rb > ra ? 1 : -1;
    if (ra !== undefined && rb === undefined) return -1;
    if (ra === undefined && rb !== undefined) return 1;
    return a.collectionName.localeCompare(b.collectionName);
  });
  const priced = rest.filter((g) => g.priced);
  const unpriced = rest.filter((g) => !g.priced);
  priced.sort((a, b) => {
    const fa = topBidUsdNum(a);
    const fb = topBidUsdNum(b);
    const ra = a.referenceRfUnits;
    const rb = b.referenceRfUnits;
    // Prefer USD top bid; fall back to RF ref.
    if (fa !== null && fb !== null && fa !== fb) return fb - fa;
    if (fa !== null && fb === null) return -1;
    if (fa === null && fb !== null) return 1;
    if (ra !== undefined && rb !== undefined && ra !== rb) return rb > ra ? 1 : -1;
    return a.collectionName.localeCompare(b.collectionName);
  });
  unpriced.sort((a, b) => a.collectionName.localeCompare(b.collectionName));
  return [...rare, ...priced, ...unpriced];
}

function BigIntSafe(s: string): bigint | null {
  try {
    if (!/^\d+$/.test(s)) return null;
    return BigInt(s);
  } catch {
    return null;
  }
}

/** Top-bid badge label for an asset. */
export function bidBadgeLabel(a: NftAsset): string {
  const p = a.pricing;
  if (!p || p.state === 'loading') return 'PRICING…';
  if (p.state === 'unpriced') return 'NO BIDS';
  if (p.state === 'rf_unavailable') return '$RF UNAVAILABLE';
  if (p.method === 'rare_friends_generation_bid' && p.traitValue !== undefined) {
    return `GEN ${p.traitValue} TOP BID`;
  }
  if (a.isRareFriends && a.rareFriendsType === 'GENESIS') return 'GENESIS TOP BID';
  if (p.method === 'rare_friends_collection_bid_fallback' || p.method === 'collection_top_bid_fallback') {
    return 'COLLECTION BID FALLBACK';
  }
  if (p.method === 'item_top_bid') return 'TOP BID';
  return 'COLLECTION TOP BID';
}
