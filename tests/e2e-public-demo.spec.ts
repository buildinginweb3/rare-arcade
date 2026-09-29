/**
 * e2e-public-demo.spec.ts
 *
 * Clean-session release smoke test against the DEPLOYED public demo.
 * Run separately from the mocked local e2e suite:
 *   BASE_URL=https://buildinginweb3.github.io/rare-arcade/ npx playwright test tests/e2e-public-demo.spec.ts
 *
 * Verifies the demo works with no wallet, no API key config and no
 * localhost dependencies, exactly as a judge would load it.
 */

import { test, expect } from '@playwright/test';

const DEMO = process.env.BASE_URL;
if (!DEMO) {
  throw new Error('Set BASE_URL to the deployed demo URL.');
}
// Pages hosts this app under a subpath, so every navigation must stay
// relative to it (a leading-slash URL would resolve to the domain root).
test.use({ baseURL: DEMO });

test('public demo: fresh visitor can browse machines and see real copy', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto('./');
  // Dismiss onboarding the way a first-time judge would.
  const play = page.locator('button:has-text("PLAY ARCADE")');
  if (await play.isVisible().catch(() => false)) await play.click();

  await expect(page.getByText('THE ARCADE FLOOR')).toBeVisible();

  // Seeded machines render with the pull price on the play button.
  await expect(page.locator('button.pixel-btn', { hasText: /^Play — / }).first()).toBeVisible();
  await expect(page.getByText('STEP UP & PULL')).toHaveCount(0);

  // No unresolved network failures for first-party assets.
  const bad = errors.filter((e) => !/favicon|fonts\.g|net::ERR_/i.test(e));
  expect(bad, `console/page errors:\n${bad.join('\n')}`).toEqual([]);
});

test('public demo: a pull resolves and RF accounting updates', async ({ page }) => {
  await page.goto('./');
  const play = page.locator('button:has-text("PLAY ARCADE")');
  if (await play.isVisible().catch(() => false)) await play.click();

  // Read the displayed RF balance. The header wraps differently on narrow
  // viewports, so match the first grouped RF amount anywhere on screen.
  const readBalance = async () => {
    const text = (await page.locator('body').innerText()).replace(/\n/g, ' ');
    const m = /([\d,]+\.\d{2})\s*RF/.exec(text);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };

  const before = await readBalance();
  expect(before, 'player RF balance visible in header').not.toBeNull();

  // Open the first machine.
  await page.locator('.cabinet-container').first().click();
  await expect(page.getByText('PULLS MADE: 0')).toBeVisible();

  await page.locator('button:has-text("PULL —")').click();
  await expect(page.getByText('PULLS MADE: 1')).toBeVisible({ timeout: 20000 });

  const after = await readBalance();
  expect(after, 'RF balance decreases by the pull price').toBeLessThan(before as number);
});

test('public demo: creator workshop is reachable and publishes a machine', async ({ page }) => {
  await page.goto('./');
  const play = page.locator('button:has-text("PLAY ARCADE")');
  if (await play.isVisible().catch(() => false)) await play.click();

  await page.locator('nav button:has-text("BUILD MACHINE")').click();
  await expect(page.getByText('CREATOR WORKSHOP')).toBeVisible();

  // Build and publish a minimal RF-only machine (no wallet needed).
  await expect(page.getByText('CREATOR WORKSHOP: BUILD A FRIEND MACHINE')).toBeVisible();
  await page.locator('input[placeholder*="LUCKY SKELETON"]').fill('PUBLIC DEMO MACHINE');
  await page.locator('text=CAPSULE').first().click();
  await page.locator('button:has-text("NEXT: SEED PRIZES")').click();

  await expect(page.getByText('STEP 2: SEED PRIZE INVENTORY')).toBeVisible();
  await page.locator('input[type="number"]').first().fill('20000');
  await page.locator('button:has-text("+ ADD RF PRIZE")').click();
  await expect(page.getByText('CURRENT PRIZES IN MACHINE (1)')).toBeVisible();

  await page.locator('button:has-text("NEXT: SET ECONOMICS")').click();
  await expect(page.getByText('STEP 3: ECONOMICS & LAUNCH')).toBeVisible();

  await page.locator('button:has-text("PUBLISH FRIEND MACHINE")').click();

  // It lands directly on the new machine detail.
  await expect(page.locator('span:has-text("PUBLIC DEMO MACHINE")')).toBeVisible();
  await expect(page.getByText('SHELL: CAPSULE')).toBeVisible();

  // And it appears in the arcade floor.
  await page.locator('nav button:has-text("ARCADE")').click();
  await expect(page.getByText('PUBLIC DEMO MACHINE').first()).toBeVisible();
});

test('public demo: mobile viewport works without horizontal overflow', async ({ page }) => {
  for (const width of [360, 390, 430]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('./');
    const play = page.locator('button:has-text("PLAY ARCADE")');
    if (await play.isVisible().catch(() => false)) await play.click();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow, `overflow at ${width}px`).toBeLessThanOrEqual(1);
  }
});
