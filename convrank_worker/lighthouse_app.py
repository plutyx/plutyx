from __future__ import annotations

import asyncio
import gc
import json
import os
import signal
import time
from pathlib import Path
from typing import Any

import httpx
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
from convrank_worker.axe_app import archived_findings, detect_access_limit, render_and_axe
from convrank_worker.fallback_sources import commoncrawl_site_sample

APP_VERSION = "0.6.0"
ROOT = Path(__file__).resolve().parent
LIGHTHOUSE_BIN = ROOT / "node_modules" / ".bin" / "lighthouse"
LIGHTHOUSE_BUDGET_SECONDS = 55
RENDER_BUDGET_SECONDS = 25
PROCESS_REAP_SECONDS = 5
REQUEST_BUDGET_SECONDS = 120
CANCELLATION_GRACE_SECONDS = 8
_active_audits: set[asyncio.Task] = set()
app = FastAPI(title="ConvRank GCL Audit Worker + axe-core + Lighthouse", version=APP_VERSION)


async def chrome_executable() -> str:
    async with async_playwright() as p:
        return p.chromium.executable_path


def compact_audit(item: dict[str, Any] | None) -> dict[str, Any] | None:
    if not item:
        return None
    return {
        "score": item.get("score"),
        "numeric_value": item.get("numericValue"),
        "numeric_unit": item.get("numericUnit"),
        "display_value": item.get("displayValue"),
    }


async def terminate_process_tree(proc: asyncio.subprocess.Process | None) -> None:
    """Terminate Lighthouse and its Chromium descendants, then reap boundedly.

    Lighthouse launches Chrome as a child process. Killing only the Node CLI can leave
    Chromium holding stdout/stderr pipe descriptors open, which can make communicate()
    hang past the upstream HTTP transport timeout and retain hundreds of MB of memory.
    Render is Linux, so every Lighthouse run is started in a dedicated process group.
    """
    if proc is None:
        return
    # The CLI can exit before Chrome; its process group may still hold the pipes.
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except Exception:
        if proc.returncode is None:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            except Exception:
                pass
    try:
        await asyncio.wait_for(proc.communicate(), timeout=PROCESS_REAP_SECONDS)
    except Exception:
        pass


async def run_lighthouse(url: str) -> dict[str, Any]:
    if not LIGHTHOUSE_BIN.exists():
        return {"available": False, "error": "lighthouse_binary_missing"}
    proc = None
    started = time.perf_counter()
    try:
        chrome = await chrome_executable()
        env = os.environ.copy()
        env["CHROME_PATH"] = chrome
        env.setdefault("NODE_OPTIONS", "--max-old-space-size=160")
        cmd = [
            str(LIGHTHOUSE_BIN),
            url,
            "--output=json",
            "--quiet",
            "--only-categories=performance,seo,best-practices",
            "--form-factor=mobile",
            "--max-wait-for-fcp=12000",
            "--max-wait-for-load=25000",
            "--no-enable-error-reporting",
            "--chrome-flags=--headless --no-sandbox --disable-dev-shm-usage --disable-gpu --disable-background-networking --disable-extensions --disable-sync --no-first-run --no-default-browser-check",
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            start_new_session=True,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=LIGHTHOUSE_BUDGET_SECONDS)
        except asyncio.TimeoutError:
            await terminate_process_tree(proc)
            return {
                "available": False,
                "error": f"lighthouse_budget_exceeded_{LIGHTHOUSE_BUDGET_SECONDS}s",
                "degraded": True,
                "duration_ms": round((time.perf_counter() - started) * 1000),
                "mode": "lab",
                "field_data": False,
                "process_tree_reaped": True,
            }
        if proc.returncode != 0:
            return {
                "available": False,
                "error": "lighthouse_failed",
                "return_code": proc.returncode,
                "stderr": stderr.decode("utf-8", errors="replace")[-2000:],
                "duration_ms": round((time.perf_counter() - started) * 1000),
                "mode": "lab",
                "field_data": False,
            }
        raw = json.loads(stdout.decode("utf-8", errors="strict"))
        categories = raw.get("categories") or {}
        audits = raw.get("audits") or {}
        metric_keys = [
            "first-contentful-paint",
            "largest-contentful-paint",
            "speed-index",
            "total-blocking-time",
            "cumulative-layout-shift",
            "server-response-time",
            "interactive",
        ]
        return {
            "available": True,
            "version": raw.get("lighthouseVersion"),
            "fetch_time": raw.get("fetchTime"),
            "requested_url": raw.get("requestedUrl"),
            "final_url": raw.get("finalDisplayedUrl") or raw.get("finalUrl"),
            "user_agent": raw.get("userAgent"),
            "duration_ms": round((time.perf_counter() - started) * 1000),
            "categories": {
                key: round(float(value.get("score")) * 100, 1) if value.get("score") is not None else None
                for key, value in categories.items()
                if key in {"performance", "seo", "best-practices"}
            },
            "metrics": {key: compact_audit(audits.get(key)) for key in metric_keys if audits.get(key)},
            "run_warnings": raw.get("runWarnings") or [],
            "mode": "lab",
            "field_data": False,
            "budget_seconds": LIGHTHOUSE_BUDGET_SECONDS,
            "max_wait_for_fcp_ms": 12000,
            "max_wait_for_load_ms": 25000,
            "disclosure": "Lighthouse metrics are laboratory measurements for this run, not CrUX field data.",
        }
    except asyncio.CancelledError:
        await terminate_process_tree(proc)
        raise
    except Exception as exc:
        await terminate_process_tree(proc)
        return {
            "available": False,
            "error": str(exc)[:2000],
            "degraded": True,
            "duration_ms": round((time.perf_counter() - started) * 1000),
            "mode": "lab",
            "field_data": False,
        }
    finally:
        if proc is not None and proc.returncode is None:
            await terminate_process_tree(proc)


