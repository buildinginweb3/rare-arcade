import React from 'react';
import type { AppSettings } from '../../data/storage.ts';
import { formatRFGrouped } from '../../domain/rf.ts';
import { formatUsdgGrouped } from '../../domain/usdg.ts';
import { PixelIcon } from './PixelIcon.tsx';
import { RfTokenIcon } from './RfTokenIcon.tsx';
import {
  CONTRACTS,
  SETTLEMENT_CHAIN_ID,
  SETTLEMENT_CHAIN_SLUG,
  liveReadinessReport,
} from '../../web3/contracts.ts';
import { PLATFORM_PRIMARY_WALLET, RF_BURN_SINK } from '../../domain/fees.ts';
import { useState } from 'react';

export type NavTab = 'ARCADE' | 'CREATE' | 'CREATOR_DASHBOARD' | 'INVENTORY' | 'ACTIVITY';

interface AppHeaderProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  /** USDG is the play currency — the primary balance shown. */
  playerUsdgBalanceUnits: bigint;
  creatorUsdgBalanceUnits: bigint;
  /** $RAREFRIENDS won as rewards. Not spendable on pulls. */
  playerRfBalanceUnits: bigint;
  creatorRfBalanceUnits: bigint;
  settings: AppSettings;
  onUpdateSettings: (newSettings: Partial<AppSettings>) => void;
  onResetData: () => void;
  onOpenOnboarding: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  currentTab,
  onSelectTab,
  playerUsdgBalanceUnits,
  creatorUsdgBalanceUnits,
  playerRfBalanceUnits,
  creatorRfBalanceUnits,
  settings,
  onUpdateSettings,
  onResetData,
  onOpenOnboarding,
}) => {
  const isPlayer = settings.activeRole === 'PLAYER';
  const [showContracts, setShowContracts] = useState(false);
  const readiness = liveReadinessReport();

  return (
    <header style={{ userSelect: 'none' }}>
      {/* 1. Persistent Compact Simulation Banner */}
      <div className="sim-banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="sim-banner-pill">
            {readiness.mode === 'live' ? 'LIVE USDG PLATFORM' : 'SIMULATED VIBEATHON DEMO'}
          </span>
          <span>NO REAL USDG OR NFTS ARE TRANSFERRED</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={onOpenOnboarding}
            style={{
              background: 'none',
              border: 'none',
              color: '#ffffff',
              cursor: 'pointer',
              fontFamily: 'var(--font-lcd)',
              fontSize: '9px',
              textDecoration: 'underline',
            }}
          >
            HOW IT WORKS (?)
          </button>
          <button
            type="button"
            onClick={() => {
              if (window.confirm('Reset all demo machines, balances, and history to fresh defaults?')) {
                onResetData();
              }
            }}
            style={{
              background: 'none',
              border: 'none',
              color: '#aaaaaa',
              cursor: 'pointer',
              fontFamily: 'var(--font-lcd)',
              fontSize: '8px',
            }}
          >
            RESET DEMO DATA
          </button>
          <button
            type="button"
            onClick={() => setShowContracts((v) => !v)}
            style={{
              background: 'none',
              border: 'none',
              color: readiness.liveReady ? '#7CFC7C' : '#ffcc66',
              cursor: 'pointer',
              fontFamily: 'var(--font-lcd)',
              fontSize: '8px',
              textDecoration: 'underline',
            }}
          >
            {readiness.liveReady ? 'CONTRACTS READY' : `CONTRACTS: ${readiness.missing.length} TODO`}
          </button>
        </div>
      </div>

      {/* 2. Main Navigation Bar */}
      <div className="arcade-header">
        <div
          style={{
            maxWidth: '1150px',
            margin: '0 auto',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          {/* Logo / Brand */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
            onClick={() => onSelectTab('ARCADE')}
          >
            <div
              style={{
                width: '32px',
                height: '32px',
                background: 'var(--color-black)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PixelIcon name="machine" size={20} color="#ffffff" />
            </div>
            <div>
              <div
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '14px',
                  letterSpacing: '1px',
                }}
              >
                RARE ARCADE
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-lcd)',
                  fontSize: '9px',
                  color: '#666',
                }}
              >
                CREATOR-OWNED FRIEND MACHINES
              </div>
            </div>
          </div>

          {/* Center Tabs */}
          <nav style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`arcade-nav-tab ${currentTab === 'ARCADE' ? 'arcade-nav-tab-active' : ''}`}
              onClick={() => onSelectTab('ARCADE')}
            >
              <PixelIcon
                name="machine"
                size={14}
                color={currentTab === 'ARCADE' ? '#ffffff' : '#000000'}
              />
              ARCADE FLOOR
            </button>

            <button
              type="button"
              className={`arcade-nav-tab ${currentTab === 'CREATE' ? 'arcade-nav-tab-active' : ''}`}
              onClick={() => onSelectTab('CREATE')}
            >
              <PixelIcon
                name="creator"
                size={14}
                color={currentTab === 'CREATE' ? '#ffffff' : '#000000'}
              />
              BUILD MACHINE
            </button>

            <button
              type="button"
              className={`arcade-nav-tab ${currentTab === 'CREATOR_DASHBOARD' ? 'arcade-nav-tab-active' : ''}`}
              onClick={() => onSelectTab('CREATOR_DASHBOARD')}
            >
              <PixelIcon
                name="stats"
                size={14}
                color={currentTab === 'CREATOR_DASHBOARD' ? '#ffffff' : '#000000'}
              />
              CREATOR DASH
            </button>

            <button
              type="button"
              className={`arcade-nav-tab ${currentTab === 'INVENTORY' ? 'arcade-nav-tab-active' : ''}`}
              onClick={() => onSelectTab('INVENTORY')}
            >
              <PixelIcon
                name="inventory"
                size={14}
                color={currentTab === 'INVENTORY' ? '#ffffff' : '#000000'}
              />
              MY PRIZES
            </button>

            <button
              type="button"
              className={`arcade-nav-tab ${currentTab === 'ACTIVITY' ? 'arcade-nav-tab-active' : ''}`}
              onClick={() => onSelectTab('ACTIVITY')}
            >
              <PixelIcon
                name="burn"
                size={14}
                color={currentTab === 'ACTIVITY' ? '#ffffff' : '#000000'}
              />
              USDG ACTIVITY
            </button>
          </nav>

          {/* Right Controls: Role Switcher & Balances */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Identity Switcher (Requirement 55) */}
            <div
              className="pixel-box"
              style={{
                padding: '4px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '10px',
                fontFamily: 'var(--font-lcd)',
                background: 'var(--color-lcd-bg)',
              }}
            >
              <button
                type="button"
                className={`pixel-btn pixel-btn-sm ${isPlayer ? 'pixel-btn-primary' : ''}`}
                style={{ padding: '3px 6px', fontSize: '9px' }}
                onClick={() => onUpdateSettings({ activeRole: 'PLAYER' })}
                title="Switch to Demo Player identity"
              >
                PLAYER
              </button>
              <button
                type="button"
                className={`pixel-btn pixel-btn-sm ${!isPlayer ? 'pixel-btn-primary' : ''}`}
                style={{ padding: '3px 6px', fontSize: '9px' }}
                onClick={() => onUpdateSettings({ activeRole: 'CREATOR' })}
                title="Switch to Operator identity"
              >
                OPERATOR
              </button>

              {/* USDG — the play currency, always shown first. */}
              <div style={{ borderLeft: '1px solid var(--color-black)', paddingLeft: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <RfTokenIcon size={20} decorative />
                <div>
                  <span style={{ color: '#666', fontSize: '8px' }}>
                    {isPlayer ? 'USDG' : 'CREATOR USDG'}
                  </span>
                  <div style={{ fontWeight: 'bold', fontSize: '11px' }}>
                    {formatUsdgGrouped(isPlayer ? playerUsdgBalanceUnits : creatorUsdgBalanceUnits, { showSymbol: true })}
                  </div>
                </div>
              </div>

              {/* RF — reward winnings only, never spendable on a pull. */}
              <div style={{ borderLeft: '1px solid var(--color-black)', paddingLeft: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div>
                  <span style={{ color: '#666', fontSize: '8px' }}>
                    {isPlayer ? 'RF WON' : 'RF RESERVE'}
                  </span>
                  <div style={{ fontWeight: 'bold', fontSize: '11px' }}>
                    {formatRFGrouped(isPlayer ? playerRfBalanceUnits : creatorRfBalanceUnits, { showSymbol: true })}
                  </div>
                </div>
              </div>
            </div>

            {/* Sound Toggle */}
            <button
              type="button"
              className="pixel-btn pixel-btn-sm"
              style={{ padding: '6px' }}
              onClick={() => onUpdateSettings({ soundEnabled: !settings.soundEnabled })}
              title={settings.soundEnabled ? 'Mute retro sound' : 'Unmute retro sound'}
            >
              <PixelIcon name={settings.soundEnabled ? 'sound-on' : 'sound-off'} size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Contract readiness diagnostics — shows exactly what still blocks live settlement. */}
      {showContracts && (
        <div
          className="pixel-panel"
          style={{
            margin: '10px 16px',
            padding: '12px 14px',
            background: 'var(--color-lcd-bg)',
            fontFamily: 'var(--font-lcd)',
            fontSize: '10px',
          }}
        >
          <div style={{ fontWeight: 'bold', fontSize: '11px', marginBottom: '6px' }}>
            SMART CONTRACT REGISTRY — SETTLEMENT: {SETTLEMENT_CHAIN_SLUG.toUpperCase()} (CHAIN ID{' '}
            {SETTLEMENT_CHAIN_ID})
          </div>
          <div style={{ fontSize: '9px', color: '#444', marginBottom: '8px', lineHeight: 1.5 }}>
            Pulls settle in USDG on Robinhood Chain. Every pull charges a 5% platform fee: 75%
            to the treasury, and 25% that buys and burns $RAREFRIENDS. The math in{' '}
            <code>domain/fees.ts</code> and <code>domain/buyback.ts</code> is the specification
            these contracts must reproduce exactly.
          </div>

          {Object.values(CONTRACTS).map((c) => (
            <div
              key={c.role}
              style={{
                display: 'flex',
                gap: '8px',
                alignItems: 'baseline',
                padding: '3px 0',
                borderBottom: '1px dotted #bbb',
                flexWrap: 'wrap',
              }}
            >
              <span style={{ width: '11px', color: c.configured ? '#0a0' : '#c00' }}>
                {c.configured ? '■' : '□'}
              </span>
              <strong style={{ minWidth: '190px' }}>{c.label}</strong>
              <code style={{ fontSize: '9px' }}>{c.address}</code>
              <span style={{ fontSize: '9px', color: '#555', flex: '1 1 100%' }}>{c.notes}</span>
            </div>
          ))}

          <div style={{ marginTop: '8px', fontSize: '9px', lineHeight: 1.6 }}>
            <strong>FEE ROUTING:</strong>
            <div style={{ color: '#333' }}>
              75% → {PLATFORM_PRIMARY_WALLET}
              <br />
              25% → buys $RAREFRIENDS on an AMM and burns them at {RF_BURN_SINK}
            </div>
            {readiness.blocking.map((b) => (
              <div key={b} style={{ color: '#c00', marginTop: '4px' }}>
                ■ {b}
              </div>
            ))}
            {readiness.feeProblems.map((b) => (
              <div key={b} style={{ color: '#c00' }}>
                ■ {b}
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
};
