import React from "react";
import {
  isCancelled,
  messageOf,
  usePayments,
  type Paid,
  type Ready,
} from "@rarefriends/friendsdk/react";
import type { Holdings, TransactionResult } from "@rarefriends/friendsdk";
import { PixelIcon } from "../ui/PixelIcon.tsx";
import { TokenIcon } from "../ui/TokenIcon.tsx";
import { FriendSprite } from "../ui/FriendSprite.tsx";
import { PixelPullFx, type PullFxResultKind } from "../arcade/PixelPullFx.tsx";
import { PlatformFeeVisual } from "../arcade/PlatformFeeVisual.tsx";
import { soundFx } from "../lib/audio.ts";
import {
  ADDRESS_PATTERN,
  CURRENCY,
  MAX_BACKING,
  MAX_FUNDING,
  MAX_NFT_PRIZES,
  MAX_PRICE,
  MAX_PRIZE_COPIES,
  MAX_RTP_BPS,
  MAX_TICKETS,
  MIN_BACKING,
  MIN_PRICE,
  MIN_RTP_BPS,
  MIN_TICKETS,
  NAME_PATTERN,
  NFT_STANDARDS,
  SHELLS,
  STATUS_LABEL,
  STANDARD_NAMES,
  TOKEN_ID_PATTERN,
  collectionName,
  displayUnits,
  groupAmount,
  nftKey,
  parseUnits,
  quoteDraft,
  summarizeMachine,
  type ArcadeEventData,
  type Claim,
  type Draft,
  type DraftQuote,
  type MachineDetail,
  type MachineSummary,
  type NftStandard,
  type RecentWin,
  type Snapshot,
  type TopEntry,
} from "../../shared/arcade.ts";

type View =
  | Readonly<{ kind: "floor" }>
  | Readonly<{ kind: "machine"; id: string }>
  | Readonly<{ kind: "create" }>
  | Readonly<{ kind: "claims" }>;

type Reveal = Readonly<{
  runId: number;
  kind: PullFxResultKind;
  data: ArcadeEventData & { machineId: string };
}>;

type SelectInput = Readonly<{ machineId?: string; claimId?: string }>;

const DEFAULT_DRAFT: Draft = {
  name: "",
  shell: "classic",
  price: "1",
  ticketCount: 10,
  nftPrizes: [],
  usdgPrizes: [],
};

function draftOf(quote: DraftQuote | null): Draft {
  if (!quote) return DEFAULT_DRAFT;
  return {
    name: quote.name,
    shell: quote.shell,
    price: quote.price,
    ticketCount: quote.ticketCount,
    nftPrizes: quote.nftPrizes,
    usdgPrizes: quote.usdgPrizes,
  };
}

function nftName(contract: string, tokenId: string): string {
  return `${collectionName(contract)} #${tokenId}`;
}

function scoreAmount(score: number): string {
  return displayUnits(BigInt(Math.round(score)));
}

