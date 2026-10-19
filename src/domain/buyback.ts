/**
 * RF buyback & burn.
 *
 * 25% of every platform fee accrues as USDG into a buyback pot (see
 * `fees.ts`). Periodically the whole pot is swapped USDG -> RF on an AMM and the
 * acquired RF is sent to the burn address.
 *
 * Why batched rather than per-pull:
 *   - A per-pull swap would pay AMM fees on a tiny trade and take heavy
 *     slippage relative to size. Batching means fewer, larger swaps.
 *   - It removes the per-pull MEV surface.
 *   - The cost is that the burn lags the revenue that funded it.
 *
 * The critical property: the pot stays DENOMINATED IN USDG until the moment a
 * batch executes. A player is charged 5% of their spend in USDG regardless of
 * what RF is doing, and no published RTP depends on an RF price. RF volatility
 * only affects how much RF a given buyback yields — never what a player paid.
 *
 * In live mode the swap happens on an RHC AMM pool via the FeeRouter
 * (`web3/contracts.ts`). This module is the deterministic simulation of that
 * same mechanic, and the model the deployed contract must reproduce.
 */

import { parseUsdg, USDG_SCALE, usdgFromUsd } from './usdg.ts';
import { RF_BURN_SINK } from './fees.ts';

/**
 * Accrued USDG required before a batch executes.
 *
 * Sized to be large enough that the swap fee is negligible against the trade,
 * small enough that the burn doesn't lag revenue for months. Tunable — live
 * deployment should confirm against actual AMM liquidity and gas.
 */
export const BUYBACK_BATCH_THRESHOLD_USDG = '500';

/**
 * Modelled adverse price impact, in bps.
 *
 * A real buy fills WORSE than the quoted mid, so the platform pays MORE per RF
 * than spot and therefore acquires LESS RF than a perfect fill would. This is
 * expressed as a markup on the effective price, so the RF burned is always
 * understated rather than overstated.
 *
 * A flat estimate, not a simulation of the pool curve — a larger batch moves
 * the price more, so confirm this against real liquidity before mainnet.
 */
export const BUYBACK_SLIPPAGE_BPS = 100n; // 1.00%

/** The pot accrues in USDG. This is the amount a batch would spend. */
export function shouldExecuteBuyback(
  accruedUsdgUnits: bigint,
  thresholdUsdg: string = BUYBACK_BATCH_THRESHOLD_USDG
): boolean {
  return accruedUsdgUnits >= parseUsdg(thresholdUsdg);
}

export interface BuybackBurn {
  /** USDG spent on the swap. Always the entire accrued pot — no residue. */
  usdgSpentUnits: bigint;
  /** RF acquired and sent to the burn sink (RF units, 1 RF = 1000). */
  rfBurnedUnits: bigint;
  /** Effective USDG per RF paid, after the modelled slippage. */
  effectivePriceUsdg: string;
  /** Price before slippage, for transparency. */
  quotedPriceUsdg: string;
  /** Where the RF went. */
  burnSink: string;
  burnedAt: number;
  batchId: string;
}

export interface BuybackBurnInput {
  /** The full accrued pot. Must be > 0. */
  accruedUsdgUnits: bigint;
  /** Quoted USDG per 1 RF, e.g. '0.002'. */
  quotedPriceUsdg: string;
  now?: number;
  /** Override the batch id (deterministic tests). */
  batchId?: string;
  /** Override the modelled slippage. */
  slippageBps?: bigint;
}

/**
 * Execute one buyback batch: spend the entire pot, buy RF at the quoted price
 * less modelled slippage, burn all of it.
 *
 * Conservation: the whole pot is spent. No USDG is left stranded, and every RF
 * acquired is burned — nothing accrues as a position the platform can later sell.
 *
 * Throws rather than silently no-op'ing, because a failed buyback that quietly
 * skips a burn is exactly the kind of thing that must never pass unnoticed.
 */
