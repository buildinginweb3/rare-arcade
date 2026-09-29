import React, { useState } from 'react';
import type { Machine } from '../domain/types.ts';
import { isFixedOddsMachine } from '../domain/types.ts';
import { isMachineSoldOut } from '../domain/machine.ts';
import { formatRFGrouped, formatRFCompact, formatBps } from '../domain/rf.ts';
import { PixelIcon } from '../components/ui/PixelIcon.tsx';
import { RareFriendSprite } from '../components/ui/RareFriendSprite.tsx';
import { FriendPrizeVisual } from '../nfts/FriendPrizeVisual.tsx';
import { RfTokenIcon } from '../components/ui/RfTokenIcon.tsx';
import { selectTopPrizeVisual } from '../components/machine/topPrize.ts';
import { MachineTypeBadge } from '../components/machine/MachineTypeBadge.tsx';
import { displayRtpBps, prizesRemaining } from '../components/machine/machineDisplay.ts';

interface ArcadeFloorProps {
  machines: Machine[];
  onSelectMachine: (machineId: string) => void;
  onNavigateCreate: () => void;
}

type SortFilter = 'ALL' | 'LOWEST_COST' | 'HIGHEST_RTP' | 'FEWEST_LEFT';
type TypeFilter = 'ALL' | 'FINITE_DECK' | 'FIXED_ODDS';

