import React, { useMemo, useState } from 'react';
import type { PrizeEntry } from '../../domain/types.ts';
import {
  simulateFixedOddsLifetime,
  fixedOddsInventoryTotals,
} from '../../domain/fixedOdds.ts';
import { formatRFGrouped } from '../../domain/rf.ts';
import { PixelIcon } from '../ui/PixelIcon.tsx';

interface FixedOddsRiskModelProps {
  prizes: PrizeEntry[];
  pullPriceUnits: bigint;
  /** Monte Carlo runs; kept modest so mobile never freezes. */
  runs?: number;
}

/**
 * Creator RISK MODEL for Fixed Odds (behind a toggle; computed lazily and
 * memoized so typing odds never re-runs the simulation per keystroke).
 * All figures are SIMULATED ESTIMATES, never guarantees.
 */
export const FixedOddsRiskModel: React.FC<FixedOddsRiskModelProps> = ({
  prizes,
  pullPriceUnits,
  runs = 600,
}) => {
  const [open, setOpen] = useState(false);

  const report = useMemo(() => {
    if (!open) return null;
    const lines = prizes
      .filter(
        (e): e is Extract<typeof e, { type: 'RF_PRIZE' | 'FRIEND_PRIZE' }> =>
          (e.type === 'RF_PRIZE' || e.type === 'FRIEND_PRIZE') &&
          e.initialQuantity > 0 &&
          (e.oddsPpm ?? 0) > 0
      )
      .map((e) => ({
        prizeEntryId: e.id,
        oddsPpm: e.oddsPpm ?? 0,
        quantity: e.initialQuantity,
        referenceValueUnits: e.type === 'RF_PRIZE' ? e.amountUnits : e.referenceValueUnits,
      }));
    if (lines.length === 0 || pullPriceUnits <= 0n) return null;
    // Seed from prize ids so each draft gets a stable, distinct run.
    let seed = 11;
    const sig = lines.map((l) => l.prizeEntryId).join('|');
    for (let i = 0; i < sig.length; i++) {
      seed = (seed * 31 + sig.charCodeAt(i)) >>> 0;
    }
    return simulateFixedOddsLifetime({ lines, pullPriceUnits, runs, seed });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prizes, pullPriceUnits.toString(), runs]);

  const totals = fixedOddsInventoryTotals(prizes, false);

  return (
    <div className="workshop-tray">
      <div className="workshop-tray-label">
        <PixelIcon name="stats" size={12} color="#ffffff" />
        RISK MODEL — SIMULATED ESTIMATES, NOT GUARANTEES
      </div>
      <div className="workshop-tray-body">
        <div style={{ fontSize: '10px', color: '#555', marginBottom: '8px' }}>
          Fixed Odds cannot promise when prizes sell out — a jackpot can hit on
          pull #1 or take thousands of pulls. This model runs {runs} seeded
          simulated lifetimes over your current prizes.
        </div>
        <button
          type="button"
          className="pixel-btn pixel-btn-sm"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'HIDE RISK MODEL' : 'VIEW RISK MODEL'}
        </button>
        {open && !report && (
          <div style={{ fontSize: '10px', marginTop: '8px' }}>
            Add at least one prize with valid odds to model risk.
          </div>
        )}
        {open && report && (
          <div style={{ marginTop: '10px', fontSize: '11px' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '8px',
                marginBottom: '10px',
              }}
            >
              <div className="workshop-lcd-tile">
                <div className="workshop-lcd-caption">MEDIAN PULLS TO SELLOUT</div>
                <div className="workshop-lcd-value">
                  {report.pullsToSellout.median.toLocaleString('en-US')}
                </div>
              </div>
              <div className="workshop-lcd-tile">
                <div className="workshop-lcd-caption">P25 / P75 PULLS</div>
                <div className="workshop-lcd-value">
                  {report.pullsToSellout.p25.toLocaleString('en-US')} /{' '}
                  {report.pullsToSellout.p75.toLocaleString('en-US')}
                </div>
              </div>
              <div className="workshop-lcd-tile">
                <div className="workshop-lcd-caption">MEDIAN RF VOLUME</div>
                <div className="workshop-lcd-value">{formatRFGrouped(report.medianVolumeUnits)}</div>
              </div>
              <div className="workshop-lcd-tile">
                <div className="workshop-lcd-caption">MEDIAN RF BURN (5%)</div>
                <div className="workshop-lcd-value">{formatRFGrouped(report.medianBurnUnits)}</div>
              </div>
              <div className="workshop-lcd-tile">
                <div className="workshop-lcd-caption">MEDIAN CREATOR RECEIPTS</div>
                <div className="workshop-lcd-value">{formatRFGrouped(report.medianReceiptsUnits)}</div>
              </div>
              <div className="workshop-lcd-tile">
                <div className="workshop-lcd-caption">MEDIAN REFERENCE-VALUE NET</div>
                <div className="workshop-lcd-value">{formatRFGrouped(report.medianNetUnits)}</div>
              </div>
            </div>
            <div style={{ fontSize: '10px', lineHeight: '1.6' }}>
              <div>
                <strong>EARLY-SELLOUT SCENARIO</strong> (unlucky 10%): creator
                reference-value net {formatRFGrouped(report.earlyNetUnits)}.
              </div>
              <div>
                <strong>LONG-TAIL SCENARIO</strong> (slow 10%): sellout at{' '}
                {report.longTailPulls.toLocaleString('en-US')} pulls.
              </div>
              <div>
                <strong>EXPECTED RANGE:</strong> most simulated lifetimes end between{' '}
                {report.pullsToSellout.p25.toLocaleString('en-US')} and{' '}
                {report.pullsToSellout.p75.toLocaleString('en-US')} pulls across{' '}
                {totals.initial} seeded prizes.
                {report.censoredRuns > 0 && (
                  <> ({report.censoredRuns} run(s) hit the simulation cap — tail is longer.)</>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
