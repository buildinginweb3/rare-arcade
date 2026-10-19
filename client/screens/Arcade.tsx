import React from "react";
import { messageOf, type Paid, type Ready, usePayments } from "@rarefriends/friendsdk/react";
import type { TransactionResult } from "@rarefriends/friendsdk";
import { PixelIcon } from "../ui/PixelIcon.tsx";
import { TokenIcon } from "../ui/TokenIcon.tsx";
import { FriendSprite } from "../ui/FriendSprite.tsx";
import { PixelPullFx, type PullFxResultKind } from "../arcade/PixelPullFx.tsx";
import { PlatformFeeVisual } from "../arcade/PlatformFeeVisual.tsx";
import {
  CURRENCY,
  DECIMALS,
  ITEM_IDS,
  PLATFORM_FEE_BPS,
  TIER_KEYS,
  TIERS,
  claimActionFor,
  itemOf,
  money,
  moneyExact,
  oddsFor,
  parseAmount,
  percentOf,
  platformFeeOf,
  pullActionFor,
  rtpBpsFor,
  type Generation,
  type ItemId,
  type OddsRow,
  type TierKey,
} from "../lib/economy.ts";
import { soundFx } from "../lib/audio.ts";

type Cabinet = Readonly<{ pulls: number; genesisWon: number; generationsWon: number }>;

const FALLBACK_CABINET: Cabinet = { pulls: 0, genesisWon: 0, generationsWon: 0 };

type Reveal = { runId: number; tier: TierKey; row: OddsRow; paid: bigint };

/** Map a settled draw onto the published table for the tier and generation. */
function toReveal(result: TransactionResult, tier: TierKey, generation: Generation, runId: number): Reveal | null {
  const outcome = result.outcomes?.[0];
  if (!outcome) return null;
  const row = oddsFor(tier, generation)[outcome.row];
  if (!row) return null;
  return { runId, tier, row, paid: parseAmount(outcome.pays ?? "0", DECIMALS) };
}

/** The Genesis item a tier can pay out, which is its top prize. */
const topPrizeOf = (tier: TierKey, generation: Generation): ItemId | undefined =>
  oddsFor(tier, generation).find((row) => row.item && itemOf(row.item).rarity === "genesisFriend")?.item;

