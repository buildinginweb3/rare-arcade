import React from 'react';

export type PixelIconName =
  | 'rf'
  | 'burn'
  | 'friend'
  | 'pull'
  | 'machine'
  | 'creator'
  | 'player'
  | 'prize'
  | 'odds'
  | 'rtp'
  | 'wallet'
  | 'inventory'
  | 'activity'
  | 'settings'
  | 'stats'
  | 'lock'
  | 'soldout'
  | 'share'
  | 'warning'
  | 'trophy'
  | 'sound-on'
  | 'sound-off'
  | 'check'
  | 'close'
  | 'arrow-left'
  | 'arrow-right'
  | 'plus'
  | 'minus'
  | 'deck'
  | 'dial';

interface PixelIconProps {
  name: PixelIconName;
  size?: number;
  className?: string;
  color?: string; // default currentColor
}

/**
 * Pure 16x16 Monochrome Pixel Icons.
 * Authored on a strict 16x16 integer grid with shape-rendering: crispEdges.
 * Guaranteed: NO EMOJIS, crisp pixel boundaries.
 */
export const PixelIcon: React.FC<PixelIconProps> = ({
  name,
  size = 16,
  className = '',
  color = 'currentColor',
}) => {
  const renderPaths = () => {
    switch (name) {
      case 'rf':
        // Hexagonal coin with "RF" monogram
        return (
          <>
            <rect x="4" y="1" width="8" height="1" fill={color} />
            <rect x="2" y="2" width="2" height="1" fill={color} />
            <rect x="12" y="2" width="2" height="1" fill={color} />
            <rect x="1" y="3" width="1" height="10" fill={color} />
            <rect x="14" y="3" width="1" height="10" fill={color} />
            <rect x="2" y="13" width="2" height="1" fill={color} />
            <rect x="12" y="13" width="2" height="1" fill={color} />
            <rect x="4" y="14" width="8" height="1" fill={color} />
            {/* R */}
            <rect x="4" y="5" width="1" height="6" fill={color} />
            <rect x="5" y="5" width="2" height="1" fill={color} />
            <rect x="7" y="6" width="1" height="2" fill={color} />
            <rect x="5" y="8" width="2" height="1" fill={color} />
            <rect x="6" y="9" width="1" height="1" fill={color} />
            <rect x="7" y="10" width="1" height="1" fill={color} />
            {/* F */}
            <rect x="10" y="5" width="1" height="6" fill={color} />
            <rect x="11" y="5" width="2" height="1" fill={color} />
            <rect x="11" y="7" width="2" height="1" fill={color} />
          </>
        );

      case 'burn':
        // Pixel flame / spark
        return (
          <>
            <rect x="7" y="1" width="2" height="2" fill={color} />
            <rect x="6" y="3" width="4" height="2" fill={color} />
            <rect x="5" y="5" width="6" height="3" fill={color} />
            <rect x="3" y="8" width="10" height="4" fill={color} />
            <rect x="4" y="12" width="8" height="2" fill={color} />
            <rect x="6" y="14" width="4" height="1" fill={color} />
            <rect x="2" y="6" width="1" height="2" fill={color} />
            <rect x="13" y="6" width="1" height="2" fill={color} />
          </>
        );

      case 'friend':
        // Rare Friend pixel face
        return (
          <>
            <rect x="3" y="2" width="10" height="1" fill={color} />
            <rect x="2" y="3" width="12" height="9" fill={color} />
            <rect x="3" y="12" width="10" height="1" fill={color} />
            <rect x="4" y="13" width="2" height="2" fill={color} />
            <rect x="10" y="13" width="2" height="2" fill={color} />
            {/* Cutouts for eyes */}
            <rect x="4" y="5" width="2" height="2" fill="#ffffff" />
            <rect x="10" y="5" width="2" height="2" fill="#ffffff" />
            <rect x="7" y="8" width="2" height="1" fill="#ffffff" />
          </>
        );

      case 'pull':
        // Crank handle / coin slot
        return (
          <>
            <rect x="2" y="2" width="12" height="2" fill={color} />
            <rect x="7" y="4" width="2" height="6" fill={color} />
            <rect x="5" y="10" width="6" height="4" fill={color} />
            <rect x="7" y="14" width="2" height="1" fill={color} />
          </>
        );

      case 'machine':
        // Mini arcade cabinet
        return (
          <>
            <rect x="3" y="1" width="10" height="2" fill={color} />
            <rect x="2" y="3" width="12" height="11" fill={color} />
            <rect x="4" y="4" width="8" height="4" fill="#ffffff" />
            <rect x="7" y="5" width="2" height="2" fill={color} />
            <rect x="5" y="10" width="6" height="2" fill="#ffffff" />
            <rect x="3" y="14" width="3" height="1" fill={color} />
            <rect x="10" y="14" width="3" height="1" fill={color} />
          </>
        );

      case 'creator':
        // Workshop hammer / wrench
        return (
          <>
            <rect x="10" y="1" width="4" height="2" fill={color} />
            <rect x="9" y="3" width="3" height="2" fill={color} />
            <rect x="7" y="5" width="3" height="2" fill={color} />
            <rect x="5" y="7" width="3" height="3" fill={color} />
            <rect x="3" y="10" width="3" height="3" fill={color} />
            <rect x="1" y="13" width="3" height="2" fill={color} />
          </>
        );

      case 'player':
        // Retro controller / d-pad
        return (
          <>
            <rect x="2" y="4" width="12" height="8" fill={color} />
            <rect x="1" y="6" width="1" height="4" fill={color} />
            <rect x="14" y="6" width="1" height="4" fill={color} />
            {/* D-Pad cutout */}
            <rect x="4" y="7" width="3" height="2" fill="#ffffff" />
            <rect x="5" y="6" width="1" height="4" fill="#ffffff" />
            {/* Buttons */}
            <rect x="10" y="7" width="1" height="1" fill="#ffffff" />
            <rect x="11" y="8" width="1" height="1" fill="#ffffff" />
          </>
        );

      case 'prize':
        // Gift box with ribbon
        return (
          <>
            <rect x="2" y="3" width="12" height="3" fill={color} />
            <rect x="3" y="6" width="10" height="8" fill={color} />
            {/* Ribbon cutouts */}
            <rect x="7" y="1" width="2" height="2" fill={color} />
            <rect x="7" y="3" width="2" height="11" fill="#ffffff" />
            <rect x="3" y="9" width="10" height="2" fill="#ffffff" />
          </>
        );

      case 'odds':
        // Pixel dice
        return (
          <>
            <rect x="2" y="2" width="12" height="12" fill={color} />
            <rect x="4" y="4" width="2" height="2" fill="#ffffff" />
            <rect x="10" y="4" width="2" height="2" fill="#ffffff" />
            <rect x="7" y="7" width="2" height="2" fill="#ffffff" />
            <rect x="4" y="10" width="2" height="2" fill="#ffffff" />
            <rect x="10" y="10" width="2" height="2" fill="#ffffff" />
          </>
        );

      case 'rtp':
        // Percent meter / gauge
        return (
          <>
            <rect x="2" y="2" width="12" height="12" fill="none" stroke={color} strokeWidth="2" />
            <rect x="4" y="4" width="2" height="2" fill={color} />
            <rect x="10" y="10" width="2" height="2" fill={color} />
            <rect x="9" y="4" width="2" height="2" fill={color} />
            <rect x="7" y="7" width="2" height="2" fill={color} />
            <rect x="5" y="10" width="2" height="2" fill={color} />
          </>
        );

      case 'wallet':
        // Pixel wallet
        return (
          <>
            <rect x="2" y="3" width="12" height="10" fill={color} />
            <rect x="10" y="6" width="4" height="4" fill="#ffffff" />
            <rect x="11" y="7" width="2" height="2" fill={color} />
          </>
        );

      case 'inventory':
        // Grid inventory tray
        return (
          <>
            <rect x="2" y="2" width="12" height="12" fill="none" stroke={color} strokeWidth="2" />
            <rect x="7" y="2" width="2" height="12" fill={color} />
            <rect x="2" y="7" width="12" height="2" fill={color} />
          </>
        );

      case 'activity':
        // Pulse waveform / signal
        return (
          <>
            <rect x="1" y="8" width="3" height="2" fill={color} />
            <rect x="4" y="5" width="2" height="5" fill={color} />
            <rect x="6" y="2" width="2" height="12" fill={color} />
            <rect x="8" y="7" width="2" height="7" fill={color} />
            <rect x="10" y="4" width="2" height="6" fill={color} />
            <rect x="12" y="8" width="3" height="2" fill={color} />
          </>
        );

      case 'settings':
        // 8-bit gear
        return (
          <>
            <rect x="6" y="1" width="4" height="2" fill={color} />
            <rect x="6" y="13" width="4" height="2" fill={color} />
            <rect x="1" y="6" width="2" height="4" fill={color} />
            <rect x="13" y="6" width="2" height="4" fill={color} />
            <rect x="4" y="4" width="8" height="8" fill={color} />
            <rect x="6" y="6" width="4" height="4" fill="#ffffff" />
          </>
        );

      case 'stats':
        // Bar chart
        return (
          <>
            <rect x="2" y="10" width="3" height="4" fill={color} />
            <rect x="6" y="6" width="3" height="8" fill={color} />
            <rect x="10" y="2" width="3" height="12" fill={color} />
            <rect x="1" y="14" width="14" height="1" fill={color} />
          </>
        );

      case 'lock':
        // Padlock
        return (
          <>
            <rect x="5" y="2" width="6" height="4" fill="none" stroke={color} strokeWidth="2" />
            <rect x="3" y="6" width="10" height="8" fill={color} />
            <rect x="7" y="8" width="2" height="3" fill="#ffffff" />
          </>
        );

      case 'soldout':
        // Sold out / crossed banner
        return (
          <>
            <rect x="1" y="2" width="14" height="12" fill={color} />
            <rect x="3" y="4" width="10" height="8" fill="#ffffff" />
            <rect x="4" y="5" width="2" height="2" fill={color} />
            <rect x="6" y="7" width="4" height="2" fill={color} />
            <rect x="10" y="9" width="2" height="2" fill={color} />
            <rect x="10" y="5" width="2" height="2" fill={color} />
            <rect x="4" y="9" width="2" height="2" fill={color} />
          </>
        );

      case 'share':
        // Arrow out of box
        return (
          <>
            <rect x="2" y="6" width="2" height="8" fill={color} />
            <rect x="12" y="6" width="2" height="8" fill={color} />
            <rect x="2" y="12" width="12" height="2" fill={color} />
            <rect x="7" y="1" width="2" height="8" fill={color} />
            <rect x="5" y="3" width="2" height="2" fill={color} />
            <rect x="9" y="3" width="2" height="2" fill={color} />
          </>
        );

      case 'warning':
        // Triangle warning
        return (
          <>
            <rect x="7" y="2" width="2" height="2" fill={color} />
            <rect x="6" y="4" width="4" height="2" fill={color} />
            <rect x="5" y="6" width="6" height="2" fill={color} />
            <rect x="4" y="8" width="8" height="2" fill={color} />
            <rect x="3" y="10" width="10" height="2" fill={color} />
            <rect x="2" y="12" width="12" height="2" fill={color} />
            {/* Exclamation point cutout */}
            <rect x="7" y="5" width="2" height="4" fill="#ffffff" />
            <rect x="7" y="10" width="2" height="2" fill="#ffffff" />
          </>
        );

      case 'trophy':
        // High score cup
        return (
          <>
            <rect x="3" y="2" width="10" height="2" fill={color} />
            <rect x="4" y="4" width="8" height="4" fill={color} />
            <rect x="5" y="8" width="6" height="2" fill={color} />
            <rect x="7" y="10" width="2" height="3" fill={color} />
            <rect x="4" y="13" width="8" height="2" fill={color} />
            <rect x="2" y="3" width="1" height="3" fill={color} />
            <rect x="13" y="3" width="1" height="3" fill={color} />
          </>
        );

      case 'sound-on':
        return (
          <>
            <rect x="2" y="6" width="3" height="4" fill={color} />
            <rect x="5" y="4" width="3" height="8" fill={color} />
            <rect x="10" y="5" width="1" height="6" fill={color} />
            <rect x="12" y="3" width="1" height="10" fill={color} />
          </>
        );

      case 'sound-off':
        return (
          <>
            <rect x="2" y="6" width="3" height="4" fill={color} />
            <rect x="5" y="4" width="3" height="8" fill={color} />
            <rect x="10" y="6" width="1" height="1" fill={color} />
            <rect x="12" y="8" width="1" height="1" fill={color} />
            <rect x="10" y="10" width="1" height="1" fill={color} />
            <rect x="12" y="6" width="1" height="1" fill={color} />
            <rect x="10" y="8" width="1" height="1" fill={color} />
            <rect x="12" y="10" width="1" height="1" fill={color} />
          </>
        );

      case 'check':
        return (
          <>
            <rect x="12" y="4" width="2" height="2" fill={color} />
            <rect x="10" y="6" width="2" height="2" fill={color} />
            <rect x="8" y="8" width="2" height="2" fill={color} />
            <rect x="6" y="10" width="2" height="2" fill={color} />
            <rect x="4" y="8" width="2" height="2" fill={color} />
            <rect x="2" y="6" width="2" height="2" fill={color} />
          </>
        );

      case 'close':
        return (
          <>
            <rect x="3" y="3" width="2" height="2" fill={color} />
            <rect x="11" y="3" width="2" height="2" fill={color} />
            <rect x="5" y="5" width="2" height="2" fill={color} />
            <rect x="9" y="5" width="2" height="2" fill={color} />
            <rect x="7" y="7" width="2" height="2" fill={color} />
            <rect x="5" y="9" width="2" height="2" fill={color} />
            <rect x="9" y="9" width="2" height="2" fill={color} />
            <rect x="3" y="11" width="2" height="2" fill={color} />
            <rect x="11" y="11" width="2" height="2" fill={color} />
          </>
        );

      case 'arrow-left':
        return (
          <>
            <rect x="6" y="4" width="2" height="2" fill={color} />
            <rect x="4" y="6" width="2" height="2" fill={color} />
            <rect x="2" y="8" width="2" height="2" fill={color} />
            <rect x="4" y="10" width="2" height="2" fill={color} />
            <rect x="6" y="12" width="2" height="2" fill={color} />
            <rect x="4" y="8" width="10" height="2" fill={color} />
          </>
        );

      case 'arrow-right':
        return (
          <>
            <rect x="8" y="4" width="2" height="2" fill={color} />
            <rect x="10" y="6" width="2" height="2" fill={color} />
            <rect x="12" y="8" width="2" height="2" fill={color} />
            <rect x="10" y="10" width="2" height="2" fill={color} />
            <rect x="8" y="12" width="2" height="2" fill={color} />
            <rect x="2" y="8" width="10" height="2" fill={color} />
          </>
        );

      case 'plus':
        return (
          <>
            <rect x="7" y="3" width="2" height="10" fill={color} />
            <rect x="3" y="7" width="10" height="2" fill={color} />
          </>
        );

      case 'minus':
        return <rect x="3" y="7" width="10" height="2" fill={color} />;

      case 'deck':
        // Stacked finite tickets (Finite Deck model)
        return (
          <>
            <rect x="2" y="9" width="10" height="5" fill={color} />
            <rect x="4" y="6" width="10" height="5" fill={color} />
            <rect x="6" y="3" width="10" height="5" fill={color} />
            <rect x="3" y="10" width="8" height="1" fill="#ffffff" />
            <rect x="5" y="7" width="8" height="1" fill="#ffffff" />
            <rect x="7" y="4" width="8" height="1" fill="#ffffff" />
          </>
        );

      case 'dial':
        // Probability dial / gauge (Fixed Odds model)
        return (
          <>
            <rect x="3" y="3" width="10" height="10" fill="none" stroke={color} strokeWidth="2" />
            <rect x="7" y="7" width="2" height="2" fill={color} />
            <rect x="8" y="4" width="2" height="4" fill={color} />
            <rect x="10" y="3" width="2" height="2" fill={color} />
            <rect x="4" y="12" width="2" height="2" fill={color} />
            <rect x="10" y="12" width="2" height="2" fill={color} />
          </>
        );

      default:
        return <rect x="2" y="2" width="12" height="12" fill={color} />;
    }
  };

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={`pixel-icon ${className}`}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}
      aria-hidden="true"
    >
      {renderPaths()}
    </svg>
  );
};
