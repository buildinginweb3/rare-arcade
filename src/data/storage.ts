/**
 * Local persistence engine for RARE ARCADE.
 * Key: rare-arcade:v1
 * Supports BigInt serialization, versioning, corruption fallback, and full demo reset.
 */

import { RARE_ARCADE_DEMO_ECONOMY } from '../domain/demoEconomy.ts';
import { createInitialDemoMachines } from './demoMachines.ts';
import type {
  Machine,
  PlayerInventory,
  CreatorAccount,
  LedgerEvent,
} from '../domain/types.ts';

export const STORAGE_KEY = 'rare-arcade:v1';
export const STORAGE_VERSION = 4;
export const FIXTURE_VERSION = 4;

export interface AppSettings {
  soundEnabled: boolean;
  activeRole: 'PLAYER' | 'CREATOR';
  connectedWalletAddress?: string;
  hasSeenOnboarding: boolean;
  /**
   * @deprecated Motion toggle removed — motion is ON by default.
   * Runtime derives reduced motion from the OS
   * `prefers-reduced-motion` media query. Old stored values are ignored
   * and stripped on load. Never read this for animation gating.
   */
  reducedMotion?: never;
}

export interface AppState {
  version: 4;
  fixtureVersion: 4;
  machines: Machine[];
  playerInventory: PlayerInventory;
  creatorAccount: CreatorAccount;
  ledgerEvents: LedgerEvent[];
  settings: AppSettings;
}

/**
 * Custom BigInt JSON Replacer.
 */
export function bigintReplacer(_key: string, value: unknown): unknown {
  if (typeof value === 'bigint') {
    return { __bigint: value.toString() };
  }
  return value;
}

/**
 * Custom BigInt JSON Reviver.
 */
export function bigintReviver(_key: string, value: unknown): unknown {
  if (value && typeof value === 'object' && '__bigint' in value) {
    return BigInt((value as { __bigint: string }).__bigint);
  }
  return value;
}

export function createInitialState(): AppState {
  const { machines, initialEvents } = createInitialDemoMachines();

  return {
    version: 4,
    fixtureVersion: 4,
    machines,
    playerInventory: {
      rfBalanceUnits: RARE_ARCADE_DEMO_ECONOMY.playerStartingBalanceUnits,
      wonFriends: [],
      pullHistory: [],
    },
    creatorAccount: {
      address: '0xDemoCreator4663',
      rfBalanceUnits: RARE_ARCADE_DEMO_ECONOMY.creatorStartingBalanceUnits,
      // Real-NFT flow: creator inventory comes from the connected wallet,
      // fetched directly from OpenSea in the client. No fake stand-ins
      // are seeded as "owned".
      ownedFriends: [],
      totalProceedsUnits: 0n,
      totalBurnGeneratedUnits: 0n,
      machinesCreatedCount: 0,
    },
    ledgerEvents: initialEvents,
    settings: {
      soundEnabled: true,
      activeRole: 'PLAYER',
      hasSeenOnboarding: false,
    },
  };
}

/**
 * Strip legacy motion preferences (motionEnabled / reducedMotion) from any
 * persisted settings object. Old `motionEnabled: false` migrates to normal
 * motion ON; OS-level prefers-reduced-motion is derived at runtime.
 */
export function stripLegacyMotionSetting<T extends Record<string, unknown>>(settings: T): T {
  if (!settings || typeof settings !== 'object') return settings;
  const copy = { ...settings } as Record<string, unknown>;
  delete copy.reducedMotion;
  delete copy.motionEnabled;
  return copy as T;
}

/**
 * Migrate a V1 state (fake 16x16 sprite inventory, tiny RF scale) to current.
 * - Preserves user settings (sound, role, onboarding). Motion preference
 *   removed — normal motion ON, OS prefers-reduced-motion derived at runtime.
 * - Replaces fake owned inventory (never real) with wallet-driven empty set.
 * - Reseeds system demo fixtures at the new RF scale.
 * - Refreshes demo balances to the new scale.
 */
