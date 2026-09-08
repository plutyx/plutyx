from __future__ import annotations

import asyncio
import base64
import hashlib
import ipaddress
import os
import re
import socket
import time
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse, urlunparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl

try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_IMPORT_OK = True
except Exception:
    async_playwright = None
    PLAYWRIGHT_IMPORT_OK = False

APP_VERSION = "0.2.0"
USER_AGENT = "SAC-AuditBot/0.2 (+https://plutyx.com)"
MAX_REDIRECTS = 5
MAX_BODY_BYTES = 3_000_000

app = FastAPI(title="ConvRank SAC Audit Worker", version=APP_VERSION)


class AuditRequest(BaseModel):
    url: HttpUrl
    max_pages: int = Field(default=10, ge=1, le=25)
    render_js: bool = True
    include_screenshot: bool = False


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def canonicalize(raw: str) -> str:
    p = urlparse(raw)
    host = (p.hostname or "").lower().rstrip(".")
    if p.scheme.lower() not in {"http", "https"} or not host:
        raise HTTPException(status_code=400, detail="Only absolute HTTP(S) URLs are allowed")
    port = p.port
    netloc = host
    if port and not ((p.scheme == "http" and port == 80) or (p.scheme == "https" and port == 443)):
        netloc = f"{host}:{port}"
    return urlunparse(p._replace(scheme=p.scheme.lower(), netloc=netloc, path=p.path or "/", fragment=""))


def blocked_ip(value: str) -> bool:
    ip = ipaddress.ip_address(value)
    return any((ip.is_private, ip.is_loopback, ip.is_link_local, ip.is_multicast, ip.is_reserved, ip.is_unspecified))


async def validate_public_url(raw: str) -> str:
    url = canonicalize(raw)
    host = urlparse(url).hostname or ""
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.run_in_executor(None, lambda: socket.getaddrinfo(host, None, type=socket.SOCK_STREAM))
    except socket.gaierror as exc:
        raise HTTPException(status_code=400, detail=f"DNS resolution failed: {exc}") from exc
    addresses = sorted({x[4][0] for x in infos})
    if not addresses or any(blocked_ip(a) for a in addresses):
        raise HTTPException(status_code=400, detail="Hostname resolves to a private/reserved address")
    return url


async def safe_get(client: httpx.AsyncClient, raw: str, timeout: float = 12.0) -> tuple[httpx.Response, str]:
    current = await validate_public_url(raw)
    for _ in range(MAX_REDIRECTS + 1):
        r = await client.get(current, follow_redirects=False, timeout=timeout, headers={"User-Agent": USER_AGENT, "Accept": "text/html,*/*;q=0.1"})
        if r.status_code in {301, 302, 303, 307, 308}:
            location = r.headers.get("location")
            if not location:
                return r, current
            current = await validate_public_url(urljoin(current, location))
            continue
        return r, current
    raise HTTPException(status_code=400, detail="Too many redirects")


def extract_static(url: str, response: httpx.Response) -> dict[str, Any]:
    body = response.content[:MAX_BODY_BYTES]
    html = body.decode(response.encoding or "utf-8", errors="replace")
    soup = BeautifulSoup(html, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else None
    desc_node = soup.find("meta", attrs={"name": "description"})
    viewport_node = soup.find("meta", attrs={"name": "viewport"})
    canonical_node = soup.find("link", rel=lambda v: v and "canonical" in v)
    h1s = [x.get_text(" ", strip=True) for x in soup.find_all("h1") if x.get_text(" ", strip=True)]
    images = soup.find_all("img")
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
        "status": response.status_code,
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
        "html_hash": hashlib.sha256(body).hexdigest(),
    }


