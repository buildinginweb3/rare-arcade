# RARE ARCADE — Art Bible & Visual Design System

## 1. Visual North Star
**"A Rare Friends Digital Toy"**
Rare Arcade feels like a tactile, collectible handheld arcade from the 1990s meets virtual pet (Tamagotchi / Digimon / Game Boy) charm. It is **not** a crypto casino, **not** a neon Vegas slot machine, and **not** a sterile SaaS dashboard.

---

## 2. Monochrome Color Palette
An intentionally constrained, high-contrast monochrome palette.

| Token | Hex Value | Usage |
|---|---|---|
| `--color-black` | `#000000` | Outer borders, text, filled pixels, shadows |
| `--color-white` | `#FFFFFF` | Backgrounds, high-contrast text, lights on |
| `--color-lcd-bg` | `#F6F6F2` | Handheld LCD screen background, panel fills |
| `--color-lcd-dim`| `#E4E4DC` | Subtle panel inset, secondary backgrounds |
| `--color-gray-dark` | `#404040` | Secondary borders, stippled shadows |
| `--color-gray-mid` | `#808080` | Disabled elements, dither accents |
| `--color-gray-light` | `#C4C4BC` | Inset borders, grid lines |

> [!IMPORTANT]
> **Forbidden Visual Patterns**:
> - NO rainbow rarity colors (legendary gold, epic purple, rare blue).
> - NO casino neon lights or gradients.
> - NO modern glassmorphism, blur effects, or box-shadow with blur radius.
> - NO emoji anywhere in game UI.

---

## 3. Pixel Grid & Scaling
- **Logical Pixel Unit**: 1 logical pixel = `2px` or `4px` depending on screen density.
- **Rendering Directive**: `image-rendering: pixelated; shape-rendering: crispEdges;` applied universally to canvas, SVGs, and sprites.
- **Integer Scaling**: Sprites and icons scale only by integer multiples (`1x`, `2x`, `3x`, `4x`, `8x`).
- **No Fractional Stretching**: Avoid `transform: scale(1.15)` or subpixel layout values (`0.5px`).

---

## 4. Typography Rules
1. **Primary Pixel Display Font**: `'Press Start 2P', monospace`
   - Used for: Brand logo, machine marquee, pull price badges, major announcements, jackpot reveal.
   - Recommended size: `12px` to `18px` (large: `20px` to `24px`).
2. **Secondary LCD / Data Font**: `'Silkscreen', monospace`
   - Used for: Stats readouts, button labels, tabs, prize counters, odds tables.
   - Recommended size: `12px` to `14px`.
3. **Legibility Body Font**: `'Courier New', monospace` or system monospace
   - Used for: Long economic descriptions, rules text, transaction ledger details.
   - Prevents visual fatigue from reading dense paragraphs in display pixel fonts.

---

## 5. Border & Panel Language
- **Outer Cabinet Border**: `3px solid #000000` or `4px solid #000000`.
- **Panel Inset (Chiseled Bevel)**:
  - Top/Left: `2px solid #000000` (or `#C4C4BC` for sunken LCD).
  - Bottom/Right: `2px solid #FFFFFF` (or `#000000` for sunken LCD).
- **Hard Drop Shadows**: Offset by `3px 3px 0px #000000` or `4px 4px 0px #000000`. Blur radius is strictly `0px`.
- **Dithering**: 50% 2x2 checkerboard pattern (`#000000` and `#FFFFFF`) for shadows or depth in monochrome illustrations.

---

## 6. Tactile Button States
- **Normal**: Raised pixel frame, 3px solid black border, 3px hard black shadow down-right.
- **Hover**: Inverted colors (black background, white text) or 1px border highlight.
- **Pressed / Active**: Translated `+2px, +2px` with shadow reduced to `1px`, visually depressing the switch.
- **Disabled**: Mid-gray border (`#808080`), stippled pattern background, non-interactive cursor.
- **Focus-Visible**: 2px dotted outline offset by 2px, preserving accessibility.

---

## 7. Icon System
- **Grid**: 16x16 and 24x24 pixel grid.
- **Style**: Hand-crafted SVG with `<rect>` elements on integer coordinates or crisp pixel paths.
- **Core Library**:
  - `RF Token`: Geometric coin with "RF" monogram.
  - `Burn`: Pixel flame / fragmenting spark.
  - `Rare Friend`: Pixel creature silhouette in frame.
  - `Pull / Crank`: Arcade handle / coin slot.
  - `Cabinet`: Mini arcade machine with marquee.
  - `Odds`: Dice / probability percentage indicator.
  - `Lock`: Pixel padlock for immutable rules.
  - `Sold Out`: Crossed out ticket / banner.
  - `Trophy`: Vintage arcade high-score trophy.

---

## 8. Rare Friend Artwork Display
- **Real NFT media first**: funded/system prizes display the ACTUAL token artwork
  returned from canonical collection metadata (OpenSea discovery), framed inside
  the monochrome pixel UI. The artwork itself is NEVER recolored to
  black-and-white, cropped, filtered, redrawn, or distorted — `object-fit:
  contain`, faithful aspect, lazy-loaded `<img>`.