export function migrateV1ToV2(old: Record<string, unknown>): AppState {
  const fresh = createInitialState();
  try {
    const prev = old as unknown as {
      settings?: Partial<AppSettings> & { reducedMotion?: boolean; motionEnabled?: boolean };
    };
    if (prev.settings) {
      const cleaned = stripLegacyMotionSetting(prev.settings);
      fresh.settings = {
        ...fresh.settings,
        soundEnabled: cleaned.soundEnabled ?? true,
        activeRole: cleaned.activeRole === 'CREATOR' ? 'CREATOR' : 'PLAYER',
        hasSeenOnboarding: cleaned.hasSeenOnboarding ?? false,
      };
    }
  } catch {
    // fall through with fresh defaults
  }
  return fresh;
}

/**
 * Migrate a V2 state to V3 WITHOUT resetting the user.
 * - Preserves machines, balances, ledger, and settings exactly.
 * - Stamps legacy machines (no machineType) as finite_deck — no saved
 *   machine silently becomes Fixed Odds.
 * - Appends the FRIEND FOREVER Fixed Odds fixture if absent.
 */
export function migrateV2ToV3(old: Record<string, unknown>): AppState {
  const fresh = createInitialState();
  const prev = old as unknown as {
    machines?: Machine[];
    playerInventory?: PlayerInventory;
    creatorAccount?: CreatorAccount;
    ledgerEvents?: LedgerEvent[];
    settings?: Partial<AppSettings> & { reducedMotion?: boolean; motionEnabled?: boolean };
  };

  const machines: Machine[] = Array.isArray(prev.machines)
    ? prev.machines.map((m) => {
        const stamped = m as Machine & { machineType?: string };
        if (stamped.machineType === 'fixed_odds' || stamped.machineType === 'finite_deck') {
          return m;
        }
        return { ...m, machineType: 'finite_deck' } as Machine;
      })
    : [...fresh.machines];

  if (!machines.some((m) => m.id === 'demo-machine-friend-forever')) {
    const forever = fresh.machines.find((m) => m.id === 'demo-machine-friend-forever');
    if (forever) {
      machines.push(forever);
      fresh.ledgerEvents
        .filter((e) => e.machineId === 'demo-machine-friend-forever')
        .forEach((e) => {
          if (
            Array.isArray(prev.ledgerEvents) &&
            !prev.ledgerEvents.some((p) => p.id === e.id)
          ) {
            prev.ledgerEvents.push(e);
          }
        });
    }
  }

  return {
    version: 4,
    fixtureVersion: 4,
    machines,
    playerInventory: prev.playerInventory ?? fresh.playerInventory,
    creatorAccount: prev.creatorAccount ?? fresh.creatorAccount,
    ledgerEvents: Array.isArray(prev.ledgerEvents) ? prev.ledgerEvents : [],
    settings: {
      ...fresh.settings,
      ...stripLegacyMotionSetting((prev.settings ?? {}) as Record<string, unknown>),
      activeRole: prev.settings?.activeRole === 'CREATOR' ? 'CREATOR' : 'PLAYER',
    },
  };
}

/**
 * Stamp legacy manual valuation snapshots on Friend prizes that predate
 * automatic market valuation. Published economics are preserved exactly —
 * the snapshot records the existing locked reference value.
 */
export function stampLegacyValuation(machines: readonly Machine[]): Machine[] {
  return machines.map((m) => {
    const stamp = (p: Machine['initialPrizes'][number]) => {
      if (p.type !== 'FRIEND_PRIZE') return p;
      if (p.valuationSnapshot) return p;
      return {
        ...p,
        valuationSnapshot: {
          method: 'legacy_manual' as const,
          source: 'legacy' as const,
          collectionSlug: p.collectionSlug ?? 'unknown',
          topBidUsd: '0',
          rfUsd: '0',
          referenceRf: p.referenceValueUnits.toString(),
          valuedAt: m.createdAt ?? Date.now(),
          fallbackUsed: false,
        },
      };
    };
    if (!m.initialPrizes.some((p) => p.type === 'FRIEND_PRIZE' && !p.valuationSnapshot)) {
      return m;
    }
    return {
      ...m,
      initialPrizes: m.initialPrizes.map(stamp),
      remainingPrizes: m.remainingPrizes.map(stamp),
    } as Machine;
  });
}

/**
 * Migrate a V3 state to V4 WITHOUT resetting the user.
 * - Preserves machines, balances, ledger, settings exactly.
 * - Stamps legacy_manual valuation snapshots on pre-existing NFT prizes
 *   (published economics unchanged).
 */
