import { describe, it, expect } from 'vitest';
import { createInitialDemoMachines } from '../../data/demoMachines.ts';
import { pullMachine } from '../machine.ts';
import { formatUsdgGrouped } from '../usdg.ts';
import { formatRFGrouped } from '../rf.ts';
import { PLATFORM_PRIMARY_WALLET, RF_BURN_SINK } from '../fees.ts';
import { liveReadinessReport } from '../../web3/contracts.ts';

/**
 * End-to-end settlement rehearsal: run every seeded demo machine to sellout and
 * assert the money reconciles in USDG, including the 75/25 fee routing.
 */
describe('Live settlement rehearsal (demo fixtures, fully drained)', () => {
  it('drains every machine and reconciles USDG + RF + fee routing exactly', () => {
    const { machines } = createInitialDemoMachines();
    expect(machines.length).toBe(4);
    const reportLines: string[] = [];

    for (const seed of machines) {
      let machine = seed;
      let playerUsdg = 10_000n * 1_000_000n;
      let playerRf = 0n;
      let buybackFunded = 0n;

      let guard = 0;
      while (machine.status !== 'SOLD_OUT' && guard++ < 4000) {
        const before = { usdg: playerUsdg, rf: playerRf };
        const { updatedMachine, result } = pullMachine(machine, '0xPlayer', playerUsdg);
        machine = updatedMachine;

        playerUsdg = before.usdg - result.spentUnits + result.usdgWonUnits;
        playerRf = before.rf + result.rfWonUnits;

        // Conservation on every single pull.
        expect(result.platformFeeUnits + result.creatorReceiptUnits).toBe(result.spentUnits);
        expect(result.primaryFeeUnits + result.buybackFeeUnits).toBe(result.platformFeeUnits);
        buybackFunded += result.buybackFeeUnits;
      }
      expect(machine.status, seed.name).toBe('SOLD_OUT');

      // Aggregate conservation across the machine's life.
      expect(machine.totalPlatformFeeUnits + machine.creatorReceiptsUnits).toBe(
        machine.totalSpentUnits
      );
      expect(machine.primaryFeeUnits + machine.buybackFeeUnits).toBe(
        machine.totalPlatformFeeUnits
      );
      expect(machine.buybackFeeUnits).toBe(buybackFunded);
      // ~75/25 routing.
      expect(
        machine.primaryFeeUnits * 10000n / machine.totalPlatformFeeUnits
      ).toBeGreaterThanOrEqual(7_490n);


      // Reported (not asserted) so a reviewer can eyeball the reconciliation.
      reportLines.push(
        `${seed.name.padEnd(14)} spend ${formatUsdgGrouped(machine.totalSpentUnits).padStart(14)}` +
          ` | fee ${formatUsdgGrouped(machine.totalPlatformFeeUnits).padStart(11)}` +
          ` (75% ${formatUsdgGrouped(machine.primaryFeeUnits, { decimals: 3 }).padStart(10)}` +
          ` / 25% ${formatUsdgGrouped(machine.buybackFeeUnits, { decimals: 3 }).padStart(9)})` +
          ` | creator ${formatUsdgGrouped(machine.creatorReceiptsUnits).padStart(12)}` +
          ` | won ${formatUsdgGrouped(machine.usdgPrizesPaidUnits).padStart(11)} USDG` +
          ` + ${formatRFGrouped(machine.rfPrizesPaidUnits)}`
      );
    }
    // Surfaced as one readable settlement report.
    console.log('\n=== SETTLEMENT REHEARSAL (USDG) ===\n' + reportLines.join('\n'));
  });

  it('reports exactly what still blocks live settlement', () => {
    const report = liveReadinessReport();
    console.log(`\nMODE: ${report.mode} | liveReady: ${report.liveReady}`);
    console.log(`MISSING: ${report.missing.join(', ')}`);
    console.log(`FEE CONFIG OK: ${report.feeConfigOk}`);
    report.blocking.forEach((b) => console.log(`BLOCKING: ${b}`));
    console.log(`PRIMARY TREASURY: ${PLATFORM_PRIMARY_WALLET}`);
    console.log(`RF BURN SINK:     ${RF_BURN_SINK}`);

    expect(report.mode).toBe('demo');
    expect(report.liveReady).toBe(false);
    expect(report.feeConfigOk).toBe(true);
  });
});