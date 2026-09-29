import React from 'react';
import type { PullResult } from '../../domain/types.ts';
import { formatRFGrouped } from '../../domain/rf.ts';
import { RfTokenIcon } from '../ui/RfTokenIcon.tsx';
import { PixelIcon } from '../ui/PixelIcon.tsx';
import { FriendPrizeVisual, nftIdentityLine } from '../../nfts/FriendPrizeVisual.tsx';
import { RevealShine } from './PixelShine.tsx';

interface PrizeRevealProps {
  result: PullResult;
  shellId: string;
  /**
   * Test-only: pins every reveal glint to a fixed local time so visual
   * QA can inspect exact shine frames. Never set in the app.
   */
  __testShineTime?: number;
}

/*
 * Fixed glint placements for the $RF reveal. Deterministic on
 * purpose: no random positions, so composition stays intentional
 * and screenshot QA is stable.
 *
 * Coordinates are logical pixels inside a 128x96 stage anchored
 * to the coin, matching the reel-stage reveal composition.
 */
/**
 * NFT reveal glints hug the frame corners on the 192x128 reveal stage.
 * The prize occupies the centred 128x128 region (x=32..160), so every
 * anchor sits outside it: the burst catches the pixel frame and never
 * covers the artwork body.
 *
 * The $RF coin reveal deliberately has NO glints. Mid-grey / light-grey
 * / white shine marks around the coin read as dirt on the artwork: they
 * sit right next to the coin's own stepped silhouette and the warm
 * off-white face, so the token ends up looking speckled rather than
 * collectible. The coin is already a complete, high-contrast pixel
 * object and needs no spotlight around it.
 */
const NFT_REVEAL_GLINTS = [
  { x: 168, y: 6, maxFrame: 2 as const, delay: 0 },
  { x: 4, y: 98, maxFrame: 2 as const, delay: 130 },
  { x: 172, y: 40, maxFrame: 1 as const, delay: 240 },
] as const;

/**
 * Shared reveal shine for the HTML prize panel.
 *
 * Reuses the SAME PixelShine/RevealShine implementation as the SVG pull
 * stages, so there is exactly one shine system in the app. Glints are
 * overlaid on the 128x96 stage surrounding the $RF coin and never cover
 * the amount text below it.
 */
const PixelShineOverlay: React.FC<{
  points: readonly { x: number; y: number; maxFrame: 0 | 1 | 2; delay: number }[];
  /** Test-only frame pin; see AnimatedGlint. */
  __testTime?: number;
}> = ({ points, __testTime }) => {
  return (
    <svg
      viewBox="0 0 192 128"
      width="192"
      height="128"
      aria-hidden="true"
      shapeRendering="crispEdges"
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        // The stage is wider than the 128px prize, so glints sit in the
        // free side margins and never cover the coin or the artwork.
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 1,
        imageRendering: 'pixelated',
        overflow: 'visible',
      }}
    >
      {points.map((p) => (
        <AnimatedGlint key={`${p.x}-${p.y}`} {...p} __testTime={__testTime} />
      ))}
    </svg>
  );
};

