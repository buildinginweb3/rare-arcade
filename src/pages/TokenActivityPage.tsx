import React, { useState } from 'react';
import type { LedgerEvent, Machine } from '../domain/types.ts';
import { formatRFGrouped } from '../domain/rf.ts';
import { PixelIcon } from '../components/ui/PixelIcon.tsx';
import { RfTokenIcon } from '../components/ui/RfTokenIcon.tsx';

interface TokenActivityPageProps {
  events: LedgerEvent[];
  machines: Machine[];
}

type EventFilter = 'ALL' | 'BURNS' | 'JACKPOTS' | 'PULLS' | 'CREATIONS';

export const TokenActivityPage: React.FC<TokenActivityPageProps> = ({ events, machines }) => {
  const [filter, setFilter] = useState<EventFilter>('ALL');

  // Compute aggregate browser-level metrics
  const totalVolume = machines.reduce((acc, m) => acc + m.totalSpentUnits, 0n);
  const totalBurn = machines.reduce((acc, m) => acc + m.totalBurnedUnits, 0n);
  const totalPulls = machines.reduce((acc, m) => acc + m.pullCount, 0);
  const totalRfPaid = machines.reduce((acc, m) => acc + m.rfPrizesPaidUnits, 0n);
  const totalFriendsWon = machines.reduce((acc, m) => acc + m.friendPrizesAwardedCount, 0);

  // Filter events
  const filteredEvents = events.filter((e) => {
    if (filter === 'BURNS') return e.type === 'RF_BURNED';
    if (filter === 'JACKPOTS') return e.type === 'FRIEND_PRIZE_AWARDED';
    if (filter === 'PULLS') return e.type === 'PULL_INITIATED';
    if (filter === 'CREATIONS') return e.type === 'MACHINE_CREATED';
    return true;
  });

  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto', padding: '20px 16px' }}>
      {/* Header Banner */}
      <div
        className="pixel-box"
        style={{
          padding: '16px 20px',
          marginBottom: '20px',
          background: 'var(--color-lcd-bg)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h1 style={{ fontSize: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <PixelIcon name="burn" size={20} />
              $RAREFRIENDS TOKEN ACTIVITY & BURN METRICS
            </h1>
            <p style={{ fontSize: '11px', fontFamily: 'var(--font-lcd)', color: '#444', marginTop: '4px' }}>
              Primary Vibeathon Category: Token Activity • Truthful browser demo ledger
            </p>
          </div>
          <span
            style={{
              background: 'var(--color-black)',
              color: 'var(--color-white)',
              padding: '4px 8px',
              fontFamily: 'var(--font-lcd)',
              fontSize: '10px',
            }}
          >
            DEMO ACTIVITY — THIS BROWSER
          </span>
        </div>
      </div>

      {/* Aggregate Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <PixelIcon name="burn" size={12} />
            TOTAL RF BURNED (5%)
          </div>
          <div style={{ fontSize: '17px', fontWeight: 'bold', marginTop: '4px' }}>
            {formatRFGrouped(totalBurn, { showSymbol: true })}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>Destroyed on every pull</div>
        </div>

        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <RfTokenIcon size={20} decorative />
            TOTAL RF SPENT
          </div>
          <div style={{ fontSize: '17px', fontWeight: 'bold', marginTop: '4px' }}>
            {formatRFGrouped(totalVolume, { showSymbol: true })}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>Gross pull turnover</div>
        </div>

        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <PixelIcon name="pull" size={12} />
            TOTAL PULLS
          </div>
          <div style={{ fontSize: '17px', fontWeight: 'bold', marginTop: '4px' }}>
            {totalPulls}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>Individual chance plays</div>
        </div>

        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <PixelIcon name="machine" size={12} />
            ACTIVE MACHINES
          </div>
          <div style={{ fontSize: '17px', fontWeight: 'bold', marginTop: '4px' }}>
            {machines.length}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>Creator-owned machines</div>
        </div>

        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <PixelIcon name="prize" size={12} />
            RF PRIZES PAID
          </div>
          <div style={{ fontSize: '17px', fontWeight: 'bold', marginTop: '4px' }}>
            {formatRFGrouped(totalRfPaid, { showSymbol: true })}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>Won by players</div>
        </div>

        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <PixelIcon name="friend" size={12} />
            RARE FRIENDS WON
          </div>
          <div style={{ fontSize: '17px', fontWeight: 'bold', marginTop: '4px' }}>
            {totalFriendsWon}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>Jackpot collectibles awarded</div>
        </div>
      </div>

      {/* The Economic Flywheel (Requirement 92) */}
      <div className="pixel-panel" style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '12px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <PixelIcon name="activity" size={16} />
          THE RARE ARCADE ECONOMIC FLYWHEEL
        </h2>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
            gap: '10px',
            fontSize: '11px',
            lineHeight: '1.4',
          }}
        >
          <div className="pixel-panel-sunken" style={{ padding: '10px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>1. SEED PRIZES</div>
            <div>Creator deposits RF rewards and Rare Friends into machine escrow.</div>
          </div>

          <div className="pixel-panel-sunken" style={{ padding: '10px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>2. MARKET APPEAL</div>
            <div>Higher prize pools and competitive RTP attract simulated players.</div>
          </div>

          <div className="pixel-panel-sunken" style={{ padding: '10px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>3. PULL SPEND</div>
            <div>Players spend RF per pull. Inventory and live odds update truthfully.</div>
          </div>

          <div className="pixel-panel-sunken" style={{ padding: '10px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>4. 5% RF BURN</div>
            <div>Platform permanently burns 5% of all RF spent on every single pull.</div>
          </div>

          <div className="pixel-panel-sunken" style={{ padding: '10px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>5. OPERATOR REPEAT</div>
            <div>Creator earns 95% proceeds to seed and launch subsequent machines.</div>
          </div>
        </div>
      </div>

      {/* Real-time Ledger */}
      <div className="pixel-panel">
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '8px',
            marginBottom: '14px',
          }}
        >
          <h2 style={{ fontSize: '13px' }}>SIMULATED EVENT LEDGER ({filteredEvents.length})</h2>

          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {(['ALL', 'BURNS', 'JACKPOTS', 'PULLS', 'CREATIONS'] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                className={`pixel-btn pixel-btn-sm ${filter === tab ? 'pixel-btn-primary' : ''}`}
                onClick={() => setFilter(tab)}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {filteredEvents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#666', fontSize: '11px' }}>
            No events match the selected filter.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
            {filteredEvents.map((evt) => {
              const iconName =
                evt.type === 'RF_BURNED'
                  ? 'burn'
                  : evt.type === 'FRIEND_PRIZE_AWARDED'
                  ? 'friend'
                  : evt.type === 'RF_PRIZE_PAID'
                  ? null
                  : evt.type === 'MACHINE_CREATED'
                  ? 'creator'
                  : evt.type === 'MACHINE_SOLD_OUT'
                  ? 'soldout'
                  : 'pull';

              return (
                <div
                  key={evt.id}
                  className="pixel-panel-sunken"
                  style={{
                    padding: '8px 12px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    fontSize: '11px',
                  }}
                >
                  {iconName ? (
                    <PixelIcon name={iconName} size={16} />
                  ) : (
                    <RfTokenIcon size={24} decorative />
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold' }}>{evt.details}</div>
                    <div
                      style={{
                        fontSize: '9px',
                        color: '#666',
                        fontFamily: 'var(--font-lcd)',
                        marginTop: '2px',
                        display: 'flex',
                        gap: '12px',
                      }}
                    >
                      <span>MACHINE: {evt.machineName}</span>
                      <span>TIME: {new Date(evt.timestamp).toLocaleTimeString()}</span>
                      <span>ACTOR: {evt.actorAddress.slice(0, 10)}...</span>
                    </div>
                  </div>
                  {evt.rfAmountUnits && (
                    <div
                      style={{
                        fontFamily: 'var(--font-lcd)',
                        fontWeight: 'bold',
                        fontSize: '11px',
                      }}
                    >
                      {formatRFGrouped(evt.rfAmountUnits, { showSymbol: true })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
