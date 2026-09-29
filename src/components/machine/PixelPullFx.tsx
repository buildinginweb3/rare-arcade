// PixelPullFx.tsx
//
// IMPORTANT:
// These are INNER pull effects only.
// They DO NOT draw another Friend Machine cabinet.
//
// The actual Rare Arcade shell/cabinet remains visible around this component.
//
// CLASSIC  -> prize drum
// CAPSULE  -> shaking/opening capsule ball
// TALLBOY  -> claw mechanism
// MINI     -> three pixel reels

import React, {
  useEffect,
  useRef,
  useState,
} from "react";
import { RevealShine } from "./PixelShine.tsx";

export type PullFxShell =
  | "classic"
  | "capsule"
  | "tallboy"
  | "mini";

export type PullFxResultKind =
  | "rf"
  | "nft"
  | "empty";

type PixelPullFxProps = {
  shell: PullFxShell;
  active: boolean;
  runId: number;
  resultKind?: PullFxResultKind;
  reducedMotion?: boolean;
  className?: string;
  onComplete: () => void;
  /**
   * Test-only: pins the scene clock to a fixed virtual time so
   * visual assertions can inspect exact animation frames without
   * driving rAF. Never set in the app.
   */
  __testTime?: number;
};

const C = {
  ink: "#090909",
  paper: "#F3F1E8",
  white: "#FFFFFF",
  light: "#C7C6BE",
  mid: "#8C8B84",
  dark: "#66665F",
} as const;

/*
 * These durations intentionally leave enough time
 * for the user to understand the physical action.
 */
const NORMAL_DURATION: Record<PullFxShell, number> = {
  classic: 2450,
  capsule: 2850,
  tallboy: 3050,
  mini: 2800,
};

const REDUCED_DURATION: Record<PullFxShell, number> = {
  classic: 800,
  capsule: 900,
  tallboy: 950,
  mini: 900,
};

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function phase(
  time: number,
  start: number,
  end: number,
) {
  return clamp01(
    (time - start) / (end - start),
  );
}

function lerpInt(
  from: number,
  to: number,
  progress: number,
) {
  return Math.round(
    from + (to - from) * clamp01(progress),
  );
}

/*
 * Intentionally low-framerate / stepped.
 * We want authored pixel motion rather than
 * 60 FPS vector smoothness.
 */
function usePixelTimeline(
  active: boolean,
  runId: number,
  duration: number,
  fps: number,
  onComplete: () => void,
) {
  const [elapsed, setElapsed] = useState(0);
  const callbackRef = useRef(onComplete);

  useEffect(() => {
    callbackRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }

    let raf = 0;
    let finished = false;

    const startedAt = performance.now();
    const frameMs = 1000 / fps;

    setElapsed(0);

    function tick(now: number) {
      const raw = Math.min(
        now - startedAt,
        duration,
      );

      const snapped =
        Math.floor(raw / frameMs) * frameMs;

      setElapsed(snapped);

      if (raw >= duration) {
        setElapsed(duration);

        if (!finished) {
          finished = true;
          callbackRef.current();
        }

        return;
      }

      raf = requestAnimationFrame(tick);
    }

    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
    };
  }, [
    active,
    runId,
    duration,
    fps,
  ]);

  return elapsed;
}

function PixelStage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 128 96"
      width="100%"
      height="100%"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      style={{
        display: "block",
        imageRendering: "pixelated",
        overflow: "visible",
      }}
    >
      {children}
    </svg>
  );
}

/* ==================================================
   PIXEL SHINE V2
   ==================================================

   Three-tone monochrome shine (shared with PrizeReveal):

     DARK/MID SHADOW
           v
     LIGHT-GRAY RAYS
           v
     PURE WHITE HOTSPOT

   Pure white alone has no visible edge against the warm
   off-white paper, so a white-only star reads as erased
   pixels. The gray layer defines the physical silhouette,
   light gray reads as reflected light, and white is only
   the hottest reflective point.

   PixelShine + RevealShine live in ./PixelShine.tsx so the
   SVG pull stages and the HTML prize panel share one
   implementation (no duplicated shine system).
*/
/*
 * Restrained reveal burst: one dominant glint, one delayed
 * secondary, one small tertiary. Deliberately NOT a particle
 * explosion — positions are fixed so composition stays
 * intentional and QA stays reliable.
 *
 * `tier` scales the dominant shine for larger prizes without
 * adding any new economics. NO-PRIZE gets nothing at all, so
 * the shine keeps its meaning.
 */
