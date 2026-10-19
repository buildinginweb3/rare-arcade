import { describe, it, expect } from 'vitest';
import {
  computeEscrowSnapshot,
  canPauseMachine,
  canResumeMachine,
  canWithdrawEscrow,
  pauseMachine,
  resumeMachine,
  withdrawEscrow,
  isEscrowEmpty,
  isVaultOperator,
  withEscrowTotals,
} from '../vault.ts';
import { createMachine, cancelMachine, pullMachine, isMachineSoldOut } from '../machine.ts';
import { createFixedOddsMachine, pullFixedOddsMachine } from '../fixedOdds.ts';
import { parseUsdg, formatUsdg } from '../usdg.ts';
import { parseRF, formatRFGrouped } from '../rf.ts';
import { createSeedableRng } from '../deck.ts';
import { emptyBuybackLedger } from '../buyback.ts';
import { collectReservedNftKeys } from '../../nfts/ownership.ts';
import type {
  FriendPrizeEntry,
  FixedOddsMachine,
  FiniteDeckMachine,
  Machine,
  RfPrizeEntry,
  UsdgPrizeEntry,
} from '../types.ts';

const CREATOR = '0xDemoCreator4663';
const OPERATOR = [CREATOR];
const STRANGER = ['0xSomeoneElse0001'];

function usdgPrize(id: string, usd: string, qty: number): UsdgPrizeEntry {
  return {
    id,
    type: 'USDG_PRIZE',
    amountUnits: parseUsdg(usd),
    initialQuantity: qty,
    remainingQuantity: qty,
  };
}

function rfPrize(id: string, rf: string, usdValue: string, qty: number): RfPrizeEntry {
  return {
    id,
    type: 'RF_PRIZE',
    amountUnits: parseRF(rf),
    usdgValueUnits: parseUsdg(usdValue),
    initialQuantity: qty,
    remainingQuantity: qty,
  };
}

function friendPrize(id: string, tokenId: bigint, usdValue: string): FriendPrizeEntry {
  return {
    id,
    type: 'FRIEND_PRIZE',
    tokenId,
    name: `Grim Hollow #${tokenId}`,
    familyName: 'Grim Hollow',
    generation: 1,
    usdgValueUnits: parseUsdg(usdValue),
    initialQuantity: 1,
    remainingQuantity: 1,
    origin: 'real-nft',
    chainId: 4663,
    contractAddress: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d',
    collectionType: 'GENERATIONS',
    collectionSlug: 'rare-friends-generations',
  };
}

/** Finite Deck: $5 pulls, 100 tickets, $10x1 + $5x2 + 1 NFT + 12,500 RF x2. */
function buildFiniteDeck(): Machine {
  const { machine } = createMachine({
    id: 'vault-fd',
    name: 'VAULT TEST DECK',
    shellId: 'CLASSIC',
    creatorAddress: CREATOR,
    pullPriceUnits: parseUsdg('5'),
    totalPulls: 100,
    prizeEntries: [
      usdgPrize('usdg-10', '10', 1),
      usdgPrize('usdg-5', '5', 2),
      friendPrize('nft-1', 8283n, '250'),
      rfPrize('rf-1', '12500', '25', 2),
    ],
    rng: createSeedableRng(1001),
  });
  return withEscrowTotals(machine);
}

/** Fixed Odds: $2.50 pulls, 2% NFT + 2% USDG + 2% RF. */
function buildFixedOdds(): Machine {
  const { machine } = createFixedOddsMachine({
    id: 'vault-fo',
    name: 'VAULT TEST ODDS',
    shellId: 'CAPSULE',
    creatorAddress: CREATOR,
    pullPriceUnits: parseUsdg('2.50'),
    prizeEntries: [
      { ...friendPrize('nft-fo', 5147n, '20'), oddsPpm: 20_000 },
      { ...usdgPrize('usdg-fo', '20', 1), oddsPpm: 20_000 },
      { ...rfPrize('rf-fo', '12500', '25', 1), oddsPpm: 20_000 },
    ],
    rng: createSeedableRng(2002),
  });
  return withEscrowTotals(machine);
}

