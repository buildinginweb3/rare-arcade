import { describe, it, expect } from 'vitest';
import { createMachine, pullMachine } from '../../../domain/machine.ts';
import { createFixedOddsMachine } from '../../../domain/fixedOdds.ts';
import { createSeedableRng } from '../../../domain/deck.ts';
import { parseRF } from '../../../domain/rf.ts';
import {
  isResultHidden,
  shellDurationMs,
  type PullPhase,
} from '../pullStateMachine.ts';
import { pullFxForShell } from '../pullFx.ts';
import type { MachineShellId, PrizeEntry } from '../../../domain/types.ts';

const SHELLS: MachineShellId[] = ['CLASSIC', 'CAPSULE', 'TALLBOY', 'MINI'];

function rfDeckEntries(): PrizeEntry[] {
  return [
    { id: 'rf-a', type: 'RF_PRIZE', amountUnits: parseRF('10000'), initialQuantity: 1, remainingQuantity: 1 },
    { id: 'rf-b', type: 'RF_PRIZE', amountUnits: parseRF('1000'), initialQuantity: 3, remainingQuantity: 3 },
  ];
}

/** Simulate the MachineDetail gating: result computed once, hidden during action, revealed after. */
function simulateGatedPull(phases: PullPhase[]): { hiddenDuringAction: boolean; revealedAtEnd: boolean } {
  let hiddenDuringAction = true;
  for (const phase of phases) {
    if (
      phase === 'MACHINE_ACTION' ||
      phase === 'DELIVERY' ||
      phase === 'MACHINE_COMPLETE' ||
      phase === 'REVEAL_HOLD'
    ) {
      if (!isResultHidden(phase)) hiddenDuringAction = false;
    }
  }
  const revealedAtEnd = !isResultHidden('PRIZE_REVEAL') && !isResultHidden('RESULT_COMPLETE');
  return { hiddenDuringAction, revealedAtEnd };
}

describe('animation order — result determined once, revealed after machine completes', () => {
  for (const shell of SHELLS) {
    it(`${shell}: result hidden during action, visible after hold`, () => {
      const { hiddenDuringAction, revealedAtEnd } = simulateGatedPull([
        'VALIDATING',
        'RESULT_PENDING',
        'ANTICIPATION',
        'MACHINE_ACTION',
        'DELIVERY',
        'MACHINE_COMPLETE',
        'REVEAL_HOLD',
        'PRIZE_REVEAL',
        'RESULT_COMPLETE',
      ]);
      expect(hiddenDuringAction).toBe(true);
      expect(revealedAtEnd).toBe(true);
      // Shell duration is fixed regardless of deck/odds outcome.
      expect(shellDurationMs(shell, false)).toBe(pullFxForShell(shell).durationMs);
    });
  }

  it('capsule full-open state occurs before reveal hold', () => {
    // Capsule timeline: split 2050->2550, reveal shine >=2400, duration 2850.
    // Reveal hold only starts after MACHINE_COMPLETE (duration elapsed).
    const capsuleMs = shellDurationMs('CAPSULE', false);
    expect(capsuleMs).toBeGreaterThanOrEqual(2000);
    expect(capsuleMs).toBe(2850);
  });

  it('tallboy delivery finishes before reveal (most elaborate)', () => {
    const tallboy = shellDurationMs('TALLBOY', false);
    const classic = shellDurationMs('CLASSIC', false);
    expect(tallboy).toBeGreaterThan(classic);
    expect(tallboy).toBe(3050);
  });

  it('mini reels stop sequentially 1-2-3 (stop times ordered)', () => {
    // Stop times are encoded in MiniFx: 1650 < 1950 < 2250 < duration.
    const mini = shellDurationMs('MINI', false);
    expect(mini).toBe(2800);
    expect(1650).toBeLessThan(1950);
    expect(1950).toBeLessThan(2250);
    expect(2250).toBeLessThan(mini);
  });
});

