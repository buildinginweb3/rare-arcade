import React from 'react';
import type { Machine } from '../../domain/types.ts';
import { isFixedOddsMachine } from '../../domain/types.ts';
import { formatOddsPpm } from '../../domain/fixedOdds.ts';
import { formatRFGrouped } from '../../domain/rf.ts';
import { PixelIcon } from '../ui/PixelIcon.tsx';
import { RfTokenIcon } from '../ui/RfTokenIcon.tsx';
import { FriendPrizeVisual, nftIdentityLine } from '../../nfts/FriendPrizeVisual.tsx';
import { MachineTypeBadge } from './MachineTypeBadge.tsx';

interface PrizePoolModalProps {
  machine: Machine;
  onClose: () => void;
}

export const PrizePoolModal: React.FC<PrizePoolModalProps> = ({ machine, onClose }) => {
  const isFixed = isFixedOddsMachine(machine);
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="pixel-box"
        style={{
          maxWidth: '560px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-white)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="pixel-marquee">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PixelIcon name="prize" size={16} color="#ffffff" />
            <span style={{ fontSize: '11px' }}>PRIZE POOL — {machine.name}</span>
          </div>
          <button
            type="button"
            className="pixel-btn pixel-btn-sm"
            style={{ padding: '2px 6px' }}
            onClick={onClose}
          >
            <PixelIcon name="close" size={12} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px', overflowY: 'auto' }}>
          <div style={{ marginBottom: '12px' }}>
            <MachineTypeBadge machineType={machine.machineType} />
          </div>
          <div
            style={{
              background: 'var(--color-lcd-bg)',
              border: '2px solid var(--color-black)',
              padding: '10px',
              marginBottom: '16px',
              fontSize: '11px',
            }}
          >
            <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>
              INSPECT BEFORE PULLING
            </div>
            {isFixed ? (
              <div>
                Every pull rolls the same fixed configured odds — there is no play
                cap. Sold-out prize slots become empty outcomes; other odds never change.
              </div>
            ) : (
              <div>
                Every seeded prize is physically in the machine's finite deck. Prizes are removed immediately when drawn.
              </div>
            )}
            <div
              style={{
                marginTop: '6px',
                fontSize: '9px',
                fontFamily: 'var(--font-lcd)',
                color: '#666',
              }}
            >
              REFERENCE VALUE FOR SIMULATION MATH • NOT A MARKET PRICE
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {machine.remainingPrizes.map((entry) => {
              if (entry.type === 'FRIEND_PRIZE') {
                return (
                  <div
                    key={entry.id}
                    className="pixel-panel-sunken"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '10px 14px',
                      opacity: entry.remainingQuantity > 0 ? 1 : 0.4,
                    }}
                  >
                    <FriendPrizeVisual
                      name={entry.name}
                      imageUrl={entry.displayImageUrl || entry.imageUrl}
                      openseaUrl={entry.openseaUrl}
                      collectionName={entry.collectionName}
                      tokenId={entry.tokenId.toString()}
                      spriteRows={entry.spriteRows}
                      origin={entry.origin}
                      size={72}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{entry.name}</div>
                      <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#444' }}>
                        {nftIdentityLine({
                          collectionName: entry.collectionName,
                          collectionType: entry.collectionType,
                          tokenId: entry.tokenId.toString(),
                        }) ?? `#${entry.tokenId.toString()} • ${entry.familyName} (GEN ${entry.generation})`}
                      </div>
                      <div style={{ fontSize: '11px', marginTop: '2px' }}>
                        Reference Value: {formatRFGrouped(entry.referenceValueUnits)}
                      </div>
                      {entry.valuationSnapshot ? (
                        <div style={{ fontSize: '9px', fontFamily: 'var(--font-lcd)', color: '#444', marginTop: '4px' }}>
                          VALUATION AT PUBLISH:{' '}
                          {entry.valuationSnapshot.method === 'rare_friends_generation_bid' && entry.valuationSnapshot.traitValue !== undefined
                            ? `Gen ${entry.valuationSnapshot.traitValue} top bid ${entry.valuationSnapshot.topBidUsd ? `$${entry.valuationSnapshot.topBidUsd}` : ''}`
                            : entry.valuationSnapshot.method === 'rare_friends_collection_bid_fallback' || entry.valuationSnapshot.method === 'collection_top_bid_fallback'
                              ? `Collection bid fallback${entry.valuationSnapshot.topBidUsd ? ` $${entry.valuationSnapshot.topBidUsd}` : ''}`
                              : entry.valuationSnapshot.method === 'legacy_manual'
                                ? 'Legacy manual reference (locked at creation)'
                                : entry.valuationSnapshot.method === 'demo_snapshot'
                                  ? 'Demo snapshot (fixed reproducible economics)'
                                  : `Top bid${entry.valuationSnapshot.topBidUsd ? ` $${entry.valuationSnapshot.topBidUsd}` : ''}`}
                          {entry.valuationSnapshot.source === 'opensea' && entry.valuationSnapshot.rfUsd
                            ? ` • $RF $${entry.valuationSnapshot.rfUsd}`
                            : ''}
                          {entry.valuationSnapshot.source === 'opensea'
                            ? ' • Source: OpenSea'
                            : ''}
                          {typeof entry.valuationSnapshot.valuedAt === 'number'
                            ? ` • ${new Date(entry.valuationSnapshot.valuedAt).toLocaleDateString()}`
                            : ''}
                        </div>
                      ) : null}
                      {isFixed && entry.oddsPpm !== undefined && (
                        <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 'bold' }}>
                          Fixed Odds: {formatOddsPpm(entry.oddsPpm)}
                        </div>
                      )}
                      <div style={{ fontSize: '8px', color: '#666', marginTop: '2px' }}>
                        REFERENCE VALUE FOR SIMULATION MATH • NOT A MARKET PRICE
                      </div>
                      {entry.origin === 'real-nft' && (
                        <div style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '8px', background: '#000', color: '#fff', padding: '1px 4px' }}>
                            VERIFIED AT FUNDING
                          </span>
                          <span style={{ fontSize: '8px', border: '1px solid #000', padding: '0 4px' }}>
                            SIMULATED PRIZE
                          </span>
                        </div>
                      )}
                      {entry.origin === 'system-demo' && (
                        <div style={{ marginTop: '4px' }}>
                          <span style={{ fontSize: '8px', border: '1px solid #666', color: '#666', padding: '0 4px' }}>
                            SYSTEM DEMO MACHINE
                          </span>
                        </div>
                      )}
                      {entry.openseaUrl && (
                        <a
                          href={entry.openseaUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ fontSize: '9px' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          VIEW ON OPENSEA
                        </a>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10px', color: '#666' }}>REMAINING</div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                        {entry.remainingQuantity <= 0 ? 'SOLD OUT' : `${entry.remainingQuantity} / ${entry.initialQuantity}`}
                      </div>
                    </div>
                  </div>
                );
              }

              if (entry.type === 'RF_PRIZE') {
                return (
                  <div
                    key={entry.id}
                    className="pixel-panel-sunken"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      padding: '10px 14px',
                      opacity: entry.remainingQuantity > 0 ? 1 : 0.4,
                    }}
                  >
                    <div style={{ padding: '4px' }}>
                      <RfTokenIcon size={48} decorative />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 'bold', fontSize: '13px' }}>
                        {formatRFGrouped(entry.amountUnits)}
                      </div>
                      <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#444' }}>
                        Simulated Token Prize
                      </div>
                      {isFixed && entry.oddsPpm !== undefined && (
                        <div style={{ fontSize: '11px', marginTop: '2px', fontWeight: 'bold' }}>
                          Fixed Odds: {formatOddsPpm(entry.oddsPpm)}
                        </div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10px', color: '#666' }}>REMAINING</div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                        {entry.remainingQuantity <= 0 ? 'SOLD OUT' : `${entry.remainingQuantity} / ${entry.initialQuantity}`}
                      </div>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={entry.id}
                  className="pixel-panel-sunken"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px',
                    padding: '8px 14px',
                    opacity: 0.7,
                  }}
                >
                  <PixelIcon name="soldout" size={20} />
                  <div style={{ flex: 1, fontSize: '12px' }}>Try Again (No Prize)</div>
                  <div style={{ textAlign: 'right', fontWeight: 'bold' }}>
                    {entry.remainingQuantity} / {entry.initialQuantity}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '10px 16px',
            borderTop: '2px solid var(--color-black)',
            background: 'var(--color-lcd-dim)',
            textAlign: 'right',
          }}
        >
          <button type="button" className="pixel-btn pixel-btn-sm" onClick={onClose}>
            CLOSE
          </button>
        </div>
      </div>
    </div>
  );
};
