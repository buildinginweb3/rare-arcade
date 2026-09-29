import { describe, it, expect } from 'vitest';
import { parseRF } from '../rf.ts';
import { createSeedableRng } from '../deck.ts';
import {
  PPM_SCALE,
  MAX_TOTAL_ODDS_PPM,
  parseOddsPercentToPpm,
  formatOddsPpm,
  validateFixedOddsPrizes,
  buildFixedOddsIntervals,
  resolveFixedOddsRoll,
  calculateLiveAvailableRtpBps,
  calculateCreatorEdgeBps,
  baseNoPrizePpm,
  soldOutSlotPpm,
  effectiveNoPrizePpm,
  fixedOddsInventoryTotals,
  isFixedOddsInventoryEmpty,
  getFixedOddsTable,
  calculateRealizedPayoutRatio,
  suggestFixedOddsPpm,
  simulateFixedOddsLifetime,
  createFixedOddsMachine,
  pullFixedOddsMachine,
} from '../fixedOdds.ts';
import { pullMachine, cancelMachine } from '../machine.ts';
import { createInitialDemoMachines } from '../../data/demoMachines.ts';
import type { RFPrizeEntry, FriendPrizeEntry } from '../types.ts';

const PRICE_5K = parseRF('5000');
const RICH_BALANCE = parseRF('100000000');
const PLAYER = '0xPlayer';

function rfLine(
  id: string,
  amountRf: string,
  qty: number,
  pct: string
): RFPrizeEntry {
  return {
    id,
    type: 'RF_PRIZE',
    amountUnits: parseRF(amountRf),
    initialQuantity: qty,
    remainingQuantity: qty,
    oddsPpm: parseOddsPercentToPpm(pct),
  };
}

function nftLine(
  id: string,
  tokenId: bigint,
  refRf: string,
  pct: string
): FriendPrizeEntry {
  return {
    id,
    type: 'FRIEND_PRIZE',
    tokenId,
    name: `Friend #${tokenId}`,
    familyName: 'Generations',
    generation: 0,
    referenceValueUnits: parseRF(refRf),
    initialQuantity: 1,
    remainingQuantity: 1,
    oddsPpm: parseOddsPercentToPpm(pct),
    origin: 'system-demo',
    chainId: 4663,
    contractAddress: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d',
    collectionType: 'GENERATIONS',
    collectionName: 'Rare Friends Generations',
  };
}

describe('Odds precision (ppm)', () => {
  it('parses human percentages to exact ppm', () => {
    expect(parseOddsPercentToPpm('0.001')).toBe(10);
    expect(parseOddsPercentToPpm('0.01')).toBe(100);
    expect(parseOddsPercentToPpm('0.1')).toBe(1000);
    expect(parseOddsPercentToPpm('1')).toBe(10000);
    expect(parseOddsPercentToPpm('12.345')).toBe(123450);
    expect(parseOddsPercentToPpm('100')).toBe(1000000);
    expect(parseOddsPercentToPpm('2.5%')).toBe(25000);
  });

  it('rejects blank, zero, negative, NaN, over-100, and >4 decimals', () => {
    for (const bad of ['', '   ', '0', '0%', '-1', 'NaN', 'Infinity', '100.0001', '12.34567', 'abc']) {
      expect(() => parseOddsPercentToPpm(bad)).toThrow();
    }
  });

  it('formats ppm faithfully without silent rounding', () => {
    expect(formatOddsPpm(10)).toBe('0.001%');
    expect(formatOddsPpm(100)).toBe('0.01%');
    expect(formatOddsPpm(1000)).toBe('0.1%');
    expect(formatOddsPpm(5000)).toBe('0.5%');
    expect(formatOddsPpm(1250)).toBe('0.125%');
    expect(formatOddsPpm(20000)).toBe('2%');
    expect(formatOddsPpm(895000)).toBe('89.5%');
    expect(formatOddsPpm(1000000)).toBe('100%');
    expect(formatOddsPpm(0)).toBe('0%');
    expect(() => formatOddsPpm(-1)).toThrow();
    expect(() => formatOddsPpm(1000001)).toThrow();
    expect(() => formatOddsPpm(1.5)).toThrow();
  });

  it('round-trips parse/format exactly', () => {
    const cases: Array<[string, string]> = [
      ['0.001', '0.001%'],
      ['0.01', '0.01%'],
      ['0.125', '0.125%'],
      ['0.5', '0.5%'],
      ['2', '2%'],
      ['8', '8%'],
      ['89.5', '89.5%'],
      ['100', '100%'],
    ];
    for (const [input, expected] of cases) {
      expect(formatOddsPpm(parseOddsPercentToPpm(input))).toBe(expected);
    }
  });
});

