/**
 * Connected-wallet Rare Friend inventory: ALL / GENESIS / GENERATIONS tabs,
 * real artwork cards, verified-owned indicators, empty state with OpenSea
 * links. Never fabricates ownership.
 */

import React, { useMemo, useState } from 'react';
import { GENESIS_OPENSEA_URL, GENERATIONS_OPENSEA_URL } from './collections.ts';
import type { NftAsset, NftFetchState } from './types.ts';
import { RareFriendImage } from './RareFriendImage.tsx';
import { PixelIcon } from '../components/ui/PixelIcon.tsx';

type Tab = 'ALL' | 'GENESIS' | 'GENERATIONS';

interface NftInventoryGridProps {
  fetchState: NftFetchState;
  selectedKey: string | null;
  reservedKeys: Set<string>;
  onSelect: (asset: NftAsset) => void;
  onRetry: () => void;
}

export function nftCardKey(a: NftAsset): string {
  const chainPart = a.chain ? a.chain.toLowerCase() : String(a.chainId ?? 'unknown');
  return `${chainPart}:${a.contract.toLowerCase()}:${a.tokenId}`;
}

export const NftInventoryGrid: React.FC<NftInventoryGridProps> = ({
  fetchState,
  selectedKey,
  reservedKeys,
  onSelect,
  onRetry,
}) => {
  const [tab, setTab] = useState<Tab>('ALL');

  const assets = useMemo(() => {
    if (fetchState.status !== 'ready') return [];
    if (tab === 'ALL') return fetchState.assets;
    return fetchState.assets.filter((a) => a.collectionType === tab);
  }, [fetchState, tab]);

  if (fetchState.status === 'idle' || fetchState.status === 'connecting') {
    return null;
  }

  if (fetchState.status === 'loading') {
    return (
      <div style={{ padding: '24px', textAlign: 'center', fontSize: '11px' }}>
        LOADING YOUR RARE FRIENDS…
      </div>
    );
  }

  if (fetchState.status === 'error') {
    return (
      <div style={{ padding: '16px', textAlign: 'center' }}>
        <div style={{ fontWeight: 'bold', fontSize: '12px' }}>
          RARE FRIENDS COULDN’T BE LOADED
        </div>
        <div style={{ fontSize: '10px', color: '#555', marginTop: '4px' }}>
          {fetchState.message}
        </div>
        {fetchState.retryable && (
          <button
            type="button"
            className="pixel-btn pixel-btn-sm"
            style={{ marginTop: '10px' }}
            onClick={onRetry}
          >
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
        <div style={{ fontWeight: 'bold', fontSize: '12px', marginTop: '8px' }}>
          NO RARE FRIENDS FOUND
        </div>
        <p style={{ fontSize: '10px', color: '#555', marginTop: '6px' }}>
          Only Rare Friends Genesis and Rare Friends Generations held by this
          connected wallet can be funded into a Friend Machine.
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginTop: '12px', flexWrap: 'wrap' }}>
          <a
            className="pixel-btn pixel-btn-sm"
            href={GENESIS_OPENSEA_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            VIEW GENESIS ON OPENSEA
          </a>
          <a
            className="pixel-btn pixel-btn-sm"
            href={GENERATIONS_OPENSEA_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            VIEW GENERATIONS ON OPENSEA
          </a>
        </div>
      </div>
    );
  }

  const genesisCount = fetchState.assets.filter((a) => a.collectionType === 'GENESIS').length;
  const generationsCount = fetchState.assets.length - genesisCount;

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
        {(
          [
            { id: 'ALL', label: `ALL (${fetchState.assets.length})` },
            { id: 'GENESIS', label: `GENESIS (${genesisCount})` },
            { id: 'GENERATIONS', label: `GENERATIONS (${generationsCount})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            className={`pixel-btn pixel-btn-sm ${tab === t.id ? 'pixel-btn-primary' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {fetchState.truncated && (
        <div style={{ fontSize: '9px', color: '#666', marginBottom: '8px' }}>
          Showing first {fetchState.assets.length} — a display limit was reached.
        </div>
      )}

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: '10px',
        }}
      >
        {assets.map((a) => {
          const key = nftCardKey(a);
          const reserved = reservedKeys.has(key);
          const selected = selectedKey === key;
          return (
            <div
              key={key}
              className={`friend-card ${selected ? 'friend-card-selected' : ''}`}
              style={{ cursor: reserved ? 'not-allowed' : 'pointer', opacity: reserved ? 0.55 : 1, position: 'relative' }}
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
                #{a.tokenId} • {a.collectionType}
              </div>
              <div style={{ marginTop: '6px', display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {a.ownershipVerified ? (
                  <span style={{ fontSize: '8px', background: '#000', color: '#fff', padding: '2px 4px' }}>
                    OWNERSHIP VERIFIED
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
              <button
                type="button"
                className={`pixel-btn pixel-btn-sm ${selected ? 'pixel-btn-primary' : ''}`}
                style={{ width: '100%', marginTop: '8px' }}
                disabled={reserved}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!reserved) onSelect(a);
                }}
              >
                {selected ? '★ SELECTED' : 'SELECT THIS NFT'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