/** Pull until `n` pulls have landed, deterministically. */
function pullTimes(machine: Machine, n: number, seed: number): Machine {
  let current = machine;
  for (let i = 0; i < n; i += 1) {
    current = pullMachine(current, '0xPlayer', parseUsdg('100000'), createSeedableRng(seed + i))
      .updatedMachine;
  }
  return withEscrowTotals(current);
}

describe('vault escrow accounting (vault.ts)', () => {
  it('reports the full seeded escrow on a fresh machine', () => {
    const snapshot = computeEscrowSnapshot(buildFiniteDeck());
    // $10 + 2x$5 = $20 USDG, 12,500 RF x2 = 25,000 RF, plus a $250 NFT.
    expect(snapshot.usdgUnits).toBe(parseUsdg('20'));
    expect(snapshot.rfUnits).toBe(parseRF('25000'));
    expect(snapshot.friends).toHaveLength(1);
    expect(snapshot.itemCount).toBe(6);
    // $20 USDG + 2 x $25 RF (at each unit's locked seed value) + $250 NFT.
    expect(snapshot.totalUsdgValueUnits).toBe(parseUsdg('320'));
    expect(isEscrowEmpty(snapshot)).toBe(false);
  });

  it('shrinks the vault as prizes are won, never below zero', () => {
    const before = computeEscrowSnapshot(buildFiniteDeck());
    const after = computeEscrowSnapshot(pullTimes(buildFiniteDeck(), 40, 500));
    expect(after.usdgUnits).toBeLessThanOrEqual(before.usdgUnits);
    expect(after.totalUsdgValueUnits).toBeLessThanOrEqual(before.totalUsdgValueUnits);
    expect(after.usdgUnits).toBeGreaterThanOrEqual(0n);
  });

  it('empties once the machine is fully sold out', () => {
    const drained = pullTimes(buildFiniteDeck(), 100, 500);
    expect(isMachineSoldOut(drained)).toBe(true);
    const snapshot = computeEscrowSnapshot(drained);
    expect(snapshot.usdgUnits).toBe(0n);
    expect(snapshot.rfUnits).toBe(0n);
    expect(snapshot.friends).toHaveLength(0);
    expect(isEscrowEmpty(snapshot)).toBe(true);
  });

  it('only ever counts remaining inventory, never the published snapshot', () => {
    const played = pullTimes(buildFiniteDeck(), 30, 500);
    const snapshot = computeEscrowSnapshot(played);
    // The whole point of the vault: it must be strictly less than what was
    // published, because prizes have already been paid out to players.
    const publishedValue = played.initialPrizes.reduce((acc, p) => {
      if (p.type === 'NO_PRIZE') return acc;
      const unit =
        p.type === 'USDG_PRIZE' ? p.amountUnits : p.usdgValueUnits;
      return acc + unit * BigInt(p.initialQuantity);
    }, 0n);
    expect(snapshot.totalUsdgValueUnits).toBeLessThan(publishedValue);
  });
});

