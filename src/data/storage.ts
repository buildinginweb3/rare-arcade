/**
 * Local persistence engine for RARE ARCADE.
 * Key: rare-arcade:v1
 * Supports BigInt serialization, versioning, corruption fallback, and full demo reset.
 */

import { RARE_ARCADE_DEMO_ECONOMY } from '../domain/demoEconomy.ts';
import { emptyBuybackLedger, type BuybackLedger } from '../domain/buyback.ts';
import { withEscrowTotals } from '../domain/vault.ts';
import { createInitialDemoMachines } from './demoMachines.ts';
import type {
  Machine,
  PlayerInventory,
  CreatorAccount,
  LedgerEvent,
  RareFriendMetadata,
} from '../domain/types.ts';

export const STORAGE_KEY = 'rare-arcade:v1';
export const STORAGE_VERSION = 7;
export const FIXTURE_VERSION = 7;

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
  version: 7;
  fixtureVersion: 7;
  /**
   * Platform-level RF buyback accounting.
   *
   * Unlike machine totals this is NOT derivable by summing machines: the 25%
   * buyback share is pooled globally and spent in batches, so one machine's
   * contribution can be burned before its own pulls finish. In live mode this
   * mirrors what a deployment reads from FeeRouter burn events.
   */
  buyback: BuybackLedger;
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
    version: 7,
    fixtureVersion: 7,
    machines,
    buyback: emptyBuybackLedger(),
    playerInventory: {
      usdgBalanceUnits: RARE_ARCADE_DEMO_ECONOMY.playerStartingBalanceUnits,
      rfBalanceUnits: 0n,
      wonFriends: [],
      pullHistory: [],
    },
    creatorAccount: {
      address: '0xDemoCreator4663',
      usdgBalanceUnits: RARE_ARCADE_DEMO_ECONOMY.creatorStartingBalanceUnits,
      rfBalanceUnits: RARE_ARCADE_DEMO_ECONOMY.creatorStartingRfUnits,
      // Real-NFT flow: creator inventory comes from the connected wallet,
      // fetched directly from OpenSea in the client. No fake stand-ins
      // are seeded as "owned".
      ownedFriends: [],
      totalProceedsUnits: 0n,
      totalPlatformFeesGeneratedUnits: 0n,
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
    version: 7,
    fixtureVersion: 7,
    machines,
    buyback: fresh.buyback,
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
          referenceUsdg: (Number(p.usdgValueUnits) / 1_000_000).toString(),
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
    version: 7,
    fixtureVersion: 7,
    machines,
    buyback: fresh.buyback,
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
 * Migrate V4 → V5: the RF economy became a USDG economy.
 *
 * What changed and why a numeric translation is NOT attempted:
 *   - The play currency changed from $RAREFRIENDS to USDG.
 *   - The 5% burn became a 5% platform fee split 75/25 across two treasuries.
 *   - NFT valuations moved from topBidUsd/rfUsd to a 1:1 USDG peg.
 *
 * Converting old RF-unit amounts into USDG would require picking an RF price
 * and would silently rewrite every published RTP, which is exactly the kind of
 * invisible revaluation this migration must not do. Instead we preserve what is
 * currency-independent — display settings, the connected wallet, and any real
 * Rare Friends the creator still owns — and re-seed machines, balances, and
 * the ledger from the USDG fixtures.
 */
export function migrateV4ToV5(old: Record<string, unknown>): AppState {
  const fresh = createInitialState();
  const prev = old as unknown as {
    settings?: Partial<AppSettings> & { reducedMotion?: boolean; motionEnabled?: boolean };
    creatorAccount?: { ownedFriends?: RareFriendMetadata[]; machinesCreatedCount?: number };
  };

  // Real NFTs the creator had seeded are chain assets, not RF balances — keep
  // them, but only once the new machines no longer reference them as prizes.
  const keptFriends = Array.isArray(prev.creatorAccount?.ownedFriends)
    ? prev.creatorAccount.ownedFriends
    : [];

  return {
    ...fresh,
    creatorAccount: {
      ...fresh.creatorAccount,
      // Machines were re-seeded, so any previously seeded NFT is free again —
      // but only real (on-chain) NFTs are ever kept. Never fabricate ownership.
      ownedFriends: keptFriends,
      machinesCreatedCount: 0,
    },
    settings: {
      ...fresh.settings,
      ...stripLegacyMotionSetting((prev.settings ?? {}) as Record<string, unknown>),
      activeRole: prev.settings?.activeRole === 'CREATOR' ? 'CREATOR' : 'PLAYER',
      hasSeenOnboarding: prev.settings?.hasSeenOnboarding ?? false,
    },
  };
}

/**
 * Migrate V5 → V6: the platform fee's 25% share stopped going to a partner
 * treasury and started funding RF buybacks.
 *
 * What this changes for a returning user:
 *   - Nothing is lost. Machines, balances, ledger, and settings all survive
 *     exactly, because the fee is STILL 5% of USDG spent — only the
 *     destination of the 25% share changed, and it is spent in future batches.
 *   - The buyback ledger starts empty. The 25% those machines already accrued
 *     under v5 went to the retired partner wallet and was not ours to reclaim,
 *     so it is deliberately NOT retroactively booked as burnable.
 *
 * Machine totals are remapped: the stored partner share is dropped rather than
 * re-labelled as buyback funding, because that USDG was never available to buy
 * RF. Re-labelling it would invent platform funds.
 */
export function migrateV5ToV6(old: Record<string, unknown>): AppState {
  const fresh = createInitialState();
  const prev = old as unknown as {
    machines?: Machine[];
    playerInventory?: PlayerInventory;
    creatorAccount?: CreatorAccount;
    ledgerEvents?: LedgerEvent[];
    settings?: Partial<AppSettings> & { reducedMotion?: boolean; motionEnabled?: boolean };
  };

  // Drop the retired partner share; do not carry it into the buyback pot.
  const machines = (Array.isArray(prev.machines) ? prev.machines : [...fresh.machines]).map(
    (m) => {
      const legacy = m as Machine & { partnerFeeUnits?: bigint };
      const { partnerFeeUnits: _retired, ...rest } = legacy;
      void _retired;
      return { ...rest, buybackFeeUnits: 0n } as Machine;
    }
  );

  return {
    version: 7,
    fixtureVersion: 7,
    machines,
    buyback: emptyBuybackLedger(),
    playerInventory: prev.playerInventory ?? fresh.playerInventory,
    creatorAccount: prev.creatorAccount ?? fresh.creatorAccount,
    ledgerEvents: (Array.isArray(prev.ledgerEvents) ? prev.ledgerEvents : []).filter(
      // The retired partner wallet no longer receives anything; drop its split
      // events rather than showing a routing that can never happen again.
      (e) => e.feeRecipient?.address !== '0x16B4297E0D804E711072Be361617D4E23C03c533'
    ),
    settings: {
      ...fresh.settings,
      ...stripLegacyMotionSetting((prev.settings ?? {}) as Record<string, unknown>),
      activeRole: prev.settings?.activeRole === 'CREATOR' ? 'CREATOR' : 'PLAYER',
    },
  };
}

/**
 * Migrate V6 → V7: the machine vault.
 *
 * What changes for a returning user:
 *   - Nothing is lost and no balance moves. Every machine keeps its prizes,
 *     its published odds, its RTP and its pull history exactly as they were.
 *   - Machines gain bookkeeping counters for escrow withdrawals, which start
 *     at zero because no escrow has ever been withdrawn before v7.
 *   - Creators gain the ability to pause a live machine and withdraw whatever
 *     escrow is still sitting in it.
 *
 * The migration is deliberately a normaliser rather than a rewriter: it only
 * fills in absent counters. It is also idempotent, so it is safe to run over
 * state that is already at v7 (which is what the dispatch below relies on
 * when an older version's ladder returns a current-shaped state).
 */
export function migrateV6ToV7(old: Record<string, unknown>): AppState {
  const prev = old as unknown as {
    machines?: Machine[];
    playerInventory?: PlayerInventory;
    creatorAccount?: CreatorAccount;
    ledgerEvents?: LedgerEvent[];
    buyback?: BuybackLedger;
    settings?: Partial<AppSettings> & { reducedMotion?: boolean; motionEnabled?: boolean };
  };

  return {
    version: 7,
    fixtureVersion: 7,
    machines: Array.isArray(prev.machines) ? prev.machines.map(withEscrowTotals) : [],
    buyback: prev.buyback ?? emptyBuybackLedger(),
    playerInventory: prev.playerInventory ?? {
      usdgBalanceUnits: 0n,
      rfBalanceUnits: 0n,
      wonFriends: [],
      pullHistory: [],
    },
    creatorAccount: prev.creatorAccount ?? {
      address: '',
      usdgBalanceUnits: 0n,
      rfBalanceUnits: 0n,
      ownedFriends: [],
      totalProceedsUnits: 0n,
      totalPlatformFeesGeneratedUnits: 0n,
      machinesCreatedCount: 0,
    },
    ledgerEvents: Array.isArray(prev.ledgerEvents) ? prev.ledgerEvents : [],
    // Spread first so nothing already stored is dropped — notably the
    // connected wallet, which decides whose machines the dashboard can
    // operate on — then strip legacy motion preferences that no longer exist.
    settings: stripLegacyMotionSetting({
      ...(prev.settings ?? {}),
      soundEnabled: prev.settings?.soundEnabled ?? true,
      activeRole: prev.settings?.activeRole === 'CREATOR' ? 'CREATOR' : 'PLAYER',
      hasSeenOnboarding: prev.settings?.hasSeenOnboarding ?? false,
    }) as AppSettings,
  };
}

/**
 * Walk a stored state up to the v6 shape. Each rung is the historical
 * migration, applied in order from wherever the state was found. Anything
 * older than v2 falls through to the fixture reseed, because those versions
 * stored data (fake sprite inventories, RF-denominated balances) that has no
 * honest conversion.
 */
function runV6Ladder(old: Record<string, unknown>, storedVersion: number): AppState {
  // Already at the v6 shape — nothing to walk. Without this the state would
  // fall through to the fixture reseed below and a returning user's machines
  // would be silently replaced.
  if (storedVersion >= 6) return old as unknown as AppState;
  if (storedVersion === 5) return migrateV5ToV6(old);
  if (storedVersion === 4) {
    const v5 = migrateV4ToV5(old);
    return migrateV5ToV6(v5 as unknown as Record<string, unknown>);
  }
  if (storedVersion === 3) {
    const v4 = migrateV3ToV4(old);
    return migrateV4ToV5(v4 as unknown as Record<string, unknown>);
  }
  if (storedVersion === 2) {
    const v3 = migrateV2ToV3(old);
    const v4 = migrateV3ToV4(v3 as unknown as Record<string, unknown>);
    return migrateV4ToV5(v4 as unknown as Record<string, unknown>);
  }
  return migrateV1ToV2(old);
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
    // V1 and older: reseed fixtures at the current scale, drop the fake
    // sprite inventory (never real), preserve user display settings.
    // V2: preserve everything, stamp finite_deck, append new fixtures.
    // V3: preserve everything, stamp legacy_manual valuation snapshots.
    // V4: RF economy -> USDG economy (preserve settings + owned NFTs only).
    // V5: 25% of the platform fee funds RF buybacks instead of a partner.
    // V6: machine vault — pause a machine, withdraw its unused escrow.
    const storedVersion =
      typeof parsed.version === 'number' ? parsed.version : 0;
    if (storedVersion !== STORAGE_VERSION || parsed.fixtureVersion !== FIXTURE_VERSION) {
      console.info(
        `Migrating Rare Arcade state v${storedVersion} to v${STORAGE_VERSION} (machine vault: pause + creator escrow withdrawal).`
      );
      const v6 = runV6Ladder(parsed as unknown as Record<string, unknown>, storedVersion);
      // The vault normaliser is idempotent and runs on every path, including
      // ones whose ladder already produced a current-shaped state.
      const migrated = migrateV6ToV7(v6 as unknown as Record<string, unknown>);
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
