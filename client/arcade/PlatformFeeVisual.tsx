import React from 'react';
import { RfTokenIcon } from '../ui/RfTokenIcon.tsx';
import { PixelIcon } from '../ui/PixelIcon.tsx';
import { PLATFORM_FEE_BPS } from '../lib/economy.ts';

const FEE_PCT = `${PLATFORM_FEE_BPS / 100}%`;

/**
 * 5% platform fee visual.
 *
 * The fee is taken in three places, all at the same rate: on the player's
 * spend, on a cashback win, and on backing a player chooses to claim instead of
 * keeping the Friend. One number, three points of collection.
 */
export const PlatformFeeVisual: React.FC<{ size?: number; compact?: boolean }> = ({
  size = 20,
  compact = false,
}) => {
  if (compact) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <RfTokenIcon size={size} decorative />
        <span className="fee-routes" aria-hidden="true">
          <span className="fee-route fee-route-treasury" />
          <span className="fee-route fee-route-buyback" />
        </span>
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <RfTokenIcon size={size} decorative />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
        <PixelIcon name="burn" size={14} />
        <span>{FEE_PCT} PLATFORM FEE</span>
      </span>
      <span style={{ fontSize: '9px', color: '#666' }}>
        ON SPEND • ON WINNINGS • ON CLAIMED BACKING
      </span>
    </div>
  );
};
export const RfBurnVisual = PlatformFeeVisual;