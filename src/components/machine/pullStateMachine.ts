import { useEffect, useState } from 'react';
import type { MachineShellId } from '../../domain/types.ts';
import { pullFxForShell } from './pullFx.ts';

/**
 * ONE AUTHORITATIVE PULL STATE MACHINE.
 * Do NOT scatter setTimeout() calls across components — every pull flows
 * through these explicit phases:
 *
 * IDLE -> VALIDATING -> RESULT_PENDING -> ANTICIPATION -> MACHINE_ACTION
 *   -> DELIVERY -> MACHINE_COMPLETE -> REVEAL_HOLD -> PRIZE_REVEAL
 *   -> RESULT_COMPLETE -> RETURN_TO_IDLE -> IDLE
 *
 * The authoritative prize exists during RESULT_PENDING but remains hidden
 * until PRIZE_REVEAL. Animation timing never influences RNG; reels never
 * determine probability.
 */
export type PullPhase =
  | 'IDLE'
  | 'VALIDATING'
  | 'RESULT_PENDING'
  | 'ANTICIPATION'
  | 'MACHINE_ACTION'
  | 'DELIVERY'
  | 'MACHINE_COMPLETE'
  | 'REVEAL_HOLD'
  | 'PRIZE_REVEAL'
  | 'RESULT_COMPLETE'
  | 'RETURN_TO_IDLE';

export const REVEAL_HOLD_MS = 240;
export const REVEAL_MS = 700;

export function isPullActive(phase: PullPhase): boolean {
  return (
    phase !== 'IDLE' &&
    phase !== 'RESULT_COMPLETE' &&
    phase !== 'RETURN_TO_IDLE'
  );
}

/** True while the machine is moving and the result must stay hidden. */
export function isResultHidden(phase: PullPhase): boolean {
  switch (phase) {
    case 'IDLE':
    case 'VALIDATING':
    case 'RESULT_PENDING':
    case 'ANTICIPATION':
    case 'MACHINE_ACTION':
    case 'DELIVERY':
    case 'MACHINE_COMPLETE':
    case 'REVEAL_HOLD':
      return true;
    case 'PRIZE_REVEAL':
    case 'RESULT_COMPLETE':
    case 'RETURN_TO_IDLE':
      return false;
  }
}

export function shellDurationMs(shellId: MachineShellId, reducedMotion: boolean): number {
  const fx = pullFxForShell(shellId);
  return reducedMotion ? fx.reducedDurationMs : fx.durationMs;
}

/**
 * OS-level reduced motion. There is NO user-facing motion toggle — normal
 * users always get FULL PIXEL MACHINE ANIMATION; users whose OS requests
 * reduced motion get a SHORTENED animation that still preserves
 * PULL -> MACHINE ACTION -> RESULT causality.
 */
export function getOsReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => getOsReducedMotion());
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    try {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    } catch {
      // Safari fallback
      const legacy = mq as unknown as {
        addListener: (fn: (e: MediaQueryListEvent) => void) => void;
        removeListener: (fn: (e: MediaQueryListEvent) => void) => void;
      };
      if (typeof legacy.addListener === 'function') {
        legacy.addListener(onChange);
        return () => legacy.removeListener(onChange);
      }
      return;
    }
  }, []);
  return reduced;
}

/** Preload NFT media while the machine animation runs (never gates reveal). */
export function preloadResultMedia(imageUrl: string | undefined): void {
  if (!imageUrl || typeof window === 'undefined') return;
  try {
    const img = new window.Image();
    img.decoding = 'async';
    (img as unknown as { fetchPriority?: string }).fetchPriority = 'low';
    img.src = imageUrl;
  } catch {
    // Preload is best-effort only.
  }
}
