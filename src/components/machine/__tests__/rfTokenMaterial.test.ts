import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RfTokenIcon } from '../../ui/RfTokenIcon.tsx';
import { PrizeReveal } from '../PrizeReveal.tsx';
import { PIXEL } from '../../ui/pixelPalette.ts';
import { parseRF, formatRFGrouped } from '../../../domain/rf.ts';

const render = (size: number) =>
  renderToStaticMarkup(React.createElement(RfTokenIcon, { size }));

function rectsOf(html: string) {
  return [...html.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(#[0-9A-F]{6})"/g)].map(
    (m) => ({ x: +m[1]!, y: +m[2]!, w: +m[3]!, h: +m[4]!, fill: m[5]! }),
  );
}

const glyphPixels = (html: string) =>
  rectsOf(html).filter((r) => r.w === 2 && r.h === 2 && r.fill === PIXEL.ink);

const SIZES = [20, 24, 32, 36, 48, 64, 96, 112, 128, 144];

describe('$RF token is a clean flat pixel coin (RfTokenIcon.tsx)', () => {
  it('draws NO shine: no white, light-grey, or mid-grey surface rects', () => {
    for (const size of SIZES) {
      const html = render(size);
      const surface = rectsOf(html);
      // The only rects are the $RF bitmap pixels.
      for (const r of surface) {
        expect(
          [PIXEL.white, PIXEL.light, PIXEL.mid].includes(r.fill as never),
          `size ${size}px: stray ${r.fill} shine rect ${r.w}x${r.h} @${r.x},${r.y}`,
        ).toBe(false);
      }
      // No grey/white at all anywhere in the markup, shine or not.
      expect(html, `size ${size}px contains white`).not.toContain(PIXEL.white);
      expect(html, `size ${size}px contains light grey`).not.toContain(PIXEL.light);
      expect(html, `size ${size}px contains mid grey`).not.toContain(PIXEL.mid);
    }
  });

  it('keeps the $RF lettering as the only rect content, at every size', () => {
    for (const size of SIZES) {
      const html = render(size);
      // $ = 17, R = 18, F = 14 lit pixels.
      expect(glyphPixels(html), `${size}px glyph pixels`).toHaveLength(49);
      expect(rectsOf(html), `${size}px total rects`).toHaveLength(49);
    }
  });

  it('preserves the structural depth layers exactly', () => {
    const html = render(144);
    const paths = [...html.matchAll(/<path fill="(#[0-9A-F]{6})" d="\s*([^"]+?)\s*"/g)].map(
      (m) => ({ fill: m[1]!, d: m[2]!.replace(/\s+/g, ' ') }),
    );

    // 5 structural paths: extrusion, silhouette, outer face, inner rim,
    // central face.
    expect(paths).toHaveLength(5);
    expect(paths.map((p) => p.fill)).toEqual([
      PIXEL.deep, // rear extrusion
      PIXEL.ink, // outer stepped silhouette
      PIXEL.paper, // outer face
      PIXEL.ink, // inner black rim
      PIXEL.paper, // central face
    ]);

    // Silhouette and inner rim geometry must not drift.
    expect(paths[1]!.d).toBe(
      'M20 2H44V6H52V10H56V14H60V22H62V42H60V50H56V54H52V58H44V62H20V58H12V54H8V50H4V42H2V22H4V14H8V10H12V6H20Z',
    );
    expect(paths[3]!.d).toBe(
      'M22 14H42V16H48V20H52V26H54V40H50V46H46V50H40V52H24V50H18V46H14V40H12V26H14V20H18V16H22Z',
    );
  });

  it('has no highlights painted onto the black rim (no chipped/erased look)', () => {
    // With no shine layer at all, nothing can overlap the inner rim.
    for (const size of SIZES) {
      const html = render(size);
      const inkRects = rectsOf(html).filter((r) => r.fill === PIXEL.ink);
      for (const r of inkRects) {
        // $RF glyphs live in x15-47, y25-38 on the central face only.
        const onCentralFace = r.x >= 14 && r.x < 48 && r.y >= 18 && r.y < 40;
        expect(onCentralFace, `size ${size}: ink pixel outside central face at ${r.x},${r.y}`).toBe(true);
      }
    }
  });

  it('emits only whole logical pixels and no gradients or filters', () => {
    for (const size of SIZES) {
      const html = render(size);
      expect(/[xy|width|height]="[\d.]*\.[\d]/.test(html), `subpixel at ${size}px`).toBe(false);
    }
    const html = render(144);
    expect(html).not.toMatch(/<linearGradient|<radialGradient|<filter|feGaussianBlur/);
    expect(html).not.toMatch(/filter\s*[:=]|drop-shadow/);
    expect(html).toContain('shape-rendering="crispEdges"');
    expect(html).toContain('image-rendering:pixelated');
  });

  it('uses the shared pixel palette rather than duplicated hex literals', () => {
    const html = render(144);
    // Every fill comes from PIXEL, so the token cannot drift from the
    // pull-FX pixel art.
    for (const tone of [PIXEL.ink, PIXEL.paper, PIXEL.deep]) {
      expect(html).toContain(tone);
    }
    const src = readFileSync(
      resolve(process.cwd(), 'src/components/ui/RfTokenIcon.tsx'),
      'utf8',
    );
    // No raw hex colour literals in the component.
    expect(src).not.toMatch(/fill="#[0-9A-Fa-f]{6}"/);
  });

  it('renders the same artwork at every size, with no size variant', () => {
    const shapes = SIZES.map((size) => {
      const html = render(size);
      // Strip the size-dependent width/height, everything else identical.
      return html.replace(/width="\d+" height="\d+"/, 'width="S" height="S"');
    });
    for (const s of shapes) {
      expect(s).toBe(shapes[0]!);
    }
  });

  it('exposes the size and accessible labelling contract', () => {
    for (const size of SIZES) {
      const html = render(size);
      expect(html).toContain(`width="${size}"`);
      expect(html).toContain(`height="${size}"`);
      expect(html).toContain('viewBox="0 0 64 64"');
    }
    expect(render(64)).toContain('$RAREFRIENDS');
    const decorative = renderToStaticMarkup(
      React.createElement(RfTokenIcon, { size: 20, decorative: true }),
    );
    expect(decorative).toContain('aria-hidden="true"');
    expect(decorative).not.toContain('<title>');
  });
});

describe('one canonical token art (RfTokenIcon.tsx)', () => {
  it('is the single source for Top Chase, balance, prizes, and reveal', () => {
    const consumers = [
      'src/components/machine/CabinetView.tsx',
      'src/components/ui/AppHeader.tsx',
      'src/components/machine/PrizeReveal.tsx',
      'src/pages/CreatorDashboard.tsx',
      'src/pages/PlayerInventoryPage.tsx',
      'src/components/machine/RfBurnVisual.tsx',
    ];
    for (const file of consumers) {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8');
      expect(src, file).toMatch(/import \{ RfTokenIcon \} from '(?:.*\/?)RfTokenIcon\.tsx'/);
      // No hand-rolled duplicate coin artwork anywhere.
      expect(src, `${file} duplicates coin art`).not.toMatch(/M20 2H44V6H52/);
    }
  });
});

describe('$RF coin reveal is presented clean (PrizeReveal.tsx)', () => {
  const rfResult = { prizeType: 'RF_PRIZE', rfWonUnits: parseRF('2500') } as never;

  it('renders the RF prize with no shine overlay around the coin', () => {
    const html = renderToStaticMarkup(
      React.createElement(PrizeReveal, { result: rfResult, shellId: 'MINI' })
    );
    // No grey/white shine marks: they read as dirt on the token.
    expect(html).not.toContain(PIXEL.mid);
    expect(html).not.toContain(PIXEL.light);
    // The 128px canonical coin is still shown.
    expect(html).toContain('rf-token-icon');
    expect(html).toContain('width="128"');
    expect(html).toContain(formatRFGrouped(parseRF('2500')));
  });

  it('still shows the $RF coin bitmap in the reveal (no placeholder)', () => {
    const html = renderToStaticMarkup(
      React.createElement(PrizeReveal, { result: rfResult, shellId: 'MINI' })
    );
    // $RF lettering intact: 49 lit ink pixels plus the structural paths.
    expect(glyphPixels(html).length).toBeGreaterThanOrEqual(49);
  });
});
