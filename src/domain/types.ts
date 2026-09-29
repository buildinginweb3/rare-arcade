/**
 * Core type definitions for RARE ARCADE.
 * Strictly simulated Vibeathon MVP types.
 */

export type MachineStatus = 'DRAFT' | 'READY' | 'LIVE' | 'SOLD_OUT' | 'CANCELLED';

export type MachineShellId = 'CLASSIC' | 'CAPSULE' | 'TALLBOY' | 'MINI';

/** Creator-chosen machine model. Finite Deck consumes tickets; Fixed Odds rolls fixed odds per pull. */
export type MachineType = 'finite_deck' | 'fixed_odds';

export type NftCollectionType = 'GENESIS' | 'GENERATIONS';

export type NftPrizeOrigin = 'real-nft' | 'system-demo' | 'legacy-demo';

/**
 * Canonical identity for a real Rare Friends NFT on Robinhood Chain.
 * chainId + contract + tokenId uniquely identifies the token.
 */
export interface NftIdentity {
  chainId: number;
  contractAddress: string; // checksummed or lowercase hex
  tokenId: bigint;
}

export interface RareFriendMetadata {
  tokenId: bigint;
  name: string;
  familyName: string;
  generation: number;
  /** Legacy 16x16 demo sprite. Absent for real-NFT prizes (use imageUrl). */
  spriteRows?: readonly string[];
  demoReferenceValueUnits: bigint;
  // --- Real-NFT fields (present when origin is 'real-nft' or 'system-demo') ---
  origin?: NftPrizeOrigin;
  chainId?: number;
  chainSlug?: string;
  contractAddress?: string;
  collectionType?: NftCollectionType;
  collectionSlug?: string;
  collectionName?: string;
  collectionImage?: string;
  tokenStandard?: string;
  description?: string;
  traits?: { traitType: string; value: string; displayType?: string }[];
  imageUrl?: string;
  displayImageUrl?: string;
  animationUrl?: string;
  openseaUrl?: string;
  /** Wallet address that was verified to own this NFT at funding time. */
  verifiedOwnerAddress?: string;
  valuationSnapshot?: NftValuationSnapshot;
}

/** Immutable NFT valuation snapshot (locked at publish; drives RTP/EV). */
export interface NftValuationSnapshot {
  method:
    | 'collection_top_bid'
    | 'item_top_bid'
    | 'rare_friends_generation_bid'
    | 'rare_friends_collection_bid_fallback'
    | 'collection_top_bid_fallback'
    | 'legacy_manual'
    | 'demo_snapshot';
  source: 'opensea' | 'demo' | 'legacy';
  collectionSlug: string;
  traitType?: string;
  traitValue?: string;
  topBidUsd: string;
  bidNative?: string;
  bidCurrency?: string;
  rfUsd: string;
  /** RF reference in internal units, decimal string. */
  referenceRf: string;
  valuedAt: number;
  fallbackUsed: boolean;
}

export type PrizeType = 'RF_PRIZE' | 'FRIEND_PRIZE' | 'NO_PRIZE';

export interface RFPrizeEntry {
  id: string;
  type: 'RF_PRIZE';
  amountUnits: bigint;
  initialQuantity: number;
  remainingQuantity: number;
  /**
   * Fixed-odds chance per pull in parts-per-million (1_000_000 = 100%).
   * Required + validated for Fixed Odds machines; ignored by Finite Deck.
   */
  oddsPpm?: number;
}

export interface FriendPrizeEntry {
  id: string;
  type: 'FRIEND_PRIZE';
  tokenId: bigint;
  name: string;
  familyName: string;
  generation: number;
  /** Legacy 16x16 demo sprite. Absent for real-NFT prizes (use imageUrl). */
  spriteRows?: readonly string[];
  referenceValueUnits: bigint;
  initialQuantity: number; // usually 1 for unique NFT
  remainingQuantity: number;
  /**
   * Fixed-odds chance per pull in parts-per-million (1_000_000 = 100%).
   * Required + validated for Fixed Odds machines; ignored by Finite Deck.
   */
  oddsPpm?: number;
  // --- Real-NFT fields (mirrors RareFriendMetadata) ---
  origin?: NftPrizeOrigin;
  chainId?: number;
  /** OpenSea chain slug (e.g. robinhood, ethereum, base). */
  chainSlug?: string;
  contractAddress?: string;
  collectionType?: NftCollectionType;
  collectionSlug?: string;
  collectionName?: string;
  collectionImage?: string;
  tokenStandard?: string;
  description?: string;
  traits?: { traitType: string; value: string; displayType?: string }[];
  imageUrl?: string;
  displayImageUrl?: string;
  animationUrl?: string;
  openseaUrl?: string;
  verifiedOwnerAddress?: string;
  /** Immutable market valuation snapshot locked at publish (new machines). */
  valuationSnapshot?: NftValuationSnapshot;
}

export interface NoPrizeEntry {
  id: string;
  type: 'NO_PRIZE';
  initialQuantity: number;
  remainingQuantity: number;
}

export type PrizeEntry = RFPrizeEntry | FriendPrizeEntry | NoPrizeEntry;

