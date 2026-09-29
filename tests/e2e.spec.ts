import { test, expect } from '@playwright/test';

test.describe('Rare Arcade — Complete E2E Flows', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage to start with fresh fixtures
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test('01: Welcome onboarding modal explains the core loop and can be dismissed', async ({ page }) => {
    await page.goto('/');

    // Verify simulation warning banner is present
    await expect(page.locator('.sim-banner')).toBeVisible();
    await expect(page.locator('.sim-banner')).toContainText('SIMULATED VIBEATHON DEMO');

    // Onboarding modal should be visible on first load
    await expect(page.locator('text=WELCOME TO RARE ARCADE')).toBeVisible();
    await expect(page.locator('text=BUILD THE MACHINE.')).toBeVisible();

    // Click PLAY ARCADE
    await page.click('button:has-text("PLAY ARCADE")');
    await expect(page.locator('text=WELCOME TO RARE ARCADE')).not.toBeVisible();

    // Verify Arcade Floor shows 3 seeded demo machines
    await expect(page.locator('text=THE ARCADE FLOOR')).toBeVisible();
    await expect(page.locator('text=FRIEND FRENZY')).toBeVisible();
    await expect(page.locator('text=RF RAIN')).toBeVisible();
    await expect(page.locator('text=HIGH ROLLER')).toBeVisible();
  });

  test('02: Player can inspect prizes, view live odds, and pull from a machine', async ({ page }) => {
    await page.goto('/');
    // Dismiss onboarding if visible
    if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
      await page.click('button:has-text("PLAY ARCADE")');
    }

    // Step up to FRIEND FRENZY (scope to arcade floor cards to avoid ambiguity)
    await page.locator('.cabinet-container:has-text("FRIEND FRENZY")').first().click();

    // Verify machine detail loaded
    await expect(page.locator('h1, span:has-text("FRIEND FRENZY")')).toBeVisible();
    await expect(page.locator('text=PULLS: 100 / 100')).toBeVisible();

    // Open & verify Prize Pool Modal (scope to cabinet controls to avoid matching "MY PRIZES" nav)
    await page.locator('.cabinet-controls button:has-text("PRIZES")').click();
    await expect(page.locator('text=PRIZE POOL — FRIEND FRENZY')).toBeVisible();
    await expect(page.locator('text=Friend #8283').first()).toBeVisible();
    await expect(page.locator('text=SYSTEM DEMO MACHINE').first()).toBeVisible();
    await page.click('button:has-text("CLOSE")');

    // Open & verify Live Odds Modal (scoped to cabinet controls)
    await page.locator('.cabinet-controls button:has-text("ODDS")').click();
    await expect(page.locator('text=LIVE ODDS — FRIEND FRENZY')).toBeVisible();
    await expect(page.locator('text=TOTAL PROBABILITY:')).toBeVisible();
    await expect(page.locator('text=100.00%')).toBeVisible();
    await page.click('button:has-text("CLOSE")');

    // Execute PULL
    const pullBtn = page.locator('button:has-text("PULL — 5,000.00 RF")');
    await expect(pullBtn).toBeEnabled();
    await pullBtn.click();

    // Wait for pull sequence to complete (3s animation window)
    await page.waitForTimeout(3400);

    // Verify pulls counter decremented from 100 to 99
    await expect(page.locator('text=PULLS: 99 / 100')).toBeVisible();

    // Verify rules locked badge is now visible
    await expect(page.locator('text=LOCKED')).toBeVisible();
  });

  test('03: Creator can build and publish an RF-only Friend Machine', async ({ page }) => {
    await page.goto('/');
    // Dismiss onboarding first if visible (it overlays the nav)
    if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
      await page.click('button:has-text("PLAY ARCADE")');
    }
    // Click the nav tab specifically (avoids matching "BUILD A MACHINE" floor button)
    await page.locator('nav button:has-text("BUILD MACHINE")').click();

    // Step 1: Identity & Shell
    await expect(page.locator('text=CREATOR WORKSHOP: BUILD A FRIEND MACHINE')).toBeVisible();
    const nameInput = page.locator('input[placeholder*="LUCKY SKELETON"]');
    await nameInput.fill('NEO ARCADE');
    await page.click('text=CAPSULE');
    await page.click('button:has-text("NEXT: SEED PRIZES")');

    // Step 2: Seed Prizes (RF-only — no wallet needed)
    await expect(page.locator('text=STEP 2: SEED PRIZE INVENTORY')).toBeVisible();

    // Add RF prize: 20000 RF x 2 (coherent with default 2,500 RF pull price)
    await page.locator('input[type="number"]').first().fill('20000');
    await page.click('button:has-text("+ ADD RF PRIZE")');
    await expect(page.locator('text=CURRENT PRIZES IN MACHINE (1)')).toBeVisible();

    await page.click('button:has-text("NEXT: SET ECONOMICS")');

    // Step 3: Economics & Launch
    await expect(page.locator('text=STEP 3: ECONOMICS & LAUNCH')).toBeVisible();
    await expect(page.locator('text=ECONOMICS SCENARIO LAB')).toBeVisible();

    // Publish
    await page.click('button:has-text("PUBLISH FRIEND MACHINE")');

    // Should navigate directly to new machine detail!
    await expect(page.locator('span:has-text("NEO ARCADE")')).toBeVisible();
    await expect(page.locator('text=SHELL: CAPSULE')).toBeVisible();
  });

  test('04: Mobile responsive view fits 390px without horizontal overflow', async ({ page }) => {    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');

    if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
      await page.click('button:has-text("PLAY ARCADE")');
    }

    // Step up to a machine (scope to floor cards)
    await page.locator('.cabinet-container:has-text("FRIEND FRENZY")').first().click();
    await expect(page.locator('button:has-text("PULL — 5,000.00 RF")')).toBeVisible();

    // Assert no horizontal scroll overflow
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(hasHorizontalOverflow).toBe(false);
  });

  test('05: Token-top machines show the $RF pixel coin, not a random sprite', async ({ page }) => {
    await page.goto('/');
    if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
      await page.click('button:has-text("PLAY ARCADE")');
    }

    // RF RAIN is token-only: its floor card must render the coin.
    const rainCard = page.locator('.cabinet-container:has-text("RF RAIN")').first();
    await expect(rainCard.locator('.rf-token-icon')).toBeVisible();

    // Same on the machine detail LCD.
    await rainCard.click();
    await expect(page.locator('text=PULLS: 100 / 100')).toBeVisible();
    await expect(page.locator('.cabinet-lcd-screen .rf-token-icon').first()).toBeVisible();
  });

  test('06: CAPSULE shell plays the capsule-open pull animation', async ({ page }) => {
    await page.goto('/');
    if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
      await page.click('button:has-text("PLAY ARCADE")');
    }
    await page.locator('nav button:has-text("BUILD MACHINE")').click();
    await expect(page.locator('text=CREATOR WORKSHOP: BUILD A FRIEND MACHINE')).toBeVisible();

    // Shell picker advertises the per-shell pull FX.
    await expect(page.locator('text=PULL FX: CAPSULE OPEN')).toBeVisible();
    await expect(page.locator('text=PULL FX: CLAW GRAB')).toBeVisible();
    await expect(page.locator('text=PULL FX: SLOT REELS')).toBeVisible();
    await expect(page.locator('text=PULL FX: PRIZE DRUM').first()).toBeVisible();
    // No persistent motion toggle remains.
    await expect(page.locator('button:has-text("MOTION:")')).toHaveCount(0);

    const nameInput = page.locator('input[placeholder*="LUCKY SKELETON"]');
    await nameInput.fill('CLAW ARCADE');
    await page.click('text=CAPSULE');
    // Preview FX spends nothing and runs the real animation.
    await expect(page.locator('button:has-text("PREVIEW FX")').first()).toBeVisible();
    await page.click('button:has-text("NEXT: SEED PRIZES")');

    await page.locator('input[type="number"]').first().fill('20000');
    await page.click('button:has-text("+ ADD RF PRIZE")');
    await page.click('button:has-text("NEXT: SET ECONOMICS")');
    await page.click('button:has-text("PUBLISH FRIEND MACHINE")');
    await expect(page.locator('span:has-text("CLAW ARCADE")')).toBeVisible();

    // Pull: the LCD must play the capsule scene while resolving, then reveal.
    await page.locator('button:has-text("PULL —")').click();
    await expect(page.locator('text=DROPPING THE CAPSULE')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('text=PULLS: 17 / 18')).toBeVisible({ timeout: 10000 });
  });

  test('07: Motion toggle removed — no visible Motion On/Off control', async ({ page }) => {
    await page.goto('/');
    if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
      await page.click('button:has-text("PLAY ARCADE")');
    }
    await expect(page.locator('button:has-text("MOTION:")')).toHaveCount(0);
    await expect(page.locator('text=MOTION ON')).toHaveCount(0);
    await expect(page.locator('text=MOTION OFF')).toHaveCount(0);
  });
});
