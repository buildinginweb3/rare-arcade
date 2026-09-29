# RARE ARCADE — Implementation Progress

## Project Overview
- **Project**: RARE ARCADE
- **Category**: Token Activity (Rare Friends Vibeathon)
- **Tagline**: Build the Machine. Seed the Prizes. Burn RF with Every Pull.
- **Status**: COMPLETE — ready for review & Vibeathon PR authorization

---

## Phase Checklist

- [x] **Phase 1: Research & Rules Verification**
  - Read official Vibeathon README & FriendSDK specs / notices.
  - Confirmed non-SDK standalone web application eligibility.
  - Verified 100% simulated purchases & rewards requirement.
  - Identified official Rare Friends 16x16 monochrome bitmap sprite format and Apache 2.0 license terms.

- [x] **Phase 2: Project Scaffolding & Toolchain**
  - Initialize Vite + React + TypeScript + Vitest in WSL2 / Ubuntu environment.
  - Configure strict TypeScript settings.
  - Configure Vitest for fast, reliable domain testing.
  - Install Playwright for E2E testing and screenshot verification.

- [x] **Phase 3: Domain Core & Economics Engine**
  - Implement fixed-point RF accounting (`1 RF = 1000 units`, `500 bps = 5% burn`).
  - Implement domain models (`Machine`, `Prize`, `Ticket`, `LedgerEvent`).
  - Implement finite ticket deck generator with secure crypto PRNG and deterministic seedable PRNG for tests.
  - Implement economics engine: EV calculation, initial RTP, live remaining RTP, operator margin, sellout totals, target RTP solver.
  - Implement state machine lifecycle (`DRAFT`, `READY`, `LIVE`, `SOLD_OUT`, `CANCELLED`).
  - Implement immutable publish lock on first pull & pre-pull cancellation refunds.
  - Implement immutable event ledger.
  - Write comprehensive domain unit tests covering all 17+ economic invariants.

- [x] **Phase 4: Persistence & Storage Migration**
  - Implement versioned localStorage persistence (`rare-arcade:v1`).
  - Implement schema validation, corruption recovery, and `RESET DEMO DATA`.
  - Implement separate simulated identities: Demo Player vs Creator/Operator.
  - Test persistence & reset workflows.

- [x] **Phase 5: Art Bible & Monochrome Pixel Design System**
  - Write `ART_BIBLE.md`.
  - Author reusable pure monochrome pixel icon library (RF, burn, friend, pull, machine, creator, player, prize, odds, lock, sold out, etc.).
  - Design 4 distinct pixel cabinet silhouettes (`CLASSIC`, `CAPSULE`, `TALLBOY`, `MINI`).
  - Establish crisp pixel rendering rules and layout components.
  - Seed demo Rare Friends pixel art roster using authentic 16x16 bitmaps.

- [x] **Phase 6: Audio & Motion FX System**
  - Synthesize lightweight WebAudio retro 8-bit bleeps (insert coin, pull crank, roll, burn sizzle, prize win, jackpot fanfare).
  - Include master Mute toggle.
  - Implement `prefers-reduced-motion` compliance.

- [x] **Phase 7: Arcade Floor & Machine Cabinets**
  - Build Arcade Floor with visual pixel cabinets.
  - Idle animations (subtle LCD mascot blink, prize window pulse).
  - Quick filter/sort pills (New, Lowest Cost, Highest RTP, Biggest Prize, Fewest Left).
  - Compact stats header: Demo Player RF, Demo Creator RF, Global RF Burned, switch mode.

- [x] **Phase 8: Machine Detail & Physical Pull Experience**
  - Machine Detail view with dominant pixel cabinet.
  - Live odds table (always sums to 100%, updates as inventory diminishes).
  - Full prize pool inspection drawer.
  - Machine Rules Lock & Transparency panel.
  - Pull sequence: RF token insert -> 95/5 split -> pixel burn dissolve -> drum shake -> prize hatch opening -> prize reveal.
  - Result cards: RF win (token stack), Rare Friend win (framed card + simulated badge), try again.

- [x] **Phase 9: Creator Workshop & Machine Creation Wizard**
  - Multi-step compact workshop:
    1. Machine Name & Shell
    2. Seed Rare Friends (from Demo Owned inventory drawer)
    3. Seed RF Rewards (amount x quantity)
    4. Set Pull Price
    5. Set Target RTP & Recommended Ticket Count solver
    6. Economics & Odds Live Preview (with 25%, 50%, 100% sellout scenarios)
    7. Publish simulation (with publish lock warning)
  - Pre-first-pull machine cancellation (returns escrow).

- [x] **Phase 10: Creator Dashboard & RF Activity Screen**
  - Creator Dashboard: My machines, live pull counts, gross receipts, burn generated, prize inventory.
  - RF Activity Screen: Global browser-level Token Activity metrics (RF spent, RF burned, pulls, machines created, prizes paid, live chronological ledger).

