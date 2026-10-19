/**
 * Core Economics Engine for RARE ARCADE.
 * Calculates EV, RTP, operator margin, live odds, and ticket deck recommendations.
 * Uses strict fixed-point integer math to avoid JS floating-point rounding errors.
 */

import { BPS_DIVISOR, mulBps, formatRF } from './rf.ts';
import { formatUsdg } from './usdg.ts';
import { PLATFORM_FEE_BPS, CREATOR_RECEIPTS_BPS, splitPlatformFee } from './fees.ts';
import type { PrizeEntry } from './types.ts';

export const DEFAULT_TARGET_RTP_BPS = 9000; // 90.00%
/**
 * @deprecated V1 product guardrails (75–95%). No longer enforced anywhere:
 * quick-pick presets are suggestions, and creators may model any positive
 * finite RTP (including >100% subsidized machines). Kept exported so older
 * imports/tests keep compiling. New code should use TECHNICAL_MAX_RTP_BPS
 * from './rtp.ts' for the generous technical cap.
 */
export const MIN_ALLOWED_RTP_BPS = 7500; // 75.00%
/** @deprecated See MIN_ALLOWED_RTP_BPS. */
export const MAX_ALLOWED_RTP_BPS = 9500; // 95.00% (at 95%, operator margin = 0% after the 5% fee)

export interface EconomicsSummary {
  /** USDG internal units. */
  pullPriceUnits: bigint;
  totalPulls: number;
  remainingPulls: number;

  totalPrizeUnits: bigint;
  remainingPrizeUnits: bigint;

  initialEvUnits: bigint;
  currentEvUnits: bigint;

  initialRtpBps: number;
  currentRtpBps: number;

  platformFeeBps: number; // 500 (5.00%)
  initialOperatorMarginBps: number; // 9500 - initialRtpBps
  currentOperatorMarginBps: number; // 9500 - currentRtpBps

  // Sellout projections (all USDG internal units)
  grossVolumeAtSelloutUnits: bigint;
  platformFeeAtSelloutUnits: bigint;
  primaryFeeAtSelloutUnits: bigint;
  buybackFeeAtSelloutUnits: bigint;
  creatorReceiptsAtSelloutUnits: bigint;
  netCreatorReferenceProfitAtSelloutUnits: bigint;
}

export interface PrizeOddsItem {
  prizeEntryId: string;
  type: string;
  label: string;
  detail: string;
  remainingQuantity: number;
  initialQuantity: number;
  probabilityBps: number; // in bps (e.g. 235 = 2.35%)
  probabilityPct: string; // "2.35%"
  /** EV reference value in USDG internal units. */
  usdgValueUnits: bigint;
}

/**
 * Total reference prize value in USDG internal units, across cashback and NFTs.
 *
 * Every prize is valued in USDG regardless of payout currency: USDG cashback
 * values at face, RF cashback uses its immutable seed-time snapshot, and NFTs
 * use their locked top-bid snapshot. That keeps one accounting currency for
 * RTP/EV even when a machine pays out a mix of USDG, RF and NFTs.
 */
export function calculateTotalPrizeValue(
  entries: readonly PrizeEntry[],
  useRemaining = false
): bigint {
  let total = 0n;
  for (const entry of entries) {
    const qty = BigInt(useRemaining ? entry.remainingQuantity : entry.initialQuantity);
    if (qty <= 0n) {
      continue;
    }

    if (entry.type === 'USDG_PRIZE') {
      total += entry.amountUnits * qty;
    } else if (entry.type === 'RF_PRIZE') {
      total += entry.usdgValueUnits * qty;
    } else if (entry.type === 'FRIEND_PRIZE') {
      total += entry.usdgValueUnits * qty;
    }
  }
  return total;
}

/**
 * Total count of prizes (excluding NO_PRIZE).
 */
export function countTotalPrizeItems(
  entries: readonly PrizeEntry[],
  useRemaining = false
): number {
  let count = 0;
  for (const entry of entries) {
    if (entry.type === 'NO_PRIZE') {
      continue;
    }
    count += useRemaining ? entry.remainingQuantity : entry.initialQuantity;
  }
  return count;
}

/**
 * Calculates Expected Value per pull in internal RF units.
 * EV = totalPrizeUnits / pulls
 */
export function calculateEv(totalPrizeUnits: bigint, pulls: number): bigint {
  if (pulls <= 0) {
    return 0n;
  }
  return totalPrizeUnits / BigInt(pulls);
}

/**
 * Calculates Return to Player (RTP) in Basis Points.
 * RTP = (EV * 10000) / pullPrice
 * 9000 = 90.00%
 */
