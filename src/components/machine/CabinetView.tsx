import React from 'react';
import type { Machine, PullResult, FriendPrizeEntry, RFPrizeEntry } from '../../domain/types.ts';
import { isFixedOddsMachine } from '../../domain/types.ts';
import { isMachineSoldOut } from '../../domain/machine.ts';
import { calculateRealizedPayoutRatio } from '../../domain/fixedOdds.ts';
import { formatBps, formatRFGrouped } from '../../domain/rf.ts';
import { PixelIcon } from '../ui/PixelIcon.tsx';
import { RareFriendSprite } from '../ui/RareFriendSprite.tsx';
import { RfTokenIcon } from '../ui/RfTokenIcon.tsx';
import { FriendPrizeVisual, nftIdentityLine } from '../../nfts/FriendPrizeVisual.tsx';
import { PixelPullAnimation, type AnimatedShell } from './PixelPullAnimation.tsx';
import type { PullFxResultKind } from './PixelPullFx.tsx';
import { PrizeReveal } from './PrizeReveal.tsx';
import { RfBurnVisual } from './RfBurnVisual.tsx';
import { selectTopPrizeVisual } from './topPrize.ts';
import { pullFxForShell } from './pullFx.ts';
import { MachineTypeBadge } from './MachineTypeBadge.tsx';
import { displayRtpBps, prizesRemaining } from './machineDisplay.ts';
import { useReducedMotion } from './pullStateMachine.ts';

interface CabinetViewProps {
  machine: Machine;
  onPull?: () => void;
  isPulling?: boolean;
  pullRunId?: number;
  pullResult?: PullResult | null;
  /**
   * Broad visual hint for the in-progress pull (rf/nft/empty). Derived from
   * the already-determined authoritative result; never influences RNG.
   */
  pullResultKind?: PullFxResultKind;
  canPull?: boolean;
  pullDisabledReason?: string;
  onOpenOdds?: () => void;
  onOpenPrizes?: () => void;
  onOpenRules?: () => void;
  reducedMotion?: boolean;
  onPullAnimationComplete?: () => void;
}

function shellToAnimated(shellId: Machine['shellId']): AnimatedShell {
  switch (shellId) {
    case 'CAPSULE':
      return 'capsule';
    case 'TALLBOY':
      return 'tallboy';
    case 'MINI':
      return 'mini';
    case 'CLASSIC':
    default:
      return 'classic';
  }
}

