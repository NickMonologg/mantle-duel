/* MantleDuel on-chain helpers. Ethers v6 is loaded at runtime from a CDN so we
   don't depend on node_modules (which is read-only in this environment). */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Ethers = any;

const ETHERS_URL = "https://esm.sh/ethers@6.13.4";
let _ethers: Ethers | null = null;

export async function getEthers(): Promise<Ethers> {
  if (_ethers) return _ethers;
  _ethers = await import(/* @vite-ignore */ ETHERS_URL);
  return _ethers;
}

export const CONTRACT = "0x982e310De4EF2F509a5fa246CF35e991f0E98271";
export const CHAIN_ID = 5003;
export const CHAIN_HEX = "0x138b";
export const RPC = "https://rpc.sepolia.mantle.xyz";
export const EXPLORER = "https://explorer.sepolia.mantle.xyz";

export const CHAIN_PARAMS = {
  chainId: CHAIN_HEX,
  chainName: "Mantle Sepolia Testnet",
  nativeCurrency: { name: "Mantle", symbol: "MNT", decimals: 18 },
  rpcUrls: [RPC],
  blockExplorerUrls: [EXPLORER],
};

export const ABI = [
  "function roundCount() view returns (uint256)",
  "function scoreboard() view returns (uint256,uint256,uint256)",
  "function getStat(address) view returns (tuple(uint32 played,uint32 correct,uint32 beatAi))",
  "function userPrediction(uint256,address) view returns (uint8)",
  "function settled(uint256,address) view returns (bool)",
  "function getRound(uint256) view returns (tuple(string asset,int256 startPrice,int256 endPrice,uint64 startTime,uint64 lockTime,uint64 resolveTime,uint8 aiPrediction,string aiReasoning,uint8 outcome,bool resolved,uint32 humanUp,uint32 humanDown))",
  "function predict(uint256 id, uint8 prediction)",
  "function settle(uint256 id)",
];

export type Round = {
  id: number;
  asset: string;
  startPrice: number;
  endPrice: number;
  startTime: number;
  lockTime: number;
  resolveTime: number;
  aiPrediction: number; // 0 none, 1 up, 2 down
  aiReasoning: string;
  outcome: number; // 0 pending, 1 up, 2 down
  resolved: boolean;
  humanUp: number;
  humanDown: number;
};

export type Stat = { played: number; correct: number; beatAi: number };
export type Scoreboard = { human: number; ai: number; ties: number };

const SCALE = 1e8;

function toNum(x: unknown): number {
  return Number(x);
}

export function dirLabel(d: number): "UP" | "DOWN" | "—" {
  return d === 1 ? "UP" : d === 2 ? "DOWN" : "—";
}

let _contract: any = null;
export async function getReadContract() {
  if (_contract) return _contract;
  const e = await getEthers();
  // batchMaxCount:1 -> one HTTP request per call. The public Mantle RPC throttles
  // JSON-RPC batches / parallel calls and intermittently returns empty data, which
  // ethers reads as a revert. One-at-a-time + retry makes reads reliable.
  const provider = new e.JsonRpcProvider(RPC, CHAIN_ID, {
    staticNetwork: true,
    batchMaxCount: 1,
  });
  _contract = new e.Contract(CONTRACT, ABI, provider);
  return _contract;
}

async function withRetry<T = any>(fn: () => Promise<T>, tries = 4, delay = 350): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, delay * (i + 1)));
    }
  }
  throw last;
}

export async function fetchScoreboard(): Promise<Scoreboard> {
  const c = await getReadContract();
  const sb: any = await withRetry(() => c.scoreboard());
  const [h, a, t] = sb;
  return { human: toNum(h), ai: toNum(a), ties: toNum(t) };
}

function parseRound(id: number, r: any): Round {
  return {
    id,
    asset: r.asset,
    startPrice: toNum(r.startPrice) / SCALE,
    endPrice: toNum(r.endPrice) / SCALE,
    startTime: toNum(r.startTime),
    lockTime: toNum(r.lockTime),
    resolveTime: toNum(r.resolveTime),
    aiPrediction: toNum(r.aiPrediction),
    aiReasoning: r.aiReasoning,
    outcome: toNum(r.outcome),
    resolved: r.resolved,
    humanUp: toNum(r.humanUp),
    humanDown: toNum(r.humanDown),
  };
}

export async function fetchRounds(limit = 8): Promise<Round[]> {
  const c = await getReadContract();
  const count = toNum(await withRetry(() => c.roundCount()));
  const ids: number[] = [];
  for (let i = count; i >= 1 && ids.length < limit; i--) ids.push(i);
  // Sequential (not Promise.all): the public RPC throttles parallel calls.
  const rounds: Round[] = [];
  for (const id of ids) {
    const r = await withRetry(() => c.getRound(id));
    rounds.push(parseRound(id, r));
  }
  return rounds;
}

export async function fetchStat(addr: string): Promise<Stat> {
  const c = await getReadContract();
  const s = await c.getStat(addr);
  return { played: toNum(s.played), correct: toNum(s.correct), beatAi: toNum(s.beatAi) };
}

export async function fetchUserPrediction(id: number, addr: string): Promise<number> {
  const c = await getReadContract();
  return toNum(await c.userPrediction(id, addr));
}

export async function fetchSettled(id: number, addr: string): Promise<boolean> {
  const c = await getReadContract();
  return await c.settled(id, addr);
}

/* ---- wallet ---- */
export async function connectWallet(): Promise<{ address: string; provider: any }> {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet found. Install MetaMask to play.");
  const e = await getEthers();
  await eth.request({ method: "eth_requestAccounts" });
  await ensureChain();
  const provider = new e.BrowserProvider(eth);
  const signer = await provider.getSigner();
  const address = await signer.getAddress();
  return { address, provider };
}

export async function ensureChain() {
  const eth = (window as any).ethereum;
  if (!eth) return;
  const current = await eth.request({ method: "eth_chainId" });
  if (current?.toLowerCase() === CHAIN_HEX) return;
  try {
    await eth.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_HEX }] });
  } catch (err: any) {
    if (err?.code === 4902 || String(err?.message || "").includes("Unrecognized")) {
      await eth.request({ method: "wallet_addEthereumChain", params: [CHAIN_PARAMS] });
    } else {
      throw err;
    }
  }
}

export async function getWriteContract() {
  const eth = (window as any).ethereum;
  if (!eth) throw new Error("No wallet found");
  const e = await getEthers();
  await ensureChain();
  const provider = new e.BrowserProvider(eth);
  const signer = await provider.getSigner();
  return new e.Contract(CONTRACT, ABI, signer);
}

export async function sendPredict(id: number, dir: 1 | 2): Promise<string> {
  const c = await getWriteContract();
  const tx = await c.predict(id, dir);
  await tx.wait();
  return tx.hash;
}

export async function sendSettle(id: number): Promise<string> {
  const c = await getWriteContract();
  const tx = await c.settle(id);
  await tx.wait();
  return tx.hash;
}