export function Arcade({ ready, paused }: { ready: Ready<Cabinet>; paused: boolean }) {
  const { game, holdings } = ready;
  const cabinet = (ready.server as Cabinet | null) ?? FALLBACK_CABINET;

  const decimals = game.currency?.decimals ?? 6;
  const generation = (game.friend.generation ?? 3) as Generation;
  const balance = holdings.currency ? parseAmount(holdings.currency.balance, decimals) : 0n;

  const [tier, setTier] = React.useState<TierKey>("starter");
  const [reveal, setReveal] = React.useState<Reveal | null>(null);
  const [phase, setPhase] = React.useState<"IDLE" | "PULLING" | "REVEALED">("IDLE");
  const [pending, setPending] = React.useState(0);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [oddsOpen, setOddsOpen] = React.useState(false);
  const runId = React.useRef(0);

  // A settlement that arrives after `transact` returned pending is played here
  // rather than dropped. The tier comes from the action name, because the table
  // that says how to read the row is the one the player chose.
  const showSettled = React.useCallback(
    (result: TransactionResult) => {
      if (result.status !== "settled") return;
      const settled = TIER_KEYS.find((key) => pullActionFor(key) === result.action);
      if (!settled) return;
      const next = toReveal(result, settled, generation, ++runId.current);
      if (next) {
        setReveal(next);
        setPhase("PULLING");
      }
    },
    [generation]
  );

  const { pay } = usePayments(game, {
    pending: setPending,
    settled: (results) => results.forEach(showSettled),
    failed: (result) => {
      setNotice(result.error ?? "That pull could not be settled.");
      setPhase("IDLE");
    },
    refresh: async () => undefined,
    busy: () => phase === "PULLING",
  });

  const action = pullActionFor(tier);
  const info = game.actions[action];
  const available = holdings.actions[action]?.available ?? false;
  const canPull = info?.enabled === true && phase === "IDLE" && !paused && pending === 0 && available;

  const onPull = async () => {
    if (!canPull) return;
    setNotice(null);
    setPhase("PULLING");
    soundFx.playDrumRoll();
    let paid: Paid;
    try {
      paid = await pay(action);
    } catch (error) {
      setNotice(messageOf(error, "That pull could not be sent."));
      setPhase("IDLE");
      return;
    }
    if (paid.outcome === "cancelled" || paid.result.status !== "settled") {
      // Either the player backed out, or the keeper still owes us a result --
      // which arrives as a transaction event and plays through showSettled.
      if (paid.outcome === "cancelled") setPhase("IDLE");
      return;
    }
    const next = toReveal(paid.result, tier, generation, ++runId.current);
    if (next) setReveal(next);
  };

  const resultKind: PullFxResultKind = !reveal
    ? "empty"
    : reveal.row.kind === "item"
      ? "nft"
      : reveal.row.kind === "cashback"
        ? "rf"
        : "empty";

  const topPrize = topPrizeOf(tier, generation);

  return (
    <div className="arcade">
      <header className="arcade-header">
        <div className="arcade-brand">
          <PixelIcon name="machine" size={18} />
          <span>RARE ARCADE</span>
        </div>
        <div className="arcade-friend">
          {game.art ? <FriendSprite art={game.art} size={32} paused={paused} /> : null}
          <span>
            #{game.friend.id} · GEN {generation}
          </span>
        </div>
        <div className="arcade-balance" title={`${CURRENCY} in the Friend wallet`}>
          <TokenIcon ticker={CURRENCY} size={16} decorative />
          <span>{money(balance)}</span>
        </div>
      </header>

      <nav className="tier-picker" aria-label="Backing tier">
        {TIER_KEYS.map((key) => {
          const prize = topPrizeOf(key, generation);
          return (
            <button
              key={key}
              type="button"
              className={`tier-button${key === tier ? " tier-button-active" : ""}`}
              aria-pressed={key === tier}
              disabled={game.actions[pullActionFor(key)]?.enabled === false || phase !== "IDLE"}
              onClick={() => setTier(key)}
            >
              <span className="tier-name">{key.toUpperCase()}</span>
              <span className="tier-backing">{prize ? `backs to ${itemOf(prize).backing} ${CURRENCY}` : ""}</span>
            </button>
          );
        })}
      </nav>

      {notice ? (
        <div className="arcade-notice" role="status">
          {notice}
        </div>
      ) : null}

      <section className="arcade-cabinet">
        <div className="cabinet-lcd">
          <PixelPullFx
            shell="classic"
            active={phase === "PULLING"}
            runId={reveal?.runId ?? 0}
            resultKind={resultKind}
            reducedMotion={paused}
            onComplete={() => {
              if (phase !== "PULLING") return;
              setPhase("REVEALED");
              const kind = reveal?.row.kind;
              soundFx[kind === "empty" ? "playNoPrize" : kind === "item" ? "playJackpot" : "playPrizeWin"]();
            }}
          />
          {!reveal && phase === "IDLE" ? (
            <div className="cabinet-idle">
              <span className="cabinet-idle-title">{tier.toUpperCase()} CABINET</span>
              {topPrize ? (
                <span className="cabinet-idle-sub">
                  TOP PRIZE: {itemOf(topPrize).name.toUpperCase()} · BACKED BY {itemOf(topPrize).backing} {CURRENCY}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="cabinet-controls">
          <button className="pull-button" onClick={onPull} disabled={!canPull} type="button">
            <span>PULL</span>
            <span className="pull-price">
              {TIERS[tier].price} {CURRENCY}
            </span>
          </button>
          <div className="cabinet-meta">
            <span>{pending > 0 ? "SETTLING…" : info?.enabled === false ? "PAID PLAY UNAVAILABLE" : "READY"}</span>
            {info?.reason ? <span className="cabinet-reason">{info.reason}</span> : null}
          </div>
          <button className="link-button" onClick={() => setOddsOpen(true)} type="button">
            PUBLISHED ODDS
          </button>
        </div>
      </section>

      {reveal && phase === "REVEALED" ? (
        <RevealPanel
          reveal={reveal}
          onDismiss={() => {
            setReveal(null);
            setPhase("IDLE");
          }}
        />
      ) : null}

      <PrizePanel ready={ready} />

      <footer className="arcade-footer">
        <PlatformFeeVisual ticker={CURRENCY} size={16} />
        <span className="arcade-rtp">
          {tier.toUpperCase()} RTP GEN {generation}: {percentOf(rtpBpsFor(tier, generation))} ·{" "}
          {cabinet.pulls} PULLS
        </span>
      </footer>

      {oddsOpen ? (
        <OddsDialog tier={tier} generation={generation} onClose={() => setOddsOpen(false)} />
      ) : null}
    </div>
  );
}

function RevealPanel({ reveal, onDismiss }: { reveal: Reveal; onDismiss: () => void }) {
  const { row, paid } = reveal;
  const item = row.item;
  return (
    <div className="reveal-panel" role="status">
      <div className="reveal-headline">
        {row.kind === "empty" ? "NO PRIZE" : row.kind === "cashback" ? "CASHBACK" : "A FRIEND!"}
      </div>
      <div className="reveal-body">
        {row.kind === "cashback" ? (
          <p>
            You won {money(paid)} {CURRENCY}. The arcade took 5%.
          </p>
        ) : row.kind === "item" && item ? (
          <p>
            A {itemOf(item).name} is now held by your Friend&apos;s wallet, backed by {itemOf(item).backing}{" "}
            {CURRENCY}. Keep it, or claim {itemOf(item).redeemValue} {CURRENCY} from YOUR CABINET below.
          </p>
        ) : (
          <p>The lever moved and the drum came up empty.</p>
        )}
      </div>
      <button className="link-button" onClick={onDismiss} type="button">
        CLOSE
      </button>
    </div>
  );
}

function PrizePanel({ ready }: { ready: Ready<Cabinet> }) {
  const { game, holdings } = ready;
  const [busy, setBusy] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  const { pay } = usePayments(game, {
    pending: () => undefined,
    settled: () => setNotice(null),
    failed: (result) => setNotice(result.error ?? "That claim could not be settled."),
    refresh: async () => undefined,
    busy: () => busy !== null,
  });

  const held = ITEM_IDS.filter((id) => (holdings.items[id] ?? 0) > 0);

  return (
    <section className="prize-panel">
      <h2 className="panel-title">YOUR CABINET</h2>
      {notice ? <p className="arcade-notice">{notice}</p> : null}
      {held.length === 0 ? (
        <p className="panel-empty">Nothing held yet. Pull a lever.</p>
      ) : (
        <ul className="prize-list">
          {held.map((id) => {
            const item = itemOf(id);
            const claimAction = claimActionFor(id);
            const fee = platformFeeOf(item.backing);
            const claimable = holdings.actions[claimAction]?.available ?? false;
            return (
              <li key={id} className="prize-row">
                <div className="prize-name">
                  <PixelIcon name={item.rarity === "genesisFriend" ? "trophy" : "friend"} size={16} />
                  <span>
                    {item.name} ×{holdings.items[id]}
                  </span>
                  <span className="prize-tier">{item.tier}</span>
                </div>
                <div className="prize-terms">
                  backed {item.backing} {CURRENCY} · claim {item.redeemValue} {CURRENCY} · arcade keeps{" "}
                  {moneyExact(fee)}
                </div>
                <div className="prize-choice">
                  <span className="prize-keep">KEEP THE FRIEND</span>
                  <button
                    className="claim-button"
                    type="button"
                    disabled={!claimable || busy !== null}
                    onClick={async () => {
                      setBusy(claimAction);
                      try {
                        const result = await pay(claimAction);
                        if (result.outcome === "settled") {
                          setNotice(`Claimed ${item.redeemValue} ${CURRENCY}. The arcade kept 5%.`);
                        }
                      } catch (error) {
                        setNotice(messageOf(error, "That claim could not be sent."));
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    CLAIM {item.redeemValue} {CURRENCY}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function OddsDialog({
  tier,
  generation,
  onClose,
}: {
  tier: TierKey;
  generation: Generation;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Published odds">
        <h2 className="panel-title">
          PUBLISHED ODDS · {tier.toUpperCase()} · GEN {generation}
        </h2>
        <p className="modal-lede">
          Locked to your Friend before you pull. Backing is what the arcade pays out of its prize pool — it is
          not an estimate of what a Rare Friend is worth.
        </p>
        <table className="odds-table">
          <thead>
            <tr>
              <th>OUTCOME</th>
              <th>ODDS</th>
              <th>YOU RECEIVE</th>
            </tr>
          </thead>
          <tbody>
            {oddsFor(tier, generation).map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{(row.weight / 100).toFixed(2)}%</td>
                <td>
                  {row.kind === "empty" ? "—" : `${row.value} ${CURRENCY}${row.kind === "item" ? " or keep the Friend" : ""}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="modal-foot">
          RTP {percentOf(rtpBpsFor(tier, generation))} · pull price {TIERS[tier].price} {CURRENCY} ·{" "}
          {Number(PLATFORM_FEE_BPS) / 100}% platform fee on spend, on winnings and on claimed backing.
        </p>
        <button className="link-button" onClick={onClose} type="button">
          CLOSE
        </button>
      </div>
    </div>
  );
}