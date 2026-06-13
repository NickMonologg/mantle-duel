import asyncio, os
from sdk.utils.browser import get_browser, close_browser

URL = "https://preview-mantle-duel-b87e2e30.viktor.space"
OUT = "/work/projects/mantle-duel/media/shots"

async def main():
    os.makedirs(OUT, exist_ok=True)
    b = await get_browser("mantle-shots", viewport_width=1366, viewport_height=860)
    await b.goto(URL, timeout=60000)
    # let ethers load + on-chain data populate
    await b.page.wait_for_timeout(9000)
    info = await b.get_page_info()
    print("page:", info.get("title"), info.get("url"))
    # full page
    await b.page.screenshot(path=f"{OUT}/full.png", full_page=True)
    # top (hero + scoreboard)
    await b.page.screenshot(path=f"{OUT}/top.png")
    # scroll to reveal live round / AI reasoning
    await b.scroll("down", 4)
    await b.page.wait_for_timeout(1500)
    await b.page.screenshot(path=f"{OUT}/mid.png")
    await b.scroll("down", 5)
    await b.page.wait_for_timeout(1500)
    await b.page.screenshot(path=f"{OUT}/low.png")
    print("saved shots to", OUT)
    await close_browser("mantle-shots")

asyncio.run(main())