- [x] **Phase 11: Seeded Demo Fixtures & Onboarding**
  - 3 initial demo machines (`FRIEND JACKPOT`, `RF RAIN`, `HIGH ROLLER`).
  - First-time visitor onboarding modal explaining the 30-second concept.
  - Dismissible player guide on first machine visit.

- [x] **Phase 12: Optional Read-Only Wallet Integration**
  - Clean, optional read-only Robinhood mainnet address detection.
  - Absolutely NO transaction requests, NO approvals, NO signatures.
  - Graceful fallback to demo owned inventory.

- [x] **Phase 13: Responsive Polish & Accessibility**
  - Mobile testing at 360px, 390px, 430px.
  - Keyboard navigation, visible focus rings, ARIA tags, high contrast text.
  - Fixed 390px horizontal overflow: MachineDetail grid changed to
    `repeat(auto-fit, minmax(300px, 1fr))` (stacks to single column on narrow screens);
    AppHeader right controls given `flexWrap: wrap`.

- [x] **Phase 14: Automated Tests, Visual QA & Documentation**
  - Unit tests for all invariants (Vitest).
  - Playwright E2E tests covering creator flow and player flow.
  - 18 visual QA screenshots captured and inspected.
  - Produce `ECONOMY_SPEC.md`, `SUBMISSION_NOTES.md`, `README.md`.

---

## Final Verification (2026-09-28)

- **TypeScript build**: PASSES CLEANLY — `npm run build` → `tsc --noEmit && vite build`,
  51 modules, ~336 kB bundle, 0 errors.
- **Vitest unit tests**: 23/23 PASSING (`npx vitest run --exclude 'tests/**'` →
  2 files, 23 tests passed). Note: bare `npx vitest run` also collects `tests/*.spec.ts`
  (Playwright specs) which fail to parse under Vitest — expected, not a code bug.
- **Playwright E2E**: 4/4 PASSING on chromium
  (`npx playwright test tests/e2e.spec.ts --project=chromium`).
- **Visual QA**: 1/1 PASSING, 18 screenshots in `screenshots/` (01-home → 18-mobile-create).
- **Docs**: README.md, SUBMISSION_NOTES.md, ECONOMY_SPEC.md, ART_BIBLE.md present.

### Playwright system-deps workaround (no sudo in this environment)

`npx playwright install-deps chromium` requires sudo (password prompt) and fails here.
Rootless workaround used instead — download + extract Ubuntu libs locally, then run
tests with `LD_LIBRARY_PATH`:

```bash
mkdir -p /tmp/pwlibs && cd /tmp/pwlibs \
  && apt-get download libnspr4 libnss3 libasound2t64 \
  && mkdir -p extract && for f in *.deb; do dpkg-deb -x "$f" extract; done
export LD_LIBRARY_PATH=/tmp/pwlibs/extract/usr/lib/x86_64-linux-gnu:$LD_LIBRARY_PATH
npx playwright test tests/e2e.spec.ts --project=chromium
npx playwright test tests/visual-qa.spec.ts --project=chromium
```

### Test-selector & layout fixes applied 2026-09-28

- `tests/e2e.spec.ts` / `tests/visual-qa.spec.ts`: scoped `PRIZES`/`ODDS`/`RULES` clicks to
  `.cabinet-controls` (previously matched nav `MY PRIZES` and navigated to inventory);
  scoped `BUILD MACHINE` / `CREATOR DASH` / `RF ACTIVITY` / `ARCADE FLOOR` clicks to `nav`;
  scoped machine-card clicks to `.cabinet-container:has-text(...)`; used `.first()` for
  `text=Grim Hollow` (appears in cabinet top-prize label, ledger seeding event, and modal).
- `src/pages/MachineDetail.tsx`: responsive grid fix (see Phase 13).
- `src/components/ui/AppHeader.tsx`: right-controls `flexWrap: wrap` (see Phase 13).
- Rebuilt `dist/` via `npm run build` so Playwright preview serves fresh bundle.

### Preview

```bash
wsl bash -lc "cd '/mnt/c/Users/Timothy/Desktop/Rare Arcade' && npm run dev"
# then open http://localhost:5173 in Windows browser
```

Awaiting user authorization to submit the Vibeathon PR (DO NOT submit without explicit approval).
No contracts deployed, no NFTs transferred, no real funds spent — all activity simulated.

---

# V2 PASS — Real NFTs, Custom RTP, Rescaled RF (2026-09-28)

## AUDIT (V1 as found)
1. **Architecture**: pure static SPA (Vite 6 + React 19 + TS, `base: './'`); tab-state
   routing in `App.tsx` (no router/backend); localStorage key `rare-arcade:v1`, schema v1.
