from pathlib import Path


def test_render_worker_uses_explicit_bounded_playwright_teardown():
    source = Path(__file__).with_name("axe_app.py").read_text(encoding="utf-8")
    start = "playwright = await async_playwright().start()"
    close_browser = "await bounded_playwright_cleanup(browser.close())"
    stop_playwright = "await bounded_playwright_cleanup(playwright.stop())"

    assert "PLAYWRIGHT_CLEANUP_SECONDS = 2.0" in source
    assert "async def bounded_playwright_cleanup" in source
    assert start in source
    assert close_browser in source
    assert stop_playwright in source
    assert "async with async_playwright()" not in source
    assert source.index(start) < source.index(close_browser) < source.index(stop_playwright)
