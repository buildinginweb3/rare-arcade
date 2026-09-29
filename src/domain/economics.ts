/**
 * Core Economics Engine for RARE ARCADE.
 * Calculates EV, RTP, operator margin, live odds, and ticket deck recommendations.
 * Uses strict fixed-point integer math to avoid JS floating-point rounding errors.
 */

import { BPS_DIVISOR, BURN_BPS, CREATOR_BPS, mulBps } from './rf.ts';
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
export const MAX_ALLOWED_RTP_BPS = 9500; // 95.00% (at 95%, operator margin = 0% since 5% is burned)

export interface EconomicsSummary {
  pullPriceUnits: bigint;
  totalPulls: number;
  remainingPulls: number;

  totalPrizeUnits: bigint;
  remainingPrizeUnits: bigint;

  initialEvUnits: bigint;
  currentEvUnits: bigint;

  initialRtpBps: number;
  currentRtpBps: number;

  burnBps: number; // 500 (5%)
  initialOperatorMarginBps: number; // 9500 - initialRtpBps
  currentOperatorMarginBps: number; // 9500 - currentRtpBps

  // Sellout projections
  grossVolumeAtSelloutUnits: bigint;
  burnAtSelloutUnits: bigint;
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
  referenceValueUnits: bigint;
}

/**
 * Calculates total reference prize value for a list of prize entries.
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

    if (entry.type === 'RF_PRIZE') {
      total += entry.amountUnits * qty;
    } else if (entry.type === 'FRIEND_PRIZE') {
      total += entry.referenceValueUnits * qty;
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

  const burnBps = Number(BURN_BPS); // 500
  const creatorBps = Number(CREATOR_BPS); // 9500

  const initialOperatorMarginBps = creatorBps - initialRtpBps;
  const currentOperatorMarginBps = creatorBps - currentRtpBps;

  // Projections at sellout
  const grossVolumeAtSelloutUnits = pullPriceUnits * BigInt(totalPulls);
  const burnAtSelloutUnits = mulBps(grossVolumeAtSelloutUnits, BURN_BPS);
  const creatorReceiptsAtSelloutUnits = grossVolumeAtSelloutUnits - burnAtSelloutUnits;
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
    burnBps,
    initialOperatorMarginBps,
    currentOperatorMarginBps,
    grossVolumeAtSelloutUnits,
    burnAtSelloutUnits,
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

    if (entry.type === 'RF_PRIZE') {
      label = `${entry.amountUnits / 1000n} RF`;
      detail = 'Simulated Token Reward';
      refVal = entry.amountUnits;
    } else if (entry.type === 'FRIEND_PRIZE') {
      label = entry.name;
      detail = `${entry.familyName} (Gen ${entry.generation})`;
      refVal = entry.referenceValueUnits;
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
      referenceValueUnits: refVal,
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
      referenceValueUnits: 0n,
    });
  }

  return oddsList;
}

/**
 * Economic scenario projection (e.g. 25%, 50%, 100% sellout).
 */
export interface ScenarioProjection {
  percentLabel: string;
  pulls: number;
  grossVolumeUnits: bigint;
  burnUnits: bigint;
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
    const burnUnits = mulBps(grossVolumeUnits, BURN_BPS);
    const creatorReceiptsUnits = grossVolumeUnits - burnUnits;

    return {
      percentLabel: step.label,
      pulls,
      grossVolumeUnits,
      burnUnits,
      creatorReceiptsUnits,
    };
  });
}