export function Arcade({ ready, paused }: { ready: Ready<Snapshot>; paused: boolean }) {
  const { game } = ready;
  const [snapshot, setSnapshot] = React.useState<Snapshot>(ready.server);
  const [holdings, setHoldings] = React.useState<Holdings>(ready.holdings);
  const [view, setView] = React.useState<View>({ kind: "floor" });
  const [detail, setDetail] = React.useState<MachineDetail | null>(null);
  const [detailError, setDetailError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(0);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<"IDLE" | "PULLING" | "REVEALED">("IDLE");
  const [reveal, setReveal] = React.useState<Reveal | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);
  const runId = React.useRef(0);
  const presented = React.useRef(new Set<string>());
  const selectedId = view.kind === "machine" ? view.id : null;

  const refresh = React.useCallback(async () => {
    try {
      const [next, nextHoldings] = await Promise.all([game.call<Snapshot>("catalog"), game.holdings()]);
      setSnapshot(next);
      setHoldings(nextHoldings);
      setRefreshKey((key) => key + 1);
    } catch (error) {
      setNotice(messageOf(error, "The arcade could not refresh."));
    }
  }, [game]);

  React.useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setDetailError(null);
      return;
    }
    let live = true;
    setDetailError(null);
    game
      .call<MachineDetail>("machine", { id: selectedId })
      .then((next) => {
        if (live) setDetail(next);
      })
      .catch((error) => {
        if (live) setDetailError(messageOf(error, "That machine could not be opened."));
      });
    return () => {
      live = false;
    };
  }, [game, selectedId, refreshKey]);

  const present = React.useCallback(
    (transaction: TransactionResult) => {
      if (transaction.status !== "settled") return;
      if (presented.current.has(transaction.id)) return;
      presented.current.add(transaction.id);
      const data = transaction.data as ArcadeEventData | undefined;
      if (transaction.action === "pull" && data?.result && data.machineId) {
        const kind: PullFxResultKind = data.result === "nft" ? "nft" : data.result === "usdg" ? "rf" : "empty";
        setReveal({ runId: ++runId.current, kind, data: data as ArcadeEventData & { machineId: string } });
        setPhase("PULLING");
      }
      if (transaction.action === "createMachine" && data?.machineId) {
        const id = data.machineId;
        setNotice("Machine opened.");
        void refresh().then(() => setView({ kind: "machine", id }));
      }
      if (transaction.action === "keepPrize") setNotice("NFT kept. Its backing returned to the creator.");
      if (transaction.action === "claimBacking") setNotice("Backing claimed. The NFT returned to its creator.");
      if (transaction.action === "withdrawMachine") setNotice("Creator receipts collected.");
      if (transaction.action === "pauseMachine") setNotice("Machine paused.");
      if (transaction.action === "resumeMachine") setNotice("Machine is taking pulls again.");
      if (transaction.action === "cancelMachine") setNotice("Machine cancelled. Everything was returned.");
    },
    [refresh]
  );

  const { pay } = usePayments(game, {
    changed: () => undefined,
    pending: setPending,
    settled: (results) => {
      for (const result of results) present(result);
      void refresh();
    },
    failed: (result) => {
      setNotice(result.error ?? "That transaction failed.");
      setPhase("IDLE");
    },
    refresh,
    busy: () => phase === "PULLING" || busy !== null,
  });

  const act = React.useCallback(
    async (action: string, select?: SelectInput): Promise<Paid | null> => {
      if (paused || pending > 0 || busy !== null) return null;
      setBusy(action);
      setNotice(null);
      try {
        if (select) await game.call("select", select);
        soundFx.playInsertCoin();
        const paid = await pay(action);
        if (paid.outcome === "settled") {
          present(paid.result);
          await refresh();
        }
        return paid;
      } catch (error) {
        if (!isCancelled(error)) setNotice(messageOf(error, "That action could not be sent."));
        return null;
      } finally {
        setBusy(null);
      }
    },
    [busy, game, pay, pending, paused, present, refresh]
  );

  const create = React.useCallback(
    async (draft: Draft) => {
      if (paused || pending > 0 || busy !== null) return;
      setBusy("createMachine");
      setNotice(null);
      try {
        await game.call<DraftQuote>("savedraft", draft);
        soundFx.playInsertCoin();
        const paid = await pay("createMachine");
        if (paid.outcome === "settled") {
          present(paid.result);
          await refresh();
        }
      } catch (error) {
        if (!isCancelled(error)) setNotice(messageOf(error, "That machine could not be opened."));
      } finally {
        setBusy(null);
      }
    },
    [busy, game, pay, pending, paused, present, refresh]
  );

  const openMachine = (id: string) => {
    setView({ kind: "machine", id });
    setReveal(null);
    setPhase("IDLE");
    setNotice(null);
  };

  const onFxComplete = () => {
    setPhase("REVEALED");
    if (!reveal) return;
    if (reveal.kind === "empty") soundFx.playNoPrize();
    else if (reveal.kind === "nft") soundFx.playJackpot();
    else soundFx.playPrizeWin();
  };

  const balance = holdings.currency ? groupAmount(holdings.currency.balance) : "0";

  return (
    <div className="arcade">
      <header className="arcade-header">
        <button className="arcade-brand" type="button" onClick={() => setView({ kind: "floor" })}>
          <PixelIcon name="machine" size={18} />
          <span>RARE ARCADE</span>
        </button>
        <div className="arcade-friend">
          {game.art ? <FriendSprite art={game.art} size={32} paused={paused} /> : null}
          <span>
            #{game.friend.id} · GEN {game.friend.generation}
          </span>
        </div>
        <div className="arcade-balance" title={`${CURRENCY} in the Friend wallet`}>
          <TokenIcon ticker={CURRENCY} size={16} decorative />
          <span>{balance}</span>
        </div>
      </header>

      <nav className="arcade-nav" aria-label="Arcade sections">
        <button
          type="button"
          className={`arcade-nav-tab${view.kind === "floor" ? " arcade-nav-tab-active" : ""}`}
          onClick={() => setView({ kind: "floor" })}
        >
          <PixelIcon name="machine" size={12} /> FLOOR
        </button>
        <button
          type="button"
          className={`arcade-nav-tab${view.kind === "machine" ? " arcade-nav-tab-active" : ""}`}
          onClick={() => {
            const id = view.kind === "machine" ? view.id : snapshot.mine[0]?.id;
            if (id) openMachine(id);
          }}
          disabled={!snapshot.mine.length && view.kind !== "machine"}
        >
          <PixelIcon name="creator" size={12} /> MY MACHINES
        </button>
        <button
          type="button"
          className={`arcade-nav-tab${view.kind === "claims" ? " arcade-nav-tab-active" : ""}`}
          onClick={() => setView({ kind: "claims" })}
        >
          <PixelIcon name="prize" size={12} /> CLAIMS
          {snapshot.claims.length > 0 ? <span className="nav-badge">{snapshot.claims.length}</span> : null}
        </button>
        <button
          type="button"
          className={`arcade-nav-tab${view.kind === "create" ? " arcade-nav-tab-active" : ""}`}
          onClick={() => setView({ kind: "create" })}
        >
          <PixelIcon name="plus" size={12} /> CREATE
        </button>
      </nav>

      {notice ? (
        <div className="arcade-notice" role="status">
          {notice}
          <button className="notice-close" type="button" onClick={() => setNotice(null)} aria-label="Dismiss">
            <PixelIcon name="close" size={12} />
          </button>
        </div>
      ) : null}

      {view.kind === "floor" ? (
        <Floor
          snapshot={snapshot}
          onOpen={openMachine}
          onCreate={() => setView({ kind: "create" })}
          onClaims={() => setView({ kind: "claims" })}
        />
      ) : null}

      {view.kind === "claims" ? (
        <ClaimsView
          claims={snapshot.claims}
          claimAvailable={holdings.actions.claimBacking?.available ?? false}
          keepAvailable={holdings.actions.keepPrize?.available ?? false}
          busy={busy !== null || pending > 0}
          onClaim={(claim) => void act("claimBacking", { machineId: claim.machineId, claimId: claim.id })}
          onKeep={(claim) => void act("keepPrize", { machineId: claim.machineId, claimId: claim.id })}
          onOpen={openMachine}
        />
      ) : null}

      {view.kind === "machine" ? (
        detail ? (
          <MachineView
            detail={detail}
            snapshot={snapshot}
            holdings={holdings}
            friendId={game.friend.id}
            paused={paused}
            pending={pending > 0}
            busy={busy}
            phase={phase}
            reveal={reveal}
            onBack={() => setView({ kind: "floor" })}
            onOpenClaims={() => setView({ kind: "claims" })}
            onPull={() => void act("pull", { machineId: detail.machine.id })}
            onCreator={(action) => void act(action, { machineId: detail.machine.id })}
            onFxComplete={onFxComplete}
            onDismissReveal={() => {
              setReveal(null);
              setPhase("IDLE");
            }}
          />
        ) : (
          <p className="panel-empty">{detailError ?? "Opening the cabinet…"}</p>
        )
      ) : null}

      {view.kind === "create" ? (
        <CreateView
          snapshot={snapshot}
          holdings={holdings}
          paused={paused}
          busy={busy !== null || pending > 0}
          onCreate={(draft) => void create(draft)}
          onBack={() => setView({ kind: "floor" })}
        />
      ) : null}

      <footer className="arcade-footer">
        <PlatformFeeVisual ticker={CURRENCY} size={16} />
        <span className="arcade-rtp">
          {snapshot.stats.machines} MACHINES · {snapshot.stats.pulls} PULLS · {groupAmount(snapshot.stats.paid)} {CURRENCY} PAID
        </span>
      </footer>
    </div>
  );
}

