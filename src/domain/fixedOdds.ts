/**
 * Fixed Odds engine (fixedOddsEngine).
 *
 * A Fixed Odds machine has NO ticket deck and NO play cap. Every pull rolls
 * fresh independent randomness against IMMUTABLE per-prize probabilities
 * (parts-per-million). Sold-out prize slots become empty outcomes — other
 * prize odds never change.
 *
 * Shared accounting (5% burn / 95% receipts, bigint RF math, ledger shape)
 * reuses rf.ts + economics.ts. All probability math is integer ppm.
 */

import { BPS_DIVISOR, mulBps, calculatePullSplit } from './rf.ts';
import { calculateRtpBps, calculateTotalPrizeValue } from './economics.ts';
import { createSeedableRng, type RngFunction, defaultCryptoRng } from './deck.ts';
import { TECHNICAL_MAX_RTP_BPS } from './rtp.ts';
import type {
  FixedOddsMachine,
  LedgerEvent,
  MachineShellId,
  PrizeEntry,
  PullResult,
  RareFriendMetadata,
  RFPrizeEntry,
  FriendPrizeEntry,
  Ticket,
} from './types.ts';

/** 1,000,000 parts-per-million = 100%. Supports 0.0001% granularity. */
export const PPM_SCALE = 1_000_000;
/** Maximum total configured prize probability (100%). */
export const MAX_TOTAL_ODDS_PPM = 1_000_000;

/**
 * Parse a human percentage string (e.g. "0.25", "2.5%", "0.125") into ppm.
 * Supports up to 4 decimals (0.0001% = 1 ppm). Throws on invalid input.
 */
export function parseOddsPercentToPpm(input: string): number {
  const cleaned = input.trim().replace(/%$/, '').trim();
  if (!cleaned) throw new Error('Odds cannot be blank.');
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) {
    throw new Error(`Invalid odds percentage: "${input}". Use a number like 0.25 (decimals up to 4 places).`);
  }
  const pct = Number(cleaned);
  if (!Number.isFinite(pct) || pct <= 0) {
    throw new Error('Odds must be a positive finite percentage.');
  }
  const ppm = Math.round(pct * 10000);
  if (ppm <= 0) throw new Error('Odds must be greater than 0%.');
  if (ppm > MAX_TOTAL_ODDS_PPM) {
    throw new Error('A single prize cannot exceed 100%.');
  }
  return ppm;
}

/**
 * Format integer ppm as a faithful percentage string (never rounds away
 * precision silently): 5000 -> "0.5%", 1250 -> "0.125%", 20000 -> "2%".
 */
export function formatOddsPpm(ppm: number): string {
  if (!Number.isInteger(ppm) || ppm < 0 || ppm > MAX_TOTAL_ODDS_PPM) {
    throw new RangeError(`Invalid odds ppm: ${ppm}`);
  }
  const whole = Math.floor(ppm / 10000);
  const frac = ppm % 10000;
  if (frac === 0) return `${whole}%`;
  const fracStr = String(frac).padStart(4, '0').replace(/0+$/, '');
  return `${whole}.${fracStr}%`;
}

/** Reference value (per unit) of a prize entry. */
function unitReferenceValue(entry: RFPrizeEntry | FriendPrizeEntry): bigint {
  return entry.type === 'RF_PRIZE' ? entry.amountUnits : entry.referenceValueUnits;
}

/** Stable identity key for NFT duplicate detection (mirrors deck.ts). */
function friendIdentityKey(entry: FriendPrizeEntry): string {
  return entry.chainId && entry.contractAddress
    ? `${entry.chainId}:${entry.contractAddress.toLowerCase()}:${entry.tokenId.toString()}`
    : `legacy:${entry.tokenId.toString()}`;
}

/**
 * Validate Fixed Odds prize configuration. Returns total + no-prize ppm.
 * Throws on: empty pool, NO_PRIZE entries, non-positive/non-integer odds,
 * NFT quantity !== 1, duplicate NFT identity, or total > 100%.
 */
export function validateFixedOddsPrizes(entries: readonly PrizeEntry[]): {
  totalPpm: number;
  noPrizePpm: number;
} {
  const lines = entries.filter(
    (e): e is RFPrizeEntry | FriendPrizeEntry =>
      e.type === 'RF_PRIZE' || e.type === 'FRIEND_PRIZE'
  );
  if (lines.length === 0) {
    throw new Error('Fixed Odds machine must contain at least one RF or Rare Friend prize.');
  }
  if (entries.some((e) => e.type === 'NO_PRIZE')) {
    throw new Error('Fixed Odds machines derive no-prize odds automatically — do not add NO_PRIZE entries.');
  }

  const seenFriends = new Set<string>();
  let totalPpm = 0;
  for (const entry of lines) {
    const ppm = entry.oddsPpm;
    if (ppm === undefined || !Number.isInteger(ppm) || ppm < 1 || ppm > MAX_TOTAL_ODDS_PPM) {
      throw new Error(`Prize "${entry.id}" needs a valid fixed odds value (0.0001% – 100%).`);
    }
    if (!Number.isInteger(entry.initialQuantity) || entry.initialQuantity < 1) {
      throw new Error(`Prize "${entry.id}" needs quantity of at least 1.`);
    }
    if (entry.type === 'FRIEND_PRIZE') {
      if (entry.initialQuantity !== 1) {
        throw new Error(`NFT prize "${entry.name}" must have quantity exactly 1 (unique token identity).`);
      }
      const key = friendIdentityKey(entry);
      if (seenFriends.has(key)) {
        throw new Error(`Duplicate unique Rare Friend prize detected: ${key}`);
      }
      seenFriends.add(key);
      if (entry.referenceValueUnits <= 0n) {
        throw new Error(`NFT prize "${entry.name}" needs a positive reference value.`);
      }
    } else if (entry.amountUnits <= 0n) {
      throw new Error('RF prize amount must be > 0.');
    }
    totalPpm += ppm;
  }

  if (totalPpm > MAX_TOTAL_ODDS_PPM) {
    const over = formatOddsPpm(totalPpm - MAX_TOTAL_ODDS_PPM);
    throw new Error(`PRIZE ODDS EXCEED 100% by ${over}. Lower prize odds so the total fits.`);
  }
  return { totalPpm, noPrizePpm: MAX_TOTAL_ODDS_PPM - totalPpm };
}

