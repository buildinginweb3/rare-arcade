/**
 * Machine Domain Logic.
 * Handles lifecycle transitions, pull execution, odds recalculation,
 * immutability locks, and pre-first-pull cancellation.
 */

import { calculatePullSplit, PLATFORM_FEE_BPS, PLATFORM_FEE_RECIPIENTS } from './fees.ts';
import { formatUsdg, formatUsdgGrouped } from './usdg.ts';
import { formatRFGrouped } from './rf.ts';
import { generateTicketDeck, type RngFunction, defaultCryptoRng } from './deck.ts';
import {
  calculateEv,
  calculateRtpBps,
  calculateTotalPrizeValue,
  solveRecommendedPulls,
  DEFAULT_TARGET_RTP_BPS,
} from './economics.ts';
import { TECHNICAL_MAX_RTP_BPS } from './rtp.ts';
import { assertFundablePrizes } from './settlement.ts';
import {
  pullFixedOddsMachine,
  isFixedOddsInventoryEmpty,
} from './fixedOdds.ts';
import type {
  FiniteDeckMachine,
  FixedOddsMachine,
  Machine,
  MachineShellId,
  PrizeEntry,
  PullResult,
  LedgerEvent,
  RareFriendMetadata,
} from './types.ts';

export interface CreateMachineParams {
  id?: string;
  name: string;
  shellId: MachineShellId;
  emblem?: string;
  mascotTokenId?: bigint;
  creatorAddress: string;
  pullPriceUnits: bigint;
  targetRtpBps?: number;
  totalPulls?: number;
  prizeEntries: PrizeEntry[];
  rng?: RngFunction;
}

/**
 * Creates and initializes a new Finite Deck Friend Machine.
 */
