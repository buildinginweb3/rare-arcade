import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// NOTE: direct client mode — the browser calls OpenSea + the public Robinhood
// RPC straight from the bundle (burner key in src/nfts/apiClient.ts).
// No server proxy, no dev middleware needed.

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 4173,
    host: true,
  },
  // @ts-expect-error vitest config
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    // tests/ = Playwright e2e, scripts/*.spec.ts = Playwright visual QA.
    // Both are run by Playwright, not vitest.
    exclude: ['tests/**', 'scripts/**', 'node_modules/**'],
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
