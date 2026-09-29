import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { RfTokenIcon } from '../../ui/RfTokenIcon.tsx';
import { selectTopPrizeVisual } from '../topPrize.ts';
import { pullFxForShell, resultKindForPrizeType } from '../pullFx.ts';
import { PixelPullFx } from '../PixelPullFx.tsx';
import {
  isPullActive,
  isResultHidden,
  shellDurationMs,
  REVEAL_HOLD_MS,
  type PullPhase,
} from '../pullStateMachine.ts';
import { SHELL_DURATIONS } from '../PixelPullAnimation.tsx';
import type { PrizeEntry } from '../../../domain/types.ts';
import { parseRF } from '../../../domain/rf.ts';

function machineWith(prizes: PrizeEntry[]) {
  return { remainingPrizes: prizes } as { remainingPrizes: PrizeEntry[] };
}

describe('RfTokenIcon pixel art (RfTokenIcon.tsx)', () => {
  it('renders the authoritative $RF bitmap coin (no font circle)', () => {
    const html = renderToStaticMarkup(React.createElement(RfTokenIcon, { size: 64 }));
    expect(html).toContain('<svg');
    expect(html).toContain('viewBox="0 0 64 64"');
    expect(html).toContain('$RAREFRIENDS');
    // Stepped collectible silhouette colors from the authoritative art.
    expect(html).toContain('#090909');
    expect(html).toContain('#F3F1E8');
    // Bitmap $RF rects present (many ink pixels).
    const inkCount = (html.match(/fill="#090909"/g) || []).length;
    expect(inkCount).toBeGreaterThan(40);
  });

  it('renders crisply at every required size', () => {
    for (const size of [24, 32, 48, 64, 112, 144]) {
      const html = renderToStaticMarkup(React.createElement(RfTokenIcon, { size }));
      expect(html).toContain(`width="${size}"`);
      expect(html).toContain(`height="${size}"`);
      expect(html).toContain('shape-rendering="crispEdges"');
    }
  });

  it('supports decorative mode without exposing a label', () => {
    const html = renderToStaticMarkup(
      React.createElement(RfTokenIcon, { size: 32, decorative: true })
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('<title>');
  });
});

describe('selectTopPrizeVisual (topPrize.ts)', () => {
  const rfPrize: PrizeEntry = {
    id: 'rf-1',
    type: 'RF_PRIZE',
    amountUnits: parseRF('10000'),
    initialQuantity: 2,
    remainingQuantity: 2,
  };
  const friendPrize: PrizeEntry = {
    id: 'fr-1',
    type: 'FRIEND_PRIZE',
    tokenId: 1n,
    name: 'Friend #1',
    familyName: 'Generations',
    generation: 0,
    referenceValueUnits: parseRF('250000'),
    initialQuantity: 1,
    remainingQuantity: 1,
  };

  it('prefers a remaining Friend prize over RF tokens', () => {
    const visual = selectTopPrizeVisual(machineWith([rfPrize, friendPrize]));
    expect(visual.kind).toBe('nft');
  });

  it('renders the $RF coin when the top prize is RF tokens', () => {
    const visual = selectTopPrizeVisual(machineWith([rfPrize]));
    expect(visual.kind).toBe('rf');
    if (visual.kind === 'rf') {
      expect(visual.entry.amountUnits).toBe(parseRF('10000'));
    }
  });

  it('ignores depleted prizes when choosing the visual', () => {
    const deadFriend = { ...friendPrize, remainingQuantity: 0 };
    const visual = selectTopPrizeVisual(machineWith([deadFriend, rfPrize]));
    expect(visual.kind).toBe('rf');
  });

  it('falls back to the mascot only when nothing remains', () => {
    const visual = selectTopPrizeVisual(
      machineWith([
        { ...rfPrize, remainingQuantity: 0 },
        { ...friendPrize, remainingQuantity: 0 },
      ])
    );
    expect(visual.kind).toBe('mascot');
  });
});

describe('pullFxForShell (pullFx.ts) — shell identity matches pull behavior', () => {
  it('maps CLASSIC to PRIZE DRUM', () => {
    expect(pullFxForShell('CLASSIC')).toMatchObject({
      kind: 'drum',
      pickerLabel: 'PULL FX: PRIZE DRUM',
    });
  });

  it('maps CAPSULE to CAPSULE OPEN (not claw)', () => {
    expect(pullFxForShell('CAPSULE')).toMatchObject({
      kind: 'capsule',
      pickerLabel: 'PULL FX: CAPSULE OPEN',
    });
  });

  it('maps TALLBOY to CLAW GRAB (not reels)', () => {
    expect(pullFxForShell('TALLBOY')).toMatchObject({
      kind: 'claw',
      pickerLabel: 'PULL FX: CLAW GRAB',
    });
  });

  it('maps MINI to SLOT REELS (not crank)', () => {
    expect(pullFxForShell('MINI')).toMatchObject({
      kind: 'reels',
      pickerLabel: 'PULL FX: SLOT REELS',
    });
  });

  it('exposes normal-motion durations in the specified windows', () => {
    expect(pullFxForShell('CLASSIC').durationMs).toBeGreaterThanOrEqual(2300);
    expect(pullFxForShell('CLASSIC').durationMs).toBeLessThanOrEqual(2600);
    expect(pullFxForShell('CAPSULE').durationMs).toBeGreaterThanOrEqual(2700);
    expect(pullFxForShell('CAPSULE').durationMs).toBeLessThanOrEqual(3000);
    expect(pullFxForShell('TALLBOY').durationMs).toBeGreaterThanOrEqual(2900);
    expect(pullFxForShell('TALLBOY').durationMs).toBeLessThanOrEqual(3200);
    expect(pullFxForShell('MINI').durationMs).toBeGreaterThanOrEqual(2600);
    expect(pullFxForShell('MINI').durationMs).toBeLessThanOrEqual(2900);
  });
});

describe('resultKindForPrizeType (pullFx.ts) — broad hint only, never RNG', () => {
  it('maps authoritative prize types to visual hints', () => {
    expect(resultKindForPrizeType('RF_PRIZE')).toBe('rf');
    expect(resultKindForPrizeType('FRIEND_PRIZE')).toBe('nft');
    expect(resultKindForPrizeType('NO_PRIZE')).toBe('empty');
    expect(resultKindForPrizeType(null)).toBe('empty');
    expect(resultKindForPrizeType(undefined)).toBe('empty');
  });
});

describe('PixelPullFx (PixelPullFx.tsx) — inner window effects, no nested cabinet', () => {
  const BANNED = ['marquee', 'cabinet', 'coin slot', 'coin-slot', 'vending', 'button', 'marquee'];
  for (const shell of ['classic', 'capsule', 'tallboy', 'mini'] as const) {
    it(`${shell}: renders an inner stage with no second-machine markers`, () => {
      const html = renderToStaticMarkup(
        React.createElement(PixelPullFx, {
          shell,
          active: false,
          runId: 1,
          resultKind: 'empty',
          onComplete: () => undefined,
        })
      );
      expect(html).toContain('<svg');
      expect(html).toContain('viewBox="0 0 128 96"');
      const lower = html.toLowerCase();
      for (const marker of BANNED) {
        expect(lower).not.toContain(marker);
      }
    });
  }

  it('accepts every broad result kind without changing stage identity', () => {
    for (const resultKind of ['rf', 'nft', 'empty'] as const) {
      const html = renderToStaticMarkup(
        React.createElement(PixelPullFx, {
          shell: 'mini',
          active: false,
          runId: 1,
          resultKind,
          onComplete: () => undefined,
        })
      );
      expect(html).toContain('viewBox="0 0 128 96"');
    }
  });
});

describe('shared pull state machine (pullStateMachine.ts)', () => {
  it('hides the result through MACHINE_COMPLETE + REVEAL_HOLD', () => {
    const hidden: PullPhase[] = [
      'IDLE',
      'VALIDATING',
      'RESULT_PENDING',
      'ANTICIPATION',
      'MACHINE_ACTION',
      'DELIVERY',
      'MACHINE_COMPLETE',
      'REVEAL_HOLD',
    ];
    for (const phase of hidden) {
      expect(isResultHidden(phase)).toBe(true);
    }
    expect(isResultHidden('PRIZE_REVEAL')).toBe(false);
    expect(isResultHidden('RESULT_COMPLETE')).toBe(false);
  });

  it('treats exactly one pull as active (rapid-click protection)', () => {
    expect(isPullActive('IDLE')).toBe(false);
    expect(isPullActive('RESULT_COMPLETE')).toBe(false);
    expect(isPullActive('RETURN_TO_IDLE')).toBe(false);
    const active: PullPhase[] = [
      'VALIDATING',
      'RESULT_PENDING',
      'ANTICIPATION',
      'MACHINE_ACTION',
      'DELIVERY',
      'MACHINE_COMPLETE',
      'REVEAL_HOLD',
      'PRIZE_REVEAL',
    ];
    for (const phase of active) {
      expect(isPullActive(phase)).toBe(true);
    }
  });

  it('holds the finished machine briefly before reveal (180-300ms)', () => {
    expect(REVEAL_HOLD_MS).toBeGreaterThanOrEqual(180);
    expect(REVEAL_HOLD_MS).toBeLessThanOrEqual(300);
  });

  it('shell durations match the PixelPullAnimation timeline', () => {
    expect(shellDurationMs('CLASSIC', false)).toBe(SHELL_DURATIONS.base.classic);
    expect(shellDurationMs('CAPSULE', false)).toBe(SHELL_DURATIONS.base.capsule);
    expect(shellDurationMs('TALLBOY', false)).toBe(SHELL_DURATIONS.base.tallboy);
    expect(shellDurationMs('MINI', false)).toBe(SHELL_DURATIONS.base.mini);
    // Reduced motion shortens but never removes causality.
    for (const shell of ['CLASSIC', 'CAPSULE', 'TALLBOY', 'MINI'] as const) {
      const reduced = shellDurationMs(shell, true);
      const full = shellDurationMs(shell, false);
      expect(reduced).toBeGreaterThan(0);
      expect(reduced).toBeLessThan(full);
    }
  });
});
