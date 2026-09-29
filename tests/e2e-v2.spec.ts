/**
 * V2 E2E: verified-NFT creator flow with fully mocked wallet + endpoints.
 * - window.ethereum stubbed (read-only connect, no real wallet)
 * - api.opensea.io (raw v2 shape) + Robinhood RPC intercepted with fixtures
 * No live OpenSea/RPC calls, no secrets, no transactions.
 */
import { test, expect, type Page } from '@playwright/test';

const MOCK_WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_OWNER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const MOCK_NFTS = [
  {
    identifier: '8283',
    contract: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d',
    collection: 'rare-friends-generations',
    name: 'Friend #8283',
    image_url: 'https://example.com/friend-8283.svg',
    display_image_url: 'https://example.com/friend-8283.svg',
    display_animation_url: null,
    opensea_url: 'https://opensea.io/assets/robinhood/0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d/8283',
    traits: [
      { trait_type: 'Character', value: 'Mask' },
      { trait_type: 'Generation', value: '0' },
    ],
  },
  {
    identifier: '773',
    contract: '0x116eaa62241751e0c98da43d458600c6c17cd361',
    collection: 'rare-friends-genesis',
    name: 'Genesis #773',
    image_url: 'https://example.com/genesis-773.svg',
    display_image_url: 'https://example.com/genesis-773.svg',
    display_animation_url: null,
    opensea_url: 'https://opensea.io/assets/robinhood/0x116eaa62241751e0c98da43d458600c6c17cd361/773',
    traits: [{ trait_type: 'Eyes', value: 'Dot' }],
  },
];

// Automatic market valuation fixtures: top bid $500 + RF $0.002 → 250,000 RF ref
// (matches the legacy manual reference so downstream RTP math is unchanged).
const MOCK_TOP_BID_USD = '500';
const MOCK_RF_USD = '0.002';

