import { describe, it, expect } from 'vitest';
import {
  canFundAsset,
  collectReservedNftKeys,
  isAssetReserved,
  isSelectionValidForWallet,
  assetReservationKey,
  buildOperatorAddresses,
  normalizeIdentity,
  isOperatorMachine,
  selectOperatorMachines,
} from '../ownership.ts';
import { MOCK_ASSETS, MOCK_GENERATIONS_ASSET } from '../mockAssets.ts';
import { createMachine } from '../../domain/machine.ts';
import { parseRF } from '../../domain/rf.ts';
import { createSeedableRng } from '../../domain/deck.ts';
import type { PrizeEntry } from '../../domain/types.ts';

const WALLET = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OTHER = '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';

function verifiedAsset() {
  return { ...MOCK_GENERATIONS_ASSET, reportedOwner: WALLET.toLowerCase(), ownershipVerified: true };
}

function machineWithNft(status: 'READY' | 'LIVE' | 'SOLD_OUT' | 'CANCELLED' = 'LIVE') {
  const prizes: PrizeEntry[] = [
    {
      id: 'p-nft',
      type: 'FRIEND_PRIZE',
      tokenId: 8283n,
      name: 'Friend #8283',
      familyName: 'Rare Friends Generations',
      generation: 0,
      referenceValueUnits: parseRF('250000'),
      initialQuantity: 1,
      remainingQuantity: 1,
      origin: 'real-nft',
      chainId: 4663,
      contractAddress: MOCK_GENERATIONS_ASSET.contract,
    },
    { id: 'p-rf', type: 'RF_PRIZE', amountUnits: parseRF('5000'), initialQuantity: 1, remainingQuantity: 1 },
  ];
  const { machine } = createMachine({
    id: `m-${status}`,
    name: 'T',
    shellId: 'CLASSIC',
    creatorAddress: WALLET,
    pullPriceUnits: parseRF('5000'),
    totalPulls: 20,
    targetRtpBps: 9000,
    prizeEntries: prizes,
    rng: createSeedableRng(7),
  });
  return { ...machine, status };
}

describe('Ownership gates (ownership.ts)', () => {
  it('allows funding when wallet owns Genesis/Generations and chain confirms', () => {
    for (const a of MOCK_ASSETS) {
      const asset = { ...a, reportedOwner: WALLET.toLowerCase() };
      const res = canFundAsset({
        asset,
        connectedWallet: WALLET,
        onChainOwner: WALLET,
        rpcFailed: false,
        reserved: new Set(),
      });
      expect(res.ok).toBe(true);
    }
  });

  it('rejects unrelated ownership / empty wallet', () => {
    const asset = verifiedAsset();
    expect(
      canFundAsset({ asset, connectedWallet: OTHER, onChainOwner: OTHER, rpcFailed: false, reserved: new Set() }).ok
    ).toBe(false);
    expect(
      canFundAsset({ asset, connectedWallet: null, onChainOwner: WALLET, rpcFailed: false, reserved: new Set() }).ok
    ).toBe(false);
  });

  it('trusts fresh chain read over OpenSea on mismatch', () => {
    const asset = verifiedAsset();
    const res = canFundAsset({
      asset,
      connectedWallet: WALLET,
      onChainOwner: OTHER,
      rpcFailed: false,
      reserved: new Set(),
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/OWNERSHIP CHANGED/);
  });

  it('blocks funding when RPC fails', () => {
    const asset = verifiedAsset();
    const res = canFundAsset({
      asset,
      connectedWallet: WALLET,
      onChainOwner: null,
      rpcFailed: true,
      reserved: new Set(),
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/COULD NOT BE VERIFIED/);
  });

  it('blocks duplicate active-machine funding locally', () => {
    const asset = verifiedAsset();
    const reserved = new Set([assetReservationKey(asset)]);
    const res = canFundAsset({
      asset,
      connectedWallet: WALLET,
      onChainOwner: WALLET,
      rpcFailed: false,
      reserved,
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/another LIVE/);
  });

  it('invalidates previous selection on wallet change', () => {
    const asset = verifiedAsset();
    expect(isSelectionValidForWallet(asset, WALLET)).toBe(true);
    expect(isSelectionValidForWallet(asset, OTHER)).toBe(false);
    expect(isSelectionValidForWallet(asset, null)).toBe(false);
    expect(isSelectionValidForWallet(null, WALLET)).toBe(false);
  });
});

describe('Demo reservation (collectReservedNftKeys)', () => {
  it('reserves real NFTs in LIVE/READY machines, ignores SOLD_OUT/CANCELLED', () => {
    const live = machineWithNft('LIVE');
    const ready = machineWithNft('READY');
    const sold = machineWithNft('SOLD_OUT');
    const cancelled = machineWithNft('CANCELLED');
    const reserved = collectReservedNftKeys([live, ready, sold, cancelled]);
    expect(reserved.size).toBe(1);
    expect(isAssetReserved(verifiedAsset(), reserved)).toBe(true);
  });

  it('never reserves legacy/system display entries', () => {
    const m = machineWithNft('LIVE');
    const legacy = {
      ...m,
      initialPrizes: m.initialPrizes.map((p) =>
        p.type === 'FRIEND_PRIZE' ? { ...p, origin: 'legacy-demo' as const, chainId: undefined, contractAddress: undefined } : p
      ),
      remainingPrizes: m.remainingPrizes.map((p) =>
        p.type === 'FRIEND_PRIZE' ? { ...p, origin: 'legacy-demo' as const, chainId: undefined, contractAddress: undefined } : p
      ),
    };
    expect(collectReservedNftKeys([legacy]).size).toBe(0);
  });
});

describe('Operator identity matching (dashboard sync)', () => {
  it('matches demo id and wallet case-insensitively, drops empties', () => {
    expect(normalizeIdentity('0xDemoCreator4663')).toBe('0xdemocreator4663');
    expect(buildOperatorAddresses('0xDemoCreator4663', '0xAAA', null, '')).toEqual([
      '0xdemocreator4663',
      '0xaaa',
    ]);
  });

  it('syncs wallet-published machines to the dashboard', () => {
    const walletMade = { creatorAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' };
    const demoMade = { creatorAddress: '0xDemoCreator4663' };
    const stranger = { creatorAddress: '0x9999999999999999999999999999999999999999' };
    const ids = ['0xdemocreator4663', '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'];
    expect(isOperatorMachine(walletMade.creatorAddress, ids)).toBe(true);
    expect(isOperatorMachine('0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', ids)).toBe(true);
    expect(isOperatorMachine(stranger.creatorAddress, ids)).toBe(false);
    expect(selectOperatorMachines([walletMade, demoMade, stranger], ids)).toEqual([
      walletMade,
      demoMade,
    ]);
  });

  it('shows nothing extra when no wallet is linked', () => {
    const walletMade = { creatorAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' };
    expect(selectOperatorMachines([walletMade], ['0xdemocreator4663'])).toEqual([]);
  });
});