function Floor({
  snapshot,
  onOpen,
  onCreate,
  onClaims,
}: {
  snapshot: Snapshot;
  onOpen: (id: string) => void;
  onCreate: () => void;
  onClaims: () => void;
}) {
  const [tab, setTab] = React.useState<"all" | "live" | "mine">("all");
  const machines = (tab === "mine" ? snapshot.mine : snapshot.machines).filter(
    (machine) => tab !== "live" || machine.status === "live"
  );

  return (
    <section className="floor">
      <div className="floor-stats">
        <Stat label="MACHINES" value={String(snapshot.stats.machines)} icon="machine" />
        <Stat label="PULLS" value={String(snapshot.stats.pulls)} icon="pull" />
        <Stat label={`${CURRENCY} WON`} value={groupAmount(snapshot.stats.paid)} icon="wallet" />
        <Stat label="CREATORS" value={String(snapshot.stats.creators)} icon="creator" />
      </div>

      <div className="floor-tabs">
        <button
          type="button"
          className={`arcade-nav-tab${tab === "all" ? " arcade-nav-tab-active" : ""}`}
          onClick={() => setTab("all")}
        >
          ALL
        </button>
        <button
          type="button"
          className={`arcade-nav-tab${tab === "live" ? " arcade-nav-tab-active" : ""}`}
          onClick={() => setTab("live")}
        >
          LIVE
        </button>
        <button
          type="button"
          className={`arcade-nav-tab${tab === "mine" ? " arcade-nav-tab-active" : ""}`}
          onClick={() => setTab("mine")}
        >
          MINE
        </button>
        <button type="button" className="pixel-btn pixel-btn-sm floor-create" onClick={onCreate}>
          <PixelIcon name="plus" size={12} /> OPEN A MACHINE
        </button>
      </div>

      <div className="floor-layout">
        <div className="machine-grid">
          {machines.length === 0 ? (
            <div className="panel-empty">
              {tab === "mine" ? "You have no machines yet. Build one." : "The floor is empty. Be the first creator."}
            </div>
          ) : (
            machines.map((machine) => (
              <MachineCard key={machine.id} machine={machine} onOpen={() => onOpen(machine.id)} />
            ))
          )}
        </div>

        <aside className="floor-side">
          <section className="floor-panel">
            <h2 className="panel-title">RECENT WINS</h2>
            {snapshot.recent.length === 0 ? (
              <p className="panel-empty">No pulls yet.</p>
            ) : (
              <ul className="recent-list">
                {snapshot.recent.map((entry, index) => (
                  <RecentRow key={`${entry.machineId}-${entry.at}-${index}`} entry={entry} />
                ))}
              </ul>
            )}
          </section>
          <section className="floor-panel">
            <h2 className="panel-title">BIGGEST WINS</h2>
            <TopList entries={snapshot.topWins} />
          </section>
          <section className="floor-panel">
            <h2 className="panel-title">TOP CREATORS</h2>
            <TopList entries={snapshot.topCreators} />
          </section>
          <button type="button" className="pixel-btn pixel-btn-sm" onClick={onClaims}>
            <PixelIcon name="prize" size={12} /> YOUR CLAIMS ({snapshot.claims.length})
          </button>
        </aside>
      </div>
    </section>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon: "machine" | "pull" | "wallet" | "creator" }) {
  return (
    <div className="floor-stat">
      <PixelIcon name={icon} size={16} />
      <span className="floor-stat-value">{value}</span>
      <span className="floor-stat-label">{label}</span>
    </div>
  );
}

