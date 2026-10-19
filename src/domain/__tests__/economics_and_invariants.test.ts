import { describe, it, expect } from 'vitest';
import { parseRF, formatRF, addRF, subRF, mulBps } from '../rf.ts';
import { parseUsdg, formatUsdg, addUsdg, subUsdg, rfToUsdgUnits } from '../usdg.ts';
import {
  calculatePullSplit,
  splitPlatformFee,
  PLATFORM_FEE_BPS,
  FEE_PRIMARY_SHARE_BPS,
  PLATFORM_PRIMARY_WALLET,
  RF_BURN_SINK,
} from '../fees.ts';
import {
  calculateEv,
  calculateRtpBps,
  solveRecommendedPulls,
  calculateLiveOdds,
  calculateMachineEconomics,
} from '../economics.ts';
import { generateTicketDeck, createSeedableRng } from '../deck.ts';
import { createMachine, pullMachine, cancelMachine } from '../machine.ts';
import type { PrizeEntry } from '../types.ts';

describe('Fixed-Point RF Math (rf.ts)', () => {
  it('parses RF strings and numbers into integer units', () => {
    expect(parseRF('1')).toBe(1000n);
    expect(parseRF('10')).toBe(10000n);
    expect(parseRF('0.5')).toBe(500n);
    expect(parseRF('0.001')).toBe(1n);
    expect(parseRF(100)).toBe(100000n);
    expect(parseRF(0)).toBe(0n);
  });

  it('formats RF units into strings accurately', () => {
    expect(formatRF(10000n)).toBe('10.00');
    expect(formatRF(500n)).toBe('0.50');
    expect(formatRF(1000n, { showSymbol: true })).toBe('1.00 RF');
    expect(formatRF(1500n, { trimZeros: true })).toBe('1.5');
  });

  it('performs exact addition and subtraction without float drift', () => {
    const a = parseRF('10.5');
    const b = parseRF('4.25');
    const sum = addRF(a, b);
    expect(sum).toBe(14750n);
    expect(subRF(sum, b)).toBe(a);
  });

  it('prevents RF underflow below zero', () => {
    expect(() => subRF(100n, 200n)).toThrow(RangeError);
  });
});

describe('Fixed-Point USDG Math (usdg.ts)', () => {
  it('parses USDG strings into 6-decimal base units', () => {
    expect(parseUsdg('1')).toBe(1_000_000n);
    expect(parseUsdg('10')).toBe(10_000_000n);
    expect(parseUsdg('0.5')).toBe(500_000n);
    expect(parseUsdg('0.000001')).toBe(1n);
    expect(parseUsdg(100)).toBe(100_000_000n);
    expect(parseUsdg(0)).toBe(0n);
  });

  it('rejects sub-wei precision instead of silently truncating it', () => {
    expect(() => parseUsdg('0.0000001')).toThrow(/at most 6 decimal places/);
  });

  it('formats USDG units accurately', () => {
    expect(formatUsdg(10_000_000n)).toBe('10.00');
    expect(formatUsdg(500_000n)).toBe('0.50');
    expect(formatUsdg(1_000_000n, { showSymbol: true })).toBe('1.00 USDG');
    expect(formatUsdg(1n, { decimals: 6 })).toBe('0.000001');
  });

  it('performs exact addition and subtraction without float drift', () => {
    const a = parseUsdg('10.5');
    const b = parseUsdg('4.25');
    const sum = addUsdg(a, b);
    expect(sum).toBe(parseUsdg('14.75'));
    expect(subUsdg(sum, b)).toBe(a);
  });

  it('prevents USDG underflow below zero', () => {
    expect(() => subUsdg(100n, 200n)).toThrow(RangeError);
  });

  it('values RF at a locked USDG rate', () => {
    // 1 RF at $0.002 = 2,000 USDG base units.
    expect(rfToUsdgUnits(parseRF('1'), '0.002')).toBe(2_000n);
    expect(rfToUsdgUnits(parseRF('12500'), '0.002')).toBe(25_000_000n);
    expect(() => rfToUsdgUnits(parseRF('1'), '0')).toThrow();
    expect(() => rfToUsdgUnits(parseRF('1'), 'abc')).toThrow();
  });
});

