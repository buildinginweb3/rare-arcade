// wonPrizes.ts
//
// Derives what a player has actually won, for the MY PRIZES showcase.
//
// NFTs come from `inventory.wonFriends`. $RF token wins are NOT stored
// separately: an RF prize is credited straight into the balance, so the
// only record of "I won tokens from this machine" is the pull history.
// This selector recovers those wins and folds them per machine, which
// is the same token-with-amount presentation a machine shows when its
// top prize is $RF rather than a collectible.
//
// Presentation only: this never affects balances, odds, or settlement.

import type { PlayerInventory } from './types.ts';

export interface WonRfPrize {
  machineId: string;
  machineName: string;
  /** Total $RF won from this machine across all recorded pulls. */
  totalUnits: bigint;
  /** Number of separate RF wins from this machine. */
  wins: number;
  /** Most recent win, for ordering the showcase. */
  lastWonAt: number;
}

/**
 * $RF wins grouped by machine, newest machine first, then largest
 * total. Pull history is newest-first, so the first sighting of a
 * machine is already its most recent win.
 */
export function selectWonRfPrizes(
  inventory: Pick<PlayerInventory, 'pullHistory'>
): WonRfPrize[] {
  const byMachine = new Map<string, WonRfPrize>();

  for (const entry of inventory.pullHistory) {
    if (entry.result.prizeType !== 'RF_PRIZE') continue;
    // A zero-value win is not a prize worth showcasing.
    if (entry.result.rfWonUnits <= 0n) continue;

    const existing = byMachine.get(entry.machineId);
    if (existing) {
      existing.totalUnits += entry.result.rfWonUnits;
      existing.wins += 1;
      continue;
    }

    byMachine.set(entry.machineId, {
      machineId: entry.machineId,
      machineName: entry.machineName,
      totalUnits: entry.result.rfWonUnits,
      wins: 1,
      lastWonAt: entry.timestamp,
    });
  }

  return [...byMachine.values()].sort(
    (a, b) => b.lastWonAt - a.lastWonAt || Number(b.totalUnits - a.totalUnits)
  );
}

/** Total $RF won from machines, across every recorded pull. */
export function totalWonRfUnits(
  inventory: Pick<PlayerInventory, 'pullHistory'>
): bigint {
  return selectWonRfPrizes(inventory).reduce(
    (sum, prize) => sum + prize.totalUnits,
    0n
  );
}
