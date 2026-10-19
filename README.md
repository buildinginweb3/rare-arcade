# RARE ARCADE

Turn the NFTs you already hold into creator-run prize machines where every pull
is priced and paid in **USDG**, charges a **5% platform fee** to Rare Arcade
treasuries, and uses live OpenSea top bids to price NFT prizes transparently.

**[Live demo →](https://buildinginweb3.github.io/rare-arcade/)**

---

## What it is

Rare Arcade is a **creator-built prize-machine marketplace played in USDG**.
Instead of one developer controlling a single prize pool, anyone can build a
*Friend Machine* from assets they already hold, configure its economics, and
publish it for other players to pull.

```
USDG / NFTs / RF YOU ALREADY HOLD
        ↓
  MACHINE INVENTORY
        ↓
  TRANSPARENT MACHINE ECONOMICS
        ↓
  PLAYERS SPEND USDG
        ↓
  5% PLATFORM FEE (75% TREASURY / 25% RF BUYBACK)  +  95% CREATOR RECEIPTS
        ↓
  HOLDINGS NOW DO SOMETHING
```

The asset holder becomes the machine operator.

## Why USDG

**USDG (Global Dollar)** — `0x5fc5360d0400a0fd4f2af552add042d716f1d168` on
Robinhood Chain — is the only currency a pull can be paid in.

- It is a Paxos-issued stablecoin redeemable 1:1 for US dollars, so the arcade's
  economics stay predictable instead of swinging with a volatile token.
- 6 decimals on-chain, matched exactly by the app's internal unit scale, so
  amounts cross the contract boundary with no rounding.
- The 1:1 peg means an NFT's USD top bid **is** its USDG prize value — no price
  feed, no drift in a published machine's RTP.

`$RAREFRIENDS` is still a first-class part of the loop, just not the play
currency: creators can load a machine with **RF cashback on top of USDG
cashback**, and each RF prize locks its USDG value at seed time so published RTP
can never move with the RF market.

## Two machine models

| | Finite Deck | Fixed Odds |
|---|---|---|
| Play cap | Fixed ticket count | None |
| Odds | Shifts as inventory depletes | Each prize keeps its configured probability |
| Sold-out slot | — | Becomes an empty outcome; probability is **not** redistributed |
| Ends when | Tickets run out | All prize inventory is exhausted |

Both models publish their exact odds, RTP, and prize inventory **before** a
player pulls.

## Pausing a machine & withdrawing escrow

A machine's **vault** is the prize escrow still locked inside it. Once a machine
starts selling, some of that escrow is often never won — so the creator can get
it back:

| Action | Effect |
|---|---|
| **Pause** | Suspends pulls. Touches **no** escrow — every prize stays exactly where it is. Free and fully reversible. |
| **Resume** | Puts pulls back on sale. The machine is bit-for-bit what it was before the pause. |
| **Withdraw escrow & close** | Returns the **entire** remaining vault to the creator in its original currencies, then closes the machine permanently. |

Rules that keep this honest:

- **Withdrawal requires a prior pause** — winding a live machine down is a
  deliberate two-step, not a stray click.
- **All-or-nothing.** There is no partial withdrawal, because pulling some
  prizes out mid-game would silently rewrite live RTP and odds.
- **Only unused escrow comes back.** The refund is computed from what is
  *remaining*, never from the published prize list, so a prize a player already
  won can never be refunded twice.
- **The rules lock survives.** Published odds, `initialPrizes` and RTP are never
  rewritten. Players keep everything they won.
- **Players can't pull a paused machine,** and the arcade floor shows `PAUSED`
  with the pause date instead of a play price.
- **The vault breakdown is public.** Anyone viewing a machine sees what is still
  locked in it; only the creator's controls are gated. A creator is defined as
  the address that funded the machine plus any matching connected wallet.
- **Withdrawing frees the NFT.** A returned Rare Friend stops being reserved and
  can immediately be funded into another machine.
- **The buyback pot is untouched.** It is funded from platform fees, not prize
  escrow, so a withdrawal never reaches it.

Full rules, formulas and the cancel-vs-withdraw comparison: §7b of
`ECONOMY_SPEC.md`. Implementation: `src/domain/vault.ts`.

## The platform fee and the RF buyback

Every pull splits the USDG spend **5% platform fee / 95% creator receipts**. The
fee itself splits two ways:

| Share | Destination |
|---|---|
| **75%** of the fee | Treasury — `0x927A1799125EAE57B6BDc573Ee5e0354cD343Db1` |
| **25%** of the fee | **Buys $RAREFRIENDS and burns them** at `0x…dEaD` |

The 25% share accrues **in USDG** into a platform-wide buyback pot. On a
schedule, the whole pot is swapped USDG → RF on an AMM pool on Robinhood Chain
and the acquired RF is sent to the burn address.

**Why this keeps player economics stable:** the pot stays denominated in USDG
right up to the moment a batch executes — long after the pull that funded it. A
player is charged 5% of their spend in USDG regardless of what RF is doing, and
no published RTP depends on an RF price. RF volatility only affects how much RF
a given buyback yields, never what a player paid.

**Why batched:** a per-pull swap would pay AMM fees on a tiny trade and take
slippage out of proportion to size. Batching means fewer, larger, cheaper swaps
and a much smaller per-pull MEV surface. The cost is that the burn lags the
revenue funding it. The demo models a 1% adverse fill so displayed burn values
understate rather than overstate what a perfect fill would yield.

Totals are tracked per machine (`buybackFeeUnits`) and platform-wide
(`buyback` ledger), because the pot is pooled — one machine's contribution can
be burned before its own pulls finish.

## Prize currencies

A machine can hold USDG cashback, RF cashback, or both — plus NFTs. Everything is
*accounted* in USDG so RTP stays exact regardless of what a player is actually
paid:

| Prize line | Paid in | Valued at |
|---|---|---|
| `USDG_PRIZE` | USDG | face value |
| `RF_PRIZE` | RF | USDG value locked at seed time |
| `FRIEND_PRIZE` | the NFT | USD top bid, 1:1 with USDG |

## OpenSea valuation

Creators never hand-guess "this NFT is worth 20,000 RF." Rare Arcade reads
OpenSea market data and derives an RF reference automatically:

```
collection top-bid USD  =  USDG reference value      (USDG is pegged 1:1 to USD)
```

Notes:

- OpenSea offer `price.value` is the **total order amount**. For bulk/criteria
  bids covering many tokens, Rare Arcade divides by the NFT consideration
  quantity first — otherwise a 25-token bid reads ~25× too high.
- Rare Friends **Generations** are valued generation-aware via trait offers
  where the data is available, with documented fallbacks.
- There is no token price feed in the valuation path at all, so an RF price move
  can no longer revalue an already-published machine.
- The valuation basis is the **highest active offer (top bid)**, not a floor
  price. The resulting market reference is a **reference used by the economics
  model, not a guaranteed sale value** for an individual NFT, and not the amount a
  creator can expect to realise.
- Valuation snapshots are locked at publish time, so live market moves cannot
  mutate a published machine's RTP or EV.

## Robinhood Chain only

Settlement is single-chain (Robinhood, ID 4663). Only NFTs on that chain can be
funded into a machine, which was chosen deliberately:

- **One contract surface.** One escrow vault, one fee router, one VRF
  subscription. Multi-chain support would multiply both the contracts and the
  failure modes.
- **One ownership truth.** Every prize NFT — not just Rare Friends — is verified
  with the same fresh on-chain `ownerOf` read against the public RPC. Nothing
  depends on trusting an indexer's ownership response.
- **No per-chain escrow branch.** `PrizePool.fundNftPrize` and `MachineRegistry`
  take a single chain, so there is no cross-chain settlement path to get wrong.

The gate lives in `src/domain/settlement.ts` and is enforced inside both machine
constructors, so a cross-chain prize cannot reach a published machine even if it
somehow entered the picker.

## Cabinet presentation

| Shell | Ritual |
|---|---|
| CLASSIC | Prize Drum |
| CAPSULE | Capsule Open |
| TALLBOY | Claw Grab |
| MINI | Slot Reels |

Presentation and personalisation only — all shells share identical economics.

## Run it locally

Requires **Node.js 20+**.

```sh
git clone https://github.com/buildinginweb3/rare-arcade.git
cd rare-arcade
npm ci
npm run dev
```

Open the printed URL (normally `http://localhost:4173`).

**No wallet is required to try the seeded player demo.** Connecting a wallet is
only used when testing creator NFT discovery/ownership against Robinhood mainnet.

### Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server on port 4173 |
| `npm run build` | Typecheck (`tsc --noEmit`) + production build |
| `npm test` | Vitest unit + economics + valuation suites |
| `npm run test:e2e` | Playwright end-to-end (chromium + mobile) |
| `npm run test:fx` | Deterministic pull-FX / token / UI screenshot QA |
| `npm run check:live` | Read-only live OpenSea + RPC integration check |

## Going live

`src/web3/contracts.ts` is the contract registry and the single switch between
demo and live. Only USDG is deployed today; everything else is an explicit
`0xTODO`, and `RARE_ARCADE_MODE` stays `'demo'` until they are filled in. The
app header shows a **CONTRACTS** panel with exactly what is still missing.

Typed interfaces for every call live in `src/web3/contracts.types.ts`.
`src/web3/usdgClient.ts` implements **reads only** — `approve()` and
`transfer()` throw on purpose, so the app cannot appear to move funds it cannot
actually move. The 5% / 75% / 25% split in `src/domain/fees.ts` is the
specification the deployed `feeRouter` must reproduce exactly; there is a test
asserting the registry cannot drift from it.

On WSL2 without sudo, Playwright's shared libraries may need
`npx playwright install-deps chromium` or the documented LD_LIBRARY_PATH
workaround (see README section 5).

## Tech stack

- **FriendSDK:** No — Rare Arcade is a web app, not an SDK game.
- React 19 · TypeScript · Vite 6
- OpenSea API v2 (`robinhood` chain) + public Robinhood Chain RPC
- Vitest · Playwright

## Real vs simulated

**Real / read-only**

- Connected wallet address
- NFT ownership where verified on-chain via `ownerOf`
- NFT metadata and artwork
- Collection identity
- OpenSea market data
- The USDG token address and its on-chain 6-decimal precision

**Simulated**

- USDG and RF balances
- Machine funding, pull spend, 5% platform fee routing, creator receipts
- NFT machine funding, escrow, and prize payout

Rare Arcade requests **no** NFT, USDG, or RF approvals, **no** transfers, and
**no** transaction signatures. Read-only ownership checks are not escrow.

## Known limitations

- Balances, spend, fee routing, receipts, NFT escrow and payout are all
  simulated in browser state; no live contracts are deployed yet.
- State persists in `localStorage` (`rare-arcade:v1`) on the current browser
  only. There is no server, accounts, or cross-device sync.
- Live NFT discovery and valuation depend on OpenSea availability and rate
  limits. A read-only public demo key ships in the client bundle so the demo
  works with no setup; it is rotatable and rate-limited.
- NFT discovery and pricing are OpenSea-driven, but ownership is verified
  on-chain. A Robinhood NFT that OpenSea does not index will not appear in the
  picker even though it could be verified.
- Production on-chain escrow, VRF, and real settlement are future work, not
  shipped. See **Going live** below and §16 of `ECONOMY_SPEC.md`.
- The vault's pause and withdrawal are simulated like the rest of the platform:
  the state machine, refund math and audit trail are real, but no on-chain
  escrow contract is deployed to claw funds back from.

## Asset credits & licences

- **Rare Friends** — NFT names, artwork and metadata belong to Rare Friends.
  Live NFT art is fetched from the collection's OpenSea metadata; the 16×16
  pixel sprite fallback is original Rare Arcade code (`src/data/demoFriends.ts`,
  `src/components/ui/RareFriendSprite.tsx`).
- **OpenSea** — NFT discovery, collection identity, metadata, artwork and
  market data via the public [OpenSea API v2](https://docs.opensea.io/).
- **Robinhood Chain** — read-only JSON-RPC for `ownerOf` ownership
  verification (chain ID 4663). No writes, no transactions.
- **Fonts** — [Press Start 2P](https://fonts.google.com/specimen/Press+Start+2P)
  and [Silkscreen](https://fonts.google.com/specimen/Silkscreen), via Google
  Fonts (SIL Open Font License).
- **Audio** — all sound effects are synthesised at runtime with the Web Audio
  API (`src/utils/audio.ts`). No sampled audio files are bundled.
- **All Rare Arcade pixel artwork** (cabinets, `$RF` coin, icons, pull FX) is
  original to this project and defined in code as SVG.

Visual system and art direction: [`ART_BIBLE.md`](ART_BIBLE.md).