2. **NFT visual source**: hand-drawn 16x16 `spriteRows` in `demoFriends.ts`, rendered by
   `RareFriendSprite` (SVG rects) everywhere. Not real NFT art.
3. **Ownership behavior**: none — hardcoded `0xDemoCreator4663`, `ownedFriends` seeded
   with all 6 fake friends; `connectedWalletAddress` setting existed but unused.
4. **RTP restriction**: presets 80/85/90/95% + `createMachine` threw outside 75–95%.
5. **RF defaults**: pulls 2–25 RF, prizes 2–100 RF, balances 1,000 RF; workshop
   defaults pull `10`, RF prize `50`x2, friend ref `75`.

## OPENSea
6. Plain REST (no SDK): `GET /api/v2/chain/robinhood/account/{addr}/nfts`
   (`X-API-KEY`, `limit` ≤ 200, `next` cursor). SDK is trading-oriented; tool-sdk is
   agent-registry — both overkill for read-only discovery.
7. Selected for minimalism: one `fetch`, server-side cache (60s TTL), zero new deps.
8. Robinhood verified: `chain=robinhood` in OpenSea ChainIdentifier enum; RPC
   `eth_chainId` → `0x1237` (4663); `ownerOf` reads succeed.
9. Genesis `0x116eaa62241751e0c98da43d458600c6c17cd361` — verified (GENESIS, ERC-721).
10. Generations `0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d` — verified (ERC721).
11. `api/rare-friends.ts` (Vercel) + `api/_nfts.ts` (shared logic) + Vite dev
    middleware serving the same code locally. Routes: `?address=`, `?action=verify`,
    `?action=config`.
12. Key: server env `OPENSEA_API_KEY` only (Vercel settings / shell export for dev).
    Never `VITE_`-prefixed; repo grep confirms no key committed.
13. Pagination: loops `next` cursor, max 5 pages × 100, `truncated` flag beyond that.
14. Cache: 60s in-memory keyed by wallet; verify endpoint NEVER cached (fresh `eth_call`).

## OWNERSHIP
15. Raw EIP-1193 `window.ethereum` (`eth_requestAccounts` only). No tx/sign.
16. Proxy list → `normalizeInventoryPage` → exact contract allowlist match.
17. `verifyNftOwnerRemote` → server `eth_call ownerOf` → address compare (lowercased).
18. Re-verified per-NFT inside `handlePublish` before `createMachine`; mismatch/ RPC
    failure blocks with OWNERSHIP CHANGED / COULD NOT BE VERIFIED.
19. `collectReservedNftKeys` blocks same real NFT in two LIVE local machines
    (chainId:contract:tokenId). System-demo display refs never reserve.
20. Wallet change: `useOwnedNfts` refetches, selection cleared; stale selection fails
    `canFundAsset` via reportedOwner mismatch.

## NFT VISUALS
21. Priority: `display_image_url` → `image_url` → `original_image_url`; constructed
    OpenSea URL fallback; empty image → UNAVAILABLE frame (never substitute art).
22. Genesis tested live: #773 metadata + SVG image resolve.
23. Generations tested live: #8283 metadata + SVG image resolve.
24. Failure: pixel frame "NFT MEDIA UNAVAILABLE + collection/token + VIEW ON OPENSEA".
25. Reveal uses actual art + "YOU PULLED … SIMULATED WIN • NO NFT HAS BEEN TRANSFERRED";
    inventory marks SIMULATED WIN (never on-chain ownership).

## RTP
26. Presets 80/85/90/95% kept + CUSTOM button + numeric % field.
27. `parseRtpPercentToBps`: positive finite, decimals, technical cap 100000 bps.
28. <80%: allowed, exact math, shown publicly. 29. >95%: PLAYER-FAVORABLE warning.
    30. >100%: CREATOR-SUBSIDIZED label + negative margin. 31. Target vs actual both
    shown (2-decimal). 32. Warnings are labels, never blocks. 33. Lock after first
    pull unchanged (`isRulesLocked`).