export interface FixedOddsInterval {
  prizeEntryId: string;
  startPpm: number; // inclusive
  endPpm: number; // exclusive
}

/**
 * Build cumulative probability intervals, sorted by entry id so UI prize-row
 * order can NEVER alter the distribution.
 */
export function buildFixedOddsIntervals(
  entries: readonly PrizeEntry[]
): FixedOddsInterval[] {
  const lines = entries
    .filter(
      (e): e is RFPrizeEntry | FriendPrizeEntry =>
        (e.type === 'RF_PRIZE' || e.type === 'FRIEND_PRIZE') &&
        (e.oddsPpm ?? 0) > 0
    )
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const intervals: FixedOddsInterval[] = [];
  let cursor = 0;
  for (const entry of lines) {
    const width = entry.oddsPpm!;
    intervals.push({ prizeEntryId: entry.id, startPpm: cursor, endPpm: cursor + width });
    cursor += width;
  }
  return intervals;
}

/**
 * Resolve one independent roll in [0, 1) to a prize entry id, or null for
 * no-prize. Entries with zero remaining resolve as MISS (empty outcome) —
 * intervals are never rebuilt, so configured odds stay exactly fixed.
 */
export function resolveFixedOddsRoll(
  intervals: readonly FixedOddsInterval[],
  remainingById: ReadonlyMap<string, number>,
  roll01: number
): string | null {
  const clamped = roll01 >= 1 ? 0.999999999 : roll01 < 0 || !Number.isFinite(roll01) ? 0 : roll01;
  const ppm = Math.floor(clamped * PPM_SCALE);
  for (const iv of intervals) {
    if (ppm >= iv.startPpm && ppm < iv.endPpm) {
      return (remainingById.get(iv.prizeEntryId) ?? 0) > 0 ? iv.prizeEntryId : null;
    }
  }
  return null;
}

/**
 * RTP in BPS from explicit (reference value × odds) lines. Exact bigint EV:
 * EV = Σ(ref × ppm) / 1e6, RTP = EV × 10000 / pullPrice.
 */
export function fixedOddsRtpBps(
  lines: ReadonlyArray<{ referenceValueUnits: bigint; oddsPpm: number }>,
  pullPriceUnits: bigint
): number {
  if (pullPriceUnits <= 0n) return 0;
  let numerator = 0n;
  for (const line of lines) {
    numerator += line.referenceValueUnits * BigInt(line.oddsPpm);
  }
  const evUnits = numerator / BigInt(PPM_SCALE);
  return calculateRtpBps(evUnits, pullPriceUnits);
}

/** Configured RTP: original probability/value profile over ALL prize lines. */
export function calculateConfiguredRtpBps(
  entries: readonly PrizeEntry[],
  pullPriceUnits: bigint
): number {
  const lines = entries
    .filter(
      (e): e is RFPrizeEntry | FriendPrizeEntry =>
        e.type === 'RF_PRIZE' || e.type === 'FRIEND_PRIZE'
    )
    .map((e) => ({ referenceValueUnits: unitReferenceValue(e), oddsPpm: e.oddsPpm ?? 0 }));
  return fixedOddsRtpBps(lines, pullPriceUnits);
}

/**
 * Live Available RTP: expected return from prizes STILL available
 * (remainingQuantity > 0). Decreases as prizes sell out — that is inventory
 * depletion, NOT odds changing.
 */
export function calculateLiveAvailableRtpBps(
  remainingPrizes: readonly PrizeEntry[],
  pullPriceUnits: bigint
): number {
  const lines = remainingPrizes
    .filter(
      (e): e is RFPrizeEntry | FriendPrizeEntry =>
        (e.type === 'RF_PRIZE' || e.type === 'FRIEND_PRIZE') && e.remainingQuantity > 0
    )
    .map((e) => ({ referenceValueUnits: unitReferenceValue(e), oddsPpm: e.oddsPpm ?? 0 }));
  return fixedOddsRtpBps(lines, pullPriceUnits);
}

/** Creator edge in BPS: 9500 (post-burn receipts) minus RTP. May be negative. */
export function calculateCreatorEdgeBps(rtpBps: number): number {
  return 9500 - rtpBps;
}

