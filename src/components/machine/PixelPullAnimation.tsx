/**
 * Back-compat adapter: the pull animation is now PixelPullFx (inner window
 * effects only — no nested cabinet). This module preserves the historic
 * import names used by CabinetView, CreatorWorkshop, and unit tests.
 *
 * The old nested-machine SVG implementation (CabinetBody, ~1600 lines) was
 * removed: the Friend Machine shell around the LCD IS the machine.
 */

import React from 'react';
import { PixelPullFx, type PullFxShell, type PullFxResultKind } from './PixelPullFx.tsx';
import { pullFxForShell } from './pullFx.ts';

export type AnimatedShell = PullFxShell;
export type AnimatedResultKind = PullFxResultKind;

/** Shell timelines, derived from the authoritative pullFx map (keep in sync). */
export const SHELL_DURATIONS = {
  base: {
    classic: pullFxForShell('CLASSIC').durationMs,
    capsule: pullFxForShell('CAPSULE').durationMs,
    tallboy: pullFxForShell('TALLBOY').durationMs,
    mini: pullFxForShell('MINI').durationMs,
  },
  reduced: {
    classic: pullFxForShell('CLASSIC').reducedDurationMs,
    capsule: pullFxForShell('CAPSULE').reducedDurationMs,
    tallboy: pullFxForShell('TALLBOY').reducedDurationMs,
    mini: pullFxForShell('MINI').reducedDurationMs,
  },
} as const;

type PixelPullAnimationProps = {
  shell: AnimatedShell;
  active: boolean;
  runId: number;
  resultKind?: PullFxResultKind;
  reducedMotion?: boolean;
  className?: string;
  onComplete: () => void;
};

/** Inner-window pull ritual rendered inside the existing cabinet LCD. */
export const PixelPullAnimation: React.FC<PixelPullAnimationProps> = (props) => {
  return <PixelPullFx {...props} />;
};
