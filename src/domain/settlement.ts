/**
 * Robinhood-only prize eligibility.
 *
 * Rare Arcade settles on a single chain, so an NFT prize is only fundable when
 * it lives on Robinhood Chain. This is the single choke point both machine
 * constructors call, which means a cross-chain prize can never reach a published
 * machine even if it somehow entered the picker.
 *
 * The contract side depends on this too: `PrizePool.fundNftPrize` and
 * `MachineRegistry` take one chain, so there is no per-chain escrow branch to
 * get wrong.
 */

import type { PrizeEntry } from './types.ts';

export const SETTLEMENT_CHAIN_SLUG = 'robinhood';
export const SETTLEMENT_CHAIN_ID = 4663;

/** Slugs treated as the settlement chain (case-insensitive). */
const FUNDABLE = new Set<string>([SETTLEMENT_CHAIN_SLUG]);

export function isFundableChainSlug(slug: string | null | undefined): boolean {
  return FUNDABLE.has((slug ?? '').trim().toLowerCase());
}

/**
 * True when the prize's chain matches the settlement chain.
 *
 * A prize with NO recorded chain is treated as fundable: that only happens for
 * legacy demo fixtures that predate chain stamping, and they were always
 * Robinhood. Real discovered NFTs always carry a chain, so this default cannot
 * mask a genuinely cross-chain asset.
 */
export function isFundablePrizeChain(
  entry: PrizeEntry,
  fallbackChainId?: number
): boolean {
  if (entry.type !== 'FRIEND_PRIZE') {
    // Cashback prizes are not NFTs and have no chain constraint.
    return true;
  }
  if (entry.chainSlug !== undefined) {
    return isFundableChainSlug(entry.chainSlug);
  }
  if (entry.chainId !== undefined) {
    return entry.chainId === SETTLEMENT_CHAIN_ID;
  }
  if (fallbackChainId !== undefined) {
    return fallbackChainId === SETTLEMENT_CHAIN_ID;
  }
  return true;
}

/** NFT prizes that cannot be funded, for error reporting. */
export function ineligibleNftPrizes(entries: readonly PrizeEntry[]): PrizeEntry[] {
  return entries.filter((e) => !isFundablePrizeChain(e));
}

/**
 * Assert every NFT prize is on the settlement chain.
 * Throws with a creator-actionable message.
 */
export function assertFundablePrizes(entries: readonly PrizeEntry[]): void {
  const bad = ineligibleNftPrizes(entries);
  if (bad.length === 0) return;
  const detail = bad
    .map((e) =>
      e.type === 'FRIEND_PRIZE' ? `${e.name} (${e.chainSlug ?? 'unknown chain'})` : 'unknown'
    )
    .join(', ');
  throw new Error(
    `Rare Arcade funds Robinhood Chain NFTs only. Remove these non-Robinhood prizes: ${detail}`
  );
}