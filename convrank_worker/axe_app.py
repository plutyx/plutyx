from __future__ import annotations

import asyncio
import base64
import hashlib
import time
from typing import Any

import httpx
from axe_playwright_python.async_playwright import Axe
from fastapi import FastAPI, Header, HTTPException
from playwright.async_api import async_playwright

from convrank_worker.app import (
    AuditRequest,
    extract_static,
    findings,
    now_iso,
    require_token,
    robots_allows,
    safe_get,
    validate_public_url,
)

APP_VERSION = "0.3.2"
app = FastAPI(title="ConvRank SAC Audit Worker + axe-core", version=APP_VERSION)


def detect_access_limit(response: httpx.Response, static: dict[str, Any], rendered: dict[str, Any]) -> dict[str, Any]:
    static_title = str(static.get("title") or "").strip().lower()
    rendered_title = str(((rendered.get("metrics") or {}).get("title") or "")).strip().lower()
    body = response.text[:100000].lower()
    server = str(response.headers.get("server") or "").lower()
    markers = [
        "just a moment",
        "attention required",
        "verify you are human",
        "checking your browser",
        "security verification",
        "cf-chl-",
        "challenge-platform",
        "cloudflare ray id",
    ]
    matched = next(
        (
            marker
            for marker in markers
            if marker in static_title or marker in rendered_title or marker in body
        ),
        None,
    )
    protected_status = response.status_code in {401, 403, 429}
    cloudflare_hint = "cloudflare" in server or "cf-ray" in {k.lower() for k in response.headers.keys()}
    limited = bool(matched or (protected_status and cloudflare_hint))
    return {
        "limited": limited,
        "reason": "anti_bot_or_access_challenge" if limited else None,
        "http_status": response.status_code,
        "marker": matched,
        "server_hint": "cloudflare" if cloudflare_hint else None,
        "disclosure": "Challenge/access pages are not scored as target website content." if limited else None,
    }


async def render_and_axe(url: str, screenshot: bool) -> dict[str, Any]:
    browser = None
    navigation_warning = None
    started = time.perf_counter()
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            page = await browser.new_page(
                viewport={"width": 390, "height": 844},
                device_scale_factor=1,
            )

            async def route_handler(route):
                resource_type = route.request.resource_type
                blocked = {"font", "media"}
                if not screenshot:
                    blocked.add("image")
                if resource_type in blocked:
                    await route.abort()
                else:
                    await route.continue_()

            await page.route("**/*", route_handler)

            console_errors: list[str] = []
            page.on(
                "console",
                lambda msg: console_errors.append(msg.text[:500])
                if msg.type == "error" and len(console_errors) < 20
                else None,
            )

            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=14000)
            except Exception as exc:
                navigation_warning = str(exc)[:500]
                try:
                    html = await page.content()
                except Exception:
                    html = ""
                if len(html) < 200:
                    return {
                        "available": False,
                        "error": "render_navigation_failed",
                        "navigation_warning": navigation_warning,
                        "axe": {"available": False},
                        "duration_ms": round((time.perf_counter() - started) * 1000),
                    }

            await page.wait_for_timeout(700)

            metrics = await page.evaluate(
                """
                () => {
                  const nav = performance.getEntriesByType('navigation')[0];
                  const controls = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')];
                  const missingLabels = controls.filter(el => {
                    if (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby')) return false;
                    if (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) return false;
                    return !el.closest('label');
                  }).length;
                  const unnamedButtons = [...document.querySelectorAll('button,[role=button]')].filter(
                    el => !((el.innerText || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '').trim())
                  ).length;
                  return {
                    title: document.title || null,
                    h1_count: document.querySelectorAll('h1').length,
                    images: document.images.length,
                    images_missing_alt: [...document.images].filter(i => !i.hasAttribute('alt')).length,
                    form_controls: controls.length,
                    form_controls_missing_label: missingLabels,
                    unnamed_buttons: unnamedButtons,
                    horizontal_overflow_px: Math.max(0, document.documentElement.scrollWidth - innerWidth),
                    timing: nav ? {
                      ttfb_ms: Math.round(nav.responseStart),
                      dom_content_loaded_ms: Math.round(nav.domContentLoadedEventEnd),
                      load_ms: Math.round(nav.loadEventEnd || 0)
                    } : null,
                    resource_count: performance.getEntriesByType('resource').length
                  };
                }
                """
            )

            axe_engine: dict[str, Any]
            try:
                axe_result = await asyncio.wait_for(Axe().run(page=page), timeout=7.0)
                raw = axe_result.response
                violations = []
                for item in raw.get("violations", []):
                    violations.append(
                        {
                            "id": item.get("id"),
                            "impact": item.get("impact"),
                            "description": item.get("description"),
                            "help": item.get("help"),
                            "help_url": item.get("helpUrl"),
                            "tags": item.get("tags", []),
                            "nodes_count": len(item.get("nodes", [])),
                            "targets": [node.get("target", []) for node in item.get("nodes", [])[:5]],
                        }
                    )
                axe_engine = {
                    "available": True,
                    "version": (raw.get("testEngine") or {}).get("version"),
                    "violations_count": len(raw.get("violations", [])),
                    "passes_count": len(raw.get("passes", [])),
                    "incomplete_count": len(raw.get("incomplete", [])),
                    "inapplicable_count": len(raw.get("inapplicable", [])),
                    "violations": violations,
                    "disclosure": "Automated axe-core findings do not replace manual WCAG evaluation.",
                }
            except asyncio.TimeoutError:
                axe_engine = {
                    "available": False,
                    "error": "axe_budget_exceeded_7s",
                    "degraded": True,
                }
            except Exception as exc:
                axe_engine = {"available": False, "error": str(exc)[:1000]}

            shot_b64 = None
            shot_hash = None
            if screenshot:
                raw_shot = await page.screenshot(type="jpeg", quality=55, full_page=False)
                shot_hash = hashlib.sha256(raw_shot).hexdigest()
                shot_b64 = base64.b64encode(raw_shot).decode("ascii")

            return {
                "available": True,
                "metrics": metrics,
                "console_errors": console_errors,
                "axe": axe_engine,
                "navigation_warning": navigation_warning,
                "screenshot_sha256": shot_hash,
                "screenshot_base64_jpeg": shot_b64,
                "duration_ms": round((time.perf_counter() - started) * 1000),
                "preview_budget": "fast-path",
            }
    except Exception as exc:
        return {
            "available": False,
            "error": str(exc)[:1000],
            "axe": {"available": False},
            "duration_ms": round((time.perf_counter() - started) * 1000),
        }
    finally:
        if browser is not None:
            try:
                await browser.close()
            except Exception:
                pass


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
            "javascript_rendering": True,
            "rendered_mobile_checks": True,
            "screenshot": True,
            "navigation_timing": True,
            "axe_core": True,
            "lighthouse": False,
            "multimodal_vision": False,
            "official_sac_score": False,
            "graceful_preview_degradation": True,
            "anti_bot_challenge_detection": True,
        },
    }