describe('Fixed Odds validation', () => {
  it('accepts a coherent pool and reports the no-prize remainder', () => {
    const { totalPpm, noPrizePpm } = validateFixedOddsPrizes([
      rfLine('a', '100000', 5, '2'),
      rfLine('b', '25000', 20, '8'),
    ]);
    expect(totalPpm).toBe(100000);
    expect(noPrizePpm).toBe(900000);
  });

  it('allows a 100% machine (zero no-prize)', () => {
    const { totalPpm, noPrizePpm } = validateFixedOddsPrizes([rfLine('a', '1000', 1, '100')]);
    expect(totalPpm).toBe(1000000);
    expect(noPrizePpm).toBe(0);
  });

  it('blocks totals over 100% with a clear message', () => {
    expect(() =>
      validateFixedOddsPrizes([rfLine('a', '1000', 1, '60'), rfLine('b', '1000', 1, '50')])
    ).toThrow(/PRIZE ODDS EXCEED 100%/);
  });

  it('rejects NO_PRIZE entries, missing odds, NFT qty != 1, and dup NFTs', () => {
    expect(() =>
      validateFixedOddsPrizes([
        rfLine('a', '1000', 1, '10'),
        { id: 'n', type: 'NO_PRIZE', initialQuantity: 5, remainingQuantity: 5 },
      ])
    ).toThrow(/derive no-prize/);
    expect(() =>
      validateFixedOddsPrizes([
        { id: 'a', type: 'RF_PRIZE', amountUnits: parseRF('1000'), initialQuantity: 1, remainingQuantity: 1 },
      ])
    ).toThrow(/valid fixed odds/);
    expect(() =>
      validateFixedOddsPrizes([
        { ...nftLine('a', 1n, '1000', '10'), initialQuantity: 2, remainingQuantity: 2 },
      ])
    ).toThrow(/quantity exactly 1/);
    expect(() =>
      validateFixedOddsPrizes([nftLine('a', 1n, '1000', '10'), nftLine('b', 1n, '2000', '5')])
    ).toThrow(/Duplicate unique Rare Friend/);
    expect(() => validateFixedOddsPrizes([])).toThrow(/at least one/);
  });
});

describe('Intervals and roll resolution', () => {
  const a = rfLine('a-prize', '100000', 5, '10');
  const b = rfLine('b-prize', '25000', 20, '20');

  it('builds identical intervals regardless of UI row order', () => {
    const forward = buildFixedOddsIntervals([a, b]);
    const reversed = buildFixedOddsIntervals([b, a]);
    const mapOf = (ivs: typeof forward) =>
      new Map(ivs.map((iv) => [iv.prizeEntryId, [iv.startPpm, iv.endPpm]]));
    expect(mapOf(forward)).toEqual(mapOf(reversed));
    expect(mapOf(forward).get('a-prize')).toEqual([0, 100000]);
    expect(mapOf(forward).get('b-prize')).toEqual([100000, 300000]);
  });

  it('resolves rolls to the owning interval or null (miss)', () => {
    const ivs = buildFixedOddsIntervals([a, b]);
    const full = new Map([
      ['a-prize', 5],
      ['b-prize', 20],
    ]);
    expect(resolveFixedOddsRoll(ivs, full, 0.05)).toBe('a-prize'); // 50,000ppm
    expect(resolveFixedOddsRoll(ivs, full, 0.15)).toBe('b-prize'); // 150,000ppm
    expect(resolveFixedOddsRoll(ivs, full, 0.99999)).toBeNull(); // miss region
  });

  it('treats sold-out slots as empty outcomes without moving intervals', () => {
    const ivs = buildFixedOddsIntervals([a, b]);
    // A is gone; a roll squarely inside A's original 10% interval misses.
    const afterA = new Map([
      ['a-prize', 0],
      ['b-prize', 20],
    ]);
    expect(resolveFixedOddsRoll(ivs, afterA, 0.05)).toBeNull();
    // B is untouched at exactly 20%.
    expect(resolveFixedOddsRoll(ivs, afterA, 0.15)).toBe('b-prize');
    // Rebuilt intervals are byte-identical (config never changes).
    expect(buildFixedOddsIntervals([a, b])).toEqual(ivs);
  });
});

