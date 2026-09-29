import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { selectWonRfPrizes, totalWonRfUnits } from '../wonPrizes.ts';
import { parseRF, formatRFGrouped } from '../rf.ts';
import { PlayerInventoryPage } from '../../pages/PlayerInventoryPage.tsx';
import type { PlayerInventory, PullResult, PrizeType } from '../types.ts';

function result(prizeType: PrizeType, rfWonUnits = 0n, friendWon?: PullResult['friendWon']): PullResult {
  return {
    prizeType,
    rfWonUnits,
    friendWon,
    spentUnits: parseRF('100'),
    burnedUnits: parseRF('5'),
  } as unknown as PullResult;
}

function history(
  rows: { machineId: string; machineName: string; timestamp: number; result: PullResult }[]
): PlayerInventory['pullHistory'] {
  return rows as PlayerInventory['pullHistory'];
}

describe('selectWonRfPrizes (wonPrizes.ts)', () => {
  it('recovers $RF wins that were credited straight to the balance', () => {
    const prizes = selectWonRfPrizes({
      pullHistory: history([
        { machineId: 'm1', machineName: 'TOKEN TOP', timestamp: 3, result: result('RF_PRIZE', parseRF('5000')) },
      ]),
    });
    expect(prizes).toHaveLength(1);
    expect(prizes[0]).toMatchObject({ machineId: 'm1', machineName: 'TOKEN TOP', wins: 1 });
    expect(prizes[0]!.totalUnits).toBe(parseRF('5000'));
  });

  it('folds repeated wins from one machine into a single showcase card', () => {
    const prizes = selectWonRfPrizes({
      pullHistory: history([
        { machineId: 'm1', machineName: 'TOKEN TOP', timestamp: 5, result: result('RF_PRIZE', parseRF('100')) },
        { machineId: 'm1', machineName: 'TOKEN TOP', timestamp: 4, result: result('RF_PRIZE', parseRF('200')) },
        { machineId: 'm1', machineName: 'TOKEN TOP', timestamp: 3, result: result('RF_PRIZE', parseRF('300')) },
      ]),
    });
    expect(prizes).toHaveLength(1);
    expect(prizes[0]!.wins).toBe(3);
    expect(prizes[0]!.totalUnits).toBe(parseRF('600'));
    // Newest machine win drives the ordering timestamp.
    expect(prizes[0]!.lastWonAt).toBe(5);
  });

  it('keeps one entry per machine, newest first', () => {
    const prizes = selectWonRfPrizes({
      pullHistory: history([
        { machineId: 'new', machineName: 'NEWEST', timestamp: 9, result: result('RF_PRIZE', parseRF('10')) },
        { machineId: 'old', machineName: 'OLDER', timestamp: 2, result: result('RF_PRIZE', parseRF('20')) },
      ]),
    });
    expect(prizes.map((p) => p.machineId)).toEqual(['new', 'old']);
  });

  it('ignores NFT wins and no-prize pulls', () => {
    const prizes = selectWonRfPrizes({
      pullHistory: history([
        { machineId: 'm1', machineName: 'NFT ONLY', timestamp: 4, result: result('FRIEND_PRIZE', 0n, { name: 'Rare Friend' } as never) },
        { machineId: 'm1', machineName: 'NFT ONLY', timestamp: 3, result: result('NO_PRIZE') },
      ]),
    });
    expect(prizes).toEqual([]);
  });

  it('ignores zero-value RF wins', () => {
    const prizes = selectWonRfPrizes({
      pullHistory: history([
        { machineId: 'm1', machineName: 'ZERO', timestamp: 4, result: result('RF_PRIZE', 0n) },
      ]),
    });
    expect(prizes).toEqual([]);
  });

  it('totals every machine, including repeat wins', () => {
    const inventory = {
      pullHistory: history([
        { machineId: 'a', machineName: 'A', timestamp: 3, result: result('RF_PRIZE', parseRF('100')) },
        { machineId: 'a', machineName: 'A', timestamp: 2, result: result('RF_PRIZE', parseRF('150')) },
        { machineId: 'b', machineName: 'B', timestamp: 1, result: result('RF_PRIZE', parseRF('250')) },
        { machineId: 'b', machineName: 'B', timestamp: 0, result: result('NO_PRIZE') },
      ]),
    };
    expect(totalWonRfUnits(inventory)).toBe(parseRF('500'));
  });

  it('is safe with an empty history', () => {
    expect(selectWonRfPrizes({ pullHistory: [] })).toEqual([]);
    expect(totalWonRfUnits({ pullHistory: [] })).toBe(0n);
  });
});

