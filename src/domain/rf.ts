/**
 * Fixed-point RF accounting utilities.
 * 1 RF = 1000 internal units (0.001 RF precision).
 * Standard basis points: 10000 bps = 100.00%.
 * Platform burn: 500 bps = 5.00%.
 */

export const RF_SCALE = 1000n;
export const BPS_DIVISOR = 10000n;
export const BURN_BPS = 500n; // 5% fixed platform burn
export const CREATOR_BPS = 9500n; // 95% to creator receipts

/**
 * Converts human RF string or number into internal integer units.
 * Examples:
 *  "10" -> 10000n
 *  "0.5" -> 500n
 *  "0.001" -> 1n
 *  100 -> 100000n
 */
export function parseRF(input: string | number | bigint): bigint {
  if (typeof input === 'bigint') {
    return input;
  }

  const str = String(input).trim();
  if (!str) {
    return 0n;
  }

  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new Error(`Invalid RF representation: "${str}"`);
  }

  const isNegative = str.startsWith('-');
  const cleanStr = isNegative ? str.slice(1) : str;
  const parts = cleanStr.split('.');
  const wholePart = parts[0] || '0';
  const fracPart = (parts[1] || '').padEnd(3, '0').slice(0, 3);

  const wholeUnits = BigInt(wholePart) * RF_SCALE;
  const fracUnits = BigInt(fracPart);
  const totalUnits = wholeUnits + fracUnits;

  return isNegative ? -totalUnits : totalUnits;
}

/**
 * Formats internal integer units to human-readable RF string.
 * Examples:
 *  10000n -> "10" or "10.00 RF"
 *  500n -> "0.5" or "0.50 RF"
 *  1n -> "0.001"
 */
export function formatRF(
  units: bigint,
  options: {
    decimals?: number;
    showSymbol?: boolean;
    trimZeros?: boolean;
  } = {}
): string {
  const { decimals = 2, showSymbol = false, trimZeros = false } = options;

  const isNegative = units < 0n;
  const absUnits = isNegative ? -units : units;

  const whole = absUnits / RF_SCALE;
  const frac = absUnits % RF_SCALE;

  let fracStr = frac.toString().padStart(3, '0');

  if (decimals === 0) {
    fracStr = '';
  } else if (decimals < 3) {
    fracStr = fracStr.slice(0, decimals);
  } else if (decimals > 3) {
    fracStr = fracStr.padEnd(decimals, '0');
  }

  let formatted = '';
  if (fracStr) {
    formatted = `${whole}.${fracStr}`;
  } else {
    formatted = whole.toString();
  }

  if (trimZeros && formatted.includes('.')) {
    formatted = formatted.replace(/\.?0+$/, '');
  }

  const result = `${isNegative ? '-' : ''}${formatted}${showSymbol ? ' RF' : ''}`;
  return result;
}

export function addRF(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subRF(a: bigint, b: bigint): bigint {
  const res = a - b;
  if (res < 0n) {
    throw new RangeError(`RF underflow: ${a} - ${b} < 0`);
  }
  return res;
}

/**
 * Safely multiplies RF units by basis points.
 * Result = (units * bps) / 10000
 */
export function mulBps(units: bigint, bps: bigint): bigint {
  return (units * bps) / BPS_DIVISOR;
}

/**
 * Splits pull payment strictly into 5% burn and 95% creator proceeds.
 * Guaranteed invariant: burnUnits + creatorUnits === pullPriceUnits.
 */
export function calculatePullSplit(pullPriceUnits: bigint): {
  burnUnits: bigint;
  creatorUnits: bigint;
} {
  if (pullPriceUnits <= 0n) {
    throw new RangeError('Pull price must be greater than zero');
  }

  const burnUnits = mulBps(pullPriceUnits, BURN_BPS);
  const creatorUnits = pullPriceUnits - burnUnits;

  // Invariant assertion
  if (burnUnits + creatorUnits !== pullPriceUnits) {
    throw new Error('Pull split conservation invariant violated');
  }

  return { burnUnits, creatorUnits };
}

/**
 * Formats basis points into percentage string.
 * Example: 9000 -> "90.0%" or "90.00%"
 */
export function formatBps(bps: number, decimals: number = 1): string {
  const pct = bps / 100;
  return `${pct.toFixed(decimals)}%`;
}

/**
 * Groups an integer with thousands separators: 2500000 -> "2,500,000".
 */
function groupThousands(intStr: string): string {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * Formats RF units with thousands separators and exact value.
 * Examples: 2500000 RF units -> "2,500.00 RF"; 2500000000n -> "2,500,000.00 RF".
 * Exact — no rounding beyond the requested decimals.
 */
export function formatRFGrouped(
  units: bigint,
  options: { decimals?: number; showSymbol?: boolean } = {}
): string {
  const { decimals = 2, showSymbol = true } = options;
  const base = formatRF(units, { decimals, showSymbol: false });
  const [intPart, fracPart] = base.split('.');
  const grouped = groupThousands(intPart ?? '0');
  const formatted = fracPart !== undefined ? `${grouped}.${fracPart}` : grouped;
  return showSymbol ? `${formatted} RF` : formatted;
}

/**
 * Compact display for tight spaces: 2500 -> "2.5K RF", 250000 -> "250K RF",
 * 2500000 -> "2.5M RF". Approximate — always pair with exact on details.
 */
export function formatRFCompact(units: bigint): string {
  const rf = Number(units) / 1000;
  if (!Number.isFinite(rf)) return formatRFGrouped(units);
  const sign = rf < 0 ? '-' : '';
  const abs = Math.abs(rf);
  if (abs >= 1_000_000) {
    const v = abs / 1_000_000;
    return `${sign}${trimNum(v)}M RF`;
  }
  if (abs >= 10_000) {
    const v = abs / 1000;
    return `${sign}${trimNum(v)}K RF`;
  }
  if (abs >= 1000) {
    const v = abs / 1000;
    return `${sign}${trimNum(v)}K RF`;
  }
  return formatRFGrouped(units);
}

function trimNum(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
}
