# RARE ARCADE

A FriendSDK 1.0 game for the Rare Friends arcade.

Pull a cabinet for **USDG**. Every pull is settled on chain from platform
randomness, so the outcome is fixed before your transaction is sent and cannot
be chosen, replayed or read ahead of time by the browser.

Win a **Rare Friend** and it is held by your Friend's wallet, backed by USDG you
can claim — or you can keep the Friend and never touch the backing. Your
choice, and the odds are published before you pull.

---

## The cabinets

| | STARTER | CLASSIC | GRAND |
|---|---|---|---|
| Pull price | 5 USDG | 25 USDG | 125 USDG |
| Cashback gross | 1 USDG | 5 USDG | 25 USDG |
| Cashback pays | 0.95 USDG | 4.75 USDG | 23.75 USDG |
| Generations Friend backing | 20 USDG | 100 USDG | 500 USDG |
| Generations Friend claim | 19 USDG | 95 USDG | 475 USDG |
| Genesis Friend backing | 80 USDG | 400 USDG | 2,000 USDG |
| Genesis Friend claim | 76 USDG | 380 USDG | 1,900 USDG |

**Outcomes per pull**

| Outcome | What you get |
|---|---|
| No prize | Nothing. The most common result. |
| Cashback | The tier's cashback, less the 5% fee. |
| Generations Friend | A Rare Friend backed by the tier's backing — keep it, or claim 95% of it. |
| Genesis Friend | A Genesis Rare Friend backed by 4× the Generations backing — keep it, or claim 95% of it. |

**The 5% fee** is charged on your spend, on a cashback win, and on backing you
choose to claim. Tokens you put in a cabinet need no backing — they pay
themselves.

**RTP is a function of your Friend's generation.** Generation 1 is the rarest
Friend and plays the best table; generation 6 the worst. Your odds are fixed
before you play, not before you pull.

| Generation | STARTER | CLASSIC | GRAND |
|---|---|---|---|
| 1 | 93.48% | 93.10% | 93.10% |
| 2 | 92.26% | 91.80% | 91.77% |
| 3 | 90.93% | 90.47% | 90.44% |
| 4 | 89.56% | 89.18% | 89.07% |
| 5 | 88.35% | 87.85% | 87.74% |
| 6 | 87.13% | 86.56% | 86.41% |

### Backing is a payout, not a valuation

The arcade does not price Rare Friends. "Backed by 20 USDG" means the arcade
will pay 20 USDG out of its prize pool for that Friend — a published payout,
fixed before the pull. It is not an estimate of what a Friend is worth, and the
game needs no oracle to make the promise.

The ladder is fixed because a manifest `redeemValue` is a constant. A genuinely
player-set backing amount cannot be expressed by a `draw` and `redeem` action; it
would need an `external` lane and a contract Rare Friends write. The three
cabinets are the backing choice this version can honestly offer.

---

## One source of truth for the economy

`client/lib/economy.json` holds every number: the pull prices, the fee, the
per-generation weights, the backing and what a claim pays.

```
client/lib/economy.json  ──►  scripts/gen-manifest.mjs  ──►  friendsdk.json
        │                                                        │
        │ (imported by the client)                               │ (settled on chain)
        ▼                                                        ▼
   odds the arcade publishes                            what the keeper pays out
```

The generator refuses to write a manifest whose weights do not sum to 10000 or
whose RTP falls outside 70–105%, and it prints the RTP of every generation table
as it goes. What the cabinet shows and what the chain settles cannot drift apart,
because there is only one file.

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
  screens/Arcade.tsx            the cabinets, the reveal, the prize panel
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
SVG: the pull rituals, the `$USDG` coin, the 16×16 icon set and the pixel palette
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