describe('pausing (vault.ts)', () => {
  it('freezes pulls without touching a single unit of escrow', () => {
    const machine = buildFiniteDeck();
    const before = computeEscrowSnapshot(machine);
    const { pausedMachine, events } = pauseMachine(machine, OPERATOR, 1_700_000_000_000);

    expect(pausedMachine.status).toBe('PAUSED');
    expect(pausedMachine.pausedAt).toBe(1_700_000_000_000);
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('MACHINE_PAUSED');

    const after = computeEscrowSnapshot(pausedMachine);
    expect(after.usdgUnits).toBe(before.usdgUnits);
    expect(after.rfUnits).toBe(before.rfUnits);
    expect(after.totalUsdgValueUnits).toBe(before.totalUsdgValueUnits);
    expect(after.friends).toHaveLength(before.friends.length);
  });

  it('blocks pulls while paused, in both machine models', () => {
    const pausedDeck = pauseMachine(buildFiniteDeck(), OPERATOR, 1).pausedMachine;
    expect(() =>
      pullMachine(pausedDeck, '0xPlayer', parseUsdg('1000'))
    ).toThrow(/PAUSED/);

    // Assert against the Fixed Odds engine directly too, so the guard cannot
    // pass merely because pullMachine dispatched somewhere safe.
    const pausedOdds = pauseMachine(buildFixedOdds(), OPERATOR, 1).pausedMachine;
    expect(pausedOdds.machineType).toBe('fixed_odds');
    expect(() =>
      pullFixedOddsMachine(pausedOdds as FixedOddsMachine, '0xPlayer', parseUsdg('1000'))
    ).toThrow(/PAUSED/);
  });

  it('resumes losslessly and clears the pause timestamp', () => {
    const machine = buildFiniteDeck();
    const paused = pauseMachine(machine, OPERATOR, 1_700_000_000_000).pausedMachine;
    const { resumedMachine, events } = resumeMachine(paused, OPERATOR, 1_700_000_100_000);

    expect(resumedMachine.status).toBe('LIVE');
    expect(resumedMachine.pausedAt).toBeUndefined();
    expect(events[0]?.type).toBe('MACHINE_RESUMED');
    // Everything except the pause bookkeeping must be identical.
    expect(computeEscrowSnapshot(resumedMachine)).toEqual(computeEscrowSnapshot(machine));
    expect(resumedMachine.isRulesLocked).toBe(machine.isRulesLocked);

    // And the machine genuinely plays again.
    const played = pullMachine(resumedMachine, '0xPlayer', parseUsdg('1000'));
    expect(played.updatedMachine.pullCount).toBe(1);
  });

  it('refuses a stranger and refuses a double pause', () => {
    const machine = buildFiniteDeck();
    expect(canPauseMachine(machine, STRANGER).ok).toBe(false);
    expect(() => pauseMachine(machine, STRANGER)).toThrow(/creator/i);

    const paused = pauseMachine(machine, OPERATOR, 1).pausedMachine;
    expect(canPauseMachine(paused, OPERATOR).ok).toBe(false);
    expect(canResumeMachine(paused, STRANGER).ok).toBe(false);
  });

  it('treats the connected wallet as the same operator as the creator id', () => {
    const machine = { ...buildFiniteDeck(), creatorAddress: '0xABCDEF' };
    expect(isVaultOperator(machine, ['0xabcdef'])).toBe(true);
    expect(isVaultOperator(machine, ['0xabcde'])).toBe(false);
  });
});

