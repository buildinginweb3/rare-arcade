/**
 * Machine Vault — pausing and creator escrow withdrawal.
 *
 * A machine's "vault" is the prize escrow still locked inside it: the USDG
 * cashback, RF cashback and Rare Friends that have not yet been won. This
 * module is the only sanctioned way for a creator to get that escrow back.
 *
 * Design rules, all of which the tests pin down:
 *
 *   1. A pause is FREEZING, not unwinding. It suspends pulls, touches no
 *      escrow, and is always reversible. A paused machine still holds
 *      everything it held before.
 *   2. Withdrawal is FULL-OR-NOTHING and TERMINAL. There is no partial
 *      withdrawal and no "withdraw some, keep playing" — either the whole
 *      remaining vault comes back and the machine is wound down, or nothing
 *      moves. Partial withdrawal would silently rewrite live RTP mid-game,
 *      which the rules-lock promise forbids.
 *   3. Withdrawal is computed from `remainingPrizes` x `remainingQuantity`
 *      ONLY. `initialPrizes` is the published snapshot and is never read for
 *      a refund, so a prize that was already paid out can never be refunded
 *      twice. This is the single most important invariant in this file.
 *   4. Withdrawal REQUIRES a prior pause. Winding a live machine down is a
 *      two-step, deliberate action.
 *   5. The rules lock survives. Withdrawal never sets `isRulesLocked: false`,
 *      so the odds the machine published are never rewritten.
 *   6. Published RTP/EV fields are left alone. They record the game as it was
 *      configured and played; after a terminal withdrawal there is no live
 *      vault left to price, and zeroing them would destroy that record.
 *   7. Only the machine's operator may act — the creator id and any connected
 *      wallet that funded it. Players have no standing in a machine's escrow.
 *
 * The platform-wide RF buyback pot is deliberately untouched here: it is
 * funded from platform fees, pooled across machines, and is never part of a
 * machine's prize escrow. See `buyback.ts`.
 */

import { formatRFGrouped } from './rf.ts';
import { formatUsdg, formatUsdgGrouped } from './usdg.ts';
// `normalizeIdentity` is the one canonical leniency rule for matching operator
// addresses (it keeps demo ids like '0xDemoCreator4663' usable). Duplicating it
// here would let the vault and the dashboard disagree about who owns a machine,
// so the shared helper is imported rather than reimplemented.
import { normalizeIdentity } from '../nfts/ownership.ts';
import type {
  LedgerEvent,
  Machine,
  PrizeEntry,
  RareFriendMetadata,
} from './types.ts';

/**
 * Everything still locked inside a machine right now. Always derived from
 * `remainingPrizes`, never from `initialPrizes` — see rule 3 above.
 */
export interface EscrowSnapshot {
  /** USDG cashback still in escrow (USDG units). */
  usdgUnits: bigint;
  /** RF cashback still in escrow (RF units, 1 RF = 1000n). */
  rfUnits: bigint;
  /**
   * Total USDG-equivalent value of everything still in escrow, including RF
   * at its immutable seed-time value and NFTs at their locked snapshot value.
   * This is the number the vault is worth if it were withdrawn right now.
   */
  totalUsdgValueUnits: bigint;
  /** Rare Friends still in escrow. */
  friends: RareFriendMetadata[];
  /** Count of all remaining prize items (cashback + NFTs). */
  itemCount: number;
}

export function emptyEscrowSnapshot(): EscrowSnapshot {
  return {
    usdgUnits: 0n,
    rfUnits: 0n,
    totalUsdgValueUnits: 0n,
    friends: [],
    itemCount: 0,
  };
}

/** Rebuild the creator-facing metadata a returned Friend needs on the way home. */
function friendFromEntry(entry: Extract<PrizeEntry, { type: 'FRIEND_PRIZE' }>): RareFriendMetadata {
  return {
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
  };
}

/**
 * What is still locked in the machine. Reads `remainingPrizes` only — an
 * entry's `remainingQuantity` is the count that can still be won, so paid-out
 * and withdrawn units are both already excluded.
 */
