import type { MachineShellId, PrizeType } from '../../domain/types.ts';

export type PullFxKind = 'drum' | 'capsule' | 'claw' | 'reels';
export type PullFxResultKind = 'rf' | 'nft' | 'empty';

export interface PullFx {
  kind: PullFxKind;
  /** LCD caption shown while the pull resolves. */
  caption: string;
  /** Container-level animation class (empty when the scene animates internally). */
  containerClass: string;
  /** Short label used in the shell picker so creators know what changes. */
  pickerLabel: string;
  /** Normal-motion pre-reveal duration in ms. */
  durationMs: number;
  /** Reduced-motion pre-reveal duration in ms. */
  reducedDurationMs: number;
}

/**
 * Shell-specific pull ritual. Identity matches actual pull behavior:
 * CLASSIC = PRIZE DRUM, CAPSULE = CAPSULE OPEN, TALLBOY = CLAW GRAB,
 * MINI = SLOT REELS. Economics/result are identical regardless of shell.
 *
 * The animation is an INNER window effect only (PixelPullFx) — no nested
 * cabinet is drawn. Durations match PixelPullFx NORMAL/REDUCED_DURATION.
 */
export function pullFxForShell(shellId: MachineShellId): PullFx {
  switch (shellId) {
    case 'CAPSULE':
      return {
        kind: 'capsule',
        caption: 'DROPPING THE CAPSULE...',
        containerClass: '',
        pickerLabel: 'PULL FX: CAPSULE OPEN',
        durationMs: 2850,
        reducedDurationMs: 900,
      };
    case 'TALLBOY':
      return {
        kind: 'claw',
        caption: 'CLAW GRABBING...',
        containerClass: '',
        pickerLabel: 'PULL FX: CLAW GRAB',
        durationMs: 3050,
        reducedDurationMs: 950,
      };
    case 'MINI':
      return {
        kind: 'reels',
        caption: 'SPINNING THE REELS...',
        containerClass: '',
        pickerLabel: 'PULL FX: SLOT REELS',
        durationMs: 2800,
        reducedDurationMs: 900,
      };
    case 'CLASSIC':
    default:
      return {
        kind: 'drum',
        caption: 'SPINNING THE PRIZE DRUM...',
        containerClass: '',
        pickerLabel: 'PULL FX: PRIZE DRUM',
        durationMs: 2450,
        reducedDurationMs: 800,
      };
  }
}

/**
 * Broad visual hint derived from the ALREADY-DETERMINED authoritative pull
 * result. Used only for non-deceptive visual resolution (mini final symbols,
 * tallboy parcel state). Never influences RNG or probability.
 */
export function resultKindForPrizeType(prizeType: PrizeType | null | undefined): PullFxResultKind {
  if (prizeType === 'RF_PRIZE') return 'rf';
  if (prizeType === 'FRIEND_PRIZE') return 'nft';
  return 'empty';
}