/** Base no-prize ppm (remainder at publish, never changes). */
export function baseNoPrizePpm(entries: readonly PrizeEntry[]): number {
  let total = 0;
  for (const e of entries) {
    if (e.type === 'RF_PRIZE' || e.type === 'FRIEND_PRIZE') total += e.oddsPpm ?? 0;
  }
  return Math.max(0, MAX_TOTAL_ODDS_PPM - total);
}

/** Sold-out slots' ppm — currently empty outcomes on top of the base miss. */
export function soldOutSlotPpm(entries: readonly PrizeEntry[]): number {
  let soldOut = 0;
  for (const e of entries) {
    if (
      (e.type === 'RF_PRIZE' || e.type === 'FRIEND_PRIZE') &&
      e.remainingQuantity <= 0
    ) {
      soldOut += e.oddsPpm ?? 0;
    }
  }
  return soldOut;
}

/** Effective no-prize ppm = base remainder + sold-out slots. */
export function effectiveNoPrizePpm(entries: readonly PrizeEntry[]): number {
  return baseNoPrizePpm(entries) + soldOutSlotPpm(entries);
}

/** Prize inventory totals (RF + Friend items; NO_PRIZE never stored for fixed odds). */
export function fixedOddsInventoryTotals(
  entries: readonly PrizeEntry[],
  useRemaining: boolean
): { initial: number; remaining: number } {
  let initial = 0;
  let remaining = 0;
  for (const e of entries) {
    if (e.type !== 'RF_PRIZE' && e.type !== 'FRIEND_PRIZE') continue;
    initial += e.initialQuantity;
    remaining += useRemaining ? e.remainingQuantity : e.initialQuantity;
  }
  return { initial, remaining };
}

/** True when every real prize is gone (sellout condition). */
export function isFixedOddsInventoryEmpty(entries: readonly PrizeEntry[]): boolean {
  return fixedOddsInventoryTotals(entries, true).remaining <= 0;
}

export interface FixedOddsRow {
  prizeEntryId: string;
  type: 'RF_PRIZE' | 'FRIEND_PRIZE';
  label: string;
  detail: string;
  oddsPpm: number;
  oddsPct: string;
  remainingQuantity: number;
  initialQuantity: number;
  soldOut: boolean;
  referenceValueUnits: bigint;
}

export interface FixedOddsTable {
  rows: FixedOddsRow[];
  totalConfiguredPpm: number;
  baseNoPrizePpm: number;
  soldOutSlotPpm: number;
  effectiveNoPrizePpm: number;
  effectiveNoPrizePct: string;
  configuredRtpBps: number;
  liveAvailableRtpBps: number;
  creatorEdgeBps: number;
  prizesRemaining: number;
  prizesInitial: number;
}

/** Full player-facing prize table for a Fixed Odds machine. */
export function getFixedOddsTable(machine: FixedOddsMachine): FixedOddsTable {
  const rows: FixedOddsRow[] = [];
  for (const entry of machine.remainingPrizes) {
    if (entry.type !== 'RF_PRIZE' && entry.type !== 'FRIEND_PRIZE') continue;
    const ppm = entry.oddsPpm ?? 0;
    rows.push({
      prizeEntryId: entry.id,
      type: entry.type,
      label:
        entry.type === 'RF_PRIZE'
          ? `${entry.amountUnits / 1000n} RF`
          : entry.name,
      detail:
        entry.type === 'RF_PRIZE'
          ? 'Simulated Token Reward'
          : `${entry.familyName} (Gen ${entry.generation})`,
      oddsPpm: ppm,
      oddsPct: formatOddsPpm(ppm),
      remainingQuantity: entry.remainingQuantity,
      initialQuantity: entry.initialQuantity,
      soldOut: entry.remainingQuantity <= 0,
      referenceValueUnits: unitReferenceValue(entry),
    });
  }
  rows.sort((a, b) => (a.prizeEntryId < b.prizeEntryId ? -1 : 1));
  const totals = fixedOddsInventoryTotals(machine.remainingPrizes, true);
  const effective = effectiveNoPrizePpm(machine.remainingPrizes);
  return {
    rows,
    totalConfiguredPpm: rows.reduce((acc, r) => acc + r.oddsPpm, 0),
    baseNoPrizePpm: baseNoPrizePpm(machine.remainingPrizes),
    soldOutSlotPpm: soldOutSlotPpm(machine.remainingPrizes),
    effectiveNoPrizePpm: effective,
    effectiveNoPrizePct: formatOddsPpm(effective),
    configuredRtpBps: machine.configuredRtpBps,
    liveAvailableRtpBps: machine.liveAvailableRtpBps,
    creatorEdgeBps: calculateCreatorEdgeBps(machine.liveAvailableRtpBps),
    prizesRemaining: totals.remaining,
    prizesInitial: totals.initial,
  };
}

/**
 * Realized payout ratio at/after sellout: reference value actually
 * distributed vs RF actually spent. Returned in BPS-like units (may exceed
 * 10000). Null before any spend. This is a transparency metric — never call
 * it RTP mid-run.
 */
export function calculateRealizedPayoutRatio(
  initialPrizes: readonly PrizeEntry[],
  remainingPrizes: readonly PrizeEntry[],
  totalSpentUnits: bigint
): { distributedUnits: bigint; ratioBps: number } | null {
  if (totalSpentUnits <= 0n) return null;
  const initial = calculateTotalPrizeValue(initialPrizes, false);
  const remaining = calculateTotalPrizeValue(remainingPrizes, true);
  const distributed = initial - remaining;
  const ratioBps = Number((distributed * BPS_DIVISOR) / totalSpentUnits);
  return { distributedUnits: distributed, ratioBps };
}