export function computeEscrowSnapshot(machine: Machine): EscrowSnapshot {
  const snapshot = emptyEscrowSnapshot();
  for (const entry of machine.remainingPrizes) {
    const qty = entry.remainingQuantity;
    if (qty <= 0) continue;
    if (entry.type === 'USDG_PRIZE') {
      snapshot.usdgUnits += entry.amountUnits * BigInt(qty);
      snapshot.totalUsdgValueUnits += entry.amountUnits * BigInt(qty);
    } else if (entry.type === 'RF_PRIZE') {
      snapshot.rfUnits += entry.amountUnits * BigInt(qty);
      snapshot.totalUsdgValueUnits += entry.usdgValueUnits * BigInt(qty);
    } else if (entry.type === 'FRIEND_PRIZE') {
      snapshot.friends.push(friendFromEntry(entry));
      snapshot.totalUsdgValueUnits += entry.usdgValueUnits * BigInt(qty);
    }
    snapshot.itemCount += qty;
  }
  return snapshot;
}

/** True when the machine holds no withdrawable prize escrow. */
export function isEscrowEmpty(snapshot: EscrowSnapshot): boolean {
  return (
    snapshot.usdgUnits === 0n &&
    snapshot.rfUnits === 0n &&
    snapshot.friends.length === 0
  );
}

export function isMachinePaused(machine: Machine): boolean {
  return machine.status === 'PAUSED';
}

/**
 * True when this operator's identities funded the machine. Both sides are
 * normalized here so callers cannot get it wrong by passing raw addresses —
 * a mismatch would silently lock a real creator out of their own vault.
 */
export function isVaultOperator(
  machine: Machine,
  operatorAddresses: readonly string[]
): boolean {
  const creator = normalizeIdentity(machine.creatorAddress);
  return operatorAddresses.some((address) => normalizeIdentity(address) === creator);
}

export interface VaultEligibility {
  ok: boolean;
  /** Player/creator-facing explanation when `ok` is false. */
  reason: string;
}

const ELIGIBLE: VaultEligibility = { ok: true, reason: '' };
function denied(reason: string): VaultEligibility {
  return { ok: false, reason };
}

export function canPauseMachine(
  machine: Machine,
  operatorAddresses: readonly string[]
): VaultEligibility {
  if (!isVaultOperator(machine, operatorAddresses)) {
    return denied('Only the machine creator can pause it.');
  }
  if (machine.status === 'PAUSED') return denied('Machine is already paused.');
  if (machine.status === 'CANCELLED') return denied('Machine has been cancelled.');
  if (machine.status === 'SOLD_OUT') return denied('Machine is sold out.');
  return ELIGIBLE;
}

export interface PauseMachineResult {
  pausedMachine: Machine;
  events: LedgerEvent[];
}

/**
 * Suspends pulls without touching escrow. Pausing is reversible and free:
 * the machine keeps every prize it had, so resuming restores it exactly.
 */
export function pauseMachine(
  machine: Machine,
  operatorAddresses: readonly string[],
  now: number = Date.now()
): PauseMachineResult {
  const eligibility = canPauseMachine(machine, operatorAddresses);
  if (!eligibility.ok) throw new Error(eligibility.reason);
  if (machine.status !== 'LIVE' && machine.status !== 'READY') {
    throw new Error('Only a live machine can be paused.');
  }

  const pausedMachine: Machine = { ...machine, status: 'PAUSED', pausedAt: now };
  return {
    pausedMachine,
    events: [
      {
        id: `evt-pause-${machine.id}-${now}`,
        machineId: machine.id,
        machineName: machine.name,
        type: 'MACHINE_PAUSED',
        actorAddress: machine.creatorAddress,
        timestamp: now,
        machineType: machine.machineType,
        details:
          `Machine "${machine.name}" paused by its creator. Pulls are suspended; ` +
          `escrow is untouched and fully withdrawable.`,
      },
    ],
  };
}

export function canResumeMachine(
  machine: Machine,
  operatorAddresses: readonly string[]
): VaultEligibility {
  if (!isVaultOperator(machine, operatorAddresses)) {
    return denied('Only the machine creator can resume it.');
  }
  if (machine.status !== 'PAUSED') return denied('Machine is not paused.');
  return ELIGIBLE;
}

export interface ResumeMachineResult {
  resumedMachine: Machine;
  events: LedgerEvent[];
}

