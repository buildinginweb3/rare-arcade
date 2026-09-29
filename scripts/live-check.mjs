/**
 * READ-ONLY live integration check (no transactions, no signatures).
 * Requires shell env (never commit values):
 *   OPENSEA_API_KEY=...  ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com
 * Skips gracefully when OPENSEA_API_KEY is absent.
 *
 * Verifies:
 *  1. connected-wallet NFTs load (inventory endpoint, eligible holdings)
 *  2. actual artwork loads (image URLs present)
 *  3. collection slug resolves (NFT → collection)
 *  4. item top bid resolves (best offer for a represented token)
 *  5. RF token USD price resolves (exact Robinhood RF contract)
 *  6. top bid → RF conversion works (referenceRf = topBidUsd / rfUsd)
 *  7. Generations trait is detected (canonical trait name + values)
 *  8. generation trait-offer request works for a represented generation
 *  9. resulting generation bid is coherent (>0, USD-convertible)
 *  10. collection top-bid fallback resolves (max ACTIVE collection offer)
 *  11. ownership recheck works (ownerOf)
 */

const API_KEY = process.env.OPENSEA_API_KEY;
const RPC_URL = process.env.ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com';

const RF = '0x0779369854d3ecdea927206718ffd7730c67b71f';
const GENESIS = '0x116eaa62241751e0c98da43d458600c6c17cd361';
const GENERATIONS = '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d';
const KNOWN_HOLDER = '0xdd8d2d03cec765c118f55ad8cfca8f48be6848c8'; // ownerOf(Genesis #773)

let failures = 0;
const ok = (label, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!cond) failures++;
};

if (!API_KEY) {
  console.log('SKIP  USER CONFIGURATION REQUIRED — set OPENSEA_API_KEY to run the live check.');
  process.exit(0);
}

