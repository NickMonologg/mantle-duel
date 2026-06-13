import asyncio
from sdk.utils.browser import get_browser, close_browser

URL = "https://preview-mantle-duel-b87e2e30.viktor.space"

async def main():
    b = await get_browser("mantle-debug", viewport_width=1280, viewport_height=800)
    msgs = []
    b.page.on("console", lambda m: msgs.append(f"[{m.type}] {m.text}"))
    b.page.on("pageerror", lambda e: msgs.append(f"[pageerror] {e}"))
    b.page.on("requestfailed", lambda r: msgs.append(f"[reqfail] {r.url} :: {r.failure}"))
    await b.goto(URL, timeout=60000)
    await b.page.wait_for_timeout(10000)
    # try the fetch directly in page context
    try:
        res = await b.page.evaluate(
            """async () => {
                try {
                    const m = await import('https://esm.sh/ethers@6.13.4');
                    const p = new m.JsonRpcProvider('https://rpc.sepolia.mantle.xyz', 5003, {staticNetwork:true});
                    const abi = ["function scoreboard() view returns (uint256,uint256,uint256)","function roundCount() view returns (uint256)"];
                    const c = new m.Contract('0x982e310De4EF2F509a5fa246CF35e991f0E98271', abi, p);
                    const sb = await c.scoreboard();
                    const rc = await c.roundCount();
                    return {ok:true, scoreboard:[sb[0].toString(),sb[1].toString(),sb[2].toString()], roundCount: rc.toString()};
                } catch(e) { return {ok:false, error: String(e)}; }
            }"""
        )
        print("INPAGE_FETCH:", res)
    except Exception as e:
        print("EVAL_ERR:", e)
    print("=== CONSOLE/ERRORS ===")
    for m in msgs[-40:]:
        print(m)
    await close_browser("mantle-debug")

asyncio.run(main())
