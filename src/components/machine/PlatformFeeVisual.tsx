import React from 'react';
import { RfTokenIcon } from '../ui/RfTokenIcon.tsx';
import { PixelIcon } from '../ui/PixelIcon.tsx';
import { PLATFORM_FEE_BPS } from '../../domain/fees.ts';
import { formatBps } from '../../domain/rf.ts';

const FEE_PCT = formatBps(Number(PLATFORM_FEE_BPS), 0);

/**
 * 5% platform fee visual.
 *
 * The fee splits two ways: 75% heads to the treasury as USDG, and 25% feeds
 * the RF buyback pot that is swapped to $RAREFRIENDS and burned. So one stream
 * settles and the other keeps travelling — it becomes RF on the way to a burn
 * address. Same streamed-pixel language, honest destination.
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
        75% TREASURY • 25% BUYS &amp; BURNS RF
      </span>
    </div>
  );
};

/** @deprecated Renamed to PlatformFeeVisual when the fee became a routed split. */
export const RfBurnVisual = PlatformFeeVisual;