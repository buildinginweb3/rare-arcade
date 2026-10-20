/**
 * Rare Arcade server rules.
 *
 * The machines themselves live in the arcade contract on Robinhood Chain: the
 * contract escrows the Rare Friends, the USDG prize pool and the backing, and
 * its keeper watcher reports every state change. This module is the arcade's
 * catalogue and receipt book. It mirrors what the watcher reports so the floor,
 * the creator cabinets and the claim shelf survive a reload, and it owns the
 * draft the create wizard builds before a transaction is sent.
 *
 * No amount is invented here. Prices, backing, ticket counts and the finite
 * deck come from the player's draft; the platform fee and RTP band are the
 * shared constants in shared/arcade.ts. The contract is the escrow.
 */

import {
  GameError,
  check,
  defineGame,
  type CallContext,
  type Json,
  type JsonInput,
  type Transaction,
  type TransactionContext,
} from "@rarefriends/friendsdk/server";
import {
  ADDRESS_PATTERN,
  CURRENCY,
  EMPTY_ME,
  EMPTY_STATS,
  MAX_BACKING,
  MAX_FUNDING,
  MAX_MACHINES_PER_CREATOR,
  MAX_NFT_PRIZES,
  MAX_PRICE,
  MAX_PRIZE_COPIES,
  MAX_RTP_BPS,
  MAX_TICKETS,
  MAX_TOTAL_MACHINES,
  MAX_USDG_LINES,
  MIN_BACKING,
  MIN_PRICE,
  MIN_RTP_BPS,
  MIN_TICKETS,
  NAME_PATTERN,
  NFT_STANDARDS,
  SHELLS,
  TOKEN_ID_PATTERN,
  claimIdOf,
  creatorShareOf,
  formatUnits,
  isNftStandard,
  nftKey,
  parseUnits,
  quoteDraft,
  summarizeMachine,
  unitsNumber,
  type ArcadeEventData,
  type Claim,
  type Draft,
  type DraftNft,
  type DraftUsdg,
  type EventMachine,
  type Machine,
  type MachineDetail,
  type Me,
  type NftStandard,
  type RecentWin,
  type Snapshot,
  type Stats,
  type TopEntry,
} from "../shared/arcade.ts";

const INDEX_KEY = "machineIndex";
const CLAIMS_KEY = "claimIndex";
const STATS_KEY = "stats";
const RECENT_KEY = "recentWins";
const CREATORS_KEY = "creatorIds";
const DRAFT_KEY = "draft";
const SELECTION_KEY = "selection";
const ME_KEY = "me";
const MACHINE_PREFIX = "machine:";
const CLAIM_PREFIX = "claim:";
const PULL_PREFIX = "pulled:";

type AnyContext = CallContext | TransactionContext;

function readIndex(ctx: AnyContext): string[] {
  return ctx.shared.get<string[]>(INDEX_KEY) ?? [];
}

function writeIndex(ctx: AnyContext, ids: readonly string[]): void {
  ctx.shared.set(INDEX_KEY, [...ids]);
}

function readClaimIndex(ctx: AnyContext): string[] {
  return ctx.shared.get<string[]>(CLAIMS_KEY) ?? [];
}

function readStats(ctx: AnyContext): Stats {
  return ctx.shared.get<Stats>(STATS_KEY) ?? EMPTY_STATS;
}

function writeStats(ctx: AnyContext, stats: Stats): void {
  ctx.shared.set(STATS_KEY, stats);
}

function readRecent(ctx: AnyContext): RecentWin[] {
  return ctx.shared.get<RecentWin[]>(RECENT_KEY) ?? [];
}

function readCreators(ctx: AnyContext): string[] {
  return ctx.shared.get<string[]>(CREATORS_KEY) ?? [];
}

function readMe(ctx: AnyContext): Me {
  return ctx.data.get<Me>(ME_KEY) ?? EMPTY_ME;
}

