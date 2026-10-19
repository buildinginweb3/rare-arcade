import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { CreatorDashboard } from '../CreatorDashboard.tsx';
import { parseUsdg } from '../../domain/usdg.ts';
import { createInitialDemoMachines } from '../../data/demoMachines.ts';
import { withEscrowTotals, pauseMachine, withdrawEscrow } from '../../domain/vault.ts';
import type { CreatorAccount, Machine } from '../../domain/types.ts';

/**
 * Rendered straight from the demo fixtures + the real vault domain, so these
 * assertions exercise the same machine shape the dashboard actually receives.
 */
const CREATOR = '0xDemoCreator4663';

/**
 * Demo fixtures are credited to their own operator identities, so the machine
 * is re-stamped to this operator's creator address — otherwise
 * `selectOperatorMachines` correctly filters the row out of the dashboard.
 */
function base(): Machine {
  const { machines } = createInitialDemoMachines();
  return withEscrowTotals({ ...machines[0]!, creatorAddress: CREATOR });
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

const creator: CreatorAccount = {
  address: CREATOR,
  usdgBalanceUnits: parseUsdg('25000'),
  rfBalanceUnits: 0n,
  ownedFriends: [],
  totalProceedsUnits: 0n,
  totalPlatformFeesGeneratedUnits: 0n,
  machinesCreatedCount: 1,
};

const render = (machines: Machine[], operatorAddresses: string[] = [CREATOR.toLowerCase()]) =>
  renderToStaticMarkup(
    React.createElement(CreatorDashboard, {
      creator,
      machines,
      operatorAddresses,
      onSelectMachine: () => undefined,
      onNavigateCreate: () => undefined,
      onMachineCancelled: () => undefined,
      onMachinePaused: () => undefined,
      onMachineResumed: () => undefined,
      onEscrowWithdrawn: () => undefined,
    })
  );

describe('CreatorDashboard — vault controls (vault.ts)', () => {
  it('offers pause on a live machine the operator owns', () => {
    const html = render([machine({ status: 'LIVE' })]);
    expect(html).toContain('PAUSE');
    expect(html).toContain('WITHDRAW');
  });

  it('shows the remaining escrow so the operator knows what is recoverable', () => {
    const html = render([machine({ status: 'LIVE' })]);
    expect(html).toContain('VAULT');
  });

  it('swaps pause for resume once the machine is paused', () => {
    const paused = pauseMachine(machine({ status: 'LIVE' }), [CREATOR], 1).pausedMachine;
    const html = render([paused]);
    expect(html).toContain('RESUME');
    expect(html).toContain('PAUSED');
  });

  it('does not offer withdrawal before the machine is paused', () => {
    // A live machine must be paused first — winding down is two deliberate steps.
    const html = render([machine({ status: 'LIVE' })]);
    // The button is present but disabled, and says why.
    expect(html).toContain('WITHDRAW');
    expect(html).toContain('disabled');
    expect(html).toContain('Pause the machine before withdrawing its escrow.');
  });

  it('enables withdrawal once paused, and states what comes back', () => {
    const paused = pauseMachine(machine({ status: 'LIVE' }), [CREATOR], 1).pausedMachine;
    const html = render([paused]);
    expect(html).toContain('Return ');
    expect(html).toContain('of unused escrow and close this machine for good');
  });

  it('hides all vault controls on a machine wound down by withdrawal', () => {
    const paused = pauseMachine(machine({ status: 'LIVE' }), [CREATOR], 1).pausedMachine;
    const withdrawn = withdrawEscrow(paused, [CREATOR], 2).withdrawnMachine;
    const html = render([withdrawn]);
    expect(html).not.toContain('WITHDRAW');
    expect(html).not.toContain('>PAUSE<');
    expect(html).toContain('VIEW');
  });

  it('shows no vault controls for a machine this operator does not own', () => {
    const html = render([machine({ status: 'LIVE', creatorAddress: '0xNotMine' })], [
      CREATOR.toLowerCase(),
    ]);
    // Another creator's machine is simply not listed for this operator.
    expect(html).not.toContain('0xNotMine');
  });
});