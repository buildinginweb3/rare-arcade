/**
 * Seeded SYSTEM DEMO Friend Machines (fixture v5).
 *
 * Calibrated in USDG — the play currency. Pulls are single-digit dollars and
 * NFT reference values are USD top bids (USDG is pegged 1:1, so top bid ==
 * USDG value). Every machine mixes USDG cashback, optional $RAREFRIENDS
 * cashback, and/or an NFT prize; all finite-deck math reconciles exactly
 * (see the reconciliation comment above each machine).
 *
 * Rare Friend prizes use REAL public token references from the approved
 * collections (actual names, token IDs, artwork URLs, OpenSea links).
 * These are SYSTEM DEMO displays — they do NOT imply the viewer owns the
 * NFT and the system does NOT escrow anything on-chain.
 */

import { parseRF } from '../domain/rf.ts';
import { parseUsdg, usdgFromUsd } from '../domain/usdg.ts';
import { createMachine } from '../domain/machine.ts';
import { createFixedOddsMachine } from '../domain/fixedOdds.ts';
import { createSeedableRng } from '../domain/deck.ts';
import { ROBINHOOD_CHAIN_ID, GENERATIONS_CONTRACT, GENESIS_CONTRACT } from '../nfts/collections.ts';
import type { Machine, LedgerEvent, PrizeEntry, NftValuationSnapshot } from '../domain/types.ts';

/**
 * Fixed RF → USDG rate for the seeded demo fixtures.
 *
 * Deliberately NOT live: these fixtures must reproduce identical economics on
 * every machine and every load, which a live quote would break. Because the
 * rate is a constant rather than a market read, seeded RF prizes are stamped
 * `rfPriceSource: 'fallback'` so the audit trail never implies otherwise.
 * Creator-published machines use the live feed instead — see domain/rfPricing.ts.
 */
const DEMO_RF_PRICE_USDG = '0.002';

/**
 * Build an RF cashback prize whose USDG value is locked at seed time from the
 * demo RF rate. Keeps published RTP exact while the player is paid in RF.
 */
function rfCashback(
  id: string,
  rfAmount: string,
  initialQuantity: number,
  oddsPpm?: number
): PrizeEntry {
  const rfUnits = parseRF(rfAmount);
  return {
    id,
    type: 'RF_PRIZE',
    amountUnits: rfUnits,
    usdgValueUnits: usdgFromUsd(String(Number(rfAmount) * Number(DEMO_RF_PRICE_USDG))),
    rfPriceUsdg: DEMO_RF_PRICE_USDG,
    rfPriceSource: 'fallback' as const,
    initialQuantity,
    remainingQuantity: initialQuantity,
    ...(oddsPpm !== undefined ? { oddsPpm } : {}),
  };
}

/** Build a USDG cashback prize (the stable, default cashback currency). */
function usdgCashback(
  id: string,
  usdgAmount: string,
  initialQuantity: number,
  oddsPpm?: number
): PrizeEntry {
  return {
    id,
    type: 'USDG_PRIZE',
    amountUnits: parseUsdg(usdgAmount),
    initialQuantity,
    remainingQuantity: initialQuantity,
    ...(oddsPpm !== undefined ? { oddsPpm } : {}),
  };
}

