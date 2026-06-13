"""Keeper + AI agent for MantleDuel.

Subcommands:
  cycle   Run a full demo round: create -> AI commit -> wait -> resolve.
  create  Create a round.
  resolve Resolve the latest unresolved round.
  status  Print scoreboard + latest rounds.
"""
import asyncio, json, os, sys, time
import requests
from web3 import Web3
from eth_account import Account

sys.path.insert(0, "/work")
from sdk.tools.utils_tools import ai_structured_output

RPC = "https://rpc.sepolia.mantle.xyz"
CHAIN_ID = 5003
HERE = os.path.dirname(__file__)
ROOT = os.path.join(HERE, "..")
wallets = json.load(open(os.path.join(ROOT, "wallets.json")))
OWNER_PK = wallets["deployer"]["pk"]
AGENT_PK = wallets["agent"]["pk"]
OWNER = wallets["deployer"]["address"]
AGENT = wallets["agent"]["address"]
abi = json.load(open(os.path.join(ROOT, "build", "MantleDuel.abi.json")))
dep = json.load(open(os.path.join(ROOT, "deployment.json")))
ADDR = Web3.to_checksum_address(dep["address"])

w3 = Web3(Web3.HTTPProvider(RPC))
C = w3.eth.contract(address=ADDR, abi=abi)

CG_IDS = {"BTC": "bitcoin", "MNT": "mantle", "ETH": "ethereum"}


def price(asset):
    cid = CG_IDS[asset]
    r = requests.get(f"https://api.coingecko.com/api/v3/simple/price?ids={cid}&vs_currencies=usd", timeout=15)
    return float(r.json()[cid]["usd"])


def price_scaled(asset):
    return int(round(price(asset) * 1e8))


def recent_closes(asset, n=15):
    cid = CG_IDS[asset]
    r = requests.get(f"https://api.coingecko.com/api/v3/coins/{cid}/market_chart?vs_currency=usd&days=1", timeout=20)
    prices = [p[1] for p in r.json().get("prices", [])]
    return prices[-n:] if prices else []


def send(pk, fn, *args, gas=400000, return_rcpt=False):
    acct = Account.from_key(pk)
    tx = fn(*args).build_transaction({
        "from": acct.address,
        "nonce": w3.eth.get_transaction_count(acct.address, "pending"),
        "chainId": CHAIN_ID,
        "gasPrice": w3.eth.gas_price,
    })
    try:
        tx["gas"] = int(w3.eth.estimate_gas(tx) * 1.25)
    except Exception:
        tx["gas"] = gas
    signed = acct.sign_transaction(tx)
    h = w3.eth.send_raw_transaction(signed.raw_transaction)
    rcpt = w3.eth.wait_for_transaction_receipt(h, timeout=180)
    if return_rcpt:
        return h.hex(), rcpt.status, rcpt
    return h.hex(), rcpt.status


async def ai_predict(asset, p0):
    """AI agent inference: predict next move + 1-sentence reasoning."""
    # Recent closes for context
    closes = recent_closes(asset, 15)
    schema = {
        "type": "object",
        "properties": {
            "direction": {"type": "string", "enum": ["UP", "DOWN"]},
            "reasoning": {"type": "string", "description": "One concise sentence (<=160 chars) explaining the call."},
        },
        "required": ["direction", "reasoning"],
    }
    prompt = (
        f"You are an autonomous trading AI agent in a Human-vs-AI prediction duel on Mantle. "
        f"Asset: {asset}/USDT. Current price: {p0:.6f}. Last 15 one-minute closes: {closes}. "
        f"Decide whether the price will be HIGHER (UP) or LOWER (DOWN) than the current price shortly. "
        f"Give a confident, concise one-sentence rationale referencing the recent momentum."
    )
    res = await ai_structured_output(prompt=prompt, output_schema=schema, intelligence_level="balanced")
    if res.error:
        raise RuntimeError(f"AI error: {res.error}")
    data = res.result or {}
    d = (data.get("direction") or "UP").upper()
    reasoning = (data.get("reasoning") or "Momentum-based call.")[:200]
    return (1 if d == "UP" else 2), reasoning, d


def latest():
    return C.functions.roundCount().call()


async def cmd_cycle(asset="MNT", lock=60, resolve_after=120, wait=True):
    p0 = price_scaled(asset)
    print(f"[create] {asset} start={p0/1e8:.6f}")
    h, st, rcpt = send(OWNER_PK, C.functions.createRound, asset, p0, lock, resolve_after, return_rcpt=True)
    print("  tx", h, "status", st)
    # Authoritative round id from the RoundCreated event (avoids RPC-lag on roundCount)
    ev = C.events.RoundCreated().process_receipt(rcpt)
    rid = ev[0]["args"]["id"]
    print("  round id", rid)

    direction, reasoning, dlabel = await ai_predict(asset, p0 / 1e8)
    print(f"[ai] predicts {dlabel}: {reasoning}")
    h, st = send(AGENT_PK, C.functions.commitAiPrediction, rid, direction, reasoning)
    print("  ai tx", h, "status", st)

    if wait:
        print(f"[wait] {resolve_after}s for resolution...")
        time.sleep(resolve_after + 3)
        p1 = price_scaled(asset)
        print(f"[resolve] end={p1/1e8:.6f}")
        h, st = send(OWNER_PK, C.functions.resolve, rid, p1)
        print("  resolve tx", h, "status", st)
        r = C.functions.getRound(rid).call()
        print("  outcome:", "UP" if r[8] == 1 else "DOWN", "| ai:", "UP" if r[6] == 1 else "DOWN")
    return rid


async def cmd_resolve():
    rid = latest()
    r = C.functions.getRound(rid).call()
    if r[10]:
        print("latest already resolved"); return
    asset = r[0]
    p1 = price_scaled(asset)
    h, st = send(OWNER_PK, C.functions.resolve, rid, p1)
    print("resolved", rid, "end", p1/1e8, "tx", h, st)


def cmd_status():
    hw, ai, ties = C.functions.scoreboard().call()
    print(f"Scoreboard  Humans {hw}  —  {ai} Machines  (ties {ties})")
    n = latest()
    for i in range(max(1, n-4), n+1):
        r = C.functions.getRound(i).call()
        print(f"  #{i} {r[0]} start={r[1]/1e8:.4f} end={r[2]/1e8:.4f} ai={r[6]} outcome={r[8]} resolved={r[10]} reason={r[7][:60]}")


async def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "cycle":
        asset = sys.argv[2] if len(sys.argv) > 2 else "MNT"
        lock = int(sys.argv[3]) if len(sys.argv) > 3 else 60
        res = int(sys.argv[4]) if len(sys.argv) > 4 else 120
        await cmd_cycle(asset, lock, res)
    elif cmd == "create":
        await cmd_cycle(sys.argv[2] if len(sys.argv) > 2 else "MNT",
                        int(sys.argv[3]) if len(sys.argv) > 3 else 90,
                        int(sys.argv[4]) if len(sys.argv) > 4 else 180, wait=False)
    elif cmd == "resolve":
        await cmd_resolve()
    else:
        cmd_status()

if __name__ == "__main__":
    asyncio.run(main())