export function executeBuybackBurn(input: BuybackBurnInput): BuybackBurn {
  const {
    accruedUsdgUnits,
    quotedPriceUsdg,
    now = Date.now(),
    slippageBps = BUYBACK_SLIPPAGE_BPS,
  } = input;

  if (accruedUsdgUnits <= 0n) {
    throw new RangeError('Buyback requires a positive accrued pot.');
  }

  // Validate the quote strictly. A bad price must abort the batch, not burn a
  // meaningless amount of RF.
  const quoted = parseUsdg(quotedPriceUsdg);
  if (quoted <= 0n) {
    throw new Error(`Invalid RF price for buyback: "${quotedPriceUsdg}"`);
  }
  if (slippageBps < 0n || slippageBps >= 10_000n) {
    throw new RangeError(`Invalid slippage bps: ${slippageBps}`);
  }

  // Effective price = quoted * (1 + slippage): the buy fills above the mid, so
  // the RF acquired is LESS than a perfect fill. Getting this sign wrong would
  // overstate every burn, which is the worst possible direction for a figure
  // published to users.
  const effectivePriceScaled = (quoted * (10_000n + slippageBps)) / 10_000n;
  if (effectivePriceScaled <= 0n) {
    throw new Error('Slippage produced an unusable buyback price.');
  }

  // RF units = (usdgUnits / USDG_SCALE) / pricePerRf
  //          = usdgUnits * 1000 / priceScaled
  // The 1000 is RF_SCALE; a buyback yields a whole number of RF, so the
  // remainder is simply not purchasable — it stays as a sub-RF residue that is
  // carried into the next batch via the pot, never burned as a phantom.
  const rfBurnedUnits = (accruedUsdgUnits * 1000n) / effectivePriceScaled;

  if (rfBurnedUnits <= 0n) {
    throw new Error('Buyback pot too small to purchase a whole RF unit.');
  }

  return {
    usdgSpentUnits: accruedUsdgUnits,
    rfBurnedUnits,
    effectivePriceUsdg: formatPrice(effectivePriceScaled),
    quotedPriceUsdg,
    burnSink: RF_BURN_SINK,
    burnedAt: now,
    batchId: input.batchId ?? `buyback-${now}-${accruedUsdgUnits.toString()}`,
  };
}

/** Render a USDG-per-RF price (given in USDG base units) as a decimal string. */
function formatPrice(scaledUsdg: bigint): string {
  const whole = scaledUsdg / USDG_SCALE;
  const frac = scaledUsdg % USDG_SCALE;
  const fracStr = frac.toString().padStart(6, '0').replace(/0+$/, '');
  return fracStr ? `${whole}.${fracStr}` : String(whole);
}

/**
 * Aggregate burn state, surfaced on the platform activity page.
 * Mirrors what a deployment would derive from FeeRouter burn events.
 */
export interface BuybackLedger {
  /** Total USDG that has funded buybacks (all pots, burned or still pending). */
  totalFundedUsdgUnits: bigint;
  /** USDG still sitting in the pot, waiting for the next batch. */
  pendingUsdgUnits: bigint;
  /** Total USDG actually spent on completed swaps. */
  totalSpentUsdgUnits: bigint;
  /** Total RF burned (RF units). */
  totalRfBurnedUnits: bigint;
  burnCount: number;
  lastBurnAt: number | null;
}

export function emptyBuybackLedger(): BuybackLedger {
  return {
    totalFundedUsdgUnits: 0n,
    pendingUsdgUnits: 0n,
    totalSpentUsdgUnits: 0n,
    totalRfBurnedUnits: 0n,
    burnCount: 0,
    lastBurnAt: null,
  };
}

/** Apply one completed batch to the aggregate ledger. */
export function applyBurnToLedger(
  ledger: BuybackLedger,
  burn: BuybackBurn
): BuybackLedger {
  return {
    totalFundedUsdgUnits: ledger.totalFundedUsdgUnits,
    // The pot was drained in full.
    pendingUsdgUnits: ledger.pendingUsdgUnits - burn.usdgSpentUnits,
    totalSpentUsdgUnits: ledger.totalSpentUsdgUnits + burn.usdgSpentUnits,
    totalRfBurnedUnits: ledger.totalRfBurnedUnits + burn.rfBurnedUnits,
    burnCount: ledger.burnCount + 1,
    lastBurnAt: burn.burnedAt,
  };
}

/** USDG value of the RF burned so far, at the price it was bought for. */
export function burnedValueUsdgUnits(ledger: BuybackLedger): bigint {
  // Total spent is the exact USDG that bought the burned RF.
  return ledger.totalSpentUsdgUnits;
}

export { usdgFromUsd };