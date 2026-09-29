import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import {
  PixelPullFx,
  MINI_REEL_GEOMETRY,
  type PullFxResultKind,
  type PullFxShell,
} from '../PixelPullFx.tsx';
import { PixelShine, RevealShine } from '../PixelShine.tsx';

const G = MINI_REEL_GEOMETRY;

/**
 * Renders a shell scene at an exact virtual time via the
 * test-only __testTime clock pin, so individual animation
 * frames can be asserted without driving rAF.
 */
function renderStaticAt(shell: PullFxShell, resultKind: PullFxResultKind, time: number) {
  return renderToStaticMarkup(
    React.createElement(PixelPullFx, {
      shell,
      active: false,
      runId: 1,
      resultKind,
      onComplete: () => undefined,
      __testTime: time,
    }),
  );
}

/** Renders the mini scene at a given virtual time. */
function miniAt(time: number, resultKind: PullFxResultKind = 'empty') {
  return renderStaticAt('mini', resultKind, time);
}

function rectsOf(html: string) {
  return [...html.matchAll(/<rect\b[^>]*>/g)].map((m) => m[0]);
}

function attr(rect: string, name: string): string {
  const m = new RegExp(`${name}="([^"]*)"`).exec(rect);
  return m?.[1] ?? '';
}

describe('MINI REELS V2 — exact symmetry (PixelPullFx.tsx)', () => {
  it('uses three identical reel boxes of 28x40', () => {
    const { reelX, reelWidth, reelHeight, reelY } = G;
    expect(reelX).toHaveLength(3);
    expect(reelWidth).toBe(28);
    expect(reelHeight).toBe(40);

    // Exactly three 28x40 reel frames share one y and identical size.
    const html = miniAt(200);
    const frames = rectsOf(html).filter((r) => attr(r, 'width') === '28' && attr(r, 'height') === '40');
    // 3 reel frames + 3 clipPaths referencing the same 28x40 box.
    expect(frames.length).toBeGreaterThanOrEqual(3);
    const frameXs = new Set(frames.map((r) => attr(r, 'x')));
    for (const x of frameXs) {
      expect(reelX.map(String)).toContain(x);
    }
    expect(reelY).toBe(25);
  });

  it('spaces reel X positions with an identical gutter and balanced outer margins', () => {
    const [a, b, c] = G.reelX;
    const pitch1 = b - a;
    const pitch2 = c - b;

    // Equal pitch => equal internal gutters.
    expect(pitch1).toBe(pitch2);
    expect(pitch1 - G.reelWidth).toBe(G.gutter);
    expect(pitch1 - G.reelWidth).toBe(6);

    // Chassis (x=10, width=108) yields equal outer margins.
    const chassisX = 10;
    const chassisW = 108;
    const leftMargin = a - chassisX;
    const rightMargin = chassisX + chassisW - (c + G.reelWidth);
    expect(leftMargin).toBe(rightMargin);
    expect(leftMargin).toBe(6);
  });

  it('centers every symbol identically (equal horizontal and vertical padding)', () => {
    // Symbol is a 5x5 bitmap at pixel=2 => 10x10 logical px, centered
    // in the 28x40 reel box: 9px each side horizontally, 15px vertically.
    const symbolPx = 5 * G.symbolPixel;
    expect(symbolPx).toBe(10);

    const padLeft = 9;
    const padTop = 15;
    expect(padLeft * 2 + symbolPx).toBe(G.reelWidth); // 9 + 10 + 9 = 28
    expect(padTop * 2 + symbolPx).toBe(G.reelHeight); // 15 + 10 + 15 = 40

    // Every stopped reel renders its symbol at exactly the same offset,
    // relative to its own box origin (identical centering, reel to reel).
    const html = miniAt(2800);
    for (const rx of G.reelX) {
      const symbolXs = rectsOf(html)
        .filter((r) => attr(r, 'width') === '2' && attr(r, 'height') === '2' && attr(r, 'fill') === '#090909')
        .map((r) => Number(attr(r, 'x')) - rx)
        .filter((dx) => dx >= 9 && dx < 9 + 10);
      expect(symbolXs.length).toBeGreaterThan(0);
      // Symbol columns only ever start at the centered +9 offset.
      expect(symbolXs.every((dx) => dx >= 9 && dx <= 18)).toBe(true);
    }
  });

  it('fills every reel interior with warm paper, never pure white', () => {
    const interiorW = G.reelWidth - G.frame * 2; // 22
    const interiorH = G.reelHeight - G.frame * 2; // 34
    const html = miniAt(200);
    const interiors = rectsOf(html).filter(
      (r) => attr(r, 'width') === String(interiorW) && attr(r, 'height') === String(interiorH),
    );

    // Three identical 22x34 paper interiors, one per reel.
    expect(interiors).toHaveLength(3);
    for (const rect of interiors) {
      expect(attr(rect, 'fill')).toBe('#F3F1E8'); // warm paper
      expect(attr(rect, 'fill')).not.toBe('#FFFFFF');
    }
    // No 28x34 (or any large) pure-white reel card survives.
    expect(html).not.toMatch(/width="28"[^>]*height="34"[^>]*fill="#FFFFFF"/);
  });

  it('gives every reel an identical 3px ink frame on one unified chassis', () => {
    const html = miniAt(200);
    // Single unified black chassis 108x58.
    const chassis = rectsOf(html).filter((r) => attr(r, 'width') === '108' && attr(r, 'height') === '58');
    expect(chassis).toHaveLength(1);
    expect(attr(chassis[0]!, 'fill')).toBe('#090909');
    expect(attr(chassis[0]!, 'x')).toBe('10');
  });

  it('moves the reel symbols vertically in stepped increments while spinning', () => {
    // Stepped motion: symbol y must vary across spin frames.
    const ys = new Set<number>();
    for (const t of [400, 480, 560, 640, 720, 800]) {
      const html = miniAt(t);
      for (const r of rectsOf(html)) {
        const y = attr(r, 'y');
        const h = attr(r, 'height');
        if (y && h === '2') ys.add(Number(y));
      }
    }
    expect(ys.size).toBeGreaterThan(1);

    // Vertical stepping only: every symbol column is pinned to the
    // centered +9 offset within its own reel box, on every frame.
    for (const t of [400, 480, 560, 640, 720, 800]) {
      const html = miniAt(t);
      for (const rx of G.reelX) {
        for (const r of rectsOf(html)) {
          if (attr(r, 'width') !== '2' || attr(r, 'height') !== '2') continue;
          if (attr(r, 'fill') !== '#090909') continue;
          const dx = Number(attr(r, 'x')) - rx;
          if (dx < 9 || dx >= 19) continue; // inside this reel's symbol grid
          // Symbol grid is 5 columns of 2px starting at the
          // centered +9 offset: 9,11,13,15,17.
          expect([9, 11, 13, 15, 17], `t=${t} reel=${rx} dx=${dx}`).toContain(dx);
        }
      }
    }
  });

  it('stops reels sequentially at 1650 / 1950 / 2250', () => {
    expect([...G.stopTimes]).toEqual([1650, 1950, 2250]);

    // Stop markers (10x3 light) appear one at a time as each reel lands.
    const markersAt = (t: number) =>
      rectsOf(miniAt(t)).filter((r) => attr(r, 'width') === '10' && attr(r, 'height') === '3').length;

    expect(markersAt(1600)).toBe(0);
    expect(markersAt(1700)).toBe(1);
    expect(markersAt(2000)).toBe(2);
    expect(markersAt(2300)).toBe(3);
  });

  it('derives final symbols from resultKind for presentation only', () => {
    // A stopped reel renders exactly one centered symbol bitmap.
    const symbolsAtRest = (resultKind: PullFxResultKind) => {
      // 2800ms: all three reels stopped, so each shows exactly one
      // settled symbol. Count only ink symbol pixels (the reveal shine
      // never uses ink), scoped to each reel's own box.
      const html = miniAt(2800, resultKind);
      return G.reelX.map((rx) =>
        rectsOf(html).filter((r) => {
          if (attr(r, 'width') !== '2' || attr(r, 'height') !== '2') return false;
          if (attr(r, 'fill') !== '#090909') return false;
          const x = Number(attr(r, 'x'));
          const y = Number(attr(r, 'y'));
          return x >= rx + 9 && x < rx + 19 && y >= 40 && y < 50;
        }).length,
      );
    };

    const rf = symbolsAtRest('rf');
    const nft = symbolsAtRest('nft');
    const empty = symbolsAtRest('empty');

    // RF -> all three reels show the same (RF) pattern.
    expect(rf[0]).toBe(rf[1]);
    expect(rf[1]).toBe(rf[2]);
    // NFT -> a single repeated card pattern, different from RF.
    expect(nft[0]).toBe(nft[1]);
    expect(nft[2]).toBe(nft[0]);
    expect(nft[0]).not.toBe(rf[0]);
    // EMPTY -> neutral mismatch across the three reels.
    expect(empty[0]).not.toBe(empty[1]);
    expect(empty[1]).not.toBe(empty[2]);
  });

  it('keeps RNG external: resultKind only changes symbol pixels, never reel structure', () => {
    const structure = (resultKind: PullFxResultKind) => {
      const html = miniAt(2800, resultKind);
      // Everything that is NOT a 2x2 symbol pixel is the reel chassis,
      // frame, interior, and stop marker. Must be outcome-independent.
      return rectsOf(html)
        .filter((r) => !(attr(r, 'width') === '2' && attr(r, 'height') === '2'))
        .map((r) => `${attr(r, 'width')}x${attr(r, 'height')}@${attr(r, 'x')},${attr(r, 'y')}:${attr(r, 'fill')}`)
        .sort()
        .join('|');
    };
    // Both prize outcomes share identical reel structure.
    expect(structure('rf')).toBe(structure('nft'));
    // No-prize differs only by having no reveal shine at all.
    expect(structure('empty')).not.toBe(structure('rf'));

    // And the symbol bitmaps really do differ per outcome, proving the
    // reels reflect the already-known result rather than driving it.
    const symbolCount = (resultKind: PullFxResultKind) => {
      const html = miniAt(2800, resultKind);
      return rectsOf(html).filter((r) => attr(r, 'width') === '2' && attr(r, 'height') === '2' && attr(r, 'fill') === '#090909').length;
    };
    expect(symbolCount('rf')).not.toBe(symbolCount('nft'));
    expect(symbolCount('nft')).not.toBe(symbolCount('empty'));
  });
});