function MachineCard({ machine, onOpen }: { machine: MachineSummary; onOpen: () => void }) {
  const creator = machine.creatorId === "" ? "UNKNOWN" : `#${machine.creatorId}`;
  return (
    <button type="button" className="machine-card" onClick={onOpen}>
      <div className={`machine-card-art machine-card-${machine.shell}`}>
        <div className="machine-card-marquee">{machine.name}</div>
        <div className="machine-card-screen">
          <PixelIcon name="machine" size={40} />
          <span className={`machine-status machine-status-${machine.status}`}>{STATUS_LABEL[machine.status]}</span>
        </div>
        <div className="machine-card-hatch">{machine.shell.toUpperCase()} SHELL</div>
      </div>
      <div className="machine-card-body">
        <div className="machine-card-line">
          <span className="machine-card-creator">{creator} · GEN {machine.creatorGeneration}</span>
          <span className="machine-card-price">{groupAmount(machine.price)} {CURRENCY}</span>
        </div>
        <div className="machine-card-meta">
          <span>{machine.ticketsLeft} OF {machine.ticketCount} TICKETS LEFT</span>
          <span>FLOOR RTP {machine.floorRtpBps / 100}%</span>
        </div>
        <div className="machine-card-stats">
          <span><PixelIcon name="prize" size={11} /> {machine.nftCount} NFTS</span>
          <span><TokenIcon ticker={CURRENCY} size={11} decorative /> {groupAmount(machine.nftBacking)}</span>
          <span>TOP BACKING {groupAmount(machine.topBacking)}</span>
        </div>
        <div className="machine-card-open">OPEN CABINET <PixelIcon name="arrow-right" size={11} /></div>
      </div>
    </button>
  );
}

function RecentRow({ entry }: { entry: RecentWin }) {
  return (
    <li className="recent-row">
      <span className="recent-kind">
        {entry.kind === "nft" ? <PixelIcon name="prize" size={11} /> : <TokenIcon ticker={CURRENCY} size={11} decorative />}
        {entry.kind === "nft"
          ? entry.contract && entry.tokenId
            ? nftName(entry.contract, entry.tokenId)
            : "NFT"
          : `${groupAmount(entry.amount ?? "0")} ${CURRENCY}`}
      </span>
      <span className="recent-machine">{entry.machineName}</span>
      <span className="recent-player">#{entry.playerId}</span>
    </li>
  );
}

function TopList({ entries }: { entries: readonly TopEntry[] }) {
  if (entries.length === 0) return <p className="panel-empty">No entries yet.</p>;
  return (
    <ol className="top-list">
      {entries.map((entry, index) => (
        <li key={entry.friendId} className="top-row">
          <span className="top-rank">{index + 1}</span>
          <span className="top-friend">#{entry.friendId}</span>
          <span className="top-score">{scoreAmount(entry.score)} {CURRENCY}</span>
        </li>
      ))}
    </ol>
  );
}

