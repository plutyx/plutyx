from convrank_worker.fallback_sources import (
    _parse_static,
    _timestamp_iso,
    page_kind,
    select_representative_urls,
)


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


def test_page_kind_is_business_oriented():
    assert page_kind("https://example.com/") == "home"
    assert page_kind("https://example.com/pricing/") == "pricing"
    assert page_kind("https://example.com/tools/seo-analyzer/") == "tool"
    assert page_kind("https://example.com/services/seo/") == "service"
    assert page_kind("https://example.com/blog/seo-guide/") == "blog"


def test_representative_selection_avoids_only_blog_pages():
    sitemap = {
        "urls": [
            {"url": "https://example.com/blog/a/", "lastmod": "2026-09-01"},
            {"url": "https://example.com/blog/b/", "lastmod": "2026-09-02"},
            {"url": "https://example.com/pricing/", "lastmod": "2026-08-20"},
            {"url": "https://example.com/tools/site-audit/", "lastmod": "2026-08-25"},
            {"url": "https://example.com/services/seo/", "lastmod": "2026-08-21"},
            {"url": "https://example.com/about/", "lastmod": "2026-08-10"},
        ]
    }
    selected = select_representative_urls("https://example.com/", sitemap, max_pages=5)
    kinds = [x["kind"] for x in selected]
    assert kinds[0] == "home"
    assert "pricing" in kinds
    assert "tool" in kinds
    assert "service" in kinds
    assert "blog" in kinds
