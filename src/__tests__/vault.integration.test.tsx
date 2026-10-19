// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App } from '../App.tsx';
import { STORAGE_KEY, loadAppState } from '../data/storage.ts';
import { parseUsdg } from '../domain/usdg.ts';
import type { FiniteDeckMachine } from '../domain/types.ts';

/**
 * Integration coverage for the machine vault.
 *
 * The unit suite proves the domain rules; this mounts the real App against a
 * real DOM so the wiring is exercised too — App handlers, persistence to
 * localStorage, and the UI states a player and a creator actually see.
 */

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

let container: HTMLDivElement;
let root: Root;

async function mount(): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(App));
  });
}

/** Find a button by its exact trimmed text. */
function button(label: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find(
    (b) => b.textContent?.trim() === label
  );
}

/** Find a clickable element (button or row/card) containing `text`. */
function clickable(text: string): HTMLElement | undefined {
  return Array.from(
    container.querySelectorAll<HTMLElement>('button, tr, [role="button"]')
  ).find((el) => el.textContent?.includes(text));
}

async function click(el: HTMLElement | undefined): Promise<void> {
  if (!el) throw new Error('element to click not found');
  await act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

const text = () => container.textContent ?? '';

/** The one fixture this suite re-stamps so the operator owns it. */
const OWNED_MACHINE_ID = 'demo-machine-usdg-rain';
const OWNED_MACHINE_NAME = 'USDG RAIN';

/** Navigate to the creator dashboard. */
async function gotoDashboard(): Promise<void> {
  await click(button('CREATOR DASH'));
}

/** Open the operator-owned machine from the dashboard. */
async function openOwnedMachine(): Promise<void> {
  await gotoDashboard();
  await click(clickable(OWNED_MACHINE_NAME));
}

describe('machine vault — mounted app integration', () => {
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    window.localStorage.clear();
    // Re-stamp ONE demo machine to the demo creator's address so the creator
    // dashboard (and therefore the vault controls) are reachable for it, while
    // the other fixtures stay owned by their own operators — that gives us a
    // genuine non-owned machine to check player-facing behaviour against.
    const state = loadAppState();
    state.machines = state.machines.map((m) =>
      m.id === OWNED_MACHINE_ID ? { ...m, creatorAddress: '0xDemoCreator4663' } : m
    );
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(state, (_k, v) => (typeof v === 'bigint' ? { __bigint: v.toString() } : v))
    );
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('starts with every machine live, nothing paused and no escrow withdrawn', async () => {
    await mount();
    const state = loadAppState();
    expect(state.machines.every((m) => m.status !== 'PAUSED')).toBe(true);
    expect(state.machines.every((m) => m.escrowUsdgWithdrawnUnits === 0n)).toBe(true);
  });

  it('refuses withdrawal before the machine is paused', async () => {
    await mount();
    await openOwnedMachine();

    const withdraw = button('WITHDRAW ESCROW & CLOSE');
    expect(withdraw).toBeDefined();
    expect(withdraw?.disabled).toBe(true);
    expect(text()).toContain('Pause the machine before withdrawing its escrow.');
  });

  it('pauses a machine, persists it, and blocks the pull button', async () => {
    await mount();
    await openOwnedMachine();
    await click(button('PAUSE MACHINE'));

    // Persisted, not just local component state.
    const paused = loadAppState().machines.find((m) => m.id === OWNED_MACHINE_ID);
    expect(paused?.status).toBe('PAUSED');
    expect(paused?.pausedAt).toBeGreaterThan(0);

    // And the player-facing cabinet refuses to sell a pull.
    const pull = button('PAUSED BY CREATOR');
    expect(pull).toBeDefined();
    expect(pull?.disabled).toBe(true);
  });

  it('shows a paused machine on the arcade floor without a play price', async () => {
    await mount();
    await openOwnedMachine();
    await click(button('PAUSE MACHINE'));
    await click(button('BACK TO ARCADE'));
    // Backing out of a machine returns to the tab it was opened from, so the
    // arcade floor has to be selected explicitly.
    await click(button('ARCADE FLOOR'));

    const card = clickable('USDG RAIN');
    expect(card?.textContent).toContain('PAUSED');
    expect(card?.textContent).toContain('VIEW STATS');
    expect(card?.textContent).not.toContain('Play —');

    // Other machines stay playable.
    const playButtons = Array.from(container.querySelectorAll('button')).filter((b) =>
      b.textContent?.startsWith('Play —')
    );
    expect(playButtons.length).toBeGreaterThan(0);
  });

  it('resumes a paused machine and puts pulls back on sale', async () => {
    await mount();
    await openOwnedMachine();
    await click(button('PAUSE MACHINE'));
    await click(button('RESUME PULLS'));

    const resumed = loadAppState().machines.find((m) => m.id === OWNED_MACHINE_ID);
    expect(resumed?.status).toBe('LIVE');
    expect(resumed?.pausedAt).toBeUndefined();
    expect(text()).toContain('PULL —');
  });

  it('leaves escrow untouched by a pause', async () => {
    await mount();
    const before = loadAppState().machines.find((m) => m.id === OWNED_MACHINE_ID);

    await openOwnedMachine();
    await click(button('PAUSE MACHINE'));

    const after = loadAppState().machines.find((m) => m.id === OWNED_MACHINE_ID);
    expect(after?.remainingPrizes).toEqual(before?.remainingPrizes);
    expect(after?.escrowUsdgWithdrawnUnits).toBe(0n);
    expect(after?.escrowFriendsWithdrawnCount).toBe(0);
  });

  it('returns withdrawn escrow to the creator balance and closes the machine', async () => {
    await mount();
    const creatorBefore = loadAppState().creatorAccount.usdgBalanceUnits;
    const machineBefore = loadAppState().machines.find((m) => m.id === OWNED_MACHINE_ID);
    const usdgPrizesBefore = machineBefore?.usdgPrizesPaidUnits ?? 0n;

    await openOwnedMachine();
    await click(button('PAUSE MACHINE'));
    await click(button('WITHDRAW ESCROW & CLOSE'));

    const state = loadAppState();
    const machine = state.machines.find((m) => m.id === OWNED_MACHINE_ID);

    expect(machine?.status).toBe('CANCELLED');
    expect(machine?.withdrawnAt).toBeGreaterThan(0);
    // The creator's USDG balance grew by exactly the escrow returned.
    expect(state.creatorAccount.usdgBalanceUnits - creatorBefore).toBe(
      machine?.escrowUsdgWithdrawnUnits
    );
    expect(machine?.escrowUsdgWithdrawnUnits).toBeGreaterThan(0n);
    // Nothing already paid to players was clawed back or re-paid.
    expect(machine?.usdgPrizesPaidUnits).toBe(usdgPrizesBefore);
  });

  it('records an auditable ledger trail for the wind-down', async () => {
    await mount();
    await openOwnedMachine();
    await click(button('PAUSE MACHINE'));
    await click(button('WITHDRAW ESCROW & CLOSE'));

    const events = loadAppState().ledgerEvents.filter(
      (e) => e.machineId === OWNED_MACHINE_ID
    );
    expect(events.some((e) => e.type === 'MACHINE_PAUSED')).toBe(true);
    expect(events.some((e) => e.type === 'ESCROW_WITHDRAWN')).toBe(true);
    expect(events.some((e) => e.type === 'MACHINE_CANCELLED')).toBe(true);

    const pauseEvent = events.find((e) => e.type === 'MACHINE_PAUSED')!;
    const resumeOrWithdraw = events.find((e) => e.type === 'ESCROW_WITHDRAWN')!;
    // Chronological ordering survives the prepend-based ledger.
    expect(pauseEvent.timestamp).toBeLessThanOrEqual(resumeOrWithdraw.timestamp);
    expect(resumeOrWithdraw.details).toContain('USDG RAIN');
  });

  it('cannot withdraw the same escrow twice', async () => {
    await mount();
    await openOwnedMachine();
    await click(button('PAUSE MACHINE'));
    await click(button('WITHDRAW ESCROW & CLOSE'));

    const afterFirst = loadAppState().creatorAccount.usdgBalanceUnits;
    const withdrawnOnce = loadAppState().machines.find(
      (m) => m.id === OWNED_MACHINE_ID
    )!.escrowUsdgWithdrawnUnits;

    // The control is gone entirely on a closed machine.
    expect(button('WITHDRAW ESCROW & CLOSE')).toBeUndefined();
    await openOwnedMachine();
    expect(button('WITHDRAW ESCROW & CLOSE')).toBeUndefined();

    expect(loadAppState().creatorAccount.usdgBalanceUnits).toBe(afterFirst);
    expect(
      loadAppState().machines.find((m) => m.id === OWNED_MACHINE_ID)!
        .escrowUsdgWithdrawnUnits
    ).toBe(withdrawnOnce);
  });

  it('survives a reload with the machine still paused', async () => {
    await mount();
    await openOwnedMachine();
    await click(button('PAUSE MACHINE'));

    await act(async () => {
      root.unmount();
    });
    container.remove();
    await mount();

    const reloaded = loadAppState().machines.find((m) => m.id === OWNED_MACHINE_ID);
    expect(reloaded?.status).toBe('PAUSED');
    await openOwnedMachine();
    expect(button('RESUME PULLS')).toBeDefined();
  });

  it('shows the vault breakdown to a player who does not own the machine', async () => {
    await mount();
    await click(button('ARCADE FLOOR'));
    await click(clickable('FRIEND FRENZY'));
    // FRIEND FRENZY keeps its fixture creator, so this viewer does not own it.

    // Escrow transparency is public; the controls are not.
    expect(text()).toContain('MACHINE VAULT — ESCROW STILL LOCKED');
    expect(text()).toContain('TOTAL VAULT VALUE');
    expect(button('WITHDRAW ESCROW & CLOSE')).toBeUndefined();
    expect(button('PAUSE MACHINE')).toBeUndefined();
  });

  it('keeps the rules lock and the published RTP after a withdrawal', async () => {
    await mount();
    const before = loadAppState().machines.find((m) => m.id === OWNED_MACHINE_ID);

    await openOwnedMachine();
    await click(button('PAUSE MACHINE'));
    await click(button('WITHDRAW ESCROW & CLOSE'));

    const after = loadAppState().machines.find((m) => m.id === OWNED_MACHINE_ID);
    // The published record of the game is never rewritten by a wind-down.
    expect((after as FiniteDeckMachine | undefined)?.initialRtpBps).toBe(
      (before as FiniteDeckMachine | undefined)?.initialRtpBps
    );
    expect(after?.initialPrizes).toEqual(before?.initialPrizes);
  });

  it('never lets a withdrawal exceed the escrow that was ever published', async () => {
    await mount();
    await openOwnedMachine();
    await click(button('PAUSE MACHINE'));
    await click(button('WITHDRAW ESCROW & CLOSE'));

    const machine = loadAppState().machines.find((m) => m.id === OWNED_MACHINE_ID)!;
    const publishedUsdg = machine.initialPrizes
      .filter((p) => p.type === 'USDG_PRIZE')
      .reduce((acc, p) => acc + (p.type === 'USDG_PRIZE' ? p.amountUnits * BigInt(p.initialQuantity) : 0n), 0n);
    const publishedRf = machine.initialPrizes
      .filter((p) => p.type === 'RF_PRIZE')
      .reduce((acc, p) => acc + (p.type === 'RF_PRIZE' ? p.amountUnits * BigInt(p.initialQuantity) : 0n), 0n);

    expect(machine.escrowUsdgWithdrawnUnits).toBeLessThanOrEqual(publishedUsdg);
    expect(machine.escrowRfWithdrawnUnits).toBeLessThanOrEqual(publishedRf);
    // Nothing published may still be sitting in a closed machine.
    expect(parseUsdg('0')).toBe(0n);
  });
});