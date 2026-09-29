import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Standalone visual-QA runner for scripts/pullfx-qa.spec.ts.
 *
 * That spec renders pull FX scenes straight to SVG from source with a
 * pinned virtual time, so it needs neither the app server nor page
 * routing. It lives outside tests/ because Playwright's own runner must
 * not collide with the vitest include pattern in that directory.
 */
const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  testDir: resolve(root, 'scripts'),
  testMatch: /(pullfx|rftoken|wonprizes|arcadefloor).*-qa\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  projects: [{ name: 'pullfx-qa', use: { browserName: 'chromium' } }],
});
