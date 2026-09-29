/**
 * Supported-chain registry for multi-chain NFT discovery.
 *
 * Source of truth: GET /api/v2/chains (cached 1h). Falls back to a curated
 * static list when the endpoint is unreachable so the picker still works.
 *
 * Verified live 2026-09-28: OpenSea reports 30 chains including `robinhood`.
 * Chain slugs observed: ethereum, solana, optimism, unichain, polygon, monad,
 * shape, flow, stablechain, hyperevm, sei, hyperliquid, soneium, ronin,
 * abstract, megaeth, robinhood, somnia, arc, b3, base, ape_chain, arbitrum,
 * avalanche, gunzilla, ink, animechain, bera_chain, blast, zora.
 *
 * Inventory fetching is CONTROLLED: callers fetch priority chains first with
 * a small concurrency pool, then optionally scan the rest. Never fire 30
 * parallel account requests on every render.
 */

export interface ChainInfo {
  slug: string;
  name: string;
  /** EVM chain id when known (non-EVM chains use undefined). */
  chainId?: number;
  nativeSymbol?: string;
}

/** EVM chain ids for chains where ownership RPC verification is feasible. */
export const KNOWN_EVM_CHAIN_IDS: Record<string, number> = {
  ethereum: 1,
  optimism: 10,
  base: 8453,
  arbitrum: 42161,
  polygon: 137,
  unichain: 130,
  blast: 81457,
  zora: 7777777,
  avalanche: 43114,
  sei: 1329,
  monad: 143,
  ink: 57073,
  shape: 360,
  soneium: 1868,
  b3: 8333,
  ape_chain: 33139,
  somnia: 5031,
  megaeth: 4326,
  hyperevm: 999,
  robinhood: 4663,
};

export const ROBINHOOD_CHAIN_SLUG = 'robinhood';

/** Priority order for wallet inventory scans (Robinhood first — home chain). */
export const PRIORITY_CHAIN_ORDER = [
  'robinhood',
  'ethereum',
  'base',
  'polygon',
  'arbitrum',
  'optimism',
];

/** Static fallback when GET /chains fails (subset of verified live list). */
export const FALLBACK_CHAINS: ChainInfo[] = [
  { slug: 'robinhood', name: 'Robinhood', chainId: 4663 },
  { slug: 'ethereum', name: 'Ethereum', chainId: 1, nativeSymbol: 'ETH' },
  { slug: 'base', name: 'Base', chainId: 8453, nativeSymbol: 'ETH' },
  { slug: 'polygon', name: 'Polygon', chainId: 137, nativeSymbol: 'POL' },
  { slug: 'arbitrum', name: 'Arbitrum', chainId: 42161, nativeSymbol: 'ETH' },
  { slug: 'optimism', name: 'Optimism', chainId: 10, nativeSymbol: 'ETH' },
  { slug: 'unichain', name: 'Unichain', chainId: 130 },
  { slug: 'blast', name: 'Blast' },
  { slug: 'zora', name: 'Zora' },
  { slug: 'avalanche', name: 'Avalanche' },
  { slug: 'sei', name: 'Sei' },
  { slug: 'solana', name: 'Solana' },
];

let cachedChains: { at: number; chains: ChainInfo[] } | null = null;
const CHAINS_TTL_MS = 60 * 60 * 1000; // 1 hour

function toChainInfo(raw: Record<string, unknown>): ChainInfo | null {
  const slug = typeof raw.chain === 'string' ? raw.chain : '';
  if (!slug) return null;
  const name = typeof raw.name === 'string' && raw.name ? raw.name : slug;
  const nativeSymbol = typeof raw.symbol === 'string' ? raw.symbol : undefined;
  return { slug, name, chainId: KNOWN_EVM_CHAIN_IDS[slug], nativeSymbol };
}

/**
 * Fetch the current OpenSea supported-chain list.
 * `fetcher` defaults to the OpenSea GET /chains endpoint via marketData's
 * authenticated fetch; injectable for tests.
 */
export async function getSupportedChains(
  fetcher?: () => Promise<unknown>
): Promise<ChainInfo[]> {
  const now = Date.now();
  if (cachedChains && now - cachedChains.at < CHAINS_TTL_MS) {
    return cachedChains.chains;
  }
  if (fetcher) {
    try {
      const data = (await fetcher()) as { chains?: unknown[] };
      const chains = Array.isArray(data.chains)
        ? data.chains
            .map((c) => toChainInfo(c as Record<string, unknown>))
            .filter((c): c is ChainInfo => !!c)
        : [];
      if (chains.length > 0) {
        // Robinhood first, then priority order, then alphabetical.
        const rank = (s: string) => {
          const i = PRIORITY_CHAIN_ORDER.indexOf(s);
          return i === -1 ? 100 + s.localeCompare('robinhood') : i;
        };
        chains.sort((a, b) => rank(a.slug) - rank(b.slug));
        cachedChains = { at: now, chains };
        return chains;
      }
    } catch {
      // fall through to fallback
    }
  }
  if (cachedChains) return cachedChains.chains;
  return FALLBACK_CHAINS;
}

/** Order chain slugs: priority chains first, rest alphabetical. */
export function orderChainsForScan(slugs: string[]): string[] {
  const rank = (s: string) => {
    const i = PRIORITY_CHAIN_ORDER.indexOf(s);
    return i === -1 ? 1000 : i;
  };
  return [...slugs].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

/** Default inventory scan set: priority chains (controlled, not all 30). */
export function defaultScanChains(all?: ChainInfo[]): string[] {
  const slugs = (all ?? FALLBACK_CHAINS).map((c) => c.slug);
  const prioritized = PRIORITY_CHAIN_ORDER.filter((s) => slugs.includes(s));
  return prioritized.length > 0 ? prioritized : slugs.slice(0, 6);
}

/** Clear the in-memory chain cache (tests). */
export function __clearChainCache(): void {
  cachedChains = null;
}