describe('Fixed Odds creation and basic pull', () => {
  it('creates a machine with configured RTP, no deck, and stays live', () => {
    const { machine } = createFixedOddsMachine({
      id: 'fo-basic',
      name: 'BASIC',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: PRICE_5K,
      prizeEntries: [rfLine('a', '100000', 5, '2'), rfLine('b', '25000', 20, '8')],
    });
    expect(machine.machineType).toBe('fixed_odds');
    expect(machine.status).toBe('READY');
    expect('deck' in machine).toBe(false);
    // EV = 100000×0.02 + 25000×0.08 = 2000+2000 = 4000 → 80%
    expect(machine.configuredRtpBps).toBe(8000);
    expect(machine.liveAvailableRtpBps).toBe(8000);
    expect(machine.isRulesLocked).toBe(false);
  });

  it('pulls with exact 5%/95% accounting and increments pullCount', () => {
    const { machine } = createFixedOddsMachine({
      id: 'fo-acct',
      name: 'ACCT',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: PRICE_5K,
      prizeEntries: [rfLine('a', '100000', 5, '2')],
    });
    const { updatedMachine, result, events } = pullFixedOddsMachine(
      machine,
      PLAYER,
      RICH_BALANCE,
      () => 0.99999 // forced miss
    );
    expect(result.machineType).toBe('fixed_odds');
    expect(result.wonPrize).toBe(false);
    expect(result.prizeType).toBe('NO_PRIZE');
    expect(result.spentUnits).toBe(PRICE_5K);
    expect(result.burnedUnits).toBe(parseRF('250')); // 5% of 5,000
    expect(result.creatorReceiptUnits).toBe(parseRF('4750'));
    expect(result.burnedUnits + result.creatorReceiptUnits).toBe(PRICE_5K);
    expect(updatedMachine.pullCount).toBe(1);
    expect(updatedMachine.status).toBe('LIVE');
    expect(updatedMachine.isRulesLocked).toBe(true);
    expect('deck' in updatedMachine).toBe(false);
    expect(events.map((e) => e.type)).toContain('PULL_INITIATED');
    expect(result.rollPpm).toBe(999990);
  });

  it('locks rules after the first pull and rejects cancellation', () => {
    const { machine } = createFixedOddsMachine({
      id: 'fo-lock',
      name: 'LOCK',
      shellId: 'MINI',
      creatorAddress: '0xC',
      pullPriceUnits: PRICE_5K,
      prizeEntries: [rfLine('a', '100000', 5, '2')],
    });
    const before = JSON.stringify(machine.remainingPrizes.map((p) => [p.id, (p as RFPrizeEntry).oddsPpm]));
    const { updatedMachine } = pullFixedOddsMachine(machine, PLAYER, RICH_BALANCE, () => 0.99999);
    expect(updatedMachine.isRulesLocked).toBe(true);
    expect(
      JSON.stringify(updatedMachine.remainingPrizes.map((p) => [p.id, (p as RFPrizeEntry).oddsPpm]))
    ).toBe(before);
    expect(() => cancelMachine(updatedMachine)).toThrow(/after pulls have started/);
  });

  it('allows pre-pull cancellation with full escrow refund', () => {
    const { machine } = createFixedOddsMachine({
      id: 'fo-cancel',
      name: 'CANCEL',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: PRICE_5K,
      prizeEntries: [rfLine('a', '100000', 2, '2'), nftLine('n', 9n, '50000', '1')],
    });
    const { cancelledMachine, refundRfUnits, refundFriends } = cancelMachine(machine);
    expect(cancelledMachine.status).toBe('CANCELLED');
    expect('deck' in cancelledMachine).toBe(false);
    expect(refundRfUnits).toBe(parseRF('200000'));
    expect(refundFriends.map((f) => f.tokenId)).toEqual([9n]);
  });
});

