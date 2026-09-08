from __future__ import annotations

import asyncio
import base64
import hashlib
import os
import re
import time
from typing import Any
from urllib.parse import urlparse

import httpx
from axe_playwright_python.async_playwright import Axe
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field, HttpUrl
from playwright.async_api import async_playwright

from convrank_worker.app import canonicalize, now_iso, require_token, validate_public_url

APP_VERSION = "0.1.0"
MAX_HTML_BYTES = 3_000_000
MAX_RESOURCE_REQUESTS = 140
SNAPSHOT_ENDPOINT = os.getenv("SAC_SNAPSHOT_ENDPOINT", "").rstrip("/")

app = FastAPI(title="ConvRank SAC Signed Snapshot Browser", version=APP_VERSION)


class SnapshotAuditRequest(BaseModel):
    url: HttpUrl
    snapshot_token: str = Field(min_length=36, max_length=36)
    include_screenshot: bool = False


def _strip_active_content(html: str, base_url: str) -> str:
    html = re.sub(r"<script\b[^>]*>[\s\S]*?</script\s*>", "", html, flags=re.I)
    html = re.sub(r"<iframe\b[^>]*>[\s\S]*?</iframe\s*>", "", html, flags=re.I)
    html = re.sub(r"<(object|embed)\b[^>]*>[\s\S]*?</\1\s*>", "", html, flags=re.I)
    html = re.sub(r"<meta\b[^>]+http-equiv=[\"'](?:refresh|content-security-policy)[\"'][^>]*>", "", html, flags=re.I)
    base = f'<base href="{base_url.replace(chr(34), "&quot;")}">'
    marker = '<meta name="sac-snapshot-browser" content="visual-axe-only"><meta name="robots" content="noindex,nofollow,noarchive">'
    if re.search(r"<head\b[^>]*>", html, re.I):
        html = re.sub(r"<head\b[^>]*>", lambda m: m.group(0) + marker + base, html, count=1, flags=re.I)
    else:
        html = f"<!doctype html><html><head>{marker}{base}</head><body>{html}</body></html>"
    return html


async def _fetch_snapshot(token: str, expected_url: str) -> dict[str, Any]:
    if not SNAPSHOT_ENDPOINT:
        raise HTTPException(status_code=503, detail="snapshot_endpoint_not_configured")
    if not re.fullmatch(r"[0-9a-fA-F-]{36}", token):
        raise HTTPException(status_code=400, detail="invalid_snapshot_token")
    async with httpx.AsyncClient(verify=True, trust_env=False, timeout=15.0) as client:
        response = await client.get(SNAPSHOT_ENDPOINT, params={"token": token})
    if response.status_code != 200:
        raise HTTPException(status_code=424, detail=f"snapshot_fetch_failed:{response.status_code}")
    data = response.json()
    if not data.get("ok") or not data.get("html") or not data.get("url"):
        raise HTTPException(status_code=424, detail="snapshot_payload_invalid")
    source_url = canonicalize(str(data["url"]))
    requested = canonicalize(expected_url)
    if source_url != requested:
        raise HTTPException(status_code=409, detail="snapshot_url_mismatch")
    raw = str(data["html"])
    if len(raw.encode("utf-8", errors="ignore")) > MAX_HTML_BYTES:
        raise HTTPException(status_code=413, detail="snapshot_too_large")
    return data


async def _safe_resource(route, cache: dict[str, bool], counters: dict[str, int], include_screenshot: bool) -> None:
    req = route.request
    counters["seen"] += 1
    if counters["seen"] > MAX_RESOURCE_REQUESTS:
        counters["blocked_budget"] += 1
        await route.abort()
        return
    resource_type = req.resource_type
    if resource_type in {"script", "xhr", "fetch", "websocket", "eventsource", "media", "manifest"}:
        counters["blocked_active"] += 1
        await route.abort()
        return
    if resource_type == "image" and not include_screenshot:
        counters["blocked_images"] += 1
        await route.abort()
        return
    url = req.url
    if url.startswith(("data:", "blob:")):
        await route.continue_()
        return
    if not url.startswith(("https://", "http://")):
        await route.abort()
        return
    host = (urlparse(url).hostname or "").lower()
    if not host:
        await route.abort()
        return
    allowed = cache.get(host)
    if allowed is None:
        try:
            await validate_public_url(url)
            allowed = True
        except Exception:
            allowed = False
        cache[host] = allowed
    if not allowed:
        counters["blocked_private"] += 1
        await route.abort()
        return
    await route.continue_()