export interface OddsSuggestion {
  prizeEntryId: string;
  oddsPpm: number;
}

/**
 * TARGET RTP ASSIST: distribute suggested per-prize odds proportional to each
 * line's unit reference value so the configured RTP lands near the target.
 * Approximate by design (integer ppm + 100% cap): largest-remainder rounding,
 * proportional scale-down with `capped: true` when the target is unachievable.
 */
export function suggestFixedOddsPpm(
  targetRtpBps: number,
  pullPriceUnits: bigint,
  lines: ReadonlyArray<{ prizeEntryId: string; unitRefUnits: bigint }>
): { suggestions: OddsSuggestion[]; achievedRtpBps: number; capped: boolean } {
  if (!Number.isFinite(targetRtpBps) || targetRtpBps <= 0) {
    throw new Error('Target RTP must be a positive finite percentage in BPS.');
  }
  if (pullPriceUnits <= 0n) {
    throw new RangeError('Pull price must be greater than zero.');
  }
  if (lines.length === 0) {
    throw new Error('Need at least one prize line to suggest odds.');
  }
  // EV_target (bigint units) = price × target / 10000.
  const evTarget = (pullPriceUnits * BigInt(Math.round(targetRtpBps))) / BPS_DIVISOR;
  if (evTarget <= 0n) {
    return {
      suggestions: lines.map((l) => ({ prizeEntryId: l.prizeEntryId, oddsPpm: 1 })),
      achievedRtpBps: 0,
      capped: false,
    };
  }
  // Solve ppm_i ∝ ref_i with Σ ppm_i × ref_i / 1e6 = EV_target, via floats
  // (suggestions are approximate; the achieved RTP below is exact).
  const refs = lines.map((l) => Number(l.unitRefUnits));
  const sumSq = refs.reduce((acc, r) => acc + r * r, 0);
  if (!(sumSq > 0)) {
    throw new Error('Prize reference values must be positive to suggest odds.');
  }
  const evNum = Number(evTarget);
  const raw = refs.map((r) => (evNum * 1e6 * r) / sumSq);
  // Largest-remainder rounding to integers.
  const floored = raw.map(Math.floor);
  let remainder = floored.map((f, i) => ({ i, frac: raw[i]! - f }));
  let assigned = floored.reduce((a, b) => a + b, 0);
  // ppm of 0 is invalid for a prize line: guarantee at least 1 first.
  for (let i = 0; i < floored.length; i++) {
    if (floored[i]! < 1) {
      remainder = remainder.filter((r) => r.i !== i);
      assigned += 1 - floored[i]!;
      floored[i] = 1;
    }
  }
  remainder.sort((a, b) => b.frac - a.frac);
  let k = 0;
  // Distribute a bounded top-up so rare lines get representation; the final
  // normalization below enforces the 100% cap exactly.
  const topUp = Math.max(0, Math.min(remainder.length, 1_000_000 - assigned));
  while (k < topUp && remainder.length > 0) {
    floored[remainder[k % remainder.length]!.i]! += 1;
    assigned += 1;
    k++;
  }
  let capped = false;
  let finalPpms = floored;
  if (assigned > MAX_TOTAL_ODDS_PPM) {
    capped = true;
    const scale = MAX_TOTAL_ODDS_PPM / assigned;
    const scaled = floored.map((f) => Math.max(1, Math.floor(f * scale)));
    let sum = scaled.reduce((a, b) => a + b, 0);
    // Fix rounding drift deterministically (largest raw first).
    const order = raw
      .map((_, i) => i)
      .sort((a, b) => raw[b]! - raw[a]!);
    let oi = 0;
    while (sum > MAX_TOTAL_ODDS_PPM && oi < order.length * 2) {
      const idx = order[oi % order.length]!;
      if (scaled[idx]! > 1) {
        scaled[idx]! -= 1;
        sum -= 1;
      }
      oi++;
    }
    finalPpms = scaled;
  }
  const suggestions = lines.map((l, i) => ({
    prizeEntryId: l.prizeEntryId,
    oddsPpm: finalPpms[i]!,
  }));
  const achievedRtpBps = fixedOddsRtpBps(
    lines.map((l, i) => ({ referenceValueUnits: l.unitRefUnits, oddsPpm: finalPpms[i]! })),
    pullPriceUnits
  );
  return { suggestions, achievedRtpBps, capped };
}

/* ------------------------------------------------------------------ */
/* Monte Carlo lifetime modeling (seeded, pure, never mutates input)   */
/* ------------------------------------------------------------------ */

export interface MonteCarloInput {
  lines: ReadonlyArray<{
    prizeEntryId: string;
    oddsPpm: number;
    quantity: number;
    referenceValueUnits: bigint;
  }>;
  pullPriceUnits: bigint;
  runs?: number;
  maxPullsPerRun?: number;
  seed?: number;
}

