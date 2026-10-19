import React from "react";
import { messageOf, type Paid, type Ready, usePayments } from "@rarefriends/friendsdk/react";
import type { TransactionResult } from "@rarefriends/friendsdk";
import { PixelIcon } from "../ui/PixelIcon.tsx";
import { RfTokenIcon } from "../ui/RfTokenIcon.tsx";
import { FriendSprite } from "../ui/FriendSprite.tsx";
import { PixelPullFx, type PullFxResultKind } from "../arcade/PixelPullFx.tsx";
import { PlatformFeeVisual } from "../arcade/PlatformFeeVisual.tsx";
import {
  CASHBACK,
  ITEMS,
  ITEM_IDS,
  PULL_PRICE,
  claimActionFor,
  netOf,
  oddsFor,
  parseAmount,
  percentOf,
  platformFeeOf,
  rtpBpsFor,
  rf,
  rfExact,
  type Generation,
  type ItemId,
  type OddsRow,
} from "../lib/economy.ts";
import { soundFx } from "../lib/audio.ts";

type Cabinet = Readonly<{ pulls: number; genesisWon: number; generationsWon: number }>;

const FALLBACK_CABINET: Cabinet = { pulls: 0, genesisWon: 0, generationsWon: 0 };

/** A pull whose settlement has arrived, ready to be shown. */
type Reveal = {
  runId: number;
  row: OddsRow;
  paid: bigint;
  item?: ItemId;
};

function toReveal(result: TransactionResult, generation: Generation, runId: number): Reveal | null {
  const outcome = result.outcomes?.[0];
  if (!outcome) return null;
  const row = oddsFor(generation)[outcome.row];
  if (!row) return null;
  return { runId, row, paid: parseAmount(outcome.pays ?? "0", 18), item: outcome.item as ItemId | undefined };
}

export function Arcade({ ready, paused }: { ready: Ready<Cabinet>; paused: boolean }) {
  const { game, holdings } = ready;
  const cabinet = (ready.server as Cabinet | null) ?? FALLBACK_CABINET;

  const decimals = game.currency?.decimals ?? 18;
  const generation = (game.friend.generation ?? 3) as Generation;
  const balance = holdings.currency ? parseAmount(holdings.currency.balance, decimals) : 0n;

  const [reveal, setReveal] = React.useState<Reveal | null>(null);
  const [phase, setPhase] = React.useState<"IDLE" | "PULLING" | "REVEALED">("IDLE");
  const [pending, setPending] = React.useState(0);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [oddsOpen, setOddsOpen] = React.useState(false);
  const runId = React.useRef(0);

  // A background settlement (the keeper took longer than the host waited) is
  // shown here rather than dropped, and acknowledged by usePayments once we
  // have looked at it.
  const showSettled = React.useCallback(
    (result: TransactionResult) => {
      if (result.action !== "pull" || result.status !== "settled") return;
      const next = toReveal(result, generation, ++runId.current);
      if (next) {
        setReveal(next);
        setPhase("REVEALED");
      }
    },
    [generation]
  );

  const { pay } = usePayments(game, {
    pending: setPending,
    settled(results, announce) {
      for (const result of results) showSettled(result);
      if (announce) setNotice(null);
    },
    failed(result) {
      setNotice(result.error ?? "That pull could not be settled.");
      setPhase("IDLE");
    },
    refresh: async () => undefined,
    busy: () => phase === "PULLING",
  });

  const pullInfo = game.actions.pull;
  const canPull =
    pullInfo?.enabled === true &&
    phase === "IDLE" &&
    !paused &&
    pending === 0 &&
    (holdings.actions.pull?.available ?? false);

  const onPull = async () => {
    if (!canPull) return;
    setNotice(null);
    setPhase("PULLING");
    soundFx.playDrumRoll();
    let paid: Paid;
    try {
      paid = await pay("pull");
    } catch (error) {
      setNotice(messageOf(error, "That pull could not be sent."));
      setPhase("IDLE");
      return;
    }
    if (paid.outcome === "cancelled") {
      setPhase("IDLE");
      return;
    }
    if (paid.result.status !== "settled") {
      // Still settling on chain. The result arrives as a transaction event and
      // showSettled plays the ritual then.
      setPhase("IDLE");
      return;
    }
    const next = toReveal(paid.result, generation, ++runId.current);
    if (!next) {
      setPhase("IDLE");
      return;
    }
    setReveal(next);
    setPhase("PULLING");
  };

  const resultKind: PullFxResultKind = !reveal
    ? "empty"
    : reveal.row.kind === "item"
      ? "nft"
      : reveal.row.kind === "cashback"
        ? "rf"
        : "empty";

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
        <div className="arcade-balance" title="RF in the Friend wallet">
          <RfTokenIcon size={16} decorative />
          <span>{rf(balance, decimals)}</span>
        </div>
      </header>

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
              soundFx[reveal?.row.kind === "empty" ? "playNoPrize" : reveal?.row.kind === "item" ? "playJackpot" : "playPrizeWin"]();
            }}
          />
          {!reveal && phase === "IDLE" ? (
            <div className="cabinet-idle">
              <span className="cabinet-idle-title">RARE FRIEND CABINET</span>
              <span className="cabinet-idle-sub">
                TOP PRIZE: {(ITEMS.genesisFriend.name.toUpperCase())} · BACKED BY{" "}
                {ITEMS.genesisFriend.backing} RF
              </span>
            </div>
          ) : null}
        </div>

        <div className="cabinet-controls">
          <button className="pull-button" onClick={onPull} disabled={!canPull} type="button">
            <span>PULL</span>
            <span className="pull-price">
              <RfTokenIcon size={14} decorative />
              {PULL_PRICE} RF
            </span>
          </button>
          <div className="cabinet-meta">
            <span>
              {pending > 0 ? "SETTLING…" : pullInfo?.enabled === false ? "PAID PLAY UNAVAILABLE" : "READY"}
            </span>
            {pullInfo?.reason ? <span className="cabinet-reason">{pullInfo.reason}</span> : null}
          </div>
          <button className="link-button" onClick={() => setOddsOpen(true)} type="button">
            PUBLISHED ODDS
          </button>
        </div>
      </section>

      {reveal && phase === "REVEALED" ? (
        <RevealPanel
          reveal={reveal}
          decimals={decimals}
          onDismiss={() => {
            setReveal(null);
            setPhase("IDLE");
          }}
        />
      ) : null}

      <PrizePanel ready={ready} decimals={decimals} />

      <footer className="arcade-footer">
        <PlatformFeeVisual size={16} />
        <span className="arcade-rtp">
          RTP FOR GEN {generation}: {percentOf(rtpBpsFor(generation, decimals))} · {cabinet.pulls} PULLS
        </span>
      </footer>

      {oddsOpen ? <OddsDialog generation={generation} decimals={decimals} onClose={() => setOddsOpen(false)} /> : null}
    </div>
  );
}