export function createMachine(params: CreateMachineParams): {
  machine: FiniteDeckMachine;
  /** USDG cashback locked into escrow (USDG units). */
  seededUsdgEscrowUnits: bigint;
  /** RF cashback locked into escrow (RF units). */
  seededRfEscrowUnits: bigint;
  seededFriends: RareFriendMetadata[];
  events: LedgerEvent[];
} {
  const {
    id = `machine-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    name,
    shellId,
    emblem = 'star',
    mascotTokenId,
    creatorAddress,
    pullPriceUnits,
    targetRtpBps = DEFAULT_TARGET_RTP_BPS,
    prizeEntries,
    rng = defaultCryptoRng,
  } = params;

  if (!name.trim()) {
    throw new Error('Machine name is required');
  }
  if (pullPriceUnits <= 0n) {
    throw new RangeError('Pull price must be greater than zero');
  }
  if (prizeEntries.length === 0) {
    throw new Error('Prize pool cannot be empty');
  }

  // Robinhood-only: reject any cross-chain NFT prize before it can be published.
  assertFundablePrizes(prizeEntries);

  // Calculate total prize value & minimum pulls needed
  let prizeItemsCount = 0;
  let seededUsdgEscrowUnits = 0n;
  let seededRfEscrowUnits = 0n;
  const seededFriends: RareFriendMetadata[] = [];

  for (const entry of prizeEntries) {
    if (entry.type === 'USDG_PRIZE') {
      prizeItemsCount += entry.initialQuantity;
      seededUsdgEscrowUnits += entry.amountUnits * BigInt(entry.initialQuantity);
    } else if (entry.type === 'RF_PRIZE') {
      prizeItemsCount += entry.initialQuantity;
      seededRfEscrowUnits += entry.amountUnits * BigInt(entry.initialQuantity);
    } else if (entry.type === 'FRIEND_PRIZE') {
      prizeItemsCount += entry.initialQuantity;
      seededFriends.push({
        tokenId: entry.tokenId,
        name: entry.name,
        familyName: entry.familyName,
        generation: entry.generation,
        spriteRows: entry.spriteRows,
        demoUsdgValueUnits: entry.usdgValueUnits,
        origin: entry.origin,
        chainId: entry.chainId,
        chainSlug: entry.chainSlug,
        contractAddress: entry.contractAddress,
        collectionType: entry.collectionType,
        collectionSlug: entry.collectionSlug,
        collectionName: entry.collectionName,
        collectionImage: entry.collectionImage,
        tokenStandard: entry.tokenStandard,
        description: entry.description,
        traits: entry.traits,
        imageUrl: entry.imageUrl,
        displayImageUrl: entry.displayImageUrl,
        animationUrl: entry.animationUrl,
        openseaUrl: entry.openseaUrl,
        verifiedOwnerAddress: entry.verifiedOwnerAddress,
        valuationSnapshot: entry.valuationSnapshot,
      });
    }
  }

  if (prizeItemsCount <= 0) {
    throw new Error('Machine must contain at least one winning prize');
  }

  const totalPrizeUnits = calculateTotalPrizeValue(prizeEntries, false);

  // If totalPulls not specified, solve for target RTP
  let totalPulls = params.totalPulls;
  if (!totalPulls || totalPulls < prizeItemsCount) {
    const solved = solveRecommendedPulls(
      totalPrizeUnits,
      pullPriceUnits,
      targetRtpBps,
      prizeItemsCount
    );
    totalPulls = solved.recommendedPulls;
  }

  const initialEvUnits = calculateEv(totalPrizeUnits, totalPulls);
  const initialRtpBps = calculateRtpBps(initialEvUnits, pullPriceUnits);

  // Technical sanity bounds only — quick-pick presets are suggestions, not
  // restrictions. Creators may model <80%, >95%, even >100% (subsidized).
  if (!Number.isFinite(initialRtpBps) || initialRtpBps <= 0) {
    throw new Error('Initial RTP must be a positive finite percentage. Adjust prizes, pull price, or ticket count.');
  }
  if (initialRtpBps > TECHNICAL_MAX_RTP_BPS) {
    throw new Error(
      `Initial RTP (${(initialRtpBps / 100).toFixed(1)}%) exceeds the technical maximum of ${TECHNICAL_MAX_RTP_BPS / 100}%.`
    );
  }

  // Generate finite deck
  const deck = generateTicketDeck(prizeEntries, totalPulls, rng);

  // Deep clone initial prize entries for remaining tracking
  const remainingPrizes: PrizeEntry[] = prizeEntries.map((p) => ({
    ...p,
    remainingQuantity: p.initialQuantity,
  }));

  const now = Date.now();
  const machine: FiniteDeckMachine = {
    id,
    name,
    shellId,
    machineType: 'finite_deck',
    emblem,
    mascotTokenId,
    creatorAddress,
    status: 'READY',
    pullPriceUnits,
    platformFeeBps: PLATFORM_FEE_BPS,
    totalPulls,
    remainingPulls: totalPulls,
    initialPrizes: prizeEntries.map((entry) => ({
      ...entry,
      initialQuantity: entry.initialQuantity,
      remainingQuantity: entry.initialQuantity,
    })),
    remainingPrizes,
    deck,
    targetRtpBps,
    initialRtpBps,
    currentRtpBps: initialRtpBps,
    initialEvUnits,
    currentEvUnits: initialEvUnits,
    totalSpentUnits: 0n,
    totalPlatformFeeUnits: 0n,
    primaryFeeUnits: 0n,
    buybackFeeUnits: 0n,
    creatorReceiptsUnits: 0n,
    usdgPrizesPaidUnits: 0n,
    rfPrizesPaidUnits: 0n,
    friendPrizesAwardedCount: 0,
    escrowUsdgWithdrawnUnits: 0n,
    escrowRfWithdrawnUnits: 0n,
    escrowFriendsWithdrawnCount: 0,
    pullCount: 0,
    createdAt: now,
    isRulesLocked: false,
  };

  const events: LedgerEvent[] = [
    {
      id: `evt-create-${now}-${Math.random()}`,
      machineId: id,
      machineName: name,
      type: 'MACHINE_CREATED',
      actorAddress: creatorAddress,
      timestamp: now,
      machineType: 'finite_deck',
      details: `Machine "${name}" created with ${totalPulls} pulls at pull price ${formatUsdg(pullPriceUnits, { showSymbol: true })} (RTP: ${(initialRtpBps / 100).toFixed(1)}%)`,
    },
  ];

  if (seededUsdgEscrowUnits > 0n) {
    events.push({
      id: `evt-seed-usdg-${now}-${Math.random()}`,
      machineId: id,
      machineName: name,
      type: 'USDG_SEEDED',
      actorAddress: creatorAddress,
      timestamp: now,
      machineType: 'finite_deck',
      usdgAmountUnits: seededUsdgEscrowUnits,
      details: `Escrowed ${formatUsdgGrouped(seededUsdgEscrowUnits)} in USDG cashback prize inventory`,
    });
  }

  if (seededRfEscrowUnits > 0n) {
    events.push({
      id: `evt-seed-rf-${now}-${Math.random()}`,
      machineId: id,
      machineName: name,
      type: 'RF_SEEDED',
      actorAddress: creatorAddress,
      timestamp: now,
      machineType: 'finite_deck',
      rfAmountUnits: seededRfEscrowUnits,
      details: `Escrowed ${formatRFGrouped(seededRfEscrowUnits)} in $RAREFRIENDS cashback prize inventory`,
    });
  }

  for (const friend of seededFriends) {
    events.push({
      id: `evt-seed-friend-${friend.tokenId}-${now}`,
      machineId: id,
      machineName: name,
      type: 'FRIEND_SEEDED',
      actorAddress: creatorAddress,
      timestamp: now,
      machineType: 'finite_deck',
      friendTokenId: friend.tokenId,
      friendName: friend.name,
      details: `Seeded Rare Friend #${friend.tokenId} "${friend.name}" into prize inventory`,
    });
  }

  return { machine, seededUsdgEscrowUnits, seededRfEscrowUnits, seededFriends, events };
}