export function calculateRtpBps(evUnits: bigint, pullPriceUnits: bigint): number {
  if (pullPriceUnits <= 0n) {
    return 0;
  }
  const rtp = (evUnits * BPS_DIVISOR) / pullPriceUnits;
  return Number(rtp);
}

/**
 * Solves for the recommended total pull count given prize value, pull price, and target RTP.
 * Formula:
 *   Target EV = (pullPrice * targetRtpBps) / 10000
 *   Recommended Pulls = round(totalPrizeUnits / Target EV)
 *
 * Ensures:
 *   1. recommended pulls >= prize item count
 *   2. recommended pulls >= 1
 */
export function solveRecommendedPulls(
  totalPrizeUnits: bigint,
  pullPriceUnits: bigint,
  targetRtpBps: number = DEFAULT_TARGET_RTP_BPS,
  minPullsRequirement = 1
): {
  recommendedPulls: number;
  actualRtpBps: number;
  actualEvUnits: bigint;
  targetEvUnits: bigint;
} {
  if (pullPriceUnits <= 0n || totalPrizeUnits <= 0n) {
    return {
      recommendedPulls: Math.max(1, minPullsRequirement),
      actualRtpBps: 0,
      actualEvUnits: 0n,
      targetEvUnits: 0n,
    };
  }

  // targetEvUnits = (pullPriceUnits * targetRtpBps) / 10000
  const targetEvUnits = (pullPriceUnits * BigInt(targetRtpBps)) / BPS_DIVISOR;

  if (targetEvUnits <= 0n) {
    return {
      recommendedPulls: Math.max(1, minPullsRequirement),
      actualRtpBps: 0,
      actualEvUnits: 0n,
      targetEvUnits: 0n,
    };
  }

  // Recommended Pulls = (totalPrizeUnits + (targetEvUnits / 2)) / targetEvUnits (round to nearest)
  let recommendedPulls = Number((totalPrizeUnits + targetEvUnits / 2n) / targetEvUnits);

  if (recommendedPulls < minPullsRequirement) {
    recommendedPulls = minPullsRequirement;
  }
  if (recommendedPulls < 1) {
    recommendedPulls = 1;
  }

  const actualEvUnits = calculateEv(totalPrizeUnits, recommendedPulls);
  const actualRtpBps = calculateRtpBps(actualEvUnits, pullPriceUnits);

  return {
    recommendedPulls,
    actualRtpBps,
    actualEvUnits,
    targetEvUnits,
  };
}

/**
 * Computes full economics summary for a machine state.
 */
export function calculateMachineEconomics(
  initialPrizes: readonly PrizeEntry[],
  remainingPrizes: readonly PrizeEntry[],
  pullPriceUnits: bigint,
  totalPulls: number,
  remainingPulls: number
): EconomicsSummary {
  const totalPrizeUnits = calculateTotalPrizeValue(initialPrizes, false);
  const remainingPrizeUnits = calculateTotalPrizeValue(remainingPrizes, true);

  const initialEvUnits = calculateEv(totalPrizeUnits, totalPulls);
  const currentEvUnits = calculateEv(remainingPrizeUnits, remainingPulls);

  const initialRtpBps = calculateRtpBps(initialEvUnits, pullPriceUnits);
  const currentRtpBps = calculateRtpBps(currentEvUnits, pullPriceUnits);

  const platformFeeBps = Number(PLATFORM_FEE_BPS); // 500
  const creatorBps = Number(CREATOR_RECEIPTS_BPS); // 9500

  const initialOperatorMarginBps = creatorBps - initialRtpBps;
  const currentOperatorMarginBps = creatorBps - currentRtpBps;

  // Projections at sellout
  const grossVolumeAtSelloutUnits = pullPriceUnits * BigInt(totalPulls);
  const platformFeeAtSelloutUnits = mulBps(grossVolumeAtSelloutUnits, PLATFORM_FEE_BPS);
  const { primaryUnits: primaryFeeAtSelloutUnits, buybackUnits: buybackFeeAtSelloutUnits } =
    splitPlatformFee(platformFeeAtSelloutUnits);
  const creatorReceiptsAtSelloutUnits = grossVolumeAtSelloutUnits - platformFeeAtSelloutUnits;
  const netCreatorReferenceProfitAtSelloutUnits =
    creatorReceiptsAtSelloutUnits - totalPrizeUnits;

  return {
    pullPriceUnits,
    totalPulls,
    remainingPulls,
    totalPrizeUnits,
    remainingPrizeUnits,
    initialEvUnits,
    currentEvUnits,
    initialRtpBps,
    currentRtpBps,
    platformFeeBps,
    initialOperatorMarginBps,
    currentOperatorMarginBps,
    grossVolumeAtSelloutUnits,
    platformFeeAtSelloutUnits,
    primaryFeeAtSelloutUnits,
    buybackFeeAtSelloutUnits,
    creatorReceiptsAtSelloutUnits,
    netCreatorReferenceProfitAtSelloutUnits,
  };
}

