// pullfx-panel-qa.spec.ts
//
// Rasterizes the HTML prize-reveal panel (PrizeReveal.tsx) so the shared
// PixelShine burst can be inspected on both the $RF coin and the NFT
// frame. Scenes are pre-rendered to static markup by
// __tests__/renderPrizePanelScenes.test.ts, then rasterized here.

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const SVG_DIR = 'screenshots/pullfx/panel';
const OUT = 'screenshots/pullfx';

const PANELS = ['rf-reveal-dark', 'rf-reveal-paper', 'nft-reveal-dark', 'nft-reveal-paper', 'noprize'] as const;

/**
 * The shine overlay is the only 128x96 aria-hidden SVG. Narrower pixel
 * icons (e.g. the no-prize "sold out" icon) are also aria-hidden, so
 * scope every query to the overlay.
 */
const OVERLAY = 'svg[aria-hidden="true"][viewBox="0 0 192 128"]';

const html = (name: string) => {
  const p = resolve(SVG_DIR, `${name}.html`);
  if (!existsSync(p)) {
    throw new Error(`Missing ${p}. Run: npx vitest run src/components/machine/__tests__/renderPrizePanelScenes.test.ts`);
  }
  return readFileSync(p, 'utf8');
};

test.describe('Prize reveal panel visual QA', () => {
  test('RF and NFT reveal panels captured on dark and paper', async ({ page }) => {
    await page.setViewportSize({ width: 420, height: 420 });
    for (const name of PANELS) {
      await page.goto(pathToFileURL(resolve(SVG_DIR, `${name}.html`)).href);
      await page.screenshot({ path: `${OUT}/panel-${name}.png` });
    }
  });

  test('RF reveal: coin is presented clean, with no shine overlay', async ({ page }) => {
    await page.goto(pathToFileURL(resolve(SVG_DIR, 'rf-reveal-paper.html')).href);

    // No shine overlay at all: grey/white glint marks sat right against
    // the coin's stepped silhouette and made the token look speckled.
    const overlayCount = await page.evaluate(
      (sel) => document.querySelectorAll(sel).length,
      OVERLAY,
    );
    expect(overlayCount).toBe(0);

    // The canonical $RF coin is still shown at full reveal size.
    const coin = await page.evaluate(() => {
      const el = document.querySelector('svg.rf-token-icon');
      if (!el) return null;
      return { w: el.getAttribute('width'), h: el.getAttribute('height') };
    });
    expect(coin).toEqual({ w: '128', h: '128' });

    // No shine tones anywhere in the RF reveal.
    const tones = await page.evaluate(() => {
      const set = new Set<string>();
      for (const r of document.querySelectorAll('rect, path')) set.add(r.getAttribute('fill') ?? '');
      return [...set];
    });
    expect(tones).not.toContain('#8C8B84');
    expect(tones).not.toContain('#C7C6BE');
  });

  test('NFT reveal: glints sit at the frame, not over the artwork centre', async ({ page }) => {
    await page.goto(pathToFileURL(resolve(SVG_DIR, 'nft-reveal-paper.html')).href);

    const [obWidth, obHeight] = await page.evaluate(() => {
      const ob = document.querySelector('svg[aria-hidden="true"][viewBox="0 0 192 128"]')!.getBoundingClientRect();
      return [ob.width, ob.height];
    });
    const rects = await page.evaluate((sel) => {
      const art = document.querySelector('[data-testid="nft-art"]');
      const overlay = document.querySelector(sel);
      if (!overlay) return null;
      const ob = overlay.getBoundingClientRect();
      const shineRects = [...overlay.querySelectorAll('rect')].map((r) => {
        const b = r.getBoundingClientRect();
        return { cx: (b.x + b.width / 2 - ob.x) / ob.width, cy: (b.y + b.height / 2 - ob.y) / ob.height };
      });
      const ab = art?.getBoundingClientRect();
      return {
        shineRects,
        hasArt: !!art,
        artCentre: ab ? { cx: (ab.x + ab.width / 2 - ob.x) / ob.width, cy: (ab.y + ab.height / 2 - ob.y) / ob.height } : null,
        artBox: ab ? { x: ab.x, y: ab.y, w: ab.width, h: ab.height } : null,
      };
    }, OVERLAY);

    expect(rects).not.toBeNull();
    expect(rects!.hasArt, 'NFT art stub present').toBe(true);
    expect(rects!.artBox).not.toBeNull();

    // No shine pixel may land anywhere on the artwork, not just its core.
    const art = rects!.artBox!;
    for (const { cx, cy } of rects!.shineRects) {
      const pageX = cx * obWidth;
      const pageY = cy * obHeight;
      const inside = pageX > art.x && pageX < art.x + art.w && pageY > art.y && pageY < art.y + art.h;
      expect(inside, `glint over artwork at ${pageX.toFixed(0)},${pageY.toFixed(0)}`).toBe(false);
    }
  });

  test('No-prize panel shows no shine glints at all', async ({ page }) => {
    await page.goto(pathToFileURL(resolve(SVG_DIR, 'noprize.html')).href);
    // The no-prize panel has no shine overlay at all.
    const overlayCount = await page.evaluate(
      (sel) => document.querySelectorAll(sel).length,
      'svg[aria-hidden="true"][viewBox="0 0 192 128"]',
    );
    expect(overlayCount).toBe(0);
  });
});