describe('Platform Fee Routing (fees.ts)', () => {
  it('charges exactly 5% and conserves the spend across fee + creator', () => {
    const testPrices = ['1', '5', '10', '25', '100', '0.5', '13.333'];
    for (const priceStr of testPrices) {
      const price = parseUsdg(priceStr);
      if (price <= 0n) continue;
      const { feeUnits, creatorUnits } = calculatePullSplit(price);
      expect(feeUnits + creatorUnits).toBe(price);
      expect(feeUnits).toBe(mulBps(price, PLATFORM_FEE_BPS));
      expect(creatorUnits).toBe(price - feeUnits);
    }
  });

  it('splits the fee 75/25 and conserves it exactly', () => {
    for (const feeStr of ['0.01', '0.5', '5', '100', '1234.567891']) {
      const fee = parseUsdg(feeStr);
      const { primaryUnits, buybackUnits } = splitPlatformFee(fee);
      // No dust: the two shares always reconstruct the fee exactly.
      expect(primaryUnits + buybackUnits).toBe(fee);
      expect(primaryUnits).toBe(mulBps(fee, FEE_PRIMARY_SHARE_BPS));
      // 75/25 split is within one base unit of exact.
      const ratio = (primaryUnits * 10000n) / fee;
      expect(ratio).toBeGreaterThanOrEqual(7_498n);
      expect(ratio).toBeLessThanOrEqual(7_502n);
    }
  });

  it('routes 75% to the treasury and accrues 25% to the RF buyback pot', () => {
    const split = calculatePullSplit(parseUsdg('100'));
    expect(split.feeUnits).toBe(parseUsdg('5'));
    expect(split.primaryFeeUnits).toBe(parseUsdg('3.75'));
    expect(split.buybackFeeUnits).toBe(parseUsdg('1.25'));
    expect(split.creatorUnits).toBe(parseUsdg('95'));

    // Treasury + buyback pot + creator === spend.
    expect(
      split.primaryFeeUnits + split.buybackFeeUnits + split.creatorUnits
    ).toBe(parseUsdg('100'));
    expect(PLATFORM_PRIMARY_WALLET).toBe('0x927A1799125EAE57B6BDc573Ee5e0354cD343Db1');
    expect(RF_BURN_SINK.toLowerCase()).toBe('0x000000000000000000000000000000000000dead');
  });

  it('never strands or mints fee value', () => {
    const split = calculatePullSplit(parseUsdg('100'));
    // The full fee is accounted for; it is later spent buying RF, not lost.
    expect(split.primaryFeeUnits + split.buybackFeeUnits).toBe(split.feeUnits);
  });

  it('rejects a non-positive pull price', () => {
    expect(() => calculatePullSplit(0n)).toThrow(RangeError);
    expect(() => calculatePullSplit(-1n)).toThrow(RangeError);
  });
});

describe('Finite Ticket Deck & RNG (deck.ts)', () => {
  const dummyPrizes: PrizeEntry[] = [
    {
      id: 'p-friend-1',
      type: 'FRIEND_PRIZE',
      tokenId: 101n,
      name: 'Pixel Skeleton',
      familyName: 'Skeleton',
      generation: 1,
      spriteRows: Array(16).fill('################'),
      usdgValueUnits: 50_000_000n, // $50 USDG
      initialQuantity: 1,
      remainingQuantity: 1,
    },
    {
      id: 'p-usdg-1',
      type: 'USDG_PRIZE',
      amountUnits: 25_000_000n, // $25 USDG
      initialQuantity: 3,
      remainingQuantity: 3,
    },
    {
      id: 'p-usdg-2',
      type: 'USDG_PRIZE',
      amountUnits: 5_000_000n, // $5 USDG
      initialQuantity: 10,
      remainingQuantity: 10,
    },
  ];

  it('generates a deck where ticket count strictly equals totalPulls', () => {
    const totalPulls = 100;
    const rng = createSeedableRng(42);
    const deck = generateTicketDeck(dummyPrizes, totalPulls, rng);
    expect(deck.length).toBe(totalPulls);
  });

  it('contains exact prize quantities in the deck', () => {
    const totalPulls = 50;
    const rng = createSeedableRng(12345);
    const deck = generateTicketDeck(dummyPrizes, totalPulls, rng);

    const friendTickets = deck.filter((t) => t.prizeType === 'FRIEND_PRIZE');
    const usd25Tickets = deck.filter(
      (t) => t.prizeType === 'USDG_PRIZE' && t.usdgAmountUnits === 25_000_000n
    );
    const usd5Tickets = deck.filter(
      (t) => t.prizeType === 'USDG_PRIZE' && t.usdgAmountUnits === 5_000_000n
    );
    const emptyTickets = deck.filter((t) => t.prizeType === 'NO_PRIZE');

    expect(friendTickets.length).toBe(1);
    expect(usd25Tickets.length).toBe(3);
    expect(usd5Tickets.length).toBe(10);
    expect(emptyTickets.length).toBe(50 - 1 - 3 - 10);
  });

  it('guarantees unique NFT is not duplicated', () => {
    const duplicatePrizes: PrizeEntry[] = [
      dummyPrizes[0]!,
      { ...dummyPrizes[0]!, id: 'duplicate-token' },
    ];
    expect(() => generateTicketDeck(duplicatePrizes, 100)).toThrow(/Duplicate unique Rare Friend/);
  });
});

