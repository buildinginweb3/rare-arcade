/**
 * Rare Arcade's shared machine model.
 *
 * The arcade is an external lane: these types describe what the contract's
 * adapter reports and what the game server mirrors. They are pure JSON shapes
 * and pure arithmetic so the client, the server, the dev contract stub and the
 * keeper-side watcher can all agree on them.
 *
 * Money is always a decimal string in USDG units on the wire ("5", "0.95") and
 * a bigint in base units (6 decimals) inside arithmetic. The chain's watcher
 * sends base units; the runtime formats them before the server sees `tx.paid`.
 */

export const CURRENCY = "USDG" as const;
export const DECIMALS = 6;
export const UNITS = 1_000_000n;
export const BPS = 10_000n;

/** The platform keeps 5% of every pull. The creator receives the rest. */
export const PLATFORM_FEE_BPS = 500n;
export const CREATOR_SHARE_BPS = BPS - PLATFORM_FEE_BPS;

/** A machine's published floor RTP has to sit inside this band. */
export const MIN_RTP_BPS = 7_000;
export const MAX_RTP_BPS = 10_500;

export const MIN_PRICE = 100_000n; // 0.1 USDG
export const MAX_PRICE = 1_000_000_000n; // 1,000 USDG
export const MIN_BACKING = 100_000n; // 0.1 USDG
export const MAX_BACKING = 10_000_000_000n; // 10,000 USDG
export const MAX_FUNDING = 100_000_000_000n; // 100,000 USDG

export const MIN_TICKETS = 2;
export const MAX_TICKETS = 1_000;
export const MAX_NFT_PRIZES = 16;
export const MAX_USDG_LINES = 8;
export const MAX_PRIZE_COPIES = 20;
export const MAX_MACHINES_PER_CREATOR = 12;
export const MAX_TOTAL_MACHINES = 120;

