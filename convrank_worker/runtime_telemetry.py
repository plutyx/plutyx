from __future__ import annotations

import asyncio
import gc
import os
import sys
from pathlib import Path
from typing import Any, Awaitable, Callable

from convrank_worker.render_isolation import _kill_process_group

CHROME_PATH_BUDGET_SECONDS = 8
LOCAL_LIGHTHOUSE_CATEGORY_FINDINGS = {
    "SAC-LH-PERF-001": "performance",
    "SAC-LH-SEO-001": "seo",
    "SAC-LH-BP-001": "best-practices",
}


def _read_int(path: str) -> int | None:
    try:
        return int(Path(path).read_text(encoding="utf-8").strip())
    except Exception:
        return None


def memory_snapshot() -> dict[str, Any]:
    rss_bytes = None
    try:
        for line in Path("/proc/self/status").read_text(encoding="utf-8").splitlines():
            if line.startswith("VmRSS:"):
                rss_bytes = int(line.split()[1]) * 1024
                break
    except Exception:
        pass

    stats: dict[str, int] = {}
    try:
        for line in Path("/sys/fs/cgroup/memory.stat").read_text(encoding="utf-8").splitlines():
            key, value = line.split(None, 1)
            if key in {"anon", "file", "shmem", "slab", "inactive_file", "active_file"}:
                stats[key] = int(value)
    except Exception:
        pass

    return {
        "process_rss_bytes": rss_bytes,
        "cgroup_current_bytes": _read_int("/sys/fs/cgroup/memory.current"),
        "cgroup_limit_bytes": _read_int("/sys/fs/cgroup/memory.max"),
        "cgroup_anon_bytes": stats.get("anon"),
        "cgroup_file_bytes": stats.get("file"),
        "cgroup_shmem_bytes": stats.get("shmem"),
        "cgroup_slab_bytes": stats.get("slab"),
        "cgroup_inactive_file_bytes": stats.get("inactive_file"),
        "cgroup_active_file_bytes": stats.get("active_file"),
    }


async def isolated_chrome_executable() -> str:
    proc: asyncio.subprocess.Process | None = None
    env = os.environ.copy()
    env["GCL_RENDER_CHILD"] = "1"
    try:
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "convrank_worker.chrome_path_subprocess",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            start_new_session=True,
        )
        try:
            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=CHROME_PATH_BUDGET_SECONDS)
        except asyncio.TimeoutError:
            await _kill_process_group(proc)
            raise RuntimeError("chrome_path_lookup_timeout")
        if proc.returncode != 0:
            raise RuntimeError("chrome_path_lookup_failed:" + stderr.decode("utf-8", errors="replace")[-500:])
        path = stdout.decode("utf-8", errors="strict").strip()
        if not path:
            raise RuntimeError("chrome_path_lookup_empty")
        return path
    finally:
        await _kill_process_group(proc)


def suppress_uncollected_lighthouse_category_findings(result: dict[str, Any]) -> int:
    """Remove only local category warnings that were not collected by score-metrics-only.

    The constrained heavy worker intentionally skips Lighthouse category scoring and runs only
    the five lab audits that can feed GCL score inputs. The legacy base pipeline still creates
    three category findings from absent values; treating those nulls as warnings would invent
    negative evidence. PageSpeed and deterministic GCL engines continue to provide the wider
    SEO/best-practices diagnostics.
    """
    lighthouse = result.get("lighthouse") or {}
    if lighthouse.get("category_profile") != "score_metrics_only":
        return 0

    categories = lighthouse.get("categories")
    if not isinstance(categories, dict):
        categories = {}
    findings = result.get("findings")
    if not isinstance(findings, list):
        return 0

    kept: list[Any] = []
    removed = 0
    for item in findings:
        code = item.get("criterion_code") if isinstance(item, dict) else None
        category = LOCAL_LIGHTHOUSE_CATEGORY_FINDINGS.get(code)
        if category and categories.get(category) is None:
            removed += 1
            continue
        kept.append(item)

    if removed:
        result["findings"] = kept
        lighthouse["category_findings_suppressed"] = removed
        lighthouse["category_findings_disclosure"] = (
            "Local Lighthouse category findings were omitted because the score-metrics-only "
            "profile did not collect category scores. Missing category evidence is unknown, "
            "never a warning or failed site check."
        )
    return removed


def instrument_pipeline(original: Callable[..., Awaitable[dict[str, Any]]]):
    async def wrapped(req, checkpoint):
        before = memory_snapshot()
        result = await original(req, checkpoint)
        if isinstance(result, dict):
            suppress_uncollected_lighthouse_category_findings(result)
        gc.collect()
        await asyncio.sleep(0)
        after = memory_snapshot()
        if isinstance(result, dict):
            result["runtime_memory"] = {
                "before": before,
                "after_pipeline": after,
                "interpretation": "Process RSS separates long-lived Python memory from cgroup total; cgroup file bytes may include reclaimable page cache.",
            }
        return result
    return wrapped