describe('Economics Engine & Invariants (economics.ts)', () => {
  it('correctly calculates initial EV and RTP', () => {
    // $900 total prizes, 100 pulls, $10 pull price
    // EV = 900 / 100 = $9
    // RTP = 9 / 10 = 90% (9000 bps)
    const prizeUnits = parseUsdg('900');
    const pullPrice = parseUsdg('10');
    const totalPulls = 100;

    const ev = calculateEv(prizeUnits, totalPulls);
    expect(ev).toBe(parseUsdg('9'));

    const rtpBps = calculateRtpBps(ev, pullPrice);
    expect(rtpBps).toBe(9000);
  });

  it('solves recommended pulls given target RTP', () => {
    const prizeUnits = parseUsdg('900');
    const pullPrice = parseUsdg('10');
    const targetRtp = 9000; // 90%

    const solved = solveRecommendedPulls(prizeUnits, pullPrice, targetRtp, 10);
    expect(solved.recommendedPulls).toBe(100);
    expect(solved.actualRtpBps).toBe(9000);
  });

  it('live odds sum to exactly 100%', () => {
    const remainingPrizes: PrizeEntry[] = [
      {
        id: 'p1',
        type: 'FRIEND_PRIZE',
        tokenId: 1n,
        name: 'Friend',
        familyName: 'Mask',
        generation: 1,
        spriteRows: [],
        usdgValueUnits: 50_000_000n,
        initialQuantity: 1,
        remainingQuantity: 1,
      },
      {
        id: 'p2',
        type: 'USDG_PRIZE',
        amountUnits: 10_000_000n,
        initialQuantity: 5,
        remainingQuantity: 5,
      },
    ];
    const remainingPulls = 50;
    const odds = calculateLiveOdds(remainingPrizes, remainingPulls);

    const totalBps = odds.reduce((acc, o) => acc + o.probabilityBps, 0);
    expect(totalBps).toBe(10000); // 100.00%
  });

  it('modeled operator margin equals 95% - RTP', () => {
    const pullPrice = parseUsdg('10');
    const initialPrizes: PrizeEntry[] = [
      {
        id: 'p1',
        type: 'USDG_PRIZE',
        amountUnits: parseUsdg('850'),
        initialQuantity: 1,
        remainingQuantity: 1,
      },
    ];
    // $850 prize, 100 pulls at $10 = $1,000 gross
    // RTP = 850 / 1000 = 85%
    // Platform fee = 5%
    // Operator margin = 95% - 85% = 10%
    const econ = calculateMachineEconomics(initialPrizes, initialPrizes, pullPrice, 100, 100);
    expect(econ.initialRtpBps).toBe(8500);
    expect(econ.initialOperatorMarginBps).toBe(1000); // 10%
  });
});

