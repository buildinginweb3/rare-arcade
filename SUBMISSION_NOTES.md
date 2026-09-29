# RARE ARCADE — Vibeathon Submission Notes

> **Status: submitted to the Rare Friends Vibeathon (Token Activity).**
> These are the original working notes, kept for design history. The
> authoritative submission write-up is
> [`submissions/rare-arcade/README.md`](https://github.com/spokesz/rarefriends-vibeathon/blob/main/submissions/rare-arcade/README.md).

---

## Project Overview

- **Project Name**: RARE ARCADE
- **Individual Machines**: FRIEND MACHINES
- **Primary Category**: **Token Activity**
- **One-Liner**:
  > *"RARE ARCADE lets anyone create a transparent Friend Machine seeded with simulated Rare Friends and $RAREFRIENDS prizes; every pull spends RF and burns 5%."*

---

## 1. Why RARE ARCADE Fits "Token Activity"

Most gacha and chance applications are single-sided: a developer launches a house machine, players pull, and activity ceases once the content dries up.

**RARE ARCADE transforms $RAREFRIENDS into active creator-driven utility:**
1. **Anyone Can Be The Operator**: Users design their own prize machines, choose pull prices, customize target player return (EV/RTP), and seed their own simulated prizes.
2. **Fixed 5% Platform Burn**: Every single pull permanently burns 5% of the RF spent at the protocol level.
3. **95% Operator Proceeds**: The machine creator earns the remaining 95% proceeds, creating an economic flywheel where operators can reinvest proceeds into new machines.
4. **Finite Inventories & Real-Time Odds Dynamics**: Machines are finite decks (e.g., 50 tickets). As tickets are consumed, real-time RTP can climb over 100%, driving dynamic player demand and token velocity without manipulative near-miss tricks.

---

## 2. Key Product Innovations

- **User-Created Friend Machines**: A complete progressive workshop allowing any user to build, price, seed, and publish a machine.
- **Dynamic Current RTP**: As finite prizes are won, the system recalculates live Return to Player ($RTP_{\text{current}}$) and displays exact probabilities that always sum to 100.00%.
- **First-Pull Immutability Lock**: Once the first player pulls from a live machine, its economics and inventory freeze permanently, guaranteeing player trust.
- **Pre-Pull Cancellation**: Creators can cancel unpulled machines with a 100% automatic refund of escrowed RF and Rare Friends.
- **Authentic 16×16 Monochrome Rare Friends**: Renders Rare Friends directly from on-chain generation 16×16 pixel bitmaps, adhering to the Apache 2.0 license and official asset guidelines.

---

## 3. Simulation & Safety Verification

In strict compliance with current Rare Friends Vibeathon rules:
- **100% Simulated Purchases & Rewards**: All RF balances, NFT prizes, pull spends, burns, and creator payouts are simulated in local client state (`rare-arcade:v1`).
- **Zero Live Contracts**: No contracts deployed to Robinhood chain.
- **Zero Approvals**: No `approve`, `setApprovalForAll`, or signature requests.
- **Zero Transactions**: No `eth_sendTransaction` or wallet funds moved.
- **Persistent Clear Warning**: A persistent status banner prominently informs users:
  `SIMULATED VIBEATHON DEMO • NO REAL RF OR NFTS ARE TRANSFERRED`.

---

## 4. Visual Identity & Art Direction

- **Monochrome Pixel Aesthetic**: High-contrast pure black and off-white palette with chiseled borders, hard 3px drop shadows, and 0px blur radius.
- **Virtual Pet / Tamagotchi Charm**: Tactile cabinet silhouettes (`CLASSIC`, `CAPSULE`, `TALLBOY`, `MINI`), LCD screens, and pixel animations.
- **No Emoji Used As Game Art**: Reusable 16×16 pixel SVG icon system.
- **Accessibility & Tactile Feedback**: Full keyboard navigation, screen-reader labels, toggleable retro 8-bit sound effects (WebAudio), and reduced-motion support.

---

## 5. Future Production Architecture (Roadmap)

To transition from this simulated MVP to a production on-chain launchpad:
1. **Audited Prize Escrow Contract**: Smart contract custody for ERC-20 ($RAREFRIENDS) and ERC-721 (Rare Friends) prize pools.
2. **Verifiable Randomness (VRF)**: On-chain random ticket drawing (e.g. Chainlink VRF or commit-reveal).
3. **Automated On-Chain Burn**: 5% of each pull routed directly to Robinhood zero/dead address.
4. **Creator Settlement & Royalties**: Direct pull proceeds routing to operator addresses.
5. **Jurisdictional & Legal Review**: Review of creator-owned prize machines under applicable local laws.