export const ArcadeFloor: React.FC<ArcadeFloorProps> = ({
  machines,
  onSelectMachine,
  onNavigateCreate,
}) => {
  const [filter, setFilter] = useState<SortFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');

  // Filter by model, then sort
  const visibleMachines = machines.filter((m) => {
    if (typeFilter === 'FINITE_DECK') return !isFixedOddsMachine(m);
    if (typeFilter === 'FIXED_ODDS') return isFixedOddsMachine(m);
    return true;
  });

  // Filter and sort machines
  const filteredMachines = [...visibleMachines].sort((a, b) => {
    if (filter === 'LOWEST_COST') {
      return Number(a.pullPriceUnits - b.pullPriceUnits);
    }
    if (filter === 'HIGHEST_RTP') {
      return displayRtpBps(b) - displayRtpBps(a);
    }
    if (filter === 'FEWEST_LEFT') {
      // Tickets left for Finite Deck, prizes left for Fixed Odds (no cap).
      const leftA = isFixedOddsMachine(a) ? prizesRemaining(a).remaining : a.remainingPulls;
      const leftB = isFixedOddsMachine(b) ? prizesRemaining(b).remaining : b.remainingPulls;
      return leftA - leftB;
    }
    // Default newest
    return b.createdAt - a.createdAt;
  });

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px 16px' }}>
      {/* Top Banner / Welcome */}
      <div
        className="pixel-box"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
          background: 'var(--color-lcd-bg)',
        }}
      >
        <div>
          <h1 style={{ fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PixelIcon name="machine" size={20} />
            THE ARCADE FLOOR
          </h1>
          <p style={{ fontSize: '11px', fontFamily: 'var(--font-lcd)', color: '#444', marginTop: '4px' }}>
            Browse community Friend Machines • Every pull burns 5% RF • Transparent finite odds
          </p>
        </div>

        <button
          type="button"
          className="pixel-btn pixel-btn-primary"
          onClick={onNavigateCreate}
        >
          <PixelIcon name="creator" size={14} color="#ffffff" />
          BUILD A MACHINE
        </button>
      </div>

      {/* Filter / Sort Pills */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '12px',
          alignItems: 'center',
        }}
      >
        <span style={{ fontFamily: 'var(--font-lcd)', fontSize: '11px', fontWeight: 'bold' }}>
          MODEL:
        </span>
        {(
          [
            { id: 'ALL', label: 'ALL' },
            { id: 'FINITE_DECK', label: 'FINITE DECK' },
            { id: 'FIXED_ODDS', label: 'FIXED ODDS' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={`pixel-btn pixel-btn-sm ${typeFilter === item.id ? 'pixel-btn-primary' : ''}`}
            onClick={() => setTypeFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '8px',
          marginBottom: '20px',
          alignItems: 'center',
        }}
      >
        <span style={{ fontFamily: 'var(--font-lcd)', fontSize: '11px', fontWeight: 'bold' }}>
          SORT BY:
        </span>
        {(
          [
            { id: 'ALL', label: 'NEWEST' },
            { id: 'LOWEST_COST', label: 'LOWEST COST' },
            { id: 'HIGHEST_RTP', label: 'HIGHEST RTP' },
            { id: 'FEWEST_LEFT', label: 'FEWEST PULLS LEFT' },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            className={`pixel-btn pixel-btn-sm ${filter === item.id ? 'pixel-btn-primary' : ''}`}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Cabinets Grid */}
      {filteredMachines.length === 0 ? (
        <div
          className="pixel-box"
          style={{ padding: '40px', textAlign: 'center', background: 'var(--color-white)' }}
        >
          <PixelIcon name="machine" size={48} />
          <h2 style={{ fontSize: '14px', marginTop: '12px' }}>NO MACHINES FOUND</h2>
          <p style={{ fontSize: '12px', marginTop: '6px', color: '#666' }}>
            Be the first operator to seed prizes and launch a machine.
          </p>
          <button
            type="button"
            className="pixel-btn pixel-btn-primary"
            style={{ marginTop: '16px' }}
            onClick={onNavigateCreate}
          >
            CREATE FIRST MACHINE
          </button>
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '20px',
          }}
        >
          {filteredMachines.map((m) => {
            const isSoldOut = isMachineSoldOut(m);
            const topVisual = selectTopPrizeVisual(m);
            const topFriend = topVisual.kind === 'nft' ? topVisual.entry : undefined;
            const topRf = topVisual.kind === 'rf' ? topVisual.entry : undefined;
            const prizes = prizesRemaining(m);
            // Live RTP of 0 means there is no prize value left to win, so
            // the "Tokens" fallback would be misleading.
            const liveRtpBps = displayRtpBps(m);
            const hasNoPrizeValue = liveRtpBps === 0;

            return (
              <div
                key={m.id}
                className="cabinet-container"
                style={{
                  cursor: 'pointer',
                  maxWidth: '100%',
                  opacity: isSoldOut ? 0.75 : 1,
                }}
                onClick={() => onSelectMachine(m.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    onSelectMachine(m.id);
                  }
                }}
              >
                {/* Marquee */}
                <div className="cabinet-header">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                    <PixelIcon name="machine" size={14} color="#ffffff" />
                    <span style={{ fontSize: '11px', letterSpacing: '0.5px' }}>{m.name}</span>
                  </div>
                  <div
                    style={{
                      fontSize: '8px',
                      fontFamily: 'var(--font-lcd)',
                      marginTop: '2px',
                      color: '#bbb',
                    }}
                  >
                    BY {m.creatorAddress.slice(0, 10)}...
                  </div>
                  <div
                    style={{
                      marginTop: '4px',
                      display: 'flex',
                      justifyContent: 'center',
                      gap: '4px',
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ color: '#ddd' }}>
                      <MachineTypeBadge machineType={m.machineType} />
                    </span>
                    {m.initialPrizes.some((p) => p.type === 'FRIEND_PRIZE' && p.origin === 'system-demo') && (
                      <span
                        style={{
                          border: '1px solid #bbb',
                          color: '#ddd',
                          fontSize: '7px',
                          fontFamily: 'var(--font-lcd)',
                          padding: '1px 5px',
                        }}
                      >
                        SYSTEM DEMO MACHINE
                      </span>
                    )}
                  </div>
                </div>

                {/* Display Screen */}
                <div className="cabinet-screen-bezel" style={{ padding: '8px' }}>
                  <div
                    className="cabinet-lcd-screen"
                    style={{ minHeight: '140px', padding: '10px' }}
                  >
                    {isSoldOut ? (
                      <div style={{ textAlign: 'center' }}>
                        <PixelIcon name="soldout" size={32} />
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px', marginTop: '6px' }}>
                          SOLD OUT
                        </div>
                        <div style={{ fontFamily: 'var(--font-lcd)', fontSize: '9px', color: '#666', marginTop: '2px' }}>
                          {isFixedOddsMachine(m)
                            ? 'all prizes claimed'
                            : `${m.totalPulls} pulls consumed`}
                        </div>
                      </div>
                    ) : (
                      <div style={{ textAlign: 'center' }}>
                        {topVisual.kind === 'nft' && topFriend ? (
                          <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <FriendPrizeVisual
                              name={topFriend.name}
                              imageUrl={topFriend.displayImageUrl || topFriend.imageUrl}
                              openseaUrl={topFriend.openseaUrl}
                              collectionName={topFriend.collectionName}
                              tokenId={topFriend.tokenId.toString()}
                              spriteRows={topFriend.spriteRows}
                              origin={topFriend.origin}
                              size={84}
                            />
                          </div>
                        ) : topVisual.kind === 'rf' ? (
                          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                            <RfTokenIcon size={36} />
                          </div>
                        ) : (
                          <RareFriendSprite tokenId={m.mascotTokenId} scale={3} />
                        )}
                        <div
                          style={{
                            fontFamily: 'var(--font-lcd)',
                            fontSize: '9px',
                            marginTop: '6px',
                            fontWeight: 'bold',
                          }}
                        >
                          TOP PRIZE:
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '11px',
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '220px',
                          }}
                        >
                          {topFriend
                            ? topFriend.name
                            : topRf
                            ? `${formatRFGrouped(topRf.amountUnits)}`
                            : hasNoPrizeValue
                            ? 'None Left'
                            : 'Tokens'}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cabinet Economics Readout */}
                <div style={{ padding: '10px 12px', background: 'var(--color-lcd-dim)' }}>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(3, 1fr)',
                      gap: '4px',
                      fontFamily: 'var(--font-lcd)',
                      fontSize: '9px',
                      textAlign: 'center',
                      marginBottom: '8px',
                    }}
                  >
                    <div>
                      <div style={{ color: '#666' }}>COST</div>
                      <div style={{ fontWeight: 'bold', fontSize: '10px' }} title={formatRFGrouped(m.pullPriceUnits)}>
                        {formatRFCompact(m.pullPriceUnits)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#666' }}>LIVE RTP</div>
                      <div style={{ fontWeight: 'bold', fontSize: '10px' }}>
                        {formatBps(liveRtpBps)}
                      </div>
                    </div>
                    <div>
                      <div style={{ color: '#666' }}>
                        {isFixedOddsMachine(m) ? 'PRIZES LEFT' : 'PULLS LEFT'}
                      </div>
                      <div style={{ fontWeight: 'bold', fontSize: '10px' }}>
                        {isFixedOddsMachine(m)
                          ? `${prizes.remaining} / ${prizes.initial}`
                          : `${m.remainingPulls} / ${m.totalPulls}`}
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="pixel-btn"
                    style={{
                      width: '100%',
                      padding: '8px',
                      fontSize: '10px',
                      display: 'flex',
                      justifyContent: 'center',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectMachine(m.id);
                    }}
                  >
                    {isSoldOut
                      ? 'VIEW STATS'
                      : `Play — ${formatRFGrouped(m.pullPriceUnits)}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
