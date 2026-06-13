import { useCallback, useEffect, useRef, useState } from "react";
import {
  CONTRACT,
  EXPLORER,
  dirLabel,
  fetchRounds,
  fetchScoreboard,
  fetchStat,
  fetchUserPrediction,
  fetchSettled,
  connectWallet,
  sendPredict,
  sendSettle,
  type Round,
  type Scoreboard,
  type Stat,
} from "@/lib/duel";

const CG_IDS: Record<string, string> = { BTC: "bitcoin", MNT: "mantle", ETH: "ethereum" };

function useLivePrice(asset: string | undefined) {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!asset) return;
    let alive = true;
    const id = CG_IDS[asset] || "mantle";
    const load = async () => {
      try {
        const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
        const j = await r.json();
        if (alive) setPrice(j[id]?.usd ?? null);
      } catch {
        /* ignore */
      }
    };
    load();
    const t = setInterval(load, 12000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [asset]);
  return price;
}

function fmtPrice(p: number) {
  if (p === 0) return "—";
  if (p >= 100) return p.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return p.toLocaleString(undefined, { maximumFractionDigits: 5 });
}

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function countdown(target: number, now: number) {
  const s = Math.max(0, target - now);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function PublicLandingPage() {
  const [score, setScore] = useState<Scoreboard>({ human: 0, ai: 0, ties: 0 });
  const [rounds, setRounds] = useState<Round[]>([]);
  const [address, setAddress] = useState<string | null>(null);
  const [stat, setStat] = useState<Stat | null>(null);
  const [myPred, setMyPred] = useState<Record<number, number>>({});
  const [mySettled, setMySettled] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);
  const now = useNow();
  const pollRef = useRef<number | null>(null);

  const active = rounds.find((r) => !r.resolved) || rounds[0];
  const livePrice = useLivePrice(active?.asset);

  const flash = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 4500);
  };

  const loadAll = useCallback(async (addr: string | null) => {
    // Scoreboard and rounds are loaded independently so a hiccup in one
    // never blanks the other.
    let rs: typeof rounds = [];
    try {
      setScore(await fetchScoreboard());
    } catch (e) {
      console.error("scoreboard", e);
    }
    try {
      rs = await fetchRounds(8);
      setRounds(rs);
    } catch (e) {
      console.error("rounds", e);
    }
    if (addr) {
      try {
        setStat(await fetchStat(addr));
        const preds: Record<number, number> = {};
        const setl: Record<number, boolean> = {};
        for (const r of rs) {
          preds[r.id] = await fetchUserPrediction(r.id, addr);
          if (r.resolved) setl[r.id] = await fetchSettled(r.id, addr);
        }
        setMyPred(preds);
        setMySettled(setl);
      } catch (e) {
        console.error("user state", e);
      }
    }
  }, []);

  useEffect(() => {
    loadAll(address);
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = window.setInterval(() => loadAll(address), 6000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [address, loadAll]);

  const onConnect = async () => {
    try {
      setBusy("connect");
      const { address: a } = await connectWallet();
      setAddress(a);
      flash("ok", "Wallet connected to Mantle Sepolia");
    } catch (e: any) {
      flash("err", e?.message || "Connect failed");
    } finally {
      setBusy(null);
    }
  };

  const onPredict = async (id: number, dir: 1 | 2) => {
    if (!address) return onConnect();
    try {
      setBusy(`p-${id}-${dir}`);
      await sendPredict(id, dir);
      flash("ok", `Prediction locked: ${dir === 1 ? "UP" : "DOWN"}`);
      await loadAll(address);
    } catch (e: any) {
      flash("err", e?.shortMessage || e?.message || "Tx failed");
    } finally {
      setBusy(null);
    }
  };

  const onSettle = async (id: number) => {
    try {
      setBusy(`s-${id}`);
      await sendSettle(id);
      flash("ok", "Result settled on-chain");
      await loadAll(address);
    } catch (e: any) {
      flash("err", e?.shortMessage || e?.message || "Tx failed");
    } finally {
      setBusy(null);
    }
  };

  const total = score.human + score.ai || 1;
  const humanPct = Math.round((score.human / total) * 100);

  return (
    <div className="min-h-screen w-full bg-[#05070d] text-slate-100 font-sans overflow-x-hidden">
      <Backdrop />
      <div className="relative z-10 mx-auto max-w-5xl px-4 pb-24">
        <TopBar address={address} onConnect={onConnect} busy={busy === "connect"} />

        {/* HERO */}
        <header className="pt-10 pb-8 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/5 px-3 py-1 text-[11px] font-medium tracking-wide text-cyan-300">
            <span className="size-1.5 rounded-full bg-cyan-400 animate-pulse" />
            TURING TEST · MANTLE NETWORK
          </div>
          <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
            <span className="text-sky-400">HUMANS</span>{" "}
            <span className="text-slate-500">vs</span>{" "}
            <span className="text-fuchsia-500">MACHINES</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm text-slate-400 sm:text-base">
            Predict the market. An autonomous AI agent commits <em>its own</em> prediction —
            and its reasoning — directly on-chain. Real prices decide who wins. The scoreboard
            lives forever on Mantle.
          </p>
        </header>

        {/* SCOREBOARD */}
        <ScoreBoard score={score} humanPct={humanPct} />

        {/* ACTIVE ROUND */}
        {active && (
          <ActiveRound
            r={active}
            now={now}
            livePrice={livePrice}
            myPred={myPred[active.id] || 0}
            mySettled={!!mySettled[active.id]}
            address={address}
            busy={busy}
            onPredict={onPredict}
            onSettle={onSettle}
          />
        )}

        {/* YOUR RECORD */}
        {address && stat && <YourRecord stat={stat} />}

        {/* HISTORY */}
        <History rounds={rounds.filter((r) => r.aiPrediction !== 0)} />

        <Footer />
      </div>

      {toast && (
        <div
          className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border px-4 py-3 text-sm shadow-2xl backdrop-blur ${
            toast.kind === "ok"
              ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
              : "border-rose-400/40 bg-rose-500/10 text-rose-200"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Backdrop() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_30%_0%,rgba(56,189,248,0.12),transparent),radial-gradient(ellipse_60%_50%_at_70%_0%,rgba(217,70,239,0.12),transparent)]" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.06)_1px,transparent_1px)] bg-[size:46px_46px] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,#000_50%,transparent_100%)]" />
    </div>
  );
}

function shorten(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function TopBar({ address, onConnect, busy }: { address: string | null; onConnect: () => void; busy: boolean }) {
  return (
    <div className="flex items-center justify-between py-5">
      <div className="flex items-center gap-2.5">
        <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-fuchsia-500 text-base font-black text-[#05070d]">
          ⚔
        </div>
        <span className="text-sm font-bold tracking-wide">MANTLE DUEL</span>
      </div>
      <button
        onClick={onConnect}
        disabled={busy}
        className="rounded-lg border border-slate-700 bg-slate-900/70 px-4 py-2 text-xs font-semibold text-slate-100 transition hover:border-cyan-400/60 hover:text-cyan-300 disabled:opacity-50"
      >
        {busy ? "Connecting…" : address ? shorten(address) : "Connect Wallet"}
      </button>
    </div>
  );
}

function ScoreBoard({ score, humanPct }: { score: Scoreboard; humanPct: number }) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur">
      <div className="flex items-end justify-between gap-4">
        <Side label="HUMANS" value={score.human} color="text-sky-400" align="left" />
        <div className="pb-2 text-center text-slate-600">
          <div className="text-[10px] font-semibold tracking-widest">SETTLED ROUNDS</div>
          <div className="text-lg font-bold text-slate-400">VS</div>
        </div>
        <Side label="MACHINES" value={score.ai} color="text-fuchsia-500" align="right" />
      </div>
      <div className="mt-5 h-2.5 w-full overflow-hidden rounded-full bg-fuchsia-500/30">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-700"
          style={{ width: `${humanPct}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-slate-500">
        <span>{humanPct}% human wins</span>
        <span>{score.ties} ties</span>
        <span>{100 - humanPct}% AI wins</span>
      </div>
    </section>
  );
}

function Side({
  label,
  value,
  color,
  align,
}: {
  label: string;
  value: number;
  color: string;
  align: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : "text-left"}>
      <div className="text-[11px] font-semibold tracking-widest text-slate-500">{label}</div>
      <div className={`text-5xl font-black tabular-nums sm:text-6xl ${color}`}>{value}</div>
    </div>
  );
}

function priceChange(r: Round, live: number | null) {
  const ref = r.resolved ? r.endPrice : live ?? 0;
  if (!r.startPrice || !ref) return 0;
  return ((ref - r.startPrice) / r.startPrice) * 100;
}

function ActiveRound({
  r,
  now,
  livePrice,
  myPred,
  mySettled,
  address,
  busy,
  onPredict,
  onSettle,
}: {
  r: Round;
  now: number;
  livePrice: number | null;
  myPred: number;
  mySettled: boolean;
  address: string | null;
  busy: string | null;
  onPredict: (id: number, dir: 1 | 2) => void;
  onSettle: (id: number) => void;
}) {
  const locked = now >= r.lockTime || r.resolved;
  const change = priceChange(r, livePrice);
  const up = change >= 0;

  return (
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="rounded-lg bg-slate-800 px-2.5 py-1 text-xs font-bold tracking-wide text-slate-200">
            {r.asset}/USD
          </span>
          <span className="text-xs text-slate-500">Round #{r.id}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {r.resolved ? (
            <span className="rounded-full bg-slate-800 px-3 py-1 font-semibold text-slate-300">RESOLVED</span>
          ) : locked ? (
            <span className="rounded-full bg-amber-500/15 px-3 py-1 font-semibold text-amber-300">
              LOCKED · awaiting result
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-semibold text-emerald-300">
              LIVE · closes in {countdown(r.lockTime, now)}
            </span>
          )}
        </div>
      </div>

      {/* prices */}
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Metric label="Open price" value={`$${fmtPrice(r.startPrice)}`} />
        <Metric
          label={r.resolved ? "Close price" : "Live price"}
          value={`$${fmtPrice(r.resolved ? r.endPrice : livePrice ?? 0)}`}
          sub={`${up ? "▲" : "▼"} ${Math.abs(change).toFixed(2)}%`}
          subColor={up ? "text-emerald-400" : "text-rose-400"}
        />
        <Metric label="Human picks" value={`▲ ${r.humanUp} · ▼ ${r.humanDown}`} />
      </div>

      {/* AI prediction */}
      <div className="mt-5 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-wide text-fuchsia-300">
            <span className="grid size-5 place-items-center rounded bg-fuchsia-500/20">🤖</span>
            AI AGENT · ON-CHAIN PREDICTION
          </div>
          <Pill dir={r.aiPrediction} />
        </div>
        <p className="mt-2 text-sm italic text-slate-300">
          {r.aiReasoning ? `“${r.aiReasoning}”` : "Awaiting AI inference…"}
        </p>
      </div>

      {/* human action */}
      <div className="mt-5">
        {r.resolved ? (
          <ResolvedPanel r={r} myPred={myPred} mySettled={mySettled} address={address} busy={busy} onSettle={onSettle} />
        ) : (
          <div>
            <div className="mb-2 text-xs font-semibold tracking-wide text-slate-400">YOUR CALL</div>
            {myPred !== 0 ? (
              <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4 text-sm text-sky-200">
                You predicted <b>{dirLabel(myPred)}</b>. {locked ? "Waiting for the round to resolve." : "Locked in."}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <PredictBtn
                  dir="UP"
                  disabled={locked || busy === `p-${r.id}-1`}
                  loading={busy === `p-${r.id}-1`}
                  onClick={() => onPredict(r.id, 1)}
                />
                <PredictBtn
                  dir="DOWN"
                  disabled={locked || busy === `p-${r.id}-2`}
                  loading={busy === `p-${r.id}-2`}
                  onClick={() => onPredict(r.id, 2)}
                />
              </div>
            )}
            {!address && (
              <p className="mt-2 text-center text-xs text-slate-500">Connect your wallet to enter the duel.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function ResolvedPanel({
  r,
  myPred,
  mySettled,
  address,
  busy,
  onSettle,
}: {
  r: Round;
  myPred: number;
  mySettled: boolean;
  address: string | null;
  busy: string | null;
  onSettle: (id: number) => void;
}) {
  const aiCorrect = r.aiPrediction === r.outcome;
  const youCorrect = myPred !== 0 && myPred === r.outcome;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <div>
          Outcome: <b className={r.outcome === 1 ? "text-emerald-400" : "text-rose-400"}>{dirLabel(r.outcome)}</b>
        </div>
        <div className={aiCorrect ? "text-emerald-400" : "text-rose-400"}>
          AI {aiCorrect ? "won ✓" : "lost ✗"}
        </div>
        {myPred !== 0 && (
          <div className={youCorrect ? "text-emerald-400" : "text-rose-400"}>
            You {youCorrect ? "won ✓" : "lost ✗"}
          </div>
        )}
      </div>
      {address && myPred !== 0 && !mySettled && (
        <button
          onClick={() => onSettle(r.id)}
          disabled={busy === `s-${r.id}`}
          className="mt-3 w-full rounded-lg bg-gradient-to-r from-sky-500 to-cyan-400 py-2.5 text-sm font-bold text-[#05070d] transition hover:opacity-90 disabled:opacity-50"
        >
          {busy === `s-${r.id}` ? "Settling…" : "Settle on-chain & record your score"}
        </button>
      )}
      {mySettled && <p className="mt-3 text-center text-xs text-emerald-300">Recorded on-chain ✓</p>}
    </div>
  );
}

function PredictBtn({
  dir,
  disabled,
  loading,
  onClick,
}: {
  dir: "UP" | "DOWN";
  disabled: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  const up = dir === "UP";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group relative overflow-hidden rounded-xl border py-4 text-base font-black tracking-wide transition disabled:cursor-not-allowed disabled:opacity-40 ${
        up
          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
          : "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
      }`}
    >
      {loading ? "…" : (up ? "▲ UP" : "▼ DOWN")}
    </button>
  );
}

function Pill({ dir }: { dir: number }) {
  if (dir === 0) return <span className="rounded-full bg-slate-700 px-3 py-1 text-xs font-bold text-slate-300">…</span>;
  const up = dir === 1;
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-black ${
        up ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
      }`}
    >
      {up ? "▲ UP" : "▼ DOWN"}
    </span>
  );
}

function Metric({
  label,
  value,
  sub,
  subColor,
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div className="text-[10px] font-semibold tracking-widest text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-bold tabular-nums text-slate-100">{value}</div>
      {sub && <div className={`text-xs font-semibold ${subColor}`}>{sub}</div>}
    </div>
  );
}

function YourRecord({ stat }: { stat: Stat }) {
  const acc = stat.played ? Math.round((stat.correct / stat.played) * 100) : 0;
  return (
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur">
      <div className="mb-3 text-xs font-semibold tracking-widest text-slate-400">YOUR RECORD VS THE MACHINE</div>
      <div className="grid grid-cols-4 gap-3">
        <Metric label="Played" value={String(stat.played)} />
        <Metric label="Correct" value={String(stat.correct)} />
        <Metric label="Accuracy" value={`${acc}%`} />
        <Metric label="Beat the AI" value={String(stat.beatAi)} />
      </div>
    </section>
  );
}

function History({ rounds }: { rounds: Round[] }) {
  const settled = rounds.filter((r) => r.resolved);
  if (settled.length === 0) return null;
  return (
    <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur">
      <div className="mb-3 text-xs font-semibold tracking-widest text-slate-400">RECENT DUELS</div>
      <div className="space-y-2">
        {settled.map((r) => {
          const aiCorrect = r.aiPrediction === r.outcome;
          return (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2 text-sm"
            >
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-500">#{r.id}</span>
                <span className="font-semibold text-slate-300">{r.asset}</span>
                <span className="text-xs text-slate-500">
                  ${fmtPrice(r.startPrice)} → ${fmtPrice(r.endPrice)}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs font-bold ${r.outcome === 1 ? "text-emerald-400" : "text-rose-400"}`}>
                  {dirLabel(r.outcome)}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[11px] font-bold ${
                    aiCorrect ? "bg-fuchsia-500/15 text-fuchsia-300" : "bg-slate-700 text-slate-400"
                  }`}
                >
                  AI {aiCorrect ? "✓" : "✗"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="mt-10 flex flex-col items-center gap-2 text-center text-xs text-slate-600">
      <div>
        Contract{" "}
        <a
          className="text-slate-400 underline decoration-dotted hover:text-cyan-300"
          href={`${EXPLORER}/address/${CONTRACT}`}
          target="_blank"
          rel="noreferrer"
        >
          {shorten(CONTRACT)}
        </a>{" "}
        · Mantle Sepolia Testnet
      </div>
      <div>Built for the Mantle “Turing Test” Hackathon · Human vs AI</div>
    </footer>
  );
}