function writeMe(ctx: AnyContext, me: Me): void {
  ctx.data.set(ME_KEY, me);
}

function readMachines(ctx: AnyContext): Machine[] {
  const machines: Machine[] = [];
  for (const id of readIndex(ctx)) {
    const machine = ctx.shared.get<Machine>(MACHINE_PREFIX + id);
    if (machine) machines.push(machine);
  }
  return machines;
}

function machineOf(ctx: AnyContext, id: string): Machine | null {
  return ctx.shared.get<Machine>(MACHINE_PREFIX + id);
}

function storeMachine(ctx: AnyContext, machine: Machine): void {
  ctx.shared.set(MACHINE_PREFIX + machine.id, machine as unknown as JsonInput);
  const index = readIndex(ctx);
  if (!index.includes(machine.id)) {
    index.unshift(machine.id);
    writeIndex(ctx, index);
  }
}

function readClaims(ctx: AnyContext): Claim[] {
  const claims: Claim[] = [];
  for (const id of readClaimIndex(ctx)) {
    const claim = ctx.shared.get<Claim>(CLAIM_PREFIX + id);
    if (claim) claims.push(claim);
  }
  return claims;
}

function storeClaim(ctx: AnyContext, claim: Claim): void {
  ctx.shared.set(CLAIM_PREFIX + claim.id, claim as unknown as JsonInput);
  const index = readClaimIndex(ctx);
  if (!index.includes(claim.id)) {
    index.unshift(claim.id);
    ctx.shared.set(CLAIMS_KEY, index);
  }
}

function addRecent(ctx: AnyContext, entry: RecentWin): void {
  const recent = readRecent(ctx);
  recent.unshift(entry);
  ctx.shared.set(RECENT_KEY, recent.slice(0, 12));
}

function mergeState(machine: Machine, state: EventMachine): Machine {
  if (state.version <= machine.version) return machine;
  return {
    ...machine,
    status: state.status,
    pulled: state.pulled,
    pool: state.pool,
    backingPool: state.backingPool,
    usdgPool: state.usdgPool,
    receipts: state.receipts,
    version: state.version,
  };
}

function eventData(tx: Transaction): ArcadeEventData | null {
  const data = tx.data;
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (typeof record.machineId !== "string") return null;
  if (typeof record.machine !== "object" || record.machine === null || Array.isArray(record.machine)) return null;
  return data as unknown as ArcadeEventData;
}

function unitsOf(amount: string | undefined): bigint {
  return parseUnits(amount ?? "0") ?? 0n;
}

function nftStandardOf(value: unknown): NftStandard | null {
  return isNftStandard(value) ? value : null;
}

function addAmount(left: string | undefined, right: string | undefined): string {
  return formatUnits(unitsOf(left) + unitsOf(right));
}

function top(ctx: AnyContext, name: string): TopEntry[] {
  return ctx.leaderboard(name).top(5).map((entry) => ({ friendId: entry.friendId, score: entry.score }));
}

function snapshot(ctx: CallContext): Snapshot {
  const machines = readMachines(ctx);
  const mine = machines.filter((machine) => machine.creatorId === ctx.friend.id);
  const claims = readClaims(ctx).filter((claim) => claim.winnerId === ctx.friend.id && !claim.claimed);
  const draft = ctx.data.get<Draft>(DRAFT_KEY);
  return {
    me: readMe(ctx),
    machines: machines.filter((machine) => machine.status !== "cancelled").map(summarizeMachine),
    mine: mine.map(summarizeMachine),
    claims,
    recent: readRecent(ctx),
    stats: readStats(ctx),
    topWins: top(ctx, "biggestWin"),
    topCreators: top(ctx, "topCreator"),
    draft: draft ? quoteDraft(draft) : null,
    selection: ctx.data.get<Snapshot["selection"]>(SELECTION_KEY) ?? {},
  };
}

