import { describe, it, expect } from 'vitest';
import { parseRF, formatRFGrouped, formatRFCompact } from '../rf.ts';
import { parseUsdg, formatUsdgGrouped, formatUsdgCompact, subUsdg } from '../usdg.ts';
import { calculatePullSplit } from '../fees.ts';
import { RARE_ARCADE_DEMO_ECONOMY } from '../demoEconomy.ts';
import { createMachine, pullMachine } from '../machine.ts';
import { calculateRtpBps, calculateEv } from '../economics.ts';
import { createSeedableRng } from '../deck.ts';
import type { PrizeEntry } from '../types.ts';

describe('High-scale RF formatting (RF cashback prizes)', () => {
  it('groups thousands exactly', () => {
    expect(formatRFGrouped(parseRF('1000'))).toBe('1,000.00 RF');
    expect(formatRFGrouped(parseRF('2500'))).toBe('2,500.00 RF');
    expect(formatRFGrouped(parseRF('25000'))).toBe('25,000.00 RF');
    expect(formatRFGrouped(parseRF('250000'))).toBe('250,000.00 RF');
    expect(formatRFGrouped(parseRF('2500000'))).toBe('2,500,000.00 RF');
  });

  it('compacts only for tight spaces', () => {
    expect(formatRFCompact(parseRF('2500'))).toBe('2.5K RF');
    expect(formatRFCompact(parseRF('250000'))).toBe('250K RF');
    expect(formatRFCompact(parseRF('2500000'))).toBe('2.5M RF');
  });
});

describe('High-scale USDG formatting (the play currency)', () => {
  it('groups thousands exactly at 6-decimal precision', () => {
    expect(formatUsdgGrouped(parseUsdg('1'))).toBe('1.00 USDG');
    expect(formatUsdgGrouped(parseUsdg('2500'))).toBe('2,500.00 USDG');
    expect(formatUsdgGrouped(parseUsdg('1234567.891234'))).toBe('1,234,567.89 USDG');
    // Sub-cent amounts keep their real value instead of rounding to $0.00.
    expect(formatUsdgGrouped(parseUsdg('0.000001'), { decimals: 6 })).toBe('0.000001 USDG');
  });

  it('compacts only for tight spaces', () => {
    expect(formatUsdgCompact(parseUsdg('2500'))).toBe('2.5K USDG');
    expect(formatUsdgCompact(parseUsdg('250000'))).toBe('250K USDG');
    expect(formatUsdgCompact(parseUsdg('2500000'))).toBe('2.5M USDG');
  });
});

describe('Demo economy scale (demoEconomy.ts)', () => {
  it('is denominated in USDG, with RF kept as a separate cashback reserve', () => {
    expect(RARE_ARCADE_DEMO_ECONOMY.defaultPullPriceStr).toBe('5');
    expect([...RARE_ARCADE_DEMO_ECONOMY.pullPriceSuggestions]).toEqual([
      '1',
      '2.50',
      '5',
      '10',
    ]);
    expect(RARE_ARCADE_DEMO_ECONOMY.playerStartingBalanceUnits).toBe(parseUsdg('2500'));
    expect(RARE_ARCADE_DEMO_ECONOMY.creatorStartingBalanceUnits).toBe(parseUsdg('25000'));
    // USDG cashback is the default; RF cashback is the optional second option.
    expect(RARE_ARCADE_DEMO_ECONOMY.defaultUsdgPrizeStr).toBe('10');
    expect([...RARE_ARCADE_DEMO_ECONOMY.usdgPrizeSuggestions]).toEqual([
      '5',
      '10',
      '25',
      '50',
      '100',
    ]);
    expect([...RARE_ARCADE_DEMO_ECONOMY.rfPrizeSuggestions]).toEqual([
      '2500',
      '5000',
      '12500',
      '25000',
      '50000',
    ]);
    expect(RARE_ARCADE_DEMO_ECONOMY.creatorStartingRfUnits).toBe(parseRF('500000'));
    expect(RARE_ARCADE_DEMO_ECONOMY.platformFeeBps).toBe(500);
  });
});