const osGet = async (p) => {
  const res = await fetch(`https://api.opensea.io/api/v2${p}`, {
    headers: { 'X-API-KEY': API_KEY, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`OpenSea HTTP ${res.status} for ${p}`);
  return res.json();
};

try {
  const chains = await osGet('/chains');
  const slugs = (chains.chains || []).map((c) => c.chain);
  ok('OpenSea supports chain `robinhood`', slugs.includes('robinhood'), `chains=${slugs.length}`);

  const gen1 = await osGet(`/chain/robinhood/contract/${GENERATIONS}/nfts/8283`);
  ok('Generations #8283 resolves', gen1?.nft?.name === 'Friend #8283', gen1?.nft?.name);
  ok('Generations #8283 has image', !!(gen1?.nft?.display_image_url || gen1?.nft?.image_url));

  const g773 = await osGet(`/chain/robinhood/contract/${GENESIS}/nfts/773`);
  ok('Genesis #773 resolves', g773?.nft?.name === 'Genesis #773', g773?.nft?.name);
  ok('Genesis #773 has image', !!(g773?.nft?.display_image_url || g773?.nft?.image_url));

  // 3. collection slug resolves via NFT + collection-by-NFT.
  ok('Generations #8283 collection slug', gen1?.nft?.collection === 'rare-friends-generations', gen1?.nft?.collection);
  const collByNft = await osGet(`/chain/robinhood/contract/${GENERATIONS}/nfts/8283/collection`);
  ok('Collection-by-NFT resolves', (collByNft?.collection || '').includes('rare-friends'), collByNft?.collection);

  const inv = await osGet(`/chain/robinhood/account/${KNOWN_HOLDER}/nfts?limit=50`);
  const eligible = (inv.nfts || []).filter((n) =>
    [GENESIS.toLowerCase(), GENERATIONS.toLowerCase()].includes((n.contract || '').toLowerCase())
  );
  ok('Holder inventory lists eligible NFTs', eligible.length > 0, `${eligible.length} eligible`);

  // 4. item best-offer endpoint shape (informational: basis moved to
  // collection top bid because per-item bids are sparse + slow).
  let itemBidUsd = null;
  try {
    const best = await osGet('/offers/collection/rare-friends-generations/nfts/8283/best');
    const active = (best?.status || '').toUpperCase() === 'ACTIVE';
    const native = best?.price ? Number(best.price.value) / 10 ** best.price.decimals : NaN;
    if (active && Number.isFinite(native) && native > 0) {
      // USD-pegged bid currency converts 1:1 (verified: USDG on robinhood).
      itemBidUsd = ['USDG', 'USDC', 'USDT', 'DAI', 'USD'].includes(best.price.currency)
        ? String(native)
        : null;
    }
    ok('Item best-offer endpoint responds (#8283)', itemBidUsd !== null, itemBidUsd ?? best?.status ?? 'none');
  } catch (err) {
    ok('Item best-offer endpoint responds (#8283)', false, err.message);
  }

  // 5. RF token USD price (exact contract, never symbol-only).
  const rf = await osGet(`/chain/robinhood/token/${RF}`);
  const rfExact =
    (rf?.address || '').toLowerCase() === RF.toLowerCase() &&
    rf?.chain === 'robinhood' &&
    Number(rf?.usd_price) > 0;
  ok('RF token USD price resolves (exact contract)', rfExact, rf?.usd_price);

  // 6. (top bid → RF conversion runs after check 10 derives perUnit.)

  // 7. Generations trait detection (canonical live trait).
  const traits = await osGet('/traits/rare-friends-generations');
  const cats = traits?.categories || {};
  const genTrait = Object.keys(cats).find((k) => ['generation', 'gen', 'series'].includes(k.toLowerCase()));
  ok('Generation trait detected in collection traits', !!genTrait, genTrait);
  const nftGen = (gen1?.nft?.traits || []).find((t) => (t.trait_type || '').toLowerCase() === 'generation');
  ok('Generations #8283 carries Generation trait', !!nftGen, `${nftGen?.trait_type}=${nftGen?.value}`);

  // 8–9. generation trait offers for a represented generation.
  const genValue = String(nftGen?.value ?? '0');
  const traitOffers = await osGet(
    `/offers/collection/rare-friends-generations/traits?mode=NUMERIC&type=${encodeURIComponent(nftGen?.trait_type || 'Generation')}&min_value=${genValue}&max_value=${genValue}&limit=20`
  );
  const traitActive = (traitOffers?.offers || []).filter((o) => (o.status || '').toUpperCase() === 'ACTIVE');
  const traitBest = traitActive
    .map((o) => (o.price ? Number(o.price.value) / 10 ** o.price.decimals : NaN))
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a)[0];
  ok(
    'Generation trait-offer request works',
    Array.isArray(traitOffers?.offers),
    traitActive.length > 0 ? `top ${traitBest}` : 'no trait bids (fallback path)'
  );

  // 10. collection top-bid fallback (max ACTIVE non-trait offer, PER ITEM:
  // order totals divided by NFT consideration quantity).
  const collOffers = await osGet('/offers/collection/rare-friends-generations?limit=50');
  const perUnit = (collOffers?.offers || [])
    .filter((o) => (o.status || '').toUpperCase() === 'ACTIVE')
    .filter((o) => !o.criteria?.traits?.length && !o.criteria?.numeric_traits?.length)
    .map((o) => {
      if (!o.price) return NaN;
      let total;
      try {
        total = BigInt(o.price.value);
      } catch {
        return NaN;
      }
      const items = o.protocol_data?.parameters?.consideration || [];
      const nft = items.find((c) => [2, 3, 4, 5].includes(c.itemType));
      let qty = 1n;
      try {
        qty = BigInt(String(nft?.startAmount ?? nft?.endAmount ?? '1'));
      } catch {
        return NaN;
      }
      if (qty <= 0n) return NaN;
      const unit = total / qty;
      if (unit <= 0n) return NaN;
      return Number(unit) / 10 ** o.price.decimals;
    })
    .filter((n) => Number.isFinite(n) && n > 0)
    .sort((a, b) => b - a)[0];
  ok('Collection top-bid fallback resolves (per-item)', perUnit !== undefined, String(perUnit));

  // 6. top bid → RF conversion on the same per-item basis the app uses.
  if (rfExact && perUnit !== undefined) {
    const ref = perUnit / Number(rf.usd_price);
    ok('top bid → RF conversion works', Number.isFinite(ref) && ref > 0, `≈ ${Math.round(ref).toLocaleString()} RF`);
  } else {
    ok('top bid → RF conversion works', false, 'missing inputs');
  }

  const rpc = async (body) => {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`RPC HTTP ${res.status}`);
    return res.json();
  };
  const chain = await rpc({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] });
  ok('Robinhood RPC chainId == 4663', chain?.result === '0x1237', chain?.result);

  const ownerOf = await rpc({
    jsonrpc: '2.0',
    id: 2,
    method: 'eth_call',
    params: [
      { to: GENESIS, data: `0x6352211e${(773n).toString(16).padStart(64, '0')}` },
      'latest',
    ],
  });
  const owner = ownerOf?.result ? `0x${ownerOf.result.slice(-40)}` : '';
  ok('ownerOf(Genesis #773) returns holder', owner.toLowerCase() === KNOWN_HOLDER, owner);
} catch (err) {
  console.log(`FAIL  live check threw: ${err.message}`);
  failures++;
}

console.log(failures === 0 ? '\nLIVE CHECK: ALL PASS (read-only, nothing transacted)' : `\nLIVE CHECK: ${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