function RevealPanel({
  reveal,
  decimals,
  onDismiss,
}: {
  reveal: Reveal;
  decimals: number;
  onDismiss: () => void;
}) {
  const { row, paid, item } = reveal;
  return (
    <div className="reveal-panel" role="status">
      <div className="reveal-headline">
        {row.kind === "empty" ? "NO PRIZE" : row.kind === "cashback" ? "CASHBACK" : "A FRIEND!"}
      </div>
      <div className="reveal-body">
        {row.kind === "cashback" ? (
          <p>
            You won {paid ? rf(paid, decimals) : "0"} RF. The gross was {CASHBACK.gross} RF and the arcade took
            5%.
          </p>
        ) : row.kind === "item" && item ? (
          <p>
            A {ITEMS[item].name} is now held by your Friend&apos;s wallet, backed by {ITEMS[item].backing} RF.
            Keep it, or claim {ITEMS[item].redeemValue} RF below.
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

function PrizePanel({ ready, decimals }: { ready: Ready<Cabinet>; decimals: number }) {
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
        <p className="panel-empty">Nothing held yet. Pull the lever.</p>
      ) : (
        <ul className="prize-list">
          {held.map((id) => {
            const item = ITEMS[id];
            const action = claimActionFor(id);
            const fee = platformFeeOf(item.backing, decimals);
            const claimable = holdings.actions[action]?.available ?? false;
            return (
              <li key={id} className="prize-row">
                <div className="prize-name">
                  <PixelIcon name={id === "genesisFriend" ? "trophy" : "friend"} size={16} />
                  <span>
                    {item.name} ×{holdings.items[id]}
                  </span>
                </div>
                <div className="prize-terms">
                  backed {item.backing} RF · claim {item.redeemValue} RF · arcade keeps {rfExact(fee, decimals)}
                </div>
                <div className="prize-choice">
                  <span className="prize-keep">KEEP THE FRIEND</span>
                  <button
                    className="claim-button"
                    type="button"
                    disabled={!claimable || busy !== null}
                    onClick={async () => {
                      setBusy(action);
                      try {
                        const result = await pay(action);
                        if (result.outcome === "settled") {
                          setNotice(`Claimed ${item.redeemValue} RF. The arcade kept 5% of the backing.`);
                        }
                      } catch (error) {
                        setNotice(messageOf(error, "That claim could not be sent."));
                      } finally {
                        setBusy(null);
                      }
                    }}
                  >
                    CLAIM {item.redeemValue} RF
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

function OddsDialog({ generation, decimals, onClose }: { generation: Generation; decimals: number; onClose: () => void }) {
  const rows = oddsFor(generation);
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Published odds">
        <h2 className="panel-title">PUBLISHED ODDS · GEN {generation}</h2>
        <p className="modal-lede">
          Locked to your Friend before you pull. Every outcome and its value are shown here exactly as the
          chain settles them.
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
            {rows.map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td>{(row.weight / 100).toFixed(2)}%</td>
                <td>
                  {row.kind === "empty"
                    ? "—"
                    : row.kind === "cashback"
                      ? `${rf(netOf(CASHBACK.gross, decimals), decimals)} RF`
                      : `${row.value} RF or keep the Friend`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="modal-foot">
          RTP {percentOf(rtpBpsFor(generation, decimals))} · pull price {PULL_PRICE} RF · 5% platform fee on
          spend, on winnings and on claimed backing.
        </p>
        <button className="link-button" onClick={onClose} type="button">
          CLOSE
        </button>
      </div>
    </div>
  );
}