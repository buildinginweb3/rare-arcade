import React from 'react';
import type {
  Machine,
  CreatorAccount,
  LedgerEvent,
  RareFriendMetadata,
} from '../domain/types.ts';
import { isFixedOddsMachine } from '../domain/types.ts';
import { formatBps } from '../domain/rf.ts';
import { formatUsdgGrouped } from '../domain/usdg.ts';
import { cancelMachine } from '../domain/machine.ts';
import {
  canPauseMachine,
  canResumeMachine,
  canWithdrawEscrow,
  computeEscrowSnapshot,
  pauseMachine,
  resumeMachine,
  withdrawEscrow,
} from '../domain/vault.ts';
import { selectOperatorMachines } from '../nfts/ownership.ts';
import { PixelIcon } from '../components/ui/PixelIcon.tsx';
import { RfTokenIcon } from '../components/ui/RfTokenIcon.tsx';
import { MachineTypeBadge } from '../components/machine/MachineTypeBadge.tsx';
import { useSelloutEstimate } from '../components/machine/useSelloutEstimate.ts';
import { displayRtpBps, prizesRemaining } from '../components/machine/machineDisplay.ts';
import { soundFx } from '../utils/audio.ts';

interface CreatorDashboardProps {
  creator: CreatorAccount;
  machines: Machine[];
  /** Lowercased operator identities (demo id + connected wallet) that count as "you". */
  operatorAddresses: string[];
  onSelectMachine: (machineId: string) => void;
  onNavigateCreate: () => void;
  onMachineCancelled: (
    cancelled: Machine,
    refundUsdg: bigint,
    refundRf: bigint,
    events: LedgerEvent[]
  ) => void;
  onMachinePaused: (paused: Machine, events: LedgerEvent[]) => void;
  onMachineResumed: (resumed: Machine, events: LedgerEvent[]) => void;
  onEscrowWithdrawn: (
    withdrawn: Machine,
    refundUsdg: bigint,
    refundRf: bigint,
    refundFriends: RareFriendMetadata[],
    events: LedgerEvent[]
  ) => void;
}

