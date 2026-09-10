from pathlib import Path


def test_render_worker_drains_routes_before_browser_close():
    source = Path(__file__).with_name("axe_app.py").read_text(encoding="utf-8")
    unroute = 'await page.unroute_all(behavior="ignoreErrors")'
    close = "await browser.close()"

    assert "page = None" in source
    assert unroute in source
    assert close in source
    assert source.index(unroute) < source.index(close)
