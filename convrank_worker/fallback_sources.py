from __future__ import annotations

import io
import json
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup
from warcio.archiveiterator import ArchiveIterator

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


async def _lookup_record(client: httpx.AsyncClient, raw_url: str) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    indexes = await _latest_indexes(client)
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
    headers = {
        "User-Agent": FALLBACK_UA,
        "Range": f"bytes={offset}-{offset + length - 1}",
    }
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


async def commoncrawl_snapshot(raw_url: str) -> dict[str, Any]:
    """Return the newest public Common Crawl snapshot for a URL.

    This is a provenance-preserving fallback, not an attempt to bypass a site's
    current access controls. The response is explicitly timestamped and must not
    be used for current performance/security assertions.
    """
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
