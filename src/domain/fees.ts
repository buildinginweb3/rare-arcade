/**
 * Platform fee routing for RARE ARCADE.
 *
 * Every pull charges a fixed 5.00% platform fee on the USDG spent, split two ways:
 *
 *   75% -> 0x927A1799125EAE57B6BDc573Ee5e0354cD343Db1   (primary treasury)
 *   25% -> a BUYBACK BUDGET that is swapped USDG -> RF on an AMM and the
 *          acquired RF is sent to a burn address (0x...dEaD).
 *
 * The remaining 95.00% goes to the machine creator/operator as receipts.
 *
 * Design note — why this split is stable for players:
 * the 25% share is denominated and ACCRUED in USDG. It only becomes RF at the
 * moment a batch executes, long after the pull that funded it. So a volatile RF
 * price can never move the fee a player was charged, nor any published RTP.
 * See `buyback.ts` for the batch mechanics and `web3/contracts.ts` for the
 * on-chain AMM venue.
 *
 * Conservation invariants (enforced at runtime, not just in tests):
 *   primaryFeeUnits + buybackFeeUnits === feeUnits
 *   feeUnits + creatorUnits           === spendUnits
 *   buyback spend                     === RF burned valuation (no residue)
 */

import { mulBps } from './rf.ts';

/** Platform fee taken from every pull: 500 bps = 5.00%. */
export const PLATFORM_FEE_BPS = 500n;
/** Creator receipts: 9500 bps = 95.00%. */
export const CREATOR_RECEIPTS_BPS = 9500n;

/** Share of the *platform fee* routed to the primary treasury wallet. */
export const FEE_PRIMARY_SHARE_BPS = 7500n; // 75.00% of the fee
/**
 * Share of the *platform fee* that funds RF buybacks.
 * Accrued in USDG; converted to RF and burned in batches.
 */
export const FEE_BUYBACK_SHARE_BPS = 2500n; // 25.00% of the fee

/** Primary treasury — receives 75% of platform fees as USDG. */
export const PLATFORM_PRIMARY_WALLET = '0x927A1799125EAE57B6BDc573Ee5e0354cD343Db1';

/**
 * Where bought RF is sent. The conventional dead address — RF sent here is
 * unrecoverable, which is the entire point of the buyback.
 *
 * Note the 25% share does NOT go here in USDG. It accrues in the fee router,
 * is swapped for RF on an AMM, and only the RF reaches this address.
 */
export const RF_BURN_SINK = '0x000000000000000000000000000000000000dEaD';

/**
 * @deprecated The partner treasury was retired. Its 25% share now funds RF
 * buybacks — see FEE_BUYBACK_SHARE_BPS. Kept only so historical records stay
 * readable; never route funds here.
 */
export const RETIRED_PARTNER_WALLET = '0x16B4297E0D804E711072Be361617D4E23C03c533';

export type FeeRecipientRole = 'PRIMARY' | 'BUYBACK';

export interface FeeRecipient {
  role: FeeRecipientRole;
  /** Treasury wallet (PRIMARY) or burn sink for the RF (BUYBACK). */
  address: string;
  /** Share of the platform fee, in bps of the fee (not of gross volume). */
  shareBps: bigint;
  shareLabel: string;
  /** What this share actually does. */
  destination: string;
}

/**
 * Ordered fee routing table. Rendered verbatim in the app; the deployed
 * FeeRouter must reproduce it exactly.
 */
export const PLATFORM_FEE_RECIPIENTS: readonly FeeRecipient[] = [
  {
    role: 'PRIMARY',
    address: PLATFORM_PRIMARY_WALLET,
    shareBps: FEE_PRIMARY_SHARE_BPS,
    shareLabel: '75%',
    destination: 'Platform treasury (USDG)',
  },
  {
    role: 'BUYBACK',
    address: RF_BURN_SINK,
    shareBps: FEE_BUYBACK_SHARE_BPS,
    shareLabel: '25%',
    destination: 'Buys $RAREFRIENDS on an AMM and burns it',
  },
] as const;

export interface PlatformFeeSplit {
  /** Total platform fee charged on this pull (USDG units). */
  feeUnits: bigint;
  /** 75% of the fee, sent to PLATFORM_PRIMARY_WALLET. */
  primaryFeeUnits: bigint;
  /**
   * 25% of the fee, ACCRUED as USDG into the buyback pot. Converted to RF and
   * burned later, in a batch — see `buyback.ts`.
   */
  buybackFeeUnits: bigint;
}

export interface PullSplit extends PlatformFeeSplit {
  /** 95% of spend, credited to the machine creator/operator. */
  creatorUnits: bigint;
}

/**
 * Splits a platform fee between the primary treasury and the RF buyback pot.
 * Remainder from integer division is assigned to the buyback share so the
 * split always conserves the fee exactly (no dust is created or destroyed).
 */
export function splitPlatformFee(feeUnits: bigint): {
  primaryUnits: bigint;
  buybackUnits: bigint;
} {
  if (feeUnits < 0n) {
    throw new RangeError(`Platform fee cannot be negative: ${feeUnits}`);
  }

  const primaryUnits = mulBps(feeUnits, FEE_PRIMARY_SHARE_BPS);
  const buybackUnits = feeUnits - primaryUnits;

  if (primaryUnits + buybackUnits !== feeUnits) {
    throw new Error('Platform fee split conservation invariant violated');
  }

  return { primaryUnits, buybackUnits };
}

/**
 * Splits a pull's USDG spend into platform fee (+ its two wallet shares) and
 * creator receipts. Fee is rounded down; creator receipts absorb the remainder
 * so the three amounts always sum back to the exact spend.
 */
export function calculatePullSplit(spendUnits: bigint): PullSplit {
  if (spendUnits <= 0n) {
    throw new RangeError('Pull price must be greater than zero');
  }

  const feeUnits = mulBps(spendUnits, PLATFORM_FEE_BPS);
  const creatorUnits = spendUnits - feeUnits;
  const { primaryUnits, buybackUnits } = splitPlatformFee(feeUnits);

  if (feeUnits + creatorUnits !== spendUnits) {
    throw new Error('Pull split conservation invariant violated');
  }
  if (primaryUnits + buybackUnits !== feeUnits) {
    throw new Error('Platform fee split conservation invariant violated');
  }

  return {
    feeUnits,
    primaryFeeUnits: primaryUnits,
    buybackFeeUnits: buybackUnits,
    creatorUnits,
  };
}

/**
 * Effective platform fee as a fraction of gross volume, accounting for the
 * fact that both fee and creator receipts are floored/rounded independently.
 * Equals PLATFORM_FEE_BPS for all realistic pull prices.
 */
export function effectiveFeeBpsFor(spendUnits: bigint): number {
  if (spendUnits <= 0n) return 0;
  return Number(mulBps(spendUnits, PLATFORM_FEE_BPS) * 10000n / spendUnits);
}