import { isFixedOddsMachine, type Machine } from '../../domain/types.ts';
import { countTotalPrizeItems } from '../../domain/economics.ts';
import { fixedOddsInventoryTotals } from '../../domain/fixedOdds.ts';

/**
 * Shared display selectors so views don't litter `machineType` branches.
 * Model-specific panels (odds tables, transparency stats) still branch —
 * these cover only the readouts both models share.
 */

/** Primary RTP for shared displays: live RTP, or live available RTP. */
export function displayRtpBps(machine: Machine): number {
  return isFixedOddsMachine(machine)
    ? machine.liveAvailableRtpBps
    : machine.currentRtpBps;
}

/** "42 / 100" ticket counter for Finite Deck; null for Fixed Odds (no cap). */
export function ticketCounter(machine: Machine): string | null {
  if (isFixedOddsMachine(machine)) return null;
  return `${machine.remainingPulls} / ${machine.totalPulls}`;
}

/** Prize inventory remaining/initial (both models, NO_PRIZE excluded). */
export function prizesRemaining(machine: Machine): { remaining: number; initial: number } {
  if (isFixedOddsMachine(machine)) {
    return fixedOddsInventoryTotals(machine.remainingPrizes, true);
  }
  return {
    remaining: countTotalPrizeItems(machine.remainingPrizes, true),
    initial: countTotalPrizeItems(machine.initialPrizes, false),
  };
}
