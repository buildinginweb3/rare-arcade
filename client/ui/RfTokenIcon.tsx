import { PIXEL } from './pixelPalette.ts';

export type RfTokenIconProps = {
  size?: number;
  className?: string;
  title?: string;
  decorative?: boolean;
};

const GLYPHS = {
  "$": [
    "00100",
    "01111",
    "10100",
    "01110",
    "00101",
    "11110",
    "00100",
  ],
  R: [
    "11110",
    "10001",
    "10001",
    "11110",
    "10100",
    "10010",
    "10001",
  ],
  F: [
    "11111",
    "10000",
    "10000",
    "11110",
    "10000",
    "10000",
    "10000",
  ],
} as const;

/**
 * RARE ARCADE \u2014 canonical $RF / $RAREFRIENDS pixel token.
 *
 * The single source of this artwork. Top Chase, normal RF prizes, the
 * player and creator balances, burn visuals, and the prize reveal all
 * render THIS component, so the coin is identical everywhere and there
 * is no second or size-specific token asset.
 *
 * Material: deliberately FLAT.
 *
 * This coin carries no surface shine \u2014 no specular highlights, no
 * reflection blocks, no white hotspots, no grey shading. An earlier pass
 * added layered mid-grey / light-grey / white reflections to give the
 * coin depth; in practice the extra blocks read as clutter on a
 * coin this small, and at 20-24px they turned into noise beside the
 * balance numbers. The depth that matters here comes from the
 * STRUCTURE alone:
 *
 *   deep grey rear extrusion  -> the coin's thickness
 *   black stepped silhouette  -> the outer edge
 *   warm paper outer face     -> the rim band
 *   black inner rim           -> the recessed frame
 *   warm paper central face   -> the field the $RF sits on
 *   black $RF bitmap          -> the lettering
 *
 * That is a clean, high-contrast monochrome pixel coin that stays
 * legible at 20px and still reads as a collectible object at 144px.
 *
 * Constraints: whole logical pixels only, no subpixel coordinates, no
 * gradients, filters, blur, or drop-shadows, and the $RF lettering is
 * always drawn last so nothing can cover it.
 */
export function RfTokenIcon({
  size = 64,
  className,
  title = "$RAREFRIENDS",
  decorative = false,
}: RfTokenIconProps) {
  const chars = ["$", "R", "F"] as const;

  const pixel = 2;
  const glyphWidth = 5 * pixel;
  const gap = 2;
  const totalWidth =
    glyphWidth * chars.length +
    gap * (chars.length - 1);

  const startX =
    Math.round((64 - totalWidth) / 2);

  const startY = 25;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className ? `rf-token-icon ${className}` : "rf-token-icon"}
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      aria-hidden={decorative || undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      style={{
        display: "block",
        imageRendering: "pixelated",
      }}
    >
      {!decorative && <title>{title}</title>}

      {/* rear extrusion */}
      <path
        fill={PIXEL.deep}
        d="
          M20 6H44V10H52V14H56V20H60V44H56V52H52V56H44V60H20V58H12V54H8V48H6V22H10V14H14V10H20Z
        "
      />

      {/* outer stepped silhouette */}
      <path
        fill={PIXEL.ink}
        d="
          M20 2H44V6H52V10H56V14H60V22H62V42H60V50H56V54H52V58H44V62H20V58H12V54H8V50H4V42H2V22H4V14H8V10H12V6H20Z
        "
      />

      {/* outer face */}
      <path
        fill={PIXEL.paper}
        d="
          M20 8H44V10H50V14H54V20H58V42H54V48H50V52H44V56H20V54H14V50H10V44H8V22H10V16H14V12H20Z
        "
      />

      {/* inner rim */}
      <path
        fill={PIXEL.ink}
        d="
          M22 14H42V16H48V20H52V26H54V40H50V46H46V50H40V52H24V50H18V46H14V40H12V26H14V20H18V16H22Z
        "
      />

      {/* central face */}
      <path
        fill={PIXEL.paper}
        d="
          M22 18H42V20H46V22H50V28H52V38H48V44H44V48H20V46H16V42H14V28H16V22H20V20H22Z
        "
      />

      {/* bitmap $RF */}
      {chars.map((char, charIndex) => {
        const bitmap = GLYPHS[char];

        const offsetX =
          startX +
          charIndex *
            (glyphWidth + gap);

        return bitmap.flatMap(
          (row, rowIndex) =>
            row
              .split("")
              .map(
                (
                  value,
                  colIndex,
                ) =>
                  value === "1" ? (
                    <rect
                      key={`${char}-${rowIndex}-${colIndex}`}
                      x={
                        offsetX +
                        colIndex *
                          pixel
                      }
                      y={
                        startY +
                        rowIndex *
                          pixel
                      }
                      width={pixel}
                      height={pixel}
                      fill={PIXEL.ink}
                    />
                  ) : null,
              ),
        );
      })}
    </svg>
  );
}

export default RfTokenIcon;
