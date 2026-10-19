/**
 * Live $RAREFRIENDS price feed for the Creator Workshop.
 *
 * Only RF cashback prizes need this — NFT prizes are valued 1:1 from USD top
 * bids and USDG cashback is face value, so RF cashback is the single place a
 * volatile price can enter published RTP.
 *
 * The hook always resolves to a usable quote: if the fetch fails it returns the
 * documented fallback rate flagged `fallback`, so the workshop can never lock a
 * prize to an undefined rate.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getRareFriendsUsdPrice } from '../nfts/marketData.ts';
import {
  resolveRfQuote,
  type RfQuote,
  type LiveRfPriceLike,
} from '../domain/rfPricing.ts';

export interface RfPriceFeed {
  quote: RfQuote;
  loading: boolean;
  /** Set when the live fetch failed; the quote is still usable. */
  error: string | null;
  refresh: () => void;
}

export function useRfPrice(): RfPriceFeed {
  const [live, setLive] = useState<LiveRfPriceLike | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    setLoading(true);
    try {
      const price = await getRareFriendsUsdPrice();
      if (mine !== seq.current) return;
      if (price && Number(price.usdPrice) > 0) {
        setLive({ usdPrice: price.usdPrice, valuedAt: price.valuedAt });
        setError(null);
      } else {
        // A null price is not an error worth shouting about — the fallback
        // rate is applied and labelled.
        setLive(null);
        setError(null);
      }
    } catch (err) {
      if (mine !== seq.current) return;
      setLive(null);
      setError(err instanceof Error ? err.message : 'RF price unavailable');
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    quote: resolveRfQuote(live),
    loading,
    error,
    refresh: () => void load(),
  };
}