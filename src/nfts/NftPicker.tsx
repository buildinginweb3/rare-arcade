/**
 * Generalized NFT picker: Rare Friends pinned first, other collections by
 * top-bid USD DESC, unpriced last. Search + sort + chain filters, progressive
 * pricing badges, collection group headers, compact cards with DETAILS.
 *
 * Keeps the monochrome pixel / Tamagotchi tray aesthetic. NFT art stays
 * faithful (never recolored).
 */

import React, { useMemo, useState } from 'react';
import type { NftAsset, NftFetchState, CollectionGroup } from './types.ts';
import { RareFriendImage } from './RareFriendImage.tsx';
import { PixelIcon } from '../components/ui/PixelIcon.tsx';
import { bidBadgeLabel } from './normalize.ts';
import { formatUsdAdaptive, formatRfReferenceCompact } from './valuation.ts';
import { formatRFGrouped } from '../domain/rf.ts';

export type PickerSort = 'DEFAULT' | 'HIGH_RF' | 'LOW_RF' | 'AZ' | 'CHAIN';

interface NftPickerProps {
  fetchState: NftFetchState;
  groups: CollectionGroup[];
  rfUsd: string | null;
  refreshedAt: number | null;
  pricingComplete: boolean;
  selectedKeys: Set<string>;
  reservedKeys: Set<string>;
  onSelect: (asset: NftAsset) => void;
  onRetry: () => void;
  onRefreshPrices: () => void;
}

export function nftPickerKey(a: NftAsset): string {
  const chainPart = a.chain ? a.chain.toLowerCase() : 'unknown';
  return `${chainPart}:${a.contract.toLowerCase()}:${a.tokenId}`;
}

const PAGE_SIZE = 60;

