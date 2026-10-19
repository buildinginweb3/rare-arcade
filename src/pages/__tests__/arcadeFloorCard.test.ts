import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { ArcadeFloor } from '../ArcadeFloor.tsx';
import { parseUsdg, formatUsdgGrouped } from '../../domain/usdg.ts';
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
  it('shows the pull cost in USDG instead of STEP UP & PULL', () => {
    const html = render([machine({ pullPriceUnits: parseUsdg('2.50') })]);
    expect(html).not.toContain('STEP UP &amp; PULL');
    expect(html).not.toContain('STEP UP & PULL');
    expect(html).toContain(`Play — ${formatUsdgGrouped(parseUsdg('2.50'))}`);
    expect(html).toContain('Play — 2.50 USDG');
  });

  it('reflects each machine\'s own pull price', () => {
    const html = render([
      machine({ id: 'a', name: 'CHEAP', pullPriceUnits: parseUsdg('1') }),
      machine({ id: 'b', name: 'PRICEY', pullPriceUnits: parseUsdg('12.50') }),
    ]);
    expect(html).toContain('Play — 1.00 USDG');
    expect(html).toContain('Play — 12.50 USDG');
  });

  it('keeps VIEW STATS on a sold-out machine (no play price)', () => {
    const html = render([machine({ status: 'SOLD_OUT' })]);
    expect(html).toContain('VIEW STATS');
    expect(html).not.toContain('Play —');
  });
});

describe('ArcadeFloor card — TOP PRIZE label', () => {
  it('reads None Left when live RTP is 0', () => {
    // Live RTP 0: no prize value remains, so "Rewards" would mislead.
    const html = render([
      machine({
        currentRtpBps: 0,
        remainingPrizes: [
          { id: 'c-0', type: 'USDG_PRIZE', amountUnits: parseUsdg('0'), initialQuantity: 1, remainingQuantity: 0 },
        ],
      }),
    ]);
    expect(html).toContain('TOP PRIZE:');
    expect(html).toContain('None Left');
    expect(html).not.toContain('>Rewards<');
  });

  it('still reads Rewards for a live machine with no top-prize visual', () => {
    // Remaining inventory exists and RTP is non-zero: keep the label.
    const html = render([
      machine({
        currentRtpBps: 1200,
        remainingPrizes: [
          { id: 'c-gone', type: 'USDG_PRIZE', amountUnits: parseUsdg('5'), initialQuantity: 1, remainingQuantity: 0 },
        ],
      }),
    ]);
    expect(html).toContain('Rewards');
    expect(html).not.toContain('None Left');
  });

  it('renders a USDG cashback top prize in USDG', () => {
    const html = render([
      machine({
        remainingPrizes: [
          { id: 'c-live', type: 'USDG_PRIZE', amountUnits: parseUsdg('25'), initialQuantity: 1, remainingQuantity: 1 },
        ],
      }),
    ]);
    expect(html).toContain('25.00 USDG');
    expect(html).not.toContain('None Left');
  });

  it('shows the real top prize when one remains, even at 0 RTP', () => {
    const html = render([
      machine({
        currentRtpBps: 0,
        remainingPrizes: [
          { id: 'rf-live', type: 'RF_PRIZE', amountUnits: parseRF('50000'), usdgValueUnits: parseUsdg('100'), initialQuantity: 1, remainingQuantity: 1 },
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
          { id: 'c-0', type: 'USDG_PRIZE', amountUnits: parseUsdg('0'), initialQuantity: 1, remainingQuantity: 0 },
        ],
      }),
    ]);
    expect(html).toContain('None Left');
    expect(html).toContain('Play —');
    expect(html).toContain('LIVE RTP');
    expect(html).toContain('0.0%');
  });
});

describe('ArcadeFloor card — paused machines (vault.ts)', () => {
  const paused = (over: Record<string, unknown> = {}) =>
    machine({ status: 'PAUSED', pausedAt: 1_700_000_000_000, ...over });

  it('never advertises a pull on a paused machine', () => {
    const html = render([paused()]);
    expect(html).not.toContain('Play —');
    // Sold out and paused are both "look, don't play" — same affordance.
    expect(html).toContain('VIEW STATS');
  });

  it('says why the machine cannot be played', () => {
    const html = render([paused()]);
    expect(html).toContain('PAUSED');
    expect(html).toContain('creator suspended pulls');
  });

  it('discloses when the pause started', () => {
    const html = render([paused()]);
    expect(html).toContain('since ');
    // The pause date is rendered, so the hold is never indefinite-looking.
    expect(html).toContain(new Date(1_700_000_000_000).toLocaleDateString());
  });

  it('still shows the prizes, because a pause is not a sellout', () => {
    const html = render([paused()]);
    // The cabinet is still stocked and viewable — only the pull is withheld.
    expect(html).toContain('LIVE RTP');
    expect(html).not.toContain('SOLD OUT');
  });

  it('does not affect a live machine sitting next to a paused one', () => {
    const html = render([paused({ id: 'a' }), machine({ id: 'b' })]);
    expect(html).toContain('PAUSED');
    expect(html).toContain('Play —');
    expect(html).toContain('VIEW STATS');
  });
});
