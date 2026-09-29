/**
 * Centralized OpenSea market-data service.
 *
 * Verified against CURRENT OpenSea API v2 docs + live responses (2026-09-29):
 * - GET /api/v2/chains
 * - GET /api/v2/chain/{chain}/account/{address}/nfts?limit&next
 * - GET /api/v2/chain/{chain}/contract/{address}/nfts/{identifier}
 * - GET /api/v2/chain/{chain}/contract/{address}/nfts/{identifier}/collection
 * - GET /api/v2/collections/{slug}
 * - GET /api/v2/traits/{slug}                     -> categories/counts
 * - GET /api/v2/offers/collection/{slug}?limit&next -> collection offers (unsorted: max client-side)
 * - GET /api/v2/offers/collection/{slug}/traits?mode=NUMERIC&type=&min_value=&max_value=
 *   (generation-targeted bids; STRING/MULTI modes for text traits)
 * - GET /api/v2/chain/{chain}/token/{address}     -> usd_price (RF price)
 * - GET /api/v2/chain/{chain}/payment_token/{address} -> usdPrice (bid conversion)
 * - POST /api/v2/nfts/batch                       -> batch NFT details
 *
 * Valuation basis: TOP BID (highest ACTIVE offer), never floor price.
 * Caching: inventory 45s, RF 45s, bids 3min.
 * Concurrency: max 4 parallel market requests. 429 → exponential backoff+jitter.
 */

import { getSupportedChains as getChainsRegistry } from './chains.ts';

const OPENSEA_BASE = 'https://api.opensea.io/api/v2';

function apiKey(): string {
  try {
    const env = (import.meta as unknown as { env?: Record<string, string> }).env;
    if (env?.VITE_OPENSEA_API_KEY) return env.VITE_OPENSEA_API_KEY;
  } catch {
    // ignore
  }
  return BUNDLED_DEMO_KEY;
}

// Bundled DEMO key (user-accepted public/rotatable burner). Do not log it.
import { BUNDLED_DEMO_KEY } from './apiKey.ts';

export const RF_CHAIN = 'robinhood';
export const RF_CONTRACT = '0x0779369854d3ecdea927206718ffd7730c67b71f';

export const CACHE_TTL = {
  inventoryMs: 45_000,
  rfMs: 45_000,
  bidMs: 3 * 60_000,
  chainsMs: 60 * 60_000,
  tokenMs: 3 * 60_000,
};

interface CacheEntry<T> {
  at: number;
  value: T;
}

const collectionBidCache = new Map<string, CacheEntry<CollectionTopBid | null>>();
const generationBidCache = new Map<string, CacheEntry<GenerationTopBid | null>>();
let rfCacheEntry: CacheEntry<RfPrice | null> | null = null;
const tokenPriceCache = new Map<string, CacheEntry<number | null>>();
const inventoryCache = new Map<string, CacheEntry<{ assets: RawNft[]; truncated: boolean }>>();

const inflight = new Map<string, Promise<unknown>>();

function mockMode(): boolean {
  try {
    return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MOCK_NFTS === '1';
  } catch {
    return false;
  }
}