/**
 * Fixed glint anchors for the reveal burst.
 *
 * All three sit on the warm paper surround rather than on top of the
 * machine's black chassis (chassis occupies y=18..76), so the shine
 * reads as light around the machine instead of speckles on it. The
 * mid-gray depth layer is what makes each star legible here.
 *
 * Deterministic by design: no random positions, so composition stays
 * intentional and visual QA is stable.
 */
const REVEAL_GLINTS = {
  dominant: { x: 92, y: 4 },
  secondary: { x: 14, y: 82 },
  tertiary: { x: 30, y: 6 },
} as const;

function PrizeRevealShineBurst({
  time,
  resultKind,
  dominantFrame = 2,
}: {
  time: number;
  resultKind: PullFxResultKind;
  dominantFrame?: 0 | 1 | 2;
}) {
  // No-prize stays visually quiet, so the shine keeps its meaning.
  if (resultKind === "empty") {
    return null;
  }

  return (
    <g>
      {/* dominant upper-right glint */}
      <RevealShine
        time={time}
        start={0}
        x={REVEAL_GLINTS.dominant.x}
        y={REVEAL_GLINTS.dominant.y}
        maxFrame={dominantFrame}
      />

      {/* delayed secondary, lower-left */}
      <RevealShine
        time={time}
        start={120}
        x={REVEAL_GLINTS.secondary.x}
        y={REVEAL_GLINTS.secondary.y}
      />

      {/* small tertiary accent (medium frame: a 1px glint would vanish) */}
      <RevealShine
        time={time}
        start={230}
        x={REVEAL_GLINTS.tertiary.x}
        y={REVEAL_GLINTS.tertiary.y}
        maxFrame={1}
      />
    </g>
  );
}

/* ==================================================
   CAPSULE
   ==================================================

   Desired feeling:

   ball appears
   -> shake left
   -> pause
   -> shake right
   -> pause
   -> stronger shake
   -> settle
   -> seam flashes/cracks
   -> two halves open
   -> interior light
   -> result reveal happens AFTER component completes

   NO second machine is rendered.
*/

function CapsuleBall({
  x,
  y,
  split = 0,
  pulse = false,
}: {
  x: number;
  y: number;
  split?: number;
  pulse?: boolean;
}) {
  const topLift = lerpInt(0, 18, split);
  const bottomDrop = lerpInt(0, 7, split);

  const topSide = lerpInt(0, 4, split);
  const bottomSide = lerpInt(0, -3, split);

  return (
    <g>
      {/*
        Interior light only when opening.

        Layered gray -> paper -> small white hotspot so
        the glow has depth instead of reading as one
        large pure-white rectangle. Pure white stays
        reserved for genuine specular highlights.
      */}
      {split > 0.3 && (
        <>
          {pulse && (
            <rect
              x={x + 14}
              y={y + 14}
              width="36"
              height="26"
              fill={C.light}
            />
          )}

          <rect
            x={x + 18}
            y={y + 18}
            width="28"
            height="18"
            fill={C.paper}
          />

          <rect
            x={x + 30}
            y={y + 26}
            width="4"
            height="2"
            fill={C.white}
          />
        </>
      )}

      {/* bottom half */}
      <g
        transform={`translate(${bottomSide} ${bottomDrop})`}
      >
        <rect
          x={x + 12}
          y={y + 28}
          width="40"
          height="4"
          fill={C.ink}
        />

        <rect
          x={x + 8}
          y={y + 32}
          width="48"
          height="14"
          fill={C.ink}
        />

        <rect
          x={x + 12}
          y={y + 46}
          width="40"
          height="4"
          fill={C.ink}
        />

        <rect
          x={x + 12}
          y={y + 32}
          width="40"
          height="10"
          fill={C.light}
        />

        <rect
          x={x + 16}
          y={y + 42}
          width="32"
          height="4"
          fill={C.dark}
        />
      </g>

      {/* top half */}
      <g
        transform={`translate(${topSide} ${-topLift})`}
      >
        <rect
          x={x + 12}
          y={y + 8}
          width="40"
          height="4"
          fill={C.ink}
        />

        <rect
          x={x + 8}
          y={y + 12}
          width="48"
          height="16"
          fill={C.ink}
        />

        <rect
          x={x + 12}
          y={y + 12}
          width="40"
          height="12"
          fill={C.paper}
        />

        {/* tiny specular highlight on the tile label */}
        <rect
          x={x + 16}
          y={y + 12}
          width="6"
          height="2"
          fill={C.white}
        />
      </g>

      {/* dark seam */}
      {split < 0.7 && (
        <rect
          x={x + 8}
          y={y + 27}
          width="48"
          height="5"
          fill={C.ink}
        />
      )}

      {/* central clasp / latch */}
      {split < 0.35 && (
        <>
          <rect
            x={x + 26}
            y={y + 24}
            width="12"
            height="12"
            fill={C.ink}
          />

          <rect
            x={x + 29}
            y={y + 27}
            width="6"
            height="6"
            fill={
              pulse
                ? C.white
                : C.paper
            }
          />
        </>
      )}
    </g>
  );
}

