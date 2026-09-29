// arcadefloor-qa.spec.ts
//
// Screenshot QA for the arcade floor card: play price on the button and
// the TOP PRIZE label when live RTP is 0.

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const DIR = 'screenshots/arcadefloor';
const html = (n: string) => {
  const p = resolve(DIR, `${n}.html`);
  if (!existsSync(p)) throw new Error(`Missing ${p}. Run the arcade floor scene generator.`);
  return readFileSync(p, 'utf8');
};

const SHOTS = ['floor-normal', 'floor-rtp-zero', 'floor-mixed'] as const;

test.describe('Arcade floor card visual QA', () => {
  test('captures the card states', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 900 });
    for (const name of SHOTS) {
      await page.setContent(html(name));
      await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
    }
    expect(SHOTS).toHaveLength(3);
  });

  test('play button shows the pull cost in RF, not STEP UP & PULL', async ({ page }) => {
    await page.setContent(html('floor-normal'));
    // The whole machine card is also role="button", so scope to real
    // <button> elements for the play control.
    await expect(page.locator('button.pixel-btn', { hasText: /^Play — / })).toHaveCount(1);
    await expect(page.locator('button', { hasText: 'Play — 2,500.00 RF' })).toBeVisible();
    await expect(page.getByText('STEP UP & PULL')).toHaveCount(0);
  });

  test('live RTP 0 shows TOP PRIZE: None Left instead of Tokens', async ({ page }) => {
    await page.setContent(html('floor-rtp-zero'));
    await expect(page.getByText('TOP PRIZE:')).toBeVisible();
    await expect(page.getByText('None Left')).toBeVisible();
    await expect(page.getByText('Tokens', { exact: true })).toHaveCount(0);
  });

  test('a healthy machine still shows its real top prize', async ({ page }) => {
    await page.setContent(html('floor-normal'));
    await expect(page.getByText('None Left')).toHaveCount(0);
  });

  test('mixed floor: each card labels itself correctly', async ({ page }) => {
    await page.setContent(html('floor-mixed'));
    await expect(page.locator('button', { hasText: 'Play — 2,500.00 RF' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Play — 12,500.00 RF' })).toBeVisible();
    await expect(page.getByText('None Left')).toBeVisible();
  });

  test('fits mobile widths without horizontal overflow', async ({ page }) => {
    await page.setContent(html('floor-mixed'));
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});
