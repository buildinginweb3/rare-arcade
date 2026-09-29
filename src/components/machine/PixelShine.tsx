// PixelShine.tsx
//
// Shared three-tone reveal shine, extracted from PixelPullFx so the
// SVG pull stages and the HTML prize panel share one implementation.
//
//   MID-GRAY DEPTH  ->  LIGHT-GRAY RAYS  ->  PURE-WHITE HOTSPOT
//
// Pure white alone has no visible edge against the warm off-white
// paper, so a white-only star reads as erased pixels. The gray layer
// defines the silhouette, light gray reads as reflected light, and
// white is only the hottest reflective point. This keeps the sparkle
// legible on black, warm off-white, gray, and NFT frame backgrounds.
//
// This module is presentation only. It never influences RNG,
// odds, or economics.

import React from 'react';

const SHINE = {
  white: '#FFFFFF',
  light: '#C7C6BE',
  mid: '#8C8B84',
} as const;

export type PixelShineFrame = 0 | 1 | 2;

type PixelShineProps = {
  x: number;
  y: number;
  scale?: number;
  frame?: PixelShineFrame;
};

/**
 * Three-frame shine:
 *   frame 0 = tiny glint
 *   frame 1 = medium
 *   frame 2 = full shine
 *
 * All coordinates are logical pixel units, so no subpixel drift.
 */
export function PixelShine({ x, y, scale = 1, frame = 2 }: PixelShineProps): React.ReactElement | null {
  /*
   * Every emitted coordinate is snapped to a whole logical pixel.
   * Fractional scales (e.g. 0.75) would otherwise produce subpixel
   * geometry that breaks crisp pixel alignment and visual QA.
   */
  const p = Math.max(0.5, Math.round(scale * 2) / 2);
  const X = (v: number) => Math.round(x + v * p);
  const Y = (v: number) => Math.round(y + v * p);
  const S = (v: number) => Math.max(1, Math.round(v * p));

  if (frame === 0) {
    return (
      <g>
        <rect x={X(2)} y={Y(2)} width={S(2)} height={S(2)} fill={SHINE.mid} />
        <rect x={X(1)} y={Y(1)} width={S(2)} height={S(2)} fill={SHINE.white} />
      </g>
    );
  }

  if (frame === 1) {
    return (
      <g>
        <rect x={X(3)} y={Y(2)} width={S(2)} height={S(6)} fill={SHINE.mid} />
        <rect x={X(2)} y={Y(3)} width={S(6)} height={S(2)} fill={SHINE.mid} />
        <rect x={X(2)} y={Y(0)} width={S(2)} height={S(7)} fill={SHINE.light} />
        <rect x={X(0)} y={Y(2)} width={S(7)} height={S(2)} fill={SHINE.light} />
        <rect x={X(2)} y={Y(2)} width={S(2)} height={S(2)} fill={SHINE.white} />
      </g>
    );
  }

  return (
    <g>
      {/* BACK / DEPTH LAYER — offset down/right so the star keeps an
          edge even over the warm paper background. */}
      <rect x={X(4)} y={Y(2)} width={S(2)} height={S(10)} fill={SHINE.mid} />
      <rect x={X(2)} y={Y(4)} width={S(10)} height={S(2)} fill={SHINE.mid} />

      {/* LIGHT-GRAY OUTER RAYS */}
      <rect x={X(4)} y={Y(0)} width={S(2)} height={S(10)} fill={SHINE.light} />
      <rect x={X(0)} y={Y(4)} width={S(10)} height={S(2)} fill={SHINE.light} />

      {/* WHITE INNER RAYS — smaller than the gray structure, so white
          reads as reflected light rather than transparency. */}
      <rect x={X(4)} y={Y(2)} width={S(2)} height={S(6)} fill={SHINE.white} />
      <rect x={X(2)} y={Y(4)} width={S(6)} height={S(2)} fill={SHINE.white} />

      {/* white-hot center */}
      <rect x={X(4)} y={Y(4)} width={S(2)} height={S(2)} fill={SHINE.white} />

      {/* tiny secondary glints add dimensionality */}
      <rect x={X(11)} y={Y(1)} width={S(2)} height={S(2)} fill={SHINE.light} />
      <rect x={X(1)} y={Y(11)} width={S(2)} height={S(2)} fill={SHINE.mid} />
    </g>
  );
}

/**
 * Tiny glint -> medium -> full -> medium, then end.
 * ~520ms total. Fully deterministic: no randomness, so SSR output
 * and visual QA stay stable.
 */
export function RevealShine({
  time,
  start,
  x,
  y,
  scale = 1,
  maxFrame = 2,
}: {
  time: number;
  start: number;
  x: number;
  y: number;
  scale?: number;
  /**
   * Caps the animation at a smaller frame. Used for tertiary accents:
   * a 1px glint would vanish, so a medium star reads as "smaller"
   * while staying on whole logical pixels.
   */
  maxFrame?: PixelShineFrame;
}): React.ReactElement | null {
  const local = time - start;

  if (local < 0 || local > 520) {
    return null;
  }

  let frame: PixelShineFrame;
  if (local < 100) {
    frame = 0;
  } else if (local < 240) {
    frame = 1;
  } else if (local < 380) {
    frame = 2;
  } else {
    frame = 1;
  }

  if (frame > maxFrame) frame = maxFrame;

  return <PixelShine x={x} y={y} scale={scale} frame={frame} />;
}