@app.post("/audit")
async def audit(
    req: AuditRequest,
    x_sac_worker_token: str | None = Header(default=None),
) -> dict[str, Any]:
    require_token(x_sac_worker_token)
    started = time.perf_counter()
    root = await validate_public_url(str(req.url))

    async with httpx.AsyncClient(
        verify=True,
        trust_env=False,
        limits=httpx.Limits(max_connections=6, max_keepalive_connections=3),
    ) as client:
        robots_found, allowed = await robots_allows(client, root)
        if not allowed:
            raise HTTPException(status_code=403, detail="Blocked by robots.txt for SAC-AuditBot")
        response, final_url = await safe_get(client, root)
        if "text/html" not in response.headers.get("content-type", "").lower():
            raise HTTPException(status_code=415, detail="Target did not return HTML")
        static = extract_static(final_url, response)

        if req.render_js:
            try:
                rendered = await asyncio.wait_for(
                    render_and_axe(final_url, req.include_screenshot),
                    timeout=30.0,
                )
            except asyncio.TimeoutError:
                rendered = {
                    "available": False,
                    "error": "render_budget_exceeded_30s",
                    "degraded": True,
                    "axe": {"available": False, "error": "skipped_after_render_budget"},
                }
        else:
            rendered = {"available": False, "error": "render_disabled_by_request", "axe": {"available": False}}

        access = detect_access_limit(response, static, rendered)
        if access["limited"]:
            result_findings: list[dict[str, Any]] = []
            if isinstance(rendered.get("axe"), dict):
                rendered["axe"]["valid_for_target"] = False
        else:
            result_findings = findings(static, rendered, response.headers)

    axe_available = bool((rendered.get("axe") or {}).get("available")) and not access["limited"]
    if axe_available:
        for violation in (rendered.get("axe") or {}).get("violations", []):
            result_findings.append(
                {
                    "criterion_code": f"AXE-{violation.get('id')}",
                    "status": "warning",
                    "title": violation.get("help") or violation.get("id"),
                    "evidence": {
                        "impact": violation.get("impact"),
                        "nodes_count": violation.get("nodes_count"),
                        "targets": violation.get("targets"),
                        "help_url": violation.get("help_url"),
                    },
                    "recommendation": violation.get("description"),
                }
            )

    return {
        "engine": {
            "name": "convrank-sac-audit",
            "version": APP_VERSION,
            "ranking_eligible": False,
            "official_sac_score": False,
        },
        "audit": {
            "requested_url": str(req.url),
            "final_url": final_url,
            "robots_found": robots_found,
            "http_status": response.status_code,
            "duration_ms": round((time.perf_counter() - started) * 1000),
            "completed_at": now_iso(),
        },
        "access": access,
        "static": static,
        "rendered": rendered,
        "findings": result_findings,
        "coverage": {
            "javascript_rendering": bool(rendered.get("available")) and not access["limited"],
            "axe": axe_available,
            "lighthouse": False,
            "visual_ai": False,
            "official_scoring": False,
            "degraded": bool(rendered.get("degraded")),
            "site_content": not access["limited"],
            "access_limited": access["limited"],
            "access_reason": access["reason"],
        },
        "disclosure": (
            "Target website content was not scored because an anti-bot/access challenge page was detected."
            if access["limited"]
            else "Deterministic evidence is always returned. Rendered/axe evidence may degrade under a strict preview budget. No official SAC Score and no claim of actual conversion rate."
        ),
    }
