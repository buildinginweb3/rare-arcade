// renderPrizePanelScenes.test.ts (vitest)
//
// Renders the HTML prize-reveal panel (PrizeReveal.tsx) to standalone
// HTML files so Playwright can rasterize them for visual QA.
//
// Must run under vitest, not Playwright: Playwright's component
// transform replaces React.createElement with its own element wrapper,
// which cannot be server-rendered.

import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PrizeReveal } from '../PrizeReveal.tsx';
import { parseRF } from '../../../domain/rf.ts';
import type { PullResult } from '../../../domain/types.ts';

const OUT = 'screenshots/pullfx/panel';

const CSS = `
  :root {
    --font-display: monospace;
    --font-lcd: monospace;
    --color-black: #090909;
    --color-white: #FFFFFF;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    min-height: 420px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: monospace;
  }
  .panel { width: 420px; padding: 24px; text-align: center; }
  .paper { background: #F3F1E8; }
  .dark  { background: #090909; color: #F3F1E8; }
  @keyframes rise { from { transform: translateY(10px); opacity: 0 } to { transform: none; opacity: 1 } }
  /*
   * The rise keyframes start at opacity 0, so a static screenshot taken
   * before the animation runs would capture a blank panel. QA renders the
   * SETTLED state and validates the animation itself separately against
   * the live app, so the scene CSS omits the entrance animations.
   */
  /* Neutral stand-in for the NFT bitmap so the frame region is visible. */
  .nft-stub {
    width: 128px; height: 128px; border: 6px solid #090909;
    background:
      repeating-linear-gradient(45deg, #C7C6BE 0 6px, #8C8B84 6px 12px);
    image-rendering: pixelated;
  }
`;

function page(body: string, theme: 'paper' | 'dark') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head>
<body class="${theme}"><div class="panel ${theme}">${body}</div></body></html>`;
}

const rfResult: PullResult = {
  prizeType: 'RF_PRIZE',
  rfWonUnits: parseRF('2500'),
} as PullResult;

const nftResult: PullResult = {
  prizeType: 'FRIEND_PRIZE',
  friendWon: {
    tokenId: 1n,
    name: 'Rare Friend',
    familyName: 'Generations',
    generation: 0,
    collectionName: 'Rare Friends',
    imageUrl: '',
    displayImageUrl: '',
    openseaUrl: '',
  },
} as unknown as PullResult;

const noPrize: PullResult = { prizeType: 'NO_PRIZE' } as PullResult;

/**
 * With no image source, FriendPrizeVisual falls back to its 64x64 pixel
 * sprite, so the artwork renders as a small centered bitmap rather than
 * filling the stage. Substitute a 128x128 pixel-frame stub of the same
 * footprint so QA can confirm the glints sit at the frame corners and
 * never over the artwork body.
 */
function withNftStub(inner: string) {
  const replaced = inner.replace(
    /<div class="rare-friend-sprite-container[^"]*"[^>]*>/g,
    '<div data-testid="nft-art" class="nft-stub" role="img" aria-label="NFT artwork">',
  );
  if (!replaced.includes('data-testid="nft-art"')) {
    throw new Error('NFT sprite container not found; stub injection needs updating');
  }
  return replaced;
}

it('renders prize-reveal panel QA scenes to HTML', () => {
  mkdirSync(OUT, { recursive: true });
  const written: string[] = [];
  const write = (name: string, body: string, theme: 'paper' | 'dark') => {
    writeFileSync(`${OUT}/${name}.html`, page(body, theme));
    written.push(name);
  };

  // Pin the shine to 300ms local time (the full-shine frame) so the NFT
  // overlay renders its complete three-tone burst in static markup.
  const SHINE_T = 300;

  // $RF reveals: the coin must render clean on both backgrounds (no shine overlay).
  for (const theme of ['paper', 'dark'] as const) {
    write(
      `rf-reveal-${theme}`,
      renderToStaticMarkup(
        React.createElement(PrizeReveal, { result: rfResult, shellId: 'MINI', __testShineTime: SHINE_T }),
      ),
      theme,
    );
  }

  // NFT reveals: swap the art for a visible stub so the frame region reads.
  for (const theme of ['paper', 'dark'] as const) {
    const html = renderToStaticMarkup(
      React.createElement(PrizeReveal, { result: nftResult, shellId: 'MINI', __testShineTime: SHINE_T }),
    );
    write(`nft-reveal-${theme}`, withNftStub(html), theme);
  }

  // No-prize: no shine overlay anywhere.
  write('noprize', renderToStaticMarkup(React.createElement(PrizeReveal, { result: noPrize, shellId: 'MINI' })), 'paper');

  expect(written).toHaveLength(5);
});