async def archived_site_fallback(url: str, max_pages: int) -> dict[str, Any]:
    try:
        return await asyncio.wait_for(
            commoncrawl_site_sample(url, max_pages=max(2, min(max_pages, 6))),
            timeout=78.0,
        )
    except asyncio.TimeoutError:
        return {"available": False, "source": "common_crawl_site_sample", "reason": "site_fallback_budget_exceeded_78s"}


def primary_archived_page(sample: dict[str, Any]) -> dict[str, Any] | None:
    pages = [p for p in (sample.get("pages") or []) if p.get("available") and p.get("static")]
    for page in pages:
        if page.get("kind") == "home":
            return page
    return pages[0] if pages else None


def archive_record_from_page(page: dict[str, Any], sample: dict[str, Any]) -> dict[str, Any]:
    return {
        "available": True,
        "source": "common_crawl",
        "index_id": page.get("index_id"),
        "snapshot_timestamp": page.get("snapshot_timestamp"),
        "captured_url": page.get("captured_url"),
        "digest": page.get("digest"),
        "static": page.get("static") or {},
        "freshness_disclosure": sample.get("disclosure"),
    }


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": True,
        "service": "convrank-gcl-audit",
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
            "lighthouse_installed": LIGHTHOUSE_BIN.exists(),
            "lighthouse": True,
            "lighthouse_field_data": False,
            "multimodal_vision": False,
            "official_sac_score": False,
            "anti_bot_challenge_detection": True,
            "common_crawl_fallback": True,
            "current_sitemap_discovery": True,
            "archived_multi_page_sample": True,
            "bounded_render_budget_seconds": RENDER_BUDGET_SECONDS,
            "bounded_lighthouse_budget_seconds": LIGHTHOUSE_BUDGET_SECONDS,
            "lighthouse_process_group_cleanup": True,
            "process_reap_budget_seconds": PROCESS_REAP_SECONDS,
            "fail_soft_components": True,
            "request_budget_seconds": REQUEST_BUDGET_SECONDS,
            "cancellation_grace_seconds": CANCELLATION_GRACE_SECONDS,
            "max_active_audits": 1,
            "partial_evidence_on_deadline": True,
        },
        "active_audits": len(_active_audits),
    }


