from __future__ import annotations

import asyncio
import json
import sys

from convrank_worker.axe_app import render_and_axe

# This entrypoint must stay tiny: the parent worker owns validation, queueing and
# scoring; this disposable child owns only Playwright/Chromium + axe evidence.


async def _main() -> int:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        url = str(payload.get("url") or "").strip()
        screenshot = bool(payload.get("screenshot", False))
        if not url:
            raise ValueError("url_required")
        result = await render_and_axe(url, screenshot)
        sys.stdout.write(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
        sys.stdout.flush()
        return 0
    except Exception as exc:
        sys.stderr.write(f"render_subprocess_error:{type(exc).__name__}:{str(exc)[:1000]}\n")
        sys.stderr.flush()
        return 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
