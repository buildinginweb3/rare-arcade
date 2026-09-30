import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Machine,
  FiniteDeckMachine,
  FixedOddsMachine,
  PullResult,
  LedgerEvent,
} from '../domain/types.ts';
import { isFixedOddsMachine } from '../domain/types.ts';
import { pullMachine, cancelMachine, isMachineSoldOut } from '../domain/machine.ts';
import { formatRFGrouped, formatBps } from '../domain/rf.ts';
import { classifyRtp } from '../domain/rtp.ts';
import { calculateRealizedPayoutRatio } from '../domain/fixedOdds.ts';
import { CabinetView } from '../components/machine/CabinetView.tsx';
import { OddsModal } from '../components/machine/OddsModal.tsx';
import { PrizePoolModal } from '../components/machine/PrizePoolModal.tsx';
import { RulesLockModal } from '../components/machine/RulesLockModal.tsx';
import { PixelIcon } from '../components/ui/PixelIcon.tsx';
import { MachineTypeBadge } from '../components/machine/MachineTypeBadge.tsx';
import { useSelloutEstimate } from '../components/machine/useSelloutEstimate.ts';
import { prizesRemaining } from '../components/machine/machineDisplay.ts';
import {
  REVEAL_HOLD_MS,
  isPullActive,
  preloadResultMedia,
  useReducedMotion,
  type PullPhase,
} from '../components/machine/pullStateMachine.ts';
import { resultKindForPrizeType } from '../components/machine/pullFx.ts';
import { soundFx } from '../utils/audio.ts';

interface MachineDetailProps {
  machine: Machine;
  playerAddress: string;
  playerBalanceUnits: bigint;
  onUpdateMachine: (updated: Machine, events: LedgerEvent[]) => void;
  onPlayerWonPrize: (result: PullResult) => void;
  onMachineCancelled?: (cancelledMachine: Machine, refundRf: bigint, events: LedgerEvent[]) => void;
  onBack: () => void;
  recentMachineEvents?: LedgerEvent[];
  reducedMotion?: boolean;
  /** True when the viewer operates this machine (demo id or linked wallet). */
  isOwnMachine?: boolean;
}

interface PendingPull {
  updatedMachine: Machine;
  result: PullResult;
  events: LedgerEvent[];
}

