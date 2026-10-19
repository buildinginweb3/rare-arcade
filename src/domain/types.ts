/**
 * Core type definitions for RARE ARCADE.
 *
 * Currency model:
 *   USDG (Global Dollar) is the ONLY play currency. `pullPriceUnits`,
 *   `*SpentUnits`, `creatorReceiptsUnits` and every platform fee are USDG
 *   internal units (1 USDG = 1_000_000n, matching on-chain decimals).
 *   RF ($RAREFRIENDS) survives only as an optional cashback PRIZE currency —
 *   machines may hold USDG cashback, RF cashback, or both.
 *
 * Any field ending in `UsdgValueUnits` is a value expressed in USDG, which is
 * the single accounting currency for RTP/EV math regardless of what the
 * player is actually paid out in.
 */

/**
 * `PAUSED` is the operator-suspended state introduced with the vault: the
 * creator has frozen pulls while deciding whether to resume the machine or
 * withdraw its remaining escrow. Escrow is untouched by a pause, so a paused
 * machine is always resumable and never partially unwound.
 */
export type MachineStatus =
  | 'DRAFT'
  | 'READY'
  | 'LIVE'
  | 'PAUSED'
  | 'SOLD_OUT'
  | 'CANCELLED';

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
  /** Legacy demo valuation, in USDG internal units. */
  demoUsdgValueUnits: bigint;
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
  /**
   * Reference value in USDG, decimal string. USDG is pegged 1:1 to USD, so
   * this equals topBidUsd by construction — no price feed involved.
   */
  referenceUsdg: string;
  valuedAt: number;
  fallbackUsed: boolean;
}

export type PrizeType = 'USDG_PRIZE' | 'RF_PRIZE' | 'FRIEND_PRIZE' | 'NO_PRIZE';

/**
 * USDG cashback prize — paid straight back to the player's USDG balance.
 * Creators may seed these on top of (or instead of) RF cashback prizes.
 */
export interface UsdgPrizeEntry {
  id: string;
  type: 'USDG_PRIZE';
  /** Cashback amount in USDG internal units. */
  amountUnits: bigint;
  initialQuantity: number;
  remainingQuantity: number;
  /**
   * Units pulled back out of the machine by a creator escrow withdrawal.
   * Only ever non-zero on `remainingPrizes`; `initialPrizes` is the published
   * snapshot and is never rewritten. `remainingQuantity` stays the count that
   * can still be won, so `initial = remaining + withdrawn + paidOut` holds.
   */
  withdrawnQuantity?: number;
  /**
   * Fixed-odds chance per pull in parts-per-million (1_000_000 = 100%).
   * Required + validated for Fixed Odds machines; ignored by Finite Deck.
   */
  oddsPpm?: number;
}

/**
 * $RAREFRIENDS cashback prize. Paid in RF, but accounted for in USDG via the
 * immutable `usdgValueUnits` snapshot locked when the creator seeded it — so
 * a volatile RF price can never silently move published RTP after the fact.
 */
