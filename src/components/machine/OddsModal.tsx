import React from 'react';
import type {
  Machine,
  FiniteDeckMachine,
  FriendPrizeEntry,
} from '../../domain/types.ts';
import { isFixedOddsMachine } from '../../domain/types.ts';
import { calculateLiveOdds, type PrizeOddsItem } from '../../domain/economics.ts';
import {
  getFixedOddsTable,
  formatOddsPpm,
  type FixedOddsTable,
} from '../../domain/fixedOdds.ts';
import { formatRFGrouped } from '../../domain/rf.ts';
import { PixelIcon } from '../ui/PixelIcon.tsx';
import { RfTokenIcon } from '../ui/RfTokenIcon.tsx';
import { FriendPrizeVisual, nftIdentityLine } from '../../nfts/FriendPrizeVisual.tsx';
import { MachineTypeBadge } from './MachineTypeBadge.tsx';

interface OddsModalProps {
  machine: Machine;
  onClose: () => void;
}

export const OddsModal: React.FC<OddsModalProps> = ({ machine, onClose }) => {
  const isFixed = isFixedOddsMachine(machine);
  const odds = isFixed ? [] : calculateLiveOdds(machine.remainingPrizes, machine.remainingPulls);
  const totalProbability = odds.reduce((acc, item) => acc + item.probabilityBps, 0);
  const fixedTable = isFixed ? getFixedOddsTable(machine) : null;
  const friendById = new Map(
    machine.remainingPrizes
      .filter((p): p is FriendPrizeEntry => p.type === 'FRIEND_PRIZE')
      .map((p) => [p.id, p])
  );

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
          maxWidth: '520px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-white)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="pixel-marquee">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PixelIcon name="odds" size={16} color="#ffffff" />
            <span style={{ fontSize: '11px' }}>
              {isFixed ? 'FIXED ODDS' : 'LIVE ODDS'} — {machine.name}
            </span>
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

        {/* Modal Body */}
        <div style={{ padding: '16px', overflowY: 'auto' }}>
          <div style={{ marginBottom: '12px' }}>
            <MachineTypeBadge machineType={machine.machineType} />
          </div>
          {isFixed ? (
            fixedTable ? (
              <FixedOddsBody table={fixedTable} />
            ) : null
          ) : (
            <FiniteDeckBody
              machine={machine}
              odds={odds}
              totalProbability={totalProbability}
              friendById={friendById}
            />
          )}
        </div>

        {/* Modal Footer */}
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

/** Original Finite Deck odds view — behavior unchanged. */
const FiniteDeckBody: React.FC<{
  machine: FiniteDeckMachine;
  odds: PrizeOddsItem[];
  totalProbability: number;
  friendById: Map<string, FriendPrizeEntry>;
}> = ({ machine, odds, totalProbability, friendById }) => (
  <>
    <div
      style={{
        background: 'var(--color-lcd-bg)',
        border: '2px solid var(--color-black)',
        padding: '10px',
        marginBottom: '14px',
        fontSize: '11px',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
        TRANSPARENT FINITE INVENTORY
      </div>
      <div>
        Every pull consumes exactly ONE physical ticket. Current odds reflect remaining tickets
        ({machine.remainingPulls} / {machine.totalPulls} left).
      </div>
    </div>

    <div style={{ overflowX: 'auto' }}>
    <table className="pixel-table">
      <thead>
        <tr>
          <th>PRIZE</th>
          <th>REMAINING</th>
          <th>ODDS</th>
          <th>REF VALUE</th>
        </tr>
      </thead>
      <tbody>
        {odds.map((item) => {
          const friend = friendById.get(item.prizeEntryId);
          return (
          <tr key={item.prizeEntryId}>
            <td style={{ fontWeight: 'bold' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {item.type === 'FRIEND_PRIZE' && friend ? (
                  <FriendPrizeVisual
                    name={friend.name}
                    imageUrl={friend.displayImageUrl || friend.imageUrl}
                    openseaUrl={friend.openseaUrl}
                    collectionName={friend.collectionName}
                    tokenId={friend.tokenId.toString()}
                    spriteRows={friend.spriteRows}
                    origin={friend.origin}
                    size={40}
                  />
                ) : item.type === 'FRIEND_PRIZE' ? (
                  <PixelIcon name="friend" size={14} />
                ) : item.type === 'RF_PRIZE' ? (
                  <RfTokenIcon size={24} decorative />
                ) : (
                  <PixelIcon name="soldout" size={14} />
                )}
                <div>
                  <div>{item.label}</div>
                  <div style={{ fontSize: '9px', color: '#666' }}>
                    {friend
                      ? (nftIdentityLine({
                          collectionName: friend.collectionName,
                          collectionType: friend.collectionType,
                          tokenId: friend.tokenId.toString(),
                        }) ?? item.detail)
                      : item.detail}
                  </div>
                </div>
              </div>
            </td>
            <td>
              {item.remainingQuantity} / {item.initialQuantity}
            </td>
            <td style={{ fontWeight: 'bold' }}>{item.probabilityPct}</td>
            <td>
              {item.referenceValueUnits > 0n
                ? formatRFGrouped(item.referenceValueUnits)
                : '—'}
            </td>
          </tr>
          );
        })}
      </tbody>
    </table>
    </div>

    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        borderTop: '2px solid var(--color-black)',
        marginTop: '12px',
        paddingTop: '8px',
        fontFamily: 'var(--font-lcd)',
        fontSize: '11px',
      }}
    >
      <span>TOTAL PROBABILITY:</span>
      <span style={{ fontWeight: 'bold' }}>
        {(totalProbability / 100).toFixed(2)}% (EXACT CONSERVATION)
      </span>
    </div>
  </>
);

/** Fixed Odds prize table: immutable configured odds, sold-out slots, effective no-prize. */
const FixedOddsBody: React.FC<{ table: FixedOddsTable }> = ({ table }) => (
  <>
    <div
      style={{
        background: 'var(--color-lcd-bg)',
        border: '2px solid var(--color-black)',
        padding: '10px',
        marginBottom: '14px',
        fontSize: '11px',
      }}
    >
      <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>
        SAME ODDS EVERY PULL — NO PLAY CAP
      </div>
      <div>
        Each prize keeps its configured chance on every pull. When a prize sells
        out, its probability becomes an empty outcome instead of increasing the
        odds of other prizes.
      </div>
    </div>

    <div style={{ overflowX: 'auto' }}>
    <table className="pixel-table">
      <thead>
        <tr>
          <th>PRIZE</th>
          <th>REMAINING</th>
          <th>FIXED ODDS</th>
          <th>REF VALUE</th>
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row) => (
          <tr key={row.prizeEntryId} style={row.soldOut ? { opacity: 0.55 } : undefined}>
            <td style={{ fontWeight: 'bold' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                {row.type === 'FRIEND_PRIZE' ? (
                  <PixelIcon name="friend" size={14} />
                ) : (
                  <RfTokenIcon size={24} decorative />
                )}
                <div>
                  <div>{row.label}</div>
                  <div style={{ fontSize: '9px', color: '#666' }}>{row.detail}</div>
                  {row.soldOut && (
                    <div style={{ marginTop: '2px' }}>
                      <span style={{ fontSize: '8px', background: '#000', color: '#fff', padding: '1px 4px' }}>
                        SOLD OUT — {row.oddsPct} SLOT
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </td>
            <td>
              {row.soldOut ? 'SOLD OUT' : `${row.remainingQuantity} / ${row.initialQuantity}`}
            </td>
            <td style={{ fontWeight: 'bold' }}>{row.oddsPct}</td>
            <td>
              {row.referenceValueUnits > 0n
                ? formatRFGrouped(row.referenceValueUnits)
                : '—'}
            </td>
          </tr>
        ))}
        <tr>
          <td style={{ fontWeight: 'bold' }}>No Prize</td>
          <td>—</td>
          <td style={{ fontWeight: 'bold' }}>{table.effectiveNoPrizePct}</td>
          <td>—</td>
        </tr>
      </tbody>
    </table>
    </div>

    <div
      style={{
        borderTop: '2px solid var(--color-black)',
        marginTop: '12px',
        paddingTop: '8px',
        fontFamily: 'var(--font-lcd)',
        fontSize: '11px',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>BASE NO-PRIZE ODDS:</span>
        <span style={{ fontWeight: 'bold' }}>{formatOddsPpm(table.baseNoPrizePpm)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>SOLD-OUT SLOT ODDS:</span>
        <span style={{ fontWeight: 'bold' }}>{formatOddsPpm(table.soldOutSlotPpm)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span>EFFECTIVE NO-PRIZE ODDS:</span>
        <span style={{ fontWeight: 'bold' }}>{table.effectiveNoPrizePct}</span>
      </div>
    </div>
  </>
);
