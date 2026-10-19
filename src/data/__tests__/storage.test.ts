import { describe, it, expect, beforeEach } from 'vitest';
import {
  STORAGE_KEY,
  loadAppState,
  saveAppState,
  resetDemoData,
  bigintReplacer,
  bigintReviver,
} from '../storage.ts';
import { parseRF } from '../../domain/rf.ts';
import { parseUsdg } from '../../domain/usdg.ts';
import type { FiniteDeckMachine } from '../../domain/types.ts';

// Mock localStorage for node test environment
class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string) {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string) {
    this.store[key] = value;
  }
  removeItem(key: string) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

describe('Storage Persistence & Schema Migration (storage.ts)', () => {
  beforeEach(() => {
    const mockStorage = new MockLocalStorage();
    // @ts-expect-error test mock
    globalThis.window = { localStorage: mockStorage };
    // @ts-expect-error test mock
    globalThis.localStorage = mockStorage;
  });

  it('correctly serializes and deserializes BigInt fields', () => {
    const original = {
      amount: 10500n,
      nested: { balance: 9999999999999n },
    };
    const serialized = JSON.stringify(original, bigintReplacer);
    const parsed = JSON.parse(serialized, bigintReviver);

    expect(parsed.amount).toBe(10500n);
    expect(parsed.nested.balance).toBe(9999999999999n);
  });

  it('initializes default demo state with 4 machines, USDG balances, and version 7', () => {
    const state = loadAppState();
    expect(state.version).toBe(7);
    expect(state.fixtureVersion).toBe(7);
    // Every fixture starts with an untouched vault: nothing has been
    // withdrawn out of any machine yet.
    for (const m of state.machines) {
      expect(m.escrowUsdgWithdrawnUnits, m.id).toBe(0n);
      expect(m.escrowRfWithdrawnUnits, m.id).toBe(0n);
      expect(m.escrowFriendsWithdrawnCount, m.id).toBe(0);
      expect(m.withdrawnAt, m.id).toBeUndefined();
    }
    // Buyback ledger starts empty — nothing is burned until fees accumulate.
    expect(state.buyback.totalRfBurnedUnits).toBe(0n);
    expect(state.buyback.burnCount).toBe(0);
    expect(state.machines.length).toBe(4);
    // USDG is the play currency; RF is a separate cashback-only reserve.
    expect(state.playerInventory.usdgBalanceUnits).toBe(parseUsdg('2500'));
    expect(state.playerInventory.rfBalanceUnits).toBe(0n);
    expect(state.creatorAccount.usdgBalanceUnits).toBe(parseUsdg('25000'));
    expect(state.creatorAccount.rfBalanceUnits).toBe(parseRF('500000'));
    // No fake owned inventory: wallet-driven only.
    expect(state.creatorAccount.ownedFriends).toEqual([]);
    // Seeded models: three Finite Deck fixtures + one Fixed Odds fixture.
    const types = state.machines.map((m) => m.machineType).sort();
    expect(types).toEqual(['finite_deck', 'finite_deck', 'finite_deck', 'fixed_odds']);
  });

  it('seeds every fixture in USDG with a 5% platform fee', () => {
    const state = loadAppState();
    for (const m of state.machines) {
      expect(m.platformFeeBps).toBe(500n);
      // Every machine loads USDG cashback, proving the play currency is USDG.
      expect(
        m.initialPrizes.some((p) => p.type === 'USDG_PRIZE'),
        m.id
      ).toBe(true);
    }
  });

  it('persists changes across save and reload cycles', () => {
    const state = loadAppState();
    state.playerInventory.usdgBalanceUnits = parseUsdg('12.5');
    saveAppState(state);

    const reloaded = loadAppState();
    expect(reloaded.playerInventory.usdgBalanceUnits).toBe(parseUsdg('12.5'));
  });

  it('persists the buyback ledger', () => {
    const state = loadAppState();
    state.buyback.totalRfBurnedUnits = parseRF('12500');
    state.buyback.totalSpentUsdgUnits = parseUsdg('25');
    state.buyback.burnCount = 1;
    saveAppState(state);

    const reloaded = loadAppState();
    expect(reloaded.buyback.totalRfBurnedUnits).toBe(parseRF('12500'));
    expect(reloaded.buyback.burnCount).toBe(1);
  });

  it('migrates V5 -> V7 without reclaiming the retired partner share', () => {
    // The 25% those machines accrued under v5 went to the retired wallet. It
    // was never platform funds, so it must NOT be re-booked as buyback.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 5,
        fixtureVersion: 5,
        machines: [
          {
            id: 'legacy-fee-machine',
            name: 'LEGACY',
            shellId: 'CLASSIC',
            emblem: 'star',
            creatorAddress: '0xDemoCreator4663',
            status: 'READY',
            machineType: 'finite_deck',
            pullPriceUnits: { __bigint: '5000000' },
            platformFeeBps: { __bigint: '500' },
            totalPulls: 10,
            remainingPulls: 10,
            initialPrizes: [],
            remainingPrizes: [],
            deck: [],
            targetRtpBps: 9000,
            initialRtpBps: 9000,
            currentRtpBps: 9000,
            initialEvUnits: { __bigint: '0' },
            currentEvUnits: { __bigint: '0' },
            totalSpentUnits: { __bigint: '10000000' },
            totalPlatformFeeUnits: { __bigint: '500000' },
            primaryFeeUnits: { __bigint: '375000' },
            partnerFeeUnits: { __bigint: '125000' },
            creatorReceiptsUnits: { __bigint: '9500000' },
            usdgPrizesPaidUnits: { __bigint: '0' },
            rfPrizesPaidUnits: { __bigint: '0' },
            friendPrizesAwardedCount: 0,
            pullCount: 2,
            createdAt: 1,
            isRulesLocked: true,
          },
        ],
        playerInventory: {
          usdgBalanceUnits: { __bigint: '123000000' },
          rfBalanceUnits: { __bigint: '0' },
          wonFriends: [],
          pullHistory: [],
        },
        creatorAccount: {
          address: '0xDemoCreator4663',
          usdgBalanceUnits: { __bigint: '456000000' },
          rfBalanceUnits: { __bigint: '0' },
          ownedFriends: [],
          totalProceedsUnits: { __bigint: '0' },
          totalPlatformFeesGeneratedUnits: { __bigint: '500000' },
          machinesCreatedCount: 1,
        },
        ledgerEvents: [
          {
            id: 'old-partner-split',
            machineId: 'legacy-fee-machine',
            machineName: 'LEGACY',
            type: 'PLATFORM_FEE_SPLIT',
            actorAddress: '0x16B4297E0D804E711072Be361617D4E23C03c533',
            timestamp: 1,
            details: '25% routed to the retired partner wallet',
            usdgAmountUnits: { __bigint: '125000' },
            feeRecipient: {
              role: 'PARTNER',
              address: '0x16B4297E0D804E711072Be361617D4E23C03c533',
              shareLabel: '25%',
            },
          },
        ],
        settings: { soundEnabled: true, activeRole: 'CREATOR', hasSeenOnboarding: true },
      })
    );

    const migrated = loadAppState();
    expect(migrated.version).toBe(7);
    expect(migrated.fixtureVersion).toBe(7);

    // Machine and money survive untouched.
    const mine = migrated.machines.find((m) => m.id === 'legacy-fee-machine');
    expect(mine).toBeDefined();
    expect(mine!.totalPlatformFeeUnits).toBe(500_000n);
    expect(mine!.primaryFeeUnits).toBe(375_000n);
    expect(migrated.playerInventory.usdgBalanceUnits).toBe(123_000_000n);

    // The retired share is dropped, NOT relabelled as buyback funding.
    expect((mine as unknown as Record<string, unknown>).partnerFeeUnits).toBeUndefined();
    expect(mine!.buybackFeeUnits).toBe(0n);

    // No phantom burn, and the retired wallet's event is gone.
    expect(migrated.buyback.totalRfBurnedUnits).toBe(0n);
    expect(migrated.buyback.burnCount).toBe(0);
    expect(migrated.ledgerEvents.some((e) => e.id === 'old-partner-split')).toBe(false);
  });

  it('recovers gracefully from corrupted JSON without crashing', () => {
    window.localStorage.setItem(STORAGE_KEY, 'INVALID_CORRUPTED_JSON{{{');
    const recovered = loadAppState();
    expect(recovered.version).toBe(7);
    expect(recovered.machines.length).toBe(4);
    expect(recovered.playerInventory.usdgBalanceUnits).toBe(parseUsdg('2500'));
  });

  it('resets demo data cleanly back to initial state', () => {
    const state = loadAppState();
    state.playerInventory.usdgBalanceUnits = parseUsdg('10');
    saveAppState(state);

    const resetState = resetDemoData();
    expect(resetState.playerInventory.usdgBalanceUnits).toBe(parseUsdg('2500'));

    const reloaded = loadAppState();
    expect(reloaded.playerInventory.usdgBalanceUnits).toBe(parseUsdg('2500'));
  });

  it('migrates V1 state to current fixtures, preserving display settings', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        machines: [],
        playerInventory: { rfBalanceUnits: { __bigint: '1000000' }, wonFriends: [], pullHistory: [] },
        creatorAccount: {
          address: '0xDemoCreator4663',
          rfBalanceUnits: { __bigint: '1000000' },
          ownedFriends: [],
          totalProceedsUnits: { __bigint: '0' },
          totalPlatformFeesGeneratedUnits: { __bigint: '0' },
          machinesCreatedCount: 0,
        },
        ledgerEvents: [],
        settings: { soundEnabled: false, reducedMotion: true, motionEnabled: false, activeRole: 'CREATOR', hasSeenOnboarding: true },
      })
    );
    const migrated = loadAppState();
    expect(migrated.version).toBe(7);
    expect(migrated.fixtureVersion).toBe(7);
    expect(migrated.machines.length).toBe(4);
    expect(migrated.playerInventory.usdgBalanceUnits).toBe(parseUsdg('2500'));
    expect(migrated.settings.soundEnabled).toBe(false);
    // Motion toggle removed: legacy preferences are stripped, never applied.
    expect('reducedMotion' in migrated.settings).toBe(false);
    expect('motionEnabled' in (migrated.settings as unknown as Record<string, unknown>)).toBe(false);
    expect(migrated.settings.activeRole).toBe('CREATOR');
    expect(migrated.settings.hasSeenOnboarding).toBe(true);
  });

  it('strips legacy motion preferences from current-version states without resetting', () => {
    const state = loadAppState();
    const withLegacy = {
      ...state,
      settings: { ...state.settings, reducedMotion: false, motionEnabled: false },
    };
    saveAppState(withLegacy as unknown as typeof state);
    const reloaded = loadAppState();
    expect('reducedMotion' in reloaded.settings).toBe(false);
    expect('motionEnabled' in (reloaded.settings as unknown as Record<string, unknown>)).toBe(false);
    expect(reloaded.machines.length).toBe(4);
  });

  it('migrates V2 -> V7 preserving settings, reseeding the USDG economy', () => {
    // A V2 machine has no machineType field; balances/ledger must survive.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 2,
        fixtureVersion: 2,
        machines: [
          {
            id: 'user-machine-1',
            name: 'MY DECK',
            shellId: 'CLASSIC',
            emblem: 'star',
            creatorAddress: '0xDemoCreator4663',
            status: 'READY',
            pullPriceUnits: { __bigint: '2500000' },
            platformFeeBps: { __bigint: '500' },
            totalPulls: 10,
            remainingPulls: 10,
            initialPrizes: [
              { id: 'p1', type: 'RF_PRIZE', amountUnits: { __bigint: '20000000' }, initialQuantity: 2, remainingQuantity: 2 },
            ],
            remainingPrizes: [
              { id: 'p1', type: 'RF_PRIZE', amountUnits: { __bigint: '20000000' }, initialQuantity: 2, remainingQuantity: 2 },
            ],
            deck: [],
            targetRtpBps: 9000,
            initialRtpBps: 8000,
            currentRtpBps: 8000,
            initialEvUnits: { __bigint: '2000000' },
            currentEvUnits: { __bigint: '2000000' },
            totalSpentUnits: { __bigint: '0' },
            totalPlatformFeeUnits: { __bigint: '0' },
            creatorReceiptsUnits: { __bigint: '0' },
            rfPrizesPaidUnits: { __bigint: '0' },
            friendPrizesAwardedCount: 0,
            pullCount: 0,
            createdAt: 1,
            isRulesLocked: false,
          },
        ],
        playerInventory: { rfBalanceUnits: { __bigint: '123000' }, wonFriends: [], pullHistory: [] },
        creatorAccount: {
          address: '0xDemoCreator4663',
          rfBalanceUnits: { __bigint: '456000' },
          ownedFriends: [],
          totalProceedsUnits: { __bigint: '0' },
          totalPlatformFeesGeneratedUnits: { __bigint: '0' },
          machinesCreatedCount: 1,
        },
        ledgerEvents: [],
        settings: { soundEnabled: true, reducedMotion: false, motionEnabled: false, activeRole: 'PLAYER', hasSeenOnboarding: true },
      })
    );
    const migrated = loadAppState();
    expect(migrated.version).toBe(7);
    expect(migrated.fixtureVersion).toBe(7);
    // V2 -> V3 stamps finite_deck, but V4 -> V5 is a CURRENCY change: an
    // RF-denominated machine cannot be translated into USDG without silently
    // rewriting its published RTP, so the fixtures are re-seeded instead.
    expect(migrated.machines.some((m) => m.id === 'user-machine-1')).toBe(false);
    expect(migrated.machines.length).toBe(4);
    expect(migrated.machines.every((m) => m.platformFeeBps === 500n)).toBe(true);
    // Balances are re-denominated into USDG.
    expect(migrated.playerInventory.usdgBalanceUnits).toBe(parseUsdg('2500'));
    // Display settings survive the currency change.
    expect(migrated.settings.activeRole).toBe('PLAYER');
    expect(migrated.settings.hasSeenOnboarding).toBe(true);
    // New Fixed Odds fixture present exactly once on reload.
    expect(migrated.machines.some((m) => m.id === 'demo-machine-friend-forever')).toBe(true);
    const reloaded = loadAppState();
    expect(
      reloaded.machines.filter((m) => m.id === 'demo-machine-friend-forever').length
    ).toBe(1);
  });

  it('migrates V4 -> V7 preserving settings and owned NFTs, reseeding the economy', () => {
    const keptFriend = {
      tokenId: { __bigint: '42' },
      name: 'Friend #42',
      familyName: 'Generations',
      generation: 1,
      demoUsdgValueUnits: { __bigint: '500000' },
      contractAddress: '0x0000000000000000000000000000000000000042',
    };
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 4,
        fixtureVersion: 4,
        machines: [{ id: 'rf-machine', name: 'OLD RF MACHINE' }],
        playerInventory: {
          rfBalanceUnits: { __bigint: '999999' },
          wonFriends: [],
          pullHistory: [],
        },
        creatorAccount: {
          address: '0xDemoCreator4663',
          rfBalanceUnits: { __bigint: '888888' },
          ownedFriends: [keptFriend],
          totalProceedsUnits: { __bigint: '0' },
          totalPlatformFeesGeneratedUnits: { __bigint: '0' },
          machinesCreatedCount: 7,
        },
        ledgerEvents: [],
        settings: {
          soundEnabled: false,
          activeRole: 'CREATOR',
          hasSeenOnboarding: true,
          connectedWalletAddress: '0xabc',
        },
      })
    );

    const migrated = loadAppState();
    expect(migrated.version).toBe(7);
    expect(migrated.fixtureVersion).toBe(7);
    // RF-denominated machines cannot survive the currency change.
    expect(migrated.machines.some((m) => m.id === 'rf-machine')).toBe(false);
    expect(migrated.machines.length).toBe(4);
    // Real owned NFTs are chain assets, so they are kept.
    expect(migrated.creatorAccount.ownedFriends.map((f) => f.tokenId)).toEqual([42n]);
    // Machine count restarts because the old machines were re-seeded.
    expect(migrated.creatorAccount.machinesCreatedCount).toBe(0);
    // Wallet identity and display settings survive.
    expect(migrated.settings.connectedWalletAddress).toBe('0xabc');
    expect(migrated.settings.soundEnabled).toBe(false);
    expect(migrated.settings.activeRole).toBe('CREATOR');
  });

  it('migrates V6 -> V7 by backfilling vault counters and moving no money', () => {
    // A real, mid-life V6 machine: pulls have happened, prizes partly won.
    // The vault counters do not exist yet on disk.
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 6,
        fixtureVersion: 6,
        machines: [
          {
            id: 'midlife-machine',
            name: 'MID LIFE',
            shellId: 'CLASSIC',
            emblem: 'star',
            creatorAddress: '0xDemoCreator4663',
            status: 'LIVE',
            machineType: 'finite_deck',
            pullPriceUnits: { __bigint: '5000000' },
            platformFeeBps: { __bigint: '500' },
            totalPulls: 10,
            remainingPulls: 6,
            initialPrizes: [
              { id: 'p1', type: 'USDG_PRIZE', amountUnits: { __bigint: '10000000' }, initialQuantity: 2, remainingQuantity: 1 },
            ],
            remainingPrizes: [
              { id: 'p1', type: 'USDG_PRIZE', amountUnits: { __bigint: '10000000' }, initialQuantity: 2, remainingQuantity: 1 },
            ],
            deck: [],
            targetRtpBps: 9000,
            initialRtpBps: 9000,
            currentRtpBps: 4500,
            initialEvUnits: { __bigint: '20000000' },
            currentEvUnits: { __bigint: '10000000' },
            totalSpentUnits: { __bigint: '20000000' },
            totalPlatformFeeUnits: { __bigint: '1000000' },
            primaryFeeUnits: { __bigint: '750000' },
            buybackFeeUnits: { __bigint: '250000' },
            creatorReceiptsUnits: { __bigint: '19000000' },
            usdgPrizesPaidUnits: { __bigint: '10000000' },
            rfPrizesPaidUnits: { __bigint: '0' },
            friendPrizesAwardedCount: 0,
            pullCount: 4,
            createdAt: 1,
            firstPullAt: 2,
            isRulesLocked: true,
          },
        ],
        playerInventory: {
          usdgBalanceUnits: { __bigint: '123000000' },
          rfBalanceUnits: { __bigint: '0' },
          wonFriends: [],
          pullHistory: [],
        },
        creatorAccount: {
          address: '0xDemoCreator4663',
          usdgBalanceUnits: { __bigint: '456000000' },
          rfBalanceUnits: { __bigint: '0' },
          ownedFriends: [],
          totalProceedsUnits: { __bigint: '19000000' },
          totalPlatformFeesGeneratedUnits: { __bigint: '1000000' },
          machinesCreatedCount: 1,
        },
        buyback: {
          totalFundedUsdgUnits: { __bigint: '250000' },
          pendingUsdgUnits: { __bigint: '250000' },
          totalSpentUsdgUnits: { __bigint: '0' },
          totalRfBurnedUnits: { __bigint: '0' },
          burnCount: 0,
          lastBurnAt: null,
        },
        ledgerEvents: [],
        settings: { soundEnabled: true, activeRole: 'CREATOR', hasSeenOnboarding: true },
      })
    );

    const migrated = loadAppState();
    expect(migrated.version).toBe(7);
    expect(migrated.fixtureVersion).toBe(7);

    const mine = migrated.machines.find((m) => m.id === 'midlife-machine');
    expect(mine).toBeDefined();

    // Vault counters are backfilled to zero, not invented.
    expect(mine!.escrowUsdgWithdrawnUnits).toBe(0n);
    expect(mine!.escrowRfWithdrawnUnits).toBe(0n);
    expect(mine!.escrowFriendsWithdrawnCount).toBe(0);
    expect(mine!.withdrawnAt).toBeUndefined();

    // No balance moves and no prize is touched by the migration.
    expect(migrated.playerInventory.usdgBalanceUnits).toBe(123_000_000n);
    expect(migrated.creatorAccount.usdgBalanceUnits).toBe(456_000_000n);
    expect(migrated.buyback.pendingUsdgUnits).toBe(250_000n);
    expect(mine!.remainingPrizes[0]).toMatchObject({
      id: 'p1',
      initialQuantity: 2,
      remainingQuantity: 1,
    });
    expect(mine!.pullCount).toBe(4);
    expect(mine!.isRulesLocked).toBe(true);
    expect((mine as FiniteDeckMachine).currentRtpBps).toBe(4500);
  });

  it('leaves a current-version state untouched (no migration on reload)', () => {
    const first = loadAppState();
    first.playerInventory.usdgBalanceUnits = parseUsdg('77');
    saveAppState(first);

    const reloaded = loadAppState();
    expect(reloaded.version).toBe(7);
    expect(reloaded.playerInventory.usdgBalanceUnits).toBe(parseUsdg('77'));
    // Backfilling is idempotent, so a reload must not duplicate anything.
    expect(reloaded.machines.every((m) => m.escrowUsdgWithdrawnUnits === 0n)).toBe(true);
  });
});