/**
 * True when a machine is sold out, per its own model's sellout condition:
 * Finite Deck exhausts tickets; Fixed Odds exhausts prize inventory.
 */
export function isMachineSoldOut(machine: Machine): boolean {
  if (machine.status === 'SOLD_OUT') return true;
  if (machine.machineType === 'fixed_odds') {
    return isFixedOddsInventoryEmpty(machine.remainingPrizes);
  }
  return machine.remainingPulls <= 0;
}

/**
 * Executes a pull on a Finite Deck Friend Machine.
 */
export function pullFiniteDeckMachine(
  machine: FiniteDeckMachine,
  playerAddress: string,
  playerBalanceUnits: bigint
): {
  updatedMachine: FiniteDeckMachine;
  result: PullResult;
  events: LedgerEvent[];
} {
  if (machine.status === 'SOLD_OUT') {
    throw new Error('Machine is SOLD OUT. No pulls remaining.');
  }
  if (machine.status === 'CANCELLED') {
    throw new Error('Machine has been CANCELLED.');
  }
  if (machine.status === 'PAUSED') {
    throw new Error('Machine is PAUSED by its creator. No pulls until it resumes.');
  }
  if (machine.remainingPulls <= 0 || machine.deck.length === 0) {
    throw new Error('Machine has no tickets remaining.');
  }
  if (playerBalanceUnits < machine.pullPriceUnits) {
    throw new Error(
      `Insufficient USDG. Pull cost: ${formatUsdgGrouped(machine.pullPriceUnits)}, balance: ${formatUsdgGrouped(playerBalanceUnits)}`
    );
  }

  const now = Date.now();
  const split = calculatePullSplit(machine.pullPriceUnits);

  // Take the top ticket from finite shuffled deck
  const ticket = machine.deck[0]!;
  const newDeck = machine.deck.slice(1);
  const newRemainingPulls = machine.remainingPulls - 1;

  // Clone remaining prizes
  const updatedRemainingPrizes = machine.remainingPrizes.map((p) => {
    if (p.id === ticket.prizeEntryId) {
      return { ...p, remainingQuantity: Math.max(0, p.remainingQuantity - 1) };
    }
    return { ...p };
  });

  // Calculate new remaining EV and RTP
  const newRemainingPrizeUnits = calculateTotalPrizeValue(updatedRemainingPrizes, true);
  const newCurrentEvUnits = calculateEv(newRemainingPrizeUnits, newRemainingPulls);
  const newCurrentRtpBps = calculateRtpBps(newCurrentEvUnits, machine.pullPriceUnits);

  let usdgWonUnits = 0n;
  let rfWonUnits = 0n;
  let friendWon: RareFriendMetadata | undefined;
  const wonPrize = ticket.prizeType !== 'NO_PRIZE';

  if (ticket.prizeType === 'USDG_PRIZE') {
    usdgWonUnits = ticket.usdgAmountUnits ?? 0n;
  } else if (ticket.prizeType === 'RF_PRIZE') {
    rfWonUnits = ticket.rfAmountUnits ?? 0n;
  } else if (ticket.prizeType === 'FRIEND_PRIZE' && ticket.friendTokenId) {
    friendWon = {
      tokenId: ticket.friendTokenId,
      name: ticket.friendName || `Rare Friend #${ticket.friendTokenId}`,
      familyName: ticket.friendFamilyName || 'Rare Friend',
      generation: ticket.friendGeneration || 1,
      spriteRows: ticket.friendSpriteRows,
      demoUsdgValueUnits: ticket.usdgValueUnits,
      origin: ticket.friendOrigin,
      chainId: ticket.friendChainId,
      contractAddress: ticket.friendContractAddress,
      collectionType: ticket.friendCollectionType,
      collectionName: ticket.friendCollectionName,
      imageUrl: ticket.friendImageUrl,
      displayImageUrl: ticket.friendDisplayImageUrl,
      animationUrl: ticket.friendAnimationUrl,
      openseaUrl: ticket.friendOpenseaUrl,
      verifiedOwnerAddress: ticket.friendVerifiedOwnerAddress,
    };
  }

  const isSoldOut = newRemainingPulls === 0;
  const newStatus = isSoldOut ? 'SOLD_OUT' : 'LIVE';

  const updatedMachine: FiniteDeckMachine = {
    ...machine,
    status: newStatus,
    remainingPulls: newRemainingPulls,
    remainingPrizes: updatedRemainingPrizes,
    deck: newDeck,
    currentEvUnits: newCurrentEvUnits,
    currentRtpBps: newCurrentRtpBps,
    totalSpentUnits: machine.totalSpentUnits + machine.pullPriceUnits,
    totalPlatformFeeUnits: machine.totalPlatformFeeUnits + split.feeUnits,
    primaryFeeUnits: machine.primaryFeeUnits + split.primaryFeeUnits,
    buybackFeeUnits: machine.buybackFeeUnits + split.buybackFeeUnits,
    creatorReceiptsUnits: machine.creatorReceiptsUnits + split.creatorUnits,
    usdgPrizesPaidUnits: machine.usdgPrizesPaidUnits + usdgWonUnits,
    rfPrizesPaidUnits: machine.rfPrizesPaidUnits + rfWonUnits,
    friendPrizesAwardedCount: machine.friendPrizesAwardedCount + (friendWon ? 1 : 0),
    pullCount: machine.pullCount + 1,
    firstPullAt: machine.firstPullAt ?? now,
    soldOutAt: isSoldOut ? now : undefined,
    isRulesLocked: true, // Immutable from the first pull
  };

  const result: PullResult = {
    ticket,
    spentUnits: machine.pullPriceUnits,
    platformFeeUnits: split.feeUnits,
    primaryFeeUnits: split.primaryFeeUnits,
    buybackFeeUnits: split.buybackFeeUnits,
    creatorReceiptUnits: split.creatorUnits,
    wonPrize,
    prizeType: ticket.prizeType,
    usdgWonUnits,
    rfWonUnits,
    friendWon,
    newRemainingPulls,
    newCurrentRtpBps,
    isSoldOut,
    machineType: 'finite_deck',
  };

  const events: LedgerEvent[] = [
    {
      id: `evt-pull-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'PULL_INITIATED',
      actorAddress: playerAddress,
      timestamp: now,
      machineType: 'finite_deck',
      usdgAmountUnits: machine.pullPriceUnits,
      details: `Player pulled "${machine.name}" for ${formatUsdgGrouped(machine.pullPriceUnits)}`,
    },
    {
      id: `evt-fee-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'PLATFORM_FEE_COLLECTED',
      actorAddress: playerAddress,
      timestamp: now,
      machineType: 'finite_deck',
      usdgAmountUnits: split.feeUnits,
      details: `Platform fee ${formatUsdgGrouped(split.feeUnits)} (5.00% of spend)`,
    },
    ...PLATFORM_FEE_RECIPIENTS.map(
      (r, i): LedgerEvent =>
        r.role === 'BUYBACK'
          ? {
              id: `evt-buyback-funded-${now}-${Math.random()}`,
              machineId: machine.id,
              machineName: machine.name,
              type: 'RF_BUYBACK_FUNDED',
              // The buyback pot is held by the fee router, not sent anywhere
              // on this pull, so there is no recipient address to record yet.
              actorAddress: machine.creatorAddress,
              timestamp: now,
              machineType: 'finite_deck' as const,
              usdgAmountUnits: split.buybackFeeUnits,
              details: `${r.shareLabel} of platform fee accrued to the RF buyback pot`,
            }
          : {
              id: `evt-fee-split-${r.role}-${now}-${i}-${Math.random()}`,
              machineId: machine.id,
              machineName: machine.name,
              type: 'PLATFORM_FEE_SPLIT' as const,
              actorAddress: r.address,
              timestamp: now,
              machineType: 'fixed_odds' as const,
              usdgAmountUnits: split.primaryFeeUnits,
              feeRecipient: {
                role: r.role,
                address: r.address,
                shareLabel: r.shareLabel,
              },
              details: `${r.shareLabel} of platform fee routed to ${r.address}`,
            }
    ),
    {
      id: `evt-credit-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'CREATOR_CREDITED',
      actorAddress: machine.creatorAddress,
      timestamp: now,
      machineType: 'finite_deck',
      usdgAmountUnits: split.creatorUnits,
      details: `Operator received ${formatUsdgGrouped(split.creatorUnits)} proceeds (95.00%)`,
    },
  ];

  if (ticket.prizeType === 'USDG_PRIZE' && usdgWonUnits > 0n) {
    events.push({
      id: `evt-usdg-won-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'USDG_PRIZE_PAID',
      actorAddress: playerAddress,
      timestamp: now,
      machineType: 'finite_deck',
      usdgAmountUnits: usdgWonUnits,
      details: `Player won ${formatUsdgGrouped(usdgWonUnits)} USDG cashback!`,
    });
  } else if (ticket.prizeType === 'RF_PRIZE' && rfWonUnits > 0n) {
    events.push({
      id: `evt-rf-won-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'RF_PRIZE_PAID',
      actorAddress: playerAddress,
      timestamp: now,
      machineType: 'finite_deck',
      rfAmountUnits: rfWonUnits,
      usdgAmountUnits: ticket.usdgValueUnits,
      details: `Player won ${formatRFGrouped(rfWonUnits)} $RAREFRIENDS cashback!`,
    });
  } else if (ticket.prizeType === 'FRIEND_PRIZE' && friendWon) {
    events.push({
      id: `evt-friend-won-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'FRIEND_PRIZE_AWARDED',
      actorAddress: playerAddress,
      timestamp: now,
      machineType: 'finite_deck',
      friendTokenId: friendWon.tokenId,
      friendName: friendWon.name,
      details: `JACKPOT! Player won Rare Friend #${friendWon.tokenId} "${friendWon.name}"!`,
    });
  } else {
    events.push({
      id: `evt-noprize-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'NO_PRIZE_DRAWN',
      actorAddress: playerAddress,
      timestamp: now,
      machineType: 'finite_deck',
      details: `Ticket drawn: Try again`,
    });
  }

  if (isSoldOut) {
    events.push({
      id: `evt-soldout-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'MACHINE_SOLD_OUT',
      actorAddress: machine.creatorAddress,
      timestamp: now,
      machineType: 'finite_deck',
      details: `Machine "${machine.name}" has completely SOLD OUT! Total volume: ${formatUsdgGrouped(updatedMachine.totalSpentUnits)}, platform fees: ${formatUsdgGrouped(updatedMachine.totalPlatformFeeUnits)}`,
    });
  }

  return { updatedMachine, result, events };
}