describe('Sold-out slot honesty', () => {
  function nftMachine() {
    return createFixedOddsMachine({
      id: 'fo-slot',
      name: 'SLOT',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: PRICE_5K,
      prizeEntries: [nftLine('a-nft', 42n, '250000', '10'), rfLine('b-rf', '25000', 20, '20')],
    }).machine;
  }

  it('sold-out NFT slot becomes an empty outcome; other odds unchanged', () => {
    let m = nftMachine();
    // Roll inside the NFT's original 10% interval: deterministic win.
    const won = pullFixedOddsMachine(m, PLAYER, RICH_BALANCE, () => 0.05);
    expect(won.result.prizeType).toBe('FRIEND_PRIZE');
    expect(won.result.friendWon?.tokenId).toBe(42n);
    m = won.updatedMachine;
    expect(m.remainingPrizes.find((p) => p.id === 'a-nft')?.remainingQuantity).toBe(0);

    // Same roll now misses; B still resolves at exactly 20%.
    const miss = pullFixedOddsMachine(m, PLAYER, RICH_BALANCE, () => 0.05);
    expect(miss.result.prizeType).toBe('NO_PRIZE');
    const hitB = pullFixedOddsMachine(m, PLAYER, RICH_BALANCE, () => 0.15);
    expect(hitB.result.prizeType).toBe('RF_PRIZE');

    // Configured odds on the machine object never moved.
    const odds = new Map(
      m.remainingPrizes
        .filter((p): p is RFPrizeEntry | FriendPrizeEntry => p.type !== 'NO_PRIZE')
        .map((p) => [p.id, p.oddsPpm])
    );
    expect(odds.get('a-nft')).toBe(100000);
    expect(odds.get('b-rf')).toBe(200000);
  });

  it('effective no-prize = base remainder + sold-out slots', () => {
    const m = nftMachine().remainingPrizes;
    expect(baseNoPrizePpm(m)).toBe(700000);
    expect(soldOutSlotPpm(m)).toBe(0);
    expect(effectiveNoPrizePpm(m)).toBe(700000);
    const emptied = m.map((p) =>
      p.id === 'a-nft' ? { ...p, remainingQuantity: 0 } : p
    );
    expect(soldOutSlotPpm(emptied)).toBe(100000);
    expect(effectiveNoPrizePpm(emptied)).toBe(800000);
  });

  it('live available RTP drops while configured RTP never moves', () => {
    let m = nftMachine();
    expect(m.liveAvailableRtpBps).toBe(m.configuredRtpBps);
    // Configured: 250000×0.10 + 25000×0.20 = 25000+5000 = 30000 → wait, units:
    // 250,000,000×100000 + 25,000,000×200000 = 2.5e13+5e12 = 3e13 /1e6 = 30,000,000 units = 30,000 RF; /5000 = 600% RTP.
    expect(m.configuredRtpBps).toBe(60000);
    const won = pullFixedOddsMachine(m, PLAYER, RICH_BALANCE, () => 0.05);
    m = won.updatedMachine;
    // NFT gone: 25000×0.20 = 5000 RF → 100% live available.
    expect(m.liveAvailableRtpBps).toBe(10000);
    expect(m.configuredRtpBps).toBe(60000);
  });
});