function CapsuleFx({
  time,
  resultKind,
}: {
  time: number;
  resultKind: PullFxResultKind;
}) {
  /*
   * Capture-style suspense sequence without
   * copying a proprietary ball design.
   */

  let shakeX = 0;
  let shakeY = 0;

  // initial settle
  if (time < 350) {
    shakeY =
      Math.floor(time / 100) % 2 === 0
        ? -1
        : 0;
  }

  // shake #1
  if (time >= 450 && time < 800) {
    const frame =
      Math.floor((time - 450) / 75) % 4;

    shakeX = [-5, 0, 5, 0][frame] ?? 0;
  }

  // shake #2
  if (time >= 950 && time < 1325) {
    const frame =
      Math.floor((time - 950) / 70) % 4;

    shakeX = [6, 0, -6, 0][frame] ?? 0;
  }

  // stronger final shake
  if (time >= 1500 && time < 1925) {
    const frame =
      Math.floor((time - 1500) / 65) % 6;

    shakeX = [-8, -3, 6, 8, 2, -5][frame] ?? 0;
    shakeY = [0, -2, 0, 1, -1, 0][frame] ?? 0;
  }

  const pulse =
    (time >= 780 && time < 900) ||
    (time >= 1310 && time < 1420) ||
    (time >= 1880 && time < 2040);

  const split =
    time < 2050
      ? 0
      : phase(time, 2050, 2550);

  // Reveal shine begins only after the capsule has opened.
  const shineAt = 2400;
  return (
    <PixelStage>
      {/* subtle ground shadow */}
      <rect
        x="38"
        y="79"
        width="52"
        height="4"
        fill={C.dark}
      />

      <g
        transform={`translate(${shakeX} ${shakeY})`}
      >
        <CapsuleBall
          x={32}
          y={20}
          split={split}
          pulse={pulse}
        />
      </g>

      {time >= shineAt && (
        <PrizeRevealShineBurst
          time={time - 2400}
          resultKind={resultKind}
        />
      )}
    </PixelStage>
  );
}

/* ==================================================
   CLASSIC — PRIZE DRUM
   ==================================================

   Previous problem:
   "Drum shake" was visually unclear.

   New concept:
   The player sees an unmistakable transparent
   raffle/prize drum containing pixel prize tiles.

   It rotates visibly, contents tumble, then one
   mystery tile drops out.

   No cabinet is drawn.
*/

const DRUM_PRIZES = [
  { x: -18, y: -8 },
  { x: 8, y: -13 },
  { x: 19, y: 3 },
  { x: -5, y: 12 },
  { x: -22, y: 8 },
];

