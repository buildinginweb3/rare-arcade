/**
 * The dev stand-in for the Rare Arcade contract.
 *
 * `friendsdk dev` bundles this file, calls its default export with the dev
 * simulation API and the `dev.external["arcade-v1"].options` object, and then
 * runs the returned watcher in the dev keeper. The relay below is what the dev
 * website would otherwise proxy to the real contract adapter.
 *
 * It is a small in-memory escrow: it owns the deck, the USDG pool, the NFT
 * custody and the creator receipts. Nothing here ships: `friendsdk build` drops
 * `dev`. The production adapter and contract are Rare Friends-authored; this is
 * the executable specification of what they have to do.
 */

import type {
  DevExecuteRequest,
  DevRelay,
  DevSimApi,
  DevStubFactory,
} from "@rarefriends/friendsdk/dev";
import type {
  ChainEvent,
  ExternalEvent,
  Submitted,
  Watcher,
  WatcherCycle,
  WatcherInit,
  WatcherLane,
} from "@rarefriends/friendsdk/keeper";
import {
  CURRENCY,
  ITEM_IDS,
  MAX_BACKING,
  MAX_FUNDING,
  MAX_NFT_PRIZES,
  MAX_PRIZE_COPIES,
  MAX_TICKETS,
  MAX_USDG_LINES,
  MIN_BACKING,
  MIN_PRICE,
  MIN_RTP_BPS,
  MAX_PRICE,
  MAX_RTP_BPS,
  NAME_PATTERN,
  SHELLS,
  TOKEN_ID_PATTERN,
  creatorShareOf,
  eventMachine,
  feeOf,
  formatUnits,
  parseUnits,
  quoteDraft,
  type ArcadeEventData,
  type ArcadeIntent,
  type Draft,
  type DraftNft,
  type DraftUsdg,
  type EventMachine,
  type ItemId,
  type Machine,
  type MachineStatus,
  type Shell,
} from "../shared/arcade.ts";

const ADAPTER = "arcade-v1";
const DEMO_BASE = 900_000n;

type Hash = `0x${string}`;
type TokenOwner =
  | Readonly<{ kind: "friend"; friendId: string; wallet: string }>
  | Readonly<{ kind: "owner"; account: string }>
  | Readonly<{ kind: "machine"; machineId: string }>;

type HeldToken = Readonly<{
  id: string;
  item: ItemId;
  owner: TokenOwner;
}>;

type DeckEntry =
  | Readonly<{ kind: "blank" }>
  | Readonly<{ kind: "usdg"; amount: bigint }>
  | Readonly<{ kind: "nft"; tokenId: string; item: ItemId; backing: bigint }>;

type NftPrize = Readonly<{
  tokenId: string;
  item: ItemId;
  backing: bigint;
  won: boolean;
}>;

type UsdgPrize = Readonly<{
  amount: bigint;
  count: number;
  won: number;
}>;

type ClaimBack = Readonly<{
  machineId: string;
  tokenId: string;
  item: ItemId;
  backing: bigint;
  winnerId: string;
}>;

type InternalMachine = {
  id: string;
  name: string;
  shell: Shell;
  creatorId: string;
  creatorGeneration: number;
  creatorFamily: string;
  creatorAccount: string;
  creatorWallet: string;
  price: bigint;
  ticketCount: number;
  deck: readonly DeckEntry[];
  next: number;
  status: MachineStatus;
  nftPrizes: NftPrize[];
  usdgPrizes: UsdgPrize[];
  prizeValue: bigint;
  backingPool: bigint;
  usdgPool: bigint;
  receipts: bigint;
  fees: bigint;
  lifetimeReceipts: bigint;
  version: number;
  createdAt: number;
};

type PendingEvent = Omit<
  ExternalEvent,
  | "kind"
  | "adapter"
  | "module"
  | "gameId"
  | "id"
  | "action"
  | "friendId"
  | "wallet"
  | "generation"
  | "quantity"
>;

type Op = Readonly<{
  id: string;
  laneKey: string;
  action: string;
  hash: Hash;
  friendId: string;
  wallet: string;
  generation: number;
  quantity: number;
  event: PendingEvent;
}>;