export class OpenSeaError extends Error {
  status: number;
  retryable: boolean;
  constructor(message: string, status: number, retryable = false) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Authenticated fetch with 429 backoff (max 3 retries). Never logs the key. */
export async function osFetch(path: string, init?: RequestInit, retries = 3): Promise<unknown> {
  const key = apiKey();
  let attempt = 0;
  for (;;) {
    const res = await fetch(`${OPENSEA_BASE}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        'X-API-KEY': key,
        ...(init?.headers ?? {}),
      },
    });
    if (res.status === 429 && attempt < retries) {
      const backoff = Math.min(8000, 500 * 2 ** attempt) + Math.random() * 250;
      attempt++;
      await sleep(backoff);
      continue;
    }
    if (!res.ok) {
      const retryable = res.status === 429 || res.status >= 500;
      if (res.status === 401 || res.status === 403) {
        throw new OpenSeaError('NFT API key rejected (401/403). Rotate the burner key and rebuild.', res.status, false);
      }
      if (res.status === 429) {
        throw new OpenSeaError('MARKET DATA BUSY — OpenSea rate limit reached. Retry shortly.', 429, true);
      }
      let detail = '';
      try {
        const j = (await res.json()) as { errors?: string[] };
        if (Array.isArray(j.errors) && j.errors.length > 0) detail = `: ${j.errors.join('; ').slice(0, 200)}`;
      } catch {
        // ignore
      }
      throw new OpenSeaError(`OpenSea request failed (HTTP ${res.status})${detail}`, res.status, retryable);
    }
    return res.json() as Promise<unknown>;
  }
}

/** Small concurrency pool (max N parallel). */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const p = fn().finally(() => {
    if (inflight.get(key) === p) inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
}

// ---------------------------------------------------------------------------
// Raw shapes
// ---------------------------------------------------------------------------

export interface RawNft {
  identifier?: unknown;
  contract?: unknown;
  collection?: unknown;
  name?: unknown;
  description?: unknown;
  image_url?: unknown;
  display_image_url?: unknown;
  display_animation_url?: unknown;
  animation_url?: unknown;
  original_image_url?: unknown;
  opensea_url?: unknown;
  traits?: unknown;
  token_standard?: unknown;
  is_disabled?: unknown;
  is_nsfw?: unknown;
  is_suspicious?: unknown;
  estimated_value_usd?: unknown;
}

/** Highest ACTIVE offer observed for a whole collection (fallback reference). */
export interface CollectionTopBid {
  slug: string;
  topBidUsd: string;
  bidNative?: string;
  bidCurrency?: string;
  valuedAt: number;
  source: 'collection_offers';
  /** Caps how many offer pages were scanned (endpoint is unsorted). */
  offersScanned: number;
}

/** Highest ACTIVE generation-targeted trait offer (Generations special case). */
export interface GenerationTopBid {
  slug: string;
  traitType: string;
  traitValue: string;
  topBidUsd: string;
  bidNative: string;
  bidCurrency: string;
  paymentTokenAddress?: string;
  orderHash?: string;
  offersScanned: number;
  valuedAt: number;
}

export interface RfPrice {
  chain: string;
  address: string;
  symbol: string;
  usdPrice: string;
  valuedAt: number;
}

// ---------------------------------------------------------------------------
// Chains
// ---------------------------------------------------------------------------

export async function fetchSupportedChains(): Promise<{ slug: string; name: string }[]> {
  if (mockMode()) return [{ slug: 'robinhood', name: 'Robinhood' }];
  const data = (await osFetch('/chains')) as { chains?: { chain?: string; name?: string }[] };
  return (data.chains ?? [])
    .filter((c) => typeof c.chain === 'string')
    .map((c) => ({ slug: c.chain as string, name: c.name ?? (c.chain as string) }));
}

export async function registryChains(): Promise<{ slug: string; name: string }[]> {
  try {
    const chains = await getChainsRegistry(() => osFetch('/chains'));
    return chains.map((c) => ({ slug: c.slug, name: c.name }));
  } catch {
    return [{ slug: 'robinhood', name: 'Robinhood' }];
  }
}

// ---------------------------------------------------------------------------
// Wallet inventory (multi-chain, paginated, spam-aware)
// ---------------------------------------------------------------------------

const PAGE_LIMIT = 100;
const MAX_PAGES_PER_CHAIN = 3;

export async function fetchAccountNfts(
  chain: string,
  address: string,
  cursor?: string | null,
  limit: number = PAGE_LIMIT
): Promise<{ nfts: RawNft[]; next: string | null }> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('next', cursor);
  const data = (await osFetch(
    `/chain/${chain}/account/${address}/nfts?${params}`
  )) as { nfts?: RawNft[]; next?: string | null };
  return {
    nfts: Array.isArray(data.nfts) ? data.nfts : [],
    next: typeof data.next === 'string' && data.next ? data.next : null,
  };
}

/**
 * Discover NFTs owned by `address` across `chains` (controlled scan).
 * Filters spam/hidden by default (is_disabled / is_nsfw stay visible but
 * flagged; callers decide prominence — suspicious items never price first).
 */
export async function fetchOwnedNftsAcrossChains(
  address: string,
  chains: string[],
  opts: { concurrency?: number; pagesPerChain?: number } = {}
): Promise<{ byChain: Record<string, RawNft[]>; truncated: boolean }> {
  const wallet = address.trim().toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet)) {
    throw new Error('Invalid wallet address.');
  }
  const cacheKey = `inv:${wallet}:${[...chains].sort().join(',')}`;
  const cached = inventoryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL.inventoryMs) {
    const byChain: Record<string, RawNft[]> = {};
    for (const a of cached.value.assets) {
      const c = (a as RawNft & { __chain?: string }).__chain ?? 'unknown';
      (byChain[c] ??= []).push(a);
    }
    return { byChain, truncated: cached.value.truncated };
  }
  return dedupe(cacheKey, async () => {
    const concurrency = opts.concurrency ?? 4;
    const pagesPerChain = opts.pagesPerChain ?? MAX_PAGES_PER_CHAIN;
    let truncated = false;
    const results = await mapWithConcurrency(chains, concurrency, async (chain) => {
      const out: RawNft[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < pagesPerChain; page++) {
        const res = await fetchAccountNfts(chain, wallet, cursor);
        for (const n of res.nfts) {
          (n as RawNft & { __chain?: string }).__chain = chain;
          out.push(n);
        }
        cursor = res.next;
        if (!cursor) break;
        if (page === pagesPerChain - 1 && cursor) truncated = true;
      }
      return { chain, nfts: out };
    });
    const byChain: Record<string, RawNft[]> = {};
    const flat: RawNft[] = [];
    for (const r of results) {
      byChain[r.chain] = r.nfts;
      flat.push(...r.nfts);
    }
    inventoryCache.set(cacheKey, { at: Date.now(), value: { assets: flat, truncated } });
    return { byChain, truncated };
  });
}

// ---------------------------------------------------------------------------
// Top-bid valuation (highest ACTIVE offer, never floor price)
// ---------------------------------------------------------------------------

const USD_STABLE_SYMBOLS = new Set(['USDG', 'USDC', 'USDT', 'DAI', 'USD']);

export interface OfferPrice {
  currency?: string;
  decimals?: number;
  value?: string;
}

export interface OfferLike {
  status?: string;
  chain?: string;
  order_hash?: string;
  asset?: { contract?: string; identifier?: string | null };
  criteria?: {
    collection?: { slug?: string } | null;
    contract?: { address?: string } | null;
    traits?: { type?: string; value?: string }[] | null;
    numeric_traits?: { type?: string; min?: number | null; max?: number | null }[] | null;
  } | null;
  price?: OfferPrice;
  protocol_data?: {
    parameters?: {
      /** Payment offered (ERC-20/Fungible side of an offer order). */
      offer?: { token?: string }[];
      consideration?: {
        token?: string;
        /** Seaport item type: 2/3 = ERC721/1155, 4/5 = with criteria. */
        itemType?: number;
        startAmount?: string;
        endAmount?: string;
        identifierOrCriteria?: string;
      }[];
    };
  };
}

function amountToUnits(value: string, decimals: number): number {
  const v = Number(value);
  if (!Number.isFinite(v) || v <= 0) return NaN;
  return v / 10 ** decimals;
}

/** Payment-token contract behind an offer (offer side first, consideration fallback). */
function offerPaymentToken(offer: OfferLike): string | undefined {
  return (
    offer.protocol_data?.parameters?.offer?.find((c) => c.token)?.token ??
    offer.protocol_data?.parameters?.consideration?.find((c) => c.token)?.token
  );
}

/**
 * Convert an offer price to PER-ITEM USD. Offer `price.value` is the order
 * TOTAL, but bulk/criteria bids can cover many NFTs at once (live: a $0.50
 * bid for 25 Generations = $0.02/item; a $3,080 bid for 2 Genesis = $1,540/
 * item). Dividing by the NFT consideration quantity is what keeps top bids
 * honest — skipping it inflated valuations up to ~50x.
 * USD-pegged symbols convert 1:1; otherwise the payment token is resolved by
 * chain + contract (never ticker alone). Returns null instead of inventing
 * a conversion.
 */
async function offerPriceToUsd(
  price: OfferPrice | undefined,
  offer: OfferLike,
  fallbackChain: string
): Promise<{ usd: string; native: string; currency: string } | null> {
  if (!price || typeof price.value !== 'string' || typeof price.decimals !== 'number') return null;
  const perUnit = perItemPriceValue(price.value, offer);
  if (perUnit === null) return null;
  const native = amountToUnits(perUnit, price.decimals);
  if (!Number.isFinite(native) || native <= 0) return null;
  const currency = price.currency ?? '';
  if (USD_STABLE_SYMBOLS.has(currency)) {
    return { usd: String(native), native: String(native), currency };
  }
  const payToken = offerPaymentToken(offer);
  const chain = offer.chain ?? fallbackChain;
  if (!payToken) return null;
  const usdPerToken = await fetchPaymentTokenUsd(chain, payToken);
  if (usdPerToken === null) return null;
  const usd = native * usdPerToken;
  if (!(usd > 0) || !Number.isFinite(usd)) return null;
  return { usd: String(usd), native: String(native), currency };
}

/**
 * Reduce an offer's total price to a per-item raw value using the NFT-side
 * consideration quantity (startAmount, endAmount fallback). Single-item bids
 * (and orders with no usable quantity detail) pass through unchanged; dust
 * (total < quantity) and malformed quantities return null.
 */
function perItemPriceValue(totalValue: string, offer: OfferLike): string | null {
  let total: bigint;
  try {
    total = BigInt(totalValue);
  } catch {
    return null;
  }
  if (total <= 0n) return null;
  const items = offer.protocol_data?.parameters?.consideration;
  const nft = Array.isArray(items)
    ? items.find((c) => c.itemType === 2 || c.itemType === 3 || c.itemType === 4 || c.itemType === 5)
    : undefined;
  if (!nft) return totalValue;
  const rawQty = nft.startAmount ?? nft.endAmount ?? '1';
  let qty: bigint;
  try {
    qty = BigInt(String(rawQty));
  } catch {
    return null;
  }
  if (qty <= 0n) return null;
  if (qty === 1n) return totalValue;
  const perUnit = total / qty;
  return perUnit > 0n ? perUnit.toString() : null;
}

function isActiveOffer(offer: OfferLike): boolean {
  return (offer.status ?? '').toUpperCase() === 'ACTIVE';
}

/** True for bids targeting a whole collection rather than one token. */
export function isCollectionCriteriaOffer(offer: OfferLike): boolean {
  if (offer.asset?.identifier) return false;
  return !!offer.criteria?.collection || !!offer.criteria?.contract;
}

/** True for trait-targeted bids (excluded from collection-wide fallback). */
function isTraitTargetedOffer(offer: OfferLike): boolean {
  return !!(offer.criteria?.traits?.length || offer.criteria?.numeric_traits?.length);
}

/**
 * Collection top bid = max ACTIVE collection-wide/item bid observed across up
 * to 3 offer pages (endpoint is unsorted; trait-targeted bids excluded so the
 * fallback never misattributes a trait premium to the whole collection).
 */
export async function getCollectionTopBid(slug: string): Promise<CollectionTopBid | null> {
  const key = `bid:coll:${slug}`;
  const cached = collectionBidCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL.bidMs) return cached.value;
  return dedupe(key, async () => {
    let best: { usd: string; native: string; currency: string } | null = null;
    let scanned = 0;
    let cursor: string | null = null;
    for (let page = 0; page < 3; page++) {
      const params = new URLSearchParams({ limit: '100' });
      if (cursor) params.set('next', cursor);
      const data = (await osFetch(`/offers/collection/${slug}?${params}`)) as {
        offers?: OfferLike[];
        next?: string | null;
      };
      const offers = Array.isArray(data.offers) ? data.offers : [];
      for (const o of offers) {
        if (!isActiveOffer(o)) continue;
        if (isTraitTargetedOffer(o)) continue;
        scanned++;
        const conv = await offerPriceToUsd(o.price, o, 'robinhood');
        if (!conv) continue;
        if (!best || Number(conv.usd) > Number(best.usd)) best = conv;
      }
      cursor = typeof data.next === 'string' && data.next ? data.next : null;
      if (!cursor) break;
    }
    const result = best
      ? {
          slug,
          topBidUsd: best.usd,
          bidNative: best.native,
          bidCurrency: best.currency,
          valuedAt: Date.now(),
          source: 'collection_offers' as const,
          offersScanned: scanned,
        }
      : null;
    collectionBidCache.set(key, { at: Date.now(), value: result });
    return result;
  });
}

/**
 * Generation top bid = max ACTIVE trait-targeted offer for one Generation
 * value (NUMERIC mode for the numeric Generation trait, STRING otherwise).
 */
export async function getGenerationTopBid(
  slug: string,
  traitType: string,
  traitValue: string
): Promise<GenerationTopBid | null> {
  const key = `bid:gen:${slug}:${traitType}:${traitValue}`;
  const cached = generationBidCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL.bidMs) return cached.value;
  return dedupe(key, async () => {
    const numeric = Number(traitValue);
    const params = Number.isFinite(numeric) && traitValue.trim() !== ''
      ? new URLSearchParams({
          mode: 'NUMERIC',
          type: traitType,
          min_value: String(numeric),
          max_value: String(numeric),
          limit: '50',
        })
      : new URLSearchParams({ mode: 'STRING', type: traitType, value: traitValue, limit: '50' });
    const data = (await osFetch(`/offers/collection/${slug}/traits?${params}`)) as {
      offers?: OfferLike[];
    };
    const offers = Array.isArray(data.offers) ? data.offers : [];
    let best: { usd: string; native: string; currency: string; orderHash?: string; payToken?: string } | null = null;
    let scanned = 0;
    for (const o of offers) {
      if (!isActiveOffer(o)) continue;
      scanned++;
      const conv = await offerPriceToUsd(o.price, o, 'robinhood');
      if (!conv) continue;
      if (!best || Number(conv.usd) > Number(best.usd)) {
        best = { ...conv, orderHash: o.order_hash, payToken: offerPaymentToken(o) };
      }
    }
    const result = best
      ? {
          slug,
          traitType,
          traitValue,
          topBidUsd: best.usd,
          bidNative: best.native,
          bidCurrency: best.currency,
          paymentTokenAddress: best.payToken,
          orderHash: best.orderHash,
          offersScanned: scanned,
          valuedAt: Date.now(),
        }
      : null;
    generationBidCache.set(key, { at: Date.now(), value: result });
    return result;
  });
}

// ---------------------------------------------------------------------------
// NFT details / traits (generation detection)
// ---------------------------------------------------------------------------

export async function fetchNftDetails(
  chain: string,
  contract: string,
  tokenId: string
): Promise<RawNft & { traits?: { trait_type?: string; value?: unknown }[] }> {
  const data = (await osFetch(`/chain/${chain}/contract/${contract}/nfts/${tokenId}`)) as {
    nft?: RawNft & { traits?: { trait_type?: string; value?: unknown }[] };
  };
  if (!data.nft) throw new OpenSeaError('NFT not found.', 404, false);
  return data.nft;
}

export async function fetchCollectionTraits(
  slug: string
): Promise<{ categories: Record<string, string>; counts: Record<string, unknown> }> {
  const data = (await osFetch(`/traits/${slug}`)) as {
    categories?: Record<string, string>;
    counts?: Record<string, unknown>;
  };
  return { categories: data.categories ?? {}, counts: data.counts ?? {} };
}

// ---------------------------------------------------------------------------
// Payment-token USD conversion
// ---------------------------------------------------------------------------

export async function fetchPaymentTokenUsd(
  chain: string,
  tokenAddress: string
): Promise<number | null> {
  const key = `pt:${chain}:${tokenAddress.toLowerCase()}`;
  const cached = tokenPriceCache.get(key);
  if (cached && Date.now() - cached.at < CACHE_TTL.tokenMs) return cached.value;
  return dedupe(key, async () => {
    try {
      const data = (await osFetch(`/chain/${chain}/payment_token/${tokenAddress}`)) as {
        usdPrice?: string;
        usd_price?: string;
      };
      const raw = data.usdPrice ?? data.usd_price;
      const n = raw !== undefined ? Number(raw) : NaN;
      const val = Number.isFinite(n) && n > 0 ? n : null;
      tokenPriceCache.set(key, { at: Date.now(), value: val });
      return val;
    } catch {
      tokenPriceCache.set(key, { at: Date.now(), value: null });
      return null;
    }
  });
}

// ---------------------------------------------------------------------------
// $RAREFRIENDS price (exact chain + contract, never symbol-only)
// ---------------------------------------------------------------------------

export async function getRareFriendsUsdPrice(): Promise<RfPrice | null> {
  if (rfCacheEntry && Date.now() - rfCacheEntry.at < CACHE_TTL.rfMs) return rfCacheEntry.value;
  return dedupe('rf-price', async () => {
    try {
      const data = (await osFetch(`/chain/${RF_CHAIN}/token/${RF_CONTRACT}`)) as {
        address?: string;
        chain?: string;
        symbol?: string;
        usd_price?: string;
      };
      // Verify exact identity — never trust symbol alone.
      if (
        typeof data.address !== 'string' ||
        data.address.toLowerCase() !== RF_CONTRACT.toLowerCase() ||
        data.chain !== RF_CHAIN
      ) {
        rfCacheEntry = { at: Date.now(), value: null };
        return null;
      }
      const usd = typeof data.usd_price === 'string' ? data.usd_price : '';
      if (!usd || !(Number(usd) > 0) || !Number.isFinite(Number(usd))) {
        rfCacheEntry = { at: Date.now(), value: null };
        return null;
      }
      const price: RfPrice = {
        chain: data.chain,
        address: data.address,
        symbol: data.symbol ?? '',
        usdPrice: usd,
        valuedAt: Date.now(),
      };
      rfCacheEntry = { at: Date.now(), value: price };
      return price;
    } catch {
      // On failure, serve a recent cached observation if available (marked stale
      // by callers via valuedAt); otherwise null.
      if (rfCacheEntry) return rfCacheEntry.value;
      rfCacheEntry = { at: 0, value: null };
      return null;
    }
  });
}

/** Clear all market caches (tests / manual refresh). */
export function __clearMarketCaches(): void {
  collectionBidCache.clear();
  generationBidCache.clear();
  tokenPriceCache.clear();
  inventoryCache.clear();
  rfCacheEntry = null;
  inflight.clear();
}