function MachineView({
  detail,
  snapshot,
  holdings,
  friendId,
  paused,
  pending,
  busy,
  phase,
  reveal,
  onBack,
  onOpenClaims,
  onPull,
  onCreator,
  onFxComplete,
  onDismissReveal,
}: {
  detail: MachineDetail;
  snapshot: Snapshot;
  holdings: Holdings;
  friendId: string;
  paused: boolean;
  pending: boolean;
  busy: string | null;
  phase: "IDLE" | "PULLING" | "REVEALED";
  reveal: Reveal | null;
  onBack: () => void;
  onOpenClaims: () => void;
  onPull: () => void;
  onCreator: (action: string) => void;
  onFxComplete: () => void;
  onDismissReveal: () => void;
}) {
  const machine = detail.machine;
  const summary = summarizeMachine(machine);
  const isCreator = machine.creatorId === friendId;
  const receipts = parseUnits(machine.receipts) ?? 0n;
  const activeReveal = reveal && reveal.data.machineId === machine.id ? reveal : null;
  const localPhase = activeReveal ? phase : "IDLE";
  const pullAvailable = holdings.actions.pull?.available ?? false;
  const canPull = !paused && !pending && busy === null && localPhase === "IDLE" && machine.status === "live" && pullAvailable;

  return (
    <section className="machine-view">
      <div className="machine-view-head">
        <button type="button" className="link-button" onClick={onBack}>
          <PixelIcon name="arrow-left" size={11} /> FLOOR
        </button>
        <div>
          <h1 className="machine-title">{machine.name}</h1>
          <p className="machine-sub">
            #{machine.creatorId} · GEN {machine.creatorGeneration} · {machine.creatorFamily} · {machine.shell.toUpperCase()}
          </p>
        </div>
        <span className={`machine-status machine-status-${machine.status}`}>{STATUS_LABEL[machine.status]}</span>
      </div>

      <div className="machine-layout">
        <div className="machine-stage">
          <div className={`cabinet-container cabinet-shell-${machine.shell}`}>
            <div className="cabinet-header">
              <span className="machine-title-sm">{machine.name}</span>
              <span className="machine-header-status">{STATUS_LABEL[machine.status]}</span>
            </div>
            <div className="cabinet-screen-bezel">
              <div className="cabinet-lcd-screen">
                <PixelPullFx
                  shell={machine.shell}
                  active={localPhase === "PULLING" && activeReveal !== null}
                  runId={activeReveal?.runId ?? 0}
                  resultKind={activeReveal?.kind ?? "empty"}
                  reducedMotion={paused}
                  onComplete={onFxComplete}
                />
                {localPhase === "IDLE" ? (
                  <div className="cabinet-idle">
                    <span className="cabinet-idle-title">{machine.shell.toUpperCase()} CABINET</span>
                    <span className="cabinet-idle-sub">
                      {machine.status === "live"
                        ? `${summary.ticketsLeft} TICKETS · TOP BACKING ${groupAmount(summary.topBacking)} ${CURRENCY}`
                        : STATUS_LABEL[machine.status]}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="cabinet-controls">
              <button type="button" className="pull-button" onClick={onPull} disabled={!canPull}>
                <span>{pending ? "SETTLING…" : "PULL"}</span>
                <span className="pull-price">
                  <TokenIcon ticker={CURRENCY} size={13} decorative /> {groupAmount(machine.price)}
                </span>
              </button>
              <div className="cabinet-meta">
                <span>
                  {localPhase === "PULLING"
                    ? "THE DRUM IS TURNING…"
                    : machine.status === "sold_out"
                      ? "SOLD OUT"
                      : pullAvailable
                        ? "READY"
                        : holdings.actions.pull?.reason ?? "PULLS UNAVAILABLE"}
                </span>
                <span>{machine.pulled} OF {machine.ticketCount} PULLED</span>
              </div>
            </div>
            <div className="cabinet-hatch">RARE ARCADE · {CURRENCY} MACHINE</div>
          </div>

          {activeReveal && localPhase === "REVEALED" ? (
            <RevealPanel reveal={activeReveal} onClose={onDismissReveal} />
          ) : null}

          <div className="machine-ledger">
            <div className="machine-ledger-row">
              <span>PRIZE POOL</span>
              <span>{groupAmount(machine.pool)} {CURRENCY}</span>
            </div>
            <div className="machine-ledger-row">
              <span>BACKING HELD</span>
              <span>{groupAmount(machine.backingPool)} {CURRENCY}</span>
            </div>
            <div className="machine-ledger-row">
              <span>USDG PRIZES HELD</span>
              <span>{groupAmount(machine.usdgPool)} {CURRENCY}</span>
            </div>
            <div className="machine-ledger-row">
              <span>CREATOR RECEIPTS</span>
              <span>{groupAmount(machine.receipts)} {CURRENCY}</span>
            </div>
            <div className="machine-ledger-row">
              <span>LIFETIME RECEIPTS</span>
              <span>{groupAmount(machine.lifetimeReceipts)} {CURRENCY}</span>
            </div>
          </div>
        </div>

        <div className="machine-stock">
          <section className="floor-panel">
            <h2 className="panel-title">NFTS IN THE MACHINE</h2>
            {machine.nftPrizes.length === 0 ? (
              <p className="panel-empty">No NFTs stocked.</p>
            ) : (
              <ul className="stock-list">
                {machine.nftPrizes.map((prize) => (
                  <li key={nftKey(prize.contract, prize.tokenId)} className={`stock-row${prize.won ? " stock-row-won" : ""}`}>
                    <PixelIcon name="prize" size={14} />
                    <span className="stock-name">
                      {nftName(prize.contract, prize.tokenId)}
                      <span className="stock-id"> {STANDARD_NAMES[prize.standard]}</span>
                    </span>
                    <span className="stock-backing">{groupAmount(prize.backing)} {CURRENCY}</span>
                    <span className="stock-won">{prize.won ? "WON" : "IN STOCK"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="floor-panel">
            <h2 className="panel-title">USDG PRIZES</h2>
            {machine.usdgPrizes.length === 0 ? (
              <p className="panel-empty">No USDG prizes.</p>
            ) : (
              <ul className="stock-list">
                {machine.usdgPrizes.map((prize, index) => (
                  <li key={`${prize.amount}-${index}`} className="stock-row">
                    <TokenIcon ticker={CURRENCY} size={14} decorative />
                    <span className="stock-name">{groupAmount(prize.amount)} {CURRENCY}</span>
                    <span className="stock-backing">{prize.won} OF {prize.count} WON</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isCreator ? (
            <section className="floor-panel creator-panel">
              <h2 className="panel-title">CREATOR CONTROL</h2>
              <p className="creator-note">
                Receipts are the creator&apos;s 95% of each pull. They sit in the machine until you collect them.
              </p>
              <div className="creator-actions">
                <button
                  type="button"
                  className="pixel-btn pixel-btn-sm"
                  disabled={busy !== null || pending || receipts === 0n}
                  onClick={() => onCreator("withdrawMachine")}
                >
                  COLLECT {groupAmount(machine.receipts)} {CURRENCY}
                </button>
                {machine.status === "live" ? (
                  <button
                    type="button"
                    className="pixel-btn pixel-btn-sm"
                    disabled={busy !== null || pending}
                    onClick={() => onCreator("pauseMachine")}
                  >
                    PAUSE
                  </button>
                ) : null}
                {machine.status === "paused" ? (
                  <button
                    type="button"
                    className="pixel-btn pixel-btn-sm"
                    disabled={busy !== null || pending}
                    onClick={() => onCreator("resumeMachine")}
                  >
                    RESUME
                  </button>
                ) : null}
                {machine.pulled === 0 && machine.status !== "cancelled" ? (
                  <button
                    type="button"
                    className="pixel-btn pixel-btn-sm"
                    disabled={busy !== null || pending}
                    onClick={() => {
                      if (window.confirm("Cancel this machine? Every stocked NFT and all prize USDG go back to your owner wallet.")) {
                        onCreator("cancelMachine");
                      }
                    }}
                  >
                    CANCEL &amp; EMPTY
                  </button>
                ) : null}
              </div>
              <p className="creator-note">Published floor RTP: {summary.floorRtpBps / 100}%.</p>
            </section>
          ) : null}

          <section className="floor-panel">
            <h2 className="panel-title">UNCLAIMED WINS</h2>
            {detail.claims.length === 0 ? (
              <p className="panel-empty">No unclaimed NFTs from this machine.</p>
            ) : (
              <ul className="stock-list">
                {detail.claims.map((claim) => (
                  <li key={claim.id} className="stock-row">
                    <PixelIcon name="prize" size={14} />
                    <span className="stock-name">
                      {nftName(claim.contract, claim.tokenId)}
                      <span className="stock-id"> {STANDARD_NAMES[claim.standard]}</span>
                    </span>
                    <span className="stock-backing">{groupAmount(claim.backing)} {CURRENCY}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {detail.recent.length > 0 ? (
            <section className="floor-panel">
              <h2 className="panel-title">MACHINE HISTORY</h2>
              <ul className="recent-list">
                {detail.recent.map((entry, index) => (
                  <RecentRow key={`${entry.at}-${index}`} entry={entry} />
                ))}
              </ul>
            </section>
          ) : null}

          {snapshot.claims.length > 0 ? (
            <button type="button" className="pixel-btn pixel-btn-sm" onClick={onOpenClaims}>
              <PixelIcon name="prize" size={12} /> YOUR CLAIMS ({snapshot.claims.length})
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function RevealPanel({ reveal, onClose }: { reveal: Reveal; onClose: () => void }) {
  const data = reveal.data;
  return (
    <div className="reveal-panel" role="status">
      <div className="reveal-headline">
        {data.result === "nft" ? "AN NFT!" : data.result === "usdg" ? "USDG PRIZE" : "NO PRIZE"}
      </div>
      <div className="reveal-body">
        {data.result === "nft" && data.contract && data.tokenId ? (
          <p>
            {nftName(data.contract, data.tokenId)} is held in escrow, backed by{" "}
            {groupAmount(data.backing ?? "0")} {CURRENCY}. Choose KEEP NFT or CLAIM BACKING from CLAIMS.
          </p>
        ) : data.result === "usdg" ? (
          <p>
            You won {groupAmount(data.amount ?? "0")} {CURRENCY}. It is in your Friend wallet.
          </p>
        ) : (
          <p>The drum came up empty. The machine keeps its prize pool for the next pull.</p>
        )}
      </div>
      <button className="link-button" type="button" onClick={onClose}>
        CLOSE
      </button>
    </div>
  );
}

function ClaimsView({
  claims,
  claimAvailable,
  keepAvailable,
  busy,
  onClaim,
  onKeep,
  onOpen,
}: {
  claims: readonly Claim[];
  claimAvailable: boolean;
  keepAvailable: boolean;
  busy: boolean;
  onClaim: (claim: Claim) => void;
  onKeep: (claim: Claim) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="claims-view">
      <div className="machine-view-head">
        <div>
          <h1 className="machine-title">YOUR CLAIMS</h1>
          <p className="machine-sub">
            Keep the NFT, or take its USDG backing. Keeping returns the backing to the creator; claiming returns the NFT.
          </p>
        </div>
      </div>
      {claims.length === 0 ? (
        <p className="panel-empty">No unclaimed NFTs. Pull a machine to win one.</p>
      ) : (
        <div className="claim-grid">
          {claims.map((claim) => (
            <article className="claim-card" key={claim.id}>
              <div className="claim-card-head">
                <PixelIcon name="prize" size={18} />
                <div>
                  <div className="claim-card-name">{collectionName(claim.contract)}</div>
                  <div className="claim-card-id">
                    #{claim.tokenId} · {STANDARD_NAMES[claim.standard]} · {claim.machineName}
                  </div>
                </div>
              </div>
              <div className="claim-card-backing">
                <span>BACKING</span>
                <strong>{groupAmount(claim.backing)} {CURRENCY}</strong>
              </div>
              <p className="claim-card-note">
                Keep the NFT and its backing returns to the creator. Take the backing and the NFT returns to the creator.
              </p>
              <div className="claim-card-actions">
                <button type="button" className="claim-button" disabled={!keepAvailable || busy} onClick={() => onKeep(claim)}>
                  KEEP NFT
                </button>
                <button type="button" className="claim-button" disabled={!claimAvailable || busy} onClick={() => onClaim(claim)}>
                  CLAIM {groupAmount(claim.backing)} {CURRENCY}
                </button>
                <button type="button" className="link-button" onClick={() => onOpen(claim.machineId)}>
                  VIEW MACHINE
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function CreateView({
  snapshot,
  holdings,
  paused,
  busy,
  onCreate,
  onBack,
}: {
  snapshot: Snapshot;
  holdings: Holdings;
  paused: boolean;
  busy: boolean;
  onCreate: (draft: Draft) => void;
  onBack: () => void;
}) {
  const [draft, setDraft] = React.useState<Draft>(() => draftOf(snapshot.draft));
  const [contract, setContract] = React.useState("");
  const [tokenId, setTokenId] = React.useState("");
  const [standard, setStandard] = React.useState<NftStandard>("erc721");
  const [addError, setAddError] = React.useState<string | null>(null);
  const quote = React.useMemo(() => quoteDraft(draft), [draft]);
  const balance = holdings.currency ? parseUnits(holdings.currency.balance) ?? 0n : 0n;
  const funding = parseUnits(quote.funding) ?? 0n;
  const issues = draftIssues(draft, quote, balance);

  const setPrize = (key: string, backing: string) => {
    setDraft((current) => ({
      ...current,
      nftPrizes: current.nftPrizes.map((prize) =>
        nftKey(prize.contract, prize.tokenId) === key ? { ...prize, backing } : prize
      ),
    }));
  };

  const addNft = () => {
    const nextContract = contract.trim().toLowerCase();
    const nextTokenId = tokenId.trim();
    if (!ADDRESS_PATTERN.test(nextContract)) {
      setAddError("Enter the collection's 0x contract address.");
      return;
    }
    if (!TOKEN_ID_PATTERN.test(nextTokenId)) {
      setAddError("Enter the NFT's decimal token id.");
      return;
    }
    if (draft.nftPrizes.some((prize) => nftKey(prize.contract, prize.tokenId) === nftKey(nextContract, nextTokenId))) {
      setAddError("That NFT is already stocked.");
      return;
    }
    if (draft.nftPrizes.length >= MAX_NFT_PRIZES) {
      setAddError(`A machine can stock up to ${MAX_NFT_PRIZES} NFTs.`);
      return;
    }
    setDraft((current) => ({
      ...current,
      nftPrizes: [...current.nftPrizes, { contract: nextContract, tokenId: nextTokenId, standard, backing: "1" }],
    }));
    setContract("");
    setTokenId("");
    setAddError(null);
  };

  const removeNft = (key: string) => {
    setDraft((current) => ({
      ...current,
      nftPrizes: current.nftPrizes.filter((prize) => nftKey(prize.contract, prize.tokenId) !== key),
    }));
  };

  const setUsdg = (index: number, patch: Partial<{ amount: string; count: number }>) => {
    setDraft((current) => ({
      ...current,
      usdgPrizes: current.usdgPrizes.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    }));
  };

  return (
    <section className="create-view">
      <div className="machine-view-head">
        <button type="button" className="link-button" onClick={onBack}>
          <PixelIcon name="arrow-left" size={11} /> FLOOR
        </button>
        <div>
          <h1 className="machine-title">OPEN A MACHINE</h1>
          <p className="machine-sub">Stock the prizes, name your price, and the floor does the rest.</p>
        </div>
      </div>

      <div className="create-layout">
        <div className="create-main">
          <section className="pixel-panel create-panel">
            <h2 className="panel-title">THE CABINET</h2>
            <label className="field">
              <span>NAME</span>
              <input
                value={draft.name}
                maxLength={28}
                placeholder="Saturday Night Pulls"
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <div className="field">
              <span>SHELL</span>
              <div className="shell-picker">
                {SHELLS.map((shell) => (
                  <button
                    key={shell}
                    type="button"
                    className={`shell-button${draft.shell === shell ? " shell-button-active" : ""}`}
                    onClick={() => setDraft((current) => ({ ...current, shell }))}
                  >
                    <PixelIcon name="machine" size={18} />
                    <span>{shell.toUpperCase()}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="field-row">
              <label className="field">
                <span>PULL PRICE ({CURRENCY})</span>
                <input
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
                />
              </label>
              <label className="field">
                <span>TICKETS IN THE DECK</span>
                <input
                  inputMode="numeric"
                  value={String(draft.ticketCount)}
                  onChange={(event) =>
                    setDraft((current) => ({ ...current, ticketCount: Number(event.target.value) || MIN_TICKETS }))
                  }
                />
              </label>
            </div>
          </section>

          <section className="pixel-panel create-panel">
            <h2 className="panel-title">NFTS TO STOCK</h2>
            <p className="create-hint">
              Stock any ERC-721 or ERC-1155 on Robinhood Chain with its contract and token id. The contract verifies
              ownership and escrows it; the winner keeps the NFT or takes the USDG backing.
            </p>
            <div className="nft-add">
              <label className="field">
                <span>CONTRACT</span>
                <input
                  value={contract}
                  spellCheck={false}
                  placeholder="0x..."
                  onChange={(event) => setContract(event.target.value)}
                />
              </label>
              <label className="field">
                <span>TOKEN ID</span>
                <input
                  value={tokenId}
                  inputMode="numeric"
                  spellCheck={false}
                  placeholder="1"
                  onChange={(event) => setTokenId(event.target.value)}
                />
              </label>
              <label className="field">
                <span>STANDARD</span>
                <select value={standard} onChange={(event) => setStandard(event.target.value as NftStandard)}>
                  {NFT_STANDARDS.map((value) => (
                    <option key={value} value={value}>
                      {STANDARD_NAMES[value]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="pixel-btn pixel-btn-sm" onClick={addNft}>
                <PixelIcon name="plus" size={11} /> ADD NFT
              </button>
            </div>
            {addError ? <p className="create-error">{addError}</p> : null}
            {draft.nftPrizes.length === 0 ? (
              <p className="panel-empty">No NFTs added yet. Stock at least one prize below.</p>
            ) : (
              <ul className="token-picker">
                {draft.nftPrizes.map((prize) => {
                  const key = nftKey(prize.contract, prize.tokenId);
                  return (
                    <li key={key} className="token-row token-row-selected">
                      <PixelIcon name="prize" size={16} />
                      <span className="token-check">
                        {nftName(prize.contract, prize.tokenId)}
                        <span className="stock-id"> {STANDARD_NAMES[prize.standard]}</span>
                      </span>
                      <label className="token-backing">
                        BACKING
                        <input
                          inputMode="decimal"
                          value={prize.backing}
                          onChange={(event) => setPrize(key, event.target.value)}
                        />
                        {CURRENCY}
                      </label>
                      <button type="button" className="link-button" onClick={() => removeNft(key)}>
                        <PixelIcon name="close" size={11} /> REMOVE
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="create-hint">Up to {MAX_NFT_PRIZES} NFTs per machine. Each entry is one NFT.</p>
          </section>

          <section className="pixel-panel create-panel">
            <h2 className="panel-title">USDG PRIZES</h2>
            <p className="create-hint">Pre-fund USDG prizes. Every ticket you do not fill with a prize is a blank.</p>
            {draft.usdgPrizes.map((line, index) => (
              <div className="usdg-row" key={index}>
                <label>
                  AMOUNT
                  <input
                    inputMode="decimal"
                    value={line.amount}
                    onChange={(event) => setUsdg(index, { amount: event.target.value })}
                  />
                </label>
                <label>
                  COPIES
                  <input
                    inputMode="numeric"
                    value={String(line.count)}
                    onChange={(event) => setUsdg(index, { count: Number(event.target.value) || 1 })}
                  />
                </label>
                <button
                  type="button"
                  className="link-button"
                  onClick={() =>
                    setDraft((current) => ({ ...current, usdgPrizes: current.usdgPrizes.filter((_, i) => i !== index) }))
                  }
                >
                  <PixelIcon name="close" size={11} /> REMOVE
                </button>
              </div>
            ))}
            <button
              type="button"
              className="pixel-btn pixel-btn-sm"
              onClick={() =>
                setDraft((current) => ({ ...current, usdgPrizes: [...current.usdgPrizes, { amount: "1", count: 1 }] }))
              }
            >
              <PixelIcon name="plus" size={11} /> ADD USDG PRIZE
            </button>
          </section>
        </div>

        <aside className="create-side">
          <section className="pixel-panel create-quote">
            <h2 className="panel-title">THE OFFER</h2>
            <QuoteRow label="PRIZE FUNDING" value={`${groupAmount(quote.funding)} ${CURRENCY}`} />
            <QuoteRow label="YOUR BALANCE" value={`${displayUnits(balance)} ${CURRENCY}`} />
            <QuoteRow label="PRIZE TICKETS" value={`${quote.prizeTickets} OF ${draft.ticketCount}`} />
            <QuoteRow label="BLANKS" value={String(quote.blanks)} />
            <QuoteRow label="FLOOR RTP" value={`${quote.floorRtpBps / 100}%`} />
            <QuoteRow label="PLATFORM FEE / PULL" value={`${groupAmount(quote.feePerPull)} ${CURRENCY}`} />
            <QuoteRow label="YOU EARN / PULL" value={`${groupAmount(quote.creatorPerPull)} ${CURRENCY}`} />
            <div className="create-breakdown">
              <span>NFTS {groupAmount(quote.nftBacking)}</span>
              <span>USDG {groupAmount(quote.usdgValue)}</span>
            </div>
            <PlatformFeeVisual ticker={CURRENCY} size={16} compact />
          </section>

          {issues.length > 0 ? (
            <ul className="create-issues">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          ) : (
            <p className="create-ready">READY. The contract will escrow the NFTs and the USDG when you open it.</p>
          )}

          <button
            type="button"
            className="pixel-btn pixel-btn-primary pixel-btn-lg"
            disabled={paused || busy || issues.length > 0 || funding > balance}
            onClick={() => onCreate(draft)}
          >
            {busy ? "OPENING…" : `OPEN MACHINE · ${groupAmount(quote.funding)} ${CURRENCY}`}
          </button>
        </aside>
      </div>
    </section>
  );
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="quote-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function draftIssues(draft: Draft, quote: DraftQuote, balance: bigint): string[] {
  const issues: string[] = [];
  if (!NAME_PATTERN.test(draft.name)) issues.push("Name must be 3-28 plain characters.");
  const price = parseUnits(draft.price);
  if (price === null || price < MIN_PRICE || price > MAX_PRICE) issues.push(`Pull price must be 0.1-1,000 ${CURRENCY}.`);
  if (draft.ticketCount < MIN_TICKETS || draft.ticketCount > MAX_TICKETS) {
    issues.push(`The deck needs ${MIN_TICKETS}-${MAX_TICKETS} tickets.`);
  }
  if (draft.nftPrizes.length > MAX_NFT_PRIZES) issues.push(`A machine can stock up to ${MAX_NFT_PRIZES} NFTs.`);
  const seen = new Set<string>();
  for (const prize of draft.nftPrizes) {
    const key = nftKey(prize.contract, prize.tokenId);
    if (!ADDRESS_PATTERN.test(prize.contract)) issues.push("Every NFT needs a valid 0x contract address.");
    if (!TOKEN_ID_PATTERN.test(prize.tokenId)) issues.push("Every NFT needs a decimal token id.");
    if (!NFT_STANDARDS.includes(prize.standard)) issues.push("Choose ERC-721 or ERC-1155 for every NFT.");
    if (seen.has(key)) issues.push(`${nftName(prize.contract, prize.tokenId)} is stocked twice.`);
    seen.add(key);
    const backing = parseUnits(prize.backing);
    if (backing === null || backing < MIN_BACKING || backing > MAX_BACKING) {
      issues.push(`Backing for ${nftName(prize.contract, prize.tokenId)} must be 0.1-10,000 ${CURRENCY}.`);
    }
  }
  for (const line of draft.usdgPrizes) {
    const amount = parseUnits(line.amount);
    if (amount === null || amount < MIN_BACKING) issues.push(`USDG prizes must be at least 0.1 ${CURRENCY}.`);
    if (!Number.isInteger(line.count) || line.count < 1 || line.count > MAX_PRIZE_COPIES) issues.push("A USDG line has 1-20 copies.");
  }
  if (quote.prizeTickets < 1) issues.push("Stock at least one prize.");
  if (quote.prizeTickets > draft.ticketCount) issues.push("The deck has more prize tickets than tickets.");
  if (quote.floorRtpBps < MIN_RTP_BPS || quote.floorRtpBps > MAX_RTP_BPS) {
    issues.push(`Floor RTP must be ${MIN_RTP_BPS / 100}%-${MAX_RTP_BPS / 100}%.`);
  }
  if ((parseUnits(quote.funding) ?? 0n) > MAX_FUNDING) issues.push("That machine is too heavily stocked.");
  if ((parseUnits(quote.funding) ?? 0n) > balance) issues.push(`You need ${groupAmount(quote.funding)} ${CURRENCY} to fund it.`);
  return issues;
}
