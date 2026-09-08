from convrank_worker.fallback_sources import _parse_static, _timestamp_iso


def test_parse_static_archived_html():
    html = b'''<!doctype html><html lang="en"><head>
      <title>Example Brand</title>
      <meta name="description" content="Useful description">
      <meta name="viewport" content="width=device-width,initial-scale=1">
      <link rel="canonical" href="https://example.com/">
      <script type="application/ld+json">{"@type":"Organization"}</script>
      <script>window.dataLayer=[];/* GTM-ABC123 */</script>
    </head><body><h1>Primary headline</h1><img src="a.jpg"><img src="b.jpg" alt="B"><form></form><a href="/x">x</a></body></html>'''
    result = _parse_static("https://example.com/", html)
    assert result["title"] == "Example Brand"
    assert result["description"] == "Useful description"
    assert result["viewport"]
    assert result["canonical"] == "https://example.com/"
    assert result["h1s"] == ["Primary headline"]
    assert result["images"] == 2
    assert result["images_missing_alt"] == 1
    assert result["forms"] == 1
    assert result["json_ld_blocks"] == 1
    assert result["trackers"]["gtm"] is True
    assert result["links"] == 1


def test_timestamp_iso_preserves_capture_time():
    assert _timestamp_iso("20260820112233") == "2026-08-20T11:22:33+00:00"
