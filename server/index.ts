import { defineGame } from "@rarefriends/friendsdk/server";

/**
 * Rare Arcade server rules.
 *
 * The pull itself is settled on chain by the keeper: `pull` is a `draw`, so
 * its randomness arrives from the platform coordinator rather than from
 * anything the browser chose. What the server owns is the arcade's own record
 * of how many pulls a Friend has made, and the leaderboard built from it.
 *
 * The odds, the RTP and the backing are NOT here. They live in
 * client/lib/economy.json, which generates friendsdk.json -- the same file the
 * chain settles against. Server state can never become a second, drifting copy
 * of the economy.
 */

type Cabinet = Readonly<{ pulls: number; genesisWon: number; generationsWon: number }>;

const EMPTY: Cabinet = { pulls: 0, genesisWon: 0, generationsWon: 0 };

export default defineGame({
  calls: {
    /** Loaded by FriendSession alongside holdings() before the cabinet renders. */
    load(ctx) {
      return ctx.data.get<Cabinet>("cabinet") ?? EMPTY;
    },
  },

  transactions: {
    /** Runs once per settled pull, so the count cannot drift from the chain. */
    pull(ctx, tx) {
      const cabinet = ctx.data.get<Cabinet>("cabinet") ?? EMPTY;
      let { genesisWon, generationsWon } = cabinet;
      const items = tx.items ?? {};
      if (items.genesisFriend) genesisWon += items.genesisFriend;
      if (items.genFriend) generationsWon += items.genFriend;

      const next: Cabinet = { pulls: cabinet.pulls + 1, genesisWon, generationsWon };
      ctx.data.set("cabinet", next);
      ctx.leaderboard("pulls").submit(next.pulls);
    },
  },
});