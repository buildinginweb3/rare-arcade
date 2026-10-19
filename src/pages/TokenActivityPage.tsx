import React, { useState } from 'react';
import type { BuybackLedger } from '../domain/buyback.ts';
import type { LedgerEvent, Machine } from '../domain/types.ts';
import { formatRFGrouped } from '../domain/rf.ts';
import { formatUsdgGrouped } from '../domain/usdg.ts';
import { PLATFORM_FEE_RECIPIENTS, RF_BURN_SINK } from '../domain/fees.ts';
import { PixelIcon } from '../components/ui/PixelIcon.tsx';
import { RfTokenIcon } from '../components/ui/RfTokenIcon.tsx';

interface TokenActivityPageProps {
  events: LedgerEvent[];
  machines: Machine[];
  /** Platform-level RF buyback ledger (pooled across machines). */
  buyback: BuybackLedger;
}

type EventFilter = 'ALL' | 'FEES' | 'BURNS' | 'JACKPOTS' | 'PULLS' | 'CREATIONS' | 'VAULT';

export const TokenActivityPage: React.FC<TokenActivityPageProps> = ({
  events,
  machines,
  buyback,
}) => {
  const [filter, setFilter] = useState<EventFilter>('ALL');

  // Compute aggregate browser-level metrics
  const totalVolume = machines.reduce((acc, m) => acc + m.totalSpentUnits, 0n);
  const totalFee = machines.reduce((acc, m) => acc + m.totalPlatformFeeUnits, 0n);
  const totalPrimaryFee = machines.reduce((acc, m) => acc + m.primaryFeeUnits, 0n);
  const totalBuybackFee = machines.reduce((acc, m) => acc + m.buybackFeeUnits, 0n);
  const totalPulls = machines.reduce((acc, m) => acc + m.pullCount, 0);
  const totalUsdgPaid = machines.reduce((acc, m) => acc + m.usdgPrizesPaidUnits, 0n);
  // Buyback ledger arrives as a prop — pooled platform-wide, not a machine sum.
  const totalRfPaid = machines.reduce((acc, m) => acc + m.rfPrizesPaidUnits, 0n);
  const totalFriendsWon = machines.reduce((acc, m) => acc + m.friendPrizesAwardedCount, 0);

  // Filter events
  const filteredEvents = events.filter((e) => {
    if (filter === 'FEES')
      return e.type === 'PLATFORM_FEE_COLLECTED' ||
        e.type === 'PLATFORM_FEE_SPLIT' ||
        e.type === 'RF_BUYBACK_FUNDED';
    if (filter === 'BURNS') return e.type === 'RF_BURNED';
    if (filter === 'JACKPOTS') return e.type === 'FRIEND_PRIZE_AWARDED';
    if (filter === 'PULLS') return e.type === 'PULL_INITIATED';
    if (filter === 'CREATIONS') return e.type === 'MACHINE_CREATED';
    if (filter === 'VAULT')
      return e.type === 'MACHINE_PAUSED' ||
        e.type === 'MACHINE_RESUMED' ||
        e.type === 'ESCROW_WITHDRAWN' ||
        e.type === 'MACHINE_CANCELLED';
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
              USDG ACTIVITY & PLATFORM FEE METRICS
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
            TOTAL USDG PLATFORM FEE (5%)
          </div>
          <div style={{ fontSize: '17px', fontWeight: 'bold', marginTop: '4px' }}>
            {formatUsdgGrouped(totalFee, { showSymbol: true })}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>
            75% to treasury • 25% buys and burns RF
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '4px', lineHeight: 1.5 }}>
            {PLATFORM_FEE_RECIPIENTS.map((r) => (
              <div key={r.role}>
                {r.shareLabel} {r.destination}
                {r.role === 'PRIMARY' ? ` ${formatUsdgGrouped(totalPrimaryFee)}` : ` ${formatUsdgGrouped(totalBuybackFee)}`}
              </div>
            ))}
          </div>
        </div>

        {/* Buyback + burn — the headline use of the fee. */}
        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <PixelIcon name="burn" size={12} />
            $RAREFRIENDS BURNED
          </div>
          <div style={{ fontSize: '17px', fontWeight: 'bold', marginTop: '4px' }}>
            {formatRFGrouped(buyback.totalRfBurnedUnits, { showSymbol: true })}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>
            Bought with {formatUsdgGrouped(buyback.totalSpentUsdgUnits)} of platform fees over{' '}
            {buyback.burnCount} batch{buyback.burnCount === 1 ? '' : 'es'}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '4px', lineHeight: 1.5 }}>
            Sent to {RF_BURN_SINK.slice(0, 10)}…{RF_BURN_SINK.slice(-4)}
            {buyback.pendingUsdgUnits > 0n && (
              <div style={{ color: '#555' }}>
                {formatUsdgGrouped(buyback.pendingUsdgUnits)} accrued, awaiting the next batch
              </div>
            )}
          </div>
        </div>

        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <RfTokenIcon size={20} decorative />
            TOTAL USDG SPENT
          </div>
          <div style={{ fontSize: '17px', fontWeight: 'bold', marginTop: '4px' }}>
            {formatUsdgGrouped(totalVolume, { showSymbol: true })}
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
            USDG CASHRBACK PAID
          </div>
          <div style={{ fontSize: '17px', fontWeight: 'bold', marginTop: '4px' }}>
            {formatUsdgGrouped(totalUsdgPaid, { showSymbol: true })}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>
            {formatRFGrouped(totalRfPaid, { showSymbol: true })} RF also paid
          </div>
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
            <div>Creator deposits USDG/RF cashback and Rare Friends into machine escrow.</div>
          </div>

          <div className="pixel-panel-sunken" style={{ padding: '10px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>2. MARKET APPEAL</div>
            <div>Higher prize pools and competitive RTP attract simulated players.</div>
          </div>

          <div className="pixel-panel-sunken" style={{ padding: '10px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>3. PULL SPEND</div>
            <div>Players spend USDG per pull. Inventory and live odds update truthfully.</div>
          </div>

          <div className="pixel-panel-sunken" style={{ padding: '10px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>4. 5% PLATFORM FEE</div>
            <div>
              Every pull charges a 5% USDG platform fee. 75% goes to the Rare Arcade treasury;
              the other 25% accumulates and is periodically swapped into $RAREFRIENDS on an AMM
              and burned — a visible, on-chain-reckonable deflation of the RF supply.
            </div>
          </div>

          <div className="pixel-panel-sunken" style={{ padding: '10px' }}>
            <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>5. OPERATOR REPEAT</div>
            <div>
              Creator earns 95% proceeds to seed and launch subsequent machines. Prize escrow
              they no longer need stays locked in the machine until it sells out, or can be
              returned to them in full by pausing the machine and withdrawing it.
            </div>
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
            {(['ALL', 'FEES', 'BURNS', 'JACKPOTS', 'PULLS', 'CREATIONS', 'VAULT'] as const).map((tab) => (
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
                evt.type === 'PLATFORM_FEE_COLLECTED'
                  ? 'burn'
                  : evt.type === 'FRIEND_PRIZE_AWARDED'
                  ? 'friend'
                  : evt.type === 'RF_BURNED' || evt.type === 'RF_BUYBACK_FUNDED'
                  ? 'burn'
                  : evt.type === 'RF_PRIZE_PAID'
                  ? null
                  : evt.type === 'MACHINE_CREATED'
                  ? 'creator'
                  : evt.type === 'MACHINE_SOLD_OUT'
                  ? 'soldout'
                  : evt.type === 'MACHINE_PAUSED' ||
                    evt.type === 'MACHINE_RESUMED' ||
                    evt.type === 'ESCROW_WITHDRAWN' ||
                    evt.type === 'MACHINE_CANCELLED'
                  ? 'lock'
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