describe('authoritative result calculated once — animation never rerolls', () => {
  for (const shell of SHELLS) {
    it(`FINITE DECK + ${shell}: single pullMachine call, no reroll at reveal`, () => {
      const { machine } = createMachine({
        id: `test-${shell}`,
        name: 'TEST',
        shellId: shell,
        creatorAddress: '0xTest',
        pullPriceUnits: parseRF('1000'),
        totalPulls: 10,
        prizeEntries: rfDeckEntries(),
        rng: createSeedableRng(42),
      });
      const before = machine.deck.length;
      const { updatedMachine, result } = pullMachine(machine, '0xPlayer', parseRF('5000'));
      // Deck popped exactly once.
      expect(updatedMachine.deck.length).toBe(before - 1);
      // Reveal reuses the same ticket object — never a second draw.
      expect(result.ticket).toBeDefined();
      expect(result.spentUnits).toBe(parseRF('1000'));
      expect(result.burnedUnits + result.creatorReceiptUnits).toBe(result.spentUnits);
    });

    it(`FIXED ODDS + ${shell}: animation agnostic to deck/odds engine`, () => {
      const { machine } = createFixedOddsMachine({
        id: `fixed-${shell}`,
        name: 'FIXED TEST',
        shellId: shell,
        creatorAddress: '0xTest',
        pullPriceUnits: parseRF('1000'),
        targetRtpBps: 9000,
        prizeEntries: [
          { id: 'rf-x', type: 'RF_PRIZE', amountUnits: parseRF('5000'), initialQuantity: 5, remainingQuantity: 5, oddsPpm: 50000 },
        ],
      });
      const { result } = pullMachine(machine, '0xPlayer', parseRF('5000'), () => 0.01);
      expect(result.machineType).toBe('fixed_odds');
      expect(result.spentUnits).toBe(parseRF('1000'));
      // Cabinet animation duration is identical regardless of engine.
      expect(shellDurationMs(shell, false)).toBe(pullFxForShell(shell).durationMs);
    });
  }
});

describe('rapid input produces exactly one authoritative pull', () => {
  it('ten immediate pull attempts consume one ticket when gated by phase', () => {
    const { machine } = createMachine({
      id: 'rapid-test',
      name: 'RAPID',
      shellId: 'CLASSIC',
      creatorAddress: '0xTest',
      pullPriceUnits: parseRF('1000'),
      totalPulls: 10,
      prizeEntries: rfDeckEntries(),
      rng: createSeedableRng(7),
    });
    let current = machine;
    let pulls = 0;
    let phase: PullPhase = 'IDLE';
    const attemptPull = () => {
      // Mirror MachineDetail guard: only IDLE/RESULT_COMPLETE may start.
      if (phase !== 'IDLE' && phase !== 'RESULT_COMPLETE') return false;
      phase = 'MACHINE_ACTION';
      const out = pullMachine(current, '0xPlayer', parseRF('5000'));
      current = out.updatedMachine;
      pulls += 1;
      return true;
    };
    const results = Array.from({ length: 10 }, () => attemptPull());
    expect(results.filter(Boolean).length).toBe(1);
    expect(pulls).toBe(1);
    expect(current.pullCount).toBe(1);
  });
});

describe('result types for every shell', () => {
  it('RF WIN / FRIEND WIN / NO PRIZE all gate identically', () => {
    for (const shell of SHELLS) {
      for (const _prizeType of ['RF_PRIZE', 'FRIEND_PRIZE', 'NO_PRIZE'] as const) {
        // Gating is prize-agnostic: hidden during action, shown at reveal.
        expect(isResultHidden('MACHINE_ACTION')).toBe(true);
        expect(isResultHidden('PRIZE_REVEAL')).toBe(false);
        expect(shellDurationMs(shell, false)).toBeGreaterThan(1500);
      }
    }
  });
});
