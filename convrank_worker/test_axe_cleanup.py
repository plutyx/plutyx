import asyncio
import time

import pytest

from convrank_worker.axe_app import bounded_playwright_cleanup


@pytest.mark.asyncio
async def test_bounded_playwright_cleanup_completes_fast_cleanup():
    async def immediate():
        await asyncio.sleep(0)

    assert await bounded_playwright_cleanup(immediate(), timeout=0.05) is True


@pytest.mark.asyncio
async def test_bounded_playwright_cleanup_never_waits_forever():
    blocker = asyncio.Event()
    started = time.perf_counter()

    assert await bounded_playwright_cleanup(blocker.wait(), timeout=0.03) is False
    assert time.perf_counter() - started < 0.20


@pytest.mark.asyncio
async def test_outer_timeout_is_not_pinned_by_cleanup():
    async def cancelled_stage():
        try:
            await asyncio.Event().wait()
        finally:
            await bounded_playwright_cleanup(asyncio.Event().wait(), timeout=0.03)

    started = time.perf_counter()
    with pytest.raises(asyncio.TimeoutError):
        await asyncio.wait_for(cancelled_stage(), timeout=0.03)

    assert time.perf_counter() - started < 0.20
