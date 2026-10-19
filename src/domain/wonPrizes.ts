// wonPrizes.ts
//
// Derives what a player has actually won, for the MY PRIZES showcase.
//
// NFTs come from `inventory.wonFriends`.
//
// Cashback wins are NOT stored separately: a cashback prize is credited
// straight into the matching balance (USDG into USDG, RF into RF), so the only
// record of "I won cashback from this machine" is the pull history. This
// selector recovers those wins and folds them per machine + currency — the
// same coin presentation a machine shows for a cashback top prize.
//
// Presentation only: this never affects balances, odds, or settlement.

import type { PlayerInventory } from './types.ts';

export type CashbackCurrency = 'USDG' | 'RF';

export interface WonCashbackPrize {
  machineId: string;
  machineName: string;
  /** Which balance the win was credited into. */
  currency: CashbackCurrency;
  /**
   * Total won from this machine across all recorded pulls, in the units of
   * `currency` — USDG base units for USDG, RF units for RF. Never mix them.
   */
  totalUnits: bigint;
  /** Number of separate cashback wins from this machine. */
  wins: number;
  /** Most recent win, for ordering the showcase. */
  lastWonAt: number;
}

/** @deprecated Use WonCashbackPrize. */
export type WonRfPrize = WonCashbackPrize;

/**
 * Cashback wins grouped by machine and currency, newest machine first, then
 * largest total. Pull history is newest-first, so the first sighting of a
 * machine is already its most recent win.
 */
export function selectWonCashbackPrizes(
  inventory: Pick<PlayerInventory, 'pullHistory'>
): WonCashbackPrize[] {
  const byKey = new Map<string, WonCashbackPrize>();

  for (const entry of inventory.pullHistory) {
    const currency: CashbackCurrency | null =
      entry.result.prizeType === 'USDG_PRIZE'
        ? 'USDG'
        : entry.result.prizeType === 'RF_PRIZE'
          ? 'RF'
          : null;
    if (!currency) continue;

    // A zero-value win is not a prize worth showcasing.
    const won =
      currency === 'USDG' ? (entry.result.usdgWonUnits ?? 0n) : entry.result.rfWonUnits;
    if (won <= 0n) continue;

    const key = `${entry.machineId}::${currency}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.totalUnits += won;
      existing.wins += 1;
      continue;
    }

    byKey.set(key, {
      machineId: entry.machineId,
      machineName: entry.machineName,
      currency,
      totalUnits: won,
      wins: 1,
      lastWonAt: entry.timestamp,
    });
  }

  return [...byKey.values()].sort(
    (a, b) => b.lastWonAt - a.lastWonAt || Number(b.totalUnits - a.totalUnits)
  );
}

/** Total cashback won from machines, per currency, in that currency's units. */
export function totalWonCashbackUnits(
  inventory: Pick<PlayerInventory, 'pullHistory'>
): { usdg: bigint; rf: bigint } {
  let usdg = 0n;
  let rf = 0n;
  for (const prize of selectWonCashbackPrizes(inventory)) {
    if (prize.currency === 'USDG') usdg += prize.totalUnits;
    else rf += prize.totalUnits;
  }
  return { usdg, rf };
}

/** @deprecated Use selectWonCashbackPrizes. */
export const selectWonRfPrizes = selectWonCashbackPrizes;

/** @deprecated Use totalWonCashbackUnits. */
export function totalWonRfUnits(
  inventory: Pick<PlayerInventory, 'pullHistory'>
): bigint {
  return totalWonCashbackUnits(inventory).rf;
}