const AnimatedGlint: React.FC<{
  x: number;
  y: number;
  maxFrame: 0 | 1 | 2;
  delay: number;
  /**
   * Test-only: pins the glint to a fixed local time so visual QA can
   * inspect exact shine frames without driving rAF. Never set in the app.
   */
  __testTime?: number;
}> = ({ x, y, maxFrame, delay, __testTime }) => {
  // 520ms total life per glint, staggered by delay.
  const [time, setTime] = React.useState(__testTime ?? -1);

  React.useEffect(() => {
    if (__testTime !== undefined) return;
    let raf = 0;
    const frameMs = 1000 / 24;
    let started: number | null = null;
    let finished = false;

    const tick = (now: number) => {
      if (started === null) {
        if (now < delay) {
          raf = requestAnimationFrame(tick);
          return;
        }
        started = now;
      }
      const local = now - started;
      if (local > 520) {
        if (!finished) {
          finished = true;
          setTime(520);
        }
        return;
      }
      setTime(Math.floor(local / frameMs) * frameMs);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [delay, __testTime]);

  return <RevealShine time={time} start={0} x={x} y={y} maxFrame={maxFrame} />;
};

/**
 * ONE shared result presentation for every shell.
 * Mounted only after MACHINE_COMPLETE + REVEAL_HOLD.
 * RF: coin rises 4-8px, 1-2px bounce, amount appears. No shine overlay:
 *     grey/white glints read as dirt on the token's silhouette.
 * Friend: actual NFT art rises in pixel frame, collection + token ID.
 * No-prize: charming neutral empty state with shell flavor, no shame
 *           and no shine, so the shine keeps its meaning.
 */
export const PrizeReveal: React.FC<PrizeRevealProps> = ({ result, shellId, __testShineTime }) => {
  if (result.prizeType === 'FRIEND_PRIZE' && result.friendWon) {
    const f = result.friendWon;
    const announce = `Prize: ${f.collectionName ?? 'Rare Friend'} #${f.tokenId.toString()}`;
    return (
      <div className="anim-prize-rise" role="status" aria-live="polite" aria-label={announce} style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '10px', fontFamily: 'var(--font-display)', marginBottom: '4px' }}>
          JACKPOT WIN!
        </div>
        {/*
          Shine burst sits behind the NFT frame, glinting around the
          artwork edges rather than over it — the prize stays readable
          and the artwork is never recolored or obscured.
        */}
        <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }}>
          <PixelShineOverlay
            points={NFT_REVEAL_GLINTS}
            __testTime={__testShineTime}
          />
          <FriendPrizeVisual
            name={f.name}
            imageUrl={f.displayImageUrl || f.imageUrl}
            openseaUrl={f.openseaUrl}
            collectionName={f.collectionName}
            tokenId={f.tokenId.toString()}
            spriteRows={f.spriteRows}
            origin={f.origin}
            size={128}
          />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '10px', marginTop: '6px' }}>
          YOU PULLED {f.name.toUpperCase()}
        </div>
        <div style={{ fontFamily: 'var(--font-lcd)', fontSize: '9px', color: '#555' }}>
          {nftIdentityLine({
            collectionName: f.collectionName,
            tokenId: f.tokenId.toString(),
          }) ?? `${f.familyName} • GEN ${f.generation}`}
        </div>
        <div
          style={{
            marginTop: '6px',
            display: 'inline-block',
            background: 'var(--color-black)',
            color: 'var(--color-white)',
            fontSize: '8px',
            fontFamily: 'var(--font-lcd)',
            padding: '2px 6px',
          }}
        >
          SIMULATED WIN • NO NFT HAS BEEN TRANSFERRED
        </div>
      </div>
    );
  }

  if (result.prizeType === 'RF_PRIZE') {
    const announce = `Prize: ${formatRFGrouped(result.rfWonUnits)}`;
    return (
      <div className="anim-prize-rise" role="status" aria-live="polite" aria-label={announce} style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '10px', fontFamily: 'var(--font-display)', marginBottom: '4px' }}>
          YOU PULLED
        </div>
        {/*
          No shine overlay: the $RF coin is presented clean, so the token
          keeps its crisp stepped silhouette and warm face.
        */}
        <div className="rf-reveal-rise" style={{ margin: '8px 0', display: 'flex', justifyContent: 'center' }}>
          <RfTokenIcon size={128} />
        </div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px' }}>
          +{formatRFGrouped(result.rfWonUnits)}
        </div>
        <div
          style={{
            marginTop: '6px',
            display: 'inline-block',
            background: 'var(--color-black)',
            color: 'var(--color-white)',
            fontSize: '8px',
            fontFamily: 'var(--font-lcd)',
            padding: '2px 6px',
          }}
        >
          SIMULATED PRIZE
        </div>
      </div>
    );
  }

  const flavor: Record<string, string> = {
    CAPSULE: 'EMPTY CAPSULE INSERT',
    TALLBOY: 'BLANK PARCEL',
    MINI: 'NEUTRAL MISMATCH',
    CLASSIC: 'EMPTY HATCH',
  };
  const detail = flavor[shellId] ?? 'NO PRIZE THIS PULL';
  return (
    <div role="status" aria-live="polite" aria-label="No prize." style={{ textAlign: 'center' }}>
      <div style={{ margin: '8px 0', display: 'flex', justifyContent: 'center' }}>
        <PixelIcon name="soldout" size={32} />
      </div>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: '11px' }}>TRY AGAIN</div>
      <div style={{ fontFamily: 'var(--font-lcd)', fontSize: '9px', color: '#555', marginTop: '4px' }}>
        {detail} • NO PRIZE DRAWN THIS PULL
      </div>
    </div>
  );
};