describe('No play cap and sellout', () => {
  it('keeps accepting pulls far beyond any deck capacity while prizes remain', () => {
    const { machine } = createFixedOddsMachine({
      id: 'fo-nocap',
      name: 'NOCAP',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: PRICE_5K,
      prizeEntries: [rfLine('a', '100000', 1000, '50')],
    });
    let m = machine;
    const rng = createSeedableRng(42);
    for (let i = 0; i < 150; i++) {
      m = pullFixedOddsMachine(m, PLAYER, RICH_BALANCE, rng).updatedMachine;
    }
    expect(m.pullCount).toBe(150);
    expect(m.status).toBe('LIVE');
    expect('deck' in m).toBe(false);
  });

  it('sells out only when all inventory is gone, then rejects pulls', () => {
    const { machine } = createFixedOddsMachine({
      id: 'fo-end',
      name: 'END',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: PRICE_5K,
      prizeEntries: [rfLine('a', '4000', 1, '100')],
    });
    const won = pullFixedOddsMachine(machine, PLAYER, RICH_BALANCE, () => 0.5);
    expect(won.result.prizeType).toBe('RF_PRIZE');
    expect(won.result.rfWonUnits).toBe(parseRF('4000'));
    expect(won.updatedMachine.status).toBe('SOLD_OUT');
    expect(isFixedOddsInventoryEmpty(won.updatedMachine.remainingPrizes)).toBe(true);
    expect(() => pullFixedOddsMachine(won.updatedMachine, PLAYER, RICH_BALANCE, () => 0.5)).toThrow(
      /SOLD OUT/
    );
    // Dispatcher also rejects.
    expect(() => pullMachine(won.updatedMachine, PLAYER, RICH_BALANCE)).toThrow(/SOLD OUT/);
  });

  it('100% single-NFT machine awards on the first pull and ends', () => {
    const { machine } = createFixedOddsMachine({
      id: 'fo-jackpot',
      name: 'JACKPOT',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: PRICE_5K,
      prizeEntries: [nftLine('n', 7n, '25000', '100')],
    });
    const won = pullMachine(machine, PLAYER, RICH_BALANCE, () => 0.12345);
    expect(won.result.prizeType).toBe('FRIEND_PRIZE');
    expect(won.updatedMachine.status).toBe('SOLD_OUT');
  });
});

describe('Configured / live / edge / realized RTP', () => {
  function machineAt(rtpPct: string, priceRf = '5000') {
    // Single 100%-odds line makes configured RTP exact: EV = ref.
    const refRf = String(Number(rtpPct) * Number(priceRf) / 100);
    return createFixedOddsMachine({
      id: `fo-rtp-${rtpPct}`,
      name: 'RTP',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: parseRF(priceRf),
      prizeEntries: [rfLine('a', refRf, 3, '100')],
    }).machine;
  }

  it('computes configured RTP below, at, above 95 and above 100', () => {
    expect(machineAt('70').configuredRtpBps).toBe(7000);
    expect(machineAt('95').configuredRtpBps).toBe(9500);
    expect(machineAt('100').configuredRtpBps).toBe(10000);
    expect(machineAt('110').configuredRtpBps).toBe(11000);
  });

  it('computes creator edge as 95% minus RTP (may be negative)', () => {
    expect(calculateCreatorEdgeBps(7000)).toBe(2500);
    expect(calculateCreatorEdgeBps(8000)).toBe(1500);
    expect(calculateCreatorEdgeBps(9000)).toBe(500);
    expect(calculateCreatorEdgeBps(9500)).toBe(0);
    expect(calculateCreatorEdgeBps(10000)).toBe(-500);
    expect(calculateCreatorEdgeBps(11000)).toBe(-1500);
  });

  it('reports realized payout ratio at sellout (may differ from configured)', () => {
    // 120% machine sold out in exactly one pull: spent 5000, paid 6000.
    const { machine } = createFixedOddsMachine({
      id: 'fo-realized',
      name: 'REALIZED',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: PRICE_5K,
      prizeEntries: [rfLine('a', '6000', 1, '100')],
    });
    expect(machine.configuredRtpBps).toBe(12000);
    const won = pullFixedOddsMachine(machine, PLAYER, RICH_BALANCE, () => 0.1);
    expect(won.updatedMachine.status).toBe('SOLD_OUT');
    const realized = calculateRealizedPayoutRatio(
      machine.initialPrizes,
      won.updatedMachine.remainingPrizes,
      won.updatedMachine.totalSpentUnits
    );
    expect(realized).not.toBeNull();
    expect(realized!.distributedUnits).toBe(parseRF('6000'));
    expect(realized!.ratioBps).toBe(12000);
    expect(calculateRealizedPayoutRatio(machine.initialPrizes, machine.remainingPrizes, 0n)).toBeNull();
  });

  it('live available RTP reflects only remaining prizes', () => {
    const { machine } = createFixedOddsMachine({
      id: 'fo-live',
      name: 'LIVE',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: PRICE_5K,
      prizeEntries: [rfLine('a', '100000', 1, '10'), rfLine('b', '25000', 5, '10')],
    });
    // Configured: 100000×0.10 + 25000×0.10 = 10000+2500 = 12500 → 250%.
    expect(machine.configuredRtpBps).toBe(25000);
    const afterA = machine.remainingPrizes.map((p) =>
      p.id === 'a' ? { ...p, remainingQuantity: 0 } : p
    );
    expect(calculateLiveAvailableRtpBps(afterA, PRICE_5K)).toBe(
      5000 // 25000×0.10 = 2500 → 50%
    );
  });
});

