/**
 * Fixed Odds E2E: second machine model with fully mocked wallet + endpoints.
 * - window.ethereum stubbed (read-only connect, no real wallet)
 * - api.opensea.io (raw v2 shape) + Robinhood RPC intercepted with fixtures
 * No live OpenSea/RPC calls, no secrets, no transactions.
 */
import { test, expect, type Page } from '@playwright/test';

const MOCK_WALLET = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

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

// Automatic valuation fixtures: top bid $5 + RF $0.002 → 2,500 RF ref.
const MOCK_TOP_BID_USD = '5';
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
      price: { currency: 'USDC', decimals: 6, value: '5000000' },
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

async function dismissOnboarding(page: Page): Promise<void> {
  if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
    await page.click('button:has-text("PLAY ARCADE")');
  }
}

test.describe('Rare Arcade — Fixed Odds Model', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
  });

  test('Create Fixed Odds machine, assist RTP, risk model, publish, pull, odds stay fixed', async ({
    page,
  }) => {
    await stubWalletAndEndpoints(page, MOCK_WALLET);
    await page.goto('/');
    await dismissOnboarding(page);
    await page.locator('nav button:has-text("BUILD MACHINE")').click();
    await expect(page.locator('text=CREATOR WORKSHOP: BUILD A FRIEND MACHINE')).toBeVisible();

    // Step 1: name + conscious model choice (not hidden in advanced settings).
    const nameInput = page.locator('input[placeholder*="LUCKY SKELETON"]');
    await nameInput.fill('ODDS ARCADE');
    await page.locator('[data-testid="machine-type-fixed_odds"]').click();
    await expect(page.locator('text=No play limit.')).toBeVisible();
    await page.click('button:has-text("NEXT: SEED PRIZES")');

    // Step 2: RF prizes with per-line fixed odds.
    await expect(page.locator('text=STEP 2: SEED PRIZE INVENTORY')).toBeVisible();
    await page.click('button:has-text("+ ADD RF PRIZE")');
    await expect(page.locator('text=CURRENT PRIZES IN MACHINE (1)')).toBeVisible();

    await page.locator('input[type="number"]').first().fill('5000');
    await page.locator('input[type="number"]').nth(1).fill('10');
    await page.locator('input[type="number"]').nth(2).fill('4');
    await page.click('button:has-text("+ ADD RF PRIZE")');
    await expect(page.locator('text=CURRENT PRIZES IN MACHINE (2)')).toBeVisible();
    await expect(page.locator('text=TOTAL PRIZE ODDS')).toBeVisible();
    await expect(page.locator('text=NO-PRIZE:')).toBeVisible();

    await page.click('button:has-text("NEXT: SET ECONOMICS")');

    // Step 3: manual odds show live configured RTP (10,000×1% + 5,000×4% = 300 RF on 2,500 = 12%).
    await expect(page.locator('text=STEP 3: ECONOMICS & LAUNCH')).toBeVisible();
    await expect(page.locator('text=CONFIGURED RTP')).toBeVisible();
    await expect(page.locator('text=12.00%').first()).toBeVisible();

    // Target RTP assist proposes odds near 80%.
    await page.click('button:has-text("TARGET RTP")');
    await page.locator('input[aria-label="Assist target RTP percent"]').fill('80');
    await page.click('button:has-text("APPLY SUGGESTED ODDS")');
    await expect(page.locator('text=Suggested odds reach')).toBeVisible();

    // Risk model behind an explicit toggle.
    await page.click('button:has-text("VIEW RISK MODEL")');
    await expect(page.locator('text=MEDIAN PULLS TO SELLOUT')).toBeVisible();

    // Publish → Fixed Odds player view (no ticket counter).
    await page.click('button:has-text("PUBLISH FRIEND MACHINE")');
    await expect(page.locator('span:has-text("ODDS ARCADE")')).toBeVisible();
    await expect(page.locator('text=FIXED ODDS').first()).toBeVisible();
    await expect(page.locator('text=PULLS MADE: 0')).toBeVisible();

    // Fixed odds table with effective no-prize breakdown + explainer.
    await page.locator('.cabinet-controls button:has-text("ODDS")').click();
    await expect(page.locator('text=FIXED ODDS — ODDS ARCADE')).toBeVisible();
    await expect(page.locator('text=SAME ODDS EVERY PULL')).toBeVisible();
    await expect(page.locator('text=EFFECTIVE NO-PRIZE ODDS:')).toBeVisible();
    await page.click('button:has-text("CLOSE")');

    // Pull: economics update, inventory records the pull.
    await page.locator('button:has-text("PULL —")').click();
    await page.waitForTimeout(3400);
    await expect(page.locator('text=PULLS MADE: 1')).toBeVisible();
    await page.locator('nav button:has-text("MY PRIZES")').click();
    await expect(page.locator('text=MY PULL HISTORY (1)')).toBeVisible();
  });

  test('Sold-out NFT slot becomes an empty outcome; other odds unchanged', async ({ page }) => {
    await stubWalletAndEndpoints(page, MOCK_WALLET);
    await page.goto('/');
    await dismissOnboarding(page);
    await page.locator('nav button:has-text("BUILD MACHINE")').click();

    const nameInput = page.locator('input[placeholder*="LUCKY SKELETON"]');
    await nameInput.fill('ONE SHOT');
    await page.locator('[data-testid="machine-type-fixed_odds"]').click();
    await page.click('button:has-text("CONNECT WALLET")');
    await expect(page.locator('text=CONNECTED').first()).toBeVisible();
    await page.click('button:has-text("NEXT: SEED PRIZES")');

    // Fund the NFT at 100% fixed odds (auto 2,500 RF ref → 100% RTP on 2,500 pull).
    await page.click('button:has-text("OPEN OWNED NFT INVENTORY")');
    await expect(page.locator('.friend-card:has-text("Friend #8283")').first()).toBeVisible();
    await page.locator('.friend-card:has-text("Friend #8283") button:has-text("SELECT THIS NFT")').first().click();
    await page.click('button:has-text("VERIFY OWNERSHIP")');
    await expect(page.locator('text=OWNERSHIP VERIFIED').first()).toBeVisible();
    await expect(page.locator('text=TOP-BID REF').first()).toBeVisible();
    const drawerOdds = page.locator('.pixel-box:has-text("CONFIRM & SIMULATE FUNDING") input[aria-label="Custom odds percent for Rare Friend prize"]');
    await drawerOdds.fill('100');
    await page.click('button:has-text("CONFIRM & SIMULATE FUNDING")');
    await expect(page.locator('text=CURRENT PRIZES IN MACHINE (1)')).toBeVisible();

    await page.click('button:has-text("NEXT: SET ECONOMICS")');
    await expect(page.locator('text=100.00%').first()).toBeVisible();
    await page.click('button:has-text("PUBLISH FRIEND MACHINE")');
    await expect(page.locator('span:has-text("ONE SHOT")')).toBeVisible();

    // The single 100% pull must award the NFT and end the machine.
    await page.locator('button:has-text("PULL —")').click();
    await page.waitForTimeout(3400);
    await expect(page.locator('text=SIMULATED WIN')).toBeVisible();
    await expect(page.locator('button:has-text("SOLD OUT")').first()).toBeDisabled();

    // Sold-out slot keeps its 100% configured chance; effective no-prize is 100%.
    await page.locator('.cabinet-controls button:has-text("ODDS")').click();
    await expect(page.locator('text=SOLD OUT — 100% SLOT')).toBeVisible();
    await expect(page.locator('text=EFFECTIVE NO-PRIZE ODDS:')).toBeVisible();
    await page.click('button:has-text("CLOSE")');

    // Prize pool shows the exhausted NFT.
    await page.locator('.cabinet-controls button:has-text("PRIZES")').click();
    await expect(page.locator('text=SOLD OUT').first()).toBeVisible();
    await page.click('button:has-text("CLOSE")');
  });

  test('Multi-select adds one prize line per NFT at full odds (never split)', async ({ page }) => {
    await stubWalletAndEndpoints(page, MOCK_WALLET);
    await page.goto('/');
    await dismissOnboarding(page);
    await page.locator('nav button:has-text("BUILD MACHINE")').click();

    const nameInput = page.locator('input[placeholder*="LUCKY SKELETON"]');
    await nameInput.fill('MULTI SHOT');
    await page.locator('[data-testid="machine-type-fixed_odds"]').click();
    await page.click('button:has-text("CONNECT WALLET")');
    await expect(page.locator('text=CONNECTED').first()).toBeVisible();
    await page.click('button:has-text("NEXT: SEED PRIZES")');

    // Select TWO NFTs: each toggle adds to the staging batch.
    await page.click('button:has-text("OPEN OWNED NFT INVENTORY")');
    await expect(page.locator('.friend-card:has-text("Friend #8283")').first()).toBeVisible();
    await page.locator('.friend-card:has-text("Friend #8283") button:has-text("SELECT THIS NFT")').first().click();
    await page.locator('.friend-card:has-text("Genesis #773") button:has-text("SELECT THIS NFT")').first().click();
    await expect(page.locator('text=SELECTED (2)').first()).toBeVisible();

    // Floating review button appears once at least one NFT is selected.
    const reviewBtn = page.locator('button:has-text("REVIEW 2 SELECTED")');
    await expect(reviewBtn).toBeVisible();
    await reviewBtn.click();
    await expect(page.locator('button:has-text("CONFIRM & SIMULATE FUNDING")').first()).toBeVisible();

    await page.click('button:has-text("VERIFY OWNERSHIP")');
    await expect(page.locator('text=OWNERSHIP VERIFIED').first()).toBeVisible();
    const drawerOdds = page.locator('.pixel-box:has-text("CONFIRM & SIMULATE FUNDING") input[aria-label="Custom odds percent for Rare Friend prize"]');
    await drawerOdds.fill('1');
    await page.click('button:has-text("CONFIRM & SIMULATE FUNDING")');
    await expect(page.locator('text=CURRENT PRIZES IN MACHINE (2)')).toBeVisible();

    // 2 lines × 2,500 RF @ 1% on a 2,500 pull = 2.00% configured (not 1%).
    await page.click('button:has-text("NEXT: SET ECONOMICS")');
    await expect(page.locator('text=2.00%').first()).toBeVisible();
    await page.click('button:has-text("PUBLISH FRIEND MACHINE")');
    await expect(page.locator('span:has-text("MULTI SHOT")')).toBeVisible();
    await expect(page.locator('text=Friend #8283').first()).toBeVisible();
    await expect(page.locator('text=Genesis #773').first()).toBeVisible();
  });

  test('Fixed Odds flows fit 360/390/430px without horizontal overflow', async ({ page }) => {
    await stubWalletAndEndpoints(page, MOCK_WALLET);
    for (const width of [360, 390, 430]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/');
      await page.evaluate(() => window.localStorage.clear());
      await page.reload();
      await page.goto('/');
      await dismissOnboarding(page);
      const overflow = () =>
        page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

      // Fixed builder: type selector + odds editor.
      await page.locator('nav button:has-text("BUILD MACHINE")').click();
      await page.locator('[data-testid="machine-type-fixed_odds"]').click();
      await expect(page.locator('text=No play limit.')).toBeVisible();
      await page.click('button:has-text("NEXT: SEED PRIZES")');
      await page.click('button:has-text("+ ADD RF PRIZE")');
      await page.waitForTimeout(200);
      expect(await overflow(), `overflow at ${width}px (fixed builder)`).toBe(false);

      // Fixed economics: mode toggle + summary + risk model.
      await page.click('button:has-text("NEXT: SET ECONOMICS")');
      await page.click('button:has-text("TARGET RTP")');
      await page.waitForTimeout(200);
      expect(await overflow(), `overflow at ${width}px (fixed economics)`).toBe(false);

      // Seeded fixed machine detail + odds table.
      await page.locator('nav button:has-text("ARCADE FLOOR")').click();
      await page.locator('.cabinet-container:has-text("FRIEND FOREVER")').first().click();
      await page.locator('.cabinet-controls button:has-text("ODDS")').click();
      await page.waitForTimeout(200);
      expect(await overflow(), `overflow at ${width}px (fixed odds table)`).toBe(false);
      await page.click('button:has-text("CLOSE")');
      await page.waitForTimeout(200);
      expect(await overflow(), `overflow at ${width}px (fixed machine)`).toBe(false);
    }
  });
});