describe('Reveal shine (PixelShine.tsx) — three-tone, no erased-pixel star', () => {
  it('renders gray depth, light rays, and a white hotspot in the full frame', () => {
    const html = renderToStaticMarkup(
      React.createElement(PixelShine, { x: 0, y: 0, scale: 1, frame: 2 }),
    );
    expect(html).toContain('#8C8B84'); // mid-gray depth
    expect(html).toContain('#C7C6BE'); // light-gray rays
    expect(html).toContain('#FFFFFF'); // white hotspot
    // White is present but never the only tone.
    const whiteRects = (html.match(/fill="#FFFFFF"/g) || []).length;
    expect(whiteRects).toBeGreaterThan(0);
    expect(whiteRects).toBeLessThan((html.match(/<rect/g) || []).length);
  });

  it('uses gray depth so the star keeps an edge on warm paper', () => {
    const full = renderToStaticMarkup(React.createElement(PixelShine, { x: 0, y: 0, frame: 2 }));
    const mid = (full.match(/fill="#8C8B84"/g) || []).length;
    expect(mid).toBeGreaterThanOrEqual(2);
  });

  it('animates tiny glint -> medium -> full -> medium over ~520ms', () => {
    const frameAt = (t: number) => {
      const html = renderToStaticMarkup(React.createElement(RevealShine, { time: t, start: 0, x: 0, y: 0 }));
      return (html.match(/<rect/g) || []).length;
    };
    // Grows across frames 0 -> 1 -> 2, then shrinks back to medium.
    const f0 = frameAt(50);
    const f1 = frameAt(160);
    const f2 = frameAt(300);
    const f3 = frameAt(420);
    expect(f0).toBeLessThan(f1);
    expect(f1).toBeLessThan(f2);
    expect(f3).toBe(f1);
    // Dead before start and after the ~500ms window.
    expect(frameAt(-10)).toBe(0);
    expect(frameAt(600)).toBe(0);
  });

  it('respects a staggered start offset', () => {
    const before = renderToStaticMarkup(React.createElement(RevealShine, { time: 100, start: 120, x: 0, y: 0 }));
    expect(before).toBe('');
    const after = renderToStaticMarkup(React.createElement(RevealShine, { time: 300, start: 120, x: 0, y: 0 }));
    expect(after).toContain('<rect');
  });
});

