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
const problems = [];
const money = (units, decimals) => BigInt(units) * 10n ** BigInt(decimals - 1);

// Expected value per pull, in currency units. A row pays `pays`; an item row is
// worth its redeemValue, which is what a player can later claim for.
function rowValue(key, decimals) {
  if (key === "nothing") return 0n;
  if (key === "cashback") return money(economy.cashback.pays, decimals);
  return money(economy.items[key].redeemValue, decimals);
}

function build(decimals) {
  const perGeneration = {};
  for (const [gen, rows] of Object.entries(economy.perGeneration)) {
    const weights = Object.values(rows);
    const total = weights.reduce((a, b) => a + b, 0);
    if (total !== BPS) problems.push(`generation ${gen}: weights sum to ${total}, expected ${BPS}`);

    const table = Object.entries(rows).map(([key, weight]) => {
      if (key === "nothing") return { weight };
      if (key === "cashback") return { weight, pays: economy.cashback.pays };
      return { weight, item: key };
    });

    let ev = 0n;
    for (const [key, weight] of Object.entries(rows)) ev += (rowValue(key, decimals) * BigInt(weight)) / BigInt(BPS);
    const rtpBps = (ev * BigInt(BPS)) / money(economy.pullPrice, decimals);
    perGeneration[gen] = { table, rtpBps };
  }
  return perGeneration;
}

const tables = build(18);

const manifest = {
  id: economy.id,
  title: economy.title,
  version: economy.version,
  client: "client/main.tsx",
  server: "server/index.ts",
  currency: "RF",
  display: { minAspectRatio: "9:16", maxAspectRatio: "21:9" },
  items: Object.fromEntries(
    Object.entries(economy.items).map(([id, item]) => {
      const declared = { name: item.name, description: item.description };
      if (item.image) declared.image = item.image;
      declared.redeemValue = item.redeemValue;
      return [id, declared];
    })
  ),
  actions: {
    pull: {
      type: "draw",
      label: "Pull the lever",
      description: `One pull of a Rare Arcade cabinet. Costs ${economy.pullPrice} RF. The arcade takes a 5% platform fee from your spend, from every cashback win, and from any backing you claim.`,
      price: economy.pullPrice,
      maxQuantity: 1,
      perGeneration: Object.fromEntries(
        Object.entries(tables).map(([gen, { table }]) => [gen, table])
      )
    },
    ...Object.fromEntries(
      Object.keys(economy.items).map((id) => [
        `claim${id[0].toUpperCase()}${id.slice(1)}`,
        {
          type: "redeem",
          label: "Claim the backing",
          description: `Burn a ${economy.items[id].name} and receive ${economy.items[id].redeemValue} RF — 95% of the ${economy.items[id].backing} RF that backed it. The arcade keeps 5%.`,
          redeems: id,
          maxQuantity: 1
        }
      ])
    )
  },
  leaderboards: { pulls: { order: "desc", operator: "best", reset: "never" } }
};

const out = JSON.stringify(manifest, null, 2) + "\n";
const target = join(root, "friendsdk.json");
const stale = readFileSync(target, "utf8") !== out;

for (const gen of Object.entries(tables)) {
  console.log(`  gen ${gen[0]}  RTP ${(Number(gen[1].rtpBps) / 100).toFixed(2)}%`);
}

if (problems.length) {
  console.error(problems.map((p) => `error: ${p}`).join("\n"));
  process.exit(1);
}

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