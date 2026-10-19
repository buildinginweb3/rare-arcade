# RARE ARCADE

A FriendSDK 1.0 game for the Rare Friends arcade.

Pull a cabinet for **RF**. Every pull is settled on chain from platform
randomness, so the outcome is fixed before your transaction is sent and cannot
be chosen, replayed or read ahead of time by the browser.

Win a **Rare Friend** and it is held by your Friend's wallet, backed by RF you
can claim — or you can keep the Friend and never touch the backing. Your
choice, and the odds are published before you pull.

---

## The cabinet

| | |
|---|---|
| Pull price | 10 RF |
| Platform fee | 5%, taken in three places |
| Currency | RF |

**Outcomes**

| Outcome | What you get |
|---|---|
| No prize | Nothing. The most common result. |
| Cashback | 19 RF. The gross was 20 RF. |
| Generations Friend | A Rare Friend backed by 20 RF — keep it, or claim 19 RF. |
| Genesis Friend | A Genesis Rare Friend backed by 100 RF — keep it, or claim 95 RF. |

**The 5% fee** is charged on your spend, on a cashback win, and on backing you
choose to claim. Tokens you put in a cabinet need no backing — they pay
themselves.

**RTP is a function of your Friend's generation.** Generation 1 is the rarest
Friend and plays the best table; generation 6 the worst. Your odds are fixed
before you play, not before you pull.

| Generation | RTP |
|---|---|
| 1 | 95.00% |
| 2 | 93.67% |
| 3 | 92.34% |
| 4 | 91.01% |
| 5 | 89.68% |
| 6 | 88.35% |

---

## One source of truth for the economy

`client/lib/economy.json` holds every number: the pull price, the fee, the
per-generation weights, the backing and what a claim pays.

```
client/lib/economy.json  ──►  scripts/gen-manifest.mjs  ──►  friendsdk.json
        │                                                        │
        │ (imported by the client)                               │ (settled on chain)
        ▼                                                        ▼
   odds the arcade publishes                            what the keeper pays out
```

The generator refuses to write a manifest whose weights do not sum to 10000, and
it prints the RTP of every generation table as it goes. What the cabinet shows
and what the chain settles cannot drift apart, because there is only one file.

```sh
npm run manifest         # regenerate friendsdk.json
npm run manifest:check   # fail if friendsdk.json is stale (run in CI)
```

---

## Run it

Requires **Node.js 22 or later**.

```sh
npm install
npm run dev        # simulated website, chain, keeper and server on :4173
```

`friendsdk dev` mounts the game exactly as the website does, with fixture
Friends, a simulated Robinhood Chain and a local keeper. Every pull, claim and
settlement works without a wallet, an account or a deployed contract. The dev
panel can hold randomness, take the keeper offline, force a draw row and set the
prize pool, so the failure paths are reachable without deploying anything.

```sh
npm run check      # manifest + code validation, then a full typecheck
npm run build      # regenerate the manifest and write .friendsdk/build
```

---

## What is in the box

```
friendsdk.json                  the economy, generated — do not hand-edit
client/
  main.tsx                      entry: FriendSession, fonts, stylesheet
  screens/Arcade.tsx            the cabinet, the reveal, the prize panel
  lib/economy.json              the single source of truth
  lib/economy.ts                typed accessors and derived odds/RTP
  arcade/PixelPullFx.tsx        the pull ritual (drum, capsule, claw, reels)
  ui/FriendSprite.tsx           the Friend, drawn from its on-chain artwork
server/
  index.ts                      pull count and the leaderboard
scripts/gen-manifest.mjs        economy.json -> friendsdk.json
```

The server rules deliberately hold **no** economy. Odds, RTP and backing live in
`economy.json`; server state is only the arcade's record of how many pulls a
Friend has made. A second copy of the economy on the server is a second copy
that can be wrong.

### Art

All Rare Arcade pixel artwork is original to this project and drawn in code as
SVG: the pull rituals, the `$RF` coin, the 16×16 icon set and the pixel palette
in `client/ui/pixelPalette.ts`. The Friend itself is not drawn by this game — it
is the player's own on-chain artwork, decoded from the 64 frames the platform
supplies.

Fonts are Press Start 2P and Silkscreen (SIL Open Font License), bundled from
`@fontsource` rather than loaded from a font CDN, because the arcade's Content
Security Policy allows assets from the game origin only. Every sound effect is
synthesised at runtime with the Web Audio API; no audio files are shipped.

---

## Open question for Rare Friends

**Does a Friend that has been activated on rarefriends.com stay activated if it
is won in a cabinet?**

In this build the answer is not ours to give. A cabinet prize is a FriendSDK
item bound to the Friend wallet, minted by the draw and redeemable for its
backing. This game never holds, transfers or deactivates a Rare Friends NFT: it
only mints and burns an in-game item. If activation is a property of the original
NFT, nothing here can affect it — but nothing here can confirm it either, because
the game has no chain access of its own.

If the answer turns out to be no, the fix is an `external` lane whose contract
Rare Friends write, which would enforce it on the way out of the cabinet. That is
not in this version.

---

## Licence

FriendSDK is Apache-2.0 and is installed as a development dependency; the
platform runs the contracts, the server and the payments.