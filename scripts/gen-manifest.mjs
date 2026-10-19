// Writes friendsdk.json from client/lib/economy.json, which is the single source
// of truth for the economy. Both the client and the on-chain registration read
// the same numbers, so the odds the arcade publishes cannot drift from the odds
// the keeper settles.
//
//   node scripts/gen-manifest.mjs          write friendsdk.json
//   node scripts/gen-manifest.mjs --check  fail if friendsdk.json is stale

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const economy = JSON.parse(readFileSync(join(root, "client/lib/economy.json"), "utf8"));

const BPS = 10000;
const DECIMALS = economy.currency === "USDG" ? 6 : 18;
const problems = [];

/** Decimal string in currency units -> exact base units. No floats. */
const units = (text) => BigInt(text.replace(".", "")) * 10n ** BigInt(DECIMALS - (text.split(".")[1] ?? "").length);

/** Exact base units -> decimal string, trailing fraction trimmed. */
const format = (value) => {
  const s = value.toString().padStart(DECIMALS + 1, "0");
  const whole = s.slice(0, s.length - DECIMALS);
  const frac = s.slice(s.length - DECIMALS).replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole;
};

/** Backing minus the platform fee, exactly. Every backing here is a multiple of 20. */
const redeemValue = (backing) => format((units(backing) * (10000n - BigInt(economy.platformFeeBps))) / 10000n);

/** Every item the manifest declares, one per (tier, rarity). */
const items = {};
for (const tier of Object.values(economy.tiers)) {
  for (const [rarity, backing] of [["genFriend", tier.genBacking], ["genesisFriend", tier.genesisBacking]]) {
    const id = `${rarity}${backing}`;
    items[id] = {
      name: rarity === "genFriend" ? "Generations Friend" : "Genesis Friend",
      description: `A ${rarity === "genFriend" ? "Generations" : "Genesis"} Rare Friend won from the ${tier.label} cabinet, backed by ${backing} ${economy.currency}. Keep it, or claim ${redeemValue(backing)} ${economy.currency} — the arcade keeps 5%.`,
      backing,
      redeemValue: redeemValue(backing),
      tier: tier.label,
      rarity,
    };
  }
}

const cap = (id) => id[0].toUpperCase() + id.slice(1);
const claimAction = (id) => `claim${cap(id)}`;
const pullAction = (tier) => `pull${cap(tier)}`;

/**
 * Scale a tier's two NFT rows by the generation factor and hand the remainder
 * to "nothing". Cashback is the same for every generation: the generation edge
 * is expressed through how often you find a Friend, not through what a win pays.
 */
function tableFor(base, factor) {
  const nft = base.genFriend + base.genesisFriend;
  const scaled = Math.round(nft * factor);
  const genFriend = Math.round((base.genFriend / nft) * scaled);
  return { nothing: BPS - scaled - base.cashback, cashback: base.cashback, genFriend, genesisFriend: scaled - genFriend };
}

const perGenerationFor = (tier, decimals) => {
  const out = {};
  economy.generationFactors.forEach((factor, index) => {
    const generation = index + 1;
    const rows = tableFor(tier.base, factor);
    const table = [
      { weight: rows.nothing },
      { weight: rows.cashback, pays: tier.cashback.pays },
      { weight: rows.genFriend, item: `genFriend${tier.genBacking}` },
      { weight: rows.genesisFriend, item: `genesisFriend${tier.genesisBacking}` },
    ];

    const total = table.reduce((a, r) => a + r.weight, 0);
    if (total !== BPS) problems.push(`${tier.label} gen ${generation}: weights sum to ${total}`);

    let ev = 0n;
    for (const row of table) {
      const value = row.item ? units(items[row.item].redeemValue) : units(row.pays ?? "0");
      ev += (value * BigInt(row.weight)) / BigInt(BPS);
    }
    out[generation] = { table, rtpBps: (ev * BigInt(BPS)) / units(tier.price) };

    // A tier that drifts outside this band is a tuning mistake, not a design
    // choice: either a payout was mistyped or the weights were mis-summed.
    const rtp = Number(out[generation].rtpBps);
    if (rtp < 7000 || rtp > 10500) {
      problems.push(`${tier.label} gen ${generation}: RTP ${(rtp / 100).toFixed(2)}% is outside 70-105%`);
    }
  });
  return out;
};

const manifest = {
  id: economy.id,
  title: economy.title,
  version: economy.version,
  client: "client/main.tsx",
  server: "server/index.ts",
  currency: economy.currency,
  display: { minAspectRatio: "9:16", maxAspectRatio: "21:9" },
  items: Object.fromEntries(
    Object.entries(items).map(([id, item]) => [id, { name: item.name, description: item.description, redeemValue: item.redeemValue }])
  ),
  actions: {
    ...Object.fromEntries(
      Object.entries(economy.tiers).map(([key, tier]) => [
        pullAction(key),
        {
          type: "draw",
          label: `Pull the ${tier.label} cabinet`,
          description: `One pull for ${tier.price} ${economy.currency}. A Rare Friend from this cabinet is backed by ${tier.genBacking}–${tier.genesisBacking} ${economy.currency}. The arcade takes 5% of your spend, of every cashback win, and of any backing you claim.`,
          price: tier.price,
          maxQuantity: 1,
          perGeneration: Object.fromEntries(
            Object.entries(perGenerationFor(tier, DECIMALS)).map(([generation, { table }]) => [generation, table])
          ),
        },
      ])
    ),
    ...Object.fromEntries(
      Object.keys(items).map((id) => [
        claimAction(id),
        {
          type: "redeem",
          label: "Claim the backing",
          description: `Burn a ${items[id].name} and receive ${items[id].redeemValue} ${economy.currency} — 95% of the ${items[id].backing} ${economy.currency} that backed it. The arcade keeps 5%.`,
          redeems: id,
          maxQuantity: 1,
        },
      ])
    ),
  },
  leaderboards: { pulls: { order: "desc", operator: "best", reset: "never" } },
};

for (const [key, tier] of Object.entries(economy.tiers)) {
  const tables = perGenerationFor(tier, DECIMALS);
  const rtps = Object.values(tables).map((t) => (Number(t.rtpBps) / 100).toFixed(2));
  console.log(`  ${tier.label.padEnd(8)} ${tier.price.padStart(4)} ${economy.currency}  backing ${tier.genBacking}/${tier.genesisBacking}  RTP ${rtps[0]}% -> ${rtps[rtps.length - 1]}%`);
}

if (problems.length) {
  console.error(problems.map((p) => `error: ${p}`).join("\n"));
  process.exit(1);
}

const out = JSON.stringify(manifest, null, 2) + "\n";
const target = join(root, "friendsdk.json");
const stale = readFileSync(target, "utf8") !== out;

if (process.argv.includes("--check")) {
  if (stale) {
    console.error("error: friendsdk.json is stale — run: node scripts/gen-manifest.mjs");
    process.exit(1);
  }
  console.log("friendsdk.json is up to date.");
} else {
  writeFileSync(target, out);
  console.log(stale ? "wrote friendsdk.json" : "friendsdk.json already current");
}