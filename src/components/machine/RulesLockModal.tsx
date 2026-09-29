import React from 'react';
import type { Machine } from '../../domain/types.ts';
import { isFixedOddsMachine } from '../../domain/types.ts';
import { formatRFGrouped, formatBps } from '../../domain/rf.ts';
import { PixelIcon } from '../ui/PixelIcon.tsx';
import { MachineTypeBadge } from './MachineTypeBadge.tsx';

interface RulesLockModalProps {
  machine: Machine;
  onClose: () => void;
  onCancelMachine?: () => void;
  canCancel?: boolean;
}

export const RulesLockModal: React.FC<RulesLockModalProps> = ({
  machine,
  onClose,
  onCancelMachine,
  canCancel = false,
}) => {
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
          maxWidth: '520px',
          width: '100%',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-white)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pixel-marquee">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PixelIcon name="lock" size={16} color="#ffffff" />
            <span style={{ fontSize: '11px' }}>TRANSPARENCY & RULES — {machine.name}</span>
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

        <div style={{ padding: '16px', overflowY: 'auto' }}>
          <div style={{ marginBottom: '12px' }}>
            <MachineTypeBadge machineType={machine.machineType} />
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px',
              background: machine.isRulesLocked ? 'var(--color-black)' : 'var(--color-lcd-bg)',
              color: machine.isRulesLocked ? 'var(--color-white)' : 'var(--color-black)',
              border: '2px solid var(--color-black)',
              marginBottom: '14px',
            }}
          >
            <PixelIcon
              name="lock"
              size={20}
              color={machine.isRulesLocked ? '#ffffff' : '#000000'}
            />
            <div style={{ fontSize: '12px', fontWeight: 'bold' }}>
              {machine.isRulesLocked
                ? 'MACHINE RULES LOCKED IMMUTABLY'
                : 'PENDING FIRST PULL (PRE-LAUNCH)'}
            </div>
          </div>

          <div style={{ fontSize: '12px', lineHeight: '1.6', marginBottom: '14px' }}>
            <p style={{ marginBottom: '8px' }}>
              <strong>1. First-Pull Immutability:</strong> Once the first pull occurs, the creator
              cannot alter pull price, prize inventory, reference values
              {isFixed ? ', probabilities, or machine type' : ', total ticket count, or odds'}.
            </p>
            <p style={{ marginBottom: '8px' }}>
              <strong>2. Fixed 5% Platform Burn:</strong> Exactly 5% of all simulated RF spent on
              pulls is permanently burned. The machine creator cannot adjust the burn rate.
            </p>
            {isFixed ? (
              <p style={{ marginBottom: '8px' }}>
                <strong>3. Fixed Individual Odds:</strong> Every prize keeps its configured chance
                on every pull — there is no play cap. Sold-out prize slots become empty
                outcomes instead of raising other prizes' odds. The machine ends only when
                all prize inventory is gone.
              </p>
            ) : (
              <p style={{ marginBottom: '8px' }}>
                <strong>3. Finite Inventory:</strong> Each pull consumes exactly one remaining ticket
                from the machine's finite deck. Odds update truthfully after every pull.
              </p>
            )}
            <p>
              <strong>4. Operator Proceeds:</strong> The creator receives 95% of pull proceeds,
              having previously seeded the prize pool at launch.
            </p>
            <p style={{ marginTop: '8px' }}>
              <strong>5. Locked NFT Valuation:</strong> Rare Arcade snapshots each NFT&apos;s top
              bid and the $RF market price when the machine is published. Future
              market moves do not change this machine&apos;s configured economics. Top-bid
              references are market references, not guaranteed sale values.
            </p>
          </div>

          <div
            className="pixel-panel-sunken"
            style={{ padding: '10px', fontSize: '11px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}
          >
            <div>
              <span style={{ color: '#666' }}>PULL PRICE:</span>{' '}
              <strong>{formatRFGrouped(machine.pullPriceUnits, { showSymbol: true })}</strong>
            </div>
            <div>
              <span style={{ color: '#666' }}>PLATFORM BURN:</span> <strong>5.0% FIXED</strong>
            </div>
            <div>
              <span style={{ color: '#666' }}>INITIAL RTP:</span>{' '}
              <strong>
                {isFixed
                  ? formatBps(machine.configuredRtpBps, 2)
                  : formatBps(machine.initialRtpBps)}
              </strong>
            </div>
            <div>
              <span style={{ color: '#666' }}>CURRENT RTP:</span>{' '}
              <strong>
                {isFixed
                  ? formatBps(machine.liveAvailableRtpBps, 2)
                  : formatBps(machine.currentRtpBps)}
              </strong>
            </div>
            {isFixed && (
              <div style={{ gridColumn: '1 / -1', fontSize: '9px', color: '#666' }}>
                INITIAL = CONFIGURED RTP (never changes) • CURRENT = LIVE AVAILABLE RTP
                (available prizes only)
              </div>
            )}
          </div>

          {canCancel && !machine.isRulesLocked && machine.pullCount === 0 && (
            <div
              style={{
                marginTop: '16px',
                padding: '12px',
                border: '2px dashed var(--color-black)',
                background: 'var(--color-lcd-bg)',
              }}
            >
              <div style={{ fontWeight: 'bold', fontSize: '12px', marginBottom: '4px' }}>
                CREATOR CONTROLS: CANCEL MACHINE
              </div>
              <div style={{ fontSize: '11px', marginBottom: '10px' }}>
                Because no pulls have occurred yet, you may cancel this machine and return all
                seeded RF and Rare Friends back to your inventory.
              </div>
              <button
                type="button"
                className="pixel-btn pixel-btn-sm"
                style={{ background: '#000', color: '#fff' }}
                onClick={onCancelMachine}
              >
                CANCEL MACHINE & RETURN ESCROW
              </button>
            </div>
          )}
        </div>

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
