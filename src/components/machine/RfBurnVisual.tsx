import React from 'react';
import { RfTokenIcon } from '../ui/RfTokenIcon.tsx';
import { PixelIcon } from '../ui/PixelIcon.tsx';

/**
 * 5% RF burn visual using the new $RF coin.
 * Coin enters machine -> 5% branch splits -> small $RF breaks into
 * 4-8 square pixel fragments -> fragments disappear -> "5% BURNED".
 * No flame emoji; monochrome stepped pixels only.
 */
export const RfBurnVisual: React.FC<{ size?: number; compact?: boolean }> = ({
  size = 20,
  compact = false,
}) => {
  if (compact) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
        <RfTokenIcon size={size} decorative />
        <span className="burn-fragments" aria-hidden="true">
          <span className="burn-frag burn-frag-1" />
          <span className="burn-frag burn-frag-2" />
          <span className="burn-frag burn-frag-3" />
          <span className="burn-frag burn-frag-4" />
        </span>
      </span>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <RfTokenIcon size={size} decorative />
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontWeight: 'bold' }}>
        <PixelIcon name="burn" size={14} />
        <span>5% BURNED</span>
      </span>
    </div>
  );
};
