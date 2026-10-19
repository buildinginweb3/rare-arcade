/**
 * React hook: load + verify connected-wallet NFTs (generalized beyond Rare
 * Friends). Preserves the Rare-Friends-only `useOwnedNfts` signature for
 * existing callers while adding `usePricedInventory` — the full market-data
 * pipeline (inventory → floors → generation floors → RF price → sort).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { normalizeAddress } from './collections.ts';
import {
  SETTLEMENT_CHAIN_ID,
  isFundableChain,
  defaultScanChains,
  orderChainsForScan,
} from './chains.ts';
import { fetchOwnedRareFriends, verifyNftOwnerRemote } from './apiClient.ts';
import {
  fetchOwnedNftsAcrossChains,
  getCollectionTopBid,
  getGenerationTopBid,
} from './marketData.ts';
import {
  normalizeGenericPage,
  normalizeInventoryPage,
  detectGenerationTrait,
  groupAndSortCollections,
} from './normalize.ts';
import { convertUsdToUsdgUnits } from './valuation.ts';
import { GENERATIONS_CONTRACT } from './collections.ts';
import type { NftAsset, NftFetchState, CollectionGroup } from './types.ts';

export function useOwnedNfts(walletAddress: string | null | undefined): {
  fetchState: NftFetchState;
  reload: () => void;
  verifyAsset: (asset: NftAsset) => Promise<NftAsset>;
} {
  const [fetchState, setFetchState] = useState<NftFetchState>({ status: 'idle' });
  const wallet = normalizeAddress(walletAddress ?? '');
  const seq = useRef(0);

  const reload = useCallback(() => {
    if (!wallet) {
      setFetchState({ status: 'idle' });
      return;
    }
    const my = ++seq.current;
    setFetchState({ status: 'loading' });
    fetchOwnedRareFriends(wallet)
      .then((res) => {
        if (my !== seq.current) return;
        if (res.assets.length === 0) setFetchState({ status: 'empty' });
        else setFetchState({ status: 'ready', assets: res.assets, truncated: res.truncated });
      })
      .catch((err: unknown) => {
        if (my !== seq.current) return;
        const message = err instanceof Error ? err.message : 'RARE FRIENDS COULDN’T BE LOADED';
        setFetchState({ status: 'error', message, retryable: true });
      });
  }, [wallet]);

  useEffect(() => {
    // Wallet change invalidates everything from the previous wallet.
    setFetchState(wallet ? { status: 'loading' } : { status: 'idle' });
    if (!wallet) return;
    const my = ++seq.current;
    fetchOwnedRareFriends(wallet)
      .then((res) => {
        if (my !== seq.current) return;
        if (res.assets.length === 0) setFetchState({ status: 'empty' });
        else setFetchState({ status: 'ready', assets: res.assets, truncated: res.truncated });
      })
      .catch((err: unknown) => {
        if (my !== seq.current) return;
        const message = err instanceof Error ? err.message : 'RARE FRIENDS COULDN’T BE LOADED';
        setFetchState({ status: 'error', message, retryable: true });
      });
  }, [wallet]);

  /** Fresh verification; returns a verified copy or throws. */
  const verifyAsset = useCallback(
    async (asset: NftAsset): Promise<NftAsset> => {
      const ownerField = (asset.reportedOwner || asset.ownerAddress || '').toLowerCase();
      if (normalizeAddress(ownerField) !== wallet || !wallet) {
        throw new Error('REVERIFY OWNER — wallet changed since discovery.');
      }
      // Robinhood-only: every prize NFT is verified with the same fresh
      // on-chain ownerOf read, so Rare Friends carry no special privilege.
      if (!isFundableChain(asset.chain)) {
        throw new Error(
          `Rare Arcade funds Robinhood Chain NFTs only — "${asset.chain}" cannot be added to a machine.`
        );
      }
      const { owner } = await verifyNftOwnerRemote(asset.contract, asset.tokenId);
      if (normalizeAddress(owner) !== wallet) {
        throw new Error('OWNERSHIP CHANGED — you no longer hold this NFT on-chain.');
      }
      return {
        ...asset,
        ownerAddress: wallet,
        reportedOwner: wallet,
        ownershipVerified: true,
        verificationSource: 'onchain',
      };
    },
    [wallet]
  );

  return { fetchState, reload, verifyAsset };
}