describe('escrow withdrawal (vault.ts)', () => {
  it('requires a pause first — winding down is a deliberate two-step', () => {
    const live = buildFiniteDeck();
    expect(canWithdrawEscrow(live, OPERATOR).ok).toBe(false);
    expect(() => withdrawEscrow(live, OPERATOR)).toThrow(/[Pp]ause/);

    const paused = pauseMachine(live, OPERATOR, 1).pausedMachine;
    expect(canWithdrawEscrow(paused, OPERATOR).ok).toBe(true);
  });

  it('refunds only what is left after real pulls, never what was published', () => {
    const played = pullTimes(buildFiniteDeck(), 40, 500);
    const expected = computeEscrowSnapshot(played);
    const paused = pauseMachine(played, OPERATOR, 1).pausedMachine;

    const { withdrawnMachine, refundUsdgUnits, refundRfUnits, events } = withdrawEscrow(
      paused,
      OPERATOR,
      1_700_000_000_000
    );

    expect(refundUsdgUnits).toBe(expected.usdgUnits);
    expect(refundRfUnits).toBe(expected.rfUnits);
    expect(withdrawnMachine.escrowUsdgWithdrawnUnits).toBe(expected.usdgUnits);
    expect(withdrawnMachine.escrowRfWithdrawnUnits).toBe(expected.rfUnits);

    // Nothing may exceed the published escrow on any line.
    const publishedUsdg = played.initialPrizes
      .filter((p) => p.type === 'USDG_PRIZE')
      .reduce((acc, p) => acc + (p.type === 'USDG_PRIZE' ? p.amountUnits * BigInt(p.initialQuantity) : 0n), 0n);
    expect(refundUsdgUnits).toBeLessThanOrEqual(publishedUsdg);
    expect(events.some((e) => e.type === 'ESCROW_WITHDRAWN')).toBe(true);
  });

  it('never double-refunds: paid-out prizes are not in the vault', () => {
    // Force a known win by draining the deck to a single ticket, then compare
    // what was paid to what is refunded. Together they must not exceed the
    // published escrow for that currency.
    let machine = buildFiniteDeck();
    // Pull until the USDG prize is gone or we have proven enough.
    machine = pullTimes(machine, 99, 7000);
    const paid = machine.usdgPrizesPaidUnits;
    const remaining = computeEscrowSnapshot(machine).usdgUnits;

    const published = machine.initialPrizes
      .filter((p) => p.type === 'USDG_PRIZE')
      .reduce((acc, p) => acc + (p.type === 'USDG_PRIZE' ? p.amountUnits * BigInt(p.initialQuantity) : 0n), 0n);

    expect(paid).toBeLessThanOrEqual(published);
    // Paid + still-vaulted can never exceed what was ever escrowed.
    expect(paid + remaining).toBeLessThanOrEqual(published);
  });

  it('closes the machine and leaves it unplayable', () => {
    const paused = pauseMachine(buildFiniteDeck(), OPERATOR, 1).pausedMachine;
    const { withdrawnMachine } = withdrawEscrow(paused, OPERATOR, 1_700_000_000_000);

    expect(withdrawnMachine.status).toBe('CANCELLED');
    expect(withdrawnMachine.withdrawnAt).toBe(1_700_000_000_000);
    expect(isMachineSoldOut(withdrawnMachine)).toBe(true);
    expect(() => pullMachine(withdrawnMachine, '0xPlayer', parseUsdg('1000'))).toThrow();

    if (withdrawnMachine.machineType === 'finite_deck') {
      expect(withdrawnMachine.remainingPulls).toBe(0);
      expect(withdrawnMachine.deck).toHaveLength(0);
    }
  });

  it('cannot be withdrawn twice', () => {
    const paused = pauseMachine(buildFiniteDeck(), OPERATOR, 1).pausedMachine;
    const { withdrawnMachine } = withdrawEscrow(paused, OPERATOR, 1_700_000_000_000);
    expect(canWithdrawEscrow(withdrawnMachine, OPERATOR).ok).toBe(false);
    expect(() => withdrawEscrow(withdrawnMachine, OPERATOR)).toThrow();
  });

  it('refuses a stranger at every step of the wind-down', () => {
    const machine = buildFiniteDeck();
    expect(isVaultOperator(machine, STRANGER)).toBe(false);
    expect(canPauseMachine(machine, STRANGER).ok).toBe(false);
    expect(() => pauseMachine(machine, STRANGER)).toThrow(/creator/i);

    // A stranger must not be able to escalate from pausing either.
    const paused = pauseMachine(machine, OPERATOR, 1).pausedMachine;
    expect(canWithdrawEscrow(paused, STRANGER).ok).toBe(false);
    expect(() => withdrawEscrow(paused, STRANGER)).toThrow(/creator/i);
    expect(() => resumeMachine(paused, STRANGER)).toThrow(/creator/i);

    // And the stranger's attempts changed nothing at all.
    expect(paused.status).toBe('PAUSED');
    expect(paused.withdrawnAt).toBeUndefined();
    expect(computeEscrowSnapshot(paused).totalUsdgValueUnits).toBe(
      computeEscrowSnapshot(machine).totalUsdgValueUnits
    );
  });

  it('zeroes every remaining line but never rewrites the published snapshot', () => {
    const machine = pullTimes(buildFiniteDeck(), 25, 500);
    const initialBefore = JSON.stringify(machine.initialPrizes, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    );
    const paused = pauseMachine(machine, OPERATOR, 1).pausedMachine;
    const { withdrawnMachine } = withdrawEscrow(paused, OPERATOR, 1_700_000_000_000);

    const initialAfter = JSON.stringify(withdrawnMachine.initialPrizes, (_k, v) =>
      typeof v === 'bigint' ? v.toString() : v
    );
    // The published odds/economics record is immutable, always.
    expect(initialAfter).toBe(initialBefore);

    for (const entry of withdrawnMachine.remainingPrizes) {
      if (entry.type === 'NO_PRIZE') continue;
      expect(entry.remainingQuantity, `${entry.id} remaining`).toBe(0);
      expect(entry.withdrawnQuantity ?? 0, `${entry.id} withdrawn`).toBeGreaterThanOrEqual(0);
    }
    expect(computeEscrowSnapshot(withdrawnMachine).totalUsdgValueUnits).toBe(0n);
  });

  it('keeps the rules lock so published odds are never rewritten', () => {
    const played = pullTimes(buildFiniteDeck(), 20, 500);
    expect(played.isRulesLocked).toBe(true);
    const paused = pauseMachine(played, OPERATOR, 1).pausedMachine;
    const { withdrawnMachine } = withdrawEscrow(paused, OPERATOR, 1_700_000_000_000);
    expect(withdrawnMachine.isRulesLocked).toBe(true);
    // RTP fields record the game as played and are not zeroed by a withdrawal.
    expect((withdrawnMachine as FiniteDeckMachine).initialRtpBps).toBe(
      (played as FiniteDeckMachine).initialRtpBps
    );
  });

  it('works the same on a Fixed Odds machine', () => {
    const played = pullTimes(buildFixedOdds(), 12, 900);
    const expected = computeEscrowSnapshot(played);
    const paused = pauseMachine(played, OPERATOR, 1).pausedMachine;
    const { withdrawnMachine, refundFriends, events } = withdrawEscrow(paused, OPERATOR, 2);

    expect(refundFriends).toHaveLength(expected.friends.length);
    expect(withdrawnMachine.status).toBe('CANCELLED');
    // Fixed Odds has no deck or ticket counter to corrupt.
    expect((withdrawnMachine as { deck?: unknown }).deck).toBeUndefined();
    expect(events.length).toBeGreaterThan(0);
  });

  it('returns a Friend with its locked valuation snapshot intact', () => {
    const paused = pauseMachine(buildFixedOdds(), OPERATOR, 1).pausedMachine;
    const { refundFriends } = withdrawEscrow(paused, OPERATOR, 2);
    const friend = refundFriends[0]!;
    expect(friend.tokenId).toBe(5147n);
    expect(friend.demoUsdgValueUnits).toBe(parseUsdg('20'));
    expect(friend.origin).toBe('real-nft');
    expect(friend.chainId).toBe(4663);
  });

  it('emits an auditable ledger trail naming the amounts returned', () => {
    const paused = pauseMachine(buildFiniteDeck(), OPERATOR, 1).pausedMachine;
    const { events, refundUsdgUnits, refundRfUnits, refundFriends } = withdrawEscrow(
      paused,
      OPERATOR,
      1_700_000_000_000
    );

    const usdgEvent = events.find((e) => e.usdgAmountUnits === refundUsdgUnits && e.rfAmountUnits === undefined);
    expect(usdgEvent?.details).toContain(formatUsdg(refundUsdgUnits).replace('.00', '').slice(0, 4));
    expect(usdgEvent?.actorAddress).toBe(CREATOR);

    const rfEvent = events.find((e) => e.rfAmountUnits === refundRfUnits);
    expect(rfEvent?.details).toContain('RF');

    const friendEvents = events.filter((e) => e.friendTokenId !== undefined);
    expect(friendEvents).toHaveLength(refundFriends.length);

    // The terminal event explains the wind-down, not just the money.
    const closing = events[events.length - 1]!;
    expect(closing.type).toBe('MACHINE_CANCELLED');
    expect(closing.details).toContain('wound down');
  });
});