export const MachineDetail: React.FC<MachineDetailProps> = ({
  machine,
  playerAddress,
  playerBalanceUnits,
  onUpdateMachine,
  onPlayerWonPrize,
  onMachineCancelled,
  onBack,
  recentMachineEvents = [],
  reducedMotion: reducedMotionProp,
  isOwnMachine = false,
}) => {
  const osReduced = useReducedMotion();
  const reducedMotion = reducedMotionProp ?? osReduced;

  const [phase, setPhase] = useState<PullPhase>('IDLE');
  const [lastResult, setLastResult] = useState<PullResult | null>(null);
  const [pending, setPending] = useState<PendingPull | null>(null);
  /**
   * Synchronous mirror of `pending`: updaters must stay pure (StrictMode
   * double-invokes them in dev), so the one-shot commit reads + clears this
   * ref instead of stuffing side effects inside setPending.
   */
  const pendingRef = useRef<PendingPull | null>(null);
  const [pullRunId, setPullRunId] = useState(0);
  const [showOdds, setShowOdds] = useState(false);
  const [showPrizes, setShowPrizes] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const timers = useRef<number[]>([]);
  const phaseRef = useRef<PullPhase>('IDLE');
  phaseRef.current = phase;
  /**
   * Synchronous same-tick guard: phaseRef only refreshes on render, so two
   * invocations in one tick would both compute from the same base machine
   * (double charge, one ticket consumed, desynced RTP). This ref flips
   * immediately and releases when the machine is pull-ready again.
   */
  const pullInFlightRef = useRef(false);

  const isPulling = isPullActive(phase);
  // Result leak audit: while the machine is moving, user-visible outcome
  // data stays hidden. Authoritative state commits only at PRIZE_REVEAL,
  // so side panels render a neutral progress state until then.
  const resultHidden = isPulling;

  useEffect(() => {
    return () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    };
  }, []);

  // Reset reveal when switching machines.
  useEffect(() => {
    setLastResult(null);
    setPending(null);
    pendingRef.current = null;
    setPhase('IDLE');
    pullInFlightRef.current = false;
  }, [machine.id]);

  // Release the synchronous guard once the machine accepts pulls again.
  useEffect(() => {
    if (phase === 'IDLE' || phase === 'RESULT_COMPLETE') pullInFlightRef.current = false;
  }, [phase]);

  const canAfford = playerBalanceUnits >= machine.pullPriceUnits;
  const isFixed = isFixedOddsMachine(machine);
  const isSoldOut = isMachineSoldOut(machine);
  const isCancelled = machine.status === 'CANCELLED';
  const prizes = prizesRemaining(machine);
  const selloutEstimate = useSelloutEstimate(isFixed ? machine : null, 500);
  const realized = isFixed
    ? calculateRealizedPayoutRatio(
        machine.initialPrizes,
        machine.remainingPrizes,
        machine.totalSpentUnits
      )
    : null;

  let pullDisabledReason = '';
  if (!canAfford) {
    pullDisabledReason = `Need ${formatRFGrouped(machine.pullPriceUnits)} (You have ${formatRFGrouped(playerBalanceUnits)})`;
  } else if (isSoldOut) {
    pullDisabledReason = 'Machine is completely sold out';
  } else if (isCancelled) {
    pullDisabledReason = 'Machine has been cancelled';
  }

  const playShellStartSounds = useCallback((shellId: Machine['shellId']) => {
    soundFx.playInsertCoin();
    const t = window.setTimeout(() => {
      soundFx.playBurn();
      switch (shellId) {
        case 'CAPSULE':
          soundFx.playCapsuleTick();
          break;
        case 'TALLBOY':
          soundFx.playClawMotor();
          break;
        case 'MINI':
          soundFx.playReelClick();
          break;
        case 'CLASSIC':
        default:
          soundFx.playDrumRoll();
          break;
      }
    }, 250);
    timers.current.push(t);
  }, []);

  const handlePull = useCallback(() => {
    // Rapid-click / keyboard / touch protection: exactly one pull.
    // (pullInFlightRef covers same-tick double-invocation, which phaseRef
    // cannot see until the next render.)
    if (pullInFlightRef.current) return;
    if (phaseRef.current !== 'IDLE' && phaseRef.current !== 'RESULT_COMPLETE') return;
    if (!canAfford || isSoldOut || isCancelled) return;
    pullInFlightRef.current = true;

    setPhase('VALIDATING');
    setLastResult(null);

    let computed: PendingPull;
    try {
      const { updatedMachine, result, events } = pullMachine(
        machine as never,
        playerAddress,
        playerBalanceUnits
      );
      computed = { updatedMachine, result, events };
    } catch (err) {
      console.error('Pull execution error:', err);
      pullInFlightRef.current = false;
      setPhase('IDLE');
      return;
    }

    // RESULT_PENDING: authoritative result exists but stays hidden.
    pendingRef.current = computed;
    setPending(computed);
    setPhase('RESULT_PENDING');

    // Preload NFT media while the machine runs (never gates reveal timing).
    const art = computed.result.friendWon?.displayImageUrl || computed.result.friendWon?.imageUrl;
    preloadResultMedia(art);

    playShellStartSounds(machine.shellId);

    const runId = pullRunId + 1;
    setPullRunId(runId);
    // ANTICIPATION -> MACHINE_ACTION -> DELIVERY handled inside
    // PixelPullAnimation (single RAF timeline per shell).
    setPhase('MACHINE_ACTION');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canAfford, isSoldOut, isCancelled, machine, playerAddress, playerBalanceUnits, pullRunId]);

  const handleAnimationComplete = useCallback(() => {
    if (phaseRef.current !== 'MACHINE_ACTION') return;
    setPhase('MACHINE_COMPLETE');
    soundFx.playHatchClick();
    const t = window.setTimeout(() => {
      setPhase('REVEAL_HOLD');
      const t2 = window.setTimeout(() => {
        // PRIZE_REVEAL: commit the already-determined result once.
        // Synchronous ref read+clear (never side effects inside setState,
        // which StrictMode may invoke twice): exactly-once commit even if
        // completion fires again before the next render.
        const current = pendingRef.current;
        pendingRef.current = null;
        setPending(null);
        if (current) {
          const { updatedMachine, result, events } = current;
          if (result.prizeType === 'FRIEND_PRIZE') {
            soundFx.playJackpot();
          } else if (result.prizeType === 'RF_PRIZE') {
            soundFx.playPrizeWin();
          } else {
            soundFx.playNoPrize();
          }
          if (machine.shellId === 'CAPSULE') soundFx.playCapsulePop();
          if (machine.shellId === 'TALLBOY') soundFx.playClawRelease();
          if (machine.shellId === 'MINI') {
            soundFx.playReelStop(0);
            soundFx.playReelStop(1);
            soundFx.playReelStop(2);
          }
          setLastResult(result);
          onUpdateMachine(updatedMachine, events);
          onPlayerWonPrize(result);
        }
        setPhase('PRIZE_REVEAL');
        const t3 = window.setTimeout(() => {
          setPhase('RESULT_COMPLETE');
          const t4 = window.setTimeout(() => {
            setPhase('RETURN_TO_IDLE');
            const t5 = window.setTimeout(() => {
              if (phaseRef.current === 'RETURN_TO_IDLE') setPhase('IDLE');
            }, 400);
            timers.current.push(t5);
          }, 600);
          timers.current.push(t4);
        }, 900);
        timers.current.push(t3);
      }, REVEAL_HOLD_MS);
      timers.current.push(t2);
    }, 60);
    timers.current.push(t);
  }, [machine.shellId, onUpdateMachine, onPlayerWonPrize]);

  const handleCancel = () => {
    if (machine.pullCount > 0 || machine.isRulesLocked) return;
    try {
      const { cancelledMachine, refundRfUnits, events } = cancelMachine(machine as never);
      soundFx.playClick();
      onMachineCancelled?.(cancelledMachine, refundRfUnits, events);
      setShowRules(false);
    } catch (err) {
      console.error('Cancel machine error:', err);
    }
  };

  // While the result is hidden, suppress result-facing side panels so no
  // secondary UI leaks inventory/winner/ledger outcome early.
  const visibleEvents = resultHidden ? [] : recentMachineEvents;
  const displayMachine = machine;

  return (
    <div style={{ maxWidth: '1050px', margin: '0 auto', padding: '20px 16px' }}>
      {/* Navigation & Header */}
      <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          className="pixel-btn pixel-btn-sm"
          onClick={onBack}
        >
          <PixelIcon name="arrow-left" size={14} />
          BACK TO ARCADE
        </button>

        <div style={{ fontFamily: 'var(--font-lcd)', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>DEMO RF:</span>
          <strong style={{ fontSize: '12px' }}>
            {formatRFGrouped(playerBalanceUnits)}
          </strong>
        </div>
      </div>

      {/* Main Layout: Cabinet (Left) + Stats & History (Right) */}
      <div
        className="machine-detail-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/*
          Left: Pixel Cabinet View.

          No wrapper styling here on purpose. This container used to gain a
          "pull-focus" class while pulling, which drew a frame around the
          whole machine (first a dashed outline with a positive offset,
          then a solid inset box-shadow). Both read as a stray box popping
          up around the cabinet on every pull, so the indicator is gone.
          The pull state is already communicated by the "PULLING..." button
          label, the "PULL IN PROGRESS" activity panel, and the
          aria-live region below.
        */}
        <div>
          <CabinetView
            machine={displayMachine}
            onPull={handlePull}
            isPulling={isPulling}
            pullRunId={pullRunId}
            pullResult={isPulling ? null : lastResult}
            pullResultKind={resultKindForPrizeType(pending?.result.prizeType)}
            canPull={canAfford}
            pullDisabledReason={pullDisabledReason}
            onOpenOdds={() => setShowOdds(true)}
            onOpenPrizes={() => setShowPrizes(true)}
            onOpenRules={() => setShowRules(true)}
            reducedMotion={reducedMotion}
            onPullAnimationComplete={handleAnimationComplete}
          />
          <div className="sr-only" aria-live="polite">
            {isPulling ? 'Pull in progress.' : lastResult ? `Prize: ${lastResult.prizeType === 'RF_PRIZE' ? formatRFGrouped(lastResult.rfWonUnits) : lastResult.prizeType === 'FRIEND_PRIZE' && lastResult.friendWon ? `${lastResult.friendWon.name} #${lastResult.friendWon.tokenId.toString()}` : 'No prize.'}` : ''}
          </div>
        </div>

        {/* Right: Machine Economics & Pull History */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }} aria-hidden={isPulling ? undefined : undefined}>
          {/* Economics Transparency Card */}
          <div className="pixel-panel">
            <div className="pixel-marquee" style={{ margin: '-16px -16px 14px -16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <PixelIcon name="activity" size={16} color="#ffffff" />
                <span style={{ fontSize: '11px' }}>MACHINE ECONOMICS</span>
              </div>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <MachineTypeBadge machineType={machine.machineType} />
                <span style={{ fontSize: '9px', fontFamily: 'var(--font-lcd)' }}>
                  RULES {machine.isRulesLocked ? 'LOCKED' : 'READY'}
                </span>
              </span>
            </div>

            {isFixed ? (
              <FixedOddsEconomics
                machine={machine}
                selloutRange={selloutEstimate?.rangeLabel ?? null}
              />
            ) : (
              <FiniteDeckEconomics machine={machine} />
            )}

            {isFixed && classifyRtp((machine as FixedOddsMachine).configuredRtpBps).kind === 'subsidized' && (
              <div style={{ marginTop: '10px', padding: '8px 10px', background: '#000', color: '#fff', fontSize: '10px' }}>
                <strong>CREATOR-SUBSIDIZED MACHINE</strong> — configured prize value exceeds
                post-burn receipts.
              </div>
            )}
            {!isFixed && classifyRtp((machine as FiniteDeckMachine).currentRtpBps).kind === 'subsidized' && (
              <div style={{ marginTop: '10px', padding: '8px 10px', background: '#000', color: '#fff', fontSize: '10px' }}>
                <strong>CREATOR-SUBSIDIZED MACHINE</strong> — modeled prize value exceeds
                post-burn receipts.
              </div>
            )}

            {/* Token Activity metrics for this machine */}
            <div
              style={{
                borderTop: '2px solid var(--color-black)',
                marginTop: '14px',
                paddingTop: '10px',
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: '8px',
                textAlign: 'center',
                fontSize: '10px',
                fontFamily: 'var(--font-lcd)',
              }}
            >
              <div>
                <div style={{ color: '#666' }}>TOTAL SPENT</div>
                <div style={{ fontWeight: 'bold', marginTop: '2px' }}>
                  {formatRFGrouped(machine.totalSpentUnits)}
                </div>
              </div>
              <div>
                <div style={{ color: '#666' }}>TOTAL BURNED</div>
                <div style={{ fontWeight: 'bold', marginTop: '2px' }}>
                  {formatRFGrouped(machine.totalBurnedUnits)}
                </div>
              </div>
              <div>
                <div style={{ color: '#666' }}>{isFixed ? 'PULLS MADE' : 'PULLS'}</div>
                <div style={{ fontWeight: 'bold', marginTop: '2px' }}>
                  {isFixed ? (
                    <>{machine.pullCount}</>
                  ) : (
                    <>
                      {machine.pullCount} / {(machine as FiniteDeckMachine).totalPulls}
                    </>
                  )}
                </div>
                {isFixed && (
                  <div style={{ fontSize: '9px', color: '#666', marginTop: '2px' }}>
                    PRIZES {prizes.remaining} / {prizes.initial}
                  </div>
                )}
              </div>
            </div>

            {isFixed && machine.status === 'SOLD_OUT' && (
              <FixedOddsSoldOutReport machine={machine as FixedOddsMachine} realized={realized} />
            )}
          </div>

          {/* Activity / Pull History for this Machine */}
          <div className="pixel-panel" style={{ flex: 1 }}>
            <div className="pixel-marquee" style={{ margin: '-16px -16px 12px -16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <PixelIcon name="stats" size={16} color="#ffffff" />
                <span style={{ fontSize: '11px' }}>RECENT ACTIVITY — THIS MACHINE</span>
              </div>
            </div>

            {isPulling ? (
              <div style={{ textAlign: 'center', padding: '24px 10px', color: '#666', fontSize: '11px' }} aria-hidden="true">
                <PixelIcon name="activity" size={24} />
                <div style={{ marginTop: '8px' }}>PULL IN PROGRESS</div>
                <div>Machine is performing...</div>
              </div>
            ) : visibleEvents.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 10px', color: '#666', fontSize: '11px' }}>
                <PixelIcon name="activity" size={24} />
                <div style={{ marginTop: '8px' }}>NO PULLS YET</div>
                <div>Be the first player to pull from this machine!</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                {visibleEvents.slice(0, 8).map((evt) => (
                  <div
                    key={evt.id}
                    className="pixel-panel-sunken"
                    style={{
                      padding: '8px 10px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '11px',
                    }}
                  >
                    <PixelIcon
                      name={
                        evt.type === 'FRIEND_PRIZE_AWARDED'
                          ? 'friend'
                          : evt.type === 'RF_PRIZE_PAID'
                          ? 'rf'
                          : evt.type === 'RF_BURNED'
                          ? 'burn'
                          : 'pull'
                      }
                      size={14}
                    />
                    <div style={{ flex: 1 }}>
                      <div>{evt.details}</div>
                      <div style={{ fontSize: '9px', color: '#777', fontFamily: 'var(--font-lcd)', marginTop: '2px' }}>
                        {new Date(evt.timestamp).toLocaleTimeString()} • {evt.actorAddress.slice(0, 10)}...
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals — never mount the result; odds/prizes/rules stay inspectable */}
      {showOdds && !isPulling && <OddsModal machine={machine} onClose={() => setShowOdds(false)} />}
      {showPrizes && !isPulling && <PrizePoolModal machine={machine} onClose={() => setShowPrizes(false)} />}
      {showRules && (
        <RulesLockModal
          machine={machine}
          onClose={() => setShowRules(false)}
          onCancelMachine={handleCancel}
          canCancel={isOwnMachine || machine.creatorAddress === playerAddress || machine.pullCount === 0}
        />
      )}
    </div>
  );
};

const econGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: '10px',
  fontSize: '11px',
  fontFamily: 'var(--font-lcd)',
};

const econTileStyle: React.CSSProperties = {
  padding: '8px 10px',
};

const econCaptionStyle: React.CSSProperties = { color: '#666' };

const econValueStyle: React.CSSProperties = {
  fontSize: '13px',
  fontWeight: 'bold',
  marginTop: '2px',
};

/** Original Finite Deck transparency stats — behavior unchanged. */
const FiniteDeckEconomics: React.FC<{ machine: FiniteDeckMachine }> = ({ machine }) => (
  <div style={econGridStyle}>
    <div className="pixel-panel-sunken" style={econTileStyle}>
      <div style={econCaptionStyle}>PULL PRICE</div>
      <div style={econValueStyle} title={formatRFGrouped(machine.pullPriceUnits)}>
        {formatRFGrouped(machine.pullPriceUnits)}
      </div>
    </div>

    <div className="pixel-panel-sunken" style={econTileStyle}>
      <div style={econCaptionStyle}>BURN PER PULL</div>
      <div style={econValueStyle}>
        {formatRFGrouped((machine.pullPriceUnits * 500n) / 10000n)} (5%)
      </div>
    </div>

    <div className="pixel-panel-sunken" style={econTileStyle}>
      <div style={econCaptionStyle}>TARGET RTP</div>
      <div style={econValueStyle}>{formatBps(machine.targetRtpBps, 2)}</div>
    </div>

    <div className="pixel-panel-sunken" style={econTileStyle}>
      <div style={econCaptionStyle}>INITIAL RTP</div>
      <div style={econValueStyle}>{formatBps(machine.initialRtpBps, 2)}</div>
    </div>

    <div className="pixel-panel-sunken" style={econTileStyle}>
      <div style={econCaptionStyle}>CURRENT LIVE RTP</div>
      <div
        style={{
          ...econValueStyle,
          color: machine.currentRtpBps > machine.initialRtpBps ? '#000000' : 'inherit',
        }}
      >
        {formatBps(machine.currentRtpBps, 2)}
        {machine.currentRtpBps > machine.initialRtpBps && ' ↑'}
      </div>
    </div>

    <div className="pixel-panel-sunken" style={econTileStyle}>
      <div style={econCaptionStyle}>OPERATOR MARGIN</div>
      <div style={econValueStyle}>{formatBps(9500 - machine.currentRtpBps, 2)}</div>
    </div>
  </div>
);

/** Fixed Odds transparency stats: configured vs live-available, prizes, modeled range. */
const FixedOddsEconomics: React.FC<{
  machine: FixedOddsMachine;
  selloutRange: string | null;
}> = ({ machine, selloutRange }) => {
  const totals = { remaining: 0, initial: 0 };
  for (const e of machine.remainingPrizes) {
    if (e.type !== 'RF_PRIZE' && e.type !== 'FRIEND_PRIZE') continue;
    totals.remaining += e.remainingQuantity;
  }
  for (const e of machine.initialPrizes) {
    if (e.type !== 'RF_PRIZE' && e.type !== 'FRIEND_PRIZE') continue;
    totals.initial += e.initialQuantity;
  }
  return (
    <div style={econGridStyle}>
      <div className="pixel-panel-sunken" style={econTileStyle}>
        <div style={econCaptionStyle}>PULL PRICE</div>
        <div style={econValueStyle} title={formatRFGrouped(machine.pullPriceUnits)}>
          {formatRFGrouped(machine.pullPriceUnits)}
        </div>
      </div>

      <div className="pixel-panel-sunken" style={econTileStyle}>
        <div style={econCaptionStyle}>BURN PER PULL</div>
        <div style={econValueStyle}>
          {formatRFGrouped((machine.pullPriceUnits * 500n) / 10000n)} (5%)
        </div>
      </div>

      <div className="pixel-panel-sunken" style={econTileStyle}>
        <div style={econCaptionStyle}>CONFIGURED RTP</div>
        <div style={econValueStyle}>{formatBps(machine.configuredRtpBps, 2)}</div>
      </div>

      <div className="pixel-panel-sunken" style={econTileStyle}>
        <div style={econCaptionStyle}>LIVE AVAILABLE RTP</div>
        <div style={econValueStyle}>{formatBps(machine.liveAvailableRtpBps, 2)}</div>
      </div>

      <div className="pixel-panel-sunken" style={econTileStyle}>
        <div style={econCaptionStyle}>MODELED EDGE</div>
        <div style={econValueStyle}>
          {formatBps(9500 - machine.configuredRtpBps, 2)} (95% − RTP)
        </div>
      </div>

      <div className="pixel-panel-sunken" style={econTileStyle}>
        <div style={econCaptionStyle}>PRIZES REMAINING</div>
        <div style={econValueStyle}>
          {totals.remaining} / {totals.initial}
        </div>
      </div>

      {selloutRange && machine.status !== 'SOLD_OUT' && (
        <div className="pixel-panel-sunken" style={{ ...econTileStyle, gridColumn: '1 / -1' }}>
          <div style={econCaptionStyle}>MODELED SELLOUT RANGE</div>
          <div style={econValueStyle}>{selloutRange}</div>
        </div>
      )}
    </div>
  );
};

/** Fixed Odds completion report: totals + realized payout ratio vs configured RTP. */
const FixedOddsSoldOutReport: React.FC<{
  machine: FixedOddsMachine;
  realized: { distributedUnits: bigint; ratioBps: number } | null;
}> = ({ machine, realized }) => (
  <div
    style={{
      marginTop: '14px',
      padding: '10px 12px',
      background: 'var(--color-black)',
      color: 'var(--color-white)',
      fontSize: '10px',
      fontFamily: 'var(--font-lcd)',
      lineHeight: '1.7',
    }}
  >
    <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', marginBottom: '4px' }}>
      ★ MACHINE SOLD OUT ★
    </div>
    <div>TOTAL PULLS: {machine.pullCount}</div>
    <div>TOTAL RF SPENT: {formatRFGrouped(machine.totalSpentUnits)}</div>
    <div>TOTAL RF BURNED: {formatRFGrouped(machine.totalBurnedUnits)}</div>
    <div>CREATOR RECEIPTS: {formatRFGrouped(machine.creatorReceiptsUnits)}</div>
    <div>
      PRIZES DISTRIBUTED: {machine.friendPrizesAwardedCount} NFT +{' '}
      {formatRFGrouped(machine.rfPrizesPaidUnits)}
    </div>
    <div>CONFIGURED RTP: {formatBps(machine.configuredRtpBps, 2)}</div>
    <div>
      REALIZED PAYOUT RATIO:{' '}
      {realized ? `${(realized.ratioBps / 100).toFixed(2)}%` : '—'}
    </div>
  </div>
);