function DrumTile({
  x,
  y,
  variant,
}: {
  x: number;
  y: number;
  variant: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x="-5"
        y="-5"
        width="10"
        height="10"
        fill={C.ink}
      />

      <rect
        x="-3"
        y="-3"
        width="6"
        height="6"
        fill={
          variant % 2 === 0
            ? C.paper
            : C.light
        }
      />

      {variant % 3 === 0 && (
        <rect
          x="-1"
          y="-3"
          width="2"
          height="6"
          fill={C.dark}
        />
      )}
    </g>
  );
}

function PrizeDrum({
  time,
  resultKind,
}: {
  time: number;
  resultKind: PullFxResultKind;
}) {
  /*
   * Use stepped angular states rather than
   * smooth SVG rotation.
   */
  const spinActive =
    time >= 250 && time < 1600;

  const spinFrame = spinActive
    ? Math.floor((time - 250) / 90)
    : 0;

  /*
   * Sequence of intentionally coarse angles.
   * Avoiding smooth rotation helps the pixel-art feel.
   */
  const angles = [
    0,
    30,
    65,
    105,
    150,
    195,
    240,
    285,
    330,
  ];

  let angle =
    angles[spinFrame % angles.length] ?? 0;

  if (time >= 1600 && time < 1900) {
    const slowFrame =
      Math.floor((time - 1600) / 100);

    angle = [330, 355, 12][
      Math.min(slowFrame, 2)
    ] ?? 12;
  }

  if (time >= 1900) {
    angle = 12;
  }

  const drumShake =
    time >= 450 && time < 1500
      ? [
          -2,
          1,
          2,
          -1,
        ][
          Math.floor(
            (time - 450) / 90,
          ) % 4
        ]
      : 0;

  const releaseProgress =
    phase(time, 1925, 2250);

  const resultTileY =
    lerpInt(52, 76, releaseProgress);

  const resultTileX =
    lerpInt(64, 70, releaseProgress);

  const showResultTile =
    time >= 1880;

  return (
    <PixelStage>
      {/* obvious support axle */}
      <rect
        x="18"
        y="47"
        width="20"
        height="4"
        fill={C.ink}
      />

      <rect
        x="90"
        y="47"
        width="20"
        height="4"
        fill={C.ink}
      />

      {/* drum */}
      <g
        transform={`translate(${drumShake} 0)`}
      >
        {/* outer cage */}
        <rect
          x="36"
          y="16"
          width="56"
          height="4"
          fill={C.ink}
        />

        <rect
          x="28"
          y="20"
          width="72"
          height="56"
          fill={C.ink}
        />

        <rect
          x="36"
          y="76"
          width="56"
          height="4"
          fill={C.ink}
        />

        {/* clear inside */}
        <rect
          x="32"
          y="24"
          width="64"
          height="48"
          fill={C.paper}
        />

        {/* cage bands */}
        <rect
          x="32"
          y="34"
          width="64"
          height="3"
          fill={C.light}
        />

        <rect
          x="32"
          y="59"
          width="64"
          height="3"
          fill={C.light}
        />

        {/* rotating contents */}
        <g
          transform={`rotate(${angle} 64 48)`}
        >
          {DRUM_PRIZES.map(
            (p, index) => (
              <DrumTile
                key={index}
                x={64 + p.x}
                y={48 + p.y}
                variant={index}
              />
            ),
          )}
        </g>

        {/* axle */}
        <rect
          x="60"
          y="44"
          width="8"
          height="8"
          fill={C.ink}
        />

        <rect
          x="62"
          y="46"
          width="4"
          height="4"
          fill={C.white}
        />
      </g>

      {/* release chute marker */}
      <rect
        x="59"
        y="77"
        width="12"
        height="4"
        fill={C.ink}
      />

      {showResultTile && (
        <MysteryPrizeTile
          x={resultTileX}
          y={resultTileY}
        />
      )}

      {time >= 2225 && (
        <PrizeRevealShineBurst
          time={time - 2225}
          resultKind={resultKind}
        />
      )}
    </PixelStage>
  );
}

