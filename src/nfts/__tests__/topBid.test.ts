/**
 * Top-bid market-data tests (OpenSea offers endpoints).
 * Global fetch is stubbed — no live OpenSea calls.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  __clearMarketCaches,
  getCollectionTopBid,
  getGenerationTopBid,
  isCollectionCriteriaOffer,
} from '../marketData.ts';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function offer(opts: {
  usd?: number;
  currency?: string;
  decimals?: number;
  status?: string;
  tokenId?: string | null;
  payToken?: string;
  traits?: { type: string; value: string }[] | null;
  /** NFT consideration quantity (bulk/criteria bids cover many items). */
  qty?: string;
  /** Omit the NFT consideration item entirely (legacy/aggregated shape). */
  noConsideration?: boolean;
}): Record<string, unknown> {
  const value =
    opts.usd !== undefined
      ? String(Math.round(opts.usd * 10 ** (opts.decimals ?? 6)))
      : '0';
  return {
    status: opts.status ?? 'ACTIVE',
    chain: 'robinhood',
    order_hash: '0xorder',
    asset: { contract: '0xabc', identifier: opts.tokenId ?? null },
    criteria:
      opts.tokenId != null
        ? null
        : {
            collection: { slug: 'test-coll' },
            contract: { address: '0xabc' },
            traits: opts.traits ?? null,
            numeric_traits: null,
          },
    price: { currency: opts.currency ?? 'USDG', decimals: opts.decimals ?? 6, value },
    protocol_data: {
      parameters: {
        offer: [{ token: opts.payToken ?? '0x5fc5360d0400a0fd4f2af552add042d716f1d168' }],
        consideration: opts.noConsideration
          ? []
          : [
              {
                token: '0xabc',
                itemType: 4,
                startAmount: opts.qty ?? '1',
                endAmount: opts.qty ?? '1',
                identifierOrCriteria: '0',
              },
            ],
      },
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  __clearMarketCaches();
});

describe('getCollectionTopBid', () => {
  it('takes the max ACTIVE convertible bid (endpoint is unsorted)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/offers/collection/')) {
        return jsonResponse({
          offers: [
            offer({ usd: 0.5 }),
            offer({ usd: 0.03 }),
            offer({ usd: 3.08 }),
            offer({ usd: 100, status: 'CANCELLED' }),
            offer({ usd: 50, status: 'EXPIRED' }),
          ],
          next: null,
        });
      }
      throw new Error('unexpected ' + url);
    });
    vi.stubGlobal('fetch', fetchMock);
    const top = await getCollectionTopBid('test-coll');
    expect(top?.topBidUsd).toBe('3.08');
    expect(top?.bidCurrency).toBe('USDG');
    expect(top?.source).toBe('collection_offers');
  });

  it('excludes trait-targeted bids from the collection fallback', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        offers: [
          offer({ usd: 999, traits: [{ type: 'Background', value: 'Red' }] }),
          offer({ usd: 1.25 }),
        ],
        next: null,
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    const top = await getCollectionTopBid('test-coll');
    expect(top?.topBidUsd).toBe('1.25');
  });

  it('returns null when no convertible bid exists', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ offers: [offer({ usd: 5, status: 'FULFILLED' })], next: null })
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await getCollectionTopBid('test-coll')).toBeNull();
  });

  it('converts non-stable payment tokens via payment-token lookup', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/payment_token/')) {
        return jsonResponse({ symbol: 'WETH', usdPrice: '2000' });
      }
      return jsonResponse({
        offers: [offer({ usd: 0, currency: 'WETH', decimals: 18, payToken: '0xweth' })],
        next: null,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    // value '0' → skipped (non-positive), so null.
    expect(await getCollectionTopBid('test-coll')).toBeNull();
  });

  it('divides bulk totals per item (live Generations shape: $0.50 × 25)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        offers: [
          offer({ usd: 0.5, qty: '25' }),
          offer({ usd: 0.12, qty: '1' }),
        ],
        next: null,
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    // $0.50/25 = $0.02/item loses to the $0.12 single — totals must not win.
    const top = await getCollectionTopBid('test-coll');
    expect(top?.topBidUsd).toBe('0.12');
  });

  it('divides multi-quantity Genesis bids (live shape: $3080 × 2 vs $1542 × 1)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        offers: [
          offer({ usd: 1542.01, qty: '1' }),
          offer({ usd: 1542.0, qty: '1' }),
          offer({ usd: 3080, qty: '2' }),
          offer({ usd: 1308, qty: '1' }),
        ],
        next: null,
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    // $3080/2 = $1540/item < $1542.01 — raw totals would wrongly pick $3080.
    const top = await getCollectionTopBid('test-coll');
    expect(top?.topBidUsd).toBe('1542.01');
  });

  it('skips dust and malformed quantities instead of inventing values', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        offers: [
          { ...offer({ usd: 0.5, qty: '25' }), price: { currency: 'USDG', decimals: 6, value: '3' } },
          { ...offer({ usd: 1, qty: '1' }), price: { currency: 'USDG', decimals: 6, value: 'notanumber' } },
        ],
        next: null,
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    // $0.000003/25 rounds to zero units → dust; malformed → skip. Both null → null top.
    expect(await getCollectionTopBid('test-coll')).toBeNull();
  });

  it('treats orders without quantity detail as single-item (pass-through)', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ offers: [offer({ usd: 7.5, noConsideration: true })], next: null })
    );
    vi.stubGlobal('fetch', fetchMock);
    expect((await getCollectionTopBid('test-coll'))?.topBidUsd).toBe('7.5');
  });
});

describe('getGenerationTopBid', () => {
  it('takes the max ACTIVE generation trait bid (NUMERIC mode)', async () => {
    const seen: string[] = [];
    const fetchMock = vi.fn(async (url: string) => {
      seen.push(String(url));
      return jsonResponse({
        offers: [offer({ usd: 9.99 }), offer({ usd: 2.5 }), offer({ usd: 4, status: 'EXPIRED' })],
        next: null,
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    const bid = await getGenerationTopBid('test-coll', 'Generation', '2');
    expect(bid?.topBidUsd).toBe('9.99');
    expect(seen[0]).toContain('mode=NUMERIC');
    expect(seen[0]).toContain('min_value=2');
  });

  it('returns null when no generation bids exist', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ offers: [], next: null }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getGenerationTopBid('test-coll', 'Generation', '0')).toBeNull();
  });

  it('divides bulk generation-trait totals per item', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        offers: [offer({ usd: 10, qty: '4' }), offer({ usd: 3, qty: '1' })],
        next: null,
      })
    );
    vi.stubGlobal('fetch', fetchMock);
    // $10/4 = $2.50/item loses to the $3 single.
    expect((await getGenerationTopBid('test-coll', 'Generation', '1'))?.topBidUsd).toBe('3');
  });
});

describe('isCollectionCriteriaOffer', () => {
  it('distinguishes item bids from collection criteria bids', () => {
    expect(
      isCollectionCriteriaOffer({ asset: { contract: '0xabc', identifier: '1' } })
    ).toBe(false);
    expect(
      isCollectionCriteriaOffer({
        asset: { contract: '0xabc', identifier: null },
        criteria: { collection: { slug: 'x' } },
      })
    ).toBe(true);
  });
});