/**
 * Strategy dispatcher: routes a pull to the machine's own engine.
 * Finite Deck pops a shuffled ticket; Fixed Odds rolls fresh randomness.
 * The optional rng is used by Fixed Odds (each pull rolls independently);
 * Finite Deck ignores it (its deck was shuffled at creation).
 */
export function pullMachine(
  machine: FiniteDeckMachine,
  playerAddress: string,
  playerBalanceUnits: bigint,
  rng?: RngFunction
): {
  updatedMachine: FiniteDeckMachine;
  result: PullResult;
  events: LedgerEvent[];
};
export function pullMachine(
  machine: FixedOddsMachine,
  playerAddress: string,
  playerBalanceUnits: bigint,
  rng?: RngFunction
): {
  updatedMachine: FixedOddsMachine;
  result: PullResult;
  events: LedgerEvent[];
};
export function pullMachine(
  machine: Machine,
  playerAddress: string,
  playerBalanceUnits: bigint,
  rng?: RngFunction
): {
  updatedMachine: Machine;
  result: PullResult;
  events: LedgerEvent[];
};
export function pullMachine(
  machine: Machine,
  playerAddress: string,
  playerBalanceUnits: bigint,
  rng: RngFunction = defaultCryptoRng
): {
  updatedMachine: Machine;
  result: PullResult;
  events: LedgerEvent[];
} {
  if (machine.machineType === 'fixed_odds') {
    return pullFixedOddsMachine(machine, playerAddress, playerBalanceUnits, rng);
  }
  return pullFiniteDeckMachine(machine, playerAddress, playerBalanceUnits);
}

