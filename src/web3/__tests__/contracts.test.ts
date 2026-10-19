import { describe, it, expect } from 'vitest';
import {
  CONTRACTS,
  TODO_ADDRESS,
  SETTLEMENT_CHAIN_ID,
  assertFeeConfig,
  isLiveReady,
  liveReadinessReport,
  unconfiguredRoles,
} from '../contracts.ts';
import {
  PLATFORM_PRIMARY_WALLET,
  RF_BURN_SINK,
  RETIRED_PARTNER_WALLET,
  PLATFORM_FEE_BPS,
  FEE_PRIMARY_SHARE_BPS,
  FEE_BUYBACK_SHARE_BPS,
} from '../../domain/fees.ts';

describe('Settlement chain', () => {
  it('settles on Robinhood Chain', () => {
    expect(SETTLEMENT_CHAIN_ID).toBe(4663);
  });
});

describe('Contract registry', () => {
  it('pins the real, verified USDG token address', () => {
    // Global Dollar (Paxos) on Robinhood Chain — verified on-chain, not a TODO.
    expect(CONTRACTS.usdg.address).toBe('0x5fc5360d0400a0fd4f2af552add042d716f1d168');
    expect(CONTRACTS.usdg.configured).toBe(true);
    expect(CONTRACTS.usdg.requiredFunctions).toContain('balanceOf(address)');
  });

  it('leaves every platform contract as an explicit TODO', () => {
    for (const role of [
      'arcadeVault',
      'machineRegistry',
      'prizePool',
      'feeRouter',
      'vrfCoordinator',
      'rfCashback',
      'rfPriceOracle',
    ] as const) {
      expect(CONTRACTS[role].address, role).toBe(TODO_ADDRESS);
      expect(CONTRACTS[role].configured, role).toBe(false);
    }
  });

  it('is NOT live-ready while addresses are missing', () => {
    expect(isLiveReady()).toBe(false);
    expect(unconfiguredRoles()).toContain('feeRouter');
    const report = liveReadinessReport();
    expect(report.liveReady).toBe(false);
    expect(report.blocking.length).toBeGreaterThan(0);
  });

  it('documents the fee router as a treasury + RF buyback splitter', () => {
    expect(CONTRACTS.feeRouter.notes).toMatch(/buyback pot/i);
    expect(CONTRACTS.feeRouter.notes).toMatch(/NEVER forward the 25% share to a treasury/i);
    expect(CONTRACTS.feeRouter.requiredFunctions).toContain('primaryRecipient()');
    expect(CONTRACTS.feeRouter.requiredFunctions).toContain('burnSink()');
    expect(CONTRACTS.feeRouter.requiredFunctions).toContain('executeBuyback(address)');
  });
});

describe('Fee config guard', () => {
  it('in-app fee config is internally consistent', () => {
    expect(Number(PLATFORM_FEE_BPS)).toBe(500);
    expect(Number(FEE_PRIMARY_SHARE_BPS)).toBe(7500);
    expect(assertFeeConfig().ok).toBe(true);
  });

  it('routes 75% to the treasury and pins the 25% share to the RF burn sink', () => {
    expect(PLATFORM_PRIMARY_WALLET).toBe('0x927A1799125EAE57B6BDc573Ee5e0354cD343Db1');
    expect(RF_BURN_SINK.toLowerCase()).toBe('0x000000000000000000000000000000000000dead');
    expect(Number(FEE_PRIMARY_SHARE_BPS)).toBe(7500);
    expect(Number(FEE_BUYBACK_SHARE_BPS)).toBe(2500);
    expect(CONTRACTS.feeRouter.notes).toContain(PLATFORM_PRIMARY_WALLET);
    expect(CONTRACTS.feeRouter.notes).toContain(RF_BURN_SINK);
  });

  it('retires the old partner wallet entirely', () => {
    // The 25% share must never reach this address again.
    expect(RETIRED_PARTNER_WALLET).toBe('0x16B4297E0D804E711072Be361617D4E23C03c533');
    expect(CONTRACTS.feeRouter.notes).not.toContain(RETIRED_PARTNER_WALLET);
    expect(CONTRACTS.feeRouter.requiredFunctions).not.toContain('partnerRecipient()');
  });

  it('flags the on-chain fee config once the router address is supplied', () => {
    // Simulate an operator pasting the deployed address.
    const original = CONTRACTS.feeRouter.address;
    (CONTRACTS.feeRouter as { address: string }).address = '0x1111111111111111111111111111111111111111';
    (CONTRACTS.feeRouter as { configured: boolean }).configured = true;
    try {
      const report = assertFeeConfig();
      expect(report.ok).toBe(false);
      expect(report.problems.join(' ')).toContain('PLATFORM_FEE_BPS() === 500');
      expect(report.problems.join(' ')).toContain(PLATFORM_PRIMARY_WALLET);
      expect(report.problems.join(' ')).toContain(RF_BURN_SINK);
    } finally {
      (CONTRACTS.feeRouter as { address: string }).address = original;
      (CONTRACTS.feeRouter as { configured: boolean }).configured = false;
    }
  });
});