describe('Target RTP assist', () => {
  const lines = [
    { prizeEntryId: 'nft', unitRefUnits: parseRF('250000') },
    { prizeEntryId: 'big', unitRefUnits: parseRF('100000') },
    { prizeEntryId: 'mid', unitRefUnits: parseRF('25000') },
  ];

  it('suggests odds landing near an 80% target without exceeding 100%', () => {
    const { suggestions, achievedRtpBps, capped } = suggestFixedOddsPpm(8000, PRICE_5K, lines);
    expect(capped).toBe(false);
    const total = suggestions.reduce((a, s) => a + s.oddsPpm, 0);
    expect(total).toBeLessThanOrEqual(MAX_TOTAL_ODDS_PPM);
    expect(suggestions.every((s) => s.oddsPpm >= 1)).toBe(true);
    // Within a few points of target (integer-ppm approximation).
    expect(Math.abs(achievedRtpBps - 8000)).toBeLessThanOrEqual(300);
  });

  it('flags unachievable targets as capped at exactly 100%', () => {
    const { suggestions, capped } = suggestFixedOddsPpm(
      90000,
      parseRF('1000'),
      [{ prizeEntryId: 'only', unitRefUnits: parseRF('1000') }]
    );
    expect(capped).toBe(true);
    expect(suggestions.reduce((a, s) => a + s.oddsPpm, 0)).toBe(MAX_TOTAL_ODDS_PPM);
  });

  it('rejects invalid assist input', () => {
    expect(() => suggestFixedOddsPpm(0, PRICE_5K, lines)).toThrow();
    expect(() => suggestFixedOddsPpm(8000, 0n, lines)).toThrow();
    expect(() => suggestFixedOddsPpm(8000, PRICE_5K, [])).toThrow();
  });
});