/**
 * Cancels a machine before its first pull, returning all seeded escrow.
 * Finite Deck clears its ticket counters; Fixed Odds has no deck to clear —
 * each model only touches its own fields (no cross-type corruption).
 */
export interface CancelMachineResult {
  cancelledMachine: Machine;
  /** USDG cashback returned to the creator (USDG units). */
  refundUsdgUnits: bigint;
  /** RF cashback returned to the creator (RF units). */
  refundRfUnits: bigint;
  refundFriends: RareFriendMetadata[];
  events: LedgerEvent[];
}

export function cancelMachine(machine: Machine): CancelMachineResult {
  if (machine.pullCount > 0 || machine.isRulesLocked) {
    throw new Error('Cannot cancel a machine after pulls have started.');
  }
  if (machine.status === 'CANCELLED') {
    throw new Error('Machine is already cancelled.');
  }

  let refundUsdgUnits = 0n;
  let refundRfUnits = 0n;
  const refundFriends: RareFriendMetadata[] = [];

  for (const entry of machine.initialPrizes) {
    if (entry.type === 'USDG_PRIZE') {
      refundUsdgUnits += entry.amountUnits * BigInt(entry.initialQuantity);
    } else if (entry.type === 'RF_PRIZE') {
      refundRfUnits += entry.amountUnits * BigInt(entry.initialQuantity);
    } else if (entry.type === 'FRIEND_PRIZE') {
      refundFriends.push({
        tokenId: entry.tokenId,
        name: entry.name,
        familyName: entry.familyName,
        generation: entry.generation,
        spriteRows: entry.spriteRows,
        demoUsdgValueUnits: entry.usdgValueUnits,
        origin: entry.origin,
        chainId: entry.chainId,
        contractAddress: entry.contractAddress,
        collectionType: entry.collectionType,
        collectionName: entry.collectionName,
        imageUrl: entry.imageUrl,
        displayImageUrl: entry.displayImageUrl,
        animationUrl: entry.animationUrl,
        openseaUrl: entry.openseaUrl,
        verifiedOwnerAddress: entry.verifiedOwnerAddress,
      });
    }
  }

  const now = Date.now();
  // Each model only touches its own fields: Finite Deck zeroes its ticket
  // counters and drops the deck; Fixed Odds has neither.
  const cancelledMachine: Machine =
    machine.machineType === 'fixed_odds'
      ? { ...machine, status: 'CANCELLED', cancelledAt: now }
      : { ...machine, status: 'CANCELLED', cancelledAt: now, remainingPulls: 0, deck: [] };

  const events: LedgerEvent[] = [
    {
      id: `evt-cancel-${now}-${Math.random()}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'MACHINE_CANCELLED',
      actorAddress: machine.creatorAddress,
      timestamp: now,
      machineType: machine.machineType,
      details: `Machine "${machine.name}" cancelled. Refunded ${formatUsdgGrouped(refundUsdgUnits)}, ${formatRFGrouped(refundRfUnits)} and ${refundFriends.length} Rare Friends to creator.`,
    },
  ];

  return { cancelledMachine, refundUsdgUnits, refundRfUnits, refundFriends, events };
}
