import React from 'react';
import type { PlayerInventory } from '../domain/types.ts';
import { formatRFGrouped } from '../domain/rf.ts';
import { PixelIcon } from '../components/ui/PixelIcon.tsx';
import { RfTokenIcon } from '../components/ui/RfTokenIcon.tsx';
import { FriendPrizeVisual, nftIdentityLine } from '../nfts/FriendPrizeVisual.tsx';
import { selectWonRfPrizes } from '../domain/wonPrizes.ts';

interface PlayerInventoryPageProps {
  inventory: PlayerInventory;
  onNavigateArcade: () => void;
}

export const PlayerInventoryPage: React.FC<PlayerInventoryPageProps> = ({
  inventory,
  onNavigateArcade,
}) => {
  // $RF token wins are credited straight to the balance, so they are
  // recovered from the pull history and folded per machine. They are
  // showcased with the same $RF coin a machine shows when its top prize
  // is a token, so a token win is a first-class prize here too.
  const wonRfPrizes = selectWonRfPrizes(inventory);
  const wonPrizeCount = inventory.wonFriends.length + wonRfPrizes.length;

  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto', padding: '20px 16px' }}>
      {/* Header */}
      <div
        className="pixel-box"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          background: 'var(--color-lcd-bg)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PixelIcon name="inventory" size={18} />
            PLAYER INVENTORY & DEMO PRIZES
          </h1>
          <p style={{ fontSize: '11px', fontFamily: 'var(--font-lcd)', color: '#444', marginTop: '4px' }}>
            Your simulated Rare Friends and $RAREFRIENDS won from arcade pulls
          </p>
        </div>

        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RfTokenIcon size={24} decorative />
          <div>
          <div style={{ fontSize: '10px', color: '#666', fontFamily: 'var(--font-lcd)' }}>
            DEMO RF BALANCE
          </div>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
            {formatRFGrouped(inventory.rfBalanceUnits)}
          </div>
          </div>
        </div>
      </div>

      {/* Won Prizes: collectibles AND $RF token wins */}
      <div className="pixel-panel" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <PixelIcon name="trophy" size={16} />
            WON PRIZES ({wonPrizeCount})
          </h2>
          <span style={{ fontSize: '9px', fontFamily: 'var(--font-lcd)', color: '#666' }}>
            SIMULATED WINS • NO ON-CHAIN OWNERSHIP CLAIM
          </span>
        </div>

        {wonPrizeCount === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px', color: '#666', fontSize: '11px' }}>
            <PixelIcon name="friend" size={36} />
            <div style={{ marginTop: '8px', fontWeight: 'bold' }}>NO PRIZES WON YET</div>
            <p style={{ marginTop: '4px' }}>
              Step up to a Friend Machine on the arcade floor to pull for authentic collectibles!
            </p>
            <button
              type="button"
              className="pixel-btn pixel-btn-primary"
              style={{ marginTop: '14px' }}
              onClick={onNavigateArcade}
            >
              GO TO ARCADE FLOOR
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '14px',
            }}
          >
            {/* $RF token wins, same coin a machine shows for a token top prize. */}
            {wonRfPrizes.map((prize) => (
              <div key={`rf-${prize.machineId}`} className="friend-card">
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <RfTokenIcon size={120} />
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '12px', marginTop: '8px' }}>
                  {formatRFGrouped(prize.totalUnits)}
                </div>
                <div style={{ fontSize: '9px', color: '#555', fontFamily: 'var(--font-lcd)', marginTop: '2px' }}>
                  $RAREFRIENDS • {prize.wins === 1 ? '1 WIN' : `${prize.wins} WINS`}
                </div>
                <div style={{ fontSize: '9px', color: '#555', fontFamily: 'var(--font-lcd)', marginTop: '2px' }}>
                  WON FROM {prize.machineName}
                </div>
                <div
                  style={{
                    marginTop: '8px',
                    padding: '2px 4px',
                    background: 'var(--color-black)',
                    color: 'var(--color-white)',
                    fontSize: '8px',
                    fontFamily: 'var(--font-lcd)',
                  }}
                >
                  SIMULATED WIN
                </div>
              </div>
            ))}

            {inventory.wonFriends.map((f, idx) => (
              <div key={`${f.tokenId}-${idx}`} className="friend-card">
                <div style={{ display: 'flex', justifyContent: 'center' }}>
                  <FriendPrizeVisual
                    name={f.name}
                    imageUrl={f.displayImageUrl || f.imageUrl}
                    openseaUrl={f.openseaUrl}
                    collectionName={f.collectionName}
                    tokenId={f.tokenId.toString()}
                    spriteRows={f.spriteRows}
                    origin={f.origin}
                    size={120}
                  />
                </div>
                <div style={{ fontWeight: 'bold', fontSize: '12px', marginTop: '8px' }}>
                  {f.name}
                </div>
                <div style={{ fontSize: '9px', color: '#555', fontFamily: 'var(--font-lcd)', marginTop: '2px' }}>
                  {nftIdentityLine({ collectionName: f.collectionName, tokenId: f.tokenId.toString() }) ??
                    `#${f.tokenId.toString()} • ${f.familyName} (GEN ${f.generation})`}
                </div>
                <div
                  style={{
                    marginTop: '8px',
                    padding: '2px 4px',
                    background: 'var(--color-black)',
                    color: 'var(--color-white)',
                    fontSize: '8px',
                    fontFamily: 'var(--font-lcd)',
                  }}
                >
                  SIMULATED WIN
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pull History */}
      <div className="pixel-panel">
        <h2 style={{ fontSize: '13px', marginBottom: '14px' }}>
          MY PULL HISTORY ({inventory.pullHistory.length})
        </h2>

        {inventory.pullHistory.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px', color: '#666', fontSize: '11px' }}>
            No pulls recorded in this session.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table className="pixel-table">
            <thead>
              <tr>
                <th>TIME</th>
                <th>MACHINE</th>
                <th>COST</th>
                <th>BURNED (5%)</th>
                <th>RESULT</th>
              </tr>
            </thead>
            <tbody>
              {inventory.pullHistory.slice(0, 15).map((entry, idx) => (
                <tr key={idx}>
                  <td style={{ fontFamily: 'var(--font-lcd)', fontSize: '10px' }}>
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td style={{ fontWeight: 'bold' }}>{entry.machineName}</td>
                  <td>{formatRFGrouped(entry.result.spentUnits)}</td>
                  <td>{formatRFGrouped(entry.result.burnedUnits)}</td>
                  <td style={{ fontWeight: 'bold' }}>
                    {entry.result.prizeType === 'FRIEND_PRIZE' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <PixelIcon name="friend" size={12} />
                        WON {entry.result.friendWon?.name} (SIMULATED)
                      </span>
                    ) : entry.result.prizeType === 'RF_PRIZE' ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <RfTokenIcon size={20} decorative />
                        WON {formatRFGrouped(entry.result.rfWonUnits)}
                      </span>
                    ) : (
                      <span style={{ color: '#666' }}>Try Again</span>
                    )}
                  </td>
                </tr>
                ))}
              </tbody>
            </table>
            </div>
        )}
      </div>
    </div>
  );
};