type Options = Readonly<{
  demoFriends: number;
}>;

const OPTIONS: Options = Object.freeze({ demoFriends: 4 });

function parseOptions(raw: unknown): Options {
  if (typeof raw !== "object" || raw === null) return OPTIONS;
  const value = raw as Record<string, unknown>;
  const demo = value.demoFriends;
  if (typeof demo !== "number" || !Number.isInteger(demo) || demo < 0 || demo > 8) return OPTIONS;
  return Object.freeze({ demoFriends: demo });
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function amountOf(units: bigint): string {
  return formatUnits(units);
}

function isShell(value: unknown): value is Shell {
  return typeof value === "string" && (SHELLS as readonly string[]).includes(value);
}

function isItem(value: unknown): value is ItemId {
  return typeof value === "string" && (ITEM_IDS as readonly string[]).includes(value);
}

function parseDraft(raw: unknown): Draft {
  const object = asObject(raw);
  if (!object) throw new Error("This machine draft is unreadable.");
  const name = typeof object.name === "string" ? object.name : "";
  if (!NAME_PATTERN.test(name)) throw new Error("Give the machine a name (3-28 plain characters).");
  if (!isShell(object.shell)) throw new Error("Choose one of the four cabinet shells.");
  const price = parseUnits(object.price);
  if (price === null || price < MIN_PRICE || price > MAX_PRICE) throw new Error("The pull price is out of range.");
  const ticketCount = typeof object.ticketCount === "number" ? object.ticketCount : 0;
  if (!Number.isInteger(ticketCount) || ticketCount < 2 || ticketCount > MAX_TICKETS) {
    throw new Error("A machine needs 2-1,000 tickets.");
  }
  if (!Array.isArray(object.nftPrizes) || object.nftPrizes.length > MAX_NFT_PRIZES) {
    throw new Error("A machine can stock up to 16 Rare Friends.");
  }
  if (!Array.isArray(object.usdgPrizes) || object.usdgPrizes.length > MAX_USDG_LINES) {
    throw new Error("A machine can have up to 8 USDG prize lines.");
  }
  const nftPrizes: DraftNft[] = [];
  const seen = new Set<string>();
  for (const rawPrize of object.nftPrizes) {
    const prize = asObject(rawPrize);
    if (!prize) throw new Error("A Rare Friend prize is unreadable.");
    const tokenId = typeof prize.tokenId === "string" ? prize.tokenId : "";
    if (!TOKEN_ID_PATTERN.test(tokenId) || seen.has(tokenId)) throw new Error("A Rare Friend prize repeats a token.");
    seen.add(tokenId);
    if (!isItem(prize.item)) throw new Error("A Rare Friend prize has an unknown type.");
    const backing = parseUnits(prize.backing);
    if (backing === null || backing < MIN_BACKING || backing > MAX_BACKING) throw new Error("A Friend backing is out of range.");
    nftPrizes.push({ tokenId, item: prize.item, backing: formatUnits(backing) });
  }
  const usdgPrizes: DraftUsdg[] = [];
  for (const rawPrize of object.usdgPrizes) {
    const prize = asObject(rawPrize);
    if (!prize) throw new Error("A USDG prize is unreadable.");
    const amount = parseUnits(prize.amount);
    if (amount === null || amount < MIN_BACKING) throw new Error("A USDG prize is too small.");
    const count = typeof prize.count === "number" ? prize.count : 0;
    if (!Number.isInteger(count) || count < 1 || count > MAX_PRIZE_COPIES) throw new Error("A USDG prize line has a bad count.");
    usdgPrizes.push({ amount: formatUnits(amount), count });
  }
  const draft: Draft = { name, shell: object.shell, price: formatUnits(price), ticketCount, nftPrizes, usdgPrizes };
  const quote = quoteDraft(draft);
  if (quote.prizeTickets < 1) throw new Error("Stock at least one prize.");
  if (quote.prizeTickets > draft.ticketCount) throw new Error("There are more prize tickets than tickets in the deck.");
  const funding = parseUnits(quote.funding) ?? 0n;
  if (funding > MAX_FUNDING) throw new Error("That machine is too heavily stocked.");
  if (quote.floorRtpBps < MIN_RTP_BPS || quote.floorRtpBps > MAX_RTP_BPS) {
    throw new Error(`The floor RTP must be between ${MIN_RTP_BPS / 100}% and ${MAX_RTP_BPS / 100}%.`);
  }
  return draft;
}

function intentOf(request: { intent: unknown }): ArcadeIntent {
  const intent = asObject(request.intent);
  if (!intent) throw new Error("The game sent no machine instruction.");
  return intent as ArcadeIntent;
}

function intentMachine(intent: ArcadeIntent): string {
  if (typeof intent.machineId !== "string" || intent.machineId.length === 0) throw new Error("Choose a machine first.");
  return intent.machineId;
}

function intentToken(intent: ArcadeIntent): string {
  if (typeof intent.tokenId !== "string" || !TOKEN_ID_PATTERN.test(intent.tokenId)) throw new Error("Choose a Friend first.");
  return intent.tokenId;
}

function shuffle<T>(items: T[], seed: bigint): T[] {
  let state = seed & 0xffffffffffffffffn;
  if (state === 0n) state = 0x9e3779b97f4a7c15n;
  const next = () => {
    state ^= state << 13n;
    state ^= state >> 7n;
    state ^= state << 17n;
    state &= 0xffffffffffffffffn;
    return Number(state % 1_000_000n) / 1_000_000;
  };
  for (let index = items.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1));
    const left = items[index];
    const right = items[swap];
    if (left === undefined || right === undefined) continue;
    items[index] = right;
    items[swap] = left;
  }
  return items;
}