export interface MonteCarloReport {
  runs: number;
  censoredRuns: number;
  pullsToSellout: { p10: number; p25: number; median: number; p75: number; p90: number };
  medianVolumeUnits: bigint;
  medianBurnUnits: bigint;
  medianReceiptsUnits: bigint;
  medianNetUnits: bigint;
  /** p10 net — bad-luck early-sellout scenario. */
  earlyNetUnits: bigint;
  /** p90 pulls — long-tail scenario depth. */
  longTailPulls: number;
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((q / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

function percentileBigint(sorted: bigint[], q: number): bigint {
  if (sorted.length === 0) return 0n;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((q / 100) * sorted.length) - 1));
  return sorted[idx]!;
}

/**
 * Simulate complete machine lifetimes with a seeded RNG. Each run rolls
 * independent pulls until every prize is gone (or the per-run cap hits).
 * Deterministic per seed; input lines are never mutated.
 */
export function simulateFixedOddsLifetime(input: MonteCarloInput): MonteCarloReport {
  const {
    lines,
    pullPriceUnits,
    runs = 800,
    maxPullsPerRun = 200_000,
    seed = 1,
  } = input;
  if (!Number.isInteger(runs) || runs < 1 || runs > 20000) {
    throw new RangeError('Monte Carlo runs must be an integer in 1..20000.');
  }
  if (pullPriceUnits <= 0n) {
    throw new RangeError('Pull price must be greater than zero.');
  }
  const intervals = buildFixedOddsIntervals(
    lines.map((l) => ({
      id: l.prizeEntryId,
      type: 'RF_PRIZE' as const,
      amountUnits: l.referenceValueUnits,
      initialQuantity: l.quantity,
      remainingQuantity: l.quantity,
      oddsPpm: l.oddsPpm,
    }))
  );
  const refById = new Map(lines.map((l) => [l.prizeEntryId, l.referenceValueUnits]));
  const pullsList: number[] = [];
  const nets: bigint[] = [];
  const volumes: bigint[] = [];
  const burns: bigint[] = [];
  const receipts: bigint[] = [];
  let censoredRuns = 0;

  for (let r = 0; r < runs; r++) {
    const rng = createSeedableRng((seed + r) >>> 0);
    const remaining = new Map(lines.map((l) => [l.prizeEntryId, l.quantity]));
    let left = lines.reduce((acc, l) => acc + l.quantity, 0);
    let pulls = 0;
    let paidUnits = 0n;
    while (left > 0 && pulls < maxPullsPerRun) {
      pulls++;
      const wonId = resolveFixedOddsRoll(intervals, remaining, rng());
      if (wonId !== null) {
        remaining.set(wonId, (remaining.get(wonId) ?? 1) - 1);
        paidUnits += refById.get(wonId) ?? 0n;
        left--;
      }
    }
    if (left > 0) censoredRuns++;
    const volume = pullPriceUnits * BigInt(pulls);
    const burn = mulBps(volume, 500n);
    const receiptUnits = volume - burn;
    pullsList.push(pulls);
    volumes.push(volume);
    burns.push(burn);
    receipts.push(receiptUnits);
    nets.push(receiptUnits - paidUnits);
  }

  pullsList.sort((a, b) => a - b);
  const sortedNets = [...nets].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const sortedVolumes = [...volumes].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const sortedBurns = [...burns].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const sortedReceipts = [...receipts].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return {
    runs,
    censoredRuns,
    pullsToSellout: {
      p10: percentile(pullsList, 10),
      p25: percentile(pullsList, 25),
      median: percentile(pullsList, 50),
      p75: percentile(pullsList, 75),
      p90: percentile(pullsList, 90),
    },
    medianVolumeUnits: percentileBigint(sortedVolumes, 50),
    medianBurnUnits: percentileBigint(sortedBurns, 50),
    medianReceiptsUnits: percentileBigint(sortedReceipts, 50),
    medianNetUnits: percentileBigint(sortedNets, 50),
    earlyNetUnits: percentileBigint(sortedNets, 10),
    longTailPulls: percentile(pullsList, 90),
  };
}

/* ------------------------------------------------------------------ */
/* Creation + pulling                                                  */
/* ------------------------------------------------------------------ */

export interface CreateFixedOddsMachineParams {
  id?: string;
  name: string;
  shellId: MachineShellId;
  emblem?: string;
  mascotTokenId?: bigint;
  creatorAddress: string;
  pullPriceUnits: bigint;
  /** Assist memory only — authoritative math always uses configured odds. */
  targetRtpBps?: number;
  prizeEntries: PrizeEntry[];
  rng?: RngFunction;
}

function clonePrizes(prizeEntries: PrizeEntry[]): PrizeEntry[] {
  return prizeEntries.map((p) => ({ ...p, remainingQuantity: p.initialQuantity }));
}

function deepClonePrizes(prizeEntries: PrizeEntry[]): PrizeEntry[] {
  return JSON.parse(
    JSON.stringify(prizeEntries, (_, v) => (typeof v === 'bigint' ? v.toString() : v))
  ).map((entry: PrizeEntry) => ({
    ...entry,
    amountUnits: 'amountUnits' in entry ? BigInt(entry.amountUnits as unknown as string) : undefined,
    referenceValueUnits:
      'referenceValueUnits' in entry
        ? BigInt(entry.referenceValueUnits as unknown as string)
        : undefined,
    tokenId: 'tokenId' in entry ? BigInt(entry.tokenId as unknown as string) : undefined,
  }));
}

/**
 * Creates and initializes a new Fixed Odds Friend Machine.
 */
export function createFixedOddsMachine(params: CreateFixedOddsMachineParams): {
  machine: FixedOddsMachine;
  seededRfEscrowUnits: bigint;
  seededFriends: RareFriendMetadata[];
  events: LedgerEvent[];
} {
  const {
    id = `machine-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name,
    shellId,
    emblem = 'star',
    mascotTokenId,
    creatorAddress,
    pullPriceUnits,
    targetRtpBps = 9000,
    prizeEntries,
    rng = defaultCryptoRng,
  } = params;
  void rng;

  if (!name.trim()) {
    throw new Error('Machine name is required');
  }
  if (pullPriceUnits <= 0n) {
    throw new RangeError('Pull price must be greater than zero');
  }
  if (prizeEntries.length === 0) {
    throw new Error('Prize pool cannot be empty');
  }

  const { totalPpm, noPrizePpm } = validateFixedOddsPrizes(prizeEntries);

  let seededRfEscrowUnits = 0n;
  const seededFriends: RareFriendMetadata[] = [];
  for (const entry of prizeEntries) {
    if (entry.type === 'RF_PRIZE') {
      seededRfEscrowUnits += entry.amountUnits * BigInt(entry.initialQuantity);
    } else if (entry.type === 'FRIEND_PRIZE') {
      seededFriends.push({
        tokenId: entry.tokenId,
        name: entry.name,
        familyName: entry.familyName,
        generation: entry.generation,
        spriteRows: entry.spriteRows,
        demoReferenceValueUnits: entry.referenceValueUnits,
        origin: entry.origin,
        chainId: entry.chainId,
        chainSlug: entry.chainSlug,
        contractAddress: entry.contractAddress,
        collectionType: entry.collectionType,
        collectionSlug: entry.collectionSlug,
        collectionName: entry.collectionName,
        collectionImage: entry.collectionImage,
        tokenStandard: entry.tokenStandard,
        description: entry.description,
        traits: entry.traits,
        imageUrl: entry.imageUrl,
        displayImageUrl: entry.displayImageUrl,
        animationUrl: entry.animationUrl,
        openseaUrl: entry.openseaUrl,
        verifiedOwnerAddress: entry.verifiedOwnerAddress,
        valuationSnapshot: entry.valuationSnapshot,
      });
    }
  }

  const configuredRtpBps = calculateConfiguredRtpBps(prizeEntries, pullPriceUnits);
  if (!Number.isFinite(configuredRtpBps) || configuredRtpBps <= 0) {
    throw new Error('Configured RTP must be a positive finite percentage. Adjust prizes or pull price.');
  }
  if (configuredRtpBps > TECHNICAL_MAX_RTP_BPS) {
    throw new Error(
      `Configured RTP (${(configuredRtpBps / 100).toFixed(1)}%) exceeds the technical maximum of ${TECHNICAL_MAX_RTP_BPS / 100}%.`
    );
  }

  const now = Date.now();
  const machine: FixedOddsMachine = {
    id,
    name,
    shellId,
    machineType: 'fixed_odds',
    emblem,
    mascotTokenId,
    creatorAddress,
    status: 'READY',
    pullPriceUnits,
    burnBps: 500n, // 5%
    initialPrizes: deepClonePrizes(prizeEntries),
    remainingPrizes: clonePrizes(prizeEntries),
    targetRtpBps,
    configuredRtpBps,
    liveAvailableRtpBps: configuredRtpBps,
    totalSpentUnits: 0n,
    totalBurnedUnits: 0n,
    creatorReceiptsUnits: 0n,
    rfPrizesPaidUnits: 0n,
    friendPrizesAwardedCount: 0,
    pullCount: 0,
    createdAt: now,
    isRulesLocked: false,
  };

  const events: LedgerEvent[] = [
    {
      id: `evt-create-${now}-${Math.random()}`,
      machineId: id,
      machineName: name,
      type: 'MACHINE_CREATED',
      actorAddress: creatorAddress,
      timestamp: now,
      machineType: 'fixed_odds',
      details: `Fixed Odds machine "${name}" created at pull price ${pullPriceUnits / 1000n} RF (configured RTP: ${(configuredRtpBps / 100).toFixed(2)}%, no-prize: ${formatOddsPpm(noPrizePpm)}, ${totalPpm / 10000}% configured across prizes)`,
    },
  ];

  if (seededRfEscrowUnits > 0n) {
    events.push({
      id: `evt-seed-rf-${now}-${Math.random()}`,
      machineId: id,
      machineName: name,
      type: 'RF_SEEDED',
      actorAddress: creatorAddress,
      timestamp: now,
      machineType: 'fixed_odds',
      rfAmountUnits: seededRfEscrowUnits,
      details: `Seeded ${seededRfEscrowUnits / 1000n} RF in prize inventory`,
    });
  }

  for (const friend of seededFriends) {
    events.push({
      id: `evt-seed-friend-${friend.tokenId}-${now}`,
      machineId: id,
      machineName: name,
      type: 'FRIEND_SEEDED',
      actorAddress: creatorAddress,
      timestamp: now,
      machineType: 'fixed_odds',
      friendTokenId: friend.tokenId,
      friendName: friend.name,
      details: `Seeded Rare Friend #${friend.tokenId} "${friend.name}" into prize inventory`,
    });
  }

  return { machine, seededRfEscrowUnits, seededFriends, events };
}

