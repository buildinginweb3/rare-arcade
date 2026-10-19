/**
 * The arcade's economy, read from the same file that generates friendsdk.json.
 *
 * Nothing here invents numbers. The pull prices, the odds, the RTP and the
 * backing all come from economy.json, which scripts/gen-manifest.mjs turns into
 * the on-chain registration -- so what the cabinet publishes and what the keeper
 * settles are the same figures by construction.
 *
 * Backing is not a valuation. The arcade never estimates what a Rare Friend is
 * worth; it declares what it is willing to pay out of its prize pool. That is
 * why a fixed ladder is legitimate here and a price oracle would not be: the
 * number is a payout, not a price.
 */

import economy from "./economy.json";
import { displayAmount, formatAmount, parseAmount } from "@rarefriends/friendsdk";

export { parseAmount, formatAmount, displayAmount };

export const CURRENCY: string = economy.currency;
export const DECIMALS: number = CURRENCY === "USDG" ? 6 : 18;
export const PLATFORM_FEE_BPS: bigint = BigInt(economy.platformFeeBps);
export const TIERS = economy.tiers;
export const GENERATION_FACTORS: readonly number[] = economy.generationFactors;

export type TierKey = keyof typeof TIERS;
export type Tier = (typeof TIERS)[TierKey];
export type Generation = 1 | 2 | 3 | 4 | 5 | 6;
export type OddsKey = "nothing" | "cashback" | "genFriend" | "genesisFriend";

export const TIER_KEYS: readonly TierKey[] = Object.keys(TIERS) as TierKey[];
export const GENERATIONS: readonly Generation[] = [1, 2, 3, 4, 5, 6];

export const BPS = 10_000;

/** Backing minus the platform fee, exactly. Identical to scripts/gen-manifest.mjs. */
export function redeemValue(backing: string): string {
  const units = parseAmount(backing, DECIMALS);
  return formatAmount((units * (BigInt(BPS) - PLATFORM_FEE_BPS)) / BigInt(BPS), DECIMALS);
}

/** Every item the manifest declares, one per (tier, rarity). Identical to gen-manifest. */
export const ITEMS: Readonly<Record<string, ItemDef>> = (() => {
  const items: Record<string, ItemDef> = {};
  for (const tier of Object.values(TIERS)) {
    for (const [rarity, backing] of [["genFriend", tier.genBacking], ["genesisFriend", tier.genesisBacking]] as const) {
      const id = `${rarity}${backing}`;
      items[id] = {
        name: rarity === "genFriend" ? "Generations Friend" : "Genesis Friend",
        description: `A ${rarity === "genFriend" ? "Generations" : "Genesis"} Rare Friend won from the ${tier.label} cabinet, backed by ${backing} ${CURRENCY}. Keep it, or claim ${redeemValue(backing)} ${CURRENCY} — the arcade keeps 5%.`,
        backing,
        redeemValue: redeemValue(backing),
        tier: tier.label,
        rarity,
      };
    }
  }
  return items;
})();

export type ItemDef = Readonly<{
  name: string;
  description: string;
  backing: string;
  redeemValue: string;
  tier: string;
  rarity: "genFriend" | "genesisFriend";
}>;

export type ItemId = keyof typeof ITEMS;
export const ITEM_IDS: readonly ItemId[] = Object.keys(ITEMS) as ItemId[];

/** A declared item, or a loud failure if the id was never registered. */
export function itemOf(id: string): ItemDef {
  const item = ITEMS[id];
  if (!item) throw new Error(`Rare Arcade: unknown item "${id}"`);
  return item;
}

const cap = (id: string) => id[0]!.toUpperCase() + id.slice(1);

/** The draw action for a backing tier. */
export function pullActionFor(tier: TierKey): string {
  return `pull${cap(tier)}`;
}

/** The redeem action for a won Friend. */
export function claimActionFor(item: ItemId): string {
  return `claim${cap(item)}`;
}

/** The 5% the arcade keeps on a gross amount. */
export function platformFeeOf(gross: string): bigint {
  return (parseAmount(gross, DECIMALS) * PLATFORM_FEE_BPS) / BigInt(BPS);
}

/** What a player receives from `gross` once the 5% platform fee is taken. */
export function netOf(gross: string): bigint {
  return parseAmount(gross, DECIMALS) - platformFeeOf(gross);
}

/** A single weighted outcome of a pull. */
export type OddsRow = {
  key: OddsKey;
  item?: ItemId;
  weight: number;
  /** Currency units (whole tokens) a win is worth: the cashback paid, or the
   *  backing a player can claim for the Friend. Zero for an empty pull. */
  value: string;
  label: string;
  kind: "empty" | "cashback" | "item";
};

/**
 * The published table for a tier at a generation. Mirrors the perGeneration
 * tables the generator writes, including the generation factor.
 */
export function oddsFor(tier: TierKey, generation: Generation): OddsRow[] {
  const spec = TIERS[tier as keyof typeof TIERS];
  const base = spec.base;
  const factor = GENERATION_FACTORS[generation - 1]!;
  const nft = base.genFriend + base.genesisFriend;
  const scaled = Math.round(nft * factor);
  const genFriend = Math.round((base.genFriend / nft) * scaled);
  const rows = {
    nothing: BPS - scaled - base.cashback,
    cashback: base.cashback,
    genFriend,
    genesisFriend: scaled - genFriend,
  };

  const genId = `genFriend${spec.genBacking}` as ItemId;
  const genesisId = `genesisFriend${spec.genesisBacking}` as ItemId;

  return [
    { key: "nothing", weight: rows.nothing, value: "0", label: "NO PRIZE", kind: "empty" },
    {
      key: "cashback",
      weight: rows.cashback,
      value: spec.cashback.pays,
      label: `${spec.cashback.gross} ${CURRENCY} CASHBACK`,
      kind: "cashback",
    },
    {
      key: "genFriend",
      item: genId,
      weight: rows.genFriend,
      value: itemOf(genId).redeemValue,
      label: itemOf(genId).name.toUpperCase(),
      kind: "item",
    },
    {
      key: "genesisFriend",
      item: genesisId,
      weight: rows.genesisFriend,
      value: itemOf(genesisId).redeemValue,
      label: itemOf(genesisId).name.toUpperCase(),
      kind: "item",
    },
  ];
}

/** Expected value of one pull, in base units. */
export function evFor(tier: TierKey, generation: Generation): bigint {
  let ev = 0n;
  for (const row of oddsFor(tier, generation)) ev += (parseAmount(row.value, DECIMALS) * BigInt(row.weight)) / BigInt(BPS);
  return ev;
}

/** Return to player, in basis points, at the platform's declared terms. */
export function rtpBpsFor(tier: TierKey, generation: Generation): bigint {
  return (evFor(tier, generation) * BigInt(BPS)) / parseAmount(TIERS[tier as keyof typeof TIERS].price, DECIMALS);
}

export function percentOf(bps: bigint): string {
  return `${(Number(bps) / 100).toFixed(2)}%`;
}

/** Amounts come back from the SDK in base units; group them for players. */
export function money(units: bigint): string {
  return displayAmount(units, DECIMALS);
}

/** Exact, ungrouped form for the odds and prize tables. */
export function moneyExact(units: bigint): string {
  return formatAmount(units, DECIMALS);
}