describe('High-value USDG machine economics', () => {
  const prizes: PrizeEntry[] = [
    { id: 'p-50', type: 'USDG_PRIZE', amountUnits: parseUsdg('50'), initialQuantity: 1, remainingQuantity: 1 },
    { id: 'p-25', type: 'USDG_PRIZE', amountUnits: parseUsdg('25'), initialQuantity: 2, remainingQuantity: 2 },
    { id: 'p-10', type: 'USDG_PRIZE', amountUnits: parseUsdg('10'), initialQuantity: 5, remainingQuantity: 5 },
  ]; // total $150

  it('keeps fees/receipts/EV/RTP exact at scale', () => {
    const pullPrice = parseUsdg('5');
    const { machine } = createMachine({
      id: 'm-high',
      name: 'HIGH',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: pullPrice,
      targetRtpBps: 9000,
      prizeEntries: prizes,
      rng: createSeedableRng(21),
    });
    const ev = calculateEv(parseUsdg('150'), machine.totalPulls);
    expect(ev).toBe(machine.initialEvUnits);
    expect(calculateRtpBps(ev, pullPrice)).toBe(machine.initialRtpBps);

    const { feeUnits, creatorUnits, primaryFeeUnits, buybackFeeUnits } =
      calculatePullSplit(pullPrice);
    expect(feeUnits + creatorUnits).toBe(pullPrice);
    expect(feeUnits).toBe(parseUsdg('0.25')); // 5% of $5
    expect(primaryFeeUnits).toBe(parseUsdg('0.1875')); // 75% of the fee
    expect(buybackFeeUnits).toBe(parseUsdg('0.0625')); // 25% of the fee
  });

  it('pulls, payouts and sellout totals reconcile at scale', () => {
    const pullPrice = parseUsdg('10');
    const { machine } = createMachine({
      id: 'm-scale',
      name: 'SCALE',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: pullPrice,
      totalPulls: 30,
      targetRtpBps: 9000,
      prizeEntries: [
        { id: 'p-a', type: 'USDG_PRIZE', amountUnits: parseUsdg('100'), initialQuantity: 1, remainingQuantity: 1 },
        { id: 'p-b', type: 'USDG_PRIZE', amountUnits: parseUsdg('50'), initialQuantity: 4, remainingQuantity: 4 },
      ],
      rng: createSeedableRng(22),
    });
    let m = machine;
    let balance = parseUsdg('2500');
    let paid = 0n;
    const pulls = m.totalPulls;
    for (let i = 0; i < pulls; i++) {
      const { updatedMachine, result } = pullMachine(m, '0xP', balance);
      balance = subUsdg(balance, result.spentUnits);
      if (result.prizeType === 'USDG_PRIZE') {
        paid += result.usdgWonUnits;
      }
      m = updatedMachine;
    }
    expect(m.status).toBe('SOLD_OUT');
    expect(m.totalSpentUnits).toBe(pullPrice * BigInt(pulls));
    expect(m.totalPlatformFeeUnits + m.creatorReceiptsUnits).toBe(m.totalSpentUnits);
    expect(m.primaryFeeUnits + m.buybackFeeUnits).toBe(m.totalPlatformFeeUnits);
    expect(m.usdgPrizesPaidUnits).toBe(paid);
    expect(paid).toBe(parseUsdg('300')); // 100 + 4x50
  });

  it('handles very large USDG amounts without drift', () => {
    const big = parseUsdg('100000000');
    expect(formatUsdgGrouped(big)).toBe('100,000,000.00 USDG');
    const { feeUnits, creatorUnits } = calculatePullSplit(big);
    expect(feeUnits + creatorUnits).toBe(big);
    expect(feeUnits).toBe(parseUsdg('5000000'));
  });

  it('keeps RF cashback exact in its own units when stacked with USDG', () => {
    const pullPrice = parseUsdg('5');
    const { machine } = createMachine({
      id: 'm-rf-stack',
      name: 'RF STACK',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: pullPrice,
      totalPulls: 20,
      targetRtpBps: 9000,
      prizeEntries: [
        { id: 'u', type: 'USDG_PRIZE', amountUnits: parseUsdg('10'), initialQuantity: 5, remainingQuantity: 5 },
        {
          id: 'r',
          type: 'RF_PRIZE',
          amountUnits: parseRF('12500'),
          usdgValueUnits: parseUsdg('25'),
          rfPriceUsdg: '0.002',
          initialQuantity: 5,
          remainingQuantity: 5,
        },
      ],
      rng: createSeedableRng(23),
    });

    let m = machine;
    let rfPaid = 0n;
    for (let i = 0; i < 20; i++) {
      const res = pullMachine(m, '0xP', parseUsdg('1000'));
      m = res.updatedMachine;
      rfPaid += res.result.rfWonUnits;
    }
    // $50 of USDG cashback + $125 of RF cashback (62,500 RF @ $0.002).
    expect(m.usdgPrizesPaidUnits).toBe(parseUsdg('50'));
    expect(m.rfPrizesPaidUnits).toBe(rfPaid);
    expect(rfPaid).toBe(parseRF('62500'));
    // RF stays in RF units and never contaminates the USDG ledgers.
    expect(m.totalSpentUnits).toBe(parseUsdg('100'));
    expect(m.totalPlatformFeeUnits).toBe(parseUsdg('5'));
  });
});