METRICS_JS = r"""
() => {
  const visible = el => {
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity || '1') > 0 && r.width > 0 && r.height > 0;
  };
  const controls = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(visible);
  const missingLabels = controls.filter(el => {
    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
    return !el.closest('label');
  }).length;
  const buttons = [...document.querySelectorAll('button,[role=button],input[type=submit],input[type=button]')].filter(visible);
  const links = [...document.querySelectorAll('a[href]')].filter(visible);
  const interactive = [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[tabindex]')].filter(visible);
  const target = interactive.map(el => el.getBoundingClientRect());
  const targetUnder24 = target.filter(r => r.width < 24 || r.height < 24).length;
  const targetUnder44 = target.filter(r => r.width < 44 || r.height < 44).length;
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(visible);
  let badHeadingJumps = 0; let last = 0;
  for (const h of headings) { const level = Number(h.tagName.substring(1)); if (last && level > last + 1) badHeadingJumps++; last = level; }
  const positiveTabIndex = interactive.filter(el => Number(el.getAttribute('tabindex') || 0) > 0).length;
  const fixedSticky = [...document.querySelectorAll('body *')].filter(el => {
    if (!visible(el)) return false; const p = getComputedStyle(el).position; return p === 'fixed' || p === 'sticky';
  });
  let maxOverlayPct = 0;
  for (const el of fixedSticky.slice(0,80)) { const r = el.getBoundingClientRect(); const area = Math.max(0, Math.min(r.right, innerWidth)-Math.max(r.left,0)) * Math.max(0, Math.min(r.bottom, innerHeight)-Math.max(r.top,0)); maxOverlayPct = Math.max(maxOverlayPct, area/(innerWidth*innerHeight)); }
  const sample = [...document.querySelectorAll('body *')].filter(visible).slice(0,600);
  const fontFamilies = new Set(); const fontSizes = new Set(); const colors = new Set(); const backgrounds = new Set();
  for (const el of sample) { const s=getComputedStyle(el); if(s.fontFamily) fontFamilies.add(s.fontFamily); if(s.fontSize) fontSizes.add(s.fontSize); if(s.color) colors.add(s.color); if(s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') backgrounds.add(s.backgroundColor); }
  const buttonSigs = buttons.map(el => { const s=getComputedStyle(el); return [s.backgroundColor,s.color,s.borderRadius,s.fontSize,s.fontWeight,s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].join('|'); });
  const buttonVariants = new Set(buttonSigs).size;
  const cards = sample.filter(el => /(^|\s)(card|tile|panel|box)(\s|$)/i.test(el.className || '') || el.getAttribute('data-card') !== null);
  const cardSigs = cards.map(el => { const s=getComputedStyle(el); return [s.backgroundColor,s.borderRadius,s.boxShadow,s.borderWidth,s.paddingTop,s.paddingRight,s.paddingBottom,s.paddingLeft].join('|'); });
  const paragraphs = [...document.querySelectorAll('p')].filter(visible);
  const paragraphWidths = paragraphs.map(el => el.getBoundingClientRect().width).filter(Boolean);
  const h1 = document.querySelector('h1'); const bodyStyle=getComputedStyle(document.body); const h1Style=h1?getComputedStyle(h1):null;
  const textChars = (document.body.innerText || '').replace(/\s+/g,' ').trim().length;
  return {
    title: document.title || null,
    h1_count: document.querySelectorAll('h1').length,
    heading_count: headings.length,
    heading_order_jumps: badHeadingJumps,
    images: document.images.length,
    images_missing_alt: [...document.images].filter(i => !i.hasAttribute('alt')).length,
    form_controls: controls.length,
    form_controls_missing_label: missingLabels,
    buttons: buttons.length,
    unnamed_buttons: buttons.filter(el => !((el.innerText || el.value || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '').trim())).length,
    links: links.length,
    unnamed_links: links.filter(el => !((el.innerText || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || el.querySelector('img[alt]')?.getAttribute('alt') || '').trim())).length,
    interactive_count: interactive.length,
    target_under_24: targetUnder24,
    target_under_44: targetUnder44,
    positive_tabindex: positiveTabIndex,
    horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    document_scroll_width: document.documentElement.scrollWidth,
    document_scroll_height: document.documentElement.scrollHeight,
    viewport_width: innerWidth,
    viewport_height: innerHeight,
    landmarks: {
      main: document.querySelectorAll('main,[role=main]').length,
      nav: document.querySelectorAll('nav,[role=navigation]').length,
      header: document.querySelectorAll('header,[role=banner]').length,
      footer: document.querySelectorAll('footer,[role=contentinfo]').length,
      aside: document.querySelectorAll('aside,[role=complementary]').length
    },
    dialogs: document.querySelectorAll('dialog,[role=dialog],[aria-modal=true]').length,
    live_regions: document.querySelectorAll('[aria-live],[role=status],[role=alert]').length,
    fixed_sticky_count: fixedSticky.length,
    max_fixed_overlay_pct: Number(maxOverlayPct.toFixed(4)),
    css: {
      font_family_variants: fontFamilies.size,
      font_size_variants: fontSizes.size,
      text_color_variants: colors.size,
      background_color_variants: backgrounds.size,
      button_style_variants: buttonVariants,
      card_count: cards.length,
      card_style_variants: new Set(cardSigs).size,
      body_font_px: parseFloat(bodyStyle.fontSize || '0'),
      h1_font_px: h1Style ? parseFloat(h1Style.fontSize || '0') : 0,
      h1_body_ratio: h1Style && parseFloat(bodyStyle.fontSize || '0') ? Number((parseFloat(h1Style.fontSize)/parseFloat(bodyStyle.fontSize)).toFixed(2)) : null,
      paragraph_width_avg: paragraphWidths.length ? Math.round(paragraphWidths.reduce((a,b)=>a+b,0)/paragraphWidths.length) : null,
      paragraph_width_max: paragraphWidths.length ? Math.round(Math.max(...paragraphWidths)) : null
    },
    text_chars: textChars
  };
}
"""


