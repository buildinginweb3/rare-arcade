import { describe, it, expect } from 'vitest';
import { parseRtpPercentToBps, classifyRtp, TECHNICAL_MAX_RTP_BPS } from '../rtp.ts';
import { createMachine } from '../machine.ts';
import { parseRF } from '../rf.ts';
import { createSeedableRng } from '../deck.ts';
import type { PrizeEntry } from '../types.ts';

function rfPrizes(): PrizeEntry[] {
  return [
    { id: 'p1', type: 'RF_PRIZE', amountUnits: parseRF('50000'), initialQuantity: 2, remainingQuantity: 2 },
    { id: 'p2', type: 'RF_PRIZE', amountUnits: parseRF('10000'), initialQuantity: 5, remainingQuantity: 5 },
  ];
}

function buildAt(targetRtpBps: number, pullPrice = '5000') {
  return createMachine({
    id: `m-${targetRtpBps}`,
    name: 'T',
    shellId: 'CLASSIC',
    creatorAddress: '0xC',
    pullPriceUnits: parseRF(pullPrice),
    targetRtpBps,
    prizeEntries: rfPrizes(),
    rng: createSeedableRng(11),
  });
}

describe('Custom RTP parsing (rtp.ts)', () => {
  it('accepts presets and custom decimals', () => {
    expect(parseRtpPercentToBps('80')).toBe(8000);
    expect(parseRtpPercentToBps('85')).toBe(8500);
    expect(parseRtpPercentToBps('90')).toBe(9000);
    expect(parseRtpPercentToBps('95')).toBe(9500);
    expect(parseRtpPercentToBps('72.5')).toBe(7250);
    expect(parseRtpPercentToBps('97')).toBe(9700);
    expect(parseRtpPercentToBps('100')).toBe(10000);
    expect(parseRtpPercentToBps('107.5%')).toBe(10750);
    expect(parseRtpPercentToBps('125')).toBe(12500);
    expect(parseRtpPercentToBps('50')).toBe(5000);
  });

  it('rejects blank / NaN / Infinity / negative / zero', () => {
    for (const bad of ['', '   ', 'NaN', 'Infinity', '-1', '0', '0%', 'abc', '10%off']) {
      expect(() => parseRtpPercentToBps(bad)).toThrow();
    }
  });

  it('enforces only the generous technical maximum', () => {
    expect(TECHNICAL_MAX_RTP_BPS).toBe(100000);
    expect(() => parseRtpPercentToBps('1000')).not.toThrow();
    expect(() => parseRtpPercentToBps('1000.01')).toThrow();
  });
});

describe('Custom RTP machine creation', () => {
  it.each([8000, 8500, 9000, 9500, 7250, 9700, 10000, 10750, 12500])(
    'creates a machine at target %i bps with coherent economics',
    (target) => {
      const { machine } = buildAt(target);
      expect(machine.targetRtpBps).toBe(target);
      // Target vs actual stay close (integer tickets), actual is exact math.
      expect(Math.abs(machine.initialRtpBps - target)).toBeLessThanOrEqual(500);
      expect(machine.initialRtpBps).toBeGreaterThan(0);
      // Operator margin identity holds even when negative.
      expect(9500 - machine.initialRtpBps).toBeLessThanOrEqual(9500);
    }
  );

  it('supports >100% subsidized machines with negative margin + warning kind', () => {
    // Cheap pull price forces high RTP: prizes 150k RF over few pulls.
    const { machine } = createMachine({
      id: 'm-sub',
      name: 'SUB',
      shellId: 'MINI',
      creatorAddress: '0xC',
      pullPriceUnits: parseRF('1000'),
      totalPulls: 100,
      targetRtpBps: 11000,
      prizeEntries: rfPrizes(),
      rng: createSeedableRng(12),
    });
    expect(machine.initialRtpBps).toBeGreaterThan(10000);
    const w = classifyRtp(machine.initialRtpBps);
    expect(w.kind).toBe('subsidized');
    expect(w.operatorMarginBps).toBeLessThan(0);
  });

  it('classifies player-favorable (>95) and very-low RTP without blocking', () => {
    expect(classifyRtp(9700).kind).toBe('player-favorable');
    expect(classifyRtp(9000).kind).toBe('none');
    expect(classifyRtp(3500).kind).toBe('very-low');
    expect(classifyRtp(11000).kind).toBe('subsidized');
  });

  it('persists custom target RTP on the machine (no snap-back)', () => {
    const { machine } = buildAt(10750);
    expect(machine.targetRtpBps).toBe(10750);
    const serialized = JSON.stringify(machine, (_k, v) => (typeof v === 'bigint' ? { __bigint: v.toString() } : v));
    const revived = JSON.parse(serialized, (_k, v) =>
      v && typeof v === 'object' && '__bigint' in v ? BigInt((v as { __bigint: string }).__bigint) : v
    );
    expect(revived.targetRtpBps).toBe(10750);
  });
});
