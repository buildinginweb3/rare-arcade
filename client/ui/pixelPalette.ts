/**
 * pixelPalette.ts
 *
 * The Rare Arcade warm-monochrome pixel-art palette, shared by the
 * code-drawn pixel components (the $RF token, its surface shine, and
 * the pull-FX pixel stages) so those components cannot drift apart.
 *
 * This is deliberately NOT the same as the CSS UI palette
 * (--color-black, --color-gray-*, ...), which is a cooler near-black
 * and near-white grey ramp. The pixel art needs the warm off-white
 * paper value and the warmer greys to read as a single monochrome
 * material, so these relative values are preserved exactly.
 *
 * Hierarchy, lightest last:
 *   deep  -> mid -> light -> paper -> white
 *
 * Pure white is reserved for small specular hotspots and sparkle
 * centres. It is never used for a large static surface, because white
 * on warm off-white has too little contrast to read as a highlight
 * and instead looks like erased or missing pixels.
 */
export const PIXEL = {
  /** Structural black: silhouettes, rims, bitmap lettering. */
  ink: '#090909',
  /** Warm off-white coin/screen face. */
  paper: '#F3F1E8',
  /** Mid grey: reflection depth and backing edges. */
  mid: '#8C8B84',
  /** Light grey: reflected-light bodies. */
  light: '#C7C6BE',
  /** Pure white: tiny specular hotspots only. */
  white: '#FFFFFF',
  /** Deep grey: rear extrusion and material shade. */
  deep: '#66665F',
} as const;

export type PixelTone = (typeof PIXEL)[keyof typeof PIXEL];