async def _focus_probe(page, max_tabs: int = 40) -> dict[str, Any]:
    total = await page.evaluate("() => [...document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button],[tabindex]')].filter(e => { const s=getComputedStyle(e),r=e.getBoundingClientRect(); return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&Number(e.getAttribute('tabindex')||0)>=0; }).length")
    steps = min(int(total or 0), max_tabs)
    seen: list[str] = []
    no_visible_focus = 0
    for _ in range(steps):
        await page.keyboard.press("Tab")
        state = await page.evaluate("""() => { const e=document.activeElement; if(!e||e===document.body) return null; const s=getComputedStyle(e); const r=e.getBoundingClientRect(); const label=(e.innerText||e.value||e.getAttribute('aria-label')||'').trim().slice(0,100); const focusVisible = (s.outlineStyle && s.outlineStyle !== 'none' && parseFloat(s.outlineWidth||'0')>0) || (s.boxShadow && s.boxShadow !== 'none'); return {tag:e.tagName.toLowerCase(),id:e.id||null,label,focus_visible:!!focusVisible,in_view:r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth}; }""")
        if not state:
            continue
        key = f"{state.get('tag')}#{state.get('id') or ''}:{state.get('label') or ''}"
        seen.append(key)
        if not state.get("focus_visible"):
            no_visible_focus += 1
    return {"focusable_total": int(total or 0), "tab_steps": steps, "unique_reached": len(set(seen)), "no_visible_focus": no_visible_focus, "sample": seen[:20]}


async def _axe(page) -> dict[str, Any]:
    try:
        result = await asyncio.wait_for(Axe().run(page=page), timeout=9.0)
        raw = result.response
        violations = []
        for item in raw.get("violations", []):
            violations.append({
                "id": item.get("id"),
                "impact": item.get("impact"),
                "help": item.get("help"),
                "description": item.get("description"),
                "help_url": item.get("helpUrl"),
                "tags": item.get("tags", []),
                "nodes_count": len(item.get("nodes", [])),
                "targets": [n.get("target", []) for n in item.get("nodes", [])[:5]],
            })
        return {
            "available": True,
            "version": (raw.get("testEngine") or {}).get("version"),
            "violations_count": len(raw.get("violations", [])),
            "passes_count": len(raw.get("passes", [])),
            "incomplete_count": len(raw.get("incomplete", [])),
            "inapplicable_count": len(raw.get("inapplicable", [])),
            "violations": violations,
            "disclosure": "axe-core automated coverage; manual WCAG testing is not implied.",
        }
    except asyncio.TimeoutError:
        return {"available": False, "error": "axe_timeout_9s"}
    except Exception as exc:
        return {"available": False, "error": str(exc)[:1000]}


