import asyncio, json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from injected_wallet import build_wallet_handler, build_inject_js
from web3 import Web3

RPC = "https://rpc.sepolia.mantle.xyz"
CHAIN_ID = 5003
HERE = os.path.dirname(__file__)
wallets = json.load(open(os.path.join(HERE, "..", "wallets.json")))
PK = wallets["deployer"]["pk"]
ADDR = wallets["deployer"]["address"]

sys.path.insert(0, "/work")
from sdk.utils.browser import get_browser


async def main():
    handler, _ = build_wallet_handler(PK, RPC, CHAIN_ID)
    w3 = Web3(Web3.HTTPProvider(RPC))
    start = w3.eth.get_balance(ADDR)
    print("addr", ADDR, "start bal", w3.from_wei(start, "ether"))

    b = await get_browser("faucet", viewport_width=1280, viewport_height=900, timeout_seconds=1800)
    page = b.page
    await page.context.expose_function("__walletCall", handler)
    await page.add_init_script(build_inject_js(ADDR, CHAIN_ID))
    await page.goto("https://faucet.mantle.xyz/", wait_until="domcontentloaded")
    await asyncio.sleep(5)

    # Connect our wallet
    try:
        await page.get_by_role("button", name="Connect Wallet").first.click(timeout=8000)
        await asyncio.sleep(1.5)
        await page.get_by_role("button", name="Injected Wallet").first.click(timeout=6000)
        await asyncio.sleep(5)
    except Exception as e:
        print("connect step:", str(e)[:120])

    body = await page.inner_text("body")
    print("connected wallet visible:", ADDR[:6].lower() in body.lower())

    # Click Authenticate (starts X OAuth)
    try:
        await page.get_by_role("button", name="Authenticate").first.click(timeout=8000)
        await asyncio.sleep(5)
    except Exception as e:
        print("auth click:", str(e)[:120])

    print("URL now:", page.url)
    print("LIVE_VIEW_URL:", b.live_view_url)
    with open("/tmp/faucet_status.json", "w") as f:
        json.dump({"live_view_url": b.live_view_url, "page_url": page.url, "addr": ADDR, "funded": False}, f)
    await page.screenshot(path="/tmp/faucet_xauth.png")
    print("body:", (await page.inner_text('body'))[:600])

    # Poll for funding for up to ~25 min
    print("Polling balance (Nick completes X auth in live view)...")
    funded = False
    for i in range(150):
        await asyncio.sleep(10)
        bal = w3.eth.get_balance(ADDR)
        if bal > start:
            print(f"FUNDED! balance = {w3.from_wei(bal,'ether')} MNT")
            with open("/tmp/faucet_status.json", "w") as f:
                json.dump({"live_view_url": b.live_view_url, "addr": ADDR, "funded": True, "balance": str(w3.from_wei(bal,'ether'))}, f)
            funded = True
            break
        if i % 6 == 0:
            print(f"  still {w3.from_wei(bal,'ether')} MNT at {(i+1)*10}s; url={page.url}")
    if not funded:
        print("Timed out waiting for funds.")

asyncio.run(main())
