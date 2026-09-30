/**
 * e2e-pull-frame.spec.ts
 *
 * Regression guard for the "a frame pops up around the machine when you
 * pull" bug.
 *
 * History: the cabinet wrapper gained a `pull-focus` class while pulling.
 * It first painted `outline: 2px dashed; outline-offset: 4px` — a large
 * detached dashed rectangle around the whole machine. Replacing that with
 * an inset box-shadow just made the same frame solid, which was still a
 * box appearing around the cabinet on every pull. So the indicator was
 * removed entirely.
 *
 * The pull state is communicated by the "PULLING..." button label, the
 * "PULL IN PROGRESS" activity panel, and an aria-live region. No frame
 * around the machine.
 *
 * Kept shell-agnostic: some cabinets show "PULLS MADE: n" and others a
 * ticket counter, so assertions key off the pull state itself.
 */

import { test, expect } from '@playwright/test';

const PULL = 'button:has-text("PULL —")';

/** Anything that would read as a frame drawn around an element. */
const frameDecorations = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;

      // Any visible outline: dashed/dotted (old bug) or solid inset ring
      // (the replacement that was also wrong).
      if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) {
        out.push(
          `outline ${el.tagName}.${(el.className || '').toString().split(' ')[0]} ` +
            `${cs.outlineStyle} ${cs.outlineWidth} offset=${cs.outlineOffset}`,
        );
      }

      // A box-shadow ring big enough to read as a drawn frame. The design
      // uses small hard drop shadows for depth, so only flag wide spread.
      // box-shadow shorthand order: offsetX, offsetY, blur, spread.
      const parts = /(-?[\d.]+)px\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?/.exec(
        cs.boxShadow,
      );
      if (cs.boxShadow !== 'none' && parts) {
        const blur = Number(parts[3]);
        const radius = Math.abs(Number(parts[4] ?? 0));
        // A hard, zero-blur ring >= 3px reads as a drawn frame. The design's
        // own depth shadows are `3px 3px 0px` (offset, no spread), so they
        // are not flagged.
        if (blur === 0 && radius >= 3) {
          out.push(
            `ring ${el.tagName}.${(el.className || '').toString().split(' ')[0]} ` +
              `${cs.boxShadow} box=${Math.round(r.width)}x${Math.round(r.height)}`,
          );
        }
      }
    }
    return out;
  });

/** The cabinet's own container, which must stay visually undecorated. */
const cabinetFrames = (page: import('@playwright/test').Page) =>
  page.evaluate(() => {
    const out: string[] = [];
    // The cabinet column is the first child of the machine detail grid.
    const grid = document.querySelector('.machine-detail-grid');
    const wrap = grid?.firstElementChild as HTMLElement | null;
    if (!wrap) return ['cabinet wrapper not found'];
    const cs = getComputedStyle(wrap);
    out.push(`outline=${cs.outlineStyle}/${cs.outlineWidth}/${cs.outlineOffset}`);
    out.push(`boxShadow=${cs.boxShadow}`);
    out.push(`border=${cs.borderStyle}/${cs.borderWidth}`);
    return out;
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

test.describe('pull framing', () => {
  test('the pull-focus class no longer exists', async ({ page }) => {
    // Guards against the indicator being reintroduced.
    await openFirstMachine(page);
    await page.locator(PULL).click();
    await page.waitForTimeout(600);
    await expect(page.locator('.pull-focus')).toHaveCount(0);
  });

  test('no frame appears around the machine while pulling', async ({ page }) => {
    await openFirstMachine(page);

    expect(await frameDecorations(page), 'idle machine is clean').toEqual([]);
    const idleCabinet = await cabinetFrames(page);

    await page.locator(PULL).click();

    // Sample across the whole pull animation, not just the first frame.
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(500);
      expect(await frameDecorations(page), `frame at ~${(i + 1) * 500}ms`).toEqual([]);
    }

    // The cabinet wrapper itself is undecorated before, during and after.
    expect(await cabinetFrames(page), 'cabinet frame appeared during pull').toEqual(idleCabinet);

    await page.waitForTimeout(4000);
    expect(await frameDecorations(page), 'clean after pull').toEqual([]);
    expect(await cabinetFrames(page)).toEqual(idleCabinet);
  });

  test('still communicates the pull state without a frame', async ({ page }) => {
    await openFirstMachine(page);
    await page.locator(PULL).click();
    await page.waitForTimeout(500);

    // Feedback still exists via the button label and the activity panel.
    await expect(page.locator('button:has-text("PULLING")')).toBeVisible();
    await expect(page.getByText('PULL IN PROGRESS').first()).toBeVisible();
  });
});
