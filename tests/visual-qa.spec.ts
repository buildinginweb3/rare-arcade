import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

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

function paddedOwner(address: string): string {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}`;
}

test.describe('Rare Arcade — Visual QA Screenshot Capture', () => {
  const screenshotsDir = path.resolve('screenshots');

  test.beforeAll(() => {
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
  });

  test('Capture V1 Visual QA Screenshots (new RF scale)', async ({ page }) => {
    // 01-home
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, '01-home.png') });

    // 02-arcade-floor (higher RF prices, SYSTEM DEMO badges)
    await page.click('button:has-text("PLAY ARCADE")');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '02-arcade-floor.png') });

    // 03-machine-detail (real NFT art: Friend #8283)
    await page.locator('.cabinet-container:has-text("FRIEND FRENZY")').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '03-machine-detail.png') });

    // 04-odds (actual NFT in prize table)
    await page.locator('.cabinet-controls button:has-text("ODDS")').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '04-odds.png') });
    await page.click('button:has-text("CLOSE")');

    // 05-pull-start & 06-burn-animation (5,000 RF pull)
    await page.click('button:has-text("PULL — 5,000.00 RF")');
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(screenshotsDir, '05-pull-start.png') });
    await page.waitForTimeout(250);
    await page.screenshot({ path: path.join(screenshotsDir, '06-burn-animation.png') });

    // Wait for pull to complete (3s animation window)
    await page.waitForTimeout(3400);
    await page.screenshot({ path: path.join(screenshotsDir, '07-rf-win.png') });

    // 08: real NFT prize pool
    await page.locator('.cabinet-controls button:has-text("PRIZES")').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '08-friend-win.png') });
    await page.click('button:has-text("CLOSE")');

    // Rules modal
    await page.locator('.cabinet-controls button:has-text("RULES")').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '09-no-prize.png') });
    await page.click('button:has-text("CLOSE")');

    // 10-create-prizes (high RF prize builder)
    await page.locator('nav button:has-text("BUILD MACHINE")').click();
    await page.waitForTimeout(300);
    await page.click('button:has-text("NEXT: SEED PRIZES")');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '10-create-prizes.png') });

    // 11-create-economics (presets + CUSTOM) & 12-create-preview
    await page.click('button:has-text("+ ADD RF PRIZE")');
    await page.click('button:has-text("NEXT: SET ECONOMICS")');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '11-create-economics.png') });
    // Custom 110% RTP warning state
    await page.click('button:has-text("CUSTOM")');
    await page.locator('input[placeholder*="107.5"]').fill('110');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '12-create-preview.png') });

    // 13-creator-dashboard
    await page.locator('nav button:has-text("CREATOR DASH")').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '13-creator-dashboard.png') });

    // 14-activity
    await page.locator('nav button:has-text("RF ACTIVITY")').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '14-activity.png') });

    // 15: inventory (simulated wins)
    await page.locator('nav button:has-text("MY PRIZES")').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '15-sold-out.png') });

    // 16-mobile-arcade
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('nav button:has-text("ARCADE FLOOR")').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '16-mobile-arcade.png') });

    // 17-mobile-machine
    await page.locator('.cabinet-container:has-text("RF RAIN")').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '17-mobile-machine.png') });

    // 18-mobile-create
    await page.locator('nav button:has-text("BUILD MACHINE")').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '18-mobile-create.png') });
  });

  test('Capture V2 NFT + Custom RTP Screenshots (mocked wallet/endpoints)', async ({ page }) => {    await page.addInitScript((wallet: string) => {
      (window as unknown as Record<string, unknown>).ethereum = {
        request: async (args: { method: string }) => {
          if (args.method === 'eth_requestAccounts') return [wallet];
          return null;
        },
        on: () => undefined,
        removeListener: () => undefined,
      };
    }, MOCK_WALLET);
    await page.route('**/api.opensea.io/api/v2/chains*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chains: [{ chain: 'robinhood', name: 'Robinhood' }] }) });
    });
    await page.route('**/api.opensea.io/api/v2/chain/*/account/*/nfts*', async (route) => {
      const __u = route.request().url();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(__u.includes('/chain/robinhood/') ? { nfts: MOCK_NFTS, next: null } : { nfts: [], next: null }) });
    });
    await page.route('**/api.opensea.io/api/v2/offers/collection/**', async (route) => {
      const __o = route.request().url();
      const __collBid = { status: 'ACTIVE', chain: 'robinhood', order_hash: '0xmock', asset: { contract: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d', identifier: null }, criteria: { collection: { slug: 'rare-friends-generations' }, contract: { address: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d' }, traits: null, numeric_traits: null }, price: { currency: 'USDC', decimals: 6, value: '500000000' }, protocol_data: { parameters: { offer: [], consideration: [] } }, remaining_quantity: 1 };
      let __body: unknown;
      if (__o.includes('/traits')) { __body = { offers: [], next: null }; }
      else { __body = { offers: [__collBid], next: null }; }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(__body) });
    });
    await page.route('**/api.opensea.io/api/v2/chain/*/token/*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ address: '0x0779369854d3ecdea927206718ffd7730c67b71f', chain: 'robinhood', symbol: 'RAREFRIENDS', usd_price: '0.002' }) });
    });
    await page.route('**/api.opensea.io/api/v2/chain/*/payment_token/*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ symbol: 'USDC', usdPrice: '1.0' }) });
    });
    // NOTE: no blanket api.opensea.io route — it would shadow endpoint mocks.
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: paddedOwner(MOCK_WALLET) }),
      });
    });

    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.goto('/');
    if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
      await page.click('button:has-text("PLAY ARCADE")');
    }
    await page.locator('nav button:has-text("BUILD MACHINE")').click();
    await page.click('button:has-text("CONNECT WALLET")');
    await expect(page.locator('text=CONNECTED').first()).toBeVisible();
    await page.click('button:has-text("NEXT: SEED PRIZES")');

    // 19: connected-wallet NFT inventory (ALL/GENESIS/GENERATIONS)
    await page.click('button:has-text("OPEN OWNED NFT INVENTORY")');
    await expect(page.locator('.friend-card:has-text("Friend #8283")').first()).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '19-nft-inventory.png') });

    // 20: Genesis tab card
    await page.click('button:has-text("RARE FRIENDS")');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '20-genesis-card.png') });

    // 21: select + verify + reference value
    // Rare Friends pinned section (no per-type tabs in the generalized picker)
    await page.locator('.friend-card:has-text("Friend #8283") button:has-text("SELECT THIS NFT")').first().click();
    await page.click('button:has-text("VERIFY OWNERSHIP")');
    await expect(page.locator('text=OWNERSHIP VERIFIED').first()).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '21-nft-verify.png') });

    // Fund (automatic top-bid valuation) + add RF, go to economics
    await page.click('button:has-text("CONFIRM & SIMULATE FUNDING")');
    await page.click('button:has-text("+ ADD RF PRIZE")');
    await page.click('button:has-text("NEXT: SET ECONOMICS")');

    // 22: custom 72.5% RTP state
    await page.locator('input[type="number"]').first().fill('5000');
    await page.click('button:has-text("CUSTOM")');
    await page.locator('input[placeholder*="107.5"]').fill('72.5');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '22-custom-725.png') });

    // 23: custom 110% subsidized warning
    await page.locator('input[placeholder*="107.5"]').fill('110');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '23-custom-110-warning.png') });

    // Publish → 24: machine with actual NFT art
    await page.click('button:has-text("PUBLISH FRIEND MACHINE")');
    await expect(page.locator('span:has-text("FRIEND FRENZY")').first()).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '24-nft-machine.png') });

    // 25: mobile custom RTP + 26: mobile machine view
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('nav button:has-text("BUILD MACHINE")').click();
    await page.click('button:has-text("NEXT: SEED PRIZES")');
    await page.click('button:has-text("+ ADD RF PRIZE")');
    await page.click('button:has-text("NEXT: SET ECONOMICS")');
    await page.click('button:has-text("CUSTOM")');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '25-mobile-custom-rtp.png') });
    await page.locator('nav button:has-text("ARCADE FLOOR")').click();
    await page.locator('.cabinet-container:has-text("FRIEND FRENZY")').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '26-mobile-machine.png') });
  });

  test('Capture Fixed Odds Screenshots (mocked wallet/endpoints)', async ({ page }) => {
    await page.addInitScript((wallet: string) => {
      (window as unknown as Record<string, unknown>).ethereum = {
        request: async (args: { method: string }) => {
          if (args.method === 'eth_requestAccounts') return [wallet];
          return null;
        },
        on: () => undefined,
        removeListener: () => undefined,
      };
    }, MOCK_WALLET);
    await page.route('**/api.opensea.io/api/v2/chains*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ chains: [{ chain: 'robinhood', name: 'Robinhood' }] }) });
    });
    await page.route('**/api.opensea.io/api/v2/chain/*/account/*/nfts*', async (route) => {
      const __u = route.request().url();
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(__u.includes('/chain/robinhood/') ? { nfts: MOCK_NFTS, next: null } : { nfts: [], next: null }) });
    });
    await page.route('**/api.opensea.io/api/v2/offers/collection/**', async (route) => {
      const __o = route.request().url();
      const __collBid = { status: 'ACTIVE', chain: 'robinhood', order_hash: '0xmock', asset: { contract: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d', identifier: null }, criteria: { collection: { slug: 'rare-friends-generations' }, contract: { address: '0x14c49e6118f46525de9ab41a51cbaa3c6ebf181d' }, traits: null, numeric_traits: null }, price: { currency: 'USDC', decimals: 6, value: '5000000' }, protocol_data: { parameters: { offer: [], consideration: [] } }, remaining_quantity: 1 };
      let __body: unknown;
      if (__o.includes('/traits')) { __body = { offers: [], next: null }; }
      else { __body = { offers: [__collBid], next: null }; }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(__body) });
    });
    await page.route('**/api.opensea.io/api/v2/chain/*/token/*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ address: '0x0779369854d3ecdea927206718ffd7730c67b71f', chain: 'robinhood', symbol: 'RAREFRIENDS', usd_price: '0.002' }) });
    });
    await page.route('**/api.opensea.io/api/v2/chain/*/payment_token/*', async (route) => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ symbol: 'USDC', usdPrice: '1.0' }) });
    });
    // NOTE: no blanket api.opensea.io route — it would shadow endpoint mocks.
    await page.route('**/rpc.mainnet.chain.robinhood.com/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, result: paddedOwner(MOCK_WALLET) }),
      });
    });

    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto('/');
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();
    await page.goto('/');
    if (await page.locator('button:has-text("PLAY ARCADE")').isVisible()) {
      await page.click('button:has-text("PLAY ARCADE")');
    }
    await page.locator('nav button:has-text("BUILD MACHINE")').click();

    // 27: machine type selection
    await page.locator('input[placeholder*="LUCKY SKELETON"]').fill('ODDS QA');
    await page.locator('[data-testid="machine-type-fixed_odds"]').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '27-type-select.png') });

    // 28: fixed builder with odds inputs
    await page.click('button:has-text("NEXT: SEED PRIZES")');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '28-fixed-builder.png') });

    // 29: prize table with configured odds
    await page.click('button:has-text("+ ADD RF PRIZE")');
    await page.locator('input[type="number"]').first().fill('25000');
    await page.locator('input[type="number"]').nth(1).fill('10');
    await page.locator('input[type="number"]').nth(2).fill('2');
    await page.click('button:has-text("+ ADD RF PRIZE")');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '29-fixed-prize-table.png') });

    // 30: fixed economics (manual odds)
    await page.click('button:has-text("NEXT: SET ECONOMICS")');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '30-fixed-economics.png') });

    // 31: risk model open
    await page.click('button:has-text("VIEW RISK MODEL")');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, '31-risk-model.png') });

    // Publish RF-only fixed machine, 32: player view, 33: mid-pull.
    await page.click('button:has-text("PUBLISH FRIEND MACHINE")');
    await expect(page.locator('text=FIXED ODDS').first()).toBeVisible();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '32-fixed-player-view.png') });
    await page.locator('button:has-text("PULL —")').click();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(screenshotsDir, '33-fixed-pull.png') });
    await page.waitForTimeout(3000);

    // Deterministic 100% NFT machine for the sold-out slot + report shots.
    await page.locator('nav button:has-text("BUILD MACHINE")').click();
    await page.locator('input[placeholder*="LUCKY SKELETON"]').fill('QA ONESHOT');
    await page.locator('[data-testid="machine-type-fixed_odds"]').click();
    await page.click('button:has-text("CONNECT WALLET")');
    await expect(page.locator('text=CONNECTED').first()).toBeVisible();
    await page.click('button:has-text("NEXT: SEED PRIZES")');
    await page.click('button:has-text("OPEN OWNED NFT INVENTORY")');
    await expect(page.locator('.friend-card:has-text("Friend #8283")').first()).toBeVisible();
    await page.locator('.friend-card:has-text("Friend #8283") button:has-text("SELECT THIS NFT")').first().click();
    await page.click('button:has-text("VERIFY OWNERSHIP")');
    await expect(page.locator('text=OWNERSHIP VERIFIED').first()).toBeVisible();
    await expect(page.locator('text=TOP-BID REF').first()).toBeVisible();
    const drawerOdds = page.locator('.pixel-box:has-text("CONFIRM & SIMULATE FUNDING") input[aria-label="Custom odds percent for Rare Friend prize"]');
    await drawerOdds.fill('100');
    await page.click('button:has-text("CONFIRM & SIMULATE FUNDING")');
    await page.click('button:has-text("NEXT: SET ECONOMICS")');
    await page.click('button:has-text("PUBLISH FRIEND MACHINE")');
    await expect(page.locator('span:has-text("QA ONESHOT")')).toBeVisible();
    await page.locator('button:has-text("PULL —")').click();
    await page.waitForTimeout(3400);

    // 34: sold-out slot keeps its configured chance.
    await page.locator('.cabinet-controls button:has-text("ODDS")').click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '34-soldout-slot.png') });
    await page.click('button:has-text("CLOSE")');

    // 35: creator dashboard with a Fixed Odds row.
    await page.locator('nav button:has-text("CREATOR DASH")').click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(screenshotsDir, '35-fixed-dashboard.png') });

    // 36: sold-out report on the machine.
    await page.locator('nav button:has-text("ARCADE FLOOR")').click();
    await page.locator('.cabinet-container:has-text("QA ONESHOT")').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '36-fixed-soldout.png') });

    // 37/38: mobile fixed builder + machine.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('nav button:has-text("BUILD MACHINE")').click();
    await page.locator('[data-testid="machine-type-fixed_odds"]').click();
    await page.click('button:has-text("NEXT: SEED PRIZES")');
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '37-mobile-fixed-builder.png') });
    await page.locator('nav button:has-text("ARCADE FLOOR")').click();
    await page.locator('.cabinet-container:has-text("FRIEND FOREVER")').first().click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(screenshotsDir, '38-mobile-fixed-machine.png') });
  });
});
