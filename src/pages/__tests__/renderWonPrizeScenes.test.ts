// renderWonPrizeScenes.test.ts (vitest)
//
// Renders the MY PRIZES showcase to standalone HTML for screenshot QA.
// Runs under vitest because Playwright's component transform cannot
// server-render React.

import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerInventoryPage } from '../PlayerInventoryPage.tsx';
import { parseRF } from '../../domain/rf.ts';
import type { PlayerInventory, PullResult, PrizeType } from '../../domain/types.ts';

const OUT = 'screenshots/wonprizes';

const CSS = `
  :root{
    --font-display:monospace; --font-lcd:monospace;
    --color-black:#000; --color-white:#fff; --color-lcd-bg:#f5f5ee;
    --shadow-chunky:3px 3px 0px var(--color-black);
  }
  *{box-sizing:border-box}
  body{margin:0;background:#7a7a74;font-family:monospace}
  .page{background:#f5f5ee;padding:16px}
  .pixel-panel{background:var(--color-white);border:3px solid var(--color-black);
    box-shadow:var(--shadow-chunky);padding:14px;margin-bottom:24px}
  .friend-card{background:var(--color-white);border:3px solid var(--color-black);
    box-shadow:var(--shadow-chunky);padding:10px;text-align:center}
  .pixel-btn{background:var(--color-white);border:3px solid var(--color-black);
    font-family:monospace;font-size:11px;padding:6px 10px;cursor:pointer}
  .pixel-btn-primary{background:var(--color-black);color:var(--color-white)}
`;

const page = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body><div class="page">${body}</div></body></html>`;

function res(prizeType: PrizeType, rfWonUnits = 0n, friendWon?: PullResult['friendWon']): PullResult {
  return {
    prizeType,
    rfWonUnits,
    friendWon,
    spentUnits: parseRF('2500'),
    burnedUnits: parseRF('125'),
  } as unknown as PullResult;
}

type Row = { machineId: string; machineName: string; timestamp: number; result: PullResult };

const inv = (rows: Row[], friends: PlayerInventory['wonFriends'] = []): PlayerInventory =>
  ({
    rfBalanceUnits: parseRF('750000'),
    wonFriends: friends,
    pullHistory: rows as PlayerInventory['pullHistory'],
  }) as PlayerInventory;

const friend = (n: number, name: string) =>
  ({ tokenId: BigInt(n), name, familyName: 'Generations', generation: 0 }) as never;

it('renders MY PRIZES QA scenes to HTML', () => {
  mkdirSync(OUT, { recursive: true });
  const written: string[] = [];
  const write = (name: string, inventory: PlayerInventory) => {
    writeFileSync(
      `${OUT}/${name}.html`,
      page(renderToStaticMarkup(React.createElement(PlayerInventoryPage, { inventory, onNavigateArcade: () => undefined }))),
    );
    written.push(name);
  };

  // Token wins and a collectible together.
  write('won-prizes-mixed', inv(
    [
      { machineId: 'm1', machineName: 'ODDS ARCADE', timestamp: 9, result: res('RF_PRIZE', parseRF('10000')) },
      { machineId: 'm1', machineName: 'ODDS ARCADE', timestamp: 8, result: res('RF_PRIZE', parseRF('5000')) },
      { machineId: 'm2', machineName: 'PRIZE DRUM', timestamp: 7, result: res('FRIEND_PRIZE', 0n, friend(8283, 'Rare Friend')) },
    ],
    [friend(8283, 'Rare Friend')],
  ));

  // Token wins only.
  write('won-prizes-token-only', inv([
    { machineId: 'm1', machineName: 'ODDS ARCADE', timestamp: 5, result: res('RF_PRIZE', parseRF('2500')) },
  ]));

  // Nothing won yet.
  write('won-prizes-empty', inv([]));

  // Many machines, for the responsive check.
  write('won-prizes-many-rf', inv([
    { machineId: 'a', machineName: 'ODDS ARCADE', timestamp: 9, result: res('RF_PRIZE', parseRF('10000')) },
    { machineId: 'b', machineName: 'PRIZE DRUM', timestamp: 8, result: res('RF_PRIZE', parseRF('7500')) },
    { machineId: 'c', machineName: 'CAPSULE CLUB', timestamp: 7, result: res('RF_PRIZE', parseRF('5000')) },
    { machineId: 'd', machineName: 'CLAW MACHINE', timestamp: 6, result: res('RF_PRIZE', parseRF('2500')) },
    { machineId: 'e', machineName: 'TOP CHASE', timestamp: 5, result: res('RF_PRIZE', parseRF('1000')) },
  ], [friend(1, 'Rare Friend'), friend(2, 'Rare Friend')]));

  expect(written).toHaveLength(4);
});
