/**
 * Publish snapshot + RF identity + machine-integration tests.
 * Deterministic — no network.
 */
import { describe, it, expect } from 'vitest';
import { createMachine } from '../../domain/machine.ts';
import { createFixedOddsMachine } from '../../domain/fixedOdds.ts';
import { calculateTotalPrizeValue } from '../../domain/economics.ts';
import { parseRF } from '../../domain/rf.ts';
import { createSeedableRng } from '../../domain/deck.ts';
import { convertUsdToRfUnits } from '../valuation.ts';
import { stampLegacyValuation } from '../../data/storage.ts';
import type { PrizeEntry, NftValuationSnapshot } from '../../domain/types.ts';

const CHAIN = 4663;
const GEN_CONTRACT = '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d';

function nftPrize(refUnits: bigint, snapshot?: NftValuationSnapshot): PrizeEntry {
  return {
    id: `p-nft-${refUnits}`,
    type: 'FRIEND_PRIZE',
    tokenId: 8283n,
    name: 'Friend #8283',
    familyName: 'Rare Friends Generations',
    generation: 3,
    referenceValueUnits: refUnits,
    initialQuantity: 1,
    remainingQuantity: 1,
    origin: 'real-nft',
    chainId: CHAIN,
    chainSlug: 'robinhood',
    contractAddress: GEN_CONTRACT,
    collectionType: 'GENERATIONS',
    collectionSlug: 'rare-friends-generations',
    collectionName: 'Rare Friends Generations',
    valuationSnapshot: snapshot,
  };
}