/**
 * Lifts a pause. Returns the machine to LIVE, clearing `pausedAt` so a
 * resumed machine carries no stale pause timestamp.
 */
export function resumeMachine(
  machine: Machine,
  operatorAddresses: readonly string[],
  now: number = Date.now()
): ResumeMachineResult {
  const eligibility = canResumeMachine(machine, operatorAddresses);
  if (!eligibility.ok) throw new Error(eligibility.reason);

  const { pausedAt: _cleared, ...rest } = machine;
  void _cleared;
  const resumedMachine: Machine = { ...rest, status: 'LIVE' } as Machine;
  return {
    resumedMachine,
    events: [
      {
        id: `evt-resume-${machine.id}-${now}`,
        machineId: machine.id,
        machineName: machine.name,
        type: 'MACHINE_RESUMED',
        actorAddress: machine.creatorAddress,
        timestamp: now,
        machineType: machine.machineType,
        details: `Machine "${machine.name}" resumed by its creator. Pulls are live again.`,
      },
    ],
  };
}

export function canWithdrawEscrow(
  machine: Machine,
  operatorAddresses: readonly string[]
): VaultEligibility {
  if (!isVaultOperator(machine, operatorAddresses)) {
    return denied('Only the machine creator can withdraw its escrow.');
  }
  if (machine.status === 'CANCELLED') return denied('Machine is already closed.');
  if (machine.status === 'SOLD_OUT') return denied('Machine is sold out.');
  if (machine.status !== 'PAUSED') {
    return denied('Pause the machine before withdrawing its escrow.');
  }
  if (isEscrowEmpty(computeEscrowSnapshot(machine))) {
    return denied('No prize escrow left to withdraw.');
  }
  return ELIGIBLE;
}

export interface WithdrawEscrowResult {
  withdrawnMachine: Machine;
  /** USDG cashback returned to the creator (USDG units). */
  refundUsdgUnits: bigint;
  /** RF cashback returned to the creator (RF units). */
  refundRfUnits: bigint;
  /** Rare Friends returned to the creator. */
  refundFriends: RareFriendMetadata[];
  events: LedgerEvent[];
}

/**
 * Returns the entire remaining vault to the creator and winds the machine
 * down. All-or-nothing by design (rule 2): every remaining prize line is
 * zeroed, so no later pull could award an asset that has left the machine.
 *
 * Unlike `cancelMachine`, this works AFTER pulls have started — it just
 * refunds what is left rather than the full original seed. Published
 * `initialPrizes` and the rules lock are both left intact.
 */