/** Fixed demo valuation snapshot: reproducible economics, clearly labeled DEMO. */
function demoSnapshot(
  collectionSlug: string,
  usdgValueUnits: bigint,
  trait?: { traitType: string; traitValue: string }
): NftValuationSnapshot {
  const usd = Number(usdgValueUnits) / 1_000_000;
  return {
    method: 'demo_snapshot',
    source: 'demo',
    collectionSlug,
    traitType: trait?.traitType,
    traitValue: trait?.traitValue,
    // USDG is pegged 1:1 to USD, so the demo top bid equals the USDG reference.
    topBidUsd: String(usd),
    referenceUsdg: String(usd),
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

  // Machine 1: USDG RAIN — frequent stable USDG cashback + optional RF top-ups.
  // Pull $1.00 x 100 pulls = $100.00 gross. Platform fee 5% = $5.00.
  // Creator receipts $95.00.
  // Prizes: USDG $10x1 + $5x2 + $2x4 + $1x12 = $40.00
  //         RF 12,500x2 @ $0.002 = $50.00
  // Total $90.00 -> EV $0.90 -> RTP 90.00%.
  const usdgRainPrizes: PrizeEntry[] = [
    usdgCashback('rain-p-usdg-10', '10', 1),
    usdgCashback('rain-p-usdg-5', '5', 2),
    usdgCashback('rain-p-usdg-2', '2', 4),
    usdgCashback('rain-p-usdg-1', '1', 12),
    rfCashback('rain-p-rf-12500', '12500', 2),
  ];
  const m1 = createMachine({
    id: 'demo-machine-usdg-rain',
    name: 'USDG RAIN',
    shellId: 'CAPSULE',
    emblem: 'coin',
    creatorAddress: '0xTokenMaster',
    pullPriceUnits: parseUsdg('1'),
    totalPulls: 100,
    targetRtpBps: 9000,
    prizeEntries: usdgRainPrizes,
    rng: createSeedableRng(2002),
  });
  machines.push(m1.machine);
  initialEvents.push(...m1.events);

  // Machine 2: FRIEND FRENZY — real Generations NFT + USDG and RF cashback.
  // Pull $5.00 x 100 pulls = $500.00 gross. Platform fee 5% = $25.00.
  // Creator receipts $475.00.
  // Prizes: NFT $250 + USDG ($50x1 + $25x2) = $100
  //         RF 25,000x2 @ $0.002 = $100
  // Total $450.00 -> EV $4.50 -> RTP 90.00%.
  const frenzyPrizes: PrizeEntry[] = [
    {
      id: 'frenzy-p-friend-8283',
      type: 'FRIEND_PRIZE',
      tokenId: GEN_FRIEND_8283.tokenId,
      name: GEN_FRIEND_8283.name,
      familyName: GEN_FRIEND_8283.familyName,
      generation: GEN_FRIEND_8283.generation,
      usdgValueUnits: usdgFromUsd('250'),
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
      valuationSnapshot: demoSnapshot('rare-friends-generations', usdgFromUsd('250'), {
        traitType: 'Generation',
        traitValue: '0',
      }),
    },
    usdgCashback('frenzy-p-usdg-50', '50', 1),
    usdgCashback('frenzy-p-usdg-25', '25', 2),
    rfCashback('frenzy-p-rf-25000', '25000', 2),
  ];
  const m2 = createMachine({
    id: 'demo-machine-friend-frenzy',
    name: 'FRIEND FRENZY',
    shellId: 'CLASSIC',
    emblem: 'trophy',
    mascotTokenId: GEN_FRIEND_8283.tokenId,
    creatorAddress: '0xOperatorAlpha',
    pullPriceUnits: parseUsdg('5'),
    totalPulls: 100,
    targetRtpBps: 9000,
    prizeEntries: frenzyPrizes,
    rng: createSeedableRng(1001),
  });
  machines.push(m2.machine);
  initialEvents.push(...m2.events);

  // Machine 3: HIGH ROLLER — Genesis jackpot, larger USDG payouts.
  // Pull $10.00 x 30 pulls = $300.00 gross. Platform fee 5% = $15.00.
  // Creator receipts $285.00.
  // Prizes: NFT $150 + USDG ($50x1 + $25x2) = $100 + RF 10,000x1 = $20
  // Total $270.00 -> EV $9.00 -> RTP 90.00%.
  const highRollerPrizes: PrizeEntry[] = [
    {
      id: 'hr-p-genesis-773',
      type: 'FRIEND_PRIZE',
      tokenId: GENESIS_773.tokenId,
      name: GENESIS_773.name,
      familyName: GENESIS_773.familyName,
      generation: GENESIS_773.generation,
      usdgValueUnits: usdgFromUsd('150'),
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
      valuationSnapshot: demoSnapshot('rare-friends-genesis', usdgFromUsd('150')),
    },
    usdgCashback('hr-p-usdg-50', '50', 1),
    usdgCashback('hr-p-usdg-25', '25', 2),
    rfCashback('hr-p-rf-10000', '10000', 1),
  ];
  const m3 = createMachine({
    id: 'demo-machine-high-roller',
    name: 'HIGH ROLLER',
    shellId: 'TALLBOY',
    emblem: 'crown',
    mascotTokenId: GENESIS_773.tokenId,
    creatorAddress: '0xHighRollerVault',
    pullPriceUnits: parseUsdg('10'),
    totalPulls: 30,
    targetRtpBps: 9000,
    prizeEntries: highRollerPrizes,
    rng: createSeedableRng(3003),
  });
  machines.push(m3.machine);
  initialEvents.push(...m3.events);

  // Machine 4: FRIEND FOREVER — Fixed Odds, no play cap.
  // Pull $2.50. Configured odds:
  //   NFT $250 @ 0.20% = $0.50
  //   USDG $20 @ 2.00% = $0.40
  //   USDG $30 @ 2.00% = $0.60
  //   RF 12,500 ($25) @ 2.00% = $0.50
  //   -> 6.20% configured, 93.80% base no-prize
  // EV = $2.00 -> Configured RTP 80.00%, modeled creator edge +15%.
  const foreverPrizes: PrizeEntry[] = [
    {
      id: 'forever-p-friend-5147',
      type: 'FRIEND_PRIZE',
      tokenId: GEN_FRIEND_5147.tokenId,
      name: GEN_FRIEND_5147.name,
      familyName: GEN_FRIEND_5147.familyName,
      generation: GEN_FRIEND_5147.generation,
      usdgValueUnits: usdgFromUsd('250'),
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
      valuationSnapshot: demoSnapshot('rare-friends-generations', usdgFromUsd('250'), {
        traitType: 'Generation',
        traitValue: '0',
      }),
    },
    usdgCashback('forever-p-usdg-20', '20', 3, 20000), // 2.00%
    usdgCashback('forever-p-usdg-30', '30', 5, 20000), // 2.00%
    rfCashback('forever-p-rf-12500', '12500', 2, 20000), // 2.00%
  ];
  const m4 = createFixedOddsMachine({
    id: 'demo-machine-friend-forever',
    name: 'FRIEND FOREVER',
    shellId: 'MINI',
    emblem: 'heart',
    mascotTokenId: GEN_FRIEND_5147.tokenId,
    creatorAddress: '0xForeverArcade',
    pullPriceUnits: parseUsdg('2.50'),
    targetRtpBps: 8000,
    prizeEntries: foreverPrizes,
  });
  machines.push(m4.machine);
  initialEvents.push(...m4.events);

  return { machines, initialEvents };
}