export const NAME_PATTERN = /^[A-Za-z0-9 .,'!?&()/+:-]{3,28}$/;
export const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
export const TOKEN_ID_PATTERN = /^(0|[1-9][0-9]{0,77})$/;

export const CHAIN_ID = 4663;
export const RARE_FRIENDS_GENESIS = "0x116eaa62241751e0c98da43d458600c6c17cd361";
export const RARE_FRIENDS_GENERATIONS = "0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d";

const KNOWN_COLLECTIONS: Readonly<Record<string, string>> = {
  [RARE_FRIENDS_GENESIS]: "Genesis Friend",
  [RARE_FRIENDS_GENERATIONS]: "Generations Friend",
};

/** The manifest has one generic external item: any NFT on Robinhood Chain. */
export type ItemId = "nft";
export const ITEM_IDS: readonly ItemId[] = ["nft"];
export const ITEM_NAMES: Readonly<Record<ItemId, string>> = { nft: "NFT" };

export type NftStandard = "erc721" | "erc1155";
export const NFT_STANDARDS: readonly NftStandard[] = ["erc721", "erc1155"];
export const STANDARD_NAMES: Readonly<Record<NftStandard, string>> = {
  erc721: "ERC-721",
  erc1155: "ERC-1155",
};

export function isNftStandard(value: unknown): value is NftStandard {
  return value === "erc721" || value === "erc1155";
}

export function nftKey(contract: string, tokenId: string): string {
  return `${contract.toLowerCase()}:${tokenId}`;
}

export function claimIdOf(machineId: string, contract: string, tokenId: string): string {
  return `${machineId}:${nftKey(contract, tokenId)}`;
}

export function shortAddress(address: string): string {
  return address.length > 12 ? `${address.slice(0, 6)}...${address.slice(-4)}` : address;
}

export function collectionName(contract: string): string {
  return KNOWN_COLLECTIONS[contract.toLowerCase()] ?? shortAddress(contract);
}

export type Shell = "classic" | "capsule" | "tallboy" | "mini";
export const SHELLS: readonly Shell[] = ["classic", "capsule", "tallboy", "mini"];

export type MachineStatus = "live" | "paused" | "sold_out" | "cancelled";

export const STATUS_LABEL: Readonly<Record<MachineStatus, string>> = {
  live: "LIVE",
  paused: "PAUSED",
  sold_out: "SOLD OUT",
  cancelled: "CANCELLED",
};

export type NftRef = Readonly<{
  contract: string;
  tokenId: string;
  standard: NftStandard;
}>;

export type PrizeNft = NftRef & Readonly<{
  backing: string;
  won: boolean;
}>;

export type PrizeUsdg = Readonly<{
  amount: string;
  count: number;
  won: number;
}>;

/** A machine as the game server mirrors it. The contract is the escrow. */
export type Machine = Readonly<{
  id: string;
  name: string;
  shell: Shell;
  creatorId: string;
  creatorGeneration: number;
  creatorFamily: string;
  price: string;
  ticketCount: number;
  pulled: number;
  status: MachineStatus;
  nftPrizes: readonly PrizeNft[];
  usdgPrizes: readonly PrizeUsdg[];
  /** Total USDG stocked when the machine opened (prizes + NFT backing). */
  prizeValue: string;
  /** USDG still held for prizes and claimable backing. */
  pool: string;
  backingPool: string;
  usdgPool: string;
  /** Creator receipts waiting to be collected. */
  receipts: string;
  /** Everything this machine has ever earned its creator. */
  lifetimeReceipts: string;
  /** Contract state version; handlers ignore older snapshots. */
  version: number;
  createdAt: number;
}>;

/** The machine card's data. Kept small so a catalogue of machines is cheap. */
export type MachineSummary = Readonly<{
  id: string;
  name: string;
  shell: Shell;
  creatorId: string;
  creatorGeneration: number;
  creatorFamily: string;
  price: string;
  ticketCount: number;
  pulled: number;
  status: MachineStatus;
  nftCount: number;
  nftBacking: string;
  usdgLines: number;
  usdgValue: string;
  prizeValue: string;
  pool: string;
  receipts: string;
  lifetimeReceipts: string;
  ticketsLeft: number;
  prizeTickets: number;
  floorRtpBps: number;
  topBacking: string;
  version: number;
  createdAt: number;
}>;

export type Claim = Readonly<{
  id: string;
  machineId: string;
  machineName: string;
  contract: string;
  tokenId: string;
  standard: NftStandard;
  backing: string;
  winnerId: string;
  winnerGeneration: number;
  wonAt: number;
  claimed: boolean;
  settledAs?: "kept" | "backing";
}>;

export type RecentWin = Readonly<{
  machineId: string;
  machineName: string;
  playerId: string;
  generation: number;
  kind: "usdg" | "nft";
  amount?: string;
  contract?: string;
  tokenId?: string;
  standard?: NftStandard;
  backing?: string;
  at: number;
}>;

export type DraftNft = NftRef & Readonly<{
  backing: string;
}>;

export type DraftUsdg = Readonly<{
  amount: string;
  count: number;
}>;

/** What the create wizard builds and the server keeps until the contract opens it. */
export type Draft = Readonly<{
  name: string;
  shell: Shell;
  price: string;
  ticketCount: number;
  nftPrizes: readonly DraftNft[];
  usdgPrizes: readonly DraftUsdg[];
}>;

export type DraftQuote = Readonly<
  Draft & {
    funding: string;
    prizeTickets: number;
    blanks: number;
    floorRtpBps: number;
    feePerPull: string;
    creatorPerPull: string;
    nftBacking: string;
    usdgValue: string;
  }
>;

export type Stats = Readonly<{
  machines: number;
  pulls: number;
  paid: string;
  creators: number;
}>;

export type Me = Readonly<{
  pulls: number;
  wins: number;
  claimed: string;
  created: number;
  lifetimeReceipts: string;
}>;

export type Selection = Readonly<{
  machineId?: string;
  claimId?: string;
}>;

export type TopEntry = Readonly<{
  friendId: string;
  score: number;
}>;

export type Snapshot = Readonly<{
  me: Me;
  machines: readonly MachineSummary[];
  mine: readonly MachineSummary[];
  claims: readonly Claim[];
  recent: readonly RecentWin[];
  stats: Stats;
  topWins: readonly TopEntry[];
  topCreators: readonly TopEntry[];
  draft: DraftQuote | null;
  selection: Selection;
}>;

export type MachineDetail = Readonly<{
  machine: Machine;
  claims: readonly Claim[];
  recent: readonly RecentWin[];
}>;

/** The compact state the lane's watcher reports with every event. */
export type EventMachine = Readonly<{
  status: MachineStatus;
  pulled: number;
  pool: string;
  backingPool: string;
  usdgPool: string;
  receipts: string;
  version: number;
}>;

/** `tx.data` for every arcade event. */
export type ArcadeEventData = Readonly<{
  machineId: string;
  machine: EventMachine;
  result?: "blank" | "usdg" | "nft";
  ticketIndex?: number;
  amount?: string;
  backing?: string;
  contract?: string;
  tokenId?: string;
  standard?: NftStandard;
  refund?: string;
  receipts?: string;
}>;

/** What a contract intent carries. The watcher also uses it on the keeper side. */
export type ArcadeIntent = Readonly<{
  draft?: Draft;
  machineId?: string;
  claimId?: string;
  contract?: string;
  tokenId?: string;
  standard?: NftStandard;
}>;

export const EMPTY_ME: Me = {
  pulls: 0,
  wins: 0,
  claimed: "0",
  created: 0,
  lifetimeReceipts: "0",
};

export const EMPTY_STATS: Stats = {
  machines: 0,
  pulls: 0,
  paid: "0",
  creators: 0,
};

/** Parse a plain USDG decimal ("5", "0.95", "1000.5") into base units. */
export function parseUnits(text: unknown): bigint | null {
  if (typeof text !== "string") return null;
  const match = /^(?:0|[1-9][0-9]*)(?:\.([0-9]{1,6}))?$/.exec(text);
  if (!match) return null;
  const whole = BigInt(text.split(".")[0] ?? "0");
  const fraction = (match[1] ?? "").padEnd(6, "0");
  return whole * UNITS + BigInt(fraction || "0");
}

/** Canonical ungrouped amount ("5", "0.95"), no trailing zeroes. */
export function formatUnits(units: bigint): string {
  const sign = units < 0n ? "-" : "";
  const value = units < 0n ? -units : units;
  const whole = value / UNITS;
  const fraction = (value % UNITS).toString().padStart(6, "0").replace(/0+$/, "");
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

/** Grouped amount for players ("1,250.5"). */
export function displayUnits(units: bigint): string {
  const text = formatUnits(units);
  const [whole = "0", fraction] = text.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? `${grouped}.${fraction}` : grouped;
}

export function groupAmount(amount: string): string {
  const units = parseUnits(amount);
  return units === null ? amount : displayUnits(units);
}

/** Leaderboard scores are JS numbers; 6-decimal USDG units stay exact far past any real prize. */
export function unitsNumber(units: bigint): number {
  return Number(units);
}

export function feeOf(price: bigint): bigint {
  return (price * PLATFORM_FEE_BPS) / BPS;
}

export function creatorShareOf(price: bigint): bigint {
  return price - feeOf(price);
}

export function nftBackingOf(prizes: readonly DraftNft[] | readonly PrizeNft[]): bigint {
  let total = 0n;
  for (const prize of prizes) total += parseUnits(prize.backing) ?? 0n;
  return total;
}

export function usdgValueOf(prizes: readonly DraftUsdg[] | readonly PrizeUsdg[]): bigint {
  let total = 0n;
  for (const prize of prizes) {
    const amount = parseUnits(prize.amount) ?? 0n;
    total += amount * BigInt(prize.count);
  }
  return total;
}

export function prizeTicketsOf(prizes: readonly DraftNft[] | readonly PrizeNft[], lines: readonly DraftUsdg[] | readonly PrizeUsdg[]): number {
  let tickets = prizes.length;
  for (const line of lines) tickets += line.count;
  return tickets;
}

export function fundingOf(draft: Draft): bigint {
  return nftBackingOf(draft.nftPrizes) + usdgValueOf(draft.usdgPrizes);
}

export function floorRtpBpsOf(funding: bigint, price: bigint, ticketCount: number): number {
  if (price <= 0n || ticketCount <= 0) return 0;
  return Number((funding * BPS) / (price * BigInt(ticketCount)));
}

export function quoteDraft(draft: Draft): DraftQuote {
  const price = parseUnits(draft.price) ?? 0n;
  const nftBacking = nftBackingOf(draft.nftPrizes);
  const usdgValue = usdgValueOf(draft.usdgPrizes);
  const funding = nftBacking + usdgValue;
  const prizeTickets = prizeTicketsOf(draft.nftPrizes, draft.usdgPrizes);
  const fee = feeOf(price);
  return {
    ...draft,
    funding: formatUnits(funding),
    prizeTickets,
    blanks: Math.max(0, draft.ticketCount - prizeTickets),
    floorRtpBps: floorRtpBpsOf(funding, price, draft.ticketCount),
    feePerPull: formatUnits(fee),
    creatorPerPull: formatUnits(price - fee),
    nftBacking: formatUnits(nftBacking),
    usdgValue: formatUnits(usdgValue),
  };
}

export function summarizeMachine(machine: Machine): MachineSummary {
  const price = parseUnits(machine.price) ?? 0n;
  const prizeValue = parseUnits(machine.prizeValue) ?? 0n;
  const nftBacking = nftBackingOf(machine.nftPrizes);
  const usdgValue = usdgValueOf(machine.usdgPrizes);
  const prizeTickets = prizeTicketsOf(machine.nftPrizes, machine.usdgPrizes);
  const topBacking = machine.nftPrizes.reduce((best, prize) => {
    const value = parseUnits(prize.backing) ?? 0n;
    return value > best ? value : best;
  }, 0n);
  return {
    id: machine.id,
    name: machine.name,
    shell: machine.shell,
    creatorId: machine.creatorId,
    creatorGeneration: machine.creatorGeneration,
    creatorFamily: machine.creatorFamily,
    price: machine.price,
    ticketCount: machine.ticketCount,
    pulled: machine.pulled,
    status: machine.status,
    nftCount: machine.nftPrizes.length,
    nftBacking: formatUnits(nftBacking),
    usdgLines: machine.usdgPrizes.length,
    usdgValue: formatUnits(usdgValue),
    prizeValue: machine.prizeValue,
    pool: machine.pool,
    receipts: machine.receipts,
    lifetimeReceipts: machine.lifetimeReceipts,
    ticketsLeft: Math.max(0, machine.ticketCount - machine.pulled),
    prizeTickets,
    floorRtpBps: floorRtpBpsOf(prizeValue, price, machine.ticketCount),
    topBacking: formatUnits(topBacking),
    version: machine.version,
    createdAt: machine.createdAt,
  };
}

export function eventMachine(machine: Machine): EventMachine {
  return {
    status: machine.status,
    pulled: machine.pulled,
    pool: machine.pool,
    backingPool: machine.backingPool,
    usdgPool: machine.usdgPool,
    receipts: machine.receipts,
    version: machine.version,
  };
}