export interface RfPrizeEntry {
  id: string;
  type: 'RF_PRIZE';
  /** RF amount in RF internal units (1 RF = 1000n). */
  amountUnits: bigint;
  /** RF amount valued in USDG at seed time (USDG units). Immutable. */
  usdgValueUnits: bigint;
  /** RF/USDG rate captured when this prize was seeded. */
  rfPriceUsdg?: string;
  /**
   * Where `rfPriceUsdg` came from. `fallback` means the live RF price was
   * unavailable and a documented constant was used — recorded so a machine
   * priced on a fallback rate is auditable rather than looking authoritative.
   */
  rfPriceSource?: 'live' | 'stale' | 'fallback';
  /** Epoch ms the rate was captured, when it came from a real quote. */
  rfPriceValuedAt?: number;
  initialQuantity: number;
  remainingQuantity: number;
  /** Units withdrawn back to the creator by an escrow withdrawal. See `UsdgPrizeEntry`. */
  withdrawnQuantity?: number;
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
  /** NFT top bid valued in USDG internal units (1:1 with USD). */
  usdgValueUnits: bigint;
  initialQuantity: number; // usually 1 for unique NFT
  remainingQuantity: number;
  /**
   * Tokens handed back to the creator by an escrow withdrawal. A withdrawn
   * token is no longer the machine's to give, so it stops counting as reserved
   * (see `collectReservedNftKeys`) and can be funded into another machine.
   */
  withdrawnQuantity?: number;
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

export type PrizeEntry = UsdgPrizeEntry | RfPrizeEntry | FriendPrizeEntry | NoPrizeEntry;

/** Narrowing guard: any cashback prize paid in USDG. */
export function isUsdgPrize(entry: PrizeEntry): entry is UsdgPrizeEntry {
  return entry.type === 'USDG_PRIZE';
}

/** Narrowing guard: cashback paid in RF. */
export function isRfPrize(entry: PrizeEntry): entry is RfPrizeEntry {
  return entry.type === 'RF_PRIZE';
}

/** Narrowing guard: cashback paid in USDG (the stable, default option). */
export function isCashbackPrize(
  entry: PrizeEntry
): entry is UsdgPrizeEntry | RfPrizeEntry {
  return entry.type === 'USDG_PRIZE' || entry.type === 'RF_PRIZE';
}

/** Any prize line that can actually win on a Fixed Odds machine. */
export type PrizeLineEntry = UsdgPrizeEntry | RfPrizeEntry | FriendPrizeEntry;

/** Narrowing guard: USDG cashback, RF cashback, or an NFT. */
export function isPrizeLine(entry: PrizeEntry): entry is PrizeLineEntry {
  return entry.type === 'USDG_PRIZE' || entry.type === 'RF_PRIZE' || entry.type === 'FRIEND_PRIZE';
}

export interface Ticket {
  id: string;
  prizeType: PrizeType;
  prizeEntryId: string;
  /** USDG cashback payout for a USDG_PRIZE ticket. */
  usdgAmountUnits?: bigint;
  /** RF cashback payout for an RF_PRIZE ticket. */
  rfAmountUnits?: bigint;
  friendTokenId?: bigint;
  friendName?: string;
  friendFamilyName?: string;
  friendGeneration?: number;
  friendSpriteRows?: readonly string[];
  /** EV reference value in USDG internal units. */
  usdgValueUnits: bigint;
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

  // Economics (shared). Every value here is USDG internal units.
  /** Price of one pull, in USDG. The play currency. */
  pullPriceUnits: bigint;
  /** Fixed platform fee on every pull: 500n (5.00%). Routed to treasuries. */
  platformFeeBps: bigint;

  initialPrizes: PrizeEntry[];
  remainingPrizes: PrizeEntry[];

  /** Aimed RTP in BPS (deck solver input / assist memory). */
  targetRtpBps: number;

  // Tracked totals (shared accounting, USDG unless noted)
  /** Gross USDG pulled. */
  totalSpentUnits: bigint;
  /** Total 5% platform fee taken (USDG). Never burned — routed to treasuries. */
  totalPlatformFeeUnits: bigint;
  /** Cumulative fee share sent to the primary treasury (USDG). */
  primaryFeeUnits: bigint;
  /**
   * Cumulative fee share that funded RF buybacks (USDG). This pot is burned
   * in batches, so the machine's contribution can be spent before its own
   * pulls finish — see `buyback.ts`.
   */
  buybackFeeUnits: bigint;
  /** 95% creator receipts (USDG). */
  creatorReceiptsUnits: bigint;
  /** Cashback paid out in USDG (USDG units). */
  usdgPrizesPaidUnits: bigint;
  /** Cashback paid out in RF (RF units — NOT USDG). */
  rfPrizesPaidUnits: bigint;
  friendPrizesAwardedCount: number;

  pullCount: number;
  createdAt: number;
  firstPullAt?: number;
  soldOutAt?: number;
  cancelledAt?: number;
  /** Epoch ms the operator suspended this machine. Cleared on resume. */
  pausedAt?: number;
  /** Epoch ms escrow was withdrawn and the machine was wound down. */
  withdrawnAt?: number;