describe('Machine Lifecycle & State Invariants (machine.ts)', () => {
  function createTestMachine(seed = 42) {
    const rng = createSeedableRng(seed);
    // Mixes USDG cashback, RF cashback, and an NFT so both cashback
    // escrows are exercised. RF is valued in USDG at a locked $0.002/RF.
    const prizes: PrizeEntry[] = [
      {
        id: 'usdg-1',
        type: 'USDG_PRIZE',
        amountUnits: parseUsdg('30'),
        initialQuantity: 1,
        remainingQuantity: 1,
      },
      {
        id: 'rf-1',
        type: 'RF_PRIZE',
        amountUnits: parseRF('10000'), // 10,000 RF
        usdgValueUnits: parseUsdg('20'), // 10,000 RF @ $0.002 = $20
        rfPriceUsdg: '0.002',
        initialQuantity: 1,
        remainingQuantity: 1,
      },
      {
        id: 'friend-1',
        type: 'FRIEND_PRIZE',
        tokenId: 777n,
        name: 'Lucky Friend',
        familyName: 'Colossus',
        generation: 1,
        spriteRows: Array(16).fill('................'),
        usdgValueUnits: parseUsdg('40'),
        initialQuantity: 1,
        remainingQuantity: 1,
      },
    ];
    // Total prize value: $90. Pull price: $10. Total pulls: 10. RTP = 90%.
    return createMachine({
      name: 'Test Machine',
      shellId: 'CLASSIC',
      creatorAddress: '0xCreator',
      pullPriceUnits: parseUsdg('10'),
      totalPulls: 10,
      prizeEntries: prizes,
      rng,
    });
  }

  it('locks machine economics and rules after the first pull', () => {
    const { machine } = createTestMachine();
    expect(machine.isRulesLocked).toBe(false);
    expect(machine.pullCount).toBe(0);

    const playerBal = parseUsdg('100');
    const { updatedMachine } = pullMachine(machine, '0xPlayer', playerBal);

    expect(updatedMachine.isRulesLocked).toBe(true);
    expect(updatedMachine.pullCount).toBe(1);
    expect(updatedMachine.status).toBe('LIVE');
  });

  it('prevents cancellation once pulls have started', () => {
    const { machine } = createTestMachine();
    const playerBal = parseUsdg('100');
    const { updatedMachine } = pullMachine(machine, '0xPlayer', playerBal);

    expect(() => cancelMachine(updatedMachine)).toThrow(/Cannot cancel a machine after pulls have started/);
  });

  it('allows cancellation before first pull and refunds seeded escrow exactly', () => {
    const { machine, seededUsdgEscrowUnits, seededRfEscrowUnits, seededFriends } =
      createTestMachine();
    expect(seededUsdgEscrowUnits).toBe(parseUsdg('30'));
    expect(seededRfEscrowUnits).toBe(parseRF('10000'));
    expect(seededFriends.length).toBe(1);

    // Cancel refunds BOTH escrows separately — the currencies never merge.
    const { cancelledMachine, refundUsdgUnits, refundRfUnits, refundFriends } =
      cancelMachine(machine);
    expect(cancelledMachine.status).toBe('CANCELLED');
    expect(refundUsdgUnits).toBe(seededUsdgEscrowUnits);
    expect(refundRfUnits).toBe(seededRfEscrowUnits);
    expect(refundFriends.length).toBe(1);
    expect(refundFriends[0]?.tokenId).toBe(777n);
  });

  it('rejects pulls if the player has insufficient USDG', () => {
    const { machine } = createTestMachine();
    const lowBalance = parseUsdg('5'); // pull price is $10
    expect(() => pullMachine(machine, '0xPlayer', lowBalance)).toThrow(/Insufficient USDG/);
  });

  it('transitions to SOLD_OUT when all pulls are consumed and rejects further pulls', () => {
    let { machine } = createTestMachine();
    let playerBal = parseUsdg('1000');

    // Pull 10 times until exhausted
    for (let i = 0; i < 10; i++) {
      const res = pullMachine(machine, '0xPlayer', playerBal);
      machine = res.updatedMachine;
      playerBal -= machine.pullPriceUnits;
    }

    expect(machine.remainingPulls).toBe(0);
    expect(machine.status).toBe('SOLD_OUT');
    expect(machine.deck.length).toBe(0);

    // Further pull must fail
    expect(() => pullMachine(machine, '0xPlayer', playerBal)).toThrow(/SOLD OUT/);
  });

  it('tracks cumulative volume, platform fees, and creator receipts precisely', () => {
    let { machine } = createTestMachine();
    const playerBal = parseUsdg('500');

    const pullCount = 5;
    for (let i = 0; i < pullCount; i++) {
      const res = pullMachine(machine, '0xPlayer', playerBal);
      machine = res.updatedMachine;
    }

    const expectedSpent = parseUsdg('10') * BigInt(pullCount); // $50
    const expectedFee = parseUsdg('2.5'); // 5% of $50
    const expectedCreator = parseUsdg('47.5'); // 95% of $50

    expect(machine.totalSpentUnits).toBe(expectedSpent);
    expect(machine.totalPlatformFeeUnits).toBe(expectedFee);
    expect(machine.creatorReceiptsUnits).toBe(expectedCreator);
    expect(machine.totalPlatformFeeUnits + machine.creatorReceiptsUnits).toBe(
      machine.totalSpentUnits
    );

    // Cumulative fee is fully accounted for by the treasury + buyback shares —
    // nothing is created or lost.
    expect(machine.primaryFeeUnits + machine.buybackFeeUnits).toBe(
      machine.totalPlatformFeeUnits
    );
  });

  it('pays USDG cashback and RF cashback into separate balances', () => {
    const { machine } = createTestMachine();
    const playerBal = parseUsdg('1000');

    // Draw every ticket so both cashback currencies must have been paid.
    let m = machine;
    let sawUsdg = 0n;
    let sawRf = 0n;
    for (let i = 0; i < 10 && m.remainingPulls > 0; i++) {
      const res = pullMachine(m, '0xPlayer', playerBal);
      m = res.updatedMachine;
      sawUsdg += res.result.usdgWonUnits;
      sawRf += res.result.rfWonUnits;
    }

    expect(sawUsdg).toBe(parseUsdg('30'));
    expect(sawRf).toBe(parseRF('10000'));
    expect(m.usdgPrizesPaidUnits).toBe(sawUsdg);
    expect(m.rfPrizesPaidUnits).toBe(sawRf);
  });
});
