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

  it('initializes default demo state with 4 machines, balances, and version 4', () => {
    const state = loadAppState();
    expect(state.version).toBe(4);
    expect(state.fixtureVersion).toBe(4);
    expect(state.machines.length).toBe(4);
    expect(state.playerInventory.rfBalanceUnits).toBe(parseRF('250000'));
    expect(state.creatorAccount.rfBalanceUnits).toBe(parseRF('2500000'));
    // No fake owned inventory: wallet-driven only.
    expect(state.creatorAccount.ownedFriends).toEqual([]);
    // Seeded models: three Finite Deck fixtures + one Fixed Odds fixture.
    const types = state.machines.map((m) => m.machineType).sort();
    expect(types).toEqual(['finite_deck', 'finite_deck', 'finite_deck', 'fixed_odds']);
  });

  it('persists changes across save and reload cycles', () => {
    const state = loadAppState();
    state.playerInventory.rfBalanceUnits = parseRF('950');
    saveAppState(state);

    const reloaded = loadAppState();
    expect(reloaded.playerInventory.rfBalanceUnits).toBe(parseRF('950'));
  });

  it('recovers gracefully from corrupted JSON without crashing', () => {
    window.localStorage.setItem(STORAGE_KEY, 'INVALID_CORRUPTED_JSON{{{');
    const recovered = loadAppState();
    expect(recovered.version).toBe(4);
    expect(recovered.machines.length).toBe(4);
    expect(recovered.playerInventory.rfBalanceUnits).toBe(parseRF('250000'));
  });

  it('resets demo data cleanly back to initial state', () => {
    const state = loadAppState();
    state.playerInventory.rfBalanceUnits = parseRF('10');
    saveAppState(state);

    const resetState = resetDemoData();
    expect(resetState.playerInventory.rfBalanceUnits).toBe(parseRF('250000'));

    const reloaded = loadAppState();
    expect(reloaded.playerInventory.rfBalanceUnits).toBe(parseRF('250000'));
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
          totalBurnGeneratedUnits: { __bigint: '0' },
          machinesCreatedCount: 0,
        },
        ledgerEvents: [],
        settings: { soundEnabled: false, reducedMotion: true, motionEnabled: false, activeRole: 'CREATOR', hasSeenOnboarding: true },
      })
    );
    const migrated = loadAppState();
    expect(migrated.version).toBe(4);
    expect(migrated.fixtureVersion).toBe(4);
    expect(migrated.machines.length).toBe(4);
    expect(migrated.playerInventory.rfBalanceUnits).toBe(parseRF('250000'));
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

  it('migrates V2 state to V3 preserving user data and stamping finite_deck', () => {
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
            burnBps: { __bigint: '500' },
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
            totalBurnedUnits: { __bigint: '0' },
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
          totalBurnGeneratedUnits: { __bigint: '0' },
          machinesCreatedCount: 1,
        },
        ledgerEvents: [],
        settings: { soundEnabled: true, reducedMotion: false, motionEnabled: false, activeRole: 'PLAYER', hasSeenOnboarding: true },
      })
    );
    const migrated = loadAppState();
    expect(migrated.version).toBe(4);
    expect(migrated.fixtureVersion).toBe(4);
    // User machine preserved (not reset) and stamped finite_deck.
    const mine = migrated.machines.find((m) => m.id === 'user-machine-1');
    expect(mine).toBeDefined();
    expect(mine!.machineType).toBe('finite_deck');
    // Balances preserved, not reseeded.
    expect(migrated.playerInventory.rfBalanceUnits).toBe(123000n);
    expect(migrated.creatorAccount.rfBalanceUnits).toBe(456000n);
    // New Fixed Odds fixture appended, not duplicated on reload.
    expect(migrated.machines.some((m) => m.id === 'demo-machine-friend-forever')).toBe(true);
    const reloaded = loadAppState();
    expect(
      reloaded.machines.filter((m) => m.id === 'demo-machine-friend-forever').length
    ).toBe(1);
  });
});