function MysteryPrizeTile({
  x,
  y,
}: {
  x: number;
  y: number;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x="-8"
        y="-6"
        width="16"
        height="12"
        fill={C.ink}
      />

      {/* tile face: warm paper, not a pure-white card */}
      <rect
        x="-5"
        y="-3"
        width="10"
        height="6"
        fill={C.paper}
      />

      {/* tiny specular edge highlight */}
      <rect
        x="-5"
        y="-3"
        width="5"
        height="2"
        fill={C.white}
      />

      {/* question / mystery pixel mark */}
      <rect
        x="-2"
        y="-2"
        width="4"
        height="2"
        fill={C.ink}
      />

      <rect
        x="0"
        y="0"
        width="2"
        height="2"
        fill={C.ink}
      />

      <rect
        x="-1"
        y="3"
        width="2"
        height="2"
        fill={C.ink}
      />
    </g>
  );
}

function ClassicFx({
  time,
  resultKind,
}: {
  time: number;
  resultKind: PullFxResultKind;
}) {
  return (
    <PrizeDrum
      time={time}
      resultKind={resultKind}
    />
  );
}

/* ==================================================
   TALLBOY — CLAW ONLY
   ==================================================

   No Tallboy cabinet.

   Just:
   rail
   carriage
   cable
   claw
   prize pile
   delivery zone
*/

function PrizeParcel({
  x,
  y,
  empty = false,
}: {
  x: number;
  y: number;
  empty?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect
        x="-8"
        y="-7"
        width="16"
        height="14"
        fill={C.ink}
      />

      <rect
        x="-5"
        y="-4"
        width="10"
        height="8"
        fill={
          empty
            ? C.light
            : C.paper
        }
      />

      {!empty && (
        <>
          <rect
            x="-1"
            y="-4"
            width="2"
            height="8"
            fill={C.light}
          />

          <rect
            x="-5"
            y="-1"
            width="10"
            height="2"
            fill={C.light}
          />
        </>
      )}
    </g>
  );
}

function InnerClaw({
  x,
  y,
  open,
}: {
  x: number;
  y: number;
  open: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {/* claw head */}
      <rect
        x="-10"
        y="0"
        width="20"
        height="6"
        fill={C.ink}
      />

      <rect
        x="-6"
        y="2"
        width="12"
        height="2"
        fill={C.paper}
      />

      {/* middle joint */}
      <rect
        x="-2"
        y="6"
        width="4"
        height="6"
        fill={C.ink}
      />

      {open ? (
        <>
          {/* open left */}
          <rect
            x="-10"
            y="10"
            width="4"
            height="12"
            fill={C.ink}
          />

          <rect
            x="-14"
            y="20"
            width="8"
            height="4"
            fill={C.ink}
          />

          {/* open right */}
          <rect
            x="6"
            y="10"
            width="4"
            height="12"
            fill={C.ink}
          />

          <rect
            x="6"
            y="20"
            width="8"
            height="4"
            fill={C.ink}
          />
        </>
      ) : (
        <>
          {/* closed left */}
          <rect
            x="-6"
            y="10"
            width="4"
            height="14"
            fill={C.ink}
          />

          <rect
            x="-4"
            y="22"
            width="6"
            height="4"
            fill={C.ink}
          />

          {/* closed right */}
          <rect
            x="2"
            y="10"
            width="4"
            height="14"
            fill={C.ink}
          />

          <rect
            x="-2"
            y="22"
            width="6"
            height="4"
            fill={C.ink}
          />
        </>
      )}
    </g>
  );
}