function buildSyntheticTicket(
  machine: FixedOddsMachine,
  wonEntry: RFPrizeEntry | FriendPrizeEntry | null,
  now: number
): Ticket {
  if (!wonEntry) {
    return {
      id: `fixed-roll-${now}-${machine.pullCount}`,
      prizeType: 'NO_PRIZE',
      prizeEntryId: 'fixed-no-prize',
      referenceValueUnits: 0n,
    };
  }
  if (wonEntry.type === 'RF_PRIZE') {
    return {
      id: `fixed-roll-${now}-${machine.pullCount}`,
      prizeType: 'RF_PRIZE',
      prizeEntryId: wonEntry.id,
      rfAmountUnits: wonEntry.amountUnits,
      referenceValueUnits: wonEntry.amountUnits,
    };
  }
  return {
    id: `fixed-roll-${now}-${machine.pullCount}`,
    prizeType: 'FRIEND_PRIZE',
    prizeEntryId: wonEntry.id,
    friendTokenId: wonEntry.tokenId,
    friendName: wonEntry.name,
    friendFamilyName: wonEntry.familyName,
    friendGeneration: wonEntry.generation,
    friendSpriteRows: wonEntry.spriteRows,
    referenceValueUnits: wonEntry.referenceValueUnits,
    friendOrigin: wonEntry.origin,
    friendChainId: wonEntry.chainId,
    friendContractAddress: wonEntry.contractAddress,
    friendCollectionType: wonEntry.collectionType,
    friendCollectionName: wonEntry.collectionName,
    friendImageUrl: wonEntry.imageUrl,
    friendDisplayImageUrl: wonEntry.displayImageUrl,
    friendAnimationUrl: wonEntry.animationUrl,
    friendOpenseaUrl: wonEntry.openseaUrl,
    friendVerifiedOwnerAddress: wonEntry.verifiedOwnerAddress,
  };
}

