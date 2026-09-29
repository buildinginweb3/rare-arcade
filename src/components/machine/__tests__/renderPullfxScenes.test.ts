// renderPullfxScenes.test.ts (vitest)
//
// Renders every pull-FX QA frame to a standalone SVG file with a
// pinned virtual time, so screenshot QA is fully deterministic (no rAF
// dependency, no timing flake).
//
// Run via vitest, NOT the Playwright runner: Playwright's component
// transform replaces React.createElement with its own element wrapper,
// which cannot be server-rendered.

import { it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  PixelPullFx,
  type PullFxResultKind,
  type PullFxShell,
} from '../PixelPullFx.tsx';
import { PixelShine, RevealShine } from '../PixelShine.tsx';

const OUT = 'screenshots/pullfx/svg';
const PAPER = '#F3F1E8';
const INK = '#090909';

function wrap(bg: string, body: string) {
  // Fixed pixel size (not %) so rasterized QA shots are exactly 768x576
  // with a clean 6x integer scale factor and no subpixel drift.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="576" viewBox="0 0 128 96" shape-rendering="crispEdges" style="image-rendering:pixelated;display:block">
<rect x="0" y="0" width="128" height="96" fill="${bg}"/>
${body}
</svg>`;
}

function scene(shell: PullFxShell, kind: PullFxResultKind, t: number, bg = PAPER) {
  const html = renderToStaticMarkup(
    React.createElement(PixelPullFx, {
      shell,
      active: false,
      runId: 1,
      resultKind: kind,
      onComplete: () => undefined,
      __testTime: t,
    } as never),
  );
  return wrap(bg, html.slice(html.indexOf('<svg'), html.lastIndexOf('</svg>') + 6).replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, ''));
}

const MINI: [string, PullFxShell, PullFxResultKind, number][] = [
  ['01-mini-all-spinning', 'mini', 'empty', 1200],
  ['02-mini-reel1-stopped', 'mini', 'empty', 1750],
  ['03-mini-reel2-stopped', 'mini', 'empty', 2050],
  ['04-mini-all-stopped', 'mini', 'empty', 2330],
  ['05-mini-rf-result', 'mini', 'rf', 2600],
  ['06-mini-nft-result', 'mini', 'nft', 2600],
  ['07-mini-empty-result', 'mini', 'empty', 2600],
];

const SHINE: [string, PullFxShell, PullFxResultKind, number, string][] = [
  ['08-shine-on-dark', 'capsule', 'rf', 2700, INK],
  ['09-shine-on-paper', 'capsule', 'rf', 2700, PAPER],
  ['10-nft-reveal', 'mini', 'nft', 2730, PAPER],
  ['11-capsule-reveal', 'capsule', 'rf', 2700, PAPER],
  ['12-prize-drum-reveal', 'classic', 'rf', 2525, PAPER],
  ['13-tallboy-reveal', 'tallboy', 'nft', 3030, PAPER],
  ['14-mini-reveal', 'mini', 'rf', 2730, PAPER],
];

const ANIM: [string, number][] = [
  ['a-glint', 50],
  ['b-medium', 160],
  ['c-full', 300],
  ['d-medium-out', 430],
];

it('renders all pull FX QA scenes to SVG', () => {
  mkdirSync(OUT, { recursive: true });
  const written: string[] = [];
  const write = (name: string, svg: string) => {
    writeFileSync(`${OUT}/${name}.svg`, svg);
    written.push(name);
  };

  for (const [name, shell, kind, t] of MINI) write(name, scene(shell, kind, t));
  for (const [name, shell, kind, t, bg] of SHINE) write(name, scene(shell, kind, t, bg));

  // Full frame on both backgrounds: proves gray depth survives either way.
  const full = renderToStaticMarkup(React.createElement(PixelShine, { x: 50, y: 38, scale: 2, frame: 2 }));
  write('shine-frame2-on-dark', wrap(INK, full));
  write('shine-frame2-on-paper', wrap(PAPER, full));

  // Animation stages.
  for (const [name, t] of ANIM) {
    const inner = renderToStaticMarkup(
      React.createElement(RevealShine, { time: t, start: 0, x: 52, y: 40, scale: 2 }),
    );
    write(`shine-anim-${name}`, wrap(PAPER, inner));
  }

  // Shell identity frames (no nested machine, correct ritual per shell).
  write('shell-classic-drum', scene('classic', 'empty', 1200));
  write('shell-capsule-shake', scene('capsule', 'empty', 1500));
  write('shell-tallboy-claw', scene('tallboy', 'empty', 2000));

  // No-prize quiet states for every shell (no shine).
  write('noprize-classic', scene('classic', 'empty', 2400));
  write('noprize-capsule', scene('capsule', 'empty', 2700));
  write('noprize-tallboy', scene('tallboy', 'empty', 3030));
  write('noprize-mini', scene('mini', 'empty', 2600));

  expect(written.length).toBe(MINI.length + SHINE.length + 2 + ANIM.length + 3 + 4);
});
