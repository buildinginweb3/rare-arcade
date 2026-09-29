import React from 'react';
import { DEMO_RARE_FRIENDS } from '../../data/demoFriends.ts';

interface RareFriendSpriteProps {
  spriteRows?: readonly string[];
  tokenId?: bigint;
  scale?: number; // scale multiplier, e.g. 2 = 32px, 4 = 64px, 8 = 128px
  invert?: boolean;
  className?: string;
  showBorder?: boolean;
}

/**
 * Authentic 16x16 Monochrome Rare Friend Sprite Renderer.
 * Preserves the exact 16x16 pixel grid format of official Rare Friends on-chain generations.
 */
export const RareFriendSprite: React.FC<RareFriendSpriteProps> = ({
  spriteRows: propRows,
  tokenId,
  scale = 4,
  invert = false,
  className = '',
  showBorder = false,
}) => {
  // If rows not provided directly, lookup from fixtures by tokenId
  let rows = propRows;
  if (!rows && tokenId) {
    const friend = DEMO_RARE_FRIENDS.find((f) => f.tokenId === tokenId);
    if (friend) {
      rows = friend.spriteRows;
    }
  }

  // Fallback default 16x16 pixel creature
  if (!rows || rows.length !== 16) {
    rows = [
      '....########....',
      '..############..',
      '.##############.',
      '################',
      '##..########..##',
      '##..########..##',
      '################',
      '.##############.',
      '..############..',
      '....########....',
      '..############..',
      '.##############.',
      '.#..########..#.',
      '....###..###....',
      '...####..####...',
      '....##....##....',
    ];
  }

  const pixelSize = scale;
  const totalDimension = 16 * pixelSize;
  const fillColor = invert ? '#ffffff' : '#000000';

  return (
    <div
      className={`rare-friend-sprite-container ${className}`}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        border: showBorder ? '2px solid var(--color-black)' : 'none',
        padding: showBorder ? '4px' : '0',
        background: invert ? 'var(--color-black)' : 'transparent',
      }}
    >
      <svg
        width={totalDimension}
        height={totalDimension}
        viewBox="0 0 16 16"
        shapeRendering="crispEdges"
        style={{
          display: 'block',
          imageRendering: 'pixelated',
        }}
        aria-label="Rare Friend Pixel Sprite"
      >
        {rows.map((row, y) =>
          row.split('').map((char, x) => {
            if (char === '#') {
              return (
                <rect
                  key={`${x}-${y}`}
                  x={x}
                  y={y}
                  width={1}
                  height={1}
                  fill={fillColor}
                />
              );
            }
            return null;
          })
        )}
      </svg>
    </div>
  );
};
