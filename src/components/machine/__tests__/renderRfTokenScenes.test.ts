// renderRfTokenScenes.test.ts (vitest)
//
// Renders the canonical $RF token to standalone SVG at every QA size and
// in each real app context (Top Chase, normal prize, player balance,
// creator balance) so screenshot QA is deterministic.
//
// Must run under vitest: Playwright's component transform replaces
// React.createElement and cannot server-render.

import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RfTokenIcon } from '../../ui/RfTokenIcon.tsx';

const OUT = 'screenshots/rftoken/svg';
const PAPER = '#F3F1E8';
const INK = '#090909';
const LCD = '#f5f5ee';

/** The token's own SVG, re-scaled to an exact pixel size. */
function token(size: number) {
  return renderToStaticMarkup(React.createElement(RfTokenIcon, { size, decorative: true }))
    .replace(/^<svg /, '<svg ')
    .replace('<svg ', `<svg data-token="${size}" `);
}

/** Crisp, integer-scaled backdrop so pixels stay square. */
function stage(px: number, bg: string, body: string, pad = 0) {
  const w = px + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${w}" viewBox="0 0 ${w} ${w}" shape-rendering="crispEdges" style="image-rendering:pixelated;display:block">
<rect x="0" y="0" width="${w}" height="${w}" fill="${bg}"/>
<g transform="translate(${pad} ${pad})">${body}</g>
</svg>`;
}

const SIZES = [24, 32, 48, 64, 96, 112, 128, 144, 20] as const;

it('renders $RF token QA scenes to SVG', () => {
  mkdirSync(OUT, { recursive: true });
  const written: string[] = [];
  const write = (name: string, svg: string) => {
    writeFileSync(`${OUT}/${name}.svg`, svg);
    written.push(name);
  };

  // 1-6: the token alone on warm paper, at each QA size.
  for (const size of SIZES) {
    write(`size-${String(size).padStart(3, '0')}`, stage(size, PAPER, token(size)));
  }

  // 7: as a normal RF prize (the LCD prize panel treatment).
  write(
    'ctx-normal-prize',
    stage(144, LCD, `
      <rect x="0" y="0" width="144" height="144" fill="${LCD}"/>
      <rect x="4" y="4" width="136" height="136" fill="none" stroke="${INK}" stroke-width="4"/>
      <g transform="translate(24 24)">${token(96)}</g>
    `),
  );

  // 8: as TOP CHASE (the 112px cabinet treatment).
  write(
    'ctx-top-chase',
    stage(144, INK, `
      <rect x="0" y="0" width="144" height="144" fill="${INK}"/>
      <g transform="translate(16 16)">${token(112)}</g>
    `),
  );

  // 9: beside a player balance number.
  write(
    'ctx-player-balance',
    stage(144, PAPER, `
      <rect x="0" y="0" width="144" height="144" fill="${PAPER}"/>
      <g transform="translate(10 62)">${token(20)}</g>
      <g fill="${INK}" font-family="monospace" font-size="18" font-weight="bold">
        <text x="40" y="78">12,480.00</text>
        <text x="40" y="96" font-size="12">RAREFRIENDS</text>
      </g>
    `),
  );

  // 10: beside a creator balance number, on the dark header.
  write(
    'ctx-creator-balance',
    stage(144, INK, `
      <rect x="0" y="0" width="144" height="144" fill="${INK}"/>
      <g transform="translate(10 62)">${token(20)}</g>
      <g fill="${PAPER}" font-family="monospace" font-size="18" font-weight="bold">
        <text x="40" y="78">3,010.00</text>
        <text x="40" y="96" font-size="12">CREATOR</text>
      </g>
    `),
  );

  // A side-by-side size ladder for judging material consistency.
  const ladder = [20, 24, 32, 48, 64, 96, 128, 144];
  let x = 8;
  const row = ladder
    .map((size) => {
      const el = `<g transform="translate(${x} 8)">${token(size)}</g>`;
      x += size + 8;
      return el;
    })
    .join('');
  write('ladder', stage(x + 8, PAPER, row));

  expect(written).toHaveLength(SIZES.length + 4 + 1);
});
