import { describe, it, expect } from 'vitest';
import {
  parseRF,
  formatRFGrouped,
  formatRFCompact,
  calculatePullSplit,
  addRF,
  subRF,
} from '../rf.ts';
import { RARE_ARCADE_DEMO_ECONOMY } from '../demoEconomy.ts';
import { createMachine, pullMachine } from '../machine.ts';
import { calculateRtpBps, calculateEv } from '../economics.ts';
import { createSeedableRng } from '../deck.ts';
import type { PrizeEntry } from '../types.ts';

describe('High-scale RF formatting', () => {
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

describe('Demo economy scale (demoEconomy.ts)', () => {
  it('uses realistic suggestions and balances', () => {
    expect(RARE_ARCADE_DEMO_ECONOMY.defaultPullPriceStr).toBe('2500');
    expect([...RARE_ARCADE_DEMO_ECONOMY.pullPriceSuggestions]).toEqual(['1000', '2500', '5000', '10000']);
    expect([...RARE_ARCADE_DEMO_ECONOMY.rfPrizeSuggestions]).toEqual(['5000', '10000', '25000', '50000', '100000']);
    expect(RARE_ARCADE_DEMO_ECONOMY.playerStartingBalanceUnits).toBe(parseRF('250000'));
    expect(RARE_ARCADE_DEMO_ECONOMY.creatorStartingBalanceUnits).toBe(parseRF('2500000'));
  });
});

describe('High-RF machine economics', () => {
  const prizes: PrizeEntry[] = [
    { id: 'p-50000', type: 'RF_PRIZE', amountUnits: parseRF('50000'), initialQuantity: 1, remainingQuantity: 1 },
    { id: 'p-25000', type: 'RF_PRIZE', amountUnits: parseRF('25000'), initialQuantity: 2, remainingQuantity: 2 },
    { id: 'p-10000', type: 'RF_PRIZE', amountUnits: parseRF('10000'), initialQuantity: 5, remainingQuantity: 5 },
  ]; // total 150,000 RF

  it('keeps burn/receipts/EV/RTP exact at scale', () => {
    const pullPrice = parseRF('5000');
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
    // 150,000 / (5000*0.9=4500) = 33.3 -> 33 pulls; EV=4545.45 RF? integer units:
    const ev = calculateEv(150000000n, machine.totalPulls);
    expect(ev).toBe(machine.initialEvUnits);
    expect(calculateRtpBps(ev, pullPrice)).toBe(machine.initialRtpBps);

    const { burnUnits, creatorUnits } = calculatePullSplit(pullPrice);
    expect(burnUnits + creatorUnits).toBe(pullPrice);
    expect(burnUnits).toBe(parseRF('250')); // 5% of 5,000
  });

  it('pulls, payouts and sellout totals reconcile at scale', () => {
    const pullPrice = parseRF('10000');
    const { machine } = createMachine({
      id: 'm-scale',
      name: 'SCALE',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: pullPrice,
      totalPulls: 30,
      targetRtpBps: 9000,
      prizeEntries: [
        { id: 'p-a', type: 'RF_PRIZE', amountUnits: parseRF('100000'), initialQuantity: 1, remainingQuantity: 1 },
        { id: 'p-b', type: 'RF_PRIZE', amountUnits: parseRF('50000'), initialQuantity: 4, remainingQuantity: 4 },
      ],
      rng: createSeedableRng(22),
    });
    let m = machine;
    let balance = parseRF('250000');
    let paid = 0n;
    const pulls = m.totalPulls;
    for (let i = 0; i < pulls; i++) {
      const { updatedMachine, result } = pullMachine(m, '0xP', balance);
      balance = subRF(balance, result.spentUnits);
      if (result.prizeType === 'RF_PRIZE') {
        balance = addRF(balance, result.rfWonUnits);
        paid += result.rfWonUnits;
      }
      m = updatedMachine;
    }
    expect(m.status).toBe('SOLD_OUT');
    expect(m.totalSpentUnits).toBe(pullPrice * BigInt(pulls));
    expect(m.totalBurnedUnits + m.creatorReceiptsUnits).toBe(m.totalSpentUnits);
    expect(m.rfPrizesPaidUnits).toBe(paid);
    expect(paid).toBe(parseRF('300000')); // 100k + 4x50k
  });

  it('handles 100,000,000 RF without drift', () => {
    const big = parseRF('100000000');
    expect(formatRFGrouped(big)).toBe('100,000,000.00 RF');
    const { burnUnits, creatorUnits } = calculatePullSplit(big);
    expect(burnUnits + creatorUnits).toBe(big);
    expect(burnUnits).toBe(parseRF('5000000'));
  });
});
