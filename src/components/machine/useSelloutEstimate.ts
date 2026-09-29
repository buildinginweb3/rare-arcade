import { useMemo } from 'react';
import { isFixedOddsMachine, type Machine } from '../../domain/types.ts';
import {
  simulateFixedOddsLifetime,
  fixedOddsInventoryTotals,
} from '../../domain/fixedOdds.ts';

export interface SelloutEstimate {
  /** "1,800 – 3,400 PULLS (MODELED)" style range label. */
  rangeLabel: string;
  medianPulls: number;
  p25Pulls: number;
  p75Pulls: number;
  censoredRuns: number;
}

/**
 * Lazily computed Monte Carlo sellout estimate for Fixed Odds machines,
 * memoized on remaining inventory + pull price. Returns null for Finite
 * Deck (exact ticket count) and sold-out machines. Callers render it only
 * where an estimate is wanted, so idle views never pay for simulation.
 */
export function useSelloutEstimate(
  machine: Machine | null | undefined,
  runs = 400
): SelloutEstimate | null {
  const signature = useMemo(() => {
    if (!machine || !isFixedOddsMachine(machine)) return null;
    const totals = fixedOddsInventoryTotals(machine.remainingPrizes, true);
    if (totals.remaining <= 0) return null;
    const lines = machine.remainingPrizes
      .filter(
        (e): e is Extract<typeof e, { type: 'RF_PRIZE' | 'FRIEND_PRIZE' }> =>
          (e.type === 'RF_PRIZE' || e.type === 'FRIEND_PRIZE') && e.remainingQuantity > 0
      )
      .map((e) => ({
        prizeEntryId: e.id,
        oddsPpm: e.oddsPpm ?? 0,
        quantity: e.remainingQuantity,
        referenceValueUnits: (
          e.type === 'RF_PRIZE' ? e.amountUnits : e.referenceValueUnits
        ).toString(),
      }));
    return JSON.stringify({
      id: machine.id,
      pulls: machine.pullCount,
      price: machine.pullPriceUnits.toString(),
      lines,
      runs,
    });
  }, [machine, runs]);

  return useMemo(() => {
    if (!signature) return null;
    const parsed = JSON.parse(signature) as {
      id: string;
      lines: {
        prizeEntryId: string;
        oddsPpm: number;
        quantity: number;
        referenceValueUnits: string;
      }[];
      price: string;
      runs: number;
    };
    // Seed from machine id hash so each machine gets a stable, distinct run.
    let seed = 7;
    for (let i = 0; i < parsed.id.length; i++) {
      seed = (seed * 31 + parsed.id.charCodeAt(i)) >>> 0;
    }
    const report = simulateFixedOddsLifetime({
      lines: parsed.lines.map((l) => ({
        ...l,
        referenceValueUnits: BigInt(l.referenceValueUnits),
      })),
      pullPriceUnits: BigInt(parsed.price),
      runs: parsed.runs,
      seed,
    });
    const fmt = (n: number) => n.toLocaleString('en-US');
    return {
      rangeLabel: `${fmt(report.pullsToSellout.p25)} – ${fmt(report.pullsToSellout.p75)} PULLS (MODELED)`,
      medianPulls: report.pullsToSellout.median,
      p25Pulls: report.pullsToSellout.p25,
      p75Pulls: report.pullsToSellout.p75,
      censoredRuns: report.censoredRuns,
    };
  }, [signature]);
}