  // --- Escrow withdrawal totals (USDG unless noted) ---
  /** Cumulative USDG pulled back out of escrow and returned to the creator. */
  escrowUsdgWithdrawnUnits: bigint;
  /** Cumulative RF pulled back out of escrow and returned to the creator (RF units). */
  escrowRfWithdrawnUnits: bigint;
  /** Cumulative Rare Friends returned to the creator by escrow withdrawals. */
  escrowFriendsWithdrawnCount: number;

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
  // RTP & EV in USDG units (10000 bps = 100.00%)
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
  | 'USDG_SEEDED'
  | 'RF_SEEDED'
  | 'FRIEND_SEEDED'
  | 'PULL_INITIATED'
  | 'PLATFORM_FEE_COLLECTED'
  | 'PLATFORM_FEE_SPLIT'
  | 'RF_BUYBACK_FUNDED'
  | 'RF_BURNED'
  | 'CREATOR_CREDITED'
  | 'USDG_PRIZE_PAID'
  | 'RF_PRIZE_PAID'
  | 'FRIEND_PRIZE_AWARDED'
  | 'NO_PRIZE_DRAWN'
  | 'MACHINE_SOLD_OUT'
  | 'MACHINE_CANCELLED'
  | 'MACHINE_PAUSED'
  | 'MACHINE_RESUMED'
  | 'ESCROW_WITHDRAWN';

export interface LedgerEvent {
  id: string;
  machineId: string;
  machineName: string;
  type: LedgerEventType;
  actorAddress: string;
  timestamp: number;
  /** USDG-denominated amount for this event. */
  usdgAmountUnits?: bigint;
  /** RF-denominated amount, only for RF cashback events. */
  rfAmountUnits?: bigint;
  friendTokenId?: bigint;
  friendName?: string;
  details: string;
  /** Machine model that produced this event. */
  machineType?: MachineType;
  /** Fixed-odds roll position in parts-per-million (0 ≤ roll < 1_000_000). */
  rollPpm?: number;
  /** Fee routing destination, set on PLATFORM_FEE_SPLIT / RF_BUYBACK_FUNDED. */
  feeRecipient?: { role: 'PRIMARY' | 'BUYBACK'; address: string; shareLabel: string };
  /** Slippage-adjusted USDG per RF, set on RF_BURNED. */
  burnPriceUsdg?: string;
  /** Burn sink address, set on RF_BURNED. */
  burnSink?: string;
}

export interface PullResult {
  ticket: Ticket;
  /** USDG deducted from the player. */
  spentUnits: bigint;
  /** Total 5% platform fee (USDG). */
  platformFeeUnits: bigint;
  /** 75% of the fee to the primary treasury (USDG). */
  primaryFeeUnits: bigint;
  /** 25% of the fee accrued into the RF buyback pot (USDG). */
  buybackFeeUnits: bigint;
  /** 95% creator receipts (USDG). */
  creatorReceiptUnits: bigint;
  wonPrize: boolean;
  prizeType: PrizeType;
  /** USDG cashback won (USDG units). */
  usdgWonUnits: bigint;
  /** RF cashback won (RF units). */
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
  /** Play currency: USDG the player pulls with. */
  usdgBalanceUnits: bigint;
  /** $RAREFRIENDS won as cashback prizes. Not spendable on pulls. */
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
  /** USDG available to escrow into new machines and to receive proceeds. */
  usdgBalanceUnits: bigint;
  /** $RAREFRIENDS available to escrow as RF cashback prizes. */
  rfBalanceUnits: bigint;
  ownedFriends: RareFriendMetadata[];
  /** Lifetime creator receipts (USDG). */
  totalProceedsUnits: bigint;
  /** Lifetime platform fees generated by this creator's machines (USDG). */
  totalPlatformFeesGeneratedUnits: bigint;
  machinesCreatedCount: number;
}