// ---------------------------------------------------------------------------
// Priced inventory pipeline
// ---------------------------------------------------------------------------

export interface PricedInventory {
  assets: NftAsset[];
  groups: CollectionGroup[];
  truncated: boolean;
  pricingComplete: boolean;
  pricingPending: number;
  refreshedAt: number | null;
}

const EMPTY_PRICED: PricedInventory = {
  assets: [],
  groups: [],
  truncated: false,
  pricingComplete: false,
  pricingPending: 0,
  refreshedAt: null,
};

function mockMode(): boolean {
  try {
    return (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_MOCK_NFTS === '1';
  } catch {
    return false;
  }
}

/**
 * Full pipeline: CONNECTED WALLET → owned NFTs → ONE collection top bid per
 * unique slug (+ ONE generation bid per unique Generation) → ONE RF price →
 * RF refs → sort. No per-item requests: fast even for large wallets.
 * Progressively renders: images first, pricing badges as bids resolve,
 * one coherent sort (Rare Friends pinned throughout).
 */
export function usePricedInventory(
  walletAddress: string | null | undefined,
  opts: { chains?: string[]; scanAllChains?: boolean } = {}
): {
  fetchState: NftFetchState;
  priced: PricedInventory;
  reload: () => void;
  refreshPrices: () => void;
  verifyAsset: (asset: NftAsset) => Promise<NftAsset>;
} {
  const { fetchState, reload, verifyAsset } = useMultiChainInventory(walletAddress, opts);
  const [priced, setPriced] = useState<PricedInventory>(EMPTY_PRICED);
  const [priceTick, setPriceTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (fetchState.status !== 'ready') {
      if (fetchState.status === 'empty' || fetchState.status === 'idle') {
        setPriced(EMPTY_PRICED);
      }
      return;
    }
    const my = ++seq.current;
    const assets = fetchState.assets.map((a) => ({
      ...a,
      pricing: a.pricing ?? { state: 'loading' as const },
    }));
    // First paint: inventory immediately (images/metadata), Rare Friends pinned.
    setPriced((prev) => ({
      ...prev,
      assets,
      groups: groupAndSortCollections(assets),
      truncated: fetchState.truncated,
      pricingComplete: false,
      pricingPending: assets.length,
      refreshedAt: prev.refreshedAt,
    }));
    void priceInventory(assets, fetchState.truncated).then((result) => {
      if (my !== seq.current) return;
      setPriced(result);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchState, priceTick]);

  const refreshPrices = useCallback(() => setPriceTick((n) => n + 1), []);

  return { fetchState, priced, reload: () => { reload(); }, refreshPrices, verifyAsset };
}

function useMultiChainInventory(
  walletAddress: string | null | undefined,
  opts: { chains?: string[]; scanAllChains?: boolean } = {}
): {
  fetchState: NftFetchState;
  reload: () => void;
  verifyAsset: (asset: NftAsset) => Promise<NftAsset>;
} {
  const [fetchState, setFetchState] = useState<NftFetchState>({ status: 'idle' });
  const wallet = normalizeAddress(walletAddress ?? '');
  const seq = useRef(0);

  const load = useCallback(
    async (my: number) => {
      if (!wallet) {
        setFetchState({ status: 'idle' });
        return;
      }
      setFetchState({ status: 'loading' });
      try {
        if (mockMode()) {
          const { MOCK_ASSETS } = await import('./mockAssets.ts');
          const assets = MOCK_ASSETS.map((a) => ({
            ...a,
            reportedOwner: wallet,
            ownerAddress: wallet,
          }));
          if (my !== seq.current) return;
          if (assets.length === 0) setFetchState({ status: 'empty' });
          else setFetchState({ status: 'ready', assets, truncated: false });
          return;
        }
        // Only the settlement chain is ever scanned.
        const chains = orderChainsForScan(opts.chains ?? defaultScanChains());
        const { byChain, truncated } = await fetchOwnedNftsAcrossChains(wallet, chains, {
          concurrency: 4,
        });
        const all: NftAsset[] = [];
        const seen = new Set<string>();
        for (const chain of chains) {
          const raw = byChain[chain] ?? [];
          const chainId = SETTLEMENT_CHAIN_ID;
          // Rare-Friends path (exact contract allowlist) + generic path.
          const rares = normalizeInventoryPage(raw, wallet);
          for (const r of rares) {
            const key = `${r.chain.toLowerCase()}:${r.contract.toLowerCase()}:${r.tokenId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            all.push(r);
          }
          const generic = normalizeGenericPage(raw, chain, wallet, { chainId });
          for (const g of generic) {
            const key = `${g.chain.toLowerCase()}:${g.contract.toLowerCase()}:${g.tokenId}`;
            if (seen.has(key)) continue;
            seen.add(key);
            // Skip spam-flagged items by default? No — show but deprioritize:
            // pricing marks them unpriced so they sort last and can't publish.
            all.push(g);
          }
        }
        if (my !== seq.current) return;
        if (all.length === 0) setFetchState({ status: 'empty' });
        else setFetchState({ status: 'ready', assets: all, truncated });
      } catch (err) {
        if (my !== seq.current) return;
        const message = err instanceof Error ? err.message : 'NFTS COULDN’T BE LOADED';
        setFetchState({ status: 'error', message, retryable: true });
      }
    },
    [wallet, opts.chains]
  );

  const reload = useCallback(() => {
    const my = ++seq.current;
    void load(my);
  }, [load]);

  useEffect(() => {
    const my = ++seq.current;
    setFetchState(wallet ? { status: 'loading' } : { status: 'idle' });
    if (!wallet) return;
    void load(my);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet]);

  const { verifyAsset } = useOwnedNfts(walletAddress);

  return { fetchState, reload, verifyAsset };
}

/** Price a full inventory: deduped collection + generation top bids. */
async function priceInventory(
  assets: NftAsset[],
  truncated: boolean
): Promise<PricedInventory> {
  if (mockMode()) {
    return priceInventoryMock(assets, truncated);
  }
  // Unique collection slugs → one top-bid request each (primary basis).
  const slugs = Array.from(new Set(assets.map((a) => a.collectionSlug)));
  const bidBySlug = new Map<string, { topBidUsd: string; bidNative?: string; bidCurrency?: string } | null>();
  await Promise.all(
    slugs.map(async (slug) => {
      try {
        const b = await getCollectionTopBid(slug);
        bidBySlug.set(
          slug,
          b ? { topBidUsd: b.topBidUsd, bidNative: b.bidNative, bidCurrency: b.bidCurrency } : null
        );
      } catch {
        bidBySlug.set(slug, null);
      }
    })
  );

  // Unique Generations generations → one trait-bid request each.
  const genKeys = new Map<string, { traitType: string; value: string }>();
  for (const a of assets) {
    if (a.isRareFriends && a.contract.toLowerCase() === GENERATIONS_CONTRACT.toLowerCase()) {
      const det = detectGenerationTrait(a.traits);
      const traitType = det?.traitType ?? 'Generation';
      const value = det?.value ?? a.rareFriendsGeneration ?? null;
      if (value !== null) {
        const key = `${a.collectionSlug}::${traitType}::${value}`;
        if (!genKeys.has(key)) genKeys.set(key, { traitType, value });
      }
    }
  }
  const genBidByKey = new Map<string, { topBidUsd: string; bidNative: string; bidCurrency: string } | null>();
  await Promise.all(
    [...genKeys.entries()].map(async ([key, g]) => {
      const slug = key.split('::')[0]!;
      try {
        const b = await getGenerationTopBid(slug, g.traitType, g.value);
        genBidByKey.set(
          key,
          b ? { topBidUsd: b.topBidUsd, bidNative: b.bidNative, bidCurrency: b.bidCurrency } : null
        );
      } catch {
        genBidByKey.set(key, null);
      }
    })
  );

  const pricedAssets = assets.map((a) => {
    if (a.isSuspicious || a.isDisabled) {
      return { ...a, pricing: { state: 'unpriced' as const, valuedAt: Date.now() } };
    }
    const priceWith = (
      bid: { topBidUsd: string; bidNative?: string; bidCurrency?: string },
      method: 'collection_top_bid' | 'rare_friends_generation_bid' | 'rare_friends_collection_bid_fallback',
      extra?: { traitType?: string; traitValue?: string; fallbackUsed?: boolean; bidLabel?: string }
    ) => {
      // USDG is pegged 1:1 to USD, so the top bid IS the USDG value.
      const ref = convertUsdToUsdgUnits(bid.topBidUsd);
      if (ref === null) {
        return { ...a, pricing: { state: 'unpriced' as const, valuedAt: Date.now() } };
      }
      return {
        ...a,
        ...(extra?.traitValue !== undefined ? { rareFriendsGeneration: extra.traitValue } : null),
        pricing: {
          state: 'priced' as const,
          method,
          topBidUsd: bid.topBidUsd,
          bidNative: bid.bidNative,
          bidCurrency: bid.bidCurrency,
          usdgValueUnits: ref,
          traitType: extra?.traitType,
          traitValue: extra?.traitValue,
          fallbackUsed: extra?.fallbackUsed ?? false,
          valuedAt: Date.now(),
          bidLabel: extra?.bidLabel,
        },
      };
    };
    // Generations special case: generation-targeted trait bid first.
    if (a.isRareFriends && a.contract.toLowerCase() === GENERATIONS_CONTRACT.toLowerCase()) {
      const det = detectGenerationTrait(a.traits);
      const traitType = det?.traitType ?? 'Generation';
      const value = det?.value ?? a.rareFriendsGeneration ?? null;
      if (value !== null) {
        const key = `${a.collectionSlug}::${traitType}::${value}`;
        const gen = genBidByKey.get(key);
        if (gen) {
          return priceWith(gen, 'rare_friends_generation_bid', {
            traitType,
            traitValue: value,
            bidLabel: `GEN ${value} TOP BID`,
          });
        }
      }
      // Fallback: overall collection top bid, clearly labeled.
      const coll = bidBySlug.get(a.collectionSlug);
      if (coll) {
        return priceWith(coll, 'rare_friends_collection_bid_fallback', {
          fallbackUsed: true,
          bidLabel: 'COLLECTION BID FALLBACK',
        });
      }
      return { ...a, pricing: { state: 'unpriced' as const, valuedAt: Date.now() } };
    }
    // Ordinary NFT (incl. Genesis): collection top bid.
    const coll = bidBySlug.get(a.collectionSlug);
    if (!coll) {
      return { ...a, pricing: { state: 'unpriced' as const, valuedAt: Date.now() } };
    }
    return priceWith(coll, 'collection_top_bid', {
      bidLabel:
        a.isRareFriends && a.rareFriendsType === 'GENESIS' ? 'GENESIS TOP BID' : 'COLLECTION TOP BID',
    });
  });

  return {
    assets: pricedAssets,
    groups: groupAndSortCollections(pricedAssets),
    truncated,
    pricingComplete: true,
    pricingPending: 0,
    refreshedAt: Date.now(),
  };
}

/** Deterministic mock pricing for tests/offline demo. */
async function priceInventoryMock(assets: NftAsset[], truncated: boolean): Promise<PricedInventory> {
  const pricedAssets = assets.map((a) => {
    const topBidUsd = a.isRareFriends
      ? a.rareFriendsType === 'GENESIS'
        ? '1647'
        : '0.05'
      : '100';
    const ref = convertUsdToUsdgUnits(topBidUsd) ?? 0n;
    return {
      ...a,
      pricing: {
        state: 'priced' as const,
        method: 'collection_top_bid' as const,
        topBidUsd,
        usdgValueUnits: ref,
        fallbackUsed: false,
        valuedAt: Date.now(),
        bidLabel: 'COLLECTION TOP BID',
      },
    };
  });
  return {
    assets: pricedAssets,
    groups: groupAndSortCollections(pricedAssets),
    truncated,
    pricingComplete: true,
    pricingPending: 0,
    refreshedAt: Date.now(),
  };
}