function detail(ctx: CallContext, id: string): MachineDetail {
  const machine = machineOf(ctx, id);
  if (!machine) throw new GameError("That machine is not on the arcade floor.");
  return {
    machine,
    claims: readClaims(ctx).filter((claim) => claim.machineId === id && !claim.claimed),
    recent: readRecent(ctx).filter((entry) => entry.machineId === id),
  };
}

function parseDraft(input: Json): Draft {
  const fields = check.object(
    input,
    ["name", "shell", "price", "ticketCount", "nftPrizes", "usdgPrizes"],
    [],
    "The machine draft is invalid."
  );
  const name = check.string(fields.name, 28, "Machine name", NAME_PATTERN, "Use 3-28 plain characters for the name.");
  const shell = check.oneOf(fields.shell, SHELLS, "Cabinet shell");
  const priceText = check.string(fields.price, 16, "Pull price");
  const price = parseUnits(priceText);
  if (price === null || price < MIN_PRICE || price > MAX_PRICE) {
    throw new GameError(`The pull price must be between 0.1 and 1,000 ${CURRENCY}.`);
  }
  const ticketCount = check.int(fields.ticketCount, MIN_TICKETS, MAX_TICKETS, "Tickets");

  const rawNfts = fields.nftPrizes;
  if (!Array.isArray(rawNfts) || rawNfts.length > MAX_NFT_PRIZES) {
    throw new GameError(`A machine can stock up to ${MAX_NFT_PRIZES} NFTs.`);
  }
  const nftPrizes: DraftNft[] = [];
  const seen = new Set<string>();
  for (const value of rawNfts) {
    const prize = check.object(value, ["contract", "tokenId", "standard", "backing"], [], "An NFT prize is invalid.");
    const contract = check
      .string(prize.contract, 42, "NFT contract", ADDRESS_PATTERN, "Use the NFT contract's 0x address.")
      .toLowerCase();
    const tokenId = check.string(prize.tokenId, 78, "NFT token", TOKEN_ID_PATTERN, "Use a decimal NFT token id.");
    const key = nftKey(contract, tokenId);
    if (seen.has(key)) throw new GameError("That NFT appears twice in the machine.");
    seen.add(key);
    const standard = check.oneOf(prize.standard, NFT_STANDARDS, "NFT standard");
    const backing = parseUnits(check.string(prize.backing, 16, "NFT backing"));
    if (backing === null || backing < MIN_BACKING || backing > MAX_BACKING) {
      throw new GameError(`NFT backing must be between 0.1 and 10,000 ${CURRENCY}.`);
    }
    nftPrizes.push({ contract, tokenId, standard, backing: formatUnits(backing) });
  }

  const rawUsdg = fields.usdgPrizes;
  if (!Array.isArray(rawUsdg) || rawUsdg.length > MAX_USDG_LINES) {
    throw new GameError(`A machine can have up to ${MAX_USDG_LINES} USDG prize lines.`);
  }
  const usdgPrizes: DraftUsdg[] = [];
  for (const value of rawUsdg) {
    const prize = check.object(value, ["amount", "count"], [], "A USDG prize is invalid.");
    const amount = parseUnits(check.string(prize.amount, 16, "USDG prize"));
    if (amount === null || amount < MIN_BACKING) throw new GameError(`A USDG prize must be at least 0.1 ${CURRENCY}.`);
    const count = check.int(prize.count, 1, MAX_PRIZE_COPIES, "Prize copies");
    usdgPrizes.push({ amount: formatUnits(amount), count });
  }

  const draft: Draft = { name, shell, price: formatUnits(price), ticketCount, nftPrizes, usdgPrizes };
  const quote = quoteDraft(draft);
  if (quote.prizeTickets < 1) throw new GameError("Stock at least one prize.");
  if (quote.prizeTickets > draft.ticketCount) throw new GameError("There are more prize tickets than tickets in the deck.");
  if (unitsOf(quote.funding) > MAX_FUNDING) throw new GameError("That machine is too heavily stocked.");
  if (quote.floorRtpBps < MIN_RTP_BPS || quote.floorRtpBps > MAX_RTP_BPS) {
    throw new GameError(`The floor RTP must be between ${MIN_RTP_BPS / 100}% and ${MAX_RTP_BPS / 100}%.`);
  }
  return draft;
}