export const NftPicker: React.FC<NftPickerProps> = ({
  fetchState,
  groups,
  rfUsd,
  refreshedAt,
  pricingComplete,
  selectedKeys,
  reservedKeys,
  onSelect,
  onRetry,
  onRefreshPrices,
}) => {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<PickerSort>('DEFAULT');
  const [chainFilter, setChainFilter] = useState<string>('ALL');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [detailsKey, setDetailsKey] = useState<string | null>(null);

  const chains = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      for (const a of g.assets) set.add(a.chain);
    }
    return [...set].sort();
  }, [groups]);

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = groups;
    if (chainFilter === 'RARE_FRIENDS') {
      list = list.filter((g) => g.isRareFriends);
    } else if (chainFilter !== 'ALL') {
      list = list
        .map((g) => ({ ...g, assets: g.assets.filter((a) => a.chain === chainFilter) }))
        .filter((g) => g.assets.length > 0);
    }
    if (q) {
      list = list
        .map((g) => ({
          ...g,
          assets: g.assets.filter(
            (a) =>
              a.name.toLowerCase().includes(q) ||
              a.tokenId.includes(q) ||
              a.collectionName.toLowerCase().includes(q) ||
              a.collectionSlug.toLowerCase().includes(q)
          ),
        }))
        .filter((g) => g.assets.length > 0);
    }
    if (sort === 'DEFAULT') return list;
    // Resort flat for explicit sorts (Rare Friends still pinned first).
    const flat = list.flatMap((g) => g.assets);
    const rare = flat.filter((a) => a.isRareFriends);
    const rest = flat.filter((a) => !a.isRareFriends);
    const cmp = (a: NftAsset, b: NftAsset): number => {
      if (sort === 'HIGH_RF' || sort === 'LOW_RF') {
        const ra = a.pricing?.referenceRfUnits;
        const rb = b.pricing?.referenceRfUnits;
        if (ra !== undefined && rb !== undefined && ra !== rb) {
          return sort === 'HIGH_RF' ? (rb > ra ? 1 : -1) : ra > rb ? 1 : -1;
        }
        if (ra !== undefined && rb === undefined) return -1;
        if (ra === undefined && rb !== undefined) return 1;
        return a.tokenId.localeCompare(b.tokenId, undefined, { numeric: true });
      }
      if (sort === 'AZ') return a.collectionName.localeCompare(b.collectionName);
      return a.chain.localeCompare(b.chain) || a.collectionName.localeCompare(b.collectionName);
    };
    rare.sort(cmp);
    rest.sort(cmp);
    // Re-group to preserve headers.
    const regroup = (arr: NftAsset[]): CollectionGroup[] => {
      const map = new Map<string, CollectionGroup>();
      for (const src of list) {
        for (const a of src.assets) {
          if (!arr.includes(a)) continue;
          const key = src.key;
          const g = map.get(key);
          if (g) g.assets.push(a);
          else map.set(key, { ...src, assets: [a] });
        }
      }
      return [...map.values()];
    };
    return [...regroup(rare), ...regroup(rest)];
  }, [groups, query, sort, chainFilter]);

  const flatVisible = useMemo(() => filteredGroups.flatMap((g) => g.assets), [filteredGroups]);
  const shown = flatVisible.slice(0, visibleCount);

  const shownKeys = useMemo(() => new Set(shown.map(nftPickerKey)), [shown]);
  const visibleGroups = useMemo(
    () =>
      filteredGroups
        .map((g) => ({ ...g, assets: g.assets.filter((a) => shownKeys.has(nftPickerKey(a))) }))
        .filter((g) => g.assets.length > 0),
    [filteredGroups, shownKeys]
  );

  if (fetchState.status === 'idle' || fetchState.status === 'connecting') return null;
  if (fetchState.status === 'loading') {
    return (
      <div style={{ padding: '24px', textAlign: 'center', fontSize: '11px' }}>
        LOADING YOUR NFTS…
        <div style={{ fontSize: '9px', color: '#666', marginTop: '6px', fontFamily: 'var(--font-lcd)' }}>
          DISCOVERING SUPPORTED HOLDINGS ACROSS CHAINS
        </div>
      </div>
    );
  }
  if (fetchState.status === 'error') {
    return (
      <div style={{ padding: '16px', textAlign: 'center' }}>
        <div style={{ fontWeight: 'bold', fontSize: '12px' }}>NFTS COULDN’T BE LOADED</div>
        <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>{fetchState.message}</div>
        {fetchState.retryable && (
          <button type="button" className="pixel-btn pixel-btn-sm" style={{ marginTop: '10px' }} onClick={onRetry}>
            RETRY
          </button>
        )}
      </div>
    );
  }
  if (fetchState.status === 'empty') {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <PixelIcon name="friend" size={32} />
        <div style={{ fontWeight: 'bold', fontSize: '12px', marginTop: '8px' }}>NO NFTS FOUND</div>
        <p style={{ fontSize: '10px', color: '#555', marginTop: '6px' }}>
          This wallet holds no supported NFTs on the scanned chains. Only NFTs
          actually held by the connected wallet can fund a machine.
        </p>
      </div>
    );
  }

  const rareOwned = groups.filter((g) => g.isRareFriends).reduce((n, g) => n + g.ownedCount, 0);
  const age = refreshedAt ? Math.max(0, Math.round((Date.now() - refreshedAt) / 1000)) : null;

  return (
    <div>
      {/* Market status strip */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          alignItems: 'center',
          fontSize: '9px',
          fontFamily: 'var(--font-lcd)',
          color: '#444',
          marginBottom: '10px',
        }}
      >
        <span style={{ border: '1px solid #000', padding: '2px 6px', background: '#fff' }}>
          $RAREFRIENDS MARKET PRICE{' '}
          <strong>{rfUsd ? formatUsdAdaptive(rfUsd) : '$RF PRICE UNAVAILABLE'}</strong>
        </span>
        <span style={{ border: '1px solid #000', padding: '2px 6px', background: '#fff' }}>
          UPDATED {age === null ? '—' : age < 5 ? 'JUST NOW' : `${age} SEC AGO`}
        </span>
        {!pricingComplete && (
          <span style={{ background: '#000', color: '#fff', padding: '2px 6px' }}>PRICING COLLECTIONS…</span>
        )}
        <button type="button" className="pixel-btn pixel-btn-sm" onClick={onRefreshPrices} title="Refresh market data">
          REFRESH MARKET DATA
        </button>
      </div>

      {/* Search + sort + chain filters */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px', alignItems: 'center' }}>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setVisibleCount(PAGE_SIZE);
          }}
          placeholder="SEARCH NFT (name / token ID / collection)"
          aria-label="Search NFT"
          style={{
            flex: '1 1 220px',
            padding: '8px',
            border: '2px solid var(--color-black)',
            fontSize: '11px',
            fontFamily: 'var(--font-lcd)',
          }}
        />
        <label style={{ fontSize: '9px', fontFamily: 'var(--font-lcd)', color: '#555' }}>
          SORT{' '}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as PickerSort)}
            aria-label="Sort inventory"
            style={{ padding: '6px', border: '2px solid #000', fontSize: '10px', fontFamily: 'var(--font-lcd)' }}
          >
            <option value="DEFAULT">DEFAULT</option>
            <option value="HIGH_RF">HIGHEST RF VALUE</option>
            <option value="LOW_RF">LOWEST RF VALUE</option>
            <option value="AZ">COLLECTION A–Z</option>
            <option value="CHAIN">CHAIN</option>
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
        {['ALL', 'RARE_FRIENDS', ...chains].map((c) => (
          <button
            key={c}
            type="button"
            className={`pixel-btn pixel-btn-sm ${chainFilter === c ? 'pixel-btn-primary' : ''}`}
            onClick={() => {
              setChainFilter(c);
              setVisibleCount(PAGE_SIZE);
            }}
          >
            {c === 'ALL' ? 'ALL' : c === 'RARE_FRIENDS' ? 'RARE FRIENDS' : c.toUpperCase()}
          </button>
        ))}
      </div>

      {rareOwned > 0 && chainFilter === 'ALL' && !query && (
        <div style={{ fontSize: '9px', fontFamily: 'var(--font-lcd)', color: '#555', marginBottom: '8px' }}>
          RARE FRIENDS OWNED: {rareOwned} — ALWAYS SHOWN FIRST
        </div>
      )}

      {/* Grouped inventory */}
      {visibleGroups.map((g) => (
        <section key={g.key} style={{ marginBottom: '16px' }} aria-label={g.collectionName}>
          <div
            style={{
              background: g.isRareFriends ? '#000' : '#fff',
              color: g.isRareFriends ? '#fff' : '#000',
              border: '2px solid #000',
              padding: '6px 10px',
              display: 'flex',
              gap: '8px',
              flexWrap: 'wrap',
              alignItems: 'center',
              fontSize: '10px',
              fontFamily: 'var(--font-lcd)',
            }}
          >
            {g.isRareFriends && (
              <span
                style={{
                  fontSize: '8px',
                  border: '1px solid #fff',
                  padding: '1px 5px',
                  letterSpacing: '1px',
                }}
                title="Pinned Rare Friends collection"
              >
                RARE FRIENDS
              </span>
            )}
            <strong style={{ fontSize: '11px' }}>{g.collectionName.toUpperCase()}</strong>
            <span style={{ opacity: 0.85 }}>
              {g.isRareFriends ? (
                <>OWNED: {g.ownedCount}</>
              ) : g.priced && g.topBidUsd ? (
                <>
                  TOP BID: {formatUsdAdaptive(g.topBidUsd)} • RF REF:{' '}
                  {g.referenceRfUnits !== undefined ? formatRfReferenceCompact(g.referenceRfUnits) : '—'} • OWNED:{' '}
                  {g.ownedCount}
                </>
              ) : (
                <>NO BIDS YET • OWNED: {g.ownedCount}</>
              )}
            </span>
            <span style={{ marginLeft: 'auto', opacity: 0.7 }}>{g.chain.toUpperCase()}</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: '10px',
              marginTop: '8px',
            }}
          >
            {g.assets.map((a) => {
              const key = nftPickerKey(a);
              const reserved = reservedKeys.has(key) || reservedKeys.has(`${a.chainId ?? a.chain}:${a.contract.toLowerCase()}:${a.tokenId}`);
              const selected = selectedKeys.has(key);
              const p = a.pricing;
              const refUnits = p?.referenceRfUnits;
              const isDetails = detailsKey === key;
              return (
                <div
                  key={key}
                  className={`friend-card ${selected ? 'friend-card-selected' : ''}`}
                  style={{
                    cursor: reserved ? 'not-allowed' : 'pointer',
                    opacity: reserved ? 0.55 : 1,
                    position: 'relative',
                  }}
                  onClick={() => {
                    if (!reserved) onSelect(a);
                  }}
                >
                  <a
                    href={a.openseaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View on OpenSea (new tab)"
                    style={{
                      position: 'absolute',
                      top: '4px',
                      right: '4px',
                      fontSize: '9px',
                      fontFamily: 'var(--font-lcd)',
                      background: 'var(--color-white)',
                      border: '1px solid var(--color-black)',
                      padding: '1px 4px',
                      textDecoration: 'none',
                      color: 'var(--color-black)',
                      zIndex: 1,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    OPENSEA ↗
                  </a>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <RareFriendImage
                      imageUrl={a.displayImageUrl || a.imageUrl}
                      name={a.name}
                      collectionName={a.collectionName}
                      tokenId={a.tokenId}
                      openseaUrl={a.openseaUrl}
                      size={96}
                    />
                  </div>
                  <div style={{ fontWeight: 'bold', fontSize: '11px', marginTop: '6px' }}>{a.name}</div>
                  <div style={{ fontSize: '9px', color: '#555', fontFamily: 'var(--font-lcd)' }}>
                    #{a.tokenId} • {a.chain.toUpperCase()}
                  </div>
                  <div style={{ marginTop: '6px', display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <span
                      style={{ fontSize: '8px', border: '1px solid #000', padding: '1px 4px' }}
                      title={
                        p?.state === 'priced'
                          ? `Based on the collection's top OpenSea bid and current $RAREFRIENDS market price. Top-bid references are market references, not guaranteed sale values.${p.topBidUsd ? ` Top bid ${formatUsdAdaptive(p.topBidUsd)}.` : ''}`
                          : 'Top-bid reference based on OpenSea market data'
                      }
                    >
                      {bidBadgeLabel(a)}
                    </span>
                    {a.isRareFriends && (
                      <span style={{ fontSize: '8px', border: '1px dotted #000', padding: '1px 4px' }}>
                        RARE FRIENDS
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '9px', fontFamily: 'var(--font-lcd)', marginTop: '4px', textAlign: 'center' }}>
                    {p?.state === 'priced' && refUnits !== undefined ? (
                      <>
                        <div>TOP BID {formatUsdAdaptive(p.topBidUsd ?? '')}</div>
                        <div style={{ fontWeight: 'bold' }}>{formatRfReferenceCompact(refUnits)}</div>
                      </>
                    ) : p?.state === 'rf_unavailable' ? (
                      <div>$RF PRICE UNAVAILABLE</div>
                    ) : p?.state === 'loading' || !p ? (
                      <div>PRICING…</div>
                    ) : (
                      <div>NO BIDS YET</div>
                    )}
                  </div>
                  <div style={{ marginTop: '4px', display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {a.ownershipVerified ? (
                      <span style={{ fontSize: '8px', background: '#000', color: '#fff', padding: '2px 4px' }}>
                        {a.verificationSource === 'opensea' ? 'OWNERSHIP RECHECKED' : 'OWNERSHIP VERIFIED'}
                      </span>
                    ) : (
                      <span style={{ fontSize: '8px', border: '1px solid #000', padding: '1px 4px' }}>
                        VERIFIED OWNED NFT
                      </span>
                    )}
                    {reserved && (
                      <span style={{ fontSize: '8px', border: '1px solid #666', color: '#666', padding: '1px 4px' }}>
                        IN LIVE MACHINE
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginTop: '8px' }}>
                    <button
                      type="button"
                      className={`pixel-btn pixel-btn-sm ${selected ? 'pixel-btn-primary' : ''}`}
                      style={{ flex: 1 }}
                      disabled={reserved}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!reserved) onSelect(a);
                      }}
                    >
                      {selected ? '★ SELECTED' : 'SELECT THIS NFT'}
                    </button>
                    <button
                      type="button"
                      className="pixel-btn pixel-btn-sm"
                      style={{ padding: '4px 6px' }}
                      aria-expanded={isDetails}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetailsKey(isDetails ? null : key);
                      }}
                      title="Valuation details"
                    >
                      ⓘ
                    </button>
                  </div>
                  {isDetails && (
                    <div
                      style={{
                        marginTop: '6px',
                        border: '1px solid #000',
                        padding: '6px',
                        fontSize: '9px',
                        fontFamily: 'var(--font-lcd)',
                        background: '#fff',
                        textAlign: 'left',
                      }}
                    >
                      <div>COLLECTION: {a.collectionName}</div>
                      <div>CHAIN: {a.chain}</div>
                      <div>
                        STANDARD: {a.tokenStandard ?? '—'}
                      </div>
                      <div>BID SOURCE: {p?.bidLabel ?? bidBadgeLabel(a)}</div>
                      <div>TOP BID USD: {p?.topBidUsd ? formatUsdAdaptive(p.topBidUsd) : '—'}</div>
                      <div>CURRENT $RF: {p?.rfUsd ? formatUsdAdaptive(p.rfUsd) : rfUsd ? formatUsdAdaptive(rfUsd) : '—'}</div>
                      <div>
                        RF REFERENCE:{' '}
                        {refUnits !== undefined ? formatRFGrouped(refUnits) : 'UNPRICED'}
                      </div>
                      {p?.traitType && (
                        <div>
                          TRAIT: {p.traitType} = {p.traitValue}
                          {p.fallbackUsed ? ' (FALLBACK)' : ''}
                        </div>
                      )}
                      <div style={{ marginTop: '4px', color: '#555' }}>
                        Based on the collection's top OpenSea bid and current
                        $RAREFRIENDS market price. Top-bid references are market
                        references, not guaranteed sale values.
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {fetchState.status === 'ready' && fetchState.truncated && (
        <div style={{ fontSize: '9px', color: '#666', marginBottom: '8px' }}>
          Showing first {flatVisible.length} — a display limit was reached.
        </div>
      )}
      {visibleCount < flatVisible.length && (
        <div style={{ textAlign: 'center', marginTop: '8px' }}>
          <button type="button" className="pixel-btn" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            LOAD MORE ({flatVisible.length - visibleCount} REMAINING)
          </button>
        </div>
      )}
      {filteredGroups.length === 0 && (
        <div style={{ padding: '16px', textAlign: 'center', fontSize: '11px' }}>
          NO NFTS MATCH “{query}”.
        </div>
      )}
    </div>
  );
};