async def _render_snapshot(html: str, base_url: str, include_screenshot: bool) -> dict[str, Any]:
    started = time.perf_counter()
    host_cache: dict[str, bool] = {}
    counters = {"seen": 0, "blocked_budget": 0, "blocked_active": 0, "blocked_images": 0, "blocked_private": 0}
    safe_html = _strip_active_content(html, base_url)
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-networking"])
        try:
            context = await browser.new_context(java_script_enabled=False, viewport={"width": 390, "height": 844}, device_scale_factor=1, service_workers="block")
            page = await context.new_page()
            await page.route("**/*", lambda route: _safe_resource(route, host_cache, counters, include_screenshot))
            await page.set_content(safe_html, wait_until="domcontentloaded", timeout=16000)
            await page.wait_for_timeout(700)
            mobile = await page.evaluate(METRICS_JS)
            focus = await _focus_probe(page)
            axe = await _axe(page)
            mobile_shot = None
            mobile_hash = None
            if include_screenshot:
                shot = await page.screenshot(type="jpeg", quality=55, full_page=False)
                mobile_hash = hashlib.sha256(shot).hexdigest()
                mobile_shot = base64.b64encode(shot).decode("ascii")
            await page.set_viewport_size({"width": 1440, "height": 1000})
            await page.wait_for_timeout(250)
            desktop = await page.evaluate(METRICS_JS)
            desktop_hash = None
            desktop_shot = None
            if include_screenshot:
                shot = await page.screenshot(type="jpeg", quality=55, full_page=False)
                desktop_hash = hashlib.sha256(shot).hexdigest()
                desktop_shot = base64.b64encode(shot).decode("ascii")
            return {
                "available": True,
                "source_kind": "current_signed_snapshot_browser",
                "javascript_executed": False,
                "performance_valid": False,
                "mobile": mobile,
                "desktop": desktop,
                "focus": focus,
                "axe": axe,
                "network_policy": counters,
                "screenshot_mobile_sha256": mobile_hash,
                "screenshot_mobile_base64_jpeg": mobile_shot,
                "screenshot_desktop_sha256": desktop_hash,
                "screenshot_desktop_base64_jpeg": desktop_shot,
                "duration_ms": round((time.perf_counter() - started) * 1000),
            }
        finally:
            await browser.close()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "convrank-sac-snapshot-axe",
        "version": APP_VERSION,
        "time": now_iso(),
        "capabilities": {
            "signed_current_snapshot": True,
            "page_set_content": True,
            "javascript_executed": False,
            "private_network_blocking": True,
            "active_network_blocking": True,
            "mobile_desktop_viewports": True,
            "axe_core": True,
            "focus_probe": True,
            "computed_visual_metrics": True,
            "performance_valid": False,
            "official_sac_score": False,
        },
    }


@app.post("/audit")
async def audit(req: SnapshotAuditRequest, x_sac_worker_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(x_sac_worker_token)
    started = time.perf_counter()
    requested = await validate_public_url(str(req.url))
    payload = await _fetch_snapshot(req.snapshot_token, requested)
    rendered = await asyncio.wait_for(_render_snapshot(str(payload["html"]), requested, req.include_screenshot), timeout=40.0)
    return {
        "engine": {"name": "convrank-sac-snapshot-axe", "version": APP_VERSION, "ranking_eligible": False, "official_sac_score": False},
        "audit": {"requested_url": requested, "captured_at": payload.get("captured_at"), "html_sha256": payload.get("html_sha256"), "completed_at": now_iso(), "duration_ms": round((time.perf_counter()-started)*1000)},
        "content_source": {"kind": "current_signed_snapshot", "current": True, "performance_valid": False, "javascript_executed": False},
        "rendered": rendered,
        "coverage": {"axe": bool((rendered.get("axe") or {}).get("available")), "mobile": True, "desktop": True, "focus": True, "visual_metrics": True, "origin_performance": False, "javascript_runtime": False},
        "disclosure": "This fallback renders a current signed HTML snapshot with page JavaScript disabled. It is valid for DOM/CSS/axe/viewport evidence only and is never used as origin performance evidence.",
    }
