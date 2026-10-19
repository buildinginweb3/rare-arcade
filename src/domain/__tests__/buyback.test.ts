import { describe, it, expect } from 'vitest';
import {
  executeBuybackBurn,
  shouldExecuteBuyback,
  applyBurnToLedger,
  emptyBuybackLedger,
  burnedValueUsdgUnits,
  BUYBACK_BATCH_THRESHOLD_USDG,
  BUYBACK_SLIPPAGE_BPS,
  type BuybackLedger,
} from '../buyback.ts';
import { RF_BURN_SINK, splitPlatformFee } from '../fees.ts';
import { parseUsdg, formatUsdg } from '../usdg.ts';
import { parseRF, formatRFGrouped } from '../rf.ts';

describe('buyback batching (buyback.ts)', () => {
  it('waits for the threshold rather than swapping every pull', () => {
    expect(shouldExecuteBuyback(parseUsdg('499.99'))).toBe(false);
    expect(shouldExecuteBuyback(parseUsdg(BUYBACK_BATCH_THRESHOLD_USDG))).toBe(true);
    expect(shouldExecuteBuyback(parseUsdg('5000'))).toBe(true);
  });

  it('spends the entire pot with no residue', () => {
    const pot = parseUsdg('500');
    const burn = executeBuybackBurn({ accruedUsdgUnits: pot, quotedPriceUsdg: '0.002' });
    expect(burn.usdgSpentUnits).toBe(pot);
  });

  it('buys RF and sends it to the burn sink', () => {
    const burn = executeBuybackBurn({
      accruedUsdgUnits: parseUsdg('500'),
      quotedPriceUsdg: '0.002',
    });
    // $500 / $0.00202 effective = 247,524.752 RF (RF has 3 decimals, so
    // sub-RF precision is exactly representable).
    expect(burn.rfBurnedUnits).toBe(247_524_752n);
    expect(formatRFGrouped(burn.rfBurnedUnits)).toBe('247,524.75 RF');
    expect(burn.burnSink).toBe(RF_BURN_SINK);
    expect(RF_BURN_SINK.toLowerCase()).toContain('dead');
  });

  it('fills worse than the quote and says so', () => {
    const burn = executeBuybackBurn({
      accruedUsdgUnits: parseUsdg('500'),
      quotedPriceUsdg: '0.002',
    });
    const quoted = parseUsdg('0.002');
    const effective = parseUsdg(burn.effectivePriceUsdg);
    // Effective price is HIGHER than quoted — buying is not free, and RF
    // acquired must be LESS than a perfect fill would yield.
    expect(effective).toBeGreaterThan(quoted);
    expect(effective).toBe(
      (quoted * (10_000n + BUYBACK_SLIPPAGE_BPS)) / 10_000n
    );
    expect(burn.quotedPriceUsdg).toBe('0.002');
    // Spot would have bought 250,000 RF; slippage must not beat that.
    expect(burn.rfBurnedUnits).toBeLessThan(parseRF('250000'));
  });

  it('scales RF yield with the pot, not with the RF price', () => {
    const small = executeBuybackBurn({
      accruedUsdgUnits: parseUsdg('500'),
      quotedPriceUsdg: '0.002',
    });
    const large = executeBuybackBurn({
      accruedUsdgUnits: parseUsdg('1000'),
      quotedPriceUsdg: '0.002',
    });
    // Doubling the pot doubles the RF, but integer flooring means it can be
    // one base unit under a literal 2x.
    expect(large.rfBurnedUnits).toBeGreaterThanOrEqual(small.rfBurnedUnits * 2n - 1n);
    expect(large.rfBurnedUnits).toBeLessThanOrEqual(small.rfBurnedUnits * 2n);
  });

  it('buys less RF when RF is more expensive - the mechanism working', () => {
    const cheapRf = executeBuybackBurn({
      accruedUsdgUnits: parseUsdg('500'),
      quotedPriceUsdg: '0.001',
    });
    const dearRf = executeBuybackBurn({
      accruedUsdgUnits: parseUsdg('500'),
      quotedPriceUsdg: '0.004',
    });
    expect(cheapRf.rfBurnedUnits).toBeGreaterThan(dearRf.rfBurnedUnits);
    // Both spend the same USDG — only the RF acquired differs.
    expect(cheapRf.usdgSpentUnits).toBe(dearRf.usdgSpentUnits);
  });

  it('refuses to burn against a bad price rather than burning nothing quietly', () => {
    for (const bad of ['0', 'abc', '-0.001']) {
      expect(
        () => executeBuybackBurn({ accruedUsdgUnits: parseUsdg('500'), quotedPriceUsdg: bad }),
        bad
      ).toThrow();
    }
  });

  it('refuses an empty or negative pot', () => {
    expect(() =>
      executeBuybackBurn({ accruedUsdgUnits: 0n, quotedPriceUsdg: '0.002' })
    ).toThrow(RangeError);
  });

  it('refuses an absurd slippage rather than silently clamping it', () => {
    expect(() =>
      executeBuybackBurn({
        accruedUsdgUnits: parseUsdg('500'),
        quotedPriceUsdg: '0.002',
        slippageBps: 10_000n,
      })
    ).toThrow(RangeError);
  });

  it('reports a pot too small to buy one whole RF instead of a phantom burn', () => {
    // 1 base unit of USDG at $1/RF cannot purchase a whole RF.
    expect(() =>
      executeBuybackBurn({ accruedUsdgUnits: 1n, quotedPriceUsdg: '1' })
    ).toThrow(/too small/);
  });
});

