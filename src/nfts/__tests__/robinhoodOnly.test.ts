import { describe, it, expect } from 'vitest';
import {
  SETTLEMENT_CHAIN_ID,
  SETTLEMENT_CHAIN_SLUG,
  FUNDABLE_CHAIN_SLUGS,
  isFundableChain,
  defaultScanChains,
  orderChainsForScan,
} from '../chains.ts';
import {
  assertFundablePrizes,
  isFundablePrizeChain,
  ineligibleNftPrizes,
} from '../../domain/settlement.ts';
import {
  verifyNftOwnerRemote,
  verifyNftOwnerGeneric,
} from '../apiClient.ts';
import { createMachine } from '../../domain/machine.ts';
import { createFixedOddsMachine } from '../../domain/fixedOdds.ts';
import { createSeedableRng } from '../../domain/deck.ts';
import { parseUsdg } from '../../domain/usdg.ts';
import type { FriendPrizeEntry, PrizeEntry } from '../../domain/types.ts';

function nft(chainSlug: string, chainId: number, tokenId: bigint): FriendPrizeEntry {
  return {
    id: `p-${tokenId}`,
    type: 'FRIEND_PRIZE',
    tokenId,
    name: `Friend #${tokenId}`,
    familyName: 'Generations',
    generation: 1,
    usdgValueUnits: parseUsdg('10'),
    initialQuantity: 1,
    remainingQuantity: 1,
    chainSlug,
    chainId,
    contractAddress: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d',
  };
}

describe('Settlement chain registry (chains.ts)', () => {
  it('is Robinhood only', () => {
    expect(SETTLEMENT_CHAIN_SLUG).toBe('robinhood');
    expect(SETTLEMENT_CHAIN_ID).toBe(4663);
    expect(FUNDABLE_CHAIN_SLUGS).toEqual(['robinhood']);
  });

  it('scans exactly one chain', () => {
    expect(defaultScanChains()).toEqual(['robinhood']);
  });

  it('drops any non-Robinhood slug from a requested scan set', () => {
    expect(orderChainsForScan(['ethereum', 'robinhood', 'base', 'polygon'])).toEqual([
      'robinhood',
    ]);
    expect(orderChainsForScan(['base', 'zora'])).toEqual([]);
  });

  it('recognises only Robinhood as fundable, case-insensitively', () => {
    expect(isFundableChain('robinhood')).toBe(true);
    expect(isFundableChain('ROBINHOOD')).toBe(true);
    expect(isFundableChain('ethereum')).toBe(false);
    expect(isFundableChain('base')).toBe(false);
    expect(isFundableChain('')).toBe(false);
    expect(isFundableChain(undefined)).toBe(false);
  });
});

describe('Prize chain eligibility (settlement.ts)', () => {
  it('accepts a Robinhood NFT prize', () => {
    expect(isFundablePrizeChain(nft('robinhood', 4663, 1n))).toBe(true);
  });

  it('rejects a cross-chain NFT prize', () => {
    expect(isFundablePrizeChain(nft('ethereum', 1, 1n))).toBe(false);
    expect(isFundablePrizeChain(nft('base', 8453, 1n))).toBe(false);
  });

  it('never constrains cashback prizes (they have no chain)', () => {
    const cashback: PrizeEntry = {
      id: 'c',
      type: 'USDG_PRIZE',
      amountUnits: parseUsdg('1'),
      initialQuantity: 1,
      remainingQuantity: 1,
    };
    expect(isFundablePrizeChain(cashback)).toBe(true);
  });

  it('lists ineligible prizes with an actionable error', () => {
    const entries: PrizeEntry[] = [nft('robinhood', 4663, 1n), nft('ethereum', 1, 2n)];
    expect(ineligibleNftPrizes(entries)).toHaveLength(1);
    expect(() => assertFundablePrizes(entries)).toThrow(/Robinhood Chain NFTs only/);
    expect(() => assertFundablePrizes(entries)).toThrow(/Friend #2 \(ethereum\)/);
    // A clean pool passes.
    expect(() => assertFundablePrizes([entries[0]!])).not.toThrow();
  });
});

describe('Machine constructors reject cross-chain NFT prizes', () => {
  it('Finite Deck refuses to publish a non-Robinhood prize', () => {
    expect(() =>
      createMachine({
        name: 'CROSS CHAIN',
        shellId: 'CLASSIC',
        creatorAddress: '0xC',
        pullPriceUnits: parseUsdg('1'),
        totalPulls: 10,
        prizeEntries: [nft('ethereum', 1, 1n)],
        rng: createSeedableRng(1),
      })
    ).toThrow(/Robinhood Chain NFTs only/);
  });

  it('Fixed Odds refuses to publish a non-Robinhood prize', () => {
    expect(() =>
      createFixedOddsMachine({
        name: 'CROSS CHAIN',
        shellId: 'CLASSIC',
        creatorAddress: '0xC',
        pullPriceUnits: parseUsdg('1'),
        prizeEntries: [{ ...nft('base', 8453, 1n), oddsPpm: 10000 }],
      })
    ).toThrow(/Robinhood Chain NFTs only/);
  });

  it('still publishes a Robinhood-only prize pool', () => {
    const { machine } = createMachine({
      name: 'ROBINHOOD ONLY',
      shellId: 'CLASSIC',
      creatorAddress: '0xC',
      pullPriceUnits: parseUsdg('1'),
      totalPulls: 10,
      prizeEntries: [nft('robinhood', 4663, 1n)],
      rng: createSeedableRng(2),
    });
    expect(machine.status).toBe('READY');
  });
});

describe('Ownership verification is on-chain for every NFT (apiClient.ts)', () => {
  it('rejects a non-Robinhood chain at the verifier boundary', async () => {
    await expect(
      verifyNftOwnerGeneric({
        chain: 'ethereum',
        contract: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d',
        tokenId: '1',
        wallet: '0x1111111111111111111111111111111111111111',
      })
    ).rejects.toThrow(/Robinhood Chain NFTs only/);
  });

  it('rejects a malformed contract address before hitting the RPC', async () => {
    await expect(
      verifyNftOwnerRemote('not-an-address', '1')
    ).rejects.toThrow(/not a valid Robinhood Chain address/);
  });

  it('rejects an invalid token id before hitting the RPC', async () => {
    await expect(
      verifyNftOwnerRemote('0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d', 'abc')
    ).rejects.toThrow(/Invalid token ID/);
  });

  it('requires a connected wallet', async () => {
    await expect(
      verifyNftOwnerGeneric({
        contract: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d',
        tokenId: '1',
        wallet: '',
      })
    ).rejects.toThrow(/Connect a wallet/);
  });
});