async def robots_allows(client: httpx.AsyncClient, root: str) -> tuple[bool, bool]:
    p = urlparse(root)
    robots_url = f"{p.scheme}://{p.netloc}/robots.txt"
    rp = RobotFileParser()
    try:
        r, _ = await safe_get(client, robots_url, timeout=8)
        if r.status_code == 200 and len(r.content) < 1_000_000:
            rp.parse(r.text.splitlines())
            return True, rp.can_fetch(USER_AGENT, root)
    except Exception:
        pass
    return False, True


async def render_page(url: str, screenshot: bool) -> dict[str, Any]:
    if not PLAYWRIGHT_IMPORT_OK or not async_playwright:
        return {"available": False, "error": "playwright_import_unavailable"}
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
            page = await browser.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=1)
            console_errors: list[str] = []
            page.on("console", lambda msg: console_errors.append(msg.text[:500]) if msg.type == "error" and len(console_errors) < 20 else None)
            await page.goto(url, wait_until="domcontentloaded", timeout=25000)
            try:
                await page.wait_for_load_state("networkidle", timeout=5000)
            except Exception:
                pass
            metrics = await page.evaluate("""
            () => {
              const nav = performance.getEntriesByType('navigation')[0];
              const qs = (s) => document.querySelectorAll(s).length;
              const missingLabels = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(el => {
                if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
                if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
                return !el.closest('label');
              }).length;
              const unnamedButtons = [...document.querySelectorAll('button, [role=button]')].filter(el => !((el.innerText || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '').trim())).length;
              return {
                title: document.title || null,
                h1_count: qs('h1'),
                images: qs('img'),
                images_missing_alt: [...document.images].filter(i => !i.hasAttribute('alt')).length,
                form_controls: qs('input:not([type=hidden]),select,textarea'),
                form_controls_missing_label: missingLabels,
                unnamed_buttons: unnamedButtons,
                horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - innerWidth),
                timing: nav ? {
                  ttfb_ms: Math.round(nav.responseStart),
                  dom_content_loaded_ms: Math.round(nav.domContentLoadedEventEnd),
                  load_ms: Math.round(nav.loadEventEnd || 0)
                } : null,
                resources: performance.getEntriesByType('resource').slice(0, 300).map(r => r.name)
              };
            }
            """)
            shot_b64 = None
            shot_hash = None
            if screenshot:
                raw = await page.screenshot(type="jpeg", quality=55, full_page=False)
                shot_hash = hashlib.sha256(raw).hexdigest()
                shot_b64 = base64.b64encode(raw).decode("ascii")
            await browser.close()
            return {"available": True, "metrics": metrics, "console_errors": console_errors, "screenshot_sha256": shot_hash, "screenshot_base64_jpeg": shot_b64}
    except Exception as exc:
        return {"available": False, "error": str(exc)[:1000]}