export const CreatorDashboard: React.FC<CreatorDashboardProps> = ({
  creator,
  machines,
  operatorAddresses,
  onSelectMachine,
  onNavigateCreate,
  onMachineCancelled,
  onMachinePaused,
  onMachineResumed,
  onEscrowWithdrawn,
}) => {
  // Aggregate stats across all machines created by this operator. A machine
  // counts as yours when its creator address matches any of your operator
  // identities (demo id or connected wallet), case-insensitively.
  const myMachines = selectOperatorMachines(machines, operatorAddresses);
  const totalPulls = myMachines.reduce((acc, m) => acc + m.pullCount, 0);
  const totalVolume = myMachines.reduce((acc, m) => acc + m.totalSpentUnits, 0n);
  const totalBurn = myMachines.reduce((acc, m) => acc + m.totalPlatformFeeUnits, 0n);
  const totalReceipts = myMachines.reduce((acc, m) => acc + m.creatorReceiptsUnits, 0n);

  const soldOutMachines = myMachines.filter((m) => m.status === 'SOLD_OUT');

  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto', padding: '20px 16px' }}>
      {/* Top Banner */}
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
            <PixelIcon name="creator" size={18} />
            CREATOR DASHBOARD & OPERATOR WORKSHOP
          </h1>
          <p style={{ fontSize: '11px', fontFamily: 'var(--font-lcd)', color: '#444', marginTop: '4px' }}>
            Manage your Friend Machines • Monitor USDG pull volume, 95% proceeds, and platform fees
          </p>
          <p style={{ fontSize: '9px', fontFamily: 'var(--font-lcd)', color: '#666', marginTop: '4px' }}>
            TRACKING {myMachines.length} MACHINE{myMachines.length === 1 ? '' : 'S'} AS {creator.address.slice(0, 12)}…
            {operatorAddresses.length > 1 ? ` + ${operatorAddresses.length - 1} LINKED WALLET${operatorAddresses.length - 1 === 1 ? '' : 'S'}` : ''}
          </p>
        </div>

        <button
          type="button"
          className="pixel-btn pixel-btn-primary"
          onClick={onNavigateCreate}
        >
          <PixelIcon name="plus" size={14} color="#ffffff" />
          BUILD NEW MACHINE
        </button>
      </div>

      {/* Sold Out Celebration Moment (Requirement 90) */}
      {soldOutMachines.length > 0 && (
        <div
          className="pixel-box"
          style={{
            padding: '14px 18px',
            marginBottom: '20px',
            background: 'var(--color-black)',
            color: 'var(--color-white)',
            border: '3px solid var(--color-black)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <PixelIcon name="trophy" size={24} color="#ffffff" />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px' }}>
                MACHINE COMPLETE — SELLOUT MILESTONE!
              </div>
              <div style={{ fontFamily: 'var(--font-lcd)', fontSize: '10px', color: '#ccc', marginTop: '2px' }}>
                "{soldOutMachines[0]!.name}" has sold out 100% of its prize inventory!
              </div>
            </div>
          </div>
          <div style={{ fontFamily: 'var(--font-lcd)', fontSize: '11px' }}>
            Total USDG platform fee from this machine: {formatUsdgGrouped(soldOutMachines[0]!.totalPlatformFeeUnits, { showSymbol: true })}
          </div>
        </div>
      )}

      {/* Aggregate Creator Metrics Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RfTokenIcon size={20} decorative />
            CREATOR RF BALANCE
          </div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', marginTop: '4px' }}>
            {formatUsdgGrouped(creator.usdgBalanceUnits, { showSymbol: true })}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>Available for seeding</div>
        </div>

        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666' }}>
            TOTAL GROSS VOLUME
          </div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', marginTop: '4px' }}>
            {formatUsdgGrouped(totalVolume, { showSymbol: true })}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>Total player turnover</div>
        </div>

        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666' }}>
            TOTAL GROSS PROCEEDS (95%)
          </div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', marginTop: '4px' }}>
            {formatUsdgGrouped(totalReceipts, { showSymbol: true })}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>Earned from pulls</div>
        </div>

        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666' }}>
            TOTAL USDG PLATFORM FEES GENERATED (5%)
          </div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', marginTop: '4px' }}>
            {formatUsdgGrouped(totalBurn, { showSymbol: true })}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>Permanently destroyed</div>
        </div>

        <div className="pixel-panel-sunken" style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: '10px', fontFamily: 'var(--font-lcd)', color: '#666' }}>
            TOTAL PULLS RECEIVED
          </div>
          <div style={{ fontSize: '15px', fontWeight: 'bold', marginTop: '4px' }}>
            {totalPulls}
          </div>
          <div style={{ fontSize: '9px', color: '#777', marginTop: '2px' }}>
            Across {myMachines.length} machines
          </div>
        </div>
      </div>

      {/* Machine List */}
      <div className="pixel-panel">
        <h2 style={{ fontSize: '13px', marginBottom: '14px' }}>
          MY FRIEND MACHINES ({myMachines.length})
        </h2>

        {myMachines.length === 0 ? (
          <div style={{ padding: '32px', textAlign: 'center', color: '#666' }}>
            <PixelIcon name="machine" size={32} />
            <div style={{ marginTop: '8px', fontSize: '12px' }}>NO MACHINES CREATED YET</div>
            <p style={{ fontSize: '11px', marginTop: '4px' }}>
              Launch your first Friend Machine to start earning USDG proceeds.
            </p>
            <button
              type="button"
              className="pixel-btn pixel-btn-primary"
              style={{ marginTop: '12px' }}
              onClick={onNavigateCreate}
            >
              BUILD A MACHINE
            </button>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
          <table className="pixel-table">
            <thead>
              <tr>
                <th>MACHINE</th>
                <th>STATUS</th>
                <th>PRICE</th>
                <th>PULLS</th>
                <th>RF VOLUME</th>
                <th>FEE (5%)</th>
                <th>RECEIPTS (95%)</th>
                <th>LIVE RTP</th>
                <th>EST SELLOUT</th>
                <th>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {myMachines.map((m) => (
                <DashboardRow
                  key={m.id}
                  machine={m}
                  operatorAddresses={operatorAddresses}
                  onSelectMachine={onSelectMachine}
                  onMachineCancelled={onMachineCancelled}
                  onMachinePaused={onMachinePaused}
                  onMachineResumed={onMachineResumed}
                  onEscrowWithdrawn={onEscrowWithdrawn}
                />
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
};

/** One dashboard row: branched pulls/RTP cells, low-stock + sellout estimate for Fixed Odds. */
const DashboardRow: React.FC<{
  machine: Machine;
  operatorAddresses: string[];
  onSelectMachine: (machineId: string) => void;
  onMachineCancelled: (
    cancelled: Machine,
    refundUsdg: bigint,
    refundRf: bigint,
    events: LedgerEvent[]
  ) => void;
  onMachinePaused: (paused: Machine, events: LedgerEvent[]) => void;
  onMachineResumed: (resumed: Machine, events: LedgerEvent[]) => void;
  onEscrowWithdrawn: (
    withdrawn: Machine,
    refundUsdg: bigint,
    refundRf: bigint,
    refundFriends: RareFriendMetadata[],
    events: LedgerEvent[]
  ) => void;
}> = ({
  machine: m,
  operatorAddresses,
  onSelectMachine,
  onMachineCancelled,
  onMachinePaused,
  onMachineResumed,
  onEscrowWithdrawn,
}) => {
  const isFixed = isFixedOddsMachine(m);
  const estimate = useSelloutEstimate(isFixed ? m : null, 150);
  const prizes = prizesRemaining(m);
  const lowStock =
    isFixed &&
    m.status !== 'SOLD_OUT' &&
    m.status !== 'CANCELLED' &&
    prizes.remaining > 0 &&
    m.remainingPrizes.some(
      (p) =>
        (p.type === 'RF_PRIZE' || p.type === 'FRIEND_PRIZE') &&
        p.remainingQuantity <= 1
    );

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (m.pullCount > 0 || m.isRulesLocked) return;
    try {
      const { cancelledMachine, refundUsdgUnits, refundRfUnits, events } = cancelMachine(m);
      soundFx.playClick();
      onMachineCancelled(cancelledMachine, refundUsdgUnits, refundRfUnits, events);
    } catch (err) {
      console.error('Failed to cancel machine:', err);
    }
  };

  // --- Vault: pause, resume, withdraw. Every one of these is re-checked in
  // the domain layer, so a stale button here can never move money.
  const escrow = computeEscrowSnapshot(m);
  const pauseOk = canPauseMachine(m, operatorAddresses).ok;
  const resumeOk = canResumeMachine(m, operatorAddresses).ok;
  const withdrawCheck = canWithdrawEscrow(m, operatorAddresses);
  const isClosed = m.status === 'CANCELLED' || m.status === 'SOLD_OUT';

  const handlePause = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { pausedMachine, events } = pauseMachine(m, operatorAddresses);
      soundFx.playClick();
      onMachinePaused(pausedMachine, events);
    } catch (err) {
      console.error('Failed to pause machine:', err);
    }
  };

  const handleResume = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { resumedMachine, events } = resumeMachine(m, operatorAddresses);
      soundFx.playClick();
      onMachineResumed(resumedMachine, events);
    } catch (err) {
      console.error('Failed to resume machine:', err);
    }
  };

  const handleWithdraw = (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const {
        withdrawnMachine,
        refundUsdgUnits,
        refundRfUnits,
        refundFriends,
        events,
      } = withdrawEscrow(m, operatorAddresses);
      soundFx.playClick();
      onEscrowWithdrawn(
        withdrawnMachine,
        refundUsdgUnits,
        refundRfUnits,
        refundFriends,
        events
      );
    } catch (err) {
      console.error('Failed to withdraw escrow:', err);
    }
  };

  return (
    <tr
      style={{ cursor: 'pointer' }}
      onClick={() => onSelectMachine(m.id)}
    >
      <td style={{ fontWeight: 'bold' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <PixelIcon name="machine" size={14} />
          <span>{m.name}</span>
        </div>
        <div style={{ marginTop: '4px', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          <MachineTypeBadge machineType={m.machineType} />
          {lowStock && (
            <span
              style={{
                fontSize: '8px',
                background: '#000',
                color: '#fff',
                padding: '1px 5px',
                fontFamily: 'var(--font-lcd)',
              }}
            >
              LOW STOCK
            </span>
          )}
        </div>
        {escrow.totalUsdgValueUnits > 0n && (
          <div
            style={{
              marginTop: '4px',
              fontSize: '9px',
              fontFamily: 'var(--font-lcd)',
              color: '#555',
            }}
            title="Prize escrow still locked in this machine, withdrawable by you"
          >
            VAULT {formatUsdgGrouped(escrow.totalUsdgValueUnits)}
          </div>
        )}
      </td>
      <td>
        <span
          style={{
            padding: '2px 6px',
            background:
              m.status === 'SOLD_OUT' || m.status === 'PAUSED'
                ? '#000'
                : m.status === 'LIVE'
                ? '#e0e0d8'
                : '#ffffff',
            color: m.status === 'SOLD_OUT' || m.status === 'PAUSED' ? '#fff' : '#000',
            border: '1px solid #000',
            fontSize: '9px',
            fontFamily: 'var(--font-lcd)',
          }}
        >
          {m.status}
        </span>
      </td>
      <td>{formatUsdgGrouped(m.pullPriceUnits, { showSymbol: true })}</td>
      <td>
        {isFixed ? (
          <>
            {m.pullCount}
            <div style={{ fontSize: '9px', color: '#666' }}>
              {prizes.remaining} / {prizes.initial} prizes
            </div>
          </>
        ) : (
          <>
            {m.pullCount} / {m.totalPulls}
          </>
        )}
      </td>
      <td>{formatUsdgGrouped(m.totalSpentUnits, { showSymbol: true })}</td>
      <td style={{ fontWeight: 'bold' }}>
        {formatUsdgGrouped(m.totalPlatformFeeUnits, { showSymbol: true })}
      </td>
      <td style={{ fontWeight: 'bold' }}>
        {formatUsdgGrouped(m.creatorReceiptsUnits, { showSymbol: true })}
      </td>
      <td>{formatBps(displayRtpBps(m))}</td>
      <td style={{ fontSize: '10px' }}>
        {isFixed
          ? m.status === 'SOLD_OUT'
            ? 'ENDED'
            : estimate
              ? `~${estimate.medianPulls.toLocaleString('en-US')} pulls`
              : '—'
          : `${m.totalPulls} max`}
      </td>
      <td>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {m.pullCount === 0 && !m.isRulesLocked && m.status !== 'CANCELLED' && (
            <button
              type="button"
              className="pixel-btn pixel-btn-sm"
              style={{ padding: '2px 6px', fontSize: '9px' }}
              onClick={handleCancel}
              title="Cancel machine & reclaim escrow"
            >
              CANCEL
            </button>
          )}
          {pauseOk && (
            <button
              type="button"
              className="pixel-btn pixel-btn-sm"
              style={{ padding: '2px 6px', fontSize: '9px' }}
              onClick={handlePause}
              title="Pause pulls (escrow untouched, fully reversible)"
            >
              PAUSE
            </button>
          )}
          {resumeOk && (
            <button
              type="button"
              className="pixel-btn pixel-btn-sm"
              style={{ padding: '2px 6px', fontSize: '9px' }}
              onClick={handleResume}
              title="Resume pulls"
            >
              RESUME
            </button>
          )}
          {!isClosed && (
            <button
              type="button"
              className="pixel-btn pixel-btn-sm"
              style={{ padding: '2px 6px', fontSize: '9px' }}
              onClick={handleWithdraw}
              disabled={!withdrawCheck.ok}
              title={
                withdrawCheck.ok
                  ? `Return ${formatUsdgGrouped(escrow.totalUsdgValueUnits)} of unused escrow and close this machine for good`
                  : withdrawCheck.reason
              }
            >
              WITHDRAW
            </button>
          )}
          <button
            type="button"
            className="pixel-btn pixel-btn-sm"
            style={{ padding: '2px 6px', fontSize: '9px' }}
            onClick={(e) => {
              e.stopPropagation();
              onSelectMachine(m.id);
            }}
          >
            VIEW
          </button>
        </div>
      </td>
    </tr>
  );
};