function activeMachineCount(ctx: AnyContext): number {
  return readMachines(ctx).filter((machine) => machine.creatorId === ctx.friend.id && machine.status !== "cancelled").length;
}

function floorMachineCount(ctx: AnyContext): number {
  return readMachines(ctx).filter((machine) => machine.status !== "cancelled").length;
}

function selectedMachine(ctx: AnyContext): Machine {
  const selection = ctx.data.get<Snapshot["selection"]>(SELECTION_KEY);
  if (!selection?.machineId) throw new GameError("Choose a machine first.");
  const machine = machineOf(ctx, selection.machineId);
  if (!machine) throw new GameError("That machine is not on the arcade floor.");
  return machine;
}

function creatorMachine(ctx: AnyContext): Machine {
  const machine = selectedMachine(ctx);
  if (machine.creatorId !== ctx.friend.id) throw new GameError("Only this machine's creator can do that.");
  return machine;
}

/**
 * External handlers run on every state change. The deck position is the pull's
 * identity: a pending event may carry only the state, and the settled event
 * carries the prize. Count the pull from the state change, process the prize
 * once, and never let a second report of the same position pay twice.
 */
function countPull(ctx: TransactionContext, machine: Machine, data: ArcadeEventData, newPull: boolean): Machine {
  const share = creatorShareOf(unitsOf(machine.price));
  let nextLifetime = machine.lifetimeReceipts;
  let nextMachine = machine;

  if (newPull) {
    nextLifetime = formatUnits(unitsOf(nextLifetime) + share);
    nextMachine = { ...machine, lifetimeReceipts: nextLifetime };
    const me = readMe(ctx);
    writeMe(ctx, { ...me, pulls: me.pulls + 1 });
    const stats = readStats(ctx);
    writeStats(ctx, { ...stats, pulls: stats.pulls + 1 });
  }

  const marker = `${PULL_PREFIX}${machine.id}:${data.ticketIndex ?? data.machine.pulled}`;
  if (data.result === undefined || ctx.shared.get<boolean>(marker) === true) return nextMachine;
  ctx.shared.set(marker, true);

  const me = readMe(ctx);
  let wins = me.wins;
  let paid = readStats(ctx).paid;
  let nftPrizes = machine.nftPrizes;
  let usdgPrizes = machine.usdgPrizes;

  if (data.result === "usdg" && data.amount) {
    wins += 1;
    paid = addAmount(paid, data.amount);
    const units = unitsOf(data.amount);
    if (units > 0n) ctx.leaderboard("biggestWin").submit(unitsNumber(units));
    usdgPrizes = machine.usdgPrizes.map((prize) =>
      prize.amount === data.amount && prize.won < prize.count ? { ...prize, won: prize.won + 1 } : prize
    );
    addRecent(ctx, {
      machineId: machine.id,
      machineName: machine.name,
      playerId: ctx.friend.id,
      generation: ctx.friend.generation,
      kind: "usdg",
      amount: data.amount,
      at: ctx.now,
    });
  } else if (data.result === "nft" && data.contract && data.tokenId && data.backing) {
    const standard = nftStandardOf(data.standard);
    if (standard) {
      wins += 1;
      const units = unitsOf(data.backing);
      if (units > 0n) ctx.leaderboard("biggestWin").submit(unitsNumber(units));
      const wonKey = nftKey(data.contract, data.tokenId);
      nftPrizes = machine.nftPrizes.map((prize) =>
        nftKey(prize.contract, prize.tokenId) === wonKey ? { ...prize, won: true } : prize
      );
      storeClaim(ctx, {
        id: claimIdOf(machine.id, data.contract, data.tokenId),
        machineId: machine.id,
        machineName: machine.name,
        contract: data.contract,
        tokenId: data.tokenId,
        standard,
        backing: data.backing,
        winnerId: ctx.friend.id,
        winnerGeneration: ctx.friend.generation,
        wonAt: ctx.now,
        claimed: false,
      });
      addRecent(ctx, {
        machineId: machine.id,
        machineName: machine.name,
        playerId: ctx.friend.id,
        generation: ctx.friend.generation,
        kind: "nft",
        contract: data.contract,
        tokenId: data.tokenId,
        standard,
        backing: data.backing,
        at: ctx.now,
      });
    }
  }

  nextMachine = { ...nextMachine, nftPrizes, usdgPrizes };
  writeMe(ctx, { ...readMe(ctx), wins });
  writeStats(ctx, { ...readStats(ctx), paid });

  if (newPull && ctx.friend.id === machine.creatorId) {
    const me = readMe(ctx);
    const total = formatUnits(unitsOf(me.lifetimeReceipts) + share);
    writeMe(ctx, { ...me, lifetimeReceipts: total });
    ctx.leaderboard("topCreator").submit(unitsNumber(unitsOf(total)));
  }
  return nextMachine;
}

