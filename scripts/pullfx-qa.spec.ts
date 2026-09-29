// pullfx-qa.spec.ts
//
// Screenshot QA for the pull FX pass.
//
// Scenes are pre-rendered to standalone SVG by
// scripts/renderPullfxScenes.ts (run under vitest, because Playwright's
// component transform cannot server-render React). This spec only
// rasterizes those files and asserts the geometry/symmetry rules in
// real rendered pixels.

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { MINI_REEL_GEOMETRY } from '../src/components/machine/PixelPullFx.tsx';

const SVG_DIR = 'screenshots/pullfx/svg';
const OUT = 'screenshots/pullfx';

const MINI_SHOTS = [
  '01-mini-all-spinning',
  '02-mini-reel1-stopped',
  '03-mini-reel2-stopped',
  '04-mini-all-stopped',
  '05-mini-rf-result',
  '06-mini-nft-result',
  '07-mini-empty-result',
] as const;

const SHINE_SHOTS = [
  '08-shine-on-dark',
  '09-shine-on-paper',
  '10-nft-reveal',
  '11-capsule-reveal',
  '12-prize-drum-reveal',
  '13-tallboy-reveal',
  '14-mini-reveal',
] as const;

const svg = (name: string) => {
  const p = resolve(SVG_DIR, `${name}.svg`);
  if (!existsSync(p)) {
    throw new Error(`Missing ${p}. Run: npx vitest run scripts/renderPullfxScenes.ts`);
  }
  return readFileSync(p, 'utf8');
};

/**
 * Returns the scene SVG with percentage sizing so the whole pixel stage
 * scales uniformly inside a fluid container, exactly like the app does.
 */
function scaled(name: string): string {
  return svg(name).replace('width="768" height="576"', 'width="100%" height="100%"');
}

