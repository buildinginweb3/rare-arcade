import React from 'react';
import { PixelIcon } from './PixelIcon.tsx';

interface OnboardingModalProps {
  onPlay: () => void;
  onCreate: () => void;
  onClose: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  onPlay,
  onCreate,
  onClose,
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        className="pixel-box"
        style={{
          maxWidth: '540px',
          width: '100%',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--color-white)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="pixel-marquee">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PixelIcon name="machine" size={16} color="#ffffff" />
            <span style={{ fontSize: '12px' }}>WELCOME TO RARE ARCADE</span>
          </div>
          <button
            type="button"
            className="pixel-btn pixel-btn-sm"
            style={{ padding: '2px 6px' }}
            onClick={onClose}
          >
            <PixelIcon name="close" size={12} />
          </button>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', textAlign: 'center' }}>
          <div style={{ margin: '8px 0 16px' }}>
            <PixelIcon name="trophy" size={48} />
          </div>

          <h2
            style={{
              fontSize: '15px',
              fontFamily: 'var(--font-display)',
              marginBottom: '10px',
              letterSpacing: '1px',
            }}
          >
            A CREATOR-OWNED PRIZE-MACHINE MARKETPLACE
          </h2>

          <div
            style={{
              background: 'var(--color-lcd-bg)',
              border: '2px solid var(--color-black)',
              padding: '12px',
              marginBottom: '16px',
              fontFamily: 'var(--font-display)',
              fontSize: '10px',
              lineHeight: '1.6',
            }}
          >
            BUILD THE MACHINE.
            <br />
            SEED THE PRIZES.
            <br />
            BURN RF WITH EVERY PULL.
          </div>

          <div
            style={{
              textAlign: 'left',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              fontSize: '12px',
              lineHeight: '1.5',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', gap: '10px' }}>
              <PixelIcon name="creator" size={20} />
              <div>
                <strong>REAL NFTS, VERIFIED OWNERSHIP:</strong> Connect a wallet to fund a
                machine with an NFT you actually own — Rare Friends appear first, and
                every prize is automatically valued from its top OpenSea bid (Rare Friends
                Generations use bids for their specific Generation when available).
                Funding stays simulated — nothing is transferred. Top-bid references are
                market references, not guaranteed sale values.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <PixelIcon name="creator" size={20} />
              <div>
                <strong>ANYONE CAN CREATE:</strong> Build a custom Friend Machine, seed it with
                RF prizes at realistic scale (thousands+), and set the pull price & target
                RTP — presets or any custom value.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <PixelIcon name="burn" size={20} />
              <div>
                <strong>5% RF BURN PER PULL:</strong> Every pull burns 5% of the RF spent,
                powering active token deflation. The creator earns the remaining 95%.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <PixelIcon name="odds" size={20} />
              <div>
                <strong>FINITE & TRANSPARENT:</strong> Inspect the full prize pool, remaining
                inventory, and exact live odds before every pull. Zero deceptive near-misses.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <PixelIcon name="deck" size={20} />
              <div>
                <strong>FINITE DECK:</strong> A fixed number of tickets. Every pull removes
                one, so odds evolve as the machine empties.
              </div>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <PixelIcon name="dial" size={20} />
              <div>
                <strong>FIXED ODDS:</strong> Every prize keeps the same configured chance
                per pull. There is no play cap. When a prize sells out, its probability
                becomes an empty outcome. The machine ends when all prizes are gone.
              </div>
            </div>
          </div>

          {/* Simulation disclaimer */}
          <div
            style={{
              border: '1px solid var(--color-gray-dark)',
              background: 'var(--color-lcd-dim)',
              padding: '8px 12px',
              fontSize: '10px',
              fontFamily: 'var(--font-lcd)',
              marginBottom: '20px',
            }}
          >
            <strong>SIMULATED VIBEATHON DEMO:</strong> All RF deposits, burns, payouts
            and NFT funding in this MVP are simulated — no live transactions, approvals,
            custody, or real funds are moved. NFT <em>ownership</em> is genuinely verified.
          </div>

          {/* Action CTAs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
            }}
          >
            <button
              type="button"
              className="pixel-btn pixel-btn-primary"
              style={{ padding: '14px', fontSize: '12px' }}
              onClick={() => {
                onPlay();
                onClose();
              }}
            >
              <PixelIcon name="player" size={16} color="#ffffff" />
              PLAY ARCADE
            </button>

            <button
              type="button"
              className="pixel-btn"
              style={{ padding: '14px', fontSize: '12px' }}
              onClick={() => {
                onCreate();
                onClose();
              }}
            >
              <PixelIcon name="creator" size={16} />
              BUILD MACHINE
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
