// wonprizes-qa.spec.ts
//
// Screenshot QA for the MY PRIZES showcase: $RF token wins and
// collectibles side by side, plus the empty state.

import { test, expect } from '@playwright/test';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const HTML_DIR = 'screenshots/wonprizes';
const OUT = 'screenshots/wonprizes';

const html = (name: string) => {
  const p = resolve(HTML_DIR, `${name}.html`);
  if (!existsSync(p)) {
    throw new Error(`Missing ${p}. Run the won-prizes scene generator first.`);
  }
  return readFileSync(p, 'utf8');
};

const SHOTS = ['won-prizes-mixed', 'won-prizes-token-only', 'won-prizes-empty', 'won-prizes-many-rf'] as const;

test.describe('MY PRIZES visual QA', () => {
  test('captures the showcase states', async ({ page }) => {
    await page.setViewportSize({ width: 1120, height: 1000 });
    for (const name of SHOTS) {
      await page.setContent(html(name));
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    }
    expect(SHOTS).toHaveLength(4);
  });

  test('shows the $RF coin card and the collectible card together', async ({ page }) => {
    await page.setContent(html('won-prizes-mixed'));
    await expect(page.locator('text=WON PRIZES')).toBeVisible();
    await expect(page.locator('text=WON RARE FRIENDS')).toHaveCount(0);
    // Token card: $RF coin, amount, machine, and win count.
    await expect(page.locator('svg.rf-token-icon').first()).toBeVisible();
    await expect(page.locator('text=WON FROM ODDS ARCADE')).toBeVisible();
    await expect(page.locator('text=/\\$RAREFRIENDS • \\d+ WINS?/').first()).toBeVisible();
    // Collectible card still present.
    await expect(page.locator('text=Rare Friend').first()).toBeVisible();
  });

  test('empty state reads NO PRIZES WON YET', async ({ page }) => {
    await page.setContent(html('won-prizes-empty'));
    await expect(page.locator('text=NO PRIZES WON YET')).toBeVisible();
    await expect(page.locator('text=NO RARE FRIENDS WON YET')).toHaveCount(0);
  });

  test('fits mobile widths without horizontal overflow', async ({ page }) => {
    await page.setContent(html('won-prizes-many-rf'));
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 900 });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1);
    }
  });
});