export const CabinetView: React.FC<CabinetViewProps> = ({
  machine,
  onPull,
  isPulling = false,
  pullRunId = 0,
  pullResult,
  pullResultKind = 'empty',
  canPull = true,
  pullDisabledReason,
  onOpenOdds,
  onOpenPrizes,
  onOpenRules,
  reducedMotion: reducedMotionProp,
  onPullAnimationComplete,
}) => {
  const osReduced = useReducedMotion();
  const reducedMotion = reducedMotionProp ?? osReduced;
  const isFixed = isFixedOddsMachine(machine);
  const isSoldOut = isMachineSoldOut(machine);
  const isCancelled = machine.status === 'CANCELLED';
  const prizes = prizesRemaining(machine);
  const realized =
    isFixed && isSoldOut
      ? calculateRealizedPayoutRatio(
          machine.initialPrizes,
          machine.remainingPrizes,
          machine.totalSpentUnits
        )
      : null;

  // Determine top remaining prize with type guards
  const topFriendPrize = machine.remainingPrizes.find(
    (p): p is FriendPrizeEntry => p.type === 'FRIEND_PRIZE' && p.remainingQuantity > 0
  );
  const topRfPrize = machine.remainingPrizes
    .filter((p): p is RFPrizeEntry => p.type === 'RF_PRIZE' && p.remainingQuantity > 0)
    .sort((a, b) => Number(b.amountUnits - a.amountUnits))[0];

  // LCD top-prize visual: real NFT art/sprite, the $RF coin for token
  // prizes, or the mascot sprite only when nothing remains.
  const topVisual = selectTopPrizeVisual(machine);
  const pullFx = pullFxForShell(machine.shellId);

  const topPrizeLabel = topFriendPrize
    ? `${topFriendPrize.name} (Rare Friend)`
    : topRfPrize
    ? `${formatRFGrouped(topRfPrize.amountUnits)}`
    : 'No major prizes left';
  const topPrizeIdentity = topFriendPrize
    ? nftIdentityLine({
        collectionName: topFriendPrize.collectionName,
        collectionType: topFriendPrize.collectionType,
        tokenId: topFriendPrize.tokenId.toString(),
      })
    : null;

  return (
    <div
      className={`cabinet-container cabinet-shell-${machine.shellId.toLowerCase()}`}
      style={{ userSelect: 'none' }}
    >
      {/* Marquee Banner */}
      <div className="cabinet-header">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <PixelIcon name="machine" size={16} color="#ffffff" />
          <span style={{ fontSize: '13px', letterSpacing: '1px' }}>{machine.name}</span>
        </div>
        <div
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-lcd)',
            marginTop: '4px',
            color: '#cccccc',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '0 4px',
          }}
        >
          <span>OPERATOR: {machine.creatorAddress.slice(0, 10)}...</span>
          <span style={{ color: '#ffffff' }}>
            <MachineTypeBadge machineType={machine.machineType} />
          </span>
        </div>
        <div
          style={{
            fontSize: '9px',
            fontFamily: 'var(--font-lcd)',
            marginTop: '4px',
            color: '#cccccc',
            display: 'flex',
            justifyContent: 'space-between',
            padding: '0 4px',
          }}
        >
          <span>SHELL: {machine.shellId}</span>
        </div>
      </div>

      {/* Screen Bezel & LCD Screen */}
      <div className="cabinet-screen-bezel">
        <div className="cabinet-lcd-screen pull-stage">
          {/* Status Header inside LCD */}
          <div
            style={{
              position: 'absolute',
              top: '6px',
              left: '8px',
              right: '8px',
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-lcd)',
              fontSize: '10px',
              borderBottom: '1px dashed var(--color-gray-mid)',
              paddingBottom: '4px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {isSoldOut ? (
                <span style={{ background: '#000', color: '#fff', padding: '1px 4px' }}>
                  SOLD OUT
                </span>
              ) : isCancelled ? (
                <span style={{ background: '#000', color: '#fff', padding: '1px 4px' }}>
                  CANCELLED
                </span>
              ) : (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <span
                    className={isPulling ? '' : 'anim-blink'}
                    style={{
                      width: '6px',
                      height: '6px',
                      background: '#000',
                      display: 'inline-block',
                    }}
                  />
                  {machine.status}
                </span>
              )}
            </span>

            <span>
              {isFixed ? (
                <>PULLS MADE: {machine.pullCount}</>
              ) : (
                <>
                  PULLS: {machine.remainingPulls} / {machine.totalPulls}
                </>
              )}
            </span>
          </div>

          {/* LCD Center Display: Mascot or Pull Ritual or Reveal */}
          <div className="pull-stage-body" style={{ margin: '24px 0 12px', textAlign: 'center', width: '100%' }}>
            {pullResult && !isPulling ? (
              <PrizeReveal result={pullResult} shellId={machine.shellId} />
            ) : isPulling ? (
              <div>
                <PixelPullAnimation
                  shell={shellToAnimated(machine.shellId)}
                  active={isPulling}
                  runId={pullRunId}
                  resultKind={pullResultKind}
                  reducedMotion={reducedMotion}
                  onComplete={() => onPullAnimationComplete?.()}
                />
                <div style={{ fontFamily: 'var(--font-lcd)', fontSize: '9px', marginTop: '6px' }} aria-hidden="true">
                  {pullFx.caption}
                </div>
                <div className="sr-only" aria-live="polite">
                  Pull in progress.
                </div>
              </div>
            ) : isSoldOut ? (
              <div>
                <PixelIcon name="soldout" size={40} />
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '12px', marginTop: '8px' }}>
                  MACHINE SOLD OUT
                </div>
                <div style={{ fontFamily: 'var(--font-lcd)', fontSize: '9px', color: '#555', marginTop: '4px' }}>
                  {isFixed ? (
                    <>
                      ALL PRIZES CLAIMED IN {machine.pullCount} PULLS
                      {realized ? (
                        <>
                          <br />
                          REALIZED PAYOUT: {(realized.ratioBps / 100).toFixed(2)}%
                        </>
                      ) : null}
                    </>
                  ) : (
                    <>All {machine.totalPulls} tickets claimed!</>
                  )}
                </div>
              </div>
            ) : (
              <div>
                {topVisual.kind === 'nft' ? (
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <FriendPrizeVisual
                      name={topVisual.entry.name}
                      imageUrl={topVisual.entry.displayImageUrl || topVisual.entry.imageUrl}
                      openseaUrl={topVisual.entry.openseaUrl}
                      collectionName={topVisual.entry.collectionName}
                      tokenId={topVisual.entry.tokenId.toString()}
                      spriteRows={topVisual.entry.spriteRows}
                      origin={topVisual.entry.origin}
                      size={112}
                    />
                  </div>
                ) : topVisual.kind === 'rf' ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <RfTokenIcon size={112} />
                    <div
                      style={{
                        marginTop: '6px',
                        display: 'inline-block',
                        background: 'var(--color-black)',
                        color: 'var(--color-white)',
                        fontSize: '8px',
                        fontFamily: 'var(--font-lcd)',
                        padding: '2px 6px',
                      }}
                    >
                      TOP CHASE
                    </div>
                  </div>
                ) : (
                  <RareFriendSprite tokenId={machine.mascotTokenId} scale={4} />
                )}
                <div
                  style={{
                    fontFamily: 'var(--font-lcd)',
                    fontSize: '10px',
                    marginTop: '8px',
                    fontWeight: 'bold',
                  }}
                >
                  TOP PRIZE:
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 'bold' }}>
                  {topPrizeLabel}
                </div>
                {topPrizeIdentity && (
                  <div style={{ fontFamily: 'var(--font-lcd)', fontSize: '8px', color: '#555', marginTop: '2px' }}>
                    {topPrizeIdentity}
                  </div>
                )}
                {isFixed && (
                  <div style={{ fontFamily: 'var(--font-lcd)', fontSize: '8px', color: '#555', marginTop: '2px' }}>
                    PRIZES: {prizes.remaining} / {prizes.initial} • NO PLAY CAP
                  </div>
                )}
              </div>
            )}
          </div>

          {/* LCD Bottom Stats Grid */}
          <div
            style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '4px',
              borderTop: '1px dashed var(--color-gray-mid)',
              paddingTop: '6px',
              fontFamily: 'var(--font-lcd)',
              fontSize: '9px',
              textAlign: 'center',
            }}
          >
            <div>
              <div style={{ color: '#666' }}>COST</div>
              <div style={{ fontWeight: 'bold', fontSize: '10px' }}>
                {formatRFGrouped(machine.pullPriceUnits)}
              </div>
            </div>
            <div>
              <div style={{ color: '#666' }}>{isFixed ? 'AVAIL RTP' : 'LIVE RTP'}</div>
              <div style={{ fontWeight: 'bold', fontSize: '10px' }}>
                {formatBps(displayRtpBps(machine))}
              </div>
            </div>
            <div>
              <div style={{ color: '#666' }}>BURN</div>
              <div style={{ fontWeight: 'bold', fontSize: '10px' }}>
                5% FIXED
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Physical Control Panel */}
      <div className="cabinet-controls">
        {/* Token Insert / Burn Split Visual */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--color-white)',
            border: '2px solid var(--color-black)',
            padding: '6px 10px',
            marginBottom: '10px',
            fontSize: '10px',
            fontFamily: 'var(--font-lcd)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <RfTokenIcon size={20} decorative />
            <span>95% TO OPERATOR</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
            <RfBurnVisual size={20} compact />
            <span>5% RF BURN</span>
          </div>
        </div>

        {/* Primary Tactile Pull Button */}
        <button
          type="button"
          className="pixel-btn pixel-btn-primary"
          style={{
            width: '100%',
            padding: '14px',
            fontSize: '13px',
            display: 'flex',
            justifyContent: 'center',
          }}
          onClick={onPull}
          disabled={!canPull || isPulling || isSoldOut || isCancelled}
          aria-live="polite"
        >
          {isPulling ? (
            <span>PULLING...</span>
          ) : isSoldOut ? (
            <span>SOLD OUT</span>
          ) : isCancelled ? (
            <span>CANCELLED</span>
          ) : (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <PixelIcon name="pull" size={16} color="#ffffff" />
              PULL — {formatRFGrouped(machine.pullPriceUnits)}
            </span>
          )}
        </button>

        {pullDisabledReason && !isSoldOut && !isCancelled && (
          <div
            style={{
              color: 'var(--color-black)',
              fontSize: '10px',
              fontFamily: 'var(--font-lcd)',
              marginTop: '6px',
              textAlign: 'center',
              fontWeight: 'bold',
            }}
          >
            ! {pullDisabledReason}
          </div>
        )}

        {/* Secondary Action Buttons */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr',
            gap: '6px',
            marginTop: '10px',
          }}
        >
          <button
            type="button"
            className="pixel-btn pixel-btn-sm"
            onClick={onOpenOdds}
            title="View exact live odds"
          >
            <PixelIcon name="odds" size={12} />
            ODDS
          </button>
          <button
            type="button"
            className="pixel-btn pixel-btn-sm"
            onClick={onOpenPrizes}
            title="Inspect entire prize pool"
          >
            <PixelIcon name="prize" size={12} />
            PRIZES
          </button>
          <button
            type="button"
            className="pixel-btn pixel-btn-sm"
            onClick={onOpenRules}
            title="Inspect machine rules & lock status"
          >
            <PixelIcon name="lock" size={12} />
            RULES
          </button>
        </div>
      </div>

      {/* Prize Hatch */}
      <div className="cabinet-hatch">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <div style={{ width: '30px', height: '3px', background: '#555' }} />
          <span>PRIZE HATCH</span>
          <div style={{ width: '30px', height: '3px', background: '#555' }} />
        </div>
      </div>
    </div>
  );
};