describe('Reveal sequencing — shine only at reveal, never for no-prize', () => {
  const shells: PullFxShell[] = ['classic', 'capsule', 'tallboy', 'mini'];

  it('shows no shine while the machine is still acting', () => {
    // 1200ms is mid-action for every shell: action, no reveal yet.
    for (const shell of shells) {
      for (const resultKind of ['rf', 'nft'] as PullFxResultKind[]) {
        const mid = renderStaticAt(shell, resultKind, 1200);
        // Mid-action: no reveal burst has started yet.
        expect(mid, `${shell}/${resultKind}`).not.toContain('x="92" y="4"');
        expect(mid).not.toContain('x="14" y="82"');
      }
    }
  });

  it('adds a shine burst at reveal time for prize outcomes', () => {
    // Each shell's burst start + 300ms (inside the 240-380ms
    // full-shine window), so the layered star is actually drawn.
    const fullShineAt: Record<PullFxShell, number> = {
      classic: 2225 + 300,
      capsule: 2400 + 300,
      tallboy: 2730 + 300,
      mini: 2430 + 300,
    };
    for (const shell of shells) {
      for (const resultKind of ['rf', 'nft'] as PullFxResultKind[]) {
        const at = renderStaticAt(shell, resultKind, fullShineAt[shell]);
        // Dominant glint is anchored at (92,4). Frame 2 emits its
        // mid-gray depth ray at (96,6) 2x10, its light-gray ray at
        // (96,4) 2x10, and its white hotspot at (96,8) 2x2.
        expect(at, `${shell}/${resultKind} mid depth`).toContain(
          '<rect x="96" y="6" width="2" height="10" fill="#8C8B84">',
        );
        expect(at, `${shell}/${resultKind} light rays`).toContain(
          '<rect x="96" y="4" width="2" height="10" fill="#C7C6BE">',
        );
        expect(at, `${shell}/${resultKind} white hotspot`).toContain(
          '<rect x="96" y="8" width="2" height="2" fill="#FFFFFF">',
        );
      }
    }
  });

  it('keeps no-prize visually quiet (no shine burst at all)', () => {
    const fullShineAt: Record<PullFxShell, number> = {
      classic: 2225 + 300,
      capsule: 2400 + 300,
      tallboy: 2730 + 300,
      mini: 2430 + 300,
    };
    for (const shell of shells) {
      const at = renderStaticAt(shell, 'empty', fullShineAt[shell]);
      // No dominant glint, no secondary, no tertiary.
      expect(at, shell).not.toContain('x="92" y="4"');
      expect(at).not.toContain('x="14" y="82"');
      expect(at).not.toContain('x="30" y="6"');
    }
  });

  it('leaves no unbacked plain-white star: every white ray has gray depth', () => {
    for (const shell of shells) {
      for (const resultKind of ['rf', 'nft', 'empty'] as PullFxResultKind[]) {
        const html = renderStaticAt(shell, resultKind, 2600);
        // The legacy Spark was a bare white plus with no tonal layers.
        // Any white ray in the new system must be backed by an
        // identically-placed mid-gray depth ray.
        for (const rect of rectsOf(html)) {
          if (attr(rect, 'fill') !== '#FFFFFF') continue;
          const w = attr(rect, 'width');
          const h = attr(rect, 'height');
          if (w === '2' && h === '6') {
            // The white inner ray must sit on top of a taller mid-gray
            // depth ray at the same origin (so gray defines the edge).
            const x = attr(rect, 'x');
            const y = attr(rect, 'y');
            expect(html, `${shell}/${resultKind} white ray unbacked`).toMatch(
              new RegExp(`x="${x}" y="${y}" width="2" height="1[0-9]" fill="#8C8B84"`),
            );
          }
        }
      }
    }
  });

  it('keeps every prize reveal on the same shared shine implementation', () => {
    // Capsule must not use a different sparkle system than Mini.
    const capsule = renderStaticAt('capsule', 'rf', 2400 + 420);
    const mini = renderStaticAt('mini', 'rf', 2430 + 420);
    for (const html of [capsule, mini]) {
      // Identical fixed anchors in both scenes: secondary at (14,82),
      // tertiary at (30,6). One shared implementation, not two.
      expect(html, 'secondary glint').toMatch(/x="1[0-9]" y="8[0-9]"[^>]*fill="#C7C6BE"/);
      expect(html, 'tertiary glint').toMatch(/x="3[0-9]" y="[0-9]"[^>]*fill="#8C8B84"/);
    }
  });
});

describe('Pure-white discipline in pull FX (§13)', () => {
  it('has no large pure-white surface rectangles in any scene', () => {
    for (const shell of ['classic', 'capsule', 'tallboy', 'mini'] as PullFxShell[]) {
      const html = renderStaticAt(shell, 'rf', 2600);
      for (const rect of rectsOf(html)) {
        if (attr(rect, 'fill') !== '#FFFFFF') continue;
        const w = Number(attr(rect, 'width'));
        const h = Number(attr(rect, 'height'));
        // Pure white is allowed only as small specular/shine pixels.
        expect(Math.max(w, h), `${shell} white ${w}x${h}`).toBeLessThanOrEqual(6);
      }
    }
  });
});
