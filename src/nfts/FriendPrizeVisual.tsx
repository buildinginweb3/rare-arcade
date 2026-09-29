/**
 * Unified Rare Friend prize visual: real NFT artwork when available,
 * legacy 16x16 sprite only for legacy-demo entries, clearly labeled.
 */

import React from 'react';
import { RareFriendImage } from './RareFriendImage.tsx';
import { RareFriendSprite } from '../components/ui/RareFriendSprite.tsx';

interface FriendPrizeVisualProps {
  name: string;
  imageUrl?: string;
  displayImageUrl?: string;
  openseaUrl?: string;
  collectionName?: string;
  tokenId?: string | bigint;
  spriteRows?: readonly string[];
  origin?: string;
  size?: number;
  showBorder?: boolean;
}

export const FriendPrizeVisual: React.FC<FriendPrizeVisualProps> = ({
  name,
  imageUrl,
  displayImageUrl,
  openseaUrl,
  collectionName,
  tokenId,
  spriteRows,
  origin,
  size = 96,
  showBorder = true,
}) => {
  const art = displayImageUrl || imageUrl;
  if (art) {
    return (
      <RareFriendImage
        imageUrl={art}
        name={name}
        collectionName={collectionName}
        tokenId={tokenId}
        openseaUrl={openseaUrl}
        size={size}
      />
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <RareFriendSprite spriteRows={spriteRows} scale={Math.max(2, Math.round(size / 32))} showBorder={showBorder} />
      {origin === 'legacy-demo' && (
        <span style={{ fontSize: '7px', border: '1px solid #666', color: '#666', padding: '1px 3px', marginTop: '4px' }}>
          LEGACY DEMO
        </span>
      )}
    </div>
  );
};

/** Small helper: "RARE FRIENDS GENERATIONS • TOKEN #8283" label lines. */
export function nftIdentityLine(opts: {
  collectionName?: string;
  collectionType?: string;
  tokenId?: string | bigint;
}): string | null {
  const { collectionName, collectionType, tokenId } = opts;
  if (tokenId === undefined) return null;
  const coll = collectionName || collectionType || 'Rare Friend';
  return `${coll} • TOKEN #${String(tokenId)}`;
}
