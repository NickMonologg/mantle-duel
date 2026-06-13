# DoraHacks BUIDL Submission — Mantle Duel

## Name
Mantle Duel — Humans vs Machines

## Tagline
An on-chain prediction duel where you go head-to-head against an autonomous AI agent. Real prices decide who wins; the scoreboard lives forever on Mantle.

## Track
Consumer & Viral DApps

## Short description (≈50 words)
Mantle Duel pits a human against an autonomous AI agent in a market-prediction duel. Each round, you and the AI independently call UP or DOWN on a crypto price. The AI commits its prediction *and its reasoning* on-chain. Real prices resolve the round, and a permanent "Humans vs Machines" scoreboard is updated trustlessly on Mantle.

## Full description
The Mantle "Turing Test" hackathon asks one question: human vs AI. Mantle Duel turns that into a game.

Every round snapshots a crypto price (MNT/BTC/ETH). Two players make a sealed UP/DOWN call:
- **You**, the human, connect a wallet and commit your prediction on-chain.
- **An autonomous AI agent** independently analyzes recent price action, decides UP or DOWN, and submits its prediction **and a written rationale directly on-chain** via a dedicated `commitAiPrediction` function that only the agent's wallet can call.

When the round resolves against the real market price, the smart contract scores it as a head-to-head duel and updates a permanent on-chain "Humans vs Machines" scoreboard. It's a Turing Test in reverse: not "can the AI pass as human?" but "can a human out-predict the machine?" — settled trustlessly on Mantle.

The AI's reasoning is stored on-chain and shown in the UI before each round locks, so anyone can audit *why* the machine made its call. One-tap UP/DOWN, a living scoreboard, and "did you beat the AI?" bragging rights make it consumer-friendly and shareable.

## How it's made / tech
- **Smart contract:** `MantleDuel.sol` (Solidity 0.8.24), deployed and verified on Mantle Sepolia. Handles rounds, the AI's on-chain prediction, human predictions, resolution against real price, and the global scoreboard.
- **AI agent (on-chain actor):** a Python keeper that owns a dedicated wallet (the only address allowed to call `commitAiPrediction`). It pulls recent candles, runs an LLM to choose direction + reasoning, and submits that as an on-chain transaction.
- **Frontend:** React + Vite + Tailwind, deployed as a public web app; ethers v6 talks directly to the Mantle RPC and the user's wallet (MetaMask).

## Deployed contract address (Mantle Sepolia, chainId 5003)
0x982e310De4EF2F509a5fa246CF35e991f0E98271

## Explorer
https://explorer.sepolia.mantle.xyz/address/0x982e310De4EF2F509a5fa246CF35e991f0E98271

## Live demo
https://preview-mantle-duel-b87e2e30.viktor.space

## GitHub
<TO ADD — Nick's repo URL>

## Demo video
<TO ADD>