function claimIntent(ctx: CallContext) {
  const selection = ctx.data.get<Snapshot["selection"]>(SELECTION_KEY);
  if (!selection?.claimId) throw new GameError("Choose a won NFT first.");
  const claim = ctx.shared.get<Claim>(CLAIM_PREFIX + selection.claimId);
  if (!claim || claim.claimed || claim.winnerId !== ctx.friend.id) {
    throw new GameError("That won NFT is not yours to settle.");
  }
  return {
    machineId: claim.machineId,
    claimId: claim.id,
    contract: claim.contract,
    tokenId: claim.tokenId,
    standard: claim.standard,
  };
}

export default defineGame({
  calls: {
    /** FriendSession loads this together with holdings() before the floor renders. */
    load(ctx) {
      return snapshot(ctx);
    },

    /** Refresh the floor, the creator cabinet and the claim shelf. */
    catalog(ctx) {
      return snapshot(ctx);
    },

    /** One machine's full stock list and its unclaimed winners. */
    machine(ctx, input) {
      const fields = check.object(input, ["id"], [], "Choose a machine.");
      const id = check.string(fields.id, 64, "Machine", /^[A-Za-z0-9:-]{1,64}$/);
      return detail(ctx, id);
    },

    /** Validate the create wizard and keep its draft until the contract opens it. */
    savedraft(ctx, input) {
      if (floorMachineCount(ctx) >= MAX_TOTAL_MACHINES) {
        throw new GameError("The arcade floor is full.");
      }
      const count = activeMachineCount(ctx);
      if (count >= MAX_MACHINES_PER_CREATOR) {
        throw new GameError(`You already have ${MAX_MACHINES_PER_CREATOR} machines on the floor.`);
      }
      const draft = parseDraft(input);
      ctx.data.set(DRAFT_KEY, draft as unknown as JsonInput);
      return quoteDraft(draft);
    },

    cleardraft(ctx) {
      ctx.data.delete(DRAFT_KEY);
      return null;
    },

    /** Point the next external action at one machine and, for a claim, one won NFT. */
    select(ctx, input) {
      const fields = check.object(input, [], ["machineId", "claimId"], "Choose a machine.");
      const machineId =
        fields.machineId === undefined ? undefined : check.string(fields.machineId, 64, "Machine", /^[A-Za-z0-9:-]{1,64}$/);
      const claimId =
        fields.claimId === undefined
          ? undefined
          : check.string(fields.claimId, 200, "Claim", /^[A-Za-z0-9:._-]{1,200}$/);
      if (machineId !== undefined && !machineOf(ctx, machineId)) {
        throw new GameError("That machine is not on the arcade floor.");
      }
      if (claimId !== undefined) {
        const claim = ctx.shared.get<Claim>(CLAIM_PREFIX + claimId);
        if (!claim || claim.winnerId !== ctx.friend.id || claim.claimed) {
          throw new GameError("That NFT is not on your claim shelf.");
        }
        if (machineId !== undefined && claim.machineId !== machineId) {
          throw new GameError("That NFT did not come from this machine.");
        }
      }
      ctx.data.set(SELECTION_KEY, {
        ...(machineId !== undefined && { machineId }),
        ...(claimId !== undefined && { claimId }),
      });
      return null;
    },
  },

  intents: {
    createMachine(ctx) {
      if (floorMachineCount(ctx) >= MAX_TOTAL_MACHINES) {
        throw new GameError("The arcade floor is full.");
      }
      if (activeMachineCount(ctx) >= MAX_MACHINES_PER_CREATOR) {
        throw new GameError(`You already have ${MAX_MACHINES_PER_CREATOR} machines on the floor.`);
      }
      const draft = ctx.data.get<Draft>(DRAFT_KEY);
      if (!draft) throw new GameError("Build a machine before opening it.");
      const quote = quoteDraft(draft);
      if (quote.prizeTickets < 1) throw new GameError("Stock at least one prize.");
      return { draft };
    },

    pull(ctx) {
      const machine = selectedMachine(ctx);
      if (machine.status !== "live") throw new GameError("That machine is not taking pulls.");
      return { machineId: machine.id };
    },

    keepPrize(ctx) {
      return claimIntent(ctx);
    },

    claimBacking(ctx) {
      return claimIntent(ctx);
    },

    withdrawMachine(ctx) {
      return { machineId: creatorMachine(ctx).id };
    },

    pauseMachine(ctx) {
      return { machineId: creatorMachine(ctx).id };
    },

    resumeMachine(ctx) {
      return { machineId: creatorMachine(ctx).id };
    },

    cancelMachine(ctx) {
      return { machineId: creatorMachine(ctx).id };
    },
  },

  transactions: {
    /** The contract opened a machine; mirror the draft and start the catalogue entry. */
    createMachine(ctx, tx) {
      const data = eventData(tx);
      if (!data) return;
      const existing = machineOf(ctx, data.machineId);
      if (existing) {
        const next = mergeState(existing, data.machine);
        if (next !== existing) storeMachine(ctx, next);
        return;
      }
      const draft = ctx.data.get<Draft>(DRAFT_KEY);
      if (!draft) {
        ctx.log(`createMachine ${data.machineId}: received without a draft.`);
        return;
      }
      const quote = quoteDraft(draft);
      const machine: Machine = {
        id: data.machineId,
        name: draft.name,
        shell: draft.shell,
        creatorId: ctx.friend.id,
        creatorGeneration: ctx.friend.generation,
        creatorFamily: ctx.friend.family.name,
        price: draft.price,
        ticketCount: draft.ticketCount,
        pulled: data.machine.pulled,
        status: data.machine.status,
        nftPrizes: draft.nftPrizes.map((prize) => ({
          contract: prize.contract,
          tokenId: prize.tokenId,
          standard: prize.standard,
          backing: prize.backing,
          won: false,
        })),
        usdgPrizes: draft.usdgPrizes.map((prize) => ({ ...prize, won: 0 })),
        prizeValue: quote.funding,
        pool: data.machine.pool,
        backingPool: data.machine.backingPool,
        usdgPool: data.machine.usdgPool,
        receipts: data.machine.receipts,
        lifetimeReceipts: "0",
        version: data.machine.version,
        createdAt: ctx.now,
      };
      storeMachine(ctx, machine);
      ctx.data.delete(DRAFT_KEY);

      const me = readMe(ctx);
      writeMe(ctx, { ...me, created: me.created + 1 });
      const creators = readCreators(ctx);
      if (!creators.includes(ctx.friend.id)) {
        creators.push(ctx.friend.id);
        ctx.shared.set(CREATORS_KEY, creators);
      }
      const stats = readStats(ctx);
      writeStats(ctx, { ...stats, machines: stats.machines + 1, creators: creators.length });
    },

    /** A pull is one ticket. Count it once, then mirror the win. */
    pull(ctx, tx) {
      const data = eventData(tx);
      if (!data) return;
      const existing = machineOf(ctx, data.machineId);
      if (!existing) return;
      const newPull = data.machine.pulled > existing.pulled;
      const merged = mergeState(existing, data.machine);
      const machine = countPull(ctx, merged, data, newPull);
      if (machine !== existing) storeMachine(ctx, machine);
    },

    /** The winner kept the NFT; its backing returns to the creator's receipts. */
    keepPrize(ctx, tx) {
      const data = eventData(tx);
      if (!data) return;
      const existing = machineOf(ctx, data.machineId);
      let machine = existing ? mergeState(existing, data.machine) : null;
      if (!data.contract || !data.tokenId) {
        if (machine && machine !== existing) storeMachine(ctx, machine);
        return;
      }
      const id = claimIdOf(data.machineId, data.contract, data.tokenId);
      const claim = ctx.shared.get<Claim>(CLAIM_PREFIX + id);
      if (!claim || claim.claimed) {
        if (machine && machine !== existing) storeMachine(ctx, machine);
        return;
      }
      if (machine) {
        machine = { ...machine, lifetimeReceipts: addAmount(machine.lifetimeReceipts, claim.backing) };
        storeMachine(ctx, machine);
      }
      storeClaim(ctx, { ...claim, claimed: true, settledAs: "kept" });
    },

    /** The winner took the money. The NFT returns to its creator; record the payout. */
    claimBacking(ctx, tx) {
      const data = eventData(tx);
      if (!data?.contract || !data.tokenId) return;
      const existing = machineOf(ctx, data.machineId);
      if (existing) {
        const next = mergeState(existing, data.machine);
        if (next !== existing) storeMachine(ctx, next);
      }
      const id = claimIdOf(data.machineId, data.contract, data.tokenId);
      const claim = ctx.shared.get<Claim>(CLAIM_PREFIX + id);
      if (!claim || claim.claimed) return;
      const backing = claim.backing;
      storeClaim(ctx, { ...claim, claimed: true, settledAs: "backing" });
      const me = readMe(ctx);
      writeMe(ctx, { ...me, claimed: addAmount(me.claimed, backing) });
      const stats = readStats(ctx);
      writeStats(ctx, { ...stats, paid: addAmount(stats.paid, backing) });
    },

    /** Creator receipts moved from the contract to the creator's wallet. */
    withdrawMachine(ctx, tx) {
      const data = eventData(tx);
      if (!data) return;
      const existing = machineOf(ctx, data.machineId);
      if (!existing) return;
      const next = mergeState(existing, data.machine);
      if (next !== existing) storeMachine(ctx, next);
      const me = readMe(ctx);
      ctx.leaderboard("topCreator").submit(unitsNumber(unitsOf(me.lifetimeReceipts)));
    },

    pauseMachine(ctx, tx) {
      const data = eventData(tx);
      if (!data) return;
      const existing = machineOf(ctx, data.machineId);
      if (!existing) return;
      const next = mergeState(existing, data.machine);
      if (next !== existing) storeMachine(ctx, next);
    },

    resumeMachine(ctx, tx) {
      const data = eventData(tx);
      if (!data) return;
      const existing = machineOf(ctx, data.machineId);
      if (!existing) return;
      const next = mergeState(existing, data.machine);
      if (next !== existing) storeMachine(ctx, next);
    },

    /** Before its first pull a machine can be emptied. The refund is in tx.paid. */
    cancelMachine(ctx, tx) {
      const data = eventData(tx);
      if (!data) return;
      const existing = machineOf(ctx, data.machineId);
      if (!existing) return;
      const next = mergeState(existing, data.machine);
      if (next !== existing) storeMachine(ctx, next);
    },
  },
});