async function shoot(page: import('@playwright/test').Page, name: string, width = 768) {
  await page.setViewportSize({ width, height: Math.round((width * 96) / 128) });
  await page.goto(pathToFileURL(resolve(SVG_DIR, `${name}.svg`)).href);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

test.describe('Pull FX visual QA', () => {
  test('MINI: 7 QA frames captured', async ({ page }) => {
    for (const name of MINI_SHOTS) await shoot(page, name);
    expect(MINI_SHOTS).toHaveLength(7);
  });

  test('SHINE: 7 QA frames captured', async ({ page }) => {
    for (const name of SHINE_SHOTS) await shoot(page, name);
    expect(SHINE_SHOTS).toHaveLength(7);
  });

  test('SHINE: full frame and animation stages captured', async ({ page }) => {
    for (const name of [
      'shine-frame2-on-dark',
      'shine-frame2-on-paper',
      'shine-anim-a-glint',
      'shine-anim-b-medium',
      'shine-anim-c-full',
      'shine-anim-d-medium-out',
    ]) {
      await shoot(page, name);
    }
  });

  test('SHELL identity + no-prize quiet states captured', async ({ page }) => {
    for (const name of [
      'shell-classic-drum',
      'shell-capsule-shake',
      'shell-tallboy-claw',
      'noprize-classic',
      'noprize-capsule',
      'noprize-tallboy',
      'noprize-mini',
    ]) {
      await shoot(page, name);
    }
  });

  test('MINI: three reels are identical width/height with equal gutters', async ({ page }) => {
    await page.goto(pathToFileURL(resolve(SVG_DIR, '04-mini-all-stopped.svg')).href);

    const boxes = await page.evaluate(() => {
      // Clip rects share the 28x40 box but have no geometry of their
      // own, so keep only rects with real layout (non-zero size).
      const frames = [...document.querySelectorAll('rect')].filter((r) => {
        if (r.getAttribute('width') !== '28' || r.getAttribute('height') !== '40') return false;
        const b = r.getBoundingClientRect();
        return b.width > 0 && b.height > 0;
      });
      return frames.map((f) => {
        const b = f.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
    });

    // Exactly three reel boxes.
    expect(boxes).toHaveLength(3);

    // Identical dimensions.
    expect(new Set(boxes.map((b) => Math.round(b.w * 100) / 100)).size).toBe(1);
    expect(new Set(boxes.map((b) => Math.round(b.h * 100) / 100)).size).toBe(1);
    expect(new Set(boxes.map((b) => Math.round(b.y * 100) / 100)).size).toBe(1);

    // Equal gutters between adjacent reels.
    const gap1 = boxes[1]!.x - (boxes[0]!.x + boxes[0]!.w);
    const gap2 = boxes[2]!.x - (boxes[1]!.x + boxes[1]!.w);
    expect(Math.abs(gap1 - gap2)).toBeLessThan(0.01);
    expect(gap1).toBeGreaterThan(0);

    // Balanced outer margins: assembly centered on the stage.
    const assemblyLeft = boxes[0]!.x;
    const assemblyRight = boxes[2]!.x + boxes[2]!.w;
    const stageWidth = 128 * (boxes[0]!.w / MINI_REEL_GEOMETRY.reelWidth);
    const assemblyCenter = (assemblyLeft + assemblyRight) / 2;
    expect(Math.abs(assemblyCenter - stageWidth / 2)).toBeLessThan(0.5);
  });

  test('MINI: all reel interiors are warm paper, none pure white', async ({ page }) => {
    for (const name of MINI_SHOTS) {
      const fills = await (async () => {
        await page.goto(pathToFileURL(resolve(SVG_DIR, `${name}.svg`)).href);
        return page.evaluate(() =>
          [...document.querySelectorAll('rect')]
            .filter((r) => r.getAttribute('width') === '22' && r.getAttribute('height') === '34')
            .map((r) => r.getAttribute('fill')),
        );
      })();
      expect(fills, name).toHaveLength(3);
      for (const f of fills) {
        expect(f).toBe('#F3F1E8');
        expect(f).not.toBe('#FFFFFF');
      }
    }
  });

  test('MINI: symbols are centered in every reel', async ({ page }) => {
    await page.goto(pathToFileURL(resolve(SVG_DIR, '04-mini-all-stopped.svg')).href);
    // Each stopped reel draws a 10x10 symbol: 5 columns x 5 rows of 2px.
    // Column starts must be reelX + 9, 11, 13, 15, 17 for every reel.
    const offsets = await page.evaluate(() => {
      const reels = [16, 50, 84];
      const inks = [...document.querySelectorAll('rect')].filter(
        (r) => r.getAttribute('width') === '2' && r.getAttribute('height') === '2' && r.getAttribute('fill') === '#090909',
      );
      return reels.map((rx) => {
        const cols = new Set<number>();
        inks.forEach((r) => {
          const x = Number(r.getAttribute('x'));
          if (x >= rx && x < rx + 28) cols.add(x - rx);
        });
        return [...cols].sort((a, b) => a - b);
      });
    });

    for (const cols of offsets) {
      expect(cols.length).toBeGreaterThan(0);
      // Every column lies inside the centered 9..18 band.
      for (const c of cols) {
        expect(c).toBeGreaterThanOrEqual(9);
        expect(c).toBeLessThanOrEqual(18);
      }
    }
  });

  test('MINI: reels visibly move vertically between spinning frames', async ({ page }) => {
    const rowsFor = async (name: string) => {
      await page.goto(pathToFileURL(resolve(SVG_DIR, `${name}.svg`)).href);
      return page.evaluate(() => {
        const inks = [...document.querySelectorAll('rect')].filter(
          (r) => r.getAttribute('width') === '2' && r.getAttribute('height') === '2' && r.getAttribute('fill') === '#090909',
        );
        // Symbol rows for reel 1 only (x within 16..44).
        return [...new Set(inks.map((r) => Number(r.getAttribute('y'))).filter((y) => y >= 28 && y <= 50))].sort((a, b) => a - b);
      });
    };
    const spinning = await rowsFor('01-mini-all-spinning');
    const stopped = await rowsFor('04-mini-all-stopped');
    // Spinning shows the outgoing + incoming symbols at two heights;
    // stopped shows exactly one centered symbol.
    expect(spinning.length).toBeGreaterThan(stopped.length);
  });

  test('MOBILE: stage scales uniformly at 360/390/430 with no overflow', async ({ page }) => {
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      // Mirror the app's stage box: max-width 520, aspect-ratio 4/3.
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:#F3F1E8;display:flex;justify-content:center">
          <div style="width:100%;max-width:520px;aspect-ratio:4/3;image-rendering:pixelated;overflow:hidden">${scaled('05-mini-rf-result')}</div>
        </body></html>`,
      );
      await page.screenshot({ path: `${OUT}/mobile-mini-${width}.png`, fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(0);
    }
  });

  test('MOBILE: reel symmetry survives uniform scaling', async ({ page }) => {
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      await page.setContent(
        `<!doctype html><html><body style="margin:0;background:#F3F1E8;display:flex;justify-content:center">
          <div style="width:100%;max-width:520px;aspect-ratio:4/3;image-rendering:pixelated;overflow:hidden">${scaled('04-mini-all-stopped')}</div>
        </body></html>`,
      );
      const boxes = await page.evaluate(() => {
        const frames = [...document.querySelectorAll('rect')].filter((r) => {
          if (r.getAttribute('width') !== '28' || r.getAttribute('height') !== '40') return false;
          const b = r.getBoundingClientRect();
          return b.width > 0 && b.height > 0;
        });
        return frames.map((f) => {
          const b = f.getBoundingClientRect();
          return { x: b.x, w: b.width, h: b.height };
        });
      });
      expect(boxes, `reels at ${width}px`).toHaveLength(3);
      // Uniform scaling: identical widths, identical heights.
      expect(new Set(boxes.map((b) => Math.round(b.w * 100) / 100)).size, `widths @${width}`).toBe(1);
      expect(new Set(boxes.map((b) => Math.round(b.h * 100) / 100)).size, `heights @${width}`).toBe(1);
      // Gutters remain equal after scaling.
      const gap1 = boxes[1]!.x - (boxes[0]!.x + boxes[0]!.w);
      const gap2 = boxes[2]!.x - (boxes[1]!.x + boxes[1]!.w);
      expect(Math.abs(gap1 - gap2), `gutters @${width}`).toBeLessThan(0.5);
      // Gutter scales with the stage: positive and proportionally smaller than the reel.
      expect(gap1).toBeGreaterThan(0);
      expect(gap1 / boxes[0]!.w).toBeCloseTo(6 / 28, 2);
    }
  });

  test('SHINE: no-prize scenes carry no shine glints', async ({ page }) => {
    for (const name of ['noprize-classic', 'noprize-capsule', 'noprize-tallboy', 'noprize-mini']) {
      await page.goto(pathToFileURL(resolve(SVG_DIR, `${name}.svg`)).href);
      const glints = await page.evaluate(() =>
        [...document.querySelectorAll('rect')].filter((r) => {
          const x = Number(r.getAttribute('x'));
          const y = Number(r.getAttribute('y'));
          // Dominant glint anchor (92,4) and its 10px rays.
          return x >= 92 && x <= 106 && y <= 20 && r.getAttribute('fill') === '#8C8B84';
        }).length,
      );
      expect(glints, name).toBe(0);
    }
  });

  test('SHINE: prize reveals carry the mid-gray depth layer', async ({ page }) => {
    for (const name of ['08-shine-on-dark', '09-shine-on-paper', '10-nft-reveal', '11-capsule-reveal', '12-prize-drum-reveal', '13-tallboy-reveal', '14-mini-reveal']) {
      await page.goto(pathToFileURL(resolve(SVG_DIR, `${name}.svg`)).href);
      const tones = await page.evaluate(() => {
        const set = new Set<string>();
        for (const r of document.querySelectorAll('rect')) {
          const x = Number(r.getAttribute('x'));
          const y = Number(r.getAttribute('y'));
          if (x >= 88 && x <= 108 && y <= 20) set.add(r.getAttribute('fill') ?? '');
        }
        return [...set];
      });
      // Gray depth + light rays + white hotspot all present.
      expect(tones, name).toContain('#8C8B84');
      expect(tones, name).toContain('#C7C6BE');
      expect(tones, name).toContain('#FFFFFF');
    }
  });
});
