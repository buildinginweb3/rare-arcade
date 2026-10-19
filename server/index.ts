import { defineGame, type Transaction, type TransactionContext } from "@rarefriends/friendsdk/server";

/**
 * Rare Arcade server rules.
 *
 * Each pull is settled on chain by the keeper: `pullStarter`, `pullClassic` and
 * `pullGrand` are `draw`s, so their randomness arrives from the platform
 * coordinator rather than from anything the browser chose. What the server owns
 * is the arcade's own record of how many pulls a Friend has made, and the
 * leaderboard built from it.
 *
 * The odds, the RTP and the backing are NOT here. They live in
 * client/lib/economy.json, which generates friendsdk.json -- the same file the
 * chain settles against. Server state can never become a second, drifting copy
 * of the economy.
 */

type Cabinet = Readonly<{ pulls: number; genesisWon: number; generationsWon: number }>;

const EMPTY: Cabinet = { pulls: 0, genesisWon: 0, generationsWon: 0 };

/** Tally a settled draw. Item ids are `genFriend<N>` / `genesisFriend<N>`. */
function record(ctx: TransactionContext, items: Transaction["items"]) {
  const cabinet = ctx.data.get<Cabinet>("cabinet") ?? EMPTY;
  let { genesisWon, generationsWon } = cabinet;
  for (const [id, count] of Object.entries(items ?? {})) {
    if (id.startsWith("genesisFriend")) genesisWon += count;
    else if (id.startsWith("genFriend")) generationsWon += count;
  }

  const next: Cabinet = { pulls: cabinet.pulls + 1, genesisWon, generationsWon };
  ctx.data.set("cabinet", next);
  ctx.leaderboard("pulls").submit(next.pulls);
}

export default defineGame({
  calls: {
    /** Loaded by FriendSession alongside holdings() before the cabinet renders. */
    load(ctx) {
      return ctx.data.get<Cabinet>("cabinet") ?? EMPTY;
    },
  },

  transactions: {
    /** Runs once per settled pull, so the count cannot drift from the chain. */
    pullStarter(ctx, tx) {
      record(ctx, tx.items);
    },
    pullClassic(ctx, tx) {
      record(ctx, tx.items);
    },
    pullGrand(ctx, tx) {
      record(ctx, tx.items);
    },
  },
});
