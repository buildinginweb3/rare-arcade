// rftoken-qa.spec.ts
//
// Screenshot QA for the $RF token material pass.
//
// Scenes are pre-rendered to SVG by
// src/components/machine/__tests__/renderRfTokenScenes.test.ts (vitest,
// because Playwright's component transform cannot server-render).
// This spec rasterizes them and asserts the material rules in real
// rendered pixels.

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const SVG_DIR = 'screenshots/rftoken/svg';
const OUT = 'screenshots/rftoken';

const svg = (name: string) => {
  const p = resolve(SVG_DIR, `${name}.svg`);
  if (!existsSync(p)) {
    throw new Error(`Missing ${p}. Run: npx vitest run src/components/machine/__tests__/renderRfTokenScenes.test.ts`);
  }
  return readFileSync(p, 'utf8');
};

async function shoot(page: import('@playwright/test').Page, name: string, scale = 4) {
  // Inline the scene into an HTML document so an integer CSS upscale can
  // be applied for inspection. Integer scaling keeps every token pixel
  // perfectly square (no half-pixel seams).
  const markup = svg(name);
  const vb = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(markup)!;
  const w = Math.ceil(Number(vb[1]) * scale);
  const h = Math.ceil(Number(vb[2]) * scale);

  await page.setViewportSize({ width: w + 32, height: h + 32 });
  await page.setContent(
    `<!doctype html><html><head><style>
       html,body{margin:0;background:#7a7a74}
       .zoom{transform:scale(${scale});transform-origin:0 0;image-rendering:pixelated}
     </style></head><body><div class="zoom">${markup}</div></body></html>`,
  );
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

const SIZES = [20, 24, 32, 48, 64, 96, 112, 128, 144];

test.describe('$RF token visual QA', () => {
  test('token captured at every QA size', async ({ page }) => {
    for (const size of SIZES) {
      await shoot(page, `size-${String(size).padStart(3, '0')}`);
    }
  });

  test('token captured in every real app context', async ({ page }) => {
    for (const name of [
      'ctx-normal-prize',
      'ctx-top-chase',
      'ctx-player-balance',
      'ctx-creator-balance',
      'ladder',
    ]) {
      await shoot(page, name, name === 'ladder' ? 2 : 4);
    }
  });

  test('no shine anywhere: no white, light-grey, or mid-grey pixels', async ({ page }) => {
    for (const size of SIZES) {
      await page.goto(pathToFileURL(resolve(SVG_DIR, `size-${String(size).padStart(3, '0')}.svg`)).href);
      const tones = await page.evaluate(() => {
        const seen = new Set<string>();
        for (const el of document.querySelectorAll('svg[data-token] rect, svg[data-token] path')) {
          seen.add(el.getAttribute('fill') ?? '');
        }
        return [...seen].sort();
      });
      // Structural palette only: no shine tones at all.
      expect(tones, `${size}px tones`).toEqual(['#090909', '#66665F', '#F3F1E8']);
    }
  });

  test('$RF lettering stays crisp and legible at every size', async ({ page }) => {
    for (const size of SIZES) {
      await page.goto(pathToFileURL(resolve(SVG_DIR, `size-${String(size).padStart(3, '0')}.svg`)).href);
      const glyph = await page.evaluate(
        () =>
          [...document.querySelectorAll('svg[data-token] rect')].filter(
            (r) => r.getAttribute('width') === '2' && r.getAttribute('height') === '2',
          ).length,
      );
      // $ = 17, R = 18, F = 14.
      expect(glyph, `${size}px glyph pixels`).toBe(49);
    }
  });

  test('renders with crisp edges and no filters or gradients', async ({ page }) => {
    await page.goto(pathToFileURL(resolve(SVG_DIR, 'size-144.svg')).href);
    const info = await page.evaluate(() => {
      const svg = document.querySelector('svg[data-token]')!;
      return {
        crisp: svg.getAttribute('shape-rendering'),
        filters: document.querySelectorAll('filter, feGaussianBlur').length,
        gradients: document.querySelectorAll('linearGradient, radialGradient').length,
        cssFilter: getComputedStyle(svg).filter,
      };
    });
    expect(info.crisp).toBe('crispEdges');
    expect(info.filters).toBe(0);
    expect(info.gradients).toBe(0);
    expect(info.cssFilter).toBe('none');
  });
});