describe('Monte Carlo lifetime modeling', () => {
  const demoLines = [
    { prizeEntryId: 'nft', oddsPpm: 2000, quantity: 1, referenceValueUnits: parseRF('250000') },
    { prizeEntryId: 'big', oddsPpm: 10000, quantity: 3, referenceValueUnits: parseRF('100000') },
    { prizeEntryId: 'mid', oddsPpm: 20000, quantity: 10, referenceValueUnits: parseRF('25000') },
  ];

  it('is deterministic per seed and valid across seeds', () => {
    const a = simulateFixedOddsLifetime({
      lines: demoLines,
      pullPriceUnits: PRICE_5K,
      runs: 200,
      seed: 7,
    });
    const b = simulateFixedOddsLifetime({
      lines: demoLines,
      pullPriceUnits: PRICE_5K,
      runs: 200,
      seed: 7,
    });
    expect(a).toEqual(b);
    const c = simulateFixedOddsLifetime({
      lines: demoLines,
      pullPriceUnits: PRICE_5K,
      runs: 200,
      seed: 8,
    });
    expect(c.runs).toBe(200);
    expect(c.pullsToSellout.median).toBeGreaterThan(0);
    expect(c.censoredRuns).toBe(0);
    // Ordered percentiles.
    const p = c.pullsToSellout;
    expect(p.p10).toBeLessThanOrEqual(p.p25);
    expect(p.p25).toBeLessThanOrEqual(p.median);
    expect(p.median).toBeLessThanOrEqual(p.p75);
    expect(p.p75).toBeLessThanOrEqual(p.p90);
  });

  it('never mutates the input lines', () => {
    const snapshot = JSON.stringify(demoLines, (_, v) => (typeof v === 'bigint' ? v.toString() : v));
    simulateFixedOddsLifetime({ lines: demoLines, pullPriceUnits: PRICE_5K, runs: 50, seed: 3 });
    expect(JSON.stringify(demoLines, (_, v) => (typeof v === 'bigint' ? v.toString() : v))).toBe(
      snapshot
    );
  });

  it('rejects invalid simulation input', () => {
    expect(() =>
      simulateFixedOddsLifetime({ lines: demoLines, pullPriceUnits: 0n })
    ).toThrow();
    expect(() =>
      simulateFixedOddsLifetime({ lines: demoLines, pullPriceUnits: PRICE_5K, runs: 0 })
    ).toThrow();
  });
});

describe('Fixed Odds table + inventory + dispatcher', () => {
  it('builds the player table with no-prize breakdown', () => {
    const { machine } = createFixedOddsMachine({
      id: 'fo-table',
      name: 'TABLE',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: PRICE_5K,
      prizeEntries: [nftLine('a-nft', 42n, '250000', '0.5'), rfLine('b-rf', '100000', 5, '2')],
    });
    const table = getFixedOddsTable(machine);
    expect(table.rows.map((r) => [r.prizeEntryId, r.oddsPpm, r.soldOut])).toEqual([
      ['a-nft', 5000, false],
      ['b-rf', 20000, false],
    ]);
    expect(table.baseNoPrizePpm).toBe(975000);
    expect(table.soldOutSlotPpm).toBe(0);
    expect(table.effectiveNoPrizePpm).toBe(975000);
    expect(table.prizesRemaining).toBe(6);
    expect(table.prizesInitial).toBe(6);
  });

  it('routes pulls through the pullMachine dispatcher with seeded rng', () => {
    const { machine } = createFixedOddsMachine({
      id: 'fo-dispatch',
      name: 'DISPATCH',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: PRICE_5K,
      prizeEntries: [rfLine('a', '4000', 5, '100')],
    });
    const rng = createSeedableRng(99);
    const { updatedMachine, result } = pullMachine(machine, PLAYER, RICH_BALANCE, rng);
    expect(updatedMachine.machineType).toBe('fixed_odds');
    expect(result.machineType).toBe('fixed_odds');
    expect(result.rollPpm).toBeGreaterThanOrEqual(0);
    expect(result.rollPpm).toBeLessThan(PPM_SCALE);
    expect(fixedOddsInventoryTotals(updatedMachine.remainingPrizes, true).remaining).toBe(4);
  });

  it('FRIEND FOREVER fixture is coherent at 80% configured RTP', () => {
    const { machines } = createInitialDemoMachines();
    const forever = machines.find((m) => m.id === 'demo-machine-friend-forever');
    expect(forever).toBeDefined();
    expect(forever!.machineType).toBe('fixed_odds');
    if (forever!.machineType === 'fixed_odds') {
      expect(forever!.configuredRtpBps).toBe(8000);
      expect(forever!.liveAvailableRtpBps).toBe(8000);
    }
  });
});
