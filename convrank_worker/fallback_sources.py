from __future__ import annotations

import asyncio
import io
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup
from warcio.archiveiterator import ArchiveIterator

from convrank_worker.app import safe_get, validate_public_url

CC_COLLINFO = "https://index.commoncrawl.org/collinfo.json"
CC_DATA = "https://data.commoncrawl.org/"
FALLBACK_UA = "SAC-AuditBot/0.3 (+https://plutyx.com/ranking-conversao; public-audit-fallback)"
MAX_ARCHIVE_HTML = 5_000_000


def _timestamp_iso(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, "%Y%m%d%H%M%S").replace(tzinfo=timezone.utc).isoformat()
    except Exception:
        return value


def _parse_static(url: str, html_bytes: bytes, status: int = 200) -> dict[str, Any]:
    html = html_bytes[:MAX_ARCHIVE_HTML].decode("utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else None
    desc_node = soup.find("meta", attrs={"name": re.compile(r"^description$", re.I)})
    viewport_node = soup.find("meta", attrs={"name": re.compile(r"^viewport$", re.I)})
    canonical_node = soup.find("link", rel=lambda v: v and "canonical" in (v if isinstance(v, list) else [v]))
    h1s = [x.get_text(" ", strip=True) for x in soup.find_all("h1") if x.get_text(" ", strip=True)]
    images = soup.find_all("img")
    text = soup.get_text(" ", strip=True)
    trackers = {
        "gtm": bool(re.search(r"GTM-[A-Z0-9]+|googletagmanager\.com/gtm", html, re.I)),
        "ga4": bool(re.search(r"G-[A-Z0-9]+|googletagmanager\.com/gtag", html, re.I)),
        "meta": bool(re.search(r"fbevents\.js|fbq\s*\(", html, re.I)),
        "tiktok": bool(re.search(r"analytics\.tiktok\.com|ttq\.", html, re.I)),
        "linkedin": bool(re.search(r"snap\.licdn\.com|_linkedin_partner_id", html, re.I)),
        "clarity": "clarity.ms" in html,
        "hotjar": "hotjar.com" in html,
    }
    return {
        "url": url,
        "status": status,
        "title": title,
        "description": desc_node.get("content") if desc_node else None,
        "viewport": viewport_node.get("content") if viewport_node else None,
        "canonical": canonical_node.get("href") if canonical_node else None,
        "lang": soup.html.get("lang") if soup.html else None,
        "h1s": h1s[:10],
        "images": len(images),
        "images_missing_alt": sum(1 for x in images if x.get("alt") is None),
        "forms": len(soup.find_all("form")),
        "json_ld_blocks": len(soup.find_all("script", attrs={"type": "application/ld+json"})),
        "trackers": trackers,
        "word_count": len(text.split()),
        "links": len(soup.find_all("a", href=True)),
    }


async def _latest_indexes(client: httpx.AsyncClient, max_indexes: int = 4) -> list[dict[str, Any]]:
    response = await client.get(CC_COLLINFO, timeout=12, headers={"User-Agent": FALLBACK_UA})
    response.raise_for_status()
    data = response.json()
    return [item for item in data if item.get("cdx-api")][:max_indexes]


def _candidate_queries(raw_url: str) -> list[str]:
    parsed = urlparse(raw_url)
    host = (parsed.hostname or "").lower()
    path = parsed.path or "/"
    candidates = [raw_url, f"{host}{path}"]
    if host.startswith("www."):
        candidates.extend([f"{host[4:]}{path}", f"https://{host[4:]}{path}"])
    else:
        candidates.extend([f"www.{host}{path}", f"https://www.{host}{path}"])
    seen: set[str] = set()
    return [x for x in candidates if x and not (x in seen or seen.add(x))]


async def _lookup_record(
    client: httpx.AsyncClient,
    raw_url: str,
    indexes: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    indexes = indexes or await _latest_indexes(client)
    for index in indexes:
        endpoint = index["cdx-api"]
        for query in _candidate_queries(raw_url):
            params = [
                ("url", query),
                ("output", "json"),
                ("filter", "status:200"),
                ("filter", "mime:text/html"),
                ("limit", "5"),
            ]
            try:
                response = await client.get(endpoint, params=params, timeout=12, headers={"User-Agent": FALLBACK_UA})
            except Exception:
                continue
            if response.status_code != 200 or not response.text.strip():
                continue
            rows: list[dict[str, Any]] = []
            for line in response.text.splitlines():
                try:
                    rows.append(json.loads(line))
                except Exception:
                    continue
            if not rows:
                continue
            rows.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            return rows[0], index
    return None, None


async def _fetch_warc(client: httpx.AsyncClient, record: dict[str, Any]) -> tuple[bytes | None, dict[str, str]]:
    try:
        offset = int(record["offset"])
        length = int(record["length"])
        filename = str(record["filename"])
    except Exception:
        return None, {}
    headers = {"User-Agent": FALLBACK_UA, "Range": f"bytes={offset}-{offset + length - 1}"}
    response = await client.get(f"{CC_DATA}{filename}", headers=headers, timeout=25)
    if response.status_code not in (200, 206):
        return None, {}
    try:
        for warc in ArchiveIterator(io.BytesIO(response.content)):
            if warc.rec_type != "response":
                continue
            payload = warc.content_stream().read(MAX_ARCHIVE_HTML)
            http_headers: dict[str, str] = {}
            if warc.http_headers:
                for key, value in warc.http_headers.headers:
                    http_headers[str(key).lower()] = str(value)
            return payload, http_headers
    except Exception:
        return None, {}
    return None, {}


def _same_site(host_a: str, host_b: str) -> bool:
    a = host_a.lower().removeprefix("www.")
    b = host_b.lower().removeprefix("www.")
    return bool(a and a == b)


async def discover_sitemap_urls(raw_url: str, max_urls: int = 300) -> dict[str, Any]:
    """Discover current public URLs from robots/sitemaps without crawling page content."""
    root = await validate_public_url(raw_url)
    parsed = urlparse(root)
    origin = f"{parsed.scheme}://{parsed.netloc}"
    host = parsed.hostname or ""
    sitemap_candidates: list[str] = []
    discovered: list[dict[str, Any]] = []
    visited_sitemaps: set[str] = set()

    async with httpx.AsyncClient(
        verify=True,
        trust_env=False,
        limits=httpx.Limits(max_connections=3, max_keepalive_connections=2),
    ) as client:
        try:
            robots, _ = await safe_get(client, f"{origin}/robots.txt", timeout=8)
            if robots.status_code == 200:
                for line in robots.text.splitlines():
                    if line.lower().startswith("sitemap:"):
                        candidate = line.split(":", 1)[1].strip()
                        try:
                            c_host = urlparse(candidate).hostname or ""
                            if _same_site(host, c_host):
                                sitemap_candidates.append(candidate)
                        except Exception:
                            pass
        except Exception:
            pass

        if not sitemap_candidates:
            sitemap_candidates = [f"{origin}/sitemap_index.xml", f"{origin}/sitemap.xml"]

        queue = sitemap_candidates[:4]
        while queue and len(discovered) < max_urls and len(visited_sitemaps) < 12:
            sitemap_url = queue.pop(0)
            if sitemap_url in visited_sitemaps:
                continue
            visited_sitemaps.add(sitemap_url)
            try:
                s_host = urlparse(sitemap_url).hostname or ""
                if not _same_site(host, s_host):
                    continue
                response, final = await safe_get(client, sitemap_url, timeout=10)
                if response.status_code != 200 or len(response.content) > 8_000_000:
                    continue
                root_xml = ET.fromstring(response.content)
            except Exception:
                continue

            tag = root_xml.tag.lower()
            if tag.endswith("sitemapindex"):
                for node in root_xml.iter():
                    if not node.tag.lower().endswith("loc") or not node.text:
                        continue
                    child = node.text.strip()
                    c_host = urlparse(child).hostname or ""
                    if _same_site(host, c_host) and child not in visited_sitemaps and child not in queue:
                        queue.append(child)
                        if len(queue) >= 12:
                            break
            elif tag.endswith("urlset"):
                for url_node in list(root_xml):
                    loc = None
                    lastmod = None
                    for child in list(url_node):
                        ctag = child.tag.lower()
                        if ctag.endswith("loc") and child.text:
                            loc = child.text.strip()
                        elif ctag.endswith("lastmod") and child.text:
                            lastmod = child.text.strip()
                    if not loc:
                        continue
                    loc_host = urlparse(loc).hostname or ""
                    if not _same_site(host, loc_host):
                        continue
                    discovered.append({"url": loc, "lastmod": lastmod, "sitemap": final})
                    if len(discovered) >= max_urls:
                        break

    dedup: dict[str, dict[str, Any]] = {}
    for item in discovered:
        dedup.setdefault(item["url"], item)
    return {
        "available": bool(dedup),
        "source": "current_sitemap",
        "sitemaps_checked": len(visited_sitemaps),
        "urls": list(dedup.values())[:max_urls],
    }


def page_kind(raw_url: str) -> str:
    path = (urlparse(raw_url).path or "/").lower().strip("/")
    if not path:
        return "home"
    tests = [
        ("pricing", ("pricing", "precos", "plans", "planos")),
        ("tool", ("tool", "tools", "ubersuggest", "analyzer", "checker", "calculator")),
        ("service", ("service", "services", "consulting", "agency", "seo-services", "digital-marketing")),
        ("case", ("case-study", "case-studies", "cases", "results", "clientes")),
        ("blog", ("blog", "guide", "guides", "article", "articles")),
        ("about", ("about", "sobre")),
        ("contact", ("contact", "contato")),
    ]
    for kind, needles in tests:
        if any(n in path for n in needles):
            return kind
    return "content"


def select_representative_urls(raw_url: str, sitemap: dict[str, Any], max_pages: int = 6) -> list[dict[str, Any]]:
    root = raw_url
    pool = [{"url": root, "lastmod": None, "kind": "home"}]
    for item in sitemap.get("urls") or []:
        pool.append({**item, "kind": page_kind(item["url"])})

    priorities = ["home", "pricing", "tool", "service", "case", "blog", "about", "contact", "content"]
    selected: list[dict[str, Any]] = []
    seen: set[str] = set()
    for kind in priorities:
        candidates = [p for p in pool if p["kind"] == kind and p["url"] not in seen]
        candidates.sort(key=lambda x: (x.get("lastmod") or "", -len(urlparse(x["url"]).path)), reverse=True)
        if candidates:
            item = candidates[0]
            selected.append(item)
            seen.add(item["url"])
        if len(selected) >= max_pages:
            break
    if len(selected) < max_pages:
        for item in pool:
            if item["url"] in seen:
                continue
            selected.append(item)
            seen.add(item["url"])
            if len(selected) >= max_pages:
                break
    return selected


async def commoncrawl_snapshot(raw_url: str) -> dict[str, Any]:
    """Return the newest public Common Crawl snapshot for a URL."""
    async with httpx.AsyncClient(
        verify=True,
        trust_env=False,
        follow_redirects=True,
        limits=httpx.Limits(max_connections=3, max_keepalive_connections=2),
    ) as client:
        try:
            record, index = await _lookup_record(client, raw_url)
            if not record or not index:
                return {"available": False, "source": "common_crawl", "reason": "no_recent_snapshot"}
            payload, archived_headers = await _fetch_warc(client, record)
            if not payload:
                return {"available": False, "source": "common_crawl", "reason": "snapshot_fetch_failed"}
            static = _parse_static(record.get("url") or raw_url, payload, 200)
            return {
                "available": True,
                "source": "common_crawl",
                "index_id": index.get("id"),
                "index_name": index.get("name"),
                "snapshot_timestamp": _timestamp_iso(record.get("timestamp")),
                "captured_url": record.get("url"),
                "mime": record.get("mime"),
                "digest": record.get("digest"),
                "static": static,
                "archived_headers": archived_headers,
                "freshness_disclosure": "Archived public snapshot. Valid for content/structure evidence at capture time; not current performance or security state.",
            }
        except Exception as exc:
            return {"available": False, "source": "common_crawl", "reason": "fallback_error", "error": str(exc)[:800]}


async def commoncrawl_site_sample(raw_url: str, max_pages: int = 6) -> dict[str, Any]:
    """Use current sitemap discovery + timestamped Common Crawl HTML for representative pages."""
    sitemap = await discover_sitemap_urls(raw_url, max_urls=300)
    selected = select_representative_urls(raw_url, sitemap, max_pages=max(1, min(max_pages, 8)))
    pages: list[dict[str, Any]] = []
    async with httpx.AsyncClient(
        verify=True,
        trust_env=False,
        follow_redirects=True,
        limits=httpx.Limits(max_connections=2, max_keepalive_connections=2),
    ) as client:
        try:
            indexes = await _latest_indexes(client)
        except Exception as exc:
            return {"available": False, "source": "common_crawl", "reason": "index_unavailable", "error": str(exc)[:500], "sitemap": sitemap}

        for idx, item in enumerate(selected):
            if idx:
                await asyncio.sleep(0.20)
            record, index = await _lookup_record(client, item["url"], indexes=indexes)
            if not record or not index:
                pages.append({**item, "available": False, "reason": "no_recent_snapshot"})
                continue
            payload, _headers = await _fetch_warc(client, record)
            if not payload:
                pages.append({**item, "available": False, "reason": "snapshot_fetch_failed"})
                continue
            pages.append({
                **item,
                "available": True,
                "source": "common_crawl",
                "index_id": index.get("id"),
                "snapshot_timestamp": _timestamp_iso(record.get("timestamp")),
                "captured_url": record.get("url"),
                "digest": record.get("digest"),
                "static": _parse_static(record.get("url") or item["url"], payload, 200),
            })

    valid = [p for p in pages if p.get("available")]
    return {
        "available": bool(valid),
        "source": "common_crawl_site_sample",
        "current_sitemap": sitemap,
        "selected_pages": selected,
        "pages": pages,
        "valid_pages": len(valid),
        "requested_pages": len(selected),
        "disclosure": "Current sitemap is used only for URL discovery. Page content comes from timestamped Common Crawl snapshots and is not treated as current performance/security evidence.",
    }