def findings(static: dict[str, Any], rendered: dict[str, Any], headers: httpx.Headers) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    def add(code: str, status: str, title: str, evidence: dict[str, Any], recommendation: str | None = None):
        out.append({"criterion_code": code, "status": status, "title": title, "evidence": evidence, "recommendation": recommendation})
    add("EXT-024", "pass" if static.get("title") else "warning", "Título da página", {"title": static.get("title")}, "Adicionar title único e descritivo" if not static.get("title") else None)
    add("EXT-025", "pass" if static.get("description") else "opportunity", "Meta description", {"description": static.get("description")}, "Adicionar descrição útil" if not static.get("description") else None)
    add("PDF-018", "pass" if len(static.get("h1s") or []) == 1 else "warning", "Hierarquia H1", {"h1s": static.get("h1s")})
    add("PDF-022", "pass" if static.get("viewport") else "critical", "Viewport mobile", {"viewport": static.get("viewport")})
    add("EXT-012", "pass" if static.get("images_missing_alt", 0) == 0 else "warning", "Texto alternativo de imagens", {"images": static.get("images"), "missing_alt": static.get("images_missing_alt")})
    add("EXT-041", "pass" if static.get("json_ld_blocks", 0) > 0 else "opportunity", "Dados estruturados", {"json_ld_blocks": static.get("json_ld_blocks")})
    tracker_count = sum(1 for v in (static.get("trackers") or {}).values() if v)
    add("SAC-TRACK-001", "pass" if tracker_count else "info", "Sinais públicos de mensuração", {"trackers": static.get("trackers")})
    add("SAC-SEC-HSTS", "pass" if headers.get("strict-transport-security") else "warning", "HSTS", {"header": headers.get("strict-transport-security")})
    add("SAC-SEC-CSP", "pass" if headers.get("content-security-policy") else "warning", "Content Security Policy", {"header": headers.get("content-security-policy")})
    if rendered.get("available"):
        m = rendered.get("metrics") or {}
        add("SAC-RENDER-MOBILE", "pass" if (m.get("horizontal_overflow_px") or 0) <= 0 else "warning", "Overflow mobile renderizado", {"overflow_px": m.get("horizontal_overflow_px")})
        add("SAC-A11Y-LABEL", "pass" if (m.get("form_controls_missing_label") or 0) == 0 else "warning", "Rótulos de formulário no DOM renderizado", {"controls": m.get("form_controls"), "missing_labels": m.get("form_controls_missing_label")})
        add("SAC-A11Y-BUTTON", "pass" if (m.get("unnamed_buttons") or 0) == 0 else "warning", "Nomes acessíveis de botões", {"unnamed_buttons": m.get("unnamed_buttons")})
    return out


def require_token(value: str | None) -> None:
    expected = os.getenv("SAC_WORKER_TOKEN")
    if expected and value != expected:
        raise HTTPException(status_code=401, detail="Invalid worker token")


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "convrank-sac-audit",
        "version": APP_VERSION,
        "time": now_iso(),
        "capabilities": {
            "safe_public_fetch": True,
            "robots": True,
            "html_parse": True,
            "javascript_rendering": PLAYWRIGHT_IMPORT_OK,
            "rendered_mobile_checks": PLAYWRIGHT_IMPORT_OK,
            "screenshot": PLAYWRIGHT_IMPORT_OK,
            "navigation_timing": PLAYWRIGHT_IMPORT_OK,
            "lighthouse": False,
            "axe": False,
            "multimodal_vision": False,
            "official_sac_score": False,
        },
    }


@app.post("/audit")
async def audit(req: AuditRequest, x_sac_worker_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(x_sac_worker_token)
    started = time.perf_counter()
    root = await validate_public_url(str(req.url))
    async with httpx.AsyncClient(verify=True, trust_env=False, limits=httpx.Limits(max_connections=6, max_keepalive_connections=3)) as client:
        robots_found, allowed = await robots_allows(client, root)
        if not allowed:
            raise HTTPException(status_code=403, detail="Blocked by robots.txt for SAC-AuditBot")
        response, final_url = await safe_get(client, root)
        if "text/html" not in response.headers.get("content-type", "").lower():
            raise HTTPException(status_code=415, detail="Target did not return HTML")
        static = extract_static(final_url, response)
        rendered = await render_page(final_url, req.include_screenshot) if req.render_js else {"available": False, "error": "render_disabled_by_request"}
        result_findings = findings(static, rendered, response.headers)
    return {
        "engine": {"name": "convrank-sac-audit", "version": APP_VERSION, "official_sac_score": False, "ranking_eligible": False},
        "audit": {"requested_url": str(req.url), "final_url": final_url, "robots_found": robots_found, "http_status": response.status_code, "duration_ms": round((time.perf_counter() - started) * 1000), "completed_at": now_iso()},
        "static": static,
        "rendered": rendered,
        "findings": result_findings,
        "coverage": {"javascript_rendering": bool(rendered.get("available")), "lighthouse": False, "axe": False, "visual_ai": False, "official_scoring": False},
        "disclosure": "Rendered and deterministic evidence only. This endpoint does not produce an official SAC Score or claim actual conversion rate."
    }
