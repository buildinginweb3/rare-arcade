import React from "react";
import { drawFrame, spriteFrame, type FriendArt } from "@rarefriends/friendsdk";
import { PIXEL } from "./pixelPalette.ts";

/**
 * The selected Friend, drawn from its on-chain artwork.
 *
 * The host supplies 64 frames of 16x16 one-bit bitmaps: idle 0-31 and walk
 * 32-63, four facings of eight frames each. We walk the idle cycle so the
 * cabinet feels inhabited, and hold still while the host is paused so a dialog
 * or a backgrounded tab never leaves the animation running.
 */
export const FriendSprite: React.FC<{
  art: FriendArt;
  size?: number;
  paused?: boolean;
  className?: string;
}> = ({ art, size = 48, paused = false, className }) => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const pausedRef = React.useRef(paused);
  pausedRef.current = paused;

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const scale = size / 16;
    let frame = 0;
    let raf = 0;
    let last = 0;

    const paint = (now: number) => {
      raf = requestAnimationFrame(paint);
      // Walk the idle cycle at ~8fps, the pace the artwork was drawn for.
      if (now - last < 125) return;
      last = now;
      context.clearRect(0, 0, size, size);
      if (pausedRef.current) return;
      frame = (frame + 1) % 8;
      const rows = spriteFrame(art, "down", false, frame);
      drawFrame(context, rows, 0, 0, scale, PIXEL.ink);
    };

    raf = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(raf);
  }, [art, size]);

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={className}
      style={{ imageRendering: "pixelated", width: size, height: size, display: "block" }}
      aria-hidden="true"
    />
  );
};