@app.post("/audit")
async def audit(req: AuditRequest, x_sac_worker_token: str | None = Header(default=None)) -> dict[str, Any]:
    require_token(x_sac_worker_token)
    # Fail fast: queueing is owned by Postgres, not by this small browser worker.
    if _active_audits:
        raise HTTPException(status_code=429, detail="audit_worker_busy", headers={"Retry-After": "10"})
    checkpoint: dict[str, Any] = {"started": time.perf_counter(), "phase": "dns"}
    task = asyncio.create_task(audit_pipeline(req, checkpoint))
    _active_audits.add(task)
    def release(completed):
        _active_audits.discard(completed)
        if not completed.cancelled():
            completed.exception()  # Consume failures even after a disconnected caller.
    task.add_done_callback(release)
    try:
        done, _ = await asyncio.wait({task}, timeout=REQUEST_BUDGET_SECONDS)
        if done:
            return task.result()
        task.cancel()
        # wait_for can itself wait indefinitely for cancellation. wait does not.
        await asyncio.wait({task}, timeout=CANCELLATION_GRACE_SECONDS)
        return deadline_result(req, checkpoint, cleanup_pending=not task.done())
    except asyncio.CancelledError:
        task.cancel()
        raise


def deadline_result(req: AuditRequest, checkpoint: dict[str, Any], cleanup_pending: bool) -> dict[str, Any]:
    duration_ms = round((time.perf_counter() - checkpoint["started"]) * 1000)
    phase = checkpoint["phase"]
    if "static" not in checkpoint:
        # No HTML was observed: do not materialize an empty successful audit.
        raise HTTPException(status_code=504, detail={
            "error": "request_budget_exceeded", "phase": phase, "retryable": True,
            "duration_ms": duration_ms, "budget_seconds": REQUEST_BUDGET_SECONDS,
        })
    rendered = checkpoint.get("rendered") or {"available": False, "axe": {"available": False}}
    access = checkpoint.get("access") or {"limited": False, "reason": None}
    usable = not access["limited"]
    static = checkpoint["static"]
    return {
        "engine": {"name": "convrank-gcl-audit", "version": APP_VERSION,
                   "ranking_eligible": False, "official_sac_score": False,
                   "budget_profile": "absolute-request-v1"},
        "audit": {"requested_url": str(req.url), "final_url": checkpoint["final_url"],
                  "robots_found": checkpoint["robots_found"], "http_status": checkpoint["http_status"],
                  "duration_ms": duration_ms, "completed_at": now_iso(),
                  "phases": {**checkpoint.get("phases", {}), "total_ms": duration_ms},
                  "budget_exhausted": True, "budget_exhausted_phase": phase,
                  "budget_seconds": REQUEST_BUDGET_SECONDS, "cleanup_pending": cleanup_pending},
        "access": {**access, "fallback_used": False, "fallback_source": None},
        "content_source": {"kind": "current_origin", "current": True,
                           "disclosure": "Only evidence completed before the request deadline is retained."},
        "origin_static": None, "static": static, "rendered": rendered,
        "lighthouse": {"available": False, "error": "request_budget_exceeded",
                       "degraded": True, "mode": "lab", "field_data": False},
        "fallback": None, "site_sample": None,
        "findings": findings(static, rendered, checkpoint["headers"]) if usable else [],
        "coverage": {"site_content": usable, "current_site_content": usable,
                     "javascript_rendering": usable and bool(rendered.get("available")),
                     "axe": usable and bool((rendered.get("axe") or {}).get("available")),
                     "lighthouse": False, "lighthouse_field_data": False, "visual_ai": False,
                     "official_scoring": False, "archived_site_content": False,
                     "archived_pages": 0, "current_sitemap": False, "content_source": "current_origin",
                     "access_limited": access["limited"], "access_reason": access.get("reason"),
                     "degraded": True, "request_budget_exhausted": True},
        "disclosure": "Partial diagnostic: the request deadline interrupted collection. Uncollected evidence is unknown, never a failed site check or an official score.",
    }