function friendWonFromEntry(
  entry: FriendPrizeEntry,
  referenceValueUnits: bigint
): RareFriendMetadata {
  return {
    tokenId: entry.tokenId,
    name: entry.name,
    familyName: entry.familyName,
    generation: entry.generation,
    spriteRows: entry.spriteRows,
    demoReferenceValueUnits: referenceValueUnits,
    origin: entry.origin,
    chainId: entry.chainId,
    contractAddress: entry.contractAddress,
    collectionType: entry.collectionType,
    collectionName: entry.collectionName,
    imageUrl: entry.imageUrl,
    displayImageUrl: entry.displayImageUrl,
    animationUrl: entry.animationUrl,
    openseaUrl: entry.openseaUrl,
    verifiedOwnerAddress: entry.verifiedOwnerAddress,
  };
}

/**
 * Executes one independent fixed-odds pull. Sold-out slots resolve as empty
 * outcomes; configured intervals are never rebuilt.
 */
export function pullFixedOddsMachine(
  machine: FixedOddsMachine,
  playerAddress: string,
  playerBalanceUnits: bigint,
  rng: RngFunction = defaultCryptoRng
): {
  updatedMachine: FixedOddsMachine;
  result: PullResult;
  events: LedgerEvent[];
} {
  if (machine.status === 'SOLD_OUT') {
    throw new Error('Machine is SOLD OUT. All prize inventory is gone.');
  }
  if (machine.status === 'CANCELLED') {
    throw new Error('Machine has been CANCELLED.');
  }
  if (isFixedOddsInventoryEmpty(machine.remainingPrizes)) {
    throw new Error('Machine is SOLD OUT. All prize inventory is gone.');
  }
  if (playerBalanceUnits < machine.pullPriceUnits) {
    throw new Error(
      `Insufficient demo RF. Pull cost: ${machine.pullPriceUnits / 1000n} RF, balance: ${playerBalanceUnits / 1000n} RF`
    );
  }

  const now = Date.now();
  const split = calculatePullSplit(machine.pullPriceUnits);

  // Fresh independent roll every pull — no deck involved.
  const intervals = buildFixedOddsIntervals(machine.remainingPrizes);
  const remainingById = new Map(
    machine.remainingPrizes.map((p) => [p.id, p.remainingQuantity])
  );
  const roll = rng();
  const clamped = roll >= 1 ? 0.999999999 : roll < 0 || !Number.isFinite(roll) ? 0 : roll;
  const rollPpm = Math.floor(clamped * PPM_SCALE);
  const wonEntryId = resolveFixedOddsRoll(intervals, remainingById, roll);
  const wonEntry =
    wonEntryId !== null
      ? (machine.remainingPrizes.find(
          (p): p is RFPrizeEntry | FriendPrizeEntry =>
            p.id === wonEntryId && (p.type === 'RF_PRIZE' || p.type === 'FRIEND_PRIZE')
        ) ?? null)
      : null;

  // Clone remaining prizes; decrement only a genuinely available win.
  const updatedRemainingPrizes = machine.remainingPrizes.map((p) => {
    if (wonEntry && p.id === wonEntry.id) {
      return { ...p, remainingQuantity: Math.max(0, p.remainingQuantity - 1) };
    }
    return { ...p };
  });

  const newLiveAvailableRtpBps = calculateLiveAvailableRtpBps(
    updatedRemainingPrizes,
    machine.pullPriceUnits
  );
  const totals = fixedOddsInventoryTotals(updatedRemainingPrizes, true);
  const initialTotals = fixedOddsInventoryTotals(machine.initialPrizes, false);

  let rfWonUnits = 0n;
  let friendWon: RareFriendMetadata | undefined;
  const wonPrize = wonEntry !== null;
  if (wonEntry?.type === 'RF_PRIZE') {
    rfWonUnits = wonEntry.amountUnits;
  } else if (wonEntry?.type === 'FRIEND_PRIZE') {
    friendWon = friendWonFromEntry(wonEntry, wonEntry.referenceValueUnits);
  }

  const isSoldOut = totals.remaining === 0;
  const newStatus = isSoldOut ? 'SOLD_OUT' : 'LIVE';

  const updatedMachine: FixedOddsMachine = {
    ...machine,
    status: newStatus,
    remainingPrizes: updatedRemainingPrizes,
    liveAvailableRtpBps: newLiveAvailableRtpBps,
    totalSpentUnits: machine.totalSpentUnits + machine.pullPriceUnits,
    totalBurnedUnits: machine.totalBurnedUnits + split.burnUnits,
    creatorReceiptsUnits: machine.creatorReceiptsUnits + split.creatorUnits,
    rfPrizesPaidUnits: machine.rfPrizesPaidUnits + rfWonUnits,
    friendPrizesAwardedCount: machine.friendPrizesAwardedCount + (friendWon ? 1 : 0),
    pullCount: machine.pullCount + 1,
    firstPullAt: machine.firstPullAt ?? now,
    soldOutAt: isSoldOut ? now : undefined,
    isRulesLocked: true, // Immutable from the first pull
  };

  const ticket = buildSyntheticTicket(machine, wonEntry, now);

  const result: PullResult = {
    ticket,
    spentUnits: machine.pullPriceUnits,
    burnedUnits: split.burnUnits,
    creatorReceiptUnits: split.creatorUnits,
    wonPrize,
    prizeType: wonEntry ? wonEntry.type : 'NO_PRIZE',
    rfWonUnits,
    friendWon,
    isSoldOut,
    machineType: 'fixed_odds',
    rollPpm,
    newPrizesRemaining: { remaining: totals.remaining, initial: initialTotals.initial },
  };

  const events: LedgerEvent[] = [
    {
      id: `evt-pull-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'PULL_INITIATED',
      actorAddress: playerAddress,
      timestamp: now,
      machineType: 'fixed_odds',
      rollPpm,
      rfAmountUnits: machine.pullPriceUnits,
      details: `Player pulled fixed-odds "${machine.name}" for ${machine.pullPriceUnits / 1000n} RF (roll ${formatOddsPpm(rollPpm)})`,
    },
    {
      id: `evt-burn-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'RF_BURNED',
      actorAddress: playerAddress,
      timestamp: now,
      machineType: 'fixed_odds',
      rfAmountUnits: split.burnUnits,
      details: `Burned ${Number(split.burnUnits) / 1000} RF (5% fixed platform burn)`,
    },
    {
      id: `evt-credit-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'CREATOR_CREDITED',
      actorAddress: machine.creatorAddress,
      timestamp: now,
      machineType: 'fixed_odds',
      rfAmountUnits: split.creatorUnits,
      details: `Operator received ${Number(split.creatorUnits) / 1000} RF proceeds (95%)`,
    },
  ];

  if (wonEntry?.type === 'RF_PRIZE' && rfWonUnits > 0n) {
    events.push({
      id: `evt-rf-won-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'RF_PRIZE_PAID',
      actorAddress: playerAddress,
      timestamp: now,
      machineType: 'fixed_odds',
      rfAmountUnits: rfWonUnits,
      details: `Player won ${rfWonUnits / 1000n} RF!`,
    });
  } else if (wonEntry?.type === 'FRIEND_PRIZE' && friendWon) {
    events.push({
      id: `evt-friend-won-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'FRIEND_PRIZE_AWARDED',
      actorAddress: playerAddress,
      timestamp: now,
      machineType: 'fixed_odds',
      friendTokenId: friendWon.tokenId,
      friendName: friendWon.name,
      details: `JACKPOT! Player won Rare Friend #${friendWon.tokenId} "${friendWon.name}"!`,
    });
  } else {
    events.push({
      id: `evt-noprize-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'NO_PRIZE_DRAWN',
      actorAddress: playerAddress,
      timestamp: now,
      machineType: 'fixed_odds',
      rollPpm,
      details: `Fixed-odds roll landed outside available prizes: Try again`,
    });
  }

  if (isSoldOut) {
    const realized = calculateRealizedPayoutRatio(
      machine.initialPrizes,
      updatedRemainingPrizes,
      updatedMachine.totalSpentUnits
    );
    events.push({
      id: `evt-soldout-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'MACHINE_SOLD_OUT',
      actorAddress: machine.creatorAddress,
      timestamp: now,
      machineType: 'fixed_odds',
      details: `Fixed Odds machine "${machine.name}" has SOLD OUT after ${updatedMachine.pullCount} pulls! Volume: ${updatedMachine.totalSpentUnits / 1000n} RF, burned: ${Number(updatedMachine.totalBurnedUnits) / 1000} RF${
        realized ? `, realized payout ratio: ${(realized.ratioBps / 100).toFixed(2)}%` : ''
      }`,
    });
  }

  return { updatedMachine, result, events };
}
