from __future__ import annotations

import asyncio
import sys

from playwright.async_api import async_playwright


async def _main() -> int:
    playwright = None
    try:
        playwright = await async_playwright().start()
        sys.stdout.write(playwright.chromium.executable_path)
        sys.stdout.flush()
        return 0
    except Exception as exc:
        sys.stderr.write(f"chrome_path_subprocess_error:{type(exc).__name__}:{str(exc)[:500]}\n")
        sys.stderr.flush()
        return 1
    finally:
        if playwright is not None:
            try:
                await asyncio.wait_for(playwright.stop(), timeout=2.0)
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