## RF ECONOMICS
34. Default pull `2,500 RF`. 35. Picks `1,000/2,500/5,000/10,000`. 36. Prize picks
    `5,000/10,000/25,000/50,000/100,000` + custom. 37. Player `250,000 RF`.
    38. Creator `2,500,000 RF` (all simulated). 39. Fixtures: RF RAIN
    (1,000×100, 90.00%), FRIEND FRENZY (5,000×100, Generations #8283 @250k ref,
    90.00%), HIGH ROLLER (10,000×30, Genesis #773 @150k ref, 90.00%).
    40. `formatRFGrouped` exact (`2,500,000.00 RF`); `formatRFCompact` tight spaces.

## VALIDATION
41. Unit: 68/68 (normalize 13, ownership 8+2, customRtp 15+4, highRf 6+3, legacy 18+6).
42. Ownership: allow/block/mismatch/RPC-fail/duplicate/wallet-change/reservation.
43. RTP: presets + 72.5/97/100/107.5/110/125, invalid set, cap, warnings, persistence.
44. High-RF: formatting, burn/EV/RTP, 30-pull sellout reconciliation, 100M no-drift.
45. E2E: old 4/4 (rescaled) + new V2 3/3 (mocked wallet/proxy: fund→107.5%→publish→pull;
    mismatch blocked; 360/390/430 overflow clean).
46. Typecheck: `tsc --noEmit` clean. 47. Build: Vite 51+ modules, ~364 kB, 0 errors.
48. Desktop screenshots 01–15, 19–24. 49. Mobile 16–18, 25–26 (390px + 360/430 asserts).
50. Live: `npm run check:live` 8/8 PASS (read-only; key from env, never committed).
    Without key: graceful `USER CONFIGURATION REQUIRED` skip.

## SECURITY
51. Grep audit: API key absent from repo; only `VITE_MOCK_NFTS` (non-secret test flag)
    is client-visible. Proxy sets `Cache-Control: no-store`.
52. Address/contract/tokenId validated server-side; eligibility = exact contract match;
    OpenSea URLs built from verified parts; external links `noopener noreferrer`.
53. No transfer/approval/sign code paths exist (wallet used for address only).
54. No RF movement outside simulated ledger (subRF/addRF, localStorage only).

## FILES
55. New: `api/_nfts.ts`, `api/rare-friends.ts`, `scripts/live-check.mjs`, `.env.example`,
    `src/nfts/*` (11 files), `src/domain/rtp.ts`, `src/domain/demoEconomy.ts`,
    4 unit-test files, `tests/e2e-v2.spec.ts`. Changed: types/deck/machine/economics/rf,
    storage, demoMachines, App, CreatorWorkshop (rewrite), CabinetView, PrizePoolModal,
    OddsModal, ArcadeFloor, MachineDetail, CreatorDashboard, PlayerInventoryPage,
    AppHeader(wrap), OnboardingModal, vite.config, e2e.spec, visual-qa.spec, package.json.
56. Docs: README, ECONOMY_SPEC, ART_BIBLE, IMPLEMENTATION_PROGRESS (this), `.env.example`.
57. Env required: `OPENSEA_API_KEY` (server), optional `ROBINHOOD_RPC_URL`.

## REMAINING USER ACTION
58. Set `OPENSEA_API_KEY` in deployment (Vercel settings) or shell for `npm run dev`;
    without it the NFT drawer shows a retryable configuration error (by design).
59. Deploy: `vercel` (api/ auto-detected) or any static host + separate proxy URL
    (point `apiClient` base at it — currently same-origin `/api/rare-friends`).
60. Nothing else blocks demo use: mocked E2E + unit suites pass without credentials.

Awaiting user authorization to submit the Vibeathon PR (DO NOT submit without explicit approval).
No contracts deployed, no NFTs/APPROVALS/transactions, no real RF moved — verified by code audit above.

---

# PASS — $RF coin, workshop restyle, shell pull-FX (2026-09-28)

## Bugs fixed
- Token-top machines (e.g. RF RAIN) showed a random RareFriend mascot sprite as
  their top prize on the floor + detail LCD. Now: `selectTopPrizeVisual()` picks
  NFT art/sprite, the new `$RF` pixel coin (`RfCoin.tsx`, 16x16 monochrome grid),
  or the mascot only when nothing remains. RF win reveal also uses the coin.
- Shell picker was cosmetic-only: `cabinet-shell-*` classes had no styles and all
  shells played the drum shake. Now every shell has a distinct stepped pull
  animation + subtle silhouette CSS.

## Shell pull-FX (`pullFx.ts` + `PullAnimation.tsx`, all monochrome steps())
- CLASSIC: drum shake (original `anim-shake` + burn flicker).
- CAPSULE: claw rig drops on a rail, grabs over a prize pit ("LOWERING THE CLAW...").
- TALLBOY: 3 staggered slot reels spinning ★/◆/●/$ ("SPINNING THE REELS...").
- MINI: rotating hand crank + hopping housing ("CRANKING THE MINI DRUM...").
- Reduced-motion renders static frames. Picker cards show `PULL FX: …` labels.

## Workshop restyle (steps 1–3, same pixel/tamagotchi language)
- Marquee step headers, `workshop-tray` cartridge slots with black label strips,
  LCD stat tiles, numbered prize rows with icon tiles, qty −/+ stepper,
  3-tile escrow readout (REQUIRED / BALANCE / FUNDED–SHORTFALL), launch-pad tray.
- All E2E hooks preserved (labels, input order, placeholders).

## Validation
- `tsc` clean; vitest 78/78 (10 new: coin grid, top-visual selection, shell map).
- Playwright 22/22 (chromium + mobile): incl. new 05 ($RF coin) + 06 (claw caption
  mid-pull). Fresh screenshots re-captured; claw/reels/crank frames inspected.

---

# PASS — Direct client mode with burner OpenSea key (2026-09-28)

## Change
Per user instruction, the server-side proxy was removed. The browser now calls
OpenSea API v2 + the public Robinhood RPC directly using a user-supplied burner
key baked into the client bundle (`OPENSEA_API_KEY` in `src/nfts/apiClient.ts`).

## Files
- Rewrote `src/nfts/apiClient.ts`: direct `GET .../chain/robinhood/account/{addr}/nfts`
  with pagination + client-side `normalizeInventoryPage`; direct `eth_call ownerOf`
  to `https://rpc.mainnet.chain.robinhood.com` with allowlist + token validation.
  Same exports/signatures/mock mode — no other app code changed.
- Rewired test interceptions to raw OpenSea shape (`{ nfts, next }`) + RPC route
  (`**/rpc.mainnet.chain.robinhood.com/**`, padded `ownerOf` result) in
  `tests/e2e-v2.spec.ts`, `tests/visual-qa.spec.ts`.
- Deleted `api/` (`_nfts.ts`, `rare-friends.ts`) and the Vite dev middleware.
- Updated README (burner-key section + warning), `scripts/live-check.mjs` header,
  and cosmetic proxy mentions in storage/normalize/types/tests.

## Security note (accepted by user)
The key ships in the built JS and is visible in devtools. It is a throwaway:
401/429 → rotate at opensea.io/settings/developer and replace the constant.
Key confirmed present in `dist` bundle (1 match).

## Validation
- `tsc` clean; vitest 78/78; Playwright 22/22 (chromium + mobile).
- Real-browser live check (headed equivalent via page.evaluate): OpenSea 200 with
  3 NFTs + RPC chainId `0x1237` — direct-client path proven without interception.
- CORS confirmed for both endpoints (`access-control-allow-origin` present).

---

# PASS — Animation pacing, dome removal, dashboard sync (2026-09-28)

## Animation pacing (were WAY too fast to see)
- Pull window extended 1400ms → 3000ms (`MachineDetail`), loops slowed to match:
  claw 1.4s→2.8s, reels 0.55s→1.2s, crank 0.9s→1.6s, mini-hop 0.7s→1.2s.
- Burn icon converted from a 0.6s vanish (`forwards`) to a steady 0.9s pulse so
  it stays alive for the whole window.
- E2E pull-completion waits updated 2000/1500ms → 3400ms (4 spots).

## Rounded domes removed
- Deleted the capsule header `border-radius` dome; capsule keeps an angular
  double-weight header edge instead. Crank dial rebuilt as a hard-edge octagon
  (`clip-path` ring, no `border-radius`). Repo-wide grep confirms zero
  `border-radius`/`borderRadius` remains in src. ART_BIBLE §9 updated (3s
  sequence, per-shell beats, no-rounded-geometry rule).

## Dashboard sync bug (root cause + fix)
- Root cause: workshop publishes with `creatorAddress = wallet || demoId`, but
  the dashboard filtered `m.creatorAddress === creator.address` (demo id only),
  so every wallet-published machine — and all its stats — vanished from the
  dashboard. Same mismatch blocked cancel rights (`MachineDetail`) and operator
  receipt credit (`App.handlePlayerWonPrize`).
- Fix: `buildOperatorAddresses` / `isOperatorMachine` / `selectOperatorMachines`
  helpers (`nfts/ownership.ts`, unit-tested); dashboard filters by the set,
  shows a TRACKING n MACHINE(S) identity line; cancel + receipt credit accept
  the set too (case-insensitive).
- Regression coverage: 3 ownership unit tests + new E2E (connect wallet →
  publish → pull → dashboard lists machine with live `1 / 9` pulls).

## Validation
- `tsc` clean; vitest 81/81; Playwright 24/24 (chromium + mobile, incl. new
  05 $RF-coin, 06 claw-caption, dashboard-sync tests). Claw + octagon-crank
  mid-pull frames inspected. NOTE: kill stale `vite preview` orphans before
  full runs — `reuseExistingServer` will otherwise serve an old dist and fail
  new-code assertions against a stale bundle.

---

# PASS — Fixed Odds second machine model (2026-09-28)

## What was added
- **Domain model**: `Machine = FiniteDeckMachine | FixedOddsMachine` discriminated
  union (`machineType: 'finite_deck' | 'fixed_odds'`); per-prize `oddsPpm` on
  RF/Friend entries (ignored by Finite Deck); `machineType` + `rollPpm` on
  ledger events; `machineType`/`rollPpm`/`newPrizesRemaining` on PullResult.
- **fixedOddsEngine** (`src/domain/fixedOdds.ts`): ppm parse/format (0.0001%
  granularity, no float drift), validation (≤100%, NFT qty 1, dup detection,
  no NO_PRIZE entries), order-independent intervals, miss-on-sold-out
  resolution, configured/live-available RTP (exact bigint EV), creator edge,
  base/sold-out/effective no-prize, realized payout ratio, TARGET RTP ASSIST
  (proportional + largest-remainder, capped flag), seeded Monte Carlo lifetime
  simulator (median/P25/P75, volume/burn/receipts/net, early/long-tail, censored
  count; pure, never mutates), creation + independent-roll pulling with
  synthetic tickets.
- **Strategy dispatch**: `pullMachine`/`cancelMachine` overloaded per model;
  `isMachineSoldOut` per-model sellout; Finite Deck paths byte-identical.
- **Builder**: step-1 FINITE DECK / FIXED ODDS selector cards (deck/dial icons,
  strategy bullets); step-2 per-line odds editor (quick picks + custom, RF qty
  stepper, NFT qty locked 1, live TOTAL/NO-PRIZE bar); step-3 SET ODDS / TARGET
  RTP modes, assist-apply, fixed summary tiles, VIEW RISK MODEL (lazy 600-run
  MC), publish validates ≤100% + re-verifies NFTs.
- **Player UX**: type badges everywhere; floor ALL/FINITE/FIXED filters; fixed
  prize table (sold-out slots keep chance, base/sold-out/effective no-prize,
  explainer); transparency shows configured/live-available/edge/modeled range;
  sold-out report (pulls, spent, burned, receipts, distributed, configured vs
  realized); PrizePool + Rules modals branched; LCD shows PULLS MADE + prizes.
- **Dashboard**: TYPE badges, branched pulls/RTP cells, LOW STOCK flag,
  EST SELLOUT column (150-run memoized MC), identity line kept.
- **Fixtures/migration**: FRIEND FOREVER (Fixed Odds, 2,500 RF, 80.00%
  configured, real Generations #5147 art — verified live); schema v3 with
  preserving v2→v3 migration (legacy machines stamped finite_deck, fixture
  appended, no reset).
- **Help/docs**: onboarding model comparison, ECONOMY_SPEC §9–11 (formulas,
  impossibility disclosure, deferred restock), ART_BIBLE untouched (already
  covers both), this log.
- **Deferred**: restocking (documented future path); share codes N/A (no
  such feature in repo).

## Validation
- `tsc` clean; vitest 116/116 (34 new fixedOdds engine tests + 4 storage
  migration tests); Playwright 32/32 chromium+mobile (new e2e-fixed-odds:
  build/assist/risk/publish/pull, deterministic 100% NFT sold-out slot,
  360/390/430 overflow); 12 new screenshots (27–38) inspected; live
  `check:live` 8/8 read-only.
- No real NFT/RF movement anywhere: wallet stays read-only, funding simulated,
  burner key is user-supplied client-side per prior instruction.

---

# PASS — Generalized NFT inventory + automatic floor-reference valuation (2026-09-29)

## AUDIT (as found)
- Wallet: raw EIP-1193 read-only connect; `useOwnedNfts` fetched ONLY Robinhood
  Rare Friends (`fetchOwnedRareFriends`, allowlist-filtered).
- OpenSea: direct client, burner key literal in `apiClient.ts`, endpoints used:
  account NFTs (robinhood) + `ownerOf` RPC. No floors, no token pricing.
- Manual NFT RF input (`friendRefValStr` + suggestion chips) fed
  `referenceValueUnits` for both Finite Deck and Fixed Odds. RTP/EV, deck,
  fixed-odds engine, 5% burn, locks all preserved and reused unchanged.
- Storage v3, fixtures with manual refs (FRIEND FRENZY 250k, HIGH ROLLER 150k,
  FRIEND FOREVER 250k).

## OPENSea DOCS (verified live, not from tutorials)
- `GET /api/v2/chains` → 30 chains incl. `robinhood`.
- `GET /api/v2/chain/{chain}/account/{address}/nfts` → Nft list shape
  (collection, contract, identifier, token_standard, traits, is_disabled/
  is_nsfw/is_suspicious, estimated_value_usd — info only).
- `GET /api/v2/collections/{slug}/stats` → total.floor_price + symbol.
- `GET /api/v2/collections/{slug}/floor_prices` → floor_prices[].usd_price
  (preferred USD source).
- `GET /api/v2/traits/{slug}` → categories/counts (Generation = number 0–6,
  hence absent from per-value trait floors).
- `GET /api/v2/traits/{slug}/floors` → text-trait floors (not usable for
  numeric Generation — uses best-listings instead).
- `GET /api/v2/listings/collection/{slug}/best?traits=` → ACTIVE listings ASC
  with price.current {currency, decimals, value} + payment-token address.
- `GET /api/v2/chain/{chain}/token/{address}` → usd_price (RF).
- `GET /api/v2/chain/{chain}/payment_token/{address}` → usdPrice (conversion).
- `GET /api/v2/chain/{chain}/contract/{a}/nfts/{id}` (+ `/collection`,
  `POST /api/v2/nfts/batch`, `POST /api/v2/tokens/batch` shapes verified).

## LIVE DATA (read-only, 2026-09-29)
- Generation trait: trait_type `"Generation"`, string values `"0"`–`"6"`.
- RF (robinhood 0x0779…b71f): ~$0.00137 (moves).
- Generations floor: ~$0.04–0.05 USDG; Genesis floor: 1647 USDG.
- Gen floors via trait-filtered listings: Gen0 $0.05, Gen1 $288, Gen2 $9.99,
  Gen3 $1.75, Gen6 $0.05 — materially different per generation.
- 18/18 `npm run check:live` PASS (extended to floors, trait filter, RF).

## WHAT CHANGED
- New: `nfts/chains.ts` (registry, priority scan), `nfts/marketData.ts`
  (central service: floors, generation floors, RF price, 45s/3min caches,
  dedupe, concurrency 4, 429 backoff), `nfts/valuation.ts` (exact
  floorUsd/rfUsd math → 0.001 RF, badges, 15min publish freshness),
  `nfts/apiKey.ts` (VITE_OPENSEA_API_KEY → bundled demo fallback),
  `nfts/NftPicker.tsx` (pinned Rare Friends, floor-DESC groups, search/sort/
  chain filters, DETAILS popovers, pagination).
- Generalized: `nfts/types.ts` (NftAsset + ValuationSnapshot), `normalize.ts`
  (generic normalization, generation detection incl. Gen/Series spellings,
  groupAndSortCollections), `apiClient.ts` (generic ownership re-query +
  source labeling), `ownership.ts` (slug-aware keys), `useOwnedNfts.ts`
  (usePricedInventory pipeline), `domain/types.ts` (snapshot + generic fields
  on prizes), `machine.ts`/`fixedOdds.ts` (snapshot propagation),
  `storage.ts` v4 (legacy_manual stamps, demo_snapshot fixtures),
  `demoMachines.ts` (demo snapshots), `CreatorWorkshop.tsx` (no manual input,
  auto valuation panel, pre-publish refresh + locked snapshots, publish
  confirmation copy), `PrizePoolModal.tsx` + `RulesLockModal.tsx`
  (transparency), README / ECONOMY_SPEC §12 / OnboardingModal copy,
  `scripts/live-check.mjs` (18 checks), 21 new unit tests, E2E mocks updated
  to endpoint-specific handlers.
- Preserved: pixel/Tamagotchi UI, cabinet FX, $RF art, simulated economy, 5%
  burn, finite + fixed-odds engines, legacy machines (unchanged economics).

## VALIDATION
- `tsc` clean; vitest 161/161 (21 new); Playwright 17/17 chromium;
  build clean (~489 kB); live 18/18; screenshots 19/21/24/26/34/37 inspected;
  360/390/430 overflow asserts pass.

---

# PASS — Inner-window pull effects (PixelPullFx, no nested cabinet) (2026-09-29)

## Change
Replaced the pull-animation visuals with the supplied `PixelPullFx`
(`src/components/machine/PixelPullFx.tsx`, verbatim + strict-index guards):
inner-window effects ONLY — prize drum, lone capsule ball, claw rig, reel
panel. The old ~1600-line nested-machine SVG (`CabinetBody` inside
`PixelPullAnimation.tsx`) is deleted; that file is now a thin adapter
re-exporting `PixelPullFx` under the historic names (`PixelPullAnimation`,
`AnimatedShell`, `SHELL_DURATIONS`).

## Wiring (economics/RNG untouched)
- `pullFx.ts`: CLASSIC copy DRUM SHAKE → PRIZE DRUM
  (`PULL FX: PRIZE DRUM`, caption `SPINNING THE PRIZE DRUM...`); durations now
  match the new timelines (2450/2850/3050/2800, reduced 800/900/950/900).
- `resultKindForPrizeType()` (pure, tested) maps the ALREADY-DETERMINED
  authoritative result to rf/nft/empty; threaded MachineDetail (hidden
  pending) → CabinetView (`pullResultKind`) → animation. Capsule ignores it
  (identical suspense every result); tallboy uses blank parcel for empty;
  mini final symbols broadly echo the kind. Reels never determine probability.
- Reveal flow unchanged: onComplete → 60ms → 240ms REVEAL_HOLD → commit →
  $RF coin / NFT art / no-prize. Result stays hidden until PRIZE_REVEAL.

## Validation
- `tsc` clean; vitest 167/167 (6 new: resultKind mapping + per-shell
  no-nested-cabinet static-markup guards); build clean.
- Playwright 17/17 chromium AND 17/17 mobile (incl. updated PRIZE DRUM label).
- Stage screenshot QA (`screenshots/pullfx/`, 21 shots): capsule initial,
  shake 1/2, strong shake, opening, fully open, before reveal; drum initial,
  spinning, slowing, tile released, before reveal; tallboy top, descending,
  closed, carrying, releasing; mini spinning, reels 1/2/3 stopped. Every shot
  asserts exactly one 128×96 stage SVG inside `.cabinet-lcd-screen` with the
  real shell visible around it — inspected, no second machine in any frame.

---

# PASS — Top-bid NFT valuation (highest ACTIVE offer, never floor) (2026-09-29)

## Change
NFT $RF valuation basis switched from collection/generation floor price to
the item's top bid. New hierarchy per NFT: item top bid
(`GET /api/v2/offers/collection/{slug}/nfts/{identifier}/best`, 404 = no
bids) → Generations-only generation trait bid (`GET .../offers/collection/
{slug}/traits?mode=NUMERIC`, max ACTIVE) → collection top bid
(`GET /api/v2/offers/collection/{slug}`, client-side max ACTIVE non-trait
offer over ≤3 pages — endpoint is unsorted) → UNPRICED. USD conversion reuses
payment-token lookup (USD-pegged 1:1, never ticker-only). Per-item requests
deduped per token, concurrency ≤ 4, 3min caches. Methods renamed
(`item_top_bid`, `rare_friends_generation_bid`,
`rare_friends_collection_bid_fallback`, `collection_top_bid_fallback`);
badges now `TOP BID` / `GEN X TOP BID` / `GENESIS TOP BID` /
`COLLECTION BID FALLBACK` / `NO BIDS`; snapshots carry
`topBidUsd/bidNative/bidCurrency`. Names (`floorBadgeLabel`→`bidBadgeLabel`,
`isUsableFloorValue`→`isUsableBidValue` with alias) and all UI copy, docs
(README, ECONOMY_SPEC §12), and live-check updated.

## Live-verified (read-only, 2026-09-29)
- Best-offer endpoint returns applicable top bid incl. criteria offers
  (#8283: ACTIVE $0.50 USDG criteria bid; Genesis #773: ACTIVE $1542).
- Collection offers unsorted (0.50/0.03/0.12/0.09) → max client-side.
- Generation NUMERIC trait offers empty → fallback path real; Genesis offers
  present (top $3,080 in first 5).
- Live check 17/17: item top bid $0.50 → ≈370 RF at $0.00135 RF.

## Validation
- `tsc` clean; vitest 178/178 (11 new topBid.test.ts: max-ACTIVE selection,
  trait exclusion, 404→null, inactive rejection, NUMERIC mode, criteria flag).
- Playwright 17/17 chromium AND 17/17 mobile; build clean.
- Screenshots re-captured + inspected (19 TOP BID badges, 21 TOP-BID
  REFERENCE panel, 24/26 published + mobile).

---

# PASS — Multi-select NFT staging + floating review button (2026-09-29)

## Change
- NFT drawer is now multi-select: tapping cards toggles each NFT into a
  staging batch (`selectedAssets`, keyed by chain:contract:tokenId).
- Confirm is atomic: pricing pre-validated for ALL staged NFTs, fresh
  ownership verification for ALL, then EACH NFT becomes its OWN prize entry
  carrying the FULL per-prize odds (3 NFTs at 1% = three 1% lines = 3% total,
  proven by 2.00% configured RTP in E2E) via new pure
  `src/nfts/prizeEntry.ts:buildNftPrizeEntry` (unit-tested).
- Staging panel lists compact rows (thumb, name, bid badge, TOP-BID REF,
  per-row verified badge, deselect X) + VERIFY OWNERSHIP (n) + CLEAR ALL +
  shared fixed-odds input + CONFIRM & SIMULATE FUNDING (n).
- Floating `▼ REVIEW n SELECTED` button appears at the drawer corner once ≥1
  NFT is staged; one press smooth-scrolls the drawer to the review/confirm
  panel (no more long scrolls through big wallets).

## Validation
- `tsc` clean; vitest 177/177 (3 new prizeEntry.test.ts).
- Playwright 18/18 chromium AND 18/18 mobile (new multi-select E2E:
  2 NFTs → 2 lines → 2.00% configured RTP → published with both).
- Screenshots re-captured + inspected (21 staging panel + floating button).
