/**
 * e2e-pull-frame.spec.ts
 *
 * Regression guard for the "dotted rectangular frame around the machine"
 * bug: a `.pull-focus` wrapper used to paint
 *   outline: 2px dashed; outline-offset: 4px
 * around the whole cabinet for the duration of every pull. With a
 * positive outline offset it rendered as a large detached dashed
 * rectangle around the machine and read as a broken selection marquee
 * rather than as a state change.
 *
 * Kept shell-agnostic: some cabinets show "PULLS MADE: n" and others a
 * ticket counter, so the assertions key off the pull state itself.
 */

import { test, expect } from '@playwright/test';

const PULL = 'button:has-text("PULL —")';

const dashedFrames = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const found: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const cs = getComputedStyle(el);
      if (cs.outlineStyle !== 'dashed' && cs.outlineStyle !== 'dotted') continue;
      if (parseFloat(cs.outlineWidth) === 0) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      found.push(
        `${el.tagName}.${(el.className || '').toString().split(' ')[0]} ` +
          `${cs.outlineStyle} ${cs.outlineWidth} ` +
          `box=${Math.round(r.width)}x${Math.round(r.height)}`,
      );
    }
    return found;
  });

test.beforeEach(async ({ page }) => {
  // Fresh fixtures: pull counters and balances persist in localStorage.
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

async function openFirstMachine(page: import('@playwright/test').Page) {
  await page.goto('/');
  const play = page.locator('button:has-text("PLAY ARCADE")');
  if (await play.isVisible().catch(() => false)) await play.click();
  await page.locator('.cabinet-container').first().click();
  await expect(page.locator(PULL)).toBeVisible();
}

test.describe('pull-in-progress framing', () => {
  test('paints no detached dashed or dotted frame while pulling', async ({ page }) => {
    await openFirstMachine(page);

    expect(await dashedFrames(page), 'idle machine is clean').toEqual([]);
    expect(await page.locator('.pull-focus').count(), 'no pull-focus when idle').toBe(0);

    await page.locator(PULL).click();

    // Sample across the whole pull animation, not just the first frame.
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(500);
      expect(await dashedFrames(page), `dashed frame at ~${(i + 1) * 500}ms`).toEqual([]);
    }

    // State clears once the pull resolves.
    await expect(page.locator('.pull-focus'), 'pull-focus removed after pull').toHaveCount(0, {
      timeout: 20000,
    });
    expect(await dashedFrames(page), 'clean after pull').toEqual([]);
  });

  test('keeps the pull-in-progress affordance, without a detached outline', async ({ page }) => {
    await openFirstMachine(page);
    await page.locator(PULL).click();

    const wrap = page.locator('.pull-focus');
    await expect(wrap, 'pull-focus applied while pulling').toHaveCount(1);

    const style = await wrap.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, boxShadow: cs.boxShadow };
    });
    // No outline-based frame; the indicator is an inset shadow instead.
    expect(style.outlineStyle, 'no dashed/dotted outline').toBe('none');
    expect(style.boxShadow, 'inset indicator present').toContain('inset');

    await expect(page.locator('.pull-focus')).toHaveCount(0, { timeout: 20000 });
  });

  test('paints no visible outline with a positive offset while pulling', async ({ page }) => {
    // The defect: `outline: 2px dashed; outline-offset: 4px` draws the
    // frame OUTSIDE the element it annotates, so it detaches from the
    // machine. Any visible outline with a positive offset is the bug.
    await openFirstMachine(page);
    await page.locator(PULL).click();
    await page.waitForTimeout(500);

    const offenders = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
        const cs = getComputedStyle(el);
        if (cs.outlineStyle === 'none') continue;
        if (parseFloat(cs.outlineWidth) === 0) continue;
        if (parseFloat(cs.outlineOffset) <= 0) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        out.push(
          `${el.tagName}.${(el.className || '').toString().split(' ')[0]} ` +
            `${cs.outlineStyle} ${cs.outlineWidth} offset=${cs.outlineOffset}`,
        );
      }
      return out;
    });

    expect(offenders, 'no detached outline during pull').toEqual([]);
  });
});
