# ⚔️ Mantle Duel — Humans vs Machines

> An on-chain prediction duel where you go head-to-head against an autonomous AI agent.
> Built for the **Mantle "Turing Test" Hackathon** · Theme: **Human vs AI**.

**Live demo:** https://preview-mantle-duel-b87e2e30.viktor.space
**Contract (Mantle Sepolia):** [`0x982e310De4EF2F509a5fa246CF35e991f0E98271`](https://explorer.sepolia.mantle.xyz/address/0x982e310De4EF2F509a5fa246CF35e991f0E98271)
**Network:** Mantle Sepolia Testnet (chainId `5003`)

---

## The idea

Every round picks a crypto asset (MNT / BTC / ETH) and snapshots its price. Then two players make a sealed call — **UP or DOWN** — for where the price goes:

- **You**, the human, connect a wallet and commit your prediction on-chain.
- **An autonomous AI agent** independently fetches recent price action, reasons about it, and commits **its own prediction _and its written reasoning_** directly on-chain via a dedicated contract function.

When the round resolves against the **real market price**, the smart contract scores it as a head-to-head duel and updates a permanent **"Humans vs Machines"** scoreboard that lives forever on Mantle.

It's a Turing Test in reverse: not "can the AI pass as human?" but **"can a human out-predict the machine?"** — settled trustlessly on-chain.

---

## Why this fits the hackathon

- **Human vs AI, literally.** The core loop is a direct competition between a person and an AI agent, with the result adjudicated by a smart contract.
- **AI that acts on-chain.** The agent doesn't just advise off-chain — it signs and submits its prediction + reasoning as an on-chain transaction (`commitAiPrediction`), from its own dedicated agent wallet.
- **Consumer & viral.** One-tap UP/DOWN, a living scoreboard, "did you beat the AI?" bragging rights — designed to be shared.
- **Fully on Mantle.** Contract deployed + verified on Mantle Sepolia; public frontend reads live on-chain state.

---

## How the on-chain AI works

The AI agent is an off-chain process that owns a wallet (`0x5344B1534fef1DB2aB806D0D80C8315804A13657`) and is the only address allowed to call `commitAiPrediction` (enforced by an `onlyAgent` modifier).

For each round it:
1. Pulls the last ~15 minutes of price candles for the asset (CoinGecko).
2. Runs an LLM inference to decide **UP** or **DOWN** with a one-sentence rationale.
3. Submits a transaction calling `commitAiPrediction(roundId, direction, reasoning)` — so both the **decision and the reasoning are stored on-chain** and visible in the UI before the round locks.

The reasoning string is public on every round, so anyone can audit *why* the machine made its call.

---

## Smart contract

`contracts/MantleDuel.sol` (Solidity `0.8.24`, optimizer 200 runs).

| Function | Caller | Purpose |
|---|---|---|
| `createRound(asset, startPrice, lockDur, resolveDur)` | owner / keeper | Open a new round with a price snapshot |
| `commitAiPrediction(id, dir, reasoning)` | **AI agent** | The AI's on-chain prediction + reasoning |
| `predict(id, dir)` | any human | Commit your UP/DOWN before lock |
| `resolve(id, endPrice)` | owner / keeper | Settle the outcome vs real price |
| `settle(id)` | human | Record your duel result & update the scoreboard |
| `scoreboard()` / `getStat(addr)` / `getRound(id)` | view | Read on-chain state |

**Scoreboard logic** is a clean head-to-head per settled duel:
both correct → tie · you right, AI wrong → **human win** (+`beatAi`) · AI right, you wrong → **machine win**.

---

## Architecture

```
┌─────────────────┐     reads      ┌──────────────────────┐
│  React frontend  │ ─────────────▶ │  MantleDuel.sol      │
│  (Viktor Space)  │ ◀───────────── │  on Mantle Sepolia   │
└────────┬─────────┘   wallet tx    └──────────┬───────────┘
         │ predict / settle                    │ commitAiPrediction
         ▼                                      ▼
   MetaMask (human)                   🤖 AI agent (Python keeper)
                                         LLM + CoinGecko prices
```

- **Frontend:** React + Vite + Tailwind, deployed as a public Viktor Space. Ethers v6 loaded at runtime, talks directly to the Mantle RPC and the user's wallet.
- **AI agent / keeper:** Python (`scripts/keeper.py`) — creates rounds, runs AI inference, commits predictions, and resolves rounds against live prices.
- **Contract:** deployed and verified on Mantle Sepolia.

---

## Tech stack

- **Chain:** Mantle Sepolia Testnet (`https://rpc.sepolia.mantle.xyz`, chainId 5003)
- **Contract:** Solidity 0.8.24, deployed with web3.py + py-solc-x
- **AI:** LLM inference for direction + reasoning; CoinGecko for price data
- **Frontend:** React, Vite, TailwindCSS, ethers v6, MetaMask

---

## Run it locally

### Contract + AI keeper
```bash
cd /path/to/mantle-duel
# uses a local .venv with web3, py-solc-x, eth-account, requests
python scripts/compile.py          # compile MantleDuel.sol
python scripts/deploy.py           # deploy to Mantle Sepolia
python scripts/keeper.py cycle MNT 90 110   # one full duel: create → AI commit → resolve
python scripts/keeper.py status    # print scoreboard + recent rounds
```

### Frontend
```bash
cd frontend            # the Viktor Space app
bun install
bunx vite build        # production build
# or run the dev server and connect MetaMask to Mantle Sepolia
```

---

## Repo layout

```
contracts/MantleDuel.sol     # the duel smart contract
scripts/compile.py           # solc compile → build/
scripts/deploy.py            # deploy to Mantle Sepolia
scripts/keeper.py            # AI agent + round keeper (create / commit / resolve)
scripts/seed.py              # populate demo duels (human player vs AI)
scripts/verify.py            # Blockscout source verification
deployment.json              # current deployed address + metadata
frontend/                    # React + Vite Viktor Space dapp
```

---

## Links

- **Live dapp:** https://preview-mantle-duel-b87e2e30.viktor.space
- **Contract on explorer:** https://explorer.sepolia.mantle.xyz/address/0x982e310De4EF2F509a5fa246CF35e991f0E98271

_Humans vs Machines. May the best predictor win._ ⚔️