function paddedOwner(address: string): string {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`;
}

async function stubWalletAndEndpoints(page: Page, verifyOwner: string): Promise<void> {
  await page.addInitScript(
    (wallet: string) => {
      (window as unknown as Record<string, unknown>).ethereum = {
        request: async (args: { method: string }) => {
          if (args.method === 'eth_requestAccounts') return [wallet];
          return null;
        },
        on: () => undefined,
        removeListener: () => undefined,
      };
    },
    MOCK_WALLET
  );
  await page.route('**/api.opensea.io/api/v2/chains*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ chains: [{ chain: 'robinhood', name: 'Robinhood' }] }),
    });
  });
  await page.route('**/api.opensea.io/api/v2/chain/*/account/*/nfts*', async (route) => {
    const url = route.request().url();
    const body = url.includes('/chain/robinhood/')
      ? { nfts: MOCK_NFTS, next: null }
      : { nfts: [], next: null };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  // Top-bid mocks (single URL-aware handler: item best → trait bids → collection bids).
  await page.route('**/api.opensea.io/api/v2/offers/collection/**', async (route) => {
    const url = route.request().url();
    const collBid = {
      status: 'ACTIVE',
      chain: 'robinhood',
      order_hash: '0xmockorderhash',
      asset: { contract: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d', identifier: null },
      criteria: {
        collection: { slug: 'rare-friends-generations' },
        contract: { address: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d' },
        traits: null,
        numeric_traits: null,
      },
      price: { currency: 'USDC', decimals: 6, value: '500000000' },
      protocol_data: { parameters: { offer: [], consideration: [] } },
      remaining_quantity: 1,
    };
    let body: unknown;
    if (url.includes('/traits')) {
      body = { offers: [], next: null };
    } else {
      body = { offers: [collBid], next: null };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.route('**/api.opensea.io/api/v2/chain/*/token/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        address: '0x0779369854d3ecdea927206718ffd7730c67b71f',
        chain: 'robinhood',
        symbol: 'RAREFRIENDS',
        usd_price: MOCK_RF_USD,
      }),
    });
  });
  await page.route('**/api.opensea.io/api/v2/chain/*/payment_token/*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ symbol: 'USDC', usdPrice: '1.0' }),
    });
  });
  // NOTE: no blanket api.opensea.io route — it would shadow the
  // endpoint-specific mocks above (last-registered wins).
  await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: paddedOwner(verifyOwner) }),
    });
  });
}

test.describe('Rare Arcade V2 — Verified NFT + Custom RTP', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test('Creator connects wallet, funds verified NFT, custom 107.5% RTP, publishes, player pulls', async ({
    page,
  }) => {
    await stubWalletAndEndpoints(page, MOCK_WALLET);
    await page.goto('/');
    if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
      await page.click('button:has-text("PLAY ARCADE")');
    }
    await page.locator('nav button:has-text("BUILD MACHINE")').click();
    await expect(page.locator('text=CREATOR WORKSHOP: BUILD A FRIEND MACHINE')).toBeVisible();

    // Connect wallet (stubbed provider)
    await page.click('button:has-text("CONNECT WALLET")');
    await expect(page.locator('text=CONNECTED').first()).toBeVisible();

    const nameInput = page.locator('input[placeholder*="LUCKY SKELETON"]');
    await nameInput.fill('NFT ARCADE');
    await page.click('button:has-text("NEXT: SEED PRIZES")');

    // Open owned NFT inventory (mocked OpenSea + market data)
    await expect(page.locator('text=STEP 2: SEED PRIZE INVENTORY')).toBeVisible();
    await page.click('button:has-text("OPEN OWNED NFT INVENTORY")');
    await expect(page.locator('text=YOUR NFTS (VERIFIED WALLET)')).toBeVisible();
    await expect(page.locator('.friend-card:has-text("Friend #8283")').first()).toBeVisible();
    await expect(page.locator('.friend-card:has-text("Genesis #773")').first()).toBeVisible();

    // Rare Friends are pinned first with market badges.
    await expect(page.locator('text=RARE FRIENDS').first()).toBeVisible();

    // Select Generations NFT + verify ownership on-chain (mocked)
    await page.locator('.friend-card:has-text("Friend #8283") button:has-text("SELECT THIS NFT")').first().click();
    await page.click('button:has-text("VERIFY OWNERSHIP")');
    await expect(page.locator('text=OWNERSHIP VERIFIED').first()).toBeVisible();

    // Automatic top-bid valuation (no manual RF input): $500 / $0.002.
    await expect(page.locator('text=TOP-BID REF').first()).toBeVisible();
    await page.click('button:has-text("CONFIRM & SIMULATE FUNDING")');
    await expect(page.locator('text=CURRENT PRIZES IN MACHINE (1)')).toBeVisible();
    await expect(page.locator('text=VERIFIED OWNED NFT').first()).toBeVisible();

    // Add RF prizes: 10,000 RF x 2
    await page.click('button:has-text("+ ADD RF PRIZE")');
    await expect(page.locator('text=CURRENT PRIZES IN MACHINE (2)')).toBeVisible();
    await page.click('button:has-text("NEXT: SET ECONOMICS")');

    // Economics: 5,000 RF pull + CUSTOM 107.5% RTP
    await expect(page.locator('text=STEP 3: ECONOMICS & LAUNCH')).toBeVisible();
    await page.locator('input[type="number"]').first().fill('5000');
    await page.click('button:has-text("CUSTOM")');
    await page.locator('input[placeholder*="107.5"]').fill('107.5');
    await expect(page.locator('text=CREATOR-SUBSIDIZED MACHINE')).toBeVisible();
    await expect(page.locator('text=OPERATOR MARGIN:')).toBeVisible();

    // Publish (re-verifies ownership via mocked ownerOf)
    await page.click('button:has-text("PUBLISH FRIEND MACHINE")');
    await expect(page.locator('span:has-text("NFT ARCADE")')).toBeVisible();
    await expect(page.locator('text=Friend #8283').first()).toBeVisible();

    // Player pulls: economics update
    const pullBtn = page.locator('button:has-text("PULL — 5,000.00 RF")');
    await expect(pullBtn).toBeEnabled();
    await pullBtn.click();
    await page.waitForTimeout(3400);
    await expect(page.locator('text=PULLS: 49 / 50')).toBeVisible();
    await expect(page.locator('text=LOCKED')).toBeVisible();
  });

  test('Funding blocked when on-chain owner disagrees with wallet', async ({ page }) => {
    await stubWalletAndEndpoints(page, OTHER_OWNER);
    await page.goto('/');
    if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
      await page.click('button:has-text("PLAY ARCADE")');
    }
    await page.locator('nav button:has-text("BUILD MACHINE")').click();
    await page.click('button:has-text("CONNECT WALLET")');
    await expect(page.locator('text=CONNECTED').first()).toBeVisible();
    await page.click('button:has-text("NEXT: SEED PRIZES")');
    await page.click('button:has-text("OPEN OWNED NFT INVENTORY")');
    await expect(page.locator('.friend-card:has-text("Friend #8283")').first()).toBeVisible();
    await page.locator('.friend-card:has-text("Friend #8283") button:has-text("SELECT THIS NFT")').first().click();
    // Verification must fail: chain says OTHER_OWNER.
    await page.click('button:has-text("VERIFY OWNERSHIP")');
    await expect(page.locator('text=OWNERSHIP CHANGED')).toBeVisible();
  });

  test('Creator dashboard syncs wallet-published machines and pull stats', async ({ page }) => {
    await stubWalletAndEndpoints(page, MOCK_WALLET);
    await page.goto('/');
    if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
      await page.click('button:has-text("PLAY ARCADE")');
    }
    // Connect wallet first: the machine will carry the wallet identity.
    await page.locator('nav button:has-text("BUILD MACHINE")').click();
    await page.click('button:has-text("CONNECT WALLET")');
    await expect(page.locator('text=CONNECTED').first()).toBeVisible();

    const nameInput = page.locator('input[placeholder*="LUCKY SKELETON"]');
    await nameInput.fill('DASH SYNC');
    await page.click('button:has-text("NEXT: SEED PRIZES")');
    await page.click('button:has-text("+ ADD RF PRIZE")');
    await page.click('button:has-text("NEXT: SET ECONOMICS")');
    await page.click('button:has-text("PUBLISH FRIEND MACHINE")');
    await expect(page.locator('span:has-text("DASH SYNC")')).toBeVisible();

    // One pull so stats are non-zero (3s animation window).
    await page.locator('button:has-text("PULL —")').click();
    await page.waitForTimeout(3400);

    // Dashboard must list the wallet-published machine with live stats.
    await page.locator('nav button:has-text("CREATOR DASH")').click();
    await expect(page.locator('text=DASH SYNC')).toBeVisible();
    await expect(page.locator('text=TRACKING 1 MACHINE')).toBeVisible();
    await expect(page.locator('td:has-text("1 / 9")')).toBeVisible();
  });

  test('Changed flows fit 360/390/430px without horizontal overflow', async ({ page }) => {
    await stubWalletAndEndpoints(page, MOCK_WALLET);
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await page.goto('/');
      if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
        await page.click('button:has-text("PLAY ARCADE")');
      }
      // Workshop economics with custom RTP + suggestions
      await page.locator('nav button:has-text("BUILD MACHINE")').click();
      await page.click('button:has-text("NEXT: SEED PRIZES")');
      await page.click('button:has-text("+ ADD RF PRIZE")');
      await page.click('button:has-text("NEXT: SET ECONOMICS")');
      await page.click('button:has-text("CUSTOM")');
      await page.locator('input[placeholder*="107.5"]').fill('72.5');
      await page.waitForTimeout(200);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        `overflow at ${width}px (workshop custom RTP)`
      ).toBe(false);

      // NFT drawer grid (jump back to step 1: wallet lives there)
      await page.locator('nav button:has-text("BUILD MACHINE")').click();
      await page.click('button:has-text("1. IDENTITY & SHELL")');
      await page.click('button:has-text("CONNECT WALLET")');
      await page.click('button:has-text("NEXT: SEED PRIZES")');
      await page.click('button:has-text("OPEN OWNED NFT INVENTORY")');
      await expect(page.locator('.friend-card:has-text("Friend #8283")').first()).toBeVisible();
      await page.waitForTimeout(200);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        `overflow at ${width}px (NFT drawer)`
      ).toBe(false);
      await page.keyboard.press('Escape');

      // Machine detail with real NFT
      await page.locator('nav button:has-text("ARCADE FLOOR")').click();
      await page.locator('.cabinet-container:has-text("FRIEND FRENZY")').first().click();
      await page.waitForTimeout(200);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        `overflow at ${width}px (machine detail)`
      ).toBe(false);
    }
  });
});
