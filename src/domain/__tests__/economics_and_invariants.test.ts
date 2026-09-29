import { describe, it, expect } from 'vitest';
import {
  parseRF,
  formatRF,
  addRF,
  subRF,
  mulBps,
  calculatePullSplit,
  BURN_BPS,
} from '../rf.ts';
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

  it('calculates 5% platform burn and 95% creator split with exact conservation', () => {
    const testPrices = ['1', '5', '10', '25', '100', '0.5', '13.333'];
    for (const priceStr of testPrices) {
      const price = parseRF(priceStr);
      if (price <= 0n) continue;
      const { burnUnits, creatorUnits } = calculatePullSplit(price);
      // Invariant: burn + creator === price
      expect(burnUnits + creatorUnits).toBe(price);
      // Burn is exactly 5% (500 bps)
      expect(burnUnits).toBe(mulBps(price, BURN_BPS));
    }
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
      referenceValueUnits: 50000n, // 50 RF
      initialQuantity: 1,
      remainingQuantity: 1,
    },
    {
      id: 'p-rf-1',
      type: 'RF_PRIZE',
      amountUnits: 25000n, // 25 RF
      initialQuantity: 3,
      remainingQuantity: 3,
    },
    {
      id: 'p-rf-2',
      type: 'RF_PRIZE',
      amountUnits: 5000n, // 5 RF
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
    const rf25Tickets = deck.filter((t) => t.prizeType === 'RF_PRIZE' && t.rfAmountUnits === 25000n);
    const rf5Tickets = deck.filter((t) => t.prizeType === 'RF_PRIZE' && t.rfAmountUnits === 5000n);
    const emptyTickets = deck.filter((t) => t.prizeType === 'NO_PRIZE');

    expect(friendTickets.length).toBe(1);
    expect(rf25Tickets.length).toBe(3);
    expect(rf5Tickets.length).toBe(10);
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
    // 900 RF total prizes, 100 pulls, 10 RF pull price
    // EV = 900 / 100 = 9 RF
    // RTP = 9 / 10 = 90% (9000 bps)
    const prizeUnits = parseRF('900');
    const pullPrice = parseRF('10');
    const totalPulls = 100;

    const ev = calculateEv(prizeUnits, totalPulls);
    expect(ev).toBe(parseRF('9'));

    const rtpBps = calculateRtpBps(ev, pullPrice);
    expect(rtpBps).toBe(9000);
  });

  it('solves recommended pulls given target RTP', () => {
    const prizeUnits = parseRF('900');
    const pullPrice = parseRF('10');
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
        referenceValueUnits: 50000n,
        initialQuantity: 1,
        remainingQuantity: 1,
      },
      {
        id: 'p2',
        type: 'RF_PRIZE',
        amountUnits: 10000n,
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
    const pullPrice = parseRF('10');
    const initialPrizes: PrizeEntry[] = [
      {
        id: 'p1',
        type: 'RF_PRIZE',
        amountUnits: parseRF('850'),
        initialQuantity: 1,
        remainingQuantity: 1,
      },
    ];
    // 850 RF prize, 100 pulls at 10 RF = 1000 RF gross
    // RTP = 850 / 1000 = 85%
    // Platform burn = 5%
    // Operator margin = 95% - 85% = 10%
    const econ = calculateMachineEconomics(initialPrizes, initialPrizes, pullPrice, 100, 100);
    expect(econ.initialRtpBps).toBe(8500);
    expect(econ.initialOperatorMarginBps).toBe(1000); // 10%
  });
});

describe('Machine Lifecycle & State Invariants (machine.ts)', () => {
  function createTestMachine(seed = 42) {
    const rng = createSeedableRng(seed);
    const prizes: PrizeEntry[] = [
      {
        id: 'rf-1',
        type: 'RF_PRIZE',
        amountUnits: parseRF('50'),
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
        referenceValueUnits: parseRF('40'),
        initialQuantity: 1,
        remainingQuantity: 1,
      },
    ];
    // Total prize value: 90 RF. Pull price: 10 RF. Total pulls: 10. Initial RTP = 90%.
    return createMachine({
      name: 'Test Machine',
      shellId: 'CLASSIC',
      creatorAddress: '0xCreator',
      pullPriceUnits: parseRF('10'),
      totalPulls: 10,
      prizeEntries: prizes,
      rng,
    });
  }

  it('locks machine economics and rules after the first pull', () => {
    const { machine } = createTestMachine();
    expect(machine.isRulesLocked).toBe(false);
    expect(machine.pullCount).toBe(0);

    const playerBal = parseRF('100');
    const { updatedMachine } = pullMachine(machine, '0xPlayer', playerBal);

    expect(updatedMachine.isRulesLocked).toBe(true);
    expect(updatedMachine.pullCount).toBe(1);
    expect(updatedMachine.status).toBe('LIVE');
  });

  it('prevents cancellation once pulls have started', () => {
    const { machine } = createTestMachine();
    const playerBal = parseRF('100');
    const { updatedMachine } = pullMachine(machine, '0xPlayer', playerBal);

    expect(() => cancelMachine(updatedMachine)).toThrow(/Cannot cancel a machine after pulls have started/);
  });

  it('allows cancellation before first pull and refunds seeded escrow exactly', () => {
    const { machine, seededRfEscrowUnits, seededFriends } = createTestMachine();
    expect(seededRfEscrowUnits).toBe(parseRF('50'));
    expect(seededFriends.length).toBe(1);

    const { cancelledMachine, refundRfUnits, refundFriends } = cancelMachine(machine);
    expect(cancelledMachine.status).toBe('CANCELLED');
    expect(refundRfUnits).toBe(seededRfEscrowUnits);
    expect(refundFriends.length).toBe(1);
    expect(refundFriends[0]?.tokenId).toBe(777n);
  });

  it('rejects pulls if player has insufficient demo RF', () => {
    const { machine } = createTestMachine();
    const lowBalance = parseRF('5'); // pull price is 10
    expect(() => pullMachine(machine, '0xPlayer', lowBalance)).toThrow(/Insufficient demo RF/);
  });

  it('transitions to SOLD_OUT when all pulls are consumed and rejects further pulls', () => {
    let { machine } = createTestMachine();
    let playerBal = parseRF('1000');

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

  it('tracks cumulative volume, burn, and creator receipts precisely across pulls', () => {
    let { machine } = createTestMachine();
    let playerBal = parseRF('500');

    const pullCount = 5;
    for (let i = 0; i < pullCount; i++) {
      const res = pullMachine(machine, '0xPlayer', playerBal);
      machine = res.updatedMachine;
    }

    const expectedSpent = parseRF('10') * BigInt(pullCount); // 50 RF
    const expectedBurn = parseRF('2.5'); // 5% of 50 = 2.5 RF (2500 units)
    const expectedCreator = parseRF('47.5'); // 95% of 50 = 47.5 RF (47500 units)

    expect(machine.totalSpentUnits).toBe(expectedSpent);
    expect(machine.totalBurnedUnits).toBe(expectedBurn);
    expect(machine.creatorReceiptsUnits).toBe(expectedCreator);
    expect(machine.totalBurnedUnits + machine.creatorReceiptsUnits).toBe(machine.totalSpentUnits);
  });
});