export function withdrawEscrow(
  machine: Machine,
  operatorAddresses: readonly string[],
  now: number = Date.now()
): WithdrawEscrowResult {
  const eligibility = canWithdrawEscrow(machine, operatorAddresses);
  if (!eligibility.ok) throw new Error(eligibility.reason);

  const snapshot = computeEscrowSnapshot(machine);

  // Zero every remaining line and record how much of it left the machine, so
  // `initial = remaining + withdrawn + paidOut` stays auditable per line.
  // NO_PRIZE holds no asset, so it is never marked withdrawn.
  const emptiedRemainingPrizes: PrizeEntry[] = machine.remainingPrizes.map((entry) => {
    if (entry.type === 'NO_PRIZE') return entry;
    if (entry.remainingQuantity <= 0) return entry;
    return {
      ...entry,
      remainingQuantity: 0,
      withdrawnQuantity: (entry.withdrawnQuantity ?? 0) + entry.remainingQuantity,
    };
  });

  // Everything that applies to both models: the machine is closed, the vault is
  // emptied, and the running withdrawal totals are bumped.
  const closing = {
    status: 'CANCELLED' as const,
    cancelledAt: now,
    withdrawnAt: now,
    remainingPrizes: emptiedRemainingPrizes,
    escrowUsdgWithdrawnUnits: machine.escrowUsdgWithdrawnUnits + snapshot.usdgUnits,
    escrowRfWithdrawnUnits: machine.escrowRfWithdrawnUnits + snapshot.rfUnits,
    escrowFriendsWithdrawnCount:
      machine.escrowFriendsWithdrawnCount + snapshot.friends.length,
  };

  // Terminal: no pulls remain, so the deck is dropped and the ticket counter
  // zeroed. Finite Deck owns both fields; Fixed Odds has neither and is left
  // untouched, so neither model can be corrupted by the other's surgery.
  const emptiedMachine: Machine =
    machine.machineType === 'finite_deck'
      ? { ...machine, ...closing, remainingPulls: 0, deck: [] }
      : { ...machine, ...closing };

  const events: LedgerEvent[] = [];

  if (snapshot.usdgUnits > 0n) {
    events.push({
      id: `evt-withdraw-usdg-${machine.id}-${now}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'ESCROW_WITHDRAWN',
      actorAddress: machine.creatorAddress,
      timestamp: now,
      usdgAmountUnits: snapshot.usdgUnits,
      machineType: machine.machineType,
      details:
        `Creator withdrew ${formatUsdgGrouped(snapshot.usdgUnits)} of unused USDG ` +
        `prize escrow from "${machine.name}" after ${machine.pullCount} pulls.`,
    });
  }

  if (snapshot.rfUnits > 0n) {
    events.push({
      id: `evt-withdraw-rf-${machine.id}-${now}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'ESCROW_WITHDRAWN',
      actorAddress: machine.creatorAddress,
      timestamp: now,
      rfAmountUnits: snapshot.rfUnits,
      machineType: machine.machineType,
      details:
        `Creator withdrew ${formatRFGrouped(snapshot.rfUnits)} of unused $RAREFRIENDS ` +
        `prize escrow from "${machine.name}" after ${machine.pullCount} pulls.`,
    });
  }

  for (const friend of snapshot.friends) {
    events.push({
      id: `evt-withdraw-friend-${machine.id}-${friend.tokenId}-${now}`,
      machineId: machine.id,
      machineName: machine.name,
      type: 'ESCROW_WITHDRAWN',
      actorAddress: machine.creatorAddress,
      timestamp: now,
      usdgAmountUnits: friend.demoUsdgValueUnits,
      friendTokenId: friend.tokenId,
      friendName: friend.name,
      machineType: machine.machineType,
      details:
        `Creator withdrew Rare Friend #${friend.tokenId} "${friend.name}" ` +
        `(${formatUsdg(friend.demoUsdgValueUnits)}) back from "${machine.name}".`,
    });
  }

  events.push({
    id: `evt-withdraw-close-${machine.id}-${now}`,
    machineId: machine.id,
    machineName: machine.name,
    type: 'MACHINE_CANCELLED',
    actorAddress: machine.creatorAddress,
    timestamp: now,
    usdgAmountUnits: snapshot.totalUsdgValueUnits,
    machineType: machine.machineType,
    details:
      `Machine "${machine.name}" wound down by its creator after ${machine.pullCount} pulls. ` +
      `${formatUsdg(snapshot.totalUsdgValueUnits)} of prize escrow returned ` +
      `(${formatUsdgGrouped(snapshot.usdgUnits)} USDG, ${formatRFGrouped(snapshot.rfUnits)} RF, ` +
      `${snapshot.friends.length} Rare Friends). Published odds and RTP are unchanged; ` +
      `players keep every prize they already won.`,
  });

  return {
    withdrawnMachine: emptiedMachine,
    refundUsdgUnits: snapshot.usdgUnits,
    refundRfUnits: snapshot.rfUnits,
    refundFriends: snapshot.friends,
    events,
  };
}

/**
 * Zero-filled escrow totals for machines persisted before the vault existed.
 * Used by the storage migration and as a defensive default when reading a
 * machine that predates the feature.
 */
export function withEscrowTotals<T extends Machine>(machine: T): T {
  const legacy = machine as T & {
    escrowUsdgWithdrawnUnits?: bigint;
    escrowRfWithdrawnUnits?: bigint;
    escrowFriendsWithdrawnCount?: number;
  };
  return {
    ...machine,
    escrowUsdgWithdrawnUnits: legacy.escrowUsdgWithdrawnUnits ?? 0n,
    escrowRfWithdrawnUnits: legacy.escrowRfWithdrawnUnits ?? 0n,
    escrowFriendsWithdrawnCount: legacy.escrowFriendsWithdrawnCount ?? 0,
  };
}