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


async def buttons(page):
    out = []
    for b in await page.query_selector_all("button, a, [role=button]"):
        try:
            t = (await b.inner_text()).strip()
            if t: out.append(t[:40])
        except Exception:
            pass
    return out


async def main():
    handler, _ = build_wallet_handler(PK, RPC, CHAIN_ID)
    w3 = Web3(Web3.HTTPProvider(RPC))
    print("addr", ADDR, "start bal", w3.from_wei(w3.eth.get_balance(ADDR), "ether"))

    b = await get_browser("faucet", viewport_width=1280, viewport_height=1200, timeout_seconds=600)
    page = b.page
    page.on("console", lambda m: print("JS>", m.type, m.text[:160]) if m.type in ("error",) else None)
    await page.context.expose_function("__walletCall", handler)
    await page.add_init_script(build_inject_js(ADDR, CHAIN_ID))
    await page.goto("https://faucet.mantle.xyz/", wait_until="domcontentloaded")
    await asyncio.sleep(5)
    print("binding ok?", await page.evaluate("typeof window.__walletCall"))
    print("ethereum?", await page.evaluate("!!window.ethereum"))

    await page.get_by_role("button", name="Connect Wallet").first.click(timeout=8000)
    await asyncio.sleep(1.5)
    await page.get_by_role("button", name="Injected Wallet").first.click(timeout=6000)
    await asyncio.sleep(6)
    print("calls:", await page.evaluate("window.__calls||[]"))
    await page.screenshot(path="/tmp/faucet_connected.png")
    txt = await page.inner_text("body")
    print("--- body ---"); print(txt[:1500])
    print("--- buttons ---"); print(await buttons(page))

asyncio.run(main())