describe('PlayerInventoryPage — MY PRIZES showcase', () => {
  const noop = () => undefined;

  const inventoryWith = (
    rfRows: { machineId: string; machineName: string; timestamp: number; result: PullResult }[],
    friends: PlayerInventory['wonFriends'] = []
  ): PlayerInventory =>
    ({
      rfBalanceUnits: parseRF('500000'),
      wonFriends: friends,
      pullHistory: history(rfRows),
    }) as PlayerInventory;

  const render = (inventory: PlayerInventory) =>
    renderToStaticMarkup(
      React.createElement(PlayerInventoryPage, { inventory, onNavigateArcade: noop })
    );

  it('labels the section WON PRIZES, not WON RARE FRIENDS', () => {
    const html = render(inventoryWith([]));
    expect(html).toContain('WON PRIZES (0)');
    expect(html).not.toContain('WON RARE FRIENDS');
  });

  it('shows the empty state when nothing has been won', () => {
    const html = render(inventoryWith([]));
    expect(html).toContain('NO PRIZES WON YET');
    expect(html).not.toContain('NO RARE FRIENDS WON YET');
  });

  it('showcases an $RF token win with the $RF coin, amount, and machine', () => {
    const html = render(
      inventoryWith([
        { machineId: 'm1', machineName: 'ODDS ARCADE', timestamp: 5, result: result('RF_PRIZE', parseRF('5000')) },
      ])
    );
    expect(html).toContain('WON PRIZES (1)');
    // The canonical $RF coin, same visual a machine uses for a token top prize.
    expect(html).toContain('rf-token-icon');
    expect(html).toContain(formatRFGrouped(parseRF('5000')));
    expect(html).toContain('$RAREFRIENDS • 1 WIN');
    expect(html).toContain('WON FROM ODDS ARCADE');
    expect(html).not.toContain('NO PRIZES WON YET');
  });

  it('counts and showcases token wins alongside collectibles', () => {
    const html = render(
      inventoryWith(
        [
          { machineId: 'm1', machineName: 'ODDS ARCADE', timestamp: 5, result: result('RF_PRIZE', parseRF('5000')) },
          { machineId: 'm2', machineName: 'DRUM', timestamp: 4, result: result('RF_PRIZE', parseRF('2500')) },
        ],
        [{ name: 'Rare Friend', tokenId: 1n, familyName: 'Generations', generation: 0 } as never]
      )
    );
    // 2 token cards + 1 collectible.
    expect(html).toContain('WON PRIZES (3)');
    expect(html).toContain('WON FROM ODDS ARCADE');
    expect(html).toContain('WON FROM DRUM');
    expect(html).toContain('Rare Friend');
  });

  it('aggregates repeat wins from one machine into a single card', () => {
    const html = render(
      inventoryWith([
        { machineId: 'm1', machineName: 'ODDS ARCADE', timestamp: 5, result: result('RF_PRIZE', parseRF('1000')) },
        { machineId: 'm1', machineName: 'ODDS ARCADE', timestamp: 4, result: result('RF_PRIZE', parseRF('2000')) },
      ])
    );
    expect(html).toContain('WON PRIZES (1)');
    expect(html).toContain('$RAREFRIENDS • 2 WINS');
    expect(html).toContain(formatRFGrouped(parseRF('3000')));
  });

  it('does not show a token card for a pull that won nothing', () => {
    const html = render(
      inventoryWith([
        { machineId: 'm1', machineName: 'ODDS ARCADE', timestamp: 5, result: result('NO_PRIZE') },
      ])
    );
    expect(html).toContain('WON PRIZES (0)');
    expect(html).not.toContain('WON FROM');
  });
});
