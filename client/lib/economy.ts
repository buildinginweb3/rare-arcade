/**
 * The arcade's economy, read from the same file that generates friendsdk.json.
 *
 * Nothing here invents numbers. The odds, the RTP and the backing all come from
 * economy.json, which scripts/gen-manifest.mjs turns into the on-chain
 * registration -- so what the cabinet publishes and what the keeper settles are
 * the same figures by construction.
 */

import economy from "./economy.json";
import { displayAmount, formatAmount, parseAmount } from "@rarefriends/friendsdk";

export { parseAmount, formatAmount, displayAmount };

export const PULL_PRICE = economy.pullPrice;
export const PLATFORM_FEE_BPS = economy.platformFeeBps;
export const CASHBACK = economy.cashback;
export const ITEMS = economy.items;
export const PER_GENERATION = economy.perGeneration as unknown as Readonly<
  Record<string, Readonly<Record<OddsKey, number>>>
>;

export type ItemId = keyof typeof ITEMS;
export type Generation = 1 | 2 | 3 | 4 | 5 | 6;
export type OddsKey = "nothing" | "cashback" | ItemId;

export const ITEM_IDS = Object.keys(ITEMS) as ItemId[];

export const BPS = 10_000;

/** A single weighted outcome of a pull. */
export type OddsRow = {
  key: OddsKey;
  weight: number;
  /** Currency units (whole RF) a win is worth: the cashback paid, or the
   *  backing a player can claim for the item. Zero for an empty pull. */
  value: string;
  label: string;
  /** Whether the payout takes the 5% platform fee, and how it is claimed. */
  kind: "empty" | "cashback" | "item";
};

/** The claim action name for an item, matching friendsdk.json. */
export function claimActionFor(item: ItemId): string {
  return `claim${item[0]!.toUpperCase()}${item.slice(1)}`;
}

/** The 5% the arcade keeps on a gross amount, rounded down. */
export function platformFeeOf(gross: string, decimals: number): bigint {
  const units = parseAmount(gross, decimals);
  return (units * BigInt(PLATFORM_FEE_BPS)) / BigInt(BPS);
}

/** What a player receives from `gross` once the 5% platform fee is taken. */
export function netOf(gross: string, decimals: number): bigint {
  return parseAmount(gross, decimals) - platformFeeOf(gross, decimals);
}

function rowsFor(generation: Generation): OddsRow[] {
  const rows = PER_GENERATION[String(generation)]!;
  return (Object.keys(rows) as OddsKey[]).map((key) => {
    if (key === "nothing") {
      return { key, weight: rows[key]!, value: "0", label: "NO PRIZE", kind: "empty" };
    }
    if (key === "cashback") {
      return {
        key,
        weight: rows[key]!,
        value: CASHBACK.pays,
        label: `${CASHBACK.gross} RF CASHBACK`,
        kind: "cashback",
      };
    }
    const item = ITEMS[key];
    return {
      key,
      weight: rows[key]!,
      value: item.redeemValue,
      label: item.name.toUpperCase(),
      kind: "item",
    };
  });
}

export function oddsFor(generation: Generation): OddsRow[] {
  return rowsFor(generation);
}

/** Expected value of one pull, in base units. */
export function evFor(generation: Generation, decimals: number): bigint {
  let ev = 0n;
  for (const row of rowsFor(generation)) {
    ev += (parseAmount(row.value, decimals) * BigInt(row.weight)) / BigInt(BPS);
  }
  return ev;
}

/** Return to player, in basis points, at the platform's declared terms. */
export function rtpBpsFor(generation: Generation, decimals: number): bigint {
  return (evFor(generation, decimals) * BigInt(BPS)) / parseAmount(PULL_PRICE, decimals);
}

export function percentOf(bps: bigint): string {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

/** Amounts come back from the SDK in base units; group them for players. */
export function rf(units: bigint, decimals: number): string {
  return displayAmount(units, decimals);
}

/** Exact, ungrouped form for the odds and prize tables. */
export function rfExact(units: bigint, decimals: number): string {
  return formatAmount(units, decimals);
}