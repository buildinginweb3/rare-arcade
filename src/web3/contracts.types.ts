/**
 * Typed interfaces for the Rare Arcade on-chain surface.
 *
 * These describe the contract calls the app will make in live mode. They are
 * intentionally minimal and declarative — no ABI blobs, no library
 * dependency, no bundle weight — so the app stays a static build today and can
 * be wired to viem/ethers (or raw EIP-1193) later without touching domain code.
 *
 * Every amount crossing this boundary is USDG base units (6 decimals). The
 * conversion helpers in domain/usdg.ts are the only sanctioned way to build one.
 */

import type { ContractRole } from './contracts.ts';
import { USDG_SCALE } from '../domain/usdg.ts';

// ---------------------------------------------------------------------------
// Minimal EIP-1193 / EIP-712 surface
// ---------------------------------------------------------------------------

export interface Eip1193Provider {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
}

export interface TxRequest {
  to: string;
  /** No calldata in these interfaces — every call is a typed method below. */
  data?: string;
  value?: bigint;
  from?: string;
}

export interface TxReceipt {
  hash: string;
  status: 'success' | 'reverted';
  blockNumber: number;
  /** Chain logs the app needs to reconcile state after settlement. */
  logs: TxLog[];
}

export interface TxLog {
  address: string;
  topics: string[];
  data: string;
}

// ---------------------------------------------------------------------------
// USDG (ERC-20) — the play currency
// ---------------------------------------------------------------------------

export interface UsdgToken {
  /** Always 6. Verified on-chain via decimals(). */
  readonly decimals: 6;
  /** USDG base units per whole token: 1_000_000n. */
  readonly scale: typeof USDG_SCALE;
  readonly address: string;

  balanceOf(account: string): Promise<bigint>;
  allowance(owner: string, spender: string): Promise<bigint>;
  approve(spender: string, amount: bigint): Promise<TxReceipt>;
  transfer(to: string, amount: bigint): Promise<TxReceipt>;
}

// ---------------------------------------------------------------------------
// Arcade Vault (escrow)
// ---------------------------------------------------------------------------

export interface ArcadeVault {
  readonly address: string;

  /** Player funds the arcade so it can spend on their behalf. */
  deposit(amount: bigint): Promise<TxReceipt>;
  /** Player pulls unspent escrow back out. */
  withdraw(amount: bigint): Promise<TxReceipt>;
  /** Player's spendable arcade balance (USDG base units). */
  balanceOf(account: string): Promise<bigint>;
  /** Creator's USDG cashback still locked in a live machine. */
  lockedPrizeBalance(machineId: bigint, creator: string): Promise<bigint>;
}

// ---------------------------------------------------------------------------
// Machine Registry
// ---------------------------------------------------------------------------

export type MachineModel = 'finite_deck' | 'fixed_odds';

export interface MachineConfig {
  /** Opaque encoded config — exact encoding is a contract implementation detail. */
  encodedConfig: string;
  model: MachineModel;
}

export interface MachineState {
  id: bigint;
  creator: string;
  /** USDG base units. */
  pullPrice: bigint;
  /** Always 500n in the app; the contract is the final authority on-chain. */
  platformFeeBps: bigint;
  pullCount: number;
  isRulesLocked: boolean;
  isSoldOut: boolean;
}

export interface MachineRegistry {
  readonly address: string;

  createMachine(config: MachineConfig): Promise<TxReceipt>;
  /** Irreversible. Called automatically on the first pull. */
  lockRules(machineId: bigint): Promise<TxReceipt>;
  /** Spends USDG, routes the 5% fee, settles the prize. */
  pull(machineId: bigint): Promise<TxReceipt>;
  machineState(machineId: bigint): Promise<MachineState>;
}

// ---------------------------------------------------------------------------
// Prize Pool
// ---------------------------------------------------------------------------

export interface PrizePool {
  readonly address: string;

  fundUsdgPrize(machineId: bigint, amount: bigint): Promise<TxReceipt>;
  /**
   * `usdgValue` is the RF amount valued in USDG at seed time, read once from
   * the oracle and then stored immutably — a later oracle answer must never
   * revalue a published machine.
   */
  fundRfPrize(machineId: bigint, rfAmount: bigint, usdgValue: bigint): Promise<TxReceipt>;
  fundNftPrize(machineId: bigint, tokenContract: string, tokenId: bigint): Promise<TxReceipt>;
  /** Pays out whichever prize a winning roll selected. */
  claim(machineId: bigint, prizeEntryId: bigint): Promise<TxReceipt>;
}

// ---------------------------------------------------------------------------
// Fee Router — the on-chain mirror of domain/fees.ts
// ---------------------------------------------------------------------------

export interface FeeSplit {
  /** 5% of the pull spend. */
  fee: bigint;
  /** 75% of the fee → primary treasury. */
  primary: bigint;
  /** 25% of the fee → partner treasury. */
  partner: bigint;
  /** 95% of the spend → creator receipts. */
  creator: bigint;
}

export interface FeeRouter {
  readonly address: string;
  readonly primaryRecipient: string;
  readonly partnerRecipient: string;

  platformFeeBps(): Promise<bigint>;
  /**
   * Pure preview of a split. Must equal domain/fees.ts `calculatePullSplit`
   * exactly, including integer rounding — assert this in an integration test
   * against the deployed contract before enabling live mode.
   */
  splitFee(spend: bigint): Promise<FeeSplit>;
}

// ---------------------------------------------------------------------------
// VRF
// ---------------------------------------------------------------------------

export interface VrfRequest {
  requestId: bigint;
  machineId: bigint;
  /** Block the seed should be derived from. */
  blockNumber: number;
}

export interface VrfCoordinator {
  readonly address: string;
  /** Maps a request id to the randomness used to settle a pull. */
  resolve(requestId: bigint): Promise<bigint>;
}

// ---------------------------------------------------------------------------
// Bundle
// ---------------------------------------------------------------------------

/**
 * Everything the app needs in live mode, resolved once at boot. `null` members
 * mean "not configured yet" — the caller must stay in demo mode.
 */
export interface LiveContracts {
  usdg: UsdgToken;
  vault: ArcadeVault | null;
  registry: MachineRegistry | null;
  prizePool: PrizePool | null;
  feeRouter: FeeRouter | null;
  vrf: VrfCoordinator | null;
  rfCashback: UsdgToken | null;
  rfPriceOracle: { latestAnswer(): Promise<bigint> } | null;
}

/** Roles with no configured deployment. */
export type MissingRole = Extract<
  ContractRole,
  'arcadeVault' | 'machineRegistry' | 'prizePool' | 'feeRouter' | 'vrfCoordinator'
>;

/** True when a live pull could actually be executed end to end. */
export function canPullLive(c: LiveContracts): boolean {
  return !!(c.vault && c.registry && c.prizePool && c.feeRouter);
}

/**
 * Total USDG a pull commits: the spend itself. Cashback comes back to the
 * player separately, so this is never netted out of the pre-flight check.
 */
export function pullCommitAmount(spend: bigint): bigint {
  return spend;
}