export interface Ticket {
  id: string;
  prizeType: PrizeType;
  prizeEntryId: string;
  rfAmountUnits?: bigint;
  friendTokenId?: bigint;
  friendName?: string;
  friendFamilyName?: string;
  friendGeneration?: number;
  friendSpriteRows?: readonly string[];
  referenceValueUnits: bigint;
  // --- Real-NFT passthrough (when the prize is a verified/system NFT) ---
  friendOrigin?: NftPrizeOrigin;
  friendChainId?: number;
  friendContractAddress?: string;
  friendCollectionType?: NftCollectionType;
  friendCollectionName?: string;
  friendImageUrl?: string;
  friendDisplayImageUrl?: string;
  friendAnimationUrl?: string;
  friendOpenseaUrl?: string;
  friendVerifiedOwnerAddress?: string;
}

/** Every machine in the arcade is exactly one of these two models. */
export type Machine = FiniteDeckMachine | FixedOddsMachine;

/** Narrowing guard for Finite Deck machines. */
export function isFiniteDeckMachine(machine: Machine): machine is FiniteDeckMachine {
  return machine.machineType === 'finite_deck';
}

/** Narrowing guard for Fixed Odds machines. */
export function isFixedOddsMachine(machine: Machine): machine is FixedOddsMachine {
  return machine.machineType === 'fixed_odds';
}

/**
 * Shared identity + accounting for every machine, regardless of model.
 * Type-specific state lives on the FiniteDeckMachine / FixedOddsMachine
 * variants below — never as nullable filler on the base.
 */
export interface BaseMachine {
  id: string;
  name: string;
  shellId: MachineShellId;
  emblem: string;
  mascotTokenId?: bigint;
  creatorAddress: string;
  status: MachineStatus;

  // Economics (shared)
  pullPriceUnits: bigint;
  burnBps: bigint; // Fixed at 500n (5%)

  initialPrizes: PrizeEntry[];
  remainingPrizes: PrizeEntry[];

  /** Aimed RTP in BPS (deck solver input / assist memory). */
  targetRtpBps: number;

  // Tracked totals (shared accounting)
  totalSpentUnits: bigint;
  totalBurnedUnits: bigint;
  creatorReceiptsUnits: bigint;
  rfPrizesPaidUnits: bigint;
  friendPrizesAwardedCount: number;

  pullCount: number;
  createdAt: number;
  firstPullAt?: number;
  soldOutAt?: number;
  cancelledAt?: number;

  // Immutability lock
  isRulesLocked: boolean;
}

/** Finite Deck: shuffled tickets, evolving odds, known maximum pulls. */
export interface FiniteDeckMachine extends BaseMachine {
  machineType: 'finite_deck';
  totalPulls: number;
  remainingPulls: number;
  /** Shuffled finite deck; deck[0] is popped each pull. */
  deck: Ticket[];
  // RTP & EV (in BPS, where 10000 = 100.00%)
  initialRtpBps: number;
  currentRtpBps: number;
  initialEvUnits: bigint;
  currentEvUnits: bigint;
}

/** Fixed Odds: no deck, no play cap; immutable per-prize chance per pull. */
export interface FixedOddsMachine extends BaseMachine {
  machineType: 'fixed_odds';
  /** Configured RTP in BPS — the original probability/value profile. Never changes. */
  configuredRtpBps: number;
  /** Expected return from prizes still available. Decreases as prizes sell out. */
  liveAvailableRtpBps: number;
}

export type LedgerEventType =
  | 'MACHINE_CREATED'
  | 'RF_SEEDED'
  | 'FRIEND_SEEDED'
  | 'PULL_INITIATED'
  | 'RF_BURNED'
  | 'CREATOR_CREDITED'
  | 'RF_PRIZE_PAID'
  | 'FRIEND_PRIZE_AWARDED'
  | 'NO_PRIZE_DRAWN'
  | 'MACHINE_SOLD_OUT'
  | 'MACHINE_CANCELLED';

export interface LedgerEvent {
  id: string;
  machineId: string;
  machineName: string;
  type: LedgerEventType;
  actorAddress: string;
  timestamp: number;
  rfAmountUnits?: bigint;
  friendTokenId?: bigint;
  friendName?: string;
  details: string;
  /** Machine model that produced this event. */
  machineType?: MachineType;
  /** Fixed-odds roll position in parts-per-million (0 ≤ roll < 1_000_000). */
  rollPpm?: number;
}

export interface PullResult {
  ticket: Ticket;
  spentUnits: bigint;
  burnedUnits: bigint;
  creatorReceiptUnits: bigint;
  wonPrize: boolean;
  prizeType: PrizeType;
  rfWonUnits: bigint;
  friendWon?: RareFriendMetadata;
  /** Finite Deck only: tickets remaining after this pull. */
  newRemainingPulls?: number;
  /** Finite Deck only: recalculated live RTP after this pull. */
  newCurrentRtpBps?: number;
  isSoldOut: boolean;
  /** Machine model that produced this result. */
  machineType: MachineType;
  /** Fixed Odds only: roll position in parts-per-million. */
  rollPpm?: number;
  /** Fixed Odds only: prizes remaining after this pull (remaining/initial). */
  newPrizesRemaining?: { remaining: number; initial: number };
}

export interface PlayerInventory {
  rfBalanceUnits: bigint;
  wonFriends: RareFriendMetadata[];
  pullHistory: {
    machineId: string;
    machineName: string;
    timestamp: number;
    result: PullResult;
  }[];
}

export interface CreatorAccount {
  address: string;
  rfBalanceUnits: bigint;
  ownedFriends: RareFriendMetadata[];
  totalProceedsUnits: bigint;
  totalBurnGeneratedUnits: bigint;
  machinesCreatedCount: number;
}