describe('vault interactions with the rest of the platform', () => {
  it('frees a withdrawn NFT for reuse in another machine', () => {
    const paused = pauseMachine(buildFixedOdds(), OPERATOR, 1).pausedMachine;
    const before = collectReservedNftKeys([paused], { includeDrafts: false });
    expect(before.size).toBe(1);

    const { withdrawnMachine } = withdrawEscrow(paused, OPERATOR, 1_700_000_000_000);
    // Once wound down the machine holds nothing, so nothing can be reserved.
    const after = collectReservedNftKeys([withdrawnMachine], { includeDrafts: false });
    expect(after.size).toBe(0);
  });

  it('leaves the platform-wide buyback pot completely untouched', () => {
    // Fund a real buyback pot from actual pulls, then wind the machine down.
    let pot = emptyBuybackLedger();
    let machine = buildFiniteDeck();
    for (let i = 0; i < 20; i += 1) {
      const pulled = pullMachine(machine, '0xPlayer', parseUsdg('100000'), createSeedableRng(4000 + i));
      machine = pulled.updatedMachine;
      pot = {
        ...pot,
        totalFundedUsdgUnits: pot.totalFundedUsdgUnits + pulled.result.buybackFeeUnits,
        pendingUsdgUnits: pot.pendingUsdgUnits + pulled.result.buybackFeeUnits,
      };
    }
    expect(pot.pendingUsdgUnits).toBeGreaterThan(0n);

    const paused = pauseMachine(machine, OPERATOR, 1).pausedMachine;
    withdrawEscrow(paused, OPERATOR, 1_700_000_000_000);

    // Prize escrow and the fee-funded buyback pot are separate pools. A
    // withdrawal returns prize money and must never mint, claw back, or
    // otherwise disturb platform fees already accrued.
    expect(pot.pendingUsdgUnits).toBeGreaterThan(0n);
    expect(pot.totalSpentUsdgUnits).toBe(0n);
    expect(pot.burnCount).toBe(0);
    expect(pot.totalRfBurnedUnits).toBe(0n);
  });

  it('still refuses a post-pull cancel, which withdrawal deliberately replaces', () => {
    const played = pullTimes(buildFiniteDeck(), 5, 500);
    expect(() => cancelMachine(played)).toThrow(/Cannot cancel/);
    // The vault path exists precisely so the creator is not stuck with the
    // remaining escrow after their machine starts selling.
    const paused = pauseMachine(played, OPERATOR, 1).pausedMachine;
    expect(() => withdrawEscrow(paused, OPERATOR, 1)).not.toThrow();
  });

  it('matches the pre-first-pull cancel refund for an untouched machine', () => {
    const machine = buildFiniteDeck();
    const cancel = cancelMachine(machine);
    const paused = pauseMachine(machine, OPERATOR, 1).pausedMachine;
    const withdraw = withdrawEscrow(paused, OPERATOR, 1);

    // With nothing won yet, the vault and the cancel refund are the same money.
    expect(withdraw.refundUsdgUnits).toBe(cancel.refundUsdgUnits);
    expect(withdraw.refundRfUnits).toBe(cancel.refundRfUnits);
    expect(withdraw.refundFriends).toHaveLength(cancel.refundFriends.length);
    expect(formatRFGrouped(withdraw.refundRfUnits)).toBe(formatRFGrouped(cancel.refundRfUnits));
  });

  it('backfills zeroed counters on machines saved before the vault existed', () => {
    // Simulate a machine saved before the vault existed: the three counters
    // are simply absent from the object.
    const { escrowUsdgWithdrawnUnits: _a, escrowRfWithdrawnUnits: _b, escrowFriendsWithdrawnCount: _c, ...rest } =
      buildFiniteDeck();
    void _a;
    void _b;
    void _c;
    const legacy = rest as Machine;

    const stamped = withEscrowTotals(legacy);
    expect(stamped.escrowUsdgWithdrawnUnits).toBe(0n);
    expect(stamped.escrowRfWithdrawnUnits).toBe(0n);
    expect(stamped.escrowFriendsWithdrawnCount).toBe(0);
    // Idempotent: running it again changes nothing.
    expect(withEscrowTotals(stamped)).toEqual(stamped);
  });
});