/**
 * Seeded SYSTEM DEMO Friend Machines (fixture v2).
 * Calibrated for low-unit-value $RAREFRIENDS: pulls in the thousands,
 * prizes in the tens/hundreds of thousands. All finite-deck math reconciles
 * exactly (see comments per machine).
 *
 * Rare Friend prizes use REAL public token references from the approved
 * collections (actual names, token IDs, artwork URLs, OpenSea links).
 * These are SYSTEM DEMO displays — they do NOT imply the viewer owns the
 * NFT and the system does NOT escrow anything on-chain.
 */

import { parseRF } from '../domain/rf.ts';
import { createMachine } from '../domain/machine.ts';
import { createFixedOddsMachine } from '../domain/fixedOdds.ts';
import { createSeedableRng } from '../domain/deck.ts';
import { ROBINHOOD_CHAIN_ID, GENERATIONS_CONTRACT, GENESIS_CONTRACT } from '../nfts/collections.ts';
import type { Machine, LedgerEvent, PrizeEntry, NftValuationSnapshot } from '../domain/types.ts';

/** Fixed demo valuation snapshot: reproducible economics, clearly labeled DEMO. */
function demoSnapshot(
  collectionSlug: string,
  referenceValueUnits: bigint,
  trait?: { traitType: string; traitValue: string }
): NftValuationSnapshot {
  return {
    method: 'demo_snapshot',
    source: 'demo',
    collectionSlug,
    traitType: trait?.traitType,
    traitValue: trait?.traitValue,
    topBidUsd: '0',
    rfUsd: '0.002',
    referenceRf: referenceValueUnits.toString(),
    valuedAt: 1790000000000,
    fallbackUsed: false,
  };
}

// Verified live OpenSea references (read-only, 2026-09-28).
const GEN_FRIEND_8283 = {
  tokenId: 8283n,
  name: 'Friend #8283',
  familyName: 'Generations',
  generation: 0,
  contractAddress: GENERATIONS_CONTRACT,
  collectionType: 'GENERATIONS' as const,
  collectionName: 'Rare Friends Generations',
  imageUrl:
    'https://raw2.seadn.io/robinhood/0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d/536fdc9943dda517fed786a0126f64/1d536fdc9943dda517fed786a0126f64.svg',
  openseaUrl:
    'https://opensea.io/assets/robinhood/0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d/8283',
};

const GENESIS_773 = {
  tokenId: 773n,
  name: 'Genesis #773',
  familyName: 'Genesis',
  generation: 0,
  contractAddress: GENESIS_CONTRACT,
  collectionType: 'GENESIS' as const,
  collectionName: 'Rare Friends Genesis',
  imageUrl:
    'https://raw2.seadn.io/robinhood/0x116eaa62241751e0c98da43d458600c6c17cd361/2e6ad320983e993caa09777ee98030/e52e6ad320983e993caa09777ee98030.svg',
  openseaUrl:
    'https://opensea.io/assets/robinhood/0x116eaa62241751e0c98da43d458600c6c17cd361/773',
};

// Verified live OpenSea reference (read-only): Generations #5147.
const GEN_FRIEND_5147 = {
  tokenId: 5147n,
  name: 'Friend #5147',
  familyName: 'Generations',
  generation: 0,
  contractAddress: GENERATIONS_CONTRACT,
  collectionType: 'GENERATIONS' as const,
  collectionName: 'Rare Friends Generations',
  imageUrl:
    'https://raw2.seadn.io/robinhood/0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d/ae348ab123342846eb74d626d57ffa/c7ae348ab123342846eb74d626d57ffa.svg',
  openseaUrl:
    'https://opensea.io/assets/robinhood/0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d/5147',
};