function TallboyFx({
  time,
  resultKind,
}: {
  time: number;
  resultKind: PullFxResultKind;
}) {
  let carriageX = 28;

  if (time >= 200 && time < 650) {
    carriageX =
      lerpInt(
        28,
        65,
        phase(time, 200, 650),
      );
  } else if (
    time >= 650 &&
    time < 1850
  ) {
    carriageX = 65;
  } else if (
    time >= 1850 &&
    time < 2280
  ) {
    carriageX =
      lerpInt(
        65,
        103,
        phase(time, 1850, 2280),
      );
  } else if (time >= 2280) {
    carriageX = 103;
  }

  let clawY = 19;

  if (time >= 650 && time < 1150) {
    clawY =
      lerpInt(
        19,
        56,
        phase(time, 650, 1150),
      );
  } else if (
    time >= 1150 &&
    time < 1430
  ) {
    clawY = 56;
  } else if (
    time >= 1430 &&
    time < 1850
  ) {
    clawY =
      lerpInt(
        56,
        20,
        phase(time, 1430, 1850),
      );
  } else if (
    time >= 1850 &&
    time < 2280
  ) {
    clawY = 20;
  } else if (
    time >= 2280 &&
    time < 2520
  ) {
    clawY =
      lerpInt(
        20,
        49,
        phase(time, 2280, 2520),
      );
  } else if (time >= 2520) {
    clawY = 49;
  }

  const open =
    time < 1150 || time >= 2520;

  const carrying =
    time >= 1430 && time < 2520;

  let parcelX = 65;
  let parcelY = 78;

  if (carrying) {
    parcelX = carriageX;
    parcelY = clawY + 30;
  }

  if (time >= 2520) {
    parcelX = 103;
    parcelY =
      lerpInt(
        72,
        83,
        phase(time, 2520, 2750),
      );
  }

  const cableHeight =
    Math.max(3, clawY - 13);

  const empty =
    resultKind === "empty";

  return (
    <PixelStage>
      {/* top rail only */}
      <rect
        x="14"
        y="12"
        width="100"
        height="5"
        fill={C.ink}
      />

      <rect
        x="18"
        y="17"
        width="92"
        height="2"
        fill={C.light}
      />

      {/* carriage */}
      <rect
        x={carriageX - 10}
        y="10"
        width="20"
        height="10"
        fill={C.ink}
      />

      <rect
        x={carriageX - 6}
        y="12"
        width="12"
        height="4"
        fill={C.paper}
      />

      {/* cable */}
      <rect
        x={carriageX - 1}
        y="20"
        width="2"
        height={cableHeight}
        fill={C.ink}
      />

      <InnerClaw
        x={carriageX}
        y={clawY}
        open={open}
      />

      {/* minimal prize bed */}
      <rect
        x="42"
        y="80"
        width="46"
        height="3"
        fill={C.dark}
      />

      <rect
        x="47"
        y="75"
        width="8"
        height="5"
        fill={C.light}
      />

      <rect
        x="58"
        y="73"
        width="10"
        height="7"
        fill={C.paper}
      />

      <rect
        x="73"
        y="76"
        width="9"
        height="4"
        fill={C.light}
      />

      <PrizeParcel
        x={parcelX}
        y={parcelY}
        empty={empty}
      />

      {/* delivery zone marker only */}
      <rect
        x="94"
        y="84"
        width="20"
        height="3"
        fill={C.ink}
      />

      {time >= 2730 && (
        <PrizeRevealShineBurst
          time={time - 2730}
          resultKind={resultKind}
        />
      )}
    </PixelStage>
  );
}
/* ==================================================
   MINI REELS V2
   ==================================================

   Perfectly symmetrical 3-reel assembly:

   - identical reel dimensions
   - identical gutter widths
   - symbols perfectly centered
   - no giant pure-white reel cards
   - reel interior uses warm paper
   - one black chassis forms all separators
   - stepped vertical reel motion
   - sequential stops
*/

/*
 * MINI reel geometry — single source of truth.
 *
 * Symmetry is arithmetic, not eyeballed:
 *   stage width      128
 *   chassis x=10, width=108
 *   reel width 28 x 3 = 84
 *   gutter     6 x 2 = 12
 *   occupied       = 96, leaving 6px outer margin each side
 *   reel X = 16, 50, 84  (pitch 34, gap 6)
 *
 * Identical on every reel: 28x40 box, 3px ink frame,
 * 22x34 paper interior, 10x10 symbol with 9px horizontal
 * and 15px vertical margins (exactly centered).
 */
export const MINI_REEL_GEOMETRY = {
  reelX: [16, 50, 84] as const,
  reelY: 25,
  reelWidth: 28,
  reelHeight: 40,
  gutter: 6,
  frame: 3,
  symbolPixel: 2,
  stopTimes: [1650, 1950, 2250] as const,
} as const;

