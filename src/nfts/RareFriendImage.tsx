/**
 * Faithful Real-NFT artwork frame.
 * The surrounding Rare Arcade chrome stays monochrome pixel art, but the NFT
 * media itself is NEVER recolored, cropped, filtered, or redrawn.
 */

import React, { useState } from 'react';

interface RareFriendImageProps {
  imageUrl?: string;
  name: string;
  collectionName?: string;
  tokenId?: string | bigint;
  openseaUrl?: string;
  size?: number; // square px
}

export const RareFriendImage: React.FC<RareFriendImageProps> = ({
  imageUrl,
  name,
  collectionName,
  tokenId,
  openseaUrl,
  size = 128,
}) => {
  const [failed, setFailed] = useState(false);
  const showFallback = !imageUrl || failed;

  return (
    <div
      style={{
        width: size,
        height: size,
        border: '3px solid var(--color-black)',
        boxShadow: 'var(--shadow-chunky)',
        background: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {showFallback ? (
        <div style={{ textAlign: 'center', padding: '8px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '8px' }}>
            NFT MEDIA
            <br />
            UNAVAILABLE
          </div>
          <div style={{ fontFamily: 'var(--font-lcd)', fontSize: '8px', color: '#555', marginTop: '6px' }}>
            {collectionName}
            <br />
            Token #{String(tokenId ?? '?')}
          </div>
          {openseaUrl && (
            <a
              href={openseaUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: 'var(--font-lcd)', fontSize: '8px', marginTop: '6px', display: 'inline-block' }}
              onClick={(e) => e.stopPropagation()}
            >
              VIEW ON OPENSEA
            </a>
          )}
        </div>
      ) : (
        <img
          src={imageUrl}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          onError={() => setFailed(true)}
          style={{
            width: size,
            height: size,
            objectFit: 'contain',
            imageRendering: 'auto',
            display: 'block',
            background: '#ffffff',
          }}
        />
      )}
    </div>
  );
};
