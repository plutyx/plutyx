from __future__ import annotations

import asyncio
import json
import os
import signal
import sys
import time
from typing import Any

RENDER_CHILD_BUDGET_SECONDS = 28
RENDER_CHILD_REAP_SECONDS = 4


async def _kill_process_group(proc: asyncio.subprocess.Process | None) -> None:
    if proc is None:
        return
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    except Exception:
        if proc.returncode is None:
            try:
                proc.kill()
            except Exception:
                pass
    try:
        await asyncio.wait_for(proc.communicate(), timeout=RENDER_CHILD_REAP_SECONDS)
    except Exception:
        pass


async def render_and_axe_in_subprocess(url: str, screenshot: bool) -> dict[str, Any]:
    """Run Playwright + axe in a disposable process group."""
    started = time.perf_counter()
    proc: asyncio.subprocess.Process | None = None
    env = os.environ.copy()
    env["GCL_RENDER_CHILD"] = "1"
    payload = json.dumps({"url": url, "screenshot": bool(screenshot)}, separators=(",", ":")).encode("utf-8")
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "convrank_worker.render_subprocess",
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            start_new_session=True,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(payload), timeout=RENDER_CHILD_BUDGET_SECONDS)
        except asyncio.TimeoutError:
            await _kill_process_group(proc)
            return {
                "available": False,
                "error": f"render_process_budget_exceeded_{RENDER_CHILD_BUDGET_SECONDS}s",
                "degraded": True,
                "axe": {"available": False, "error": "render_process_budget_exceeded"},
                "duration_ms": round((time.perf_counter() - started) * 1000),
                "execution_isolation": "subprocess_process_group",
                "process_tree_reaped": True,
            }

        if proc.returncode != 0:
            return {
                "available": False,
                "error": "render_subprocess_failed",
                "degraded": True,
                "stderr": stderr.decode("utf-8", errors="replace")[-1200:],
                "axe": {"available": False},
                "duration_ms": round((time.perf_counter() - started) * 1000),
                "execution_isolation": "subprocess_process_group",
            }

        try:
            result = json.loads(stdout.decode("utf-8", errors="strict"))
        except Exception as exc:
            return {
                "available": False,
                "error": "render_subprocess_invalid_json",
                "degraded": True,
                "detail": str(exc)[:500],
                "axe": {"available": False},
                "duration_ms": round((time.perf_counter() - started) * 1000),
                "execution_isolation": "subprocess_process_group",
            }

        if not isinstance(result, dict):
            return {
                "available": False,
                "error": "render_subprocess_invalid_payload",
                "degraded": True,
                "axe": {"available": False},
                "duration_ms": round((time.perf_counter() - started) * 1000),
                "execution_isolation": "subprocess_process_group",
            }
        result["execution_isolation"] = "subprocess_process_group"
        result["process_tree_reaped"] = True
        return result
    except asyncio.CancelledError:
        await _kill_process_group(proc)
        raise
    except Exception as exc:
        await _kill_process_group(proc)
        return {
            "available": False,
            "error": "render_subprocess_exception",
            "detail": str(exc)[:1000],
            "degraded": True,
            "axe": {"available": False},
            "duration_ms": round((time.perf_counter() - started) * 1000),
            "execution_isolation": "subprocess_process_group",
        }
    finally:
        await _kill_process_group(proc)