export function createInitialDemoMachines(): {
  machines: Machine[];
  initialEvents: LedgerEvent[];
} {
  const machines: Machine[] = [];
  const initialEvents: LedgerEvent[] = [];

  // Machine 1: RF RAIN — frequent RF prizes.
  // Pull 1,000 RF x 100 pulls = 100,000 gross. Burn 5,000. Receipts 95,000.
  // Prizes: 10,000x2 + 5,000x6 + 2,000x10 + 1,000x20 = 90,000.
  // EV = 900 RF, RTP = 90.00%.
  const rfRainPrizes: PrizeEntry[] = [
    { id: 'rain-p-rf-10000', type: 'RF_PRIZE', amountUnits: parseRF('10000'), initialQuantity: 2, remainingQuantity: 2 },
    { id: 'rain-p-rf-5000', type: 'RF_PRIZE', amountUnits: parseRF('5000'), initialQuantity: 6, remainingQuantity: 6 },
    { id: 'rain-p-rf-2000', type: 'RF_PRIZE', amountUnits: parseRF('2000'), initialQuantity: 10, remainingQuantity: 10 },
    { id: 'rain-p-rf-1000', type: 'RF_PRIZE', amountUnits: parseRF('1000'), initialQuantity: 20, remainingQuantity: 20 },
  ];
  const m1 = createMachine({
    id: 'demo-machine-rf-rain',
    name: 'RF RAIN',
    shellId: 'CAPSULE',
    emblem: 'coin',
    creatorAddress: '0xTokenMaster',
    pullPriceUnits: parseRF('1000'),
    totalPulls: 100,
    targetRtpBps: 9000,
    prizeEntries: rfRainPrizes,
    rng: createSeedableRng(2002),
  });
  machines.push(m1.machine);
  initialEvents.push(...m1.events);

  // Machine 2: FRIEND FRENZY — real Generations NFT + RF rewards.
  // Pull 5,000 RF x 100 pulls = 500,000 gross. Burn 25,000. Receipts 475,000.
  // Prizes: NFT ref 250,000 + 50,000x1 + 25,000x2 + 10,000x5 + 5,000x10 = 450,000.
  // EV = 4,500 RF, RTP = 90.00%.
  const frenzyPrizes: PrizeEntry[] = [
    {
      id: 'frenzy-p-friend-8283',
      type: 'FRIEND_PRIZE',
      tokenId: GEN_FRIEND_8283.tokenId,
      name: GEN_FRIEND_8283.name,
      familyName: GEN_FRIEND_8283.familyName,
      generation: GEN_FRIEND_8283.generation,
      referenceValueUnits: parseRF('250000'),
      initialQuantity: 1,
      remainingQuantity: 1,
      origin: 'system-demo',
      chainId: ROBINHOOD_CHAIN_ID,
      chainSlug: 'robinhood',
      contractAddress: GEN_FRIEND_8283.contractAddress,
      collectionType: GEN_FRIEND_8283.collectionType,
      collectionSlug: 'rare-friends-generations',
      collectionName: GEN_FRIEND_8283.collectionName,
      imageUrl: GEN_FRIEND_8283.imageUrl,
      displayImageUrl: GEN_FRIEND_8283.imageUrl,
      openseaUrl: GEN_FRIEND_8283.openseaUrl,
      valuationSnapshot: demoSnapshot('rare-friends-generations', parseRF('250000'), {
        traitType: 'Generation',
        traitValue: '0',
      }),
    },
    { id: 'frenzy-p-rf-50000', type: 'RF_PRIZE', amountUnits: parseRF('50000'), initialQuantity: 1, remainingQuantity: 1 },
    { id: 'frenzy-p-rf-25000', type: 'RF_PRIZE', amountUnits: parseRF('25000'), initialQuantity: 2, remainingQuantity: 2 },
    { id: 'frenzy-p-rf-10000', type: 'RF_PRIZE', amountUnits: parseRF('10000'), initialQuantity: 5, remainingQuantity: 5 },
    { id: 'frenzy-p-rf-5000', type: 'RF_PRIZE', amountUnits: parseRF('5000'), initialQuantity: 10, remainingQuantity: 10 },
  ];
  const m2 = createMachine({
    id: 'demo-machine-friend-frenzy',
    name: 'FRIEND FRENZY',
    shellId: 'CLASSIC',
    emblem: 'trophy',
    mascotTokenId: GEN_FRIEND_8283.tokenId,
    creatorAddress: '0xOperatorAlpha',
    pullPriceUnits: parseRF('5000'),
    totalPulls: 100,
    targetRtpBps: 9000,
    prizeEntries: frenzyPrizes,
    rng: createSeedableRng(1001),
  });
  machines.push(m2.machine);
  initialEvents.push(...m2.events);

  // Machine 3: HIGH ROLLER — large prizes, fewer high-cost pulls.
  // Pull 10,000 RF x 30 pulls = 300,000 gross. Burn 15,000. Receipts 285,000.
  // Prizes: Genesis ref 150,000 + 50,000x1 + 25,000x2 + 10,000x2 = 270,000.
  // EV = 9,000 RF, RTP = 90.00%.
  const highRollerPrizes: PrizeEntry[] = [
    {
      id: 'hr-p-genesis-773',
      type: 'FRIEND_PRIZE',
      tokenId: GENESIS_773.tokenId,
      name: GENESIS_773.name,
      familyName: GENESIS_773.familyName,
      generation: GENESIS_773.generation,
      referenceValueUnits: parseRF('150000'),
      initialQuantity: 1,
      remainingQuantity: 1,
      origin: 'system-demo',
      chainId: ROBINHOOD_CHAIN_ID,
      chainSlug: 'robinhood',
      contractAddress: GENESIS_773.contractAddress,
      collectionType: GENESIS_773.collectionType,
      collectionSlug: 'rare-friends-genesis',
      collectionName: GENESIS_773.collectionName,
      imageUrl: GENESIS_773.imageUrl,
      displayImageUrl: GENESIS_773.imageUrl,
      openseaUrl: GENESIS_773.openseaUrl,
      valuationSnapshot: demoSnapshot('rare-friends-genesis', parseRF('150000')),
    },
    { id: 'hr-p-rf-50000', type: 'RF_PRIZE', amountUnits: parseRF('50000'), initialQuantity: 1, remainingQuantity: 1 },
    { id: 'hr-p-rf-25000', type: 'RF_PRIZE', amountUnits: parseRF('25000'), initialQuantity: 2, remainingQuantity: 2 },
    { id: 'hr-p-rf-10000', type: 'RF_PRIZE', amountUnits: parseRF('10000'), initialQuantity: 2, remainingQuantity: 2 },
  ];
  const m3 = createMachine({
    id: 'demo-machine-high-roller',
    name: 'HIGH ROLLER',
    shellId: 'TALLBOY',
    emblem: 'crown',
    mascotTokenId: GENESIS_773.tokenId,
    creatorAddress: '0xHighRollerVault',
    pullPriceUnits: parseRF('10000'),
    totalPulls: 30,
    targetRtpBps: 9000,
    prizeEntries: highRollerPrizes,
    rng: createSeedableRng(3003),
  });
  machines.push(m3.machine);
  initialEvents.push(...m3.events);

  // Machine 4: FRIEND FOREVER — Fixed Odds, no play cap.
  // Pull 2,500 RF. Configured odds: NFT 0.20% + 100,000 RF @1.00% +
  // 25,000 RF @2.00% = 3.20% configured; 96.80% base no-prize.
  // EV = 250,000×0.002 + 100,000×0.01 + 25,000×0.02 = 500+1000+500 = 2,000 RF.
  // Configured RTP = 80.00%, modeled edge +15%.
  const foreverPrizes: PrizeEntry[] = [
    {
      id: 'forever-p-friend-5147',
      type: 'FRIEND_PRIZE',
      tokenId: GEN_FRIEND_5147.tokenId,
      name: GEN_FRIEND_5147.name,
      familyName: GEN_FRIEND_5147.familyName,
      generation: GEN_FRIEND_5147.generation,
      referenceValueUnits: parseRF('250000'),
      initialQuantity: 1,
      remainingQuantity: 1,
      oddsPpm: 2000, // 0.20%
      origin: 'system-demo',
      chainId: ROBINHOOD_CHAIN_ID,
      chainSlug: 'robinhood',
      contractAddress: GEN_FRIEND_5147.contractAddress,
      collectionType: GEN_FRIEND_5147.collectionType,
      collectionSlug: 'rare-friends-generations',
      collectionName: GEN_FRIEND_5147.collectionName,
      imageUrl: GEN_FRIEND_5147.imageUrl,
      displayImageUrl: GEN_FRIEND_5147.imageUrl,
      openseaUrl: GEN_FRIEND_5147.openseaUrl,
      valuationSnapshot: demoSnapshot('rare-friends-generations', parseRF('250000'), {
        traitType: 'Generation',
        traitValue: '0',
      }),
    },
    { id: 'forever-p-rf-100000', type: 'RF_PRIZE', amountUnits: parseRF('100000'), initialQuantity: 3, remainingQuantity: 3, oddsPpm: 10000 }, // 1.00%
    { id: 'forever-p-rf-25000', type: 'RF_PRIZE', amountUnits: parseRF('25000'), initialQuantity: 10, remainingQuantity: 10, oddsPpm: 20000 }, // 2.00%
  ];
  const m4 = createFixedOddsMachine({
    id: 'demo-machine-friend-forever',
    name: 'FRIEND FOREVER',
    shellId: 'MINI',
    emblem: 'heart',
    mascotTokenId: GEN_FRIEND_5147.tokenId,
    creatorAddress: '0xForeverArcade',
    pullPriceUnits: parseRF('2500'),
    targetRtpBps: 8000,
    prizeEntries: foreverPrizes,
  });
  machines.push(m4.machine);
  initialEvents.push(...m4.events);

  return { machines, initialEvents };
}
