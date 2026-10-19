import { describe, it, expect } from 'vitest';
import {
  resolveRfQuote,
  isFallbackQuote,
  describeRfQuote,
  RF_PRICE_STALE_AFTER_MS,
} from '../rfPricing.ts';
import { RARE_ARCADE_DEMO_ECONOMY } from '../demoEconomy.ts';
import { parseRF, formatRFGrouped } from '../rf.ts';
import { parseUsdg, formatUsdgGrouped, rfToUsdgUnits, parseUsdgRateToUnits } from '../usdg.ts';

const NOW = 1_800_000_000_000;
const FALLBACK = RARE_ARCADE_DEMO_ECONOMY.demoRfPriceUsdg;

describe('resolveRfQuote (rfPricing.ts)', () => {
  it('uses a fresh live quote', () => {
    const q = resolveRfQuote({ usdPrice: '0.00042', valuedAt: NOW - 5_000 }, NOW);
    expect(q.usdgPerRf).toBe('0.00042');
    expect(q.source).toBe('live');
    expect(q.valuedAt).toBe(NOW - 5_000);
    expect(isFallbackQuote(q)).toBe(false);
  });

  it('falls back to the documented constant when the price is missing', () => {
    const q = resolveRfQuote(null, NOW);
    expect(q.usdgPerRf).toBe(FALLBACK);
    expect(q.source).toBe('fallback');
    expect(q.valuedAt).toBeNull();
    expect(isFallbackQuote(q)).toBe(true);
  });

  it('falls back on undefined as well as null', () => {
    expect(resolveRfQuote(undefined, NOW).source).toBe('fallback');
  });

  it('rejects malformed, zero, and negative live prices', () => {
    for (const bad of ['', '   ', 'abc', '0', '-0.5', 'NaN', 'Infinity']) {
      const q = resolveRfQuote({ usdPrice: bad, valuedAt: NOW }, NOW);
      expect(q.source, `price "${bad}"`).toBe('fallback');
      expect(q.usdgPerRf).toBe(FALLBACK);
    }
  });

  it('rejects a non-string price rather than coercing it', () => {
    expect(resolveRfQuote({ usdPrice: 0.5 as unknown as string, valuedAt: NOW }, NOW).source).toBe(
      'fallback'
    );
  });

  it('flags a real-but-old quote as stale instead of silently trusting it', () => {
    const q = resolveRfQuote(
      { usdPrice: '0.0004', valuedAt: NOW - RF_PRICE_STALE_AFTER_MS - 1 },
      NOW
    );
    expect(q.usdgPerRf).toBe('0.0004');
    expect(q.source).toBe('stale');
    // Stale is NOT fallback — the real number is still usable, just labelled.
    expect(isFallbackQuote(q)).toBe(false);
  });

  it('treats clock skew (future timestamp) as fresh, not stale', () => {
    const q = resolveRfQuote({ usdPrice: '0.0005', valuedAt: NOW + 60_000 }, NOW);
    expect(q.source).toBe('live');
  });

  it('treats a zero timestamp as no evidence of age', () => {
    expect(resolveRfQuote({ usdPrice: '0.0005', valuedAt: 0 }, NOW).source).toBe('live');
  });
});

describe('RF cashback RTP uses the resolved rate, not a constant', () => {
  it('different RF prices produce different locked USDG values', () => {
    // This is the bug: a hardcoded rate cannot be right for a volatile token.
    const high = rfToUsdgUnits(parseRF('12500'), resolveRfQuote({ usdPrice: '0.002', valuedAt: NOW }, NOW).usdgPerRf);
    const low = rfToUsdgUnits(parseRF('12500'), resolveRfQuote({ usdPrice: '0.0004', valuedAt: NOW }, NOW).usdgPerRf);
    expect(high).toBe(parseUsdg('25'));
    expect(low).toBe(parseUsdg('5'));
    expect(high).toBe(low * 5n);
  });

  it('locks a fallback rate to the constant, visibly', () => {
    const q = resolveRfQuote(null, NOW);
    const locked = rfToUsdgUnits(parseRF('12500'), q.usdgPerRf);
    expect(locked).toBe(parseUsdg('25'));
    // The prize records that it was NOT priced from a live quote.
    expect(isFallbackQuote(q)).toBe(true);
  });

  it('accepts sub-cent RF prices without throwing', () => {
    // A cheap token can legitimately quote with more precision than USDG has.
    // This must NOT throw, or a valid live price would break seeding.
    expect(rfToUsdgUnits(parseRF('1'), '0.000001')).toBe(1n);
    expect(() => rfToUsdgUnits(parseRF('1'), '0.00000012')).not.toThrow();
    expect(rfToUsdgUnits(parseRF('1'), '0.00000012')).toBe(0n); // floors
  });

  it('floors over-precise rates instead of overstating value', () => {
    // $0.0000019 per RF floors to $0.000001, never rounds up to $0.000002.
    expect(parseUsdgRateToUnits('0.0000019')).toBe(1n);
    expect(parseUsdgRateToUnits('0.000001')).toBe(1n);
    expect(parseUsdgRateToUnits('2.5')).toBe(2_500_000n);
  });

  it('still rejects genuinely malformed rates', () => {
    for (const bad of ['', 'abc', '-0.5', '1.2.3', 'NaN']) {
      expect(() => parseUsdgRateToUnits(bad), bad).toThrow();
    }
  });
});

describe('describeRfQuote (UI labelling)', () => {
  it('always shows the rate, whatever the source', () => {
    expect(describeRfQuote(resolveRfQuote({ usdPrice: '0.00042', valuedAt: NOW }, NOW))).toBe(
      'LIVE $0.00042/RF'
    );
    expect(describeRfQuote(resolveRfQuote(null, NOW))).toContain(FALLBACK);
    expect(describeRfQuote(resolveRfQuote(null, NOW))).toMatch(/FALLBACK/);
  });

  it('says a stale quote is old', () => {
    const q = resolveRfQuote({ usdPrice: '0.0004', valuedAt: NOW - 3_600_000 }, NOW);
    const d = describeRfQuote(q, NOW);
    expect(d).toMatch(/STALE \$0.0004\/RF/);
    expect(d).toMatch(/60m old/);
  });
});

describe('demo fixtures stay on the fixed rate for reproducible economics', () => {
  it('the demo RF rate is a plain parseable decimal', () => {
    expect(() => parseUsdg(FALLBACK)).not.toThrow();
    expect(FALLBACK).toBe('0.002');
  });

  it('formats a locked RF prize value for the workshop preview', () => {
    const value = rfToUsdgUnits(parseRF('12500'), FALLBACK);
    expect(formatUsdgGrouped(value)).toBe('25.00 USDG');
    expect(formatRFGrouped(parseRF('12500'))).toBe('12,500.00 RF');
  });
});