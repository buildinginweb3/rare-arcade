import React from 'react';
import type { MachineType } from '../../domain/types.ts';
import { PixelIcon } from '../ui/PixelIcon.tsx';

interface MachineTypeBadgeProps {
  machineType: MachineType;
}

/**
 * Small model badge. Same monochrome pixel language for both types —
 * neither model is presented as superior.
 */
export const MachineTypeBadge: React.FC<MachineTypeBadgeProps> = ({ machineType }) => {
  const isFixed = machineType === 'fixed_odds';
  return (
    <span
      title={isFixed ? 'Fixed Odds — same chance every pull, no play cap' : 'Finite Deck — every pull removes a ticket'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        border: '1px solid currentColor',
        fontFamily: 'var(--font-lcd)',
        fontSize: '8px',
        padding: '1px 5px',
        whiteSpace: 'nowrap',
      }}
    >
      <PixelIcon name={isFixed ? 'dial' : 'deck'} size={10} />
      {isFixed ? 'FIXED ODDS' : 'FINITE DECK'}
    </span>
  );
};
