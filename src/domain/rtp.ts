/**
 * Custom RTP helpers. Quick-pick buttons are suggestions, not restrictions:
 * creators may enter any positive finite percentage (decimals supported).
 * Authoritative math stays in integer basis points (90% = 9000 bps).
 */

export const RTP_PRESET_BPS = [8000, 8500, 9000, 9500] as const;

/** Generous technical cap to prevent pathological UI/math inputs (1000%). */
export const TECHNICAL_MAX_RTP_BPS = 100000;

/**
 * Parse a human percentage string (e.g. "72.5", "107.5%", "100") into bps.
 * Throws on blank / NaN / Infinity / non-positive / over-technical-max.
 */
export function parseRtpPercentToBps(input: string): number {
  const cleaned = input.trim().replace(/%$/, '').trim();
  if (!cleaned) throw new Error('Custom RTP cannot be blank.');
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) {
    throw new Error(`Invalid RTP percentage: "${input}". Use a positive number like 72.5.`);
  }
  const pct = Number(cleaned);
  if (!Number.isFinite(pct) || pct <= 0) {
    throw new Error('RTP must be a positive finite percentage.');
  }
  const bps = Math.round(pct * 100);
  if (bps <= 0) throw new Error('RTP must be greater than 0%.');
  if (bps > TECHNICAL_MAX_RTP_BPS) {
    throw new Error(
      `RTP exceeds the technical maximum of ${TECHNICAL_MAX_RTP_BPS / 100}%.`
    );
  }
  return bps;
}

export type RtpWarningKind = 'none' | 'player-favorable' | 'subsidized' | 'very-low';

export interface RtpWarning {
  kind: RtpWarningKind;
  operatorMarginBps: number; // 9500 - actualRtpBps (may be negative)
}

/**
 * Classify RTP for warning display. Never blocks — transparency only.
 * operatorMargin = 9500 - rtpBps (5% burn is fixed).
 */
export function classifyRtp(actualRtpBps: number): RtpWarning {
  const operatorMarginBps = 9500 - actualRtpBps;
  if (actualRtpBps > 10000) {
    return { kind: 'subsidized', operatorMarginBps };
  }
  if (actualRtpBps > 9500) {
    return { kind: 'player-favorable', operatorMarginBps };
  }
  if (actualRtpBps < 5000) {
    return { kind: 'very-low', operatorMarginBps };
  }
  return { kind: 'none', operatorMarginBps };
}