const stub: DevStubFactory = (sim: DevSimApi, rawOptions?: unknown) => {
  const options = parseOptions(rawOptions);
  const machines = new Map<string, InternalMachine>();
  const tokens = new Map<string, HeldToken>();
  const claims = new Map<string, ClaimBack>();
  const ops: Op[] = [];
  const demoGranted = new Set<string>();
  let machineSeq = 0;
  let demoSeq = 0;
  let opSeq = 0;
  let lanes = new Map<string, WatcherLane>();

  const publicMachine = (machine: InternalMachine): Machine => ({
    id: machine.id,
    name: machine.name,
    shell: machine.shell,
    creatorId: machine.creatorId,
    creatorGeneration: machine.creatorGeneration,
    creatorFamily: machine.creatorFamily,
    price: amountOf(machine.price),
    ticketCount: machine.ticketCount,
    pulled: machine.next,
    status: machine.status,
    nftPrizes: machine.nftPrizes.map((prize) => ({
      tokenId: prize.tokenId,
      item: prize.item,
      backing: amountOf(prize.backing),
      won: prize.won,
    })),
    usdgPrizes: machine.usdgPrizes.map((prize) => ({
      amount: amountOf(prize.amount),
      count: prize.count,
      won: prize.won,
    })),
    prizeValue: amountOf(machine.prizeValue),
    pool: amountOf(machine.backingPool + machine.usdgPool),
    backingPool: amountOf(machine.backingPool),
    usdgPool: amountOf(machine.usdgPool),
    receipts: amountOf(machine.receipts),
    lifetimeReceipts: amountOf(machine.lifetimeReceipts),
    version: machine.version,
    createdAt: machine.createdAt,
  });

  const state = (machine: InternalMachine): EventMachine => eventMachine(publicMachine(machine));

  const ensureDemo = (request: { friend: { id: string; wallet: string }; account: string }) => {
    if (options.demoFriends === 0 || demoGranted.has(request.friend.id)) return;
    demoGranted.add(request.friend.id);
    const wallet = request.friend.wallet.toLowerCase();
    const base = DEMO_BASE + BigInt(demoSeq) * 100n;
    demoSeq += 1;
    for (let index = 0; index < options.demoFriends; index += 1) {
      const id = (base + BigInt(index + 1)).toString();
      if (tokens.has(id)) continue;
      const item: ItemId = index % 2 === 0 ? "genesisFriend" : "generationsFriend";
      tokens.set(id, { id, item, owner: { kind: "friend", friendId: request.friend.id, wallet } });
    }
  };

  const heldBy = (token: HeldToken, wallet: string, account: string): "friend" | "owner" | null => {
    if (token.owner.kind === "friend" && token.owner.wallet === wallet) return "friend";
    if (token.owner.kind === "owner" && token.owner.account === account) return "owner";
    return null;
  };

  const tokenHeldBy = (tokenId: string, wallet: string, account: string): HeldToken => {
    const token = tokens.get(tokenId);
    if (!token) throw new Error("That Rare Friend is not in this wallet.");
    if (heldBy(token, wallet, account) === null) throw new Error("That Rare Friend is not in this wallet.");
    return token;
  };

  const machineFor = (id: string): InternalMachine => {
    const machine = machines.get(id);
    if (!machine) throw new Error("This machine is not on the dev chain.");
    return machine;
  };

  const creatorMachine = (intent: ArcadeIntent, friendId: string): InternalMachine => {
    const machine = machineFor(intentMachine(intent));
    if (machine.creatorId !== friendId) throw new Error("Only the machine's creator can do that.");
    return machine;
  };

  const push = (op: Omit<Op, "id">): Hash => {
    opSeq += 1;
    const id = `op:${opSeq}`;
    ops.push({ ...op, id });
    return op.hash;
  };

  const describe = async (request: Parameters<DevRelay["describe"]>[0]) => {
    const intent = intentOf(request);
    const action = request.action;

    if (action === "createMachine") {
      const draft = parseDraft(intent.draft);
      const quote = quoteDraft(draft);
      const wallet = request.friend.wallet.toLowerCase();
      const account = request.account.toLowerCase();
      const seen = new Set<string>();
      for (const prize of draft.nftPrizes) {
        if (seen.has(prize.tokenId)) throw new Error("A Rare Friend prize repeats a token.");
        seen.add(prize.tokenId);
        const token = tokenHeldBy(prize.tokenId, wallet, account);
        if (token.item !== prize.item) throw new Error("A Rare Friend prize has the wrong type.");
      }
      const funding = parseUnits(quote.funding) ?? 0n;
      const lines = [
        { label: "Machine", value: draft.name },
        { label: "Pull price", value: `${draft.price} ${CURRENCY}` },
        { label: "Tickets", value: `${draft.ticketCount} (${quote.prizeTickets} carry prizes)` },
        { label: "Rare Friends", value: `${draft.nftPrizes.length} stocked, ${quote.nftBacking} ${CURRENCY} backing` },
        { label: "USDG prizes", value: `${quote.usdgValue} ${CURRENCY}` },
        { label: "Floor RTP", value: `${(quote.floorRtpBps / 100).toFixed(2)}%` },
        { label: "Creator share", value: `${quote.creatorPerPull} ${CURRENCY} of each pull` },
      ];
      return {
        lines,
        ...(funding > 0n ? { total: quote.funding, approve: true } : {}),
      };
    }

    if (action === "pull") {
      const machine = machineFor(intentMachine(intent));
      if (machine.status !== "live" || machine.next >= machine.ticketCount) throw new Error("This machine is not taking pulls.");
      return {
        lines: [
          { label: "Machine", value: machine.name },
          { label: "Ticket", value: `${machine.next + 1} of ${machine.ticketCount}` },
          { label: "Tickets left", value: String(machine.ticketCount - machine.next) },
          { label: "Prize pool", value: `${amountOf(machine.backingPool + machine.usdgPool)} ${CURRENCY}` },
          { label: "Creator receives", value: `${amountOf(creatorShareOf(machine.price))} ${CURRENCY}` },
        ],
        total: amountOf(machine.price),
        approve: true,
      };
    }

    if (action === "claimBacking") {
      const tokenId = intentToken(intent);
      const claim = claims.get(tokenId);
      if (!claim) throw new Error("That Friend has no backing to claim.");
      if (claim.winnerId !== request.friend.id) throw new Error("That Friend was not won by this Friend.");
      const machine = machineFor(claim.machineId);
      if (machine.backingPool < claim.backing) throw new Error("The machine's backing pool is short.");
      return {
        lines: [
          { label: "Rare Friend", value: `Token #${tokenId}` },
          { label: "Machine", value: machine.name },
          { label: "You receive", value: `${amountOf(claim.backing)} ${CURRENCY}` },
          { label: "The Friend", value: "is burned when you take the backing" },
        ],
      };
    }

    if (action === "withdrawMachine") {
      const machine = creatorMachine(intent, request.friend.id);
      if (machine.receipts === 0n) throw new Error("There are no receipts to collect.");
      return {
        lines: [
          { label: "Machine", value: machine.name },
          { label: "Creator receipts", value: `${amountOf(machine.receipts)} ${CURRENCY}` },
          { label: "Lifetime earned", value: `${amountOf(machine.lifetimeReceipts)} ${CURRENCY}` },
        ],
      };
    }

    if (action === "pauseMachine" || action === "resumeMachine") {
      const machine = creatorMachine(intent, request.friend.id);
      const want = action === "pauseMachine" ? "live" : "paused";
      if (machine.status !== want) throw new Error(action === "pauseMachine" ? "That machine is not live." : "That machine is not paused.");
      return { lines: [{ label: "Machine", value: machine.name }, { label: "Action", value: action === "pauseMachine" ? "Take it off the floor" : "Put it back on the floor" }] };
    }

    if (action === "cancelMachine") {
      const machine = creatorMachine(intent, request.friend.id);
      if (machine.next !== 0) throw new Error("A machine can only be cancelled before its first pull.");
      if (machine.status === "cancelled") throw new Error("That machine is already cancelled.");
      const refund = machine.backingPool + machine.usdgPool;
      return {
        lines: [
          { label: "Machine", value: machine.name },
          { label: "USDG refund", value: `${amountOf(refund)} ${CURRENCY}` },
          { label: "Rare Friends", value: `${machine.nftPrizes.length} return to your Friend wallet` },
        ],
      };
    }

    throw new Error(`Unknown arcade action "${action}".`);
  };

  const execute = async (request: DevExecuteRequest): Promise<{ hash: Hash }> => {
    if (sim.switches.rejectNext) {
      sim.switches.rejectNext = false;
      const rejected = new Error("User rejected the request.");
      Object.assign(rejected, { code: 4001 });
      throw rejected;
    }
    const intent = intentOf(request);
    const action = request.action;
    const account = request.account.toLowerCase();
    const wallet = request.friend.wallet.toLowerCase();
    const now = sim.now();
    const hash = sim.hash();

    if (action === "createMachine") {
      const draft = parseDraft(intent.draft);
      const quote = quoteDraft(draft);
      const funding = parseUnits(quote.funding) ?? 0n;
      const backing = parseUnits(quote.nftBacking) ?? 0n;
      const usdg = parseUnits(quote.usdgValue) ?? 0n;
      if (sim.balance(account) < funding) throw new Error(`Not enough ${CURRENCY} to stock this machine.`);
      for (const prize of draft.nftPrizes) tokenHeldBy(prize.tokenId, wallet, account);
      sim.debit(account, funding);
      machineSeq += 1;
      const id = `m:${machineSeq}`;
      for (const prize of draft.nftPrizes) {
        const token = tokens.get(prize.tokenId);
        if (token) tokens.set(prize.tokenId, { ...token, owner: { kind: "machine", machineId: id } });
      }
      const prizeEntries: DeckEntry[] = [];
      for (const prize of draft.nftPrizes) {
        prizeEntries.push({
          kind: "nft",
          tokenId: prize.tokenId,
          item: prize.item,
          backing: parseUnits(prize.backing) ?? 0n,
        });
      }
      for (const line of draft.usdgPrizes) {
        const amount = parseUnits(line.amount) ?? 0n;
        for (let copy = 0; copy < line.count; copy += 1) prizeEntries.push({ kind: "usdg", amount });
      }
      const blankCount = draft.ticketCount - prizeEntries.length;
      for (let blank = 0; blank < blankCount; blank += 1) prizeEntries.push({ kind: "blank" });
      const seed = BigInt(hash);
      const deck = shuffle(prizeEntries, seed);
      const machine: InternalMachine = {
        id,
        name: draft.name,
        shell: draft.shell,
        creatorId: request.friend.id,
        creatorGeneration: request.friend.generation,
        creatorFamily: "",
        creatorAccount: account,
        creatorWallet: wallet,
        price: parseUnits(draft.price) ?? 0n,
        ticketCount: draft.ticketCount,
        deck,
        next: 0,
        status: "live",
        nftPrizes: draft.nftPrizes.map((prize) => ({
          tokenId: prize.tokenId,
          item: prize.item,
          backing: parseUnits(prize.backing) ?? 0n,
          won: false,
        })),
        usdgPrizes: draft.usdgPrizes.map((line) => ({
          amount: parseUnits(line.amount) ?? 0n,
          count: line.count,
          won: 0,
        })),
        prizeValue: funding,
        backingPool: backing,
        usdgPool: usdg,
        receipts: 0n,
        fees: 0n,
        lifetimeReceipts: 0n,
        version: 1,
        createdAt: now,
      };
      machines.set(id, machine);
      const data: ArcadeEventData = { machineId: id, machine: state(machine) };
      push({
        laneKey: request.lane.key,
        action,
        hash,
        friendId: request.friend.id,
        wallet,
        generation: request.friend.generation,
        quantity: request.quantity,
        event: { status: "settled", hash, data },
      });
      return { hash };
    }

    if (action === "pull") {
      const machine = machineFor(intentMachine(intent));
      if (machine.status !== "live" || machine.next >= machine.ticketCount) throw new Error("This machine is not taking pulls.");
      const entry = machine.deck[machine.next];
      if (!entry) throw new Error("The machine's deck is empty.");
      if (sim.balance(account) < machine.price) throw new Error(`Not enough ${CURRENCY}.`);
      sim.debit(account, machine.price);
      const fee = feeOf(machine.price);
      const share = machine.price - fee;
      machine.fees += fee;
      machine.receipts += share;
      machine.lifetimeReceipts += share;
      machine.version += 1;
      const ticketIndex = machine.next;
      machine.next += 1;
      if (machine.next >= machine.ticketCount) machine.status = "sold_out";

      let result: "blank" | "usdg" | "nft" = "blank";
      const data: ArcadeEventData = { machineId: machine.id, machine: state(machine), ticketIndex };
      const event: PendingEvent = { status: "settled", hash, data };
      const mutable = event as { paid?: string; paidTo?: "friend" | "owner"; outcomes?: { row: number; item?: ItemId; pays?: string }[]; tokens?: { moved?: { id: string; item: ItemId; to: "friend" | "owner" }[] } };

      if (entry.kind === "usdg") {
        result = "usdg";
        machine.usdgPool -= entry.amount;
        sim.credit(account, entry.amount);
        const paid = entry.amount.toString();
        mutable.paid = paid;
        mutable.paidTo = "owner";
        mutable.outcomes = [{ row: ticketIndex, pays: amountOf(entry.amount) }];
        (data as { result?: string; amount?: string }).result = result;
        (data as { amount?: string }).amount = amountOf(entry.amount);
      } else if (entry.kind === "nft") {
        result = "nft";
        machine.nftPrizes = machine.nftPrizes.map((candidate) =>
          candidate.tokenId === entry.tokenId ? { ...candidate, won: true } : candidate
        );
        const token = tokens.get(entry.tokenId);
        if (token) tokens.set(entry.tokenId, { ...token, owner: { kind: "friend", friendId: request.friend.id, wallet } });
        claims.set(entry.tokenId, {
          machineId: machine.id,
          tokenId: entry.tokenId,
          item: entry.item,
          backing: entry.backing,
          winnerId: request.friend.id,
        });
        mutable.tokens = { moved: [{ id: entry.tokenId, item: entry.item, to: "friend" }] };
        mutable.outcomes = [{ row: ticketIndex, item: entry.item }];
        (data as { result?: string }).result = result;
        (data as { tokenId?: string }).tokenId = entry.tokenId;
        (data as { item?: ItemId }).item = entry.item;
        (data as { backing?: string }).backing = amountOf(entry.backing);
      } else {
        (data as { result?: string }).result = result;
      }
      (data as { machine?: EventMachine }).machine = state(machine);
      push({
        laneKey: request.lane.key,
        action,
        hash,
        friendId: request.friend.id,
        wallet,
        generation: request.friend.generation,
        quantity: request.quantity,
        event,
      });
      return { hash };
    }

    if (action === "claimBacking") {
      const tokenId = intentToken(intent);
      const claim = claims.get(tokenId);
      if (!claim || claim.winnerId !== request.friend.id) throw new Error("That Friend has no backing from this Friend.");
      const machine = machineFor(claim.machineId);
      if (machine.backingPool < claim.backing) throw new Error("The machine's backing pool is short.");
      const result = tokenHeldBy(tokenId, wallet, account);
      machine.backingPool -= claim.backing;
      machine.version += 1;
      sim.credit(account, claim.backing);
      tokens.delete(tokenId);
      claims.delete(tokenId);
      const data: ArcadeEventData = {
        machineId: machine.id,
        machine: state(machine),
        tokenId,
        item: claim.item,
        backing: amountOf(claim.backing),
      };
      push({
        laneKey: request.lane.key,
        action,
        hash,
        friendId: request.friend.id,
        wallet,
        generation: request.friend.generation,
        quantity: request.quantity,
        event: {
          status: "settled",
          hash,
          data,
          paid: claim.backing.toString(),
          paidTo: "owner",
          tokens: { burned: [{ id: result.id, item: result.item }] },
        },
      });
      return { hash };
    }

    if (action === "withdrawMachine") {
      const machine = creatorMachine(intent, request.friend.id);
      if (machine.receipts === 0n) throw new Error("There are no receipts to collect.");
      const receipts = machine.receipts;
      machine.receipts = 0n;
      machine.version += 1;
      sim.credit(account, receipts);
      const data: ArcadeEventData = {
        machineId: machine.id,
        machine: state(machine),
        receipts: amountOf(receipts),
      };
      push({
        laneKey: request.lane.key,
        action,
        hash,
        friendId: request.friend.id,
        wallet,
        generation: request.friend.generation,
        quantity: request.quantity,
        event: { status: "settled", hash, data, paid: receipts.toString(), paidTo: "owner" },
      });
      return { hash };
    }

    if (action === "pauseMachine" || action === "resumeMachine") {
      const machine = creatorMachine(intent, request.friend.id);
      const want = action === "pauseMachine" ? "live" : "paused";
      if (machine.status !== want) throw new Error(action === "pauseMachine" ? "That machine is not live." : "That machine is not paused.");
      machine.status = action === "pauseMachine" ? "paused" : "live";
      machine.version += 1;
      const data: ArcadeEventData = { machineId: machine.id, machine: state(machine) };
      push({
        laneKey: request.lane.key,
        action,
        hash,
        friendId: request.friend.id,
        wallet,
        generation: request.friend.generation,
        quantity: request.quantity,
        event: { status: "settled", hash, data },
      });
      return { hash };
    }

    if (action === "cancelMachine") {
      const machine = creatorMachine(intent, request.friend.id);
      if (machine.next !== 0) throw new Error("A machine can only be cancelled before its first pull.");
      if (machine.status === "cancelled") throw new Error("That machine is already cancelled.");
      const refund = machine.backingPool + machine.usdgPool;
      sim.credit(account, refund);
      const moved: { id: string; item: ItemId; to: "friend" }[] = [];
      for (const prize of machine.nftPrizes) {
        const token = tokens.get(prize.tokenId);
        if (token) {
          tokens.set(prize.tokenId, { ...token, owner: { kind: "friend", friendId: request.friend.id, wallet } });
          moved.push({ id: prize.tokenId, item: prize.item, to: "friend" });
        }
      }
      machine.backingPool = 0n;
      machine.usdgPool = 0n;
      machine.status = "cancelled";
      machine.version += 1;
      const data: ArcadeEventData = {
        machineId: machine.id,
        machine: state(machine),
        refund: amountOf(refund),
      };
      push({
        laneKey: request.lane.key,
        action,
        hash,
        friendId: request.friend.id,
        wallet,
        generation: request.friend.generation,
        quantity: request.quantity,
        event: {
          status: "settled",
          hash,
          data,
          paid: refund.toString(),
          paidTo: "owner",
          ...(moved.length > 0 ? { tokens: { moved } } : {}),
        },
      });
      return { hash };
    }

    throw new Error(`Unknown arcade action "${action}".`);
  };

  const relay: DevRelay = {
    async holdings(request) {
      ensureDemo(request);
      const wallet = request.friend.wallet.toLowerCase();
      const account = request.account.toLowerCase();
      const held: { id: string; item: ItemId; lane: string; where: "friend" | "owner" }[] = [];
      for (const token of tokens.values()) {
        const where = heldBy(token, wallet, account);
        if (where) held.push({ id: token.id, item: token.item, lane: request.lane.key, where });
      }
      const mine = [...machines.values()].filter((machine) => machine.creatorId === request.friend.id && machine.status !== "cancelled");
      const hasLive = [...machines.values()].some((machine) => machine.status === "live" && machine.next < machine.ticketCount);
      const hasClaim = held.some((token) => token.where === "friend" && claims.has(token.id));
      return {
        tokens: held,
        actions: {
          createMachine: { available: true, maxQuantity: 1 },
          pull: hasLive
            ? { available: true, maxQuantity: 1 }
            : { available: false, maxQuantity: 0, reason: "No live machine is on the floor." },
          claimBacking: hasClaim
            ? { available: true, maxQuantity: 1 }
            : { available: false, maxQuantity: 0, reason: "No backing to claim." },
          withdrawMachine: mine.some((machine) => machine.receipts > 0n)
            ? { available: true, maxQuantity: 1 }
            : { available: false, maxQuantity: 0, reason: "No receipts to collect." },
          pauseMachine: mine.some((machine) => machine.status === "live" && machine.next < machine.ticketCount)
            ? { available: true, maxQuantity: 1 }
            : { available: false, maxQuantity: 0, reason: "No live machine to pause." },
          resumeMachine: mine.some((machine) => machine.status === "paused")
            ? { available: true, maxQuantity: 1 }
            : { available: false, maxQuantity: 0, reason: "No paused machine to resume." },
          cancelMachine: mine.some((machine) => machine.status === "live" && machine.next === 0)
            ? { available: true, maxQuantity: 1 }
            : { available: false, maxQuantity: 0, reason: "No machine can be cancelled." },
        },
      };
    },
    describe,
    execute,
  };

  const buildEvent = (op: Op, lane: WatcherLane): ExternalEvent => ({
    kind: "external",
    adapter: ADAPTER,
    module: lane.module,
    gameId: lane.gameId,
    id: op.id,
    action: op.action,
    friendId: op.friendId,
    wallet: op.wallet,
    generation: op.generation,
    quantity: op.quantity,
    ...op.event,
  });

  const reported = (ctx: WatcherCycle): Set<string> =>
    new Set(Array.isArray(ctx.state.reported) ? (ctx.state.reported as string[]) : []);

  const take = (ctx: WatcherCycle): ChainEvent[] => {
    const seen = reported(ctx);
    const events: ChainEvent[] = [];
    for (const op of ops) {
      if (seen.has(op.id)) continue;
      const lane = lanes.get(op.laneKey);
      if (!lane) continue;
      seen.add(op.id);
      events.push(buildEvent(op, lane));
    }
    ctx.state.reported = [...seen].slice(-500);
    return events;
  };

  const watcher: Watcher = {
    adapter: ADAPTER,
    init(ctx: WatcherInit) {
      lanes = new Map(ctx.lanes.map((lane) => [lane.key, lane]));
      ctx.log("info", `Rare Arcade dev contract: serving ${ctx.lanes.length} lane(s), ${machines.size} machine(s).`);
    },
    async cycle(ctx) {
      return take(ctx);
    },
    async verify(ctx: WatcherCycle, submitted: readonly Submitted[]) {
      const seen = reported(ctx);
      const events: ChainEvent[] = [];
      for (const report of submitted) {
        for (const op of ops) {
          if (op.hash.toLowerCase() !== report.hash.toLowerCase() || seen.has(op.id)) continue;
          const lane = lanes.get(op.laneKey);
          if (!lane) continue;
          seen.add(op.id);
          events.push(buildEvent(op, lane));
        }
      }
      ctx.state.reported = [...seen].slice(-500);
      return events;
    },
  };

  return { relay, watcher };
};

export default stub;