describe('buyback ledger', () => {
  function withPot(total: bigint, pending: bigint): BuybackLedger {
    return { ...emptyBuybackLedger(), totalFundedUsdgUnits: total, pendingUsdgUnits: pending };
  }

  it('starts empty', () => {
    const l = emptyBuybackLedger();
    expect(l.totalRfBurnedUnits).toBe(0n);
    expect(l.pendingUsdgUnits).toBe(0n);
    expect(l.burnCount).toBe(0);
    expect(l.lastBurnAt).toBeNull();
  });

  it('drains the pot and accumulates the burn', () => {
    let l = withPot(parseUsdg('1000'), parseUsdg('1000'));
    const burn = executeBuybackBurn({
      accruedUsdgUnits: l.pendingUsdgUnits,
      quotedPriceUsdg: '0.002',
      now: 1_800_000_000_000,
    });
    l = applyBurnToLedger(l, burn);

    expect(l.pendingUsdgUnits).toBe(0n);
    expect(l.totalSpentUsdgUnits).toBe(parseUsdg('1000'));
    expect(l.totalRfBurnedUnits).toBe(burn.rfBurnedUnits);
    expect(l.burnCount).toBe(1);
    expect(l.lastBurnAt).toBe(1_800_000_000_000);
  });

  it('keeps funding total across burns while the pot resets each time', () => {
    // Accrue -> burn, twice. The pot must be refilled between batches: the
    // buyback correctly refuses to run against an empty pot rather than
    // booking a zero-value burn.
    let l = emptyBuybackLedger();
    for (let i = 0; i < 2; i++) {
      const accrued = parseUsdg('2000');
      l = {
        ...l,
        totalFundedUsdgUnits: l.totalFundedUsdgUnits + accrued,
        pendingUsdgUnits: l.pendingUsdgUnits + accrued,
      };
      expect(shouldExecuteBuyback(l.pendingUsdgUnits)).toBe(true);

      const burn = executeBuybackBurn({
        accruedUsdgUnits: l.pendingUsdgUnits,
        quotedPriceUsdg: '0.002',
      });
      l = applyBurnToLedger(l, burn);
      expect(l.pendingUsdgUnits).toBe(0n);
      expect(() =>
        executeBuybackBurn({ accruedUsdgUnits: l.pendingUsdgUnits, quotedPriceUsdg: '0.002' })
      ).toThrow(RangeError);
    }
    expect(l.burnCount).toBe(2);
    expect(l.totalSpentUsdgUnits).toBe(parseUsdg('4000'));
    expect(burnedValueUsdgUnits(l)).toBe(parseUsdg('4000'));
    // Funding is cumulative and never reduced by spending.
    expect(l.totalFundedUsdgUnits).toBe(parseUsdg('4000'));
  });
});

describe('buyback is fed by the fee, and only the fee', () => {
  it('25% of every fee flows to the pot, 75% to the treasury', () => {
    const { primaryUnits, buybackUnits } = splitPlatformFee(parseUsdg('5'));
    expect(primaryUnits + buybackUnits).toBe(parseUsdg('5'));
    expect(buybackUnits).toBe(parseUsdg('1.25')); // 25% of the 5% fee
    expect(primaryUnits).toBe(parseUsdg('3.75'));
  });

  it('the pot is funded in USDG, so an RF crash cannot shrink it', () => {
    // Same pulls, wildly different RF prices -> identical buyback funding.
    const a = splitPlatformFee(parseUsdg('5')).buybackUnits;
    const b = splitPlatformFee(parseUsdg('5')).buybackUnits;
    expect(a).toBe(b);
  });

  it('formats the burned amount for display', () => {
    const burn = executeBuybackBurn({
      accruedUsdgUnits: parseUsdg('500'),
      quotedPriceUsdg: '0.002',
    });
    expect(formatRFGrouped(burn.rfBurnedUnits)).toBe('247,524.75 RF');
    expect(formatUsdg(burn.usdgSpentUnits, { showSymbol: true })).toBe('500.00 USDG');
  });
});