/**
 * Computes live odds for all prizes currently in the machine.
 * The probabilities are calculated against remainingPulls.
 * Guaranteed invariant: probabilities sum to 100.00% (within integer rounding, empty tickets absorb remainder).
 */
export function calculateLiveOdds(
  remainingPrizes: readonly PrizeEntry[],
  remainingPulls: number
): PrizeOddsItem[] {
  if (remainingPulls <= 0) {
    return [];
  }

  const oddsList: PrizeOddsItem[] = [];
  let accountedTickets = 0;
  let accumulatedBps = 0;

  for (const entry of remainingPrizes) {
    if (entry.remainingQuantity <= 0) {
      continue;
    }

    const qty = entry.remainingQuantity;
    accountedTickets += qty;

    // Basis points: (qty * 10000) / remainingPulls
    const bps = Math.round((qty * 10000) / remainingPulls);
    accumulatedBps += bps;

    let label = '';
    let detail = '';
    let refVal = 0n;

    if (entry.type === 'USDG_PRIZE') {
      label = `${formatUsdg(entry.amountUnits, { decimals: 2 })} USDG`;
      detail = 'USDG Reward';
      refVal = entry.amountUnits;
    } else if (entry.type === 'RF_PRIZE') {
      label = `${formatRF(entry.amountUnits, { decimals: 2 })} RF`;
      detail = '$RAREFRIENDS Reward';
      refVal = entry.usdgValueUnits;
    } else if (entry.type === 'FRIEND_PRIZE') {
      label = entry.name;
      detail = `${entry.familyName} (Gen ${entry.generation})`;
      refVal = entry.usdgValueUnits;
    } else if (entry.type === 'NO_PRIZE') {
      label = 'Try Again';
      detail = 'No prize awarded';
      refVal = 0n;
    }

    oddsList.push({
      prizeEntryId: entry.id,
      type: entry.type,
      label,
      detail,
      remainingQuantity: qty,
      initialQuantity: entry.initialQuantity,
      probabilityBps: bps,
      probabilityPct: (bps / 100).toFixed(2) + '%',
      usdgValueUnits: refVal,
    });
  }

  // Account for remaining empty tickets not explicitly listed
  const emptyTickets = remainingPulls - accountedTickets;
  if (emptyTickets > 0) {
    const emptyBps = Math.max(0, 10000 - accumulatedBps);
    oddsList.push({
      prizeEntryId: 'empty-tickets',
      type: 'NO_PRIZE',
      label: 'Try Again',
      detail: 'No prize awarded',
      remainingQuantity: emptyTickets,
      initialQuantity: emptyTickets,
      probabilityBps: emptyBps,
      probabilityPct: (emptyBps / 100).toFixed(2) + '%',
      usdgValueUnits: 0n,
    });
  }

  return oddsList;
}

/**
 * Economic scenario projection (e.g. 25%, 50%, 100% sellout).
 * All amounts are USDG internal units.
 */
export interface ScenarioProjection {
  percentLabel: string;
  pulls: number;
  grossVolumeUnits: bigint;
  /** Total 5% platform fee. */
  platformFeeUnits: bigint;
  /** 75% of the fee to the primary treasury. */
  primaryFeeUnits: bigint;
  /** 25% of the fee funding RF buybacks. */
  buybackFeeUnits: bigint;
  creatorReceiptsUnits: bigint;
}

export function calculateScenarios(
  pullPriceUnits: bigint,
  totalPulls: number
): ScenarioProjection[] {
  const steps = [
    { label: '25% Sold', factor: 0.25 },
    { label: '50% Sold', factor: 0.5 },
    { label: '100% Sold', factor: 1.0 },
  ];

  return steps.map((step) => {
    const pulls = Math.max(1, Math.round(totalPulls * step.factor));
    const grossVolumeUnits = pullPriceUnits * BigInt(pulls);
    const platformFeeUnits = mulBps(grossVolumeUnits, PLATFORM_FEE_BPS);
    const { primaryUnits, buybackUnits } = splitPlatformFee(platformFeeUnits);
    const creatorReceiptsUnits = grossVolumeUnits - platformFeeUnits;

    return {
      percentLabel: step.label,
      pulls,
      grossVolumeUnits,
      platformFeeUnits,
      primaryFeeUnits: primaryUnits,
      buybackFeeUnits: buybackUnits,
      creatorReceiptsUnits,
    };
  });
}