const MINI_REEL_SYMBOLS = [
  [
    "00100",
    "01110",
    "11111",
    "01110",
    "00100",
  ], // sparkle
  [
    "11111",
    "10001",
    "10101",
    "10001",
    "11111",
  ], // NFT / card
  [
    "01110",
    "10001",
    "11111",
    "10001",
    "01110",
  ], // capsule
  [
    "11111",
    "10101",
    "11111",
    "10101",
    "11111",
  ], // RF
  [
    "00100",
    "10101",
    "01110",
    "10101",
    "00100",
  ], // star
] as const;

function MiniReelSymbol({
  symbol,
  x,
  y,
  pixel = 2,
}: {
  symbol: number;
  x: number;
  y: number;
  pixel?: number;
}) {
  const bitmap =
    MINI_REEL_SYMBOLS[
      symbol % MINI_REEL_SYMBOLS.length
    ] ?? MINI_REEL_SYMBOLS[0]!;

  return (
    <g>
      {bitmap.flatMap(
        (row, rowIndex) =>
          row.split("").map(
            (cell, colIndex) =>
              cell === "1" ? (
                <rect
                  key={`${rowIndex}-${colIndex}`}
                  x={
                    x +
                    colIndex * pixel
                  }
                  y={
                    y +
                    rowIndex * pixel
                  }
                  width={pixel}
                  height={pixel}
                  fill={C.ink}
                />
              ) : null,
          ),
      )}
    </g>
  );
}

/*
 * One reel window.
 *
 * Geometry is fixed and identical for all three:
 *   width 28, height 40, 3px ink frame,
 *   22x34 paper interior, symbol 10x10 centered
 *   (9px left/right, 15px top/bottom).
 */
function MiniReel({
  index,
  x,
  y,
  time,
  stopTime,
  finalSymbol,
}: {
  index: number;
  x: number;
  y: number;
  time: number;
  stopTime: number;
  finalSymbol: number;
}) {
  const stopped = time >= stopTime;

  /* Deliberately stepped, 80ms per reel frame. */
  const tick = Math.max(
    0,
    Math.floor((time - 250) / 80),
  );

  const currentSymbol = stopped
    ? finalSymbol
    : (tick + index * 2) %
      MINI_REEL_SYMBOLS.length;

  const nextSymbol = stopped
    ? finalSymbol
    : (currentSymbol + 1) %
      MINI_REEL_SYMBOLS.length;

  /*
   * Vertical stepping: the current symbol travels up
   * while the next enters from below, both clipped to
   * the window, so it reads as a real rotating reel
   * rather than an in-place symbol swap.
   */
  const stepFrame = stopped ? 0 : tick % 4;

  const offsetY = stepFrame * 4;

  const clipId = `mini-reel-clip-${index}`;

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect
            x={x}
            y={y}
            width="28"
            height="40"
          />
        </clipPath>
      </defs>

      {/* black outer frame */}
      <rect
        x={x}
        y={y}
        width="28"
        height="40"
        fill={C.ink}
      />

      {/*
        No pure-white panel: warm paper fills the
        entire usable interior, identical on all reels.
      */}
      <rect
        x={x + 3}
        y={y + 3}
        width="22"
        height="34"
        fill={C.paper}
      />

      <g clipPath={`url(#${clipId})`}>
        {stopped ? (
          <MiniReelSymbol
            symbol={finalSymbol}
            x={x + 9}
            y={y + 15}
            pixel={2}
          />
        ) : (
          <>
            {/* outgoing symbol */}
            <MiniReelSymbol
              symbol={currentSymbol}
              x={x + 9}
              y={y + 15 - offsetY}
              pixel={2}
            />

            {/* incoming symbol */}
            <MiniReelSymbol
              symbol={nextSymbol}
              x={x + 9}
              y={y + 31 - offsetY}
              pixel={2}
            />
          </>
        )}
      </g>

      {/* tiny stop marker */}
      {stopped && (
        <rect
          x={x + 9}
          y={y + 44}
          width="10"
          height="3"
          fill={C.light}
        />
      )}
    </g>
  );
}

