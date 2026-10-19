# RARE ARCADE

A creator-owned prize-machine marketplace for Rare Friends.

Anyone can open a cabinet, stock it with Rare Friends and USDG, set a pull
price and a finite deck, and put it on the floor. Players pull one ticket at a
time. A ticket can carry a Rare Friend, a USDG prize, or nothing. The creator
keeps **95%** of every pull; the platform keeps **5%**.

A Friend won from a machine goes to the winner's Friend wallet. The winner can
keep it, or burn it and take the USDG backing its creator attached. Claims pay
the full backing — the 5% fee is charged on pulls, not on cash-outs.

---

## Open a machine

The create wizard is the whole marketplace:

- **Stock Rare Friends.** Pick Friends from your wallet, choose the USDG backing
  for each one, and the contract holds both until they are won.
- **Add USDG prize lines.** Any amount and any number of copies, so a deck can
  have a few large prizes or many small ones.
- **Set the price and the deck.** Pull price from 0.1 to 1,000 USDG; 2 to 1,000
  tickets. Prizes occupy tickets in a shuffled finite deck; every ticket is
  drawn exactly once.
- **Pick a cabinet.** CLASSIC, CAPSULE, TALLBOY or MINI.
- **Publish the odds.** The wizard shows the floor RTP before the machine opens.
  It must sit between 70% and 105%.

Limits: up to 16 Friends and 8 USDG lines per machine, 20 copies per USDG line,
100,000 USDG of total stocked value, 12 machines per creator (cancelled ones
free a slot) and 120 live or sold-out machines on the floor.

A creator can pause and resume a machine, collect its receipts at any time, or
cancel it **before the first pull** to get the remaining USDG and the stocked
Friends back. After the first pull the deck belongs to the players.

---

## Play

1. Choose a machine on the floor.
2. Check its price, tickets left, prize pool, top backing and published RTP.
3. Pull. Your payment is the pull price; 95% becomes creator receipts and 5% is
   the platform fee.
4. If the ticket carries a Friend, it is yours. Keep it, or open **Claims** and
   take its backing. The backing is paid in full and the Friend is burned.
5. If the ticket carries USDG, it is paid to you immediately.

The game server mirrors what the contract reports so the floor, a machine's
stock, creator totals and leaderboards survive a reload. It never decides an
outcome and never holds money.

---

## Why this is an external lane

A manifest `draw`/`redeem` cabinet has a constant price, a constant
`redeemValue` and a fixed table. That cannot express a marketplace where each
creator chooses their own price, backing, ticket count and arbitrary USDG
prizes, and where a winner may keep an NFT instead of redeeming it.

Rare Arcade therefore declares one **external** lane, `arcade`, with seven
actions:

| Action | What it does |
| --- | --- |
| `createMachine` | Escrow the stock, open the deck and list the machine |
| `pull` | Charge the price, reveal one ticket and pay its prize |
| `claimBacking` | Burn the won Friend and pay its backing |
| `withdrawMachine` | Pay the creator's 95% receipts |
| `pauseMachine` | Stop new pulls without emptying the machine |
| `resumeMachine` | Put a paused machine back on the floor |
| `cancelMachine` | Before the first pull, refund the stock |

`friendsdk build` correctly reports no SDK-deployed modules
(`lanes: []`, `deployedModulesSuffice: true`) because this game needs a
contract the SDK does not deploy. That is not the same as needing no contract.

### Production requirement

The source in this repository is complete, but it cannot custody real funds or
Rare Friends by itself. Before mainnet, **Rare Friends must author and deploy**:

- the escrow contract that holds NFT custody and the USDG prize pool, enforces
  the finite deck, pays backing on burn, splits every pull 95/5, and implements
  cancel/refund;
- the adapter that turns those calls into the seven lane actions; and
- the keeper watcher that reports `pending`/`settled`/`failed` events back to
  the game server.

`dev/arcade-stub.ts` is the executable specification of those requirements and
runs the full flow locally. Until the contract and adapter exist, this build is
a dev game, not a place to send real funds.

---

## Run it

Requires **Node.js 22 or later**.

```sh
npm install
npm run dev        # website, simulated chain, keeper and server on :4173
```

The dev host signs in fixture Friends with `FRIENDSDK_DEV_AUTH`, grants four
demo Friends per wallet, and runs the arcade stub. Every create, pause, pull,
claim, withdrawal and cancel works without a wallet, an account or a deployed
contract.

```sh
npm run check      # manifest + code validation, then a full typecheck
npm run build      # write .friendsdk/build and the contract request
```

`npm run check` runs `friendsdk check` and `tsc --noEmit`. The build output is
`.friendsdk/build/client/` plus `server.js`, `manifest.json` and
`contract-request.json` for the platform.

---

## Source map

```
shared/arcade.ts              machine model, limits, money maths, deck quote
friendsdk.json                external lane, actions, items, leaderboards
client/
  main.tsx                    FriendSession, fonts, stylesheet
  screens/Arcade.tsx          floor, machine view, create wizard, claims
  arcade/PixelPullFx.tsx      the pull ritual for all four cabinets
  ui/                         pixel icons, tokens and Friend artwork
  lib/arcade.css              the marketplace skin
server/
  index.ts                    mirrored catalogue, leaderboards, pull accounting
dev/
  arcade-stub.ts              dev escrow contract, relay and watcher
```

`shared/arcade.ts` is the single source of truth for machine shape, limits,
fees and RTP. The client renders it, the server mirrors it, and the dev stub
settles it, so the published odds and the paid odds cannot drift.

### Art

All Rare Arcade pixel artwork is original and drawn in code as SVG: the four
cabinet shells, the pull rituals, the `$USDG` coin, the 16×16 icon set and the
pixel palette. The Friend itself is the player's own on-chain artwork, supplied
by the platform. Fonts are Press Start 2P and Silkscreen (SIL Open Font
License), bundled from `@fontsource`; every sound is synthesised with the Web
Audio API. No CDN, remote image or audio file is used.

---

## Licence

FriendSDK is Apache-2.0 and is installed as a development dependency; the
platform runs the contracts, the server and the payments.