async def audit_pipeline(req: AuditRequest, checkpoint: dict[str, Any]) -> dict[str, Any]:
    started = time.perf_counter()
    phases: dict[str, Any] = {}
    checkpoint["phases"] = phases
    root = await validate_public_url(str(req.url))
    fetch_started = time.perf_counter()
    async with httpx.AsyncClient(
        verify=True,
        trust_env=False,
        limits=httpx.Limits(max_connections=6, max_keepalive_connections=3),
    ) as client:
        checkpoint["phase"] = "robots"
        robots_found, allowed = await robots_allows(client, root)
        if not allowed:
            raise HTTPException(status_code=403, detail="Blocked by robots.txt for GCL-AuditBot")
        checkpoint["phase"] = "static_fetch"
        response, final_url = await safe_get(client, root)
        if "text/html" not in response.headers.get("content-type", "").lower():
            raise HTTPException(status_code=415, detail="Target did not return HTML")
        origin_static = extract_static(final_url, response)
    phases["static_fetch_ms"] = round((time.perf_counter() - fetch_started) * 1000)

    access = detect_access_limit(response, origin_static, {"metrics": {}})
    checkpoint.update(static=origin_static, final_url=final_url, robots_found=robots_found,
                      http_status=response.status_code, headers=response.headers, access=access)
    site_sample: dict[str, Any] = {"available": False}
    fallback: dict[str, Any] = {"available": False}

    if access["limited"]:
        rendered = {
            "available": False,
            "error": "origin_access_challenge_skipped",
            "axe": {"available": False, "valid_for_target": False},
        }
        fallback_started = time.perf_counter()
        checkpoint["phase"] = "archive_fallback"
        site_sample = await archived_site_fallback(final_url, req.max_pages)
        phases["archive_fallback_ms"] = round((time.perf_counter() - fallback_started) * 1000)
        primary = primary_archived_page(site_sample)
        if primary:
            fallback = archive_record_from_page(primary, site_sample)
            static = fallback["static"]
            result_findings = archived_findings(static, fallback)
        else:
            static = origin_static
            result_findings = []
        lighthouse = {
            "available": False,
            "error": "current_origin_access_limited",
            "mode": "lab",
            "field_data": False,
            "valid_for_target": False,
            "disclosure": "Current Lighthouse was not run because the origin returned an access challenge. Current sitemap + archived page evidence are kept separate from current performance evidence.",
        }
    else:
        static = origin_static
        if req.render_js:
            render_started = time.perf_counter()
            checkpoint["phase"] = "render_axe"
            try:
                rendered = await asyncio.wait_for(
                    render_and_axe(final_url, req.include_screenshot),
                    timeout=RENDER_BUDGET_SECONDS,
                )
            except asyncio.TimeoutError:
                rendered = {
                    "available": False,
                    "error": f"render_budget_exceeded_{RENDER_BUDGET_SECONDS}s",
                    "degraded": True,
                    "axe": {"available": False, "error": "skipped_after_render_budget"},
                }
            phases["render_axe_ms"] = round((time.perf_counter() - render_started) * 1000)
            gc.collect()
            await asyncio.sleep(0)
        else:
            rendered = {"available": False, "error": "render_disabled_by_request", "axe": {"available": False}}

        post_access = detect_access_limit(response, origin_static, rendered)
        checkpoint["rendered"] = rendered
        if post_access["limited"]:
            access = post_access
            checkpoint["access"] = access
            fallback_started = time.perf_counter()
            checkpoint["phase"] = "archive_fallback"
            site_sample = await archived_site_fallback(final_url, req.max_pages)
            phases["archive_fallback_ms"] = round((time.perf_counter() - fallback_started) * 1000)
            primary = primary_archived_page(site_sample)
            if primary:
                fallback = archive_record_from_page(primary, site_sample)
                static = fallback["static"]
                result_findings = archived_findings(static, fallback)
            else:
                result_findings = []
            lighthouse = {
                "available": False,
                "error": "current_origin_access_limited",
                "mode": "lab",
                "field_data": False,
                "valid_for_target": False,
            }
            if isinstance(rendered.get("axe"), dict):
                rendered["axe"]["valid_for_target"] = False
        else:
            if req.render_js:
                lighthouse_started = time.perf_counter()
                checkpoint["phase"] = "lighthouse"
                lighthouse = await run_lighthouse(final_url)
                phases["lighthouse_ms"] = round((time.perf_counter() - lighthouse_started) * 1000)
            else:
                lighthouse = {"available": False, "error": "render_disabled_by_request"}
            result_findings = findings(static, rendered, response.headers)

    axe_available = bool((rendered.get("axe") or {}).get("available")) and not access["limited"]
    if axe_available:
        for violation in (rendered.get("axe") or {}).get("violations", []):
            result_findings.append({
                "criterion_code": f"AXE-{violation.get('id')}",
                "status": "warning",
                "title": violation.get("help") or violation.get("id"),
                "evidence": {
                    "impact": violation.get("impact"),
                    "nodes_count": violation.get("nodes_count"),
                    "targets": violation.get("targets"),
                    "help_url": violation.get("help_url"),
                    "source": "current_browser_render",
                },
                "recommendation": violation.get("description"),
            })

    if lighthouse.get("available") and not access["limited"]:
        for code, category in [
            ("SAC-LH-PERF-001", "performance"),
            ("SAC-LH-SEO-001", "seo"),
            ("SAC-LH-BP-001", "best-practices"),
        ]:
            score = (lighthouse.get("categories") or {}).get(category)
            result_findings.append({
                "criterion_code": code,
                "status": "pass" if score is not None and score >= 90 else "warning",
                "title": f"Lighthouse {category}",
                "evidence": {
                    "lab_score": score,
                    "lighthouse_version": lighthouse.get("version"),
                    "mode": "lab",
                    "source": "current_origin",
                },
                "recommendation": "Revisar oportunidades detalhadas de laboratório antes de alterar o site." if score is not None and score < 90 else None,
            })

    fallback_available = bool(fallback.get("available"))
    site_content_available = (not access["limited"]) or fallback_available
    content_source = "common_crawl_site_sample" if fallback_available else "current_origin"
    total_ms = round((time.perf_counter() - started) * 1000)
    phases["total_ms"] = total_ms

    return {
        "engine": {
            "name": "convrank-gcl-audit",
            "version": APP_VERSION,
            "ranking_eligible": False,
            "official_sac_score": False,
            "budget_profile": "absolute-request-v1",
        },
        "audit": {
            "requested_url": str(req.url),
            "final_url": final_url,
            "robots_found": robots_found,
            "http_status": response.status_code,
            "duration_ms": total_ms,
            "completed_at": now_iso(),
            "phases": phases,
            "budget_seconds": REQUEST_BUDGET_SECONDS,
            "budget_exhausted": False,
        },
        "access": {**access, "fallback_used": fallback_available, "fallback_source": "common_crawl" if fallback_available else None},
        "content_source": {
            "kind": content_source,
            "current": not fallback_available,
            "snapshot_timestamp": fallback.get("snapshot_timestamp") if fallback_available else None,
            "index_id": fallback.get("index_id") if fallback_available else None,
            "captured_url": fallback.get("captured_url") if fallback_available else None,
            "disclosure": fallback.get("freshness_disclosure") if fallback_available else "Current origin response/render.",
        },
        "origin_static": origin_static if fallback_available else None,
        "static": static,
        "rendered": rendered,
        "lighthouse": lighthouse,
        "fallback": fallback if fallback_available else None,
        "site_sample": site_sample if site_sample.get("available") else None,
        "findings": result_findings,
        "coverage": {
            "javascript_rendering": bool(rendered.get("available")) and not access["limited"],
            "axe": axe_available,
            "lighthouse": bool(lighthouse.get("available")) and not access["limited"],
            "lighthouse_field_data": False,
            "visual_ai": False,
            "official_scoring": False,
            "site_content": site_content_available,
            "current_site_content": not access["limited"],
            "archived_site_content": fallback_available,
            "archived_pages": site_sample.get("valid_pages", 0) if fallback_available else 0,
            "current_sitemap": bool((site_sample.get("current_sitemap") or {}).get("available")) if fallback_available else False,
            "content_source": content_source,
            "access_limited": access["limited"],
            "access_reason": access["reason"],
            "degraded": bool(rendered.get("degraded")) or bool(lighthouse.get("degraded")),
        },
        "disclosure": (
            "Current origin was protected. Current robots/sitemap were used for URL discovery; content/SEO/structure evidence comes from timestamped Common Crawl snapshots. Current performance/accessibility/security are not inferred from the archive."
            if fallback_available
            else "Deterministic/rendered evidence, automated axe-core, and bounded Lighthouse lab metrics. Component budget exhaustion degrades coverage but never becomes a negative site score."
        ),
    }