function MiniFxV2({
  time,
  resultKind,
}: {
  time: number;
  resultKind: PullFxResultKind;
}) {
  /*
   * FINAL REEL SYMBOLS
   *
   * These visually correspond with the broad outcome
   * but DO NOT determine RNG — the authoritative
   * result is already known before the animation runs.
   */
  const finalSymbols =
    resultKind === "rf"
      ? [3, 3, 3]
      : resultKind === "nft"
        ? [1, 1, 1]
        : [0, 2, 4];

  /* Deliberately staggered. */
  const stopTimes = MINI_REEL_GEOMETRY.stopTimes;

  /*
   * PERFECTLY SYMMETRICAL GEOMETRY
   *
   * Stage width = 128
   * Chassis: x=10, width=108
   * Reel width 28 x 3 = 84
   * Gap 6 x 2 = 12
   * Occupied = 96, outer margins 6 each side
   *
   * Reel X: 16, 50, 84  (pitch 34, gap 6)
   */
  const reelX = MINI_REEL_GEOMETRY.reelX;

  const reelY = MINI_REEL_GEOMETRY.reelY;

  /* Tiny reaction after the final reel. */
  const reactionY =
    time >= 2250 && time < 2340
      ? -2
      : time >= 2340 && time < 2430
        ? 1
        : 0;

  return (
    <PixelStage>
      <g
        transform={`translate(0 ${reactionY})`}
      >
        {/*
          One single unified black chassis — this
          naturally forms the left margin, both
          gutters, and the right margin.
        */}
        <rect
          x="10"
          y="18"
          width="108"
          height="58"
          fill={C.ink}
        />

        {/* subtle underside depth, not a white slab */}
        <rect
          x="14"
          y="76"
          width="100"
          height="4"
          fill={C.dark}
        />

        {reelX.map((x, index) => (
          <MiniReel
            key={index}
            index={index}
            x={x}
            y={reelY}
            time={time}
            stopTime={stopTimes[index] ?? 0}
            finalSymbol={finalSymbols[index] ?? 0}
          />
        ))}
      </g>

      {/*
        No reveal sparkles inside the reel assembly —
        the shared reveal shine burst handles hype,
        and only once the reels have fully stopped.
      */}
      {time >= 2430 && (
        <PrizeRevealShineBurst
          time={time - 2430}
          resultKind={resultKind}
        />
      )}
    </PixelStage>
  );
}

/* ==================================================
   MASTER
   ================================================== */

export function PixelPullFx({
  shell,
  active,
  runId,
  resultKind = "empty",
  reducedMotion = false,
  className,
  onComplete,
  __testTime,
}: PixelPullFxProps) {
  const baseDuration =
    NORMAL_DURATION[shell];

  const actualDuration =
    reducedMotion
      ? REDUCED_DURATION[shell]
      : baseDuration;

  const elapsed = usePixelTimeline(
    active,
    runId,
    actualDuration,
    reducedMotion ? 16 : 12,
    onComplete,
  );

  /*
   * Reduced motion plays the same conceptual
   * sequence at compressed time, rather than
   * bypassing it.
   */
  const virtualTime =
    __testTime !== undefined
      ? __testTime
      : actualDuration > 0
        ? Math.round(
            (elapsed / actualDuration) *
              baseDuration,
          )
        : baseDuration;

  return (
    <div
      className={className}
      aria-label="Pull in progress"
      aria-live="polite"
      style={{
        width: "100%",
        maxWidth: 520,
        marginInline: "auto",
        aspectRatio: "4 / 3",
        imageRendering: "pixelated",
      }}
    >
      {shell === "classic" && (
        <ClassicFx
          time={virtualTime}
          resultKind={resultKind}
        />
      )}

      {shell === "capsule" && (
        <CapsuleFx
          time={virtualTime}
          resultKind={resultKind}
        />
      )}

      {shell === "tallboy" && (
        <TallboyFx
          time={virtualTime}
          resultKind={resultKind}
        />
      )}

      {shell === "mini" && (
        <MiniFxV2
          time={virtualTime}
          resultKind={resultKind}
        />
      )}
    </div>
  );
}

export default PixelPullFx;
