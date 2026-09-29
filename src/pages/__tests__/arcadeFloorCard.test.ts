import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { ArcadeFloor } from '../ArcadeFloor.tsx';
import { parseRF, formatRFGrouped } from '../../domain/rf.ts';
import { createInitialDemoMachines } from '../../data/demoMachines.ts';
import type { Machine } from '../../domain/types.ts';

/**
 * Fixtures are built from the real demo machines so the card renders
 * exactly the fields the arcade page actually reads.
 */
function base(): Machine {
  const { machines } = createInitialDemoMachines();
  return machines[0]! as Machine;
}

/** Rehydrate bigint fields after the JSON round-trip. */
function rehydrate(src: Machine, over: Record<string, unknown>): Machine {
  const raw = JSON.stringify({ ...src, ...over }, (_k, v) =>
    typeof v === 'bigint' ? `BIG:${v.toString()}` : v,
  );
  return JSON.parse(raw, (_k, v) => {
    if (typeof v === 'string' && v.startsWith('BIG:')) return BigInt(v.slice(4));
    return v;
  }) as Machine;
}

const machine = (over: Record<string, unknown> = {}): Machine => rehydrate(base(), over);

const render = (machines: Machine[]) =>
  renderToStaticMarkup(
    React.createElement(ArcadeFloor, {
      machines,
      onSelectMachine: () => undefined,
      onNavigateCreate: () => undefined,
    })
  );

describe('ArcadeFloor card — pull cost on the play button', () => {
  it('shows the pull cost in RF instead of STEP UP & PULL', () => {
    const html = render([machine({ pullPriceUnits: parseRF('2500') })]);
    expect(html).not.toContain('STEP UP &amp; PULL');
    expect(html).not.toContain('STEP UP & PULL');
    expect(html).toContain(`Play — ${formatRFGrouped(parseRF('2500'))}`);
    expect(html).toContain('Play — 2,500.00 RF');
  });

  it('reflects each machine\'s own pull price', () => {
    const html = render([
      machine({ id: 'a', name: 'CHEAP', pullPriceUnits: parseRF('1000') }),
      machine({ id: 'b', name: 'PRICEY', pullPriceUnits: parseRF('12500') }),
    ]);
    expect(html).toContain('Play — 1,000.00 RF');
    expect(html).toContain('Play — 12,500.00 RF');
  });

  it('keeps VIEW STATS on a sold-out machine (no play price)', () => {
    const html = render([machine({ status: 'SOLD_OUT' })]);
    expect(html).toContain('VIEW STATS');
    expect(html).not.toContain('Play —');
  });
});

describe('ArcadeFloor card — TOP PRIZE label', () => {
  it('reads None Left when live RTP is 0', () => {
    // Live RTP 0: no prize value remains, so "Tokens" would mislead.
    const html = render([
      machine({
        currentRtpBps: 0,
        remainingPrizes: [
          { id: 'rf-0', type: 'RF_PRIZE', amountUnits: parseRF('0'), initialQuantity: 1, remainingQuantity: 0 },
        ],
      }),
    ]);
    expect(html).toContain('TOP PRIZE:');
    expect(html).toContain('None Left');
    expect(html).not.toContain('>Tokens<');
  });

  it('still reads Tokens for a live machine with no top-prize visual', () => {
    // Remaining inventory exists and RTP is non-zero: keep the old label.
    const html = render([
      machine({
        currentRtpBps: 1200,
        remainingPrizes: [
          { id: 'rf-gone', type: 'RF_PRIZE', amountUnits: parseRF('5000'), initialQuantity: 1, remainingQuantity: 0 },
        ],
      }),
    ]);
    expect(html).toContain('Tokens');
    expect(html).not.toContain('None Left');
  });

  it('shows the real top prize when one remains, even at 0 RTP', () => {
    const html = render([
      machine({
        currentRtpBps: 0,
        remainingPrizes: [
          { id: 'rf-live', type: 'RF_PRIZE', amountUnits: parseRF('50000'), initialQuantity: 1, remainingQuantity: 1 },
        ],
      }),
    ]);
    expect(html).toContain(formatRFGrouped(parseRF('50000')));
    expect(html).not.toContain('None Left');
  });
});

describe('ArcadeFloor card — the None Left card is still playable', () => {
  it('keeps the play price visible when the only remaining RTP is zero', () => {
    // A drained machine: no prize value left, but pulls are still legal,
    // so the player must still see the cost before stepping up.
    const html = render([
      machine({
        currentRtpBps: 0,
        remainingPrizes: [
          { id: 'rf-0', type: 'RF_PRIZE', amountUnits: parseRF('0'), initialQuantity: 1, remainingQuantity: 0 },
        ],
      }),
    ]);
    expect(html).toContain('None Left');
    expect(html).toContain('Play —');
    expect(html).toContain('LIVE RTP');
    expect(html).toContain('0.0%');
  });
});
