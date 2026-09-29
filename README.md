# RARE ARCADE

Turn the NFTs and $RAREFRIENDS you already hold into creator-run prize machines
where every pull spends $RAREFRIENDS, burns 5%, and uses live OpenSea data to
price prizes transparently.

**[Live demo →](https://buildinginweb3.github.io/rare-arcade/)**

---

## What it is

Rare Arcade is a **creator-built prize-machine marketplace powered by
$RAREFRIENDS**. Instead of one developer controlling a single prize pool, anyone
can build a *Friend Machine* from assets they already hold, configure its
economics, and publish it for other players to pull.

```
NFT / RF YOU ALREADY HOLD
        ↓
  MACHINE INVENTORY
        ↓
  TRANSPARENT MACHINE ECONOMICS
        ↓
  PLAYERS SPEND $RAREFRIENDS
        ↓
  5% RF BURN  +  95% CREATOR RECEIPTS
        ↓
  HOLDINGS NOW DO SOMETHING
```

The asset holder becomes the machine operator.

## Two machine models

| | Finite Deck | Fixed Odds |
|---|---|---|
| Play cap | Fixed ticket count | None |
| Odds | Shifts as inventory depletes | Each prize keeps its configured probability |
| Sold-out slot | — | Becomes an empty outcome; probability is **not** redistributed |
| Ends when | Tickets run out | All prize inventory is exhausted |

Both models publish their exact odds, RTP, and prize inventory **before** a
player pulls.

## The $RAREFRIENDS loop

Every pull splits the machine's pull price **5% burned / 95% simulated creator
receipts**. `$RAREFRIENDS` is the single economic unit across the product:
players spend it, creators seed it directly as prize inventory, and supported NFT
market references are converted into RF so odds, RTP, and prizes all live in one
shared economy.

## OpenSea valuation

Creators never hand-guess "this NFT is worth 20,000 RF." Rare Arcade reads
OpenSea market data and derives an RF reference automatically:

```
collection top-bid USD  ÷  current $RAREFRIENDS USD  =  RF floor reference
```

Notes:

- OpenSea offer `price.value` is the **total order amount**. For bulk/criteria
  bids covering many tokens, Rare Arcade divides by the NFT consideration
  quantity first — otherwise a 25-token bid reads ~25× too high.
- Rare Friends **Generations** are valued generation-aware via trait offers
  where the data is available, with documented fallbacks.
- Floor references are **market references used by the economics model, not
  guaranteed sale values** for individual NFTs.
- Valuation snapshots are locked at publish time, so live market moves cannot
  mutate a published machine's RTP or EV.

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
- `$RAREFRIENDS` market-price reference

**Simulated**

- RF balances
- Machine funding, pull spend, 5% burn, creator receipts
- NFT machine funding, escrow, and prize payout

Rare Arcade requests **no** NFT or RF approvals, **no** transfers, and **no**
transaction signatures. Read-only ownership checks are not escrow.

## Known limitations

- Balances, spend, burn, receipts, NFT escrow and payout are all simulated in
  browser state; no live contracts are deployed.
- State persists in `localStorage` (`rare-arcade:v1`) on the current browser
  only. There is no server, accounts, or cross-device sync.
- Live NFT discovery and valuation depend on OpenSea availability and rate
  limits. A read-only public demo key ships in the client bundle so the demo
  works with no setup; it is rotatable and rate-limited.
- Production on-chain escrow, VRF, and real burn/settlement are future work, not
  shipped.

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
