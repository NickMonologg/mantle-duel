"""Seed the deployed MantleDuel with a few completed duels (human player vs AI)
then leave one LIVE round open for visitors. Run in background."""
import asyncio, json, os, random, sys, time
sys.path.insert(0, os.path.dirname(__file__))
sys.path.insert(0, "/work")
import keeper as K
from web3 import Web3

wallets = json.load(open(os.path.join(K.ROOT, "wallets.json")))
PLAYER_PK = wallets["player"]["pk"]

ASSETS = ["MNT", "BTC", "ETH"]


async def one_round(asset, lock, resolve_after, player_strategy):
    p0 = K.price_scaled(asset)
    print(f"[create] {asset} start={p0/1e8:.6f}")
    h, st, rcpt = K.send(K.OWNER_PK, K.C.functions.createRound, asset, p0, lock, resolve_after, return_rcpt=True)
    rid = K.C.events.RoundCreated().process_receipt(rcpt)[0]["args"]["id"]
    print("  round", rid)

    direction, reasoning, dlabel = await K.ai_predict(asset, p0 / 1e8)
    K.send(K.AGENT_PK, K.C.functions.commitAiPrediction, rid, direction, reasoning)
    print(f"  ai {dlabel}: {reasoning[:70]}")

    # player picks
    if player_strategy == "follow":
        pdir = direction
    elif player_strategy == "contra":
        pdir = 1 if direction == 2 else 2
    else:
        pdir = random.choice([1, 2])
    K.send(PLAYER_PK, K.C.functions.predict, rid, pdir)
    print(f"  player {'UP' if pdir==1 else 'DOWN'}")

    time.sleep(resolve_after + 3)
    p1 = K.price_scaled(asset)
    K.send(K.OWNER_PK, K.C.functions.resolve, rid, p1)
    K.send(PLAYER_PK, K.C.functions.settle, rid)
    r = K.C.functions.getRound(rid).call()
    print(f"  resolved outcome={'UP' if r[8]==1 else 'DOWN'} end={p1/1e8:.6f}; settled")


async def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 5
    strategies = ["random", "contra", "follow", "random", "contra", "follow", "random"]
    for i in range(n):
        asset = ASSETS[i % len(ASSETS)]
        try:
            await one_round(asset, 50, 65, strategies[i % len(strategies)])
        except Exception as e:
            print("  round error:", str(e)[:160])
        time.sleep(2)

    # leave one LIVE round open (long window) with AI committed
    print("[final] opening a live round for visitors")
    asset = "MNT"
    p0 = K.price_scaled(asset)
    h, st, rcpt = K.send(K.OWNER_PK, K.C.functions.createRound, asset, p0, 1800, 2100, return_rcpt=True)
    rid = K.C.events.RoundCreated().process_receipt(rcpt)[0]["args"]["id"]
    direction, reasoning, dlabel = await K.ai_predict(asset, p0 / 1e8)
    K.send(K.AGENT_PK, K.C.functions.commitAiPrediction, rid, direction, reasoning)
    print(f"  live round {rid} open 30min; ai={dlabel}")

    hw, ai, ties = K.C.functions.scoreboard().call()
    print(f"SCOREBOARD Humans {hw} - {ai} Machines (ties {ties})")


if __name__ == "__main__":
    asyncio.run(main())
