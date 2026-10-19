/**
 * Central demo-economy configuration for RARE ARCADE.
 *
 * USDG (Global Dollar, pegged 1:1 to USD) is the play currency, so demo
 * defaults are calibrated in dollars: single-digit pulls, tens of dollars of
 * cashback, hundreds for NFT top bids.
 *
 * Fixed-point math is unchanged (1 USDG = 1,000,000 units, matching
 * USDG's on-chain decimals). Only suggestions, seeded balances, and fixture
 * calibrations live here — never scattered hard-coded values in components.
 */

import { parseRF } from './rf.ts';
import { parseUsdg } from './usdg.ts';
import { DEFAULT_TARGET_RTP_BPS } from './economics.ts';

export const RARE_ARCADE_DEMO_ECONOMY = {
  /** Suggested default pull price (USDG units). */
  defaultPullPriceUnits: parseUsdg('5'),
  defaultPullPriceStr: '5',

  /** Pull-price quick picks (USDG display strings). */
  pullPriceSuggestions: ['1', '2.50', '5', '10'] as const,

  /** USDG cashback prize quick picks (the stable default option). */
  usdgPrizeSuggestions: ['5', '10', '25', '50', '100'] as const,
  defaultUsdgPrizeStr: '10',
  defaultUsdgPrizeQty: 2,

  /**
   * $RAREFRIENDS cashback prize quick picks (optional, stacked on top of USDG).
   * RF is volatile, so seeded RF prizes lock their USDG value at seed time
   * using this rate — published RTP never drifts with the RF market.
   */
  rfPrizeSuggestions: ['2500', '5000', '12500', '25000', '50000'] as const,
  defaultRfPrizeStr: '12500',
  defaultRfPrizeQty: 2,

  /**
   * RF → USDG FALLBACK rate. Used by the seeded demo fixtures (which must
   * reproduce identical economics on every load) and whenever the live RF price
   * is unavailable. This is NOT a market quote and must never be presented as
   * one — creator-published machines lock the live price instead.
   * See `src/domain/rfPricing.ts`.
   */
  demoRfPriceUsdg: '0.002',

  /** Default NFT demo reference value (USD top bid string). */
  defaultNftReferenceStr: '250',

  /** Starting balances (USDG units). */
  playerStartingBalanceUnits: parseUsdg('2500'),
  creatorStartingBalanceUnits: parseUsdg('25000'),

  /** Demo creator's RF cashback reserve (RF units) — RF is not a play currency. */
  creatorStartingRfUnits: parseRF('500000'),

  defaultRtpBps: DEFAULT_TARGET_RTP_BPS,

  /** RTP quick-pick presets (bps). CUSTOM is handled separately. */
  rtpPresetsBps: [8000, 8500, 9000, 9500] as const,

  platformFeeBps: 500,
  creatorBps: 9500,
} as const;