- **Legacy sprites**: pre-V2 `16x16` binary-row sprites (`#`/`.) render only for
  `legacy-demo` entries and are labeled LEGACY DEMO. They are never presented
  as owned/funded NFTs.
- **Failure state**: a clean pixel frame reading NFT MEDIA UNAVAILABLE +
  collection + token ID + VIEW ON OPENSEA. Never substitute another NFT's art.
- Displayed within a 4-pixel framed LCD housing with a small retro generation label (`GEN 1`, `GEN 2`).
- Preserves the original character silhouette without smoothing or vectorization.

---

## 9. Animation Principles
- **Low Frame Count**: 2 to 4 frames for idle cycles (e.g. mascot eyes blinking, LCD marquee flicker).
- **Step Timing**: `animation-timing-function: steps(2)` or `steps(4)` to prevent smooth tweening.
- **Pixel FPS**: mechanical animation runs at an intentional 10–14 FPS
  (12 FPS normal, 16 FPS shortened) via a snapped RAF timeline so motion
  feels authored in frames — never 60fps smooth vector motion.
- **Integer coordinates only**: `Math.round()` everywhere, no fractional SVG
  translation; Canvas (if used) sets `ctx.imageSmoothingEnabled = false`
  after any resize.
- **Physical Pull Sequence — MACHINE FIRST, REVEAL SECOND**:
  1. PULL validates machine + balance, executes ONE authoritative machine
     pull, applies accounting, stores the result as HIDDEN PENDING, locks
     interaction, and begins preloading NFT media (preload never gates reveal).
  2. Shell-specific mechanism runs to completion BEFORE any prize is shown:
     - CLASSIC: button depress → drum rotates → 1–2px cabinet shake →
       drum slows → hatch opens → hold → reveal (1.8–2.2s).
     - CAPSULE: button → cabinet bump → chamber capsules shift →
       capsule drops → lands → bounces → separates into TWO PIECES →
       top half lifts → sparkle → open hold → reveal (2.5–2.8s).
     - TALLBOY: carriage moves → claw descends → arms close → lifts →
       travels to chute → descends → arms open → parcel drops →
       delivery hold → reveal (2.9–3.2s). No-prize uses an empty
       parcel/blank ticket — never a fake near-miss grab-and-drop.
     - MINI: lever/button → all 3 reels spin → REEL 1 stops → REEL 2
       stops → REEL 3 stops → machine reacts → hold → reveal
       (2.6–2.9s). Reels are presentation only; engine RNG decides.
  3. Finished machine holds 180–300ms, then ONE shared reveal runs
     (500–900ms): `$RF` coin rises 4–8px with 1–2px bounce + 2–4 square
     sparkles, or the actual NFT image rises in its pixel frame, or a
     neutral shell-flavored empty state (no shame, no fake almost-win).
- **No rounded geometry**: domes, dials, and coins are octagons/rings with hard
  pixel edges — `border-radius` is not used anywhere in the arcade.
- **Reduced Motion**: no user-facing motion toggle exists. Normal motion is
  ON by default; OS-level `prefers-reduced-motion: reduce` is respected
  automatically with a SHORTENED (never removed) PULL → ACTION → RESULT
  causal chain.

---

## 10. Mobile Responsiveness
- Cabinets are designed to fit a standard mobile viewport (360px – 430px) without horizontal scrolling.
- Minimum touch target size: 44px × 44px for the PULL button and primary tabs.
- Multi-column layouts cleanly collapse into single-column vertical stacks on viewports < 768px.
- During a pull the cabinet stays the visual focus at a readable size
  (Tallboy claw never shrinks to an unreadable toy); the animation area is
  reserved (`.pull-stage`) so idle → pull → reveal → idle never shifts layout.

---

## 11. CABINET PULL LANGUAGE
- CLASSIC — PRIZE DRUM (transparent raffle drum, tumbling prize tiles, one
  mystery tile released — inner window effect only, never a second cabinet)
- CAPSULE — CAPSULE OPEN (lone capture ball: settle → shake → pause → shake →
  pause → stronger shake → settle → seam opens → interior light; identical for
  every result type so nothing leaks early)
- TALLBOY — CLAW GRAB (rail, carriage, cable, claw, minimal prize pile,
  delivered parcel; empty results use a blank parcel, never a near-miss)
- MINI — SLOT REELS (three reel windows, sequential stops; final symbols
  broadly echo rf/nft/empty but the engine stays authoritative)
- Shell choice changes the physical pull ritual and presentation only —
  economics, RNG, burn, and accounting are identical regardless of shell.
- Pull effects render ONLY inside the existing machine display window. No
  pull animation draws another cabinet, marquee, coin slot, or button.

## 12. MOTION
- Normal animation: ON by default.
- No user-facing motion toggle anywhere in the interface.
- OS-level `prefers-reduced-motion` is respected automatically (shortened
  pixel animation, causality preserved).
- Legacy persisted settings (`motionEnabled`, `reducedMotion`) are
  migrated/ignored safely; old `motionEnabled: false` becomes normal motion ON.

## 13. RF TOKEN
- Stepped collectible pixel coin (`RfTokenIcon.tsx`, 64×64 viewBox,
  `shape-rendering: crispEdges`, `image-rendering: pixelated`).
- Center mark: bitmap `$RF` (authoritative 5×7 glyphs, 2px pixels) — no font
  dependency, never a font-rendered circle, never redesigned.
- Palette: `#090909` ink, `#F3F1E8` paper, `#C7C6BE` light, `#8C8B84` mid,
  `#66665F` deep, `#FFFFFF` highlight.
- Sizes: balance 20–24px, small machine card 28–36px, normal prize 40–64px,
  Top Chase 96–128px (coin is the centerpiece with TOP CHASE label),
  prize reveal 112–160px, burn 20–48px with 4–8 square-pixel fragments +
  `5% BURNED` label (no flame emoji).
- The old black RF badge (`RfCoin.tsx`) is deleted; no competing token
  identity remains.
