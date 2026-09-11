from __future__ import annotations

import asyncio
import json
import os
import shutil
import signal
import tempfile
import time
from pathlib import Path
from typing import Any

PROFILE_REAP_SECONDS = 2.0


def _rss_bytes(pid_dir: Path) -> int | None:
    try:
        for line in (pid_dir / "status").read_text(encoding="utf-8", errors="replace").splitlines():
            if line.startswith("VmRSS:"):
                return int(line.split()[1]) * 1024
    except Exception:
        pass
    return None


def find_profile_processes(profile_path: str, proc_root: Path = Path("/proc")) -> list[dict[str, Any]]:
    """Return only processes whose NUL-delimited cmdline contains this run's exact profile path."""
    matches: list[dict[str, Any]] = []
    me = os.getpid()
    try:
        entries = list(proc_root.iterdir())
    except Exception:
        return matches
    for entry in entries:
        if not entry.name.isdigit():
            continue
        pid = int(entry.name)
        if pid == me:
            continue
        try:
            raw = (entry / "cmdline").read_bytes()
            cmdline = raw.replace(b"\x00", b" ").decode("utf-8", errors="replace")
        except Exception:
            continue
        if profile_path not in cmdline:
            continue
        try:
            name = (entry / "comm").read_text(encoding="utf-8", errors="replace").strip()[:80]
        except Exception:
            name = "unknown"
        matches.append({"pid": pid, "name": name, "rss_bytes": _rss_bytes(entry)})
    return matches


async def sweep_profile_processes(profile_path: str) -> dict[str, Any]:
    """Kill only descendants that still advertise this run's unique --user-data-dir token."""
    before = find_profile_processes(profile_path)
    killed = 0
    for item in before:
        try:
            os.kill(int(item["pid"]), signal.SIGKILL)
            killed += 1
        except ProcessLookupError:
            pass
        except Exception:
            pass
    if killed:
        await asyncio.sleep(0.15)
    after = find_profile_processes(profile_path)
    return {
        "matched_before": len(before),
        "rss_before_bytes": sum(int(x.get("rss_bytes") or 0) for x in before),
        "kill_signals_sent": killed,
        "matched_after": len(after),
        "rss_after_bytes": sum(int(x.get("rss_bytes") or 0) for x in after),
        "process_names": sorted({str(x.get("name") or "unknown") for x in before})[:12],
        "scope": "exact_lighthouse_user_data_dir",
    }


async def hardened_run_lighthouse(url: str) -> dict[str, Any]:
    """Run Lighthouse with a unique Chrome profile and exact-token descendant cleanup."""
    from convrank_worker import lighthouse_app as base

    if not base.LIGHTHOUSE_BIN.exists():
        return {"available": False, "error": "lighthouse_binary_missing"}

    proc: asyncio.subprocess.Process | None = None
    started = time.perf_counter()
    profile_path = tempfile.mkdtemp(prefix="gcl-lh-")
    cleanup: dict[str, Any] = {"scope": "exact_lighthouse_user_data_dir", "matched_before": 0, "matched_after": 0}
    try:
        chrome = await base.chrome_executable()
        env = os.environ.copy()
        env["CHROME_PATH"] = chrome
        env.setdefault("NODE_OPTIONS", "--max-old-space-size=160")
        chrome_flags = " ".join([
            "--headless", "--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
            "--disable-background-networking", "--disable-extensions", "--disable-sync",
            "--no-first-run", "--no-default-browser-check", f"--user-data-dir={profile_path}",
        ])
        cmd = [
            str(base.LIGHTHOUSE_BIN), url, "--output=json", "--quiet",
            "--only-categories=performance,seo,best-practices", "--form-factor=mobile",
            "--max-wait-for-fcp=12000", "--max-wait-for-load=25000", "--no-enable-error-reporting",
            f"--chrome-flags={chrome_flags}",
        ]
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            start_new_session=True,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=base.LIGHTHOUSE_BUDGET_SECONDS)
        except asyncio.TimeoutError:
            await base.terminate_process_tree(proc)
            cleanup = await sweep_profile_processes(profile_path)
            return {
                "available": False,
                "error": f"lighthouse_budget_exceeded_{base.LIGHTHOUSE_BUDGET_SECONDS}s",
                "degraded": True,
                "duration_ms": round((time.perf_counter() - started) * 1000),
                "mode": "lab",
                "field_data": False,
                "process_tree_reaped": True,
                "profile_cleanup": cleanup,
            }

        if proc.returncode != 0:
            cleanup = await sweep_profile_processes(profile_path)
            return {
                "available": False,
                "error": "lighthouse_failed",
                "return_code": proc.returncode,
                "stderr": stderr.decode("utf-8", errors="replace")[-2000:],
                "duration_ms": round((time.perf_counter() - started) * 1000),
                "mode": "lab",
                "field_data": False,
                "profile_cleanup": cleanup,
            }

        raw = json.loads(stdout.decode("utf-8", errors="strict"))
        categories = raw.get("categories") or {}
        audits = raw.get("audits") or {}
        metric_keys = [
            "first-contentful-paint", "largest-contentful-paint", "speed-index",
            "total-blocking-time", "cumulative-layout-shift", "server-response-time", "interactive",
        ]
        cleanup = await sweep_profile_processes(profile_path)
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
            "metrics": {key: base.compact_audit(audits.get(key)) for key in metric_keys if audits.get(key)},
            "run_warnings": raw.get("runWarnings") or [],
            "mode": "lab",
            "field_data": False,
            "budget_seconds": base.LIGHTHOUSE_BUDGET_SECONDS,
            "max_wait_for_fcp_ms": 12000,
            "max_wait_for_load_ms": 25000,
            "profile_cleanup": cleanup,
            "disclosure": "Lighthouse metrics are laboratory measurements for this run, not CrUX field data.",
        }
    except asyncio.CancelledError:
        await base.terminate_process_tree(proc)
        cleanup = await sweep_profile_processes(profile_path)
        raise
    except Exception as exc:
        await base.terminate_process_tree(proc)
        cleanup = await sweep_profile_processes(profile_path)
        return {
            "available": False,
            "error": str(exc)[:2000],
            "degraded": True,
            "duration_ms": round((time.perf_counter() - started) * 1000),
            "mode": "lab",
            "field_data": False,
            "profile_cleanup": cleanup,
        }
    finally:
        if proc is not None and proc.returncode is None:
            await base.terminate_process_tree(proc)
        final_cleanup = await sweep_profile_processes(profile_path)
        if final_cleanup.get("matched_before"):
            cleanup = final_cleanup
        try:
            shutil.rmtree(profile_path, ignore_errors=True)
        except Exception:
            pass
