/**
 * Finite Ticket Deck Generator and Shuffler.
 * Guarantees that every pull consumes exactly one ticket from a finite deck.
 * Supports both crypto-secure browser randomness and seeded PRNG for testing.
 */

import type { PrizeEntry, Ticket } from './types.ts';

export type RngFunction = () => number;

/**
 * Standard crypto-secure RNG using Web Crypto API.
 */
export const defaultCryptoRng: RngFunction = () => {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const buffer = new Uint32Array(1);
    crypto.getRandomValues(buffer);
    return buffer[0]! / 0xffffffff;
  }
  return Math.random();
};

/**
 * Seedable deterministic PRNG (Mulberry32) for reproducible tests.
 */
export function createSeedableRng(seed: number): RngFunction {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates all tickets from configured prize entries and total pulls count.
 * Any remainder between total pulls and prize quantities becomes NO_PRIZE tickets.
 */
export function generateTicketDeck(
  prizeEntries: PrizeEntry[],
  totalPulls: number,
  rng: RngFunction = defaultCryptoRng
): Ticket[] {
  if (totalPulls <= 0) {
    throw new RangeError('Total pulls must be greater than zero');
  }

  const tickets: Ticket[] = [];
  let prizeTicketCount = 0;

  // Track unique NFT tokens to ensure no duplicates.
  // Identity is chainId:contract:tokenId for real NFTs, legacy tokenId otherwise.
  const seenFriendTokens = new Set<string>();

  for (const entry of prizeEntries) {
    if (entry.initialQuantity <= 0) {
      continue;
    }

    if (entry.type === 'FRIEND_PRIZE') {
      const key =
        entry.chainId && entry.contractAddress
          ? `${entry.chainId}:${entry.contractAddress.toLowerCase()}:${entry.tokenId.toString()}`
          : `legacy:${entry.tokenId.toString()}`;
      if (seenFriendTokens.has(key)) {
        throw new Error(`Duplicate unique Rare Friend prize detected: ${key}`);
      }
      seenFriendTokens.add(key);

      for (let i = 0; i < entry.initialQuantity; i++) {
        tickets.push({
          id: `ticket-friend-${entry.tokenId.toString()}-${i}`,
          prizeType: 'FRIEND_PRIZE',
          prizeEntryId: entry.id,
          friendTokenId: entry.tokenId,
          friendName: entry.name,
          friendFamilyName: entry.familyName,
          friendGeneration: entry.generation,
          friendSpriteRows: entry.spriteRows,
          referenceValueUnits: entry.referenceValueUnits,
          friendOrigin: entry.origin,
          friendChainId: entry.chainId,
          friendContractAddress: entry.contractAddress,
          friendCollectionType: entry.collectionType,
          friendCollectionName: entry.collectionName,
          friendImageUrl: entry.imageUrl,
          friendDisplayImageUrl: entry.displayImageUrl,
          friendAnimationUrl: entry.animationUrl,
          friendOpenseaUrl: entry.openseaUrl,
          friendVerifiedOwnerAddress: entry.verifiedOwnerAddress,
        });
        prizeTicketCount++;
      }
    } else if (entry.type === 'RF_PRIZE') {
      for (let i = 0; i < entry.initialQuantity; i++) {
        tickets.push({
          id: `ticket-rf-${entry.id}-${i}`,
          prizeType: 'RF_PRIZE',
          prizeEntryId: entry.id,
          rfAmountUnits: entry.amountUnits,
          referenceValueUnits: entry.amountUnits,
        });
        prizeTicketCount++;
      }
    } else if (entry.type === 'NO_PRIZE') {
      for (let i = 0; i < entry.initialQuantity; i++) {
        tickets.push({
          id: `ticket-empty-${entry.id}-${i}`,
          prizeType: 'NO_PRIZE',
          prizeEntryId: entry.id,
          referenceValueUnits: 0n,
        });
        prizeTicketCount++;
      }
    }
  }

  if (prizeTicketCount > totalPulls) {
    throw new RangeError(
      `Prize count (${prizeTicketCount}) exceeds configured total pulls (${totalPulls})`
    );
  }

  // Fill remainder with empty tickets
  const remainingEmptyCount = totalPulls - prizeTicketCount;
  for (let i = 0; i < remainingEmptyCount; i++) {
    tickets.push({
      id: `ticket-empty-fill-${i}`,
      prizeType: 'NO_PRIZE',
      prizeEntryId: 'default-empty',
      referenceValueUnits: 0n,
    });
  }

  // Shuffle using Fisher-Yates
  return shuffleDeck(tickets, rng);
}

/**
 * In-place or copy Fisher-Yates shuffle.
 */
export function shuffleDeck<T>(deck: readonly T[], rng: RngFunction = defaultCryptoRng): T[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}