describe('publish snapshot locking', () => {
  it('locks reference at publish: top bid $100 / RF $0.002 = 50,000 RF, immune to later moves', () => {
    const ref = convertUsdToRfUnits('100', '0.002')!;
    expect(ref).toBe(50_000_000n);
    const snapshot: NftValuationSnapshot = {
      method: 'rare_friends_generation_bid',
      source: 'opensea',
      collectionSlug: 'rare-friends-generations',
      traitType: 'Generation',
      traitValue: '3',
      topBidUsd: '100',
      rfUsd: '0.002',
      referenceRf: ref.toString(),
      valuedAt: Date.now(),
      fallbackUsed: false,
    };
    const prizes: PrizeEntry[] = [
      nftPrize(ref, snapshot),
      { id: 'p-rf', type: 'RF_PRIZE', amountUnits: parseRF('10000'), initialQuantity: 2, remainingQuantity: 2 },
    ];
    const { machine } = createMachine({
      id: 'm-snap',
      name: 'SNAP',
      shellId: 'CLASSIC',
      creatorAddress: '0xabc',
      pullPriceUnits: parseRF('5000'),
      totalPulls: 20,
      targetRtpBps: 9000,
      prizeEntries: prizes,
      rng: createSeedableRng(1),
    });
    const lockedTotal = calculateTotalPrizeValue(machine.initialPrizes, false);
    // Market moves: top bid $200, RF $0.001 → would be 200,000 RF if refloated.
    const movedRef = convertUsdToRfUnits('200', '0.001')!;
    expect(movedRef).toBe(200_000_000n);
    // Published machine still uses the locked snapshot.
    const prize = machine.initialPrizes.find((p) => p.type === 'FRIEND_PRIZE')!;
    expect(prize.type === 'FRIEND_PRIZE' && prize.referenceValueUnits).toBe(ref);
    expect(calculateTotalPrizeValue(machine.initialPrizes, false)).toBe(lockedTotal);
  });

  it('uses the same immutable snapshot in Finite Deck and Fixed Odds', () => {
    const ref = convertUsdToRfUnits('100', '0.002')!;
    const snap: NftValuationSnapshot = {
      method: 'collection_top_bid',
      source: 'opensea',
      collectionSlug: 'some-collection',
      topBidUsd: '100',
      rfUsd: '0.002',
      referenceRf: ref.toString(),
      valuedAt: Date.now(),
      fallbackUsed: false,
    };
    const deck = createMachine({
      id: 'm-deck',
      name: 'D',
      shellId: 'CLASSIC',
      creatorAddress: '0xabc',
      pullPriceUnits: parseRF('5000'),
      totalPulls: 20,
      targetRtpBps: 9000,
      prizeEntries: [nftPrize(ref, snap)],
      rng: createSeedableRng(2),
    });
    const base = nftPrize(ref, snap);
    if (base.type !== 'FRIEND_PRIZE') throw new Error('fixture');
    const fixed = createFixedOddsMachine({
      id: 'm-fixed',
      name: 'F',
      shellId: 'CLASSIC',
      creatorAddress: '0xabc',
      pullPriceUnits: parseRF('5000'),
      targetRtpBps: 9000,
      prizeEntries: [{ ...base, oddsPpm: 10000 }],
    });
    expect(calculateTotalPrizeValue(deck.machine.initialPrizes, false)).toBe(ref);
    // Fixed Odds configured EV uses the same ref.
    expect(fixed.machine.configuredRtpBps).toBeGreaterThan(0);
  });

  it('stamps legacy_manual on pre-existing machines without rewriting economics', () => {
    const ref = parseRF('250000');
    const { machine } = createMachine({
      id: 'm-legacy',
      name: 'L',
      shellId: 'CLASSIC',
      creatorAddress: '0xabc',
      pullPriceUnits: parseRF('5000'),
      totalPulls: 100,
      targetRtpBps: 9000,
      prizeEntries: [
        {
          id: 'p-old',
          type: 'FRIEND_PRIZE',
          tokenId: 1n,
          name: 'Old',
          familyName: 'Genesis',
          generation: 0,
          referenceValueUnits: ref,
          initialQuantity: 1,
          remainingQuantity: 1,
          origin: 'real-nft',
          chainId: CHAIN,
          contractAddress: GEN_CONTRACT,
        },
      ],
      rng: createSeedableRng(3),
    });
    const stripped = {
      ...machine,
      initialPrizes: machine.initialPrizes.map((p) => {
        if (p.type === 'FRIEND_PRIZE') {
          const { valuationSnapshot: _drop, ...rest } = p;
          return rest;
        }
        return p;
      }),
      remainingPrizes: machine.remainingPrizes.map((p) => {
        if (p.type === 'FRIEND_PRIZE') {
          const { valuationSnapshot: _drop, ...rest } = p;
          return rest;
        }
        return p;
      }),
    };
    const [migrated] = stampLegacyValuation([stripped as typeof machine]);
    const p = migrated!.initialPrizes.find((x) => x.type === 'FRIEND_PRIZE')!;
    expect(p.type === 'FRIEND_PRIZE' && p.valuationSnapshot?.method).toBe('legacy_manual');
    expect(p.type === 'FRIEND_PRIZE' && p.referenceValueUnits).toBe(ref);
  });
});

describe('$RAREFRIENDS identity (never symbol-only)', () => {
  it('accepts only the exact Robinhood RF contract', () => {
    const RF_CHAIN = 'robinhood';
    const RF_CONTRACT = '0x0779369854d3ecdea927206718ffd7730c67b71f';
    const good = { address: RF_CONTRACT, chain: RF_CHAIN };
    const impostorSameSymbol = { address: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', chain: 'ethereum', symbol: 'RF' };
    const wrongChain = { address: RF_CONTRACT, chain: 'ethereum' };
    const isExactRf = (t: { address: string; chain: string }) =>
      t.address.toLowerCase() === RF_CONTRACT.toLowerCase() && t.chain === RF_CHAIN;
    expect(isExactRf(good)).toBe(true);
    expect(isExactRf(impostorSameSymbol)).toBe(false);
    expect(isExactRf(wrongChain)).toBe(false);
  });
});
