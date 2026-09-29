/**
 * Central demo-economy configuration for RARE ARCADE.
 * $RAREFRIENDS has a low unit value, so demo defaults operate in the
 * thousands / tens of thousands / hundreds of thousands of RF.
 *
 * Fixed-point math is unchanged (1 RF = 1000 units). Only suggestions,
 * seeded balances, and fixture calibrations live here — never scattered
 * hard-coded values in components.
 */

import { parseRF } from './rf.ts';
import { DEFAULT_TARGET_RTP_BPS } from './economics.ts';

export const RARE_ARCADE_DEMO_ECONOMY = {
  /** Suggested default pull price (RF units). */
  defaultPullPriceUnits: parseRF('2500'),
  defaultPullPriceStr: '2500',

  /** Pull-price quick picks (RF display strings). */
  pullPriceSuggestions: ['1000', '2500', '5000', '10000'] as const,

  /** RF prize quick picks (amount x qty handled in UI). */
  rfPrizeSuggestions: ['5000', '10000', '25000', '50000', '100000'] as const,
  defaultRfPrizeStr: '10000',
  defaultRfPrizeQty: 2,

  /** Default NFT demo reference value (RF display string). */
  defaultNftReferenceStr: '25000',

  /** Starting balances (RF units). */
  playerStartingBalanceUnits: parseRF('250000'),
  creatorStartingBalanceUnits: parseRF('2500000'),

  defaultRtpBps: DEFAULT_TARGET_RTP_BPS,

  /** RTP quick-pick presets (bps). CUSTOM is handled separately. */
  rtpPresetsBps: [8000, 8500, 9000, 9500] as const,

  burnBps: 500,
  creatorBps: 9500,
} as const;
