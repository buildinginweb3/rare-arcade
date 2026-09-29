// renderArcadeFloorScenes.test.ts (vitest)
//
// Renders the arcade floor to standalone HTML for screenshot QA.
// Runs under vitest because Playwright's component transform cannot
// server-render React.

import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ArcadeFloor } from '../ArcadeFloor.tsx';
import { createInitialDemoMachines } from '../../data/demoMachines.ts';
import { parseRF } from '../../domain/rf.ts';
import type { Machine } from '../../domain/types.ts';

const OUT = 'screenshots/arcadefloor';

const CSS = `
  :root{--font-display:monospace;--font-lcd:monospace;--font-body:monospace;
    --color-black:#000;--color-white:#fff;--color-lcd-bg:#f5f5ee;--color-lcd-dim:#e4e4dc;
    --shadow-chunky:3px 3px 0px var(--color-black);}
  *{box-sizing:border-box}
  body{margin:0;background:#7a7a74;font-family:monospace}
  .pixel-btn{background:var(--color-white);border:3px solid var(--color-black);
    box-shadow:var(--shadow-chunky);font-family:var(--font-display);cursor:pointer}
  .pixel-panel{background:var(--color-white);border:3px solid var(--color-black);
    box-shadow:var(--shadow-chunky);padding:12px}
  .cabinet-screen-bezel{background:var(--color-black);padding:8px}
  .cabinet-lcd-screen{background:var(--color-lcd-bg);display:flex;align-items:center;justify-content:center}
`;

const page = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${body}</body></html>`;

function rehydrate(src: Machine, over: Record<string, unknown>): Machine {
  const raw = JSON.stringify({ ...src, ...over }, (_k, v) =>
    typeof v === 'bigint' ? `BIG:${v.toString()}` : v,
  );
  return JSON.parse(raw, (_k, v) =>
    typeof v === 'string' && v.startsWith('BIG:') ? BigInt(v.slice(4)) : v,
  ) as Machine;
}

it('renders arcade floor QA scenes to HTML', () => {
  mkdirSync(OUT, { recursive: true });
  const { machines } = createInitialDemoMachines();
  const base = machines[0]! as Machine;

  const write = (name: string, list: Machine[]) => {
    writeFileSync(
      `${OUT}/${name}.html`,
      page(
        renderToStaticMarkup(
          React.createElement(ArcadeFloor, {
            machines: list,
            onSelectMachine: () => undefined,
            onNavigateCreate: () => undefined,
          }),
        ),
      ),
    );
  };

  // Normal floor: play price on the button, real top prize.
  write('floor-normal', [
    rehydrate(base, { pullPriceUnits: parseRF('2500'), currentRtpBps: 1200 }),
  ]);

  // Drained machine: live RTP 0, so the top prize must not claim tokens.
  write('floor-rtp-zero', [
    rehydrate(base, {
      pullPriceUnits: parseRF('2500'),
      currentRtpBps: 0,
      remainingPrizes: [
        { id: 'rf-0', type: 'RF_PRIZE', amountUnits: parseRF('0'), initialQuantity: 1, remainingQuantity: 0 },
      ],
    }),
  ]);

  // Side by side: healthy machine next to a drained one.
  write('floor-mixed', [
    rehydrate(base, { id: 'live', name: 'FRIEND FRENZY', pullPriceUnits: parseRF('2500'), currentRtpBps: 1200 }),
    rehydrate(base, {
      id: 'dry',
      name: 'DRAINED',
      pullPriceUnits: parseRF('12500'),
      currentRtpBps: 0,
      remainingPrizes: [
        { id: 'rf-0', type: 'RF_PRIZE', amountUnits: parseRF('0'), initialQuantity: 1, remainingQuantity: 0 },
      ],
    }),
  ]);

  expect(true).toBe(true);
});