export function migrateV3ToV4(old: Record<string, unknown>): AppState {
  const fresh = createInitialState();
  const prev = old as unknown as {
    machines?: Machine[];
    playerInventory?: PlayerInventory;
    creatorAccount?: CreatorAccount;
    ledgerEvents?: LedgerEvent[];
    settings?: Partial<AppSettings> & { reducedMotion?: boolean; motionEnabled?: boolean };
  };
  const machines = stampLegacyValuation(
    Array.isArray(prev.machines) ? prev.machines : [...fresh.machines]
  );
  return {
    version: 4,
    fixtureVersion: 4,
    machines,
    playerInventory: prev.playerInventory ?? fresh.playerInventory,
    creatorAccount: prev.creatorAccount ?? fresh.creatorAccount,
    ledgerEvents: Array.isArray(prev.ledgerEvents) ? prev.ledgerEvents : [],
    settings: {
      ...fresh.settings,
      ...stripLegacyMotionSetting((prev.settings ?? {}) as Record<string, unknown>),
      activeRole: prev.settings?.activeRole === 'CREATOR' ? 'CREATOR' : 'PLAYER',
    },
  };
}

export function loadAppState(): AppState {
  if (typeof window === 'undefined' || !window.localStorage) {
    return createInitialState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialState();
      saveAppState(initial);
      return initial;
    }

    const parsed = JSON.parse(raw, bigintReviver) as Omit<AppState, 'version' | 'fixtureVersion'> & {
      version?: unknown;
      fixtureVersion?: unknown;
    };
    if (!parsed || !Array.isArray(parsed.machines)) {
      console.warn('Storage schema mismatch or corrupted. Resetting to initial state.');
      const fallback = createInitialState();
      saveAppState(fallback);
      return fallback;
    }
    // V1 and older: reseed fixtures at the current RF scale, drop the fake
    // sprite inventory (never real), preserve user display settings.
    // V2: preserve everything, stamp finite_deck, append new fixtures.
    // V3: preserve everything, stamp legacy_manual valuation snapshots.
    const storedVersion =
      typeof parsed.version === 'number' ? parsed.version : 0;
    if (storedVersion !== STORAGE_VERSION || parsed.fixtureVersion !== FIXTURE_VERSION) {
      if (storedVersion === 3) {
        console.info('Migrating Rare Arcade state v3 to v4 (valuation snapshots).');
        const migrated = migrateV3ToV4(parsed as unknown as Record<string, unknown>);
        saveAppState(migrated);
        return migrated;
      }
      if (storedVersion === 2) {
        console.info('Migrating Rare Arcade state v2 to v4 (preserving user data).');
        const v3 = migrateV2ToV3(parsed as unknown as Record<string, unknown>);
        const migrated = migrateV3ToV4(v3 as unknown as Record<string, unknown>);
        saveAppState(migrated);
        return migrated;
      }
      console.info('Migrating Rare Arcade state to current fixtures.');
      const migrated = migrateV1ToV2(parsed as unknown as Record<string, unknown>);
      saveAppState(migrated);
      return migrated;
    }

    // Strip any legacy motion preference persisted by older builds.
    const rawSettings = (parsed as unknown as { settings?: Record<string, unknown> }).settings;
    if (rawSettings && ('reducedMotion' in rawSettings || 'motionEnabled' in rawSettings)) {
      const cleaned = stripLegacyMotionSetting(rawSettings);
      const merged = {
        ...(parsed as unknown as { settings?: Record<string, unknown> }).settings,
        ...cleaned,
      } as Record<string, unknown>;
      delete merged.reducedMotion;
      delete merged.motionEnabled;
      const normalized = { ...parsed, settings: merged } as unknown as AppState;
      try {
        saveAppState(normalized);
      } catch {
        // ignore
      }
      return normalized;
    }
    return parsed as AppState;
  } catch (err) {    console.error('Failed to load local storage state:', err);
    const fallback = createInitialState();
    try {
      saveAppState(fallback);
    } catch {
      // ignore
    }
    return fallback;
  }
}

export function saveAppState(state: AppState): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }

  try {
    const serialized = JSON.stringify(state, bigintReplacer);
    window.localStorage.setItem(STORAGE_KEY, serialized);
  } catch (err) {
    console.error('Failed to save state to localStorage:', err);
  }
}

export function resetDemoData(): AppState {
  const fresh = createInitialState();
  saveAppState(fresh);
  return fresh;
}
