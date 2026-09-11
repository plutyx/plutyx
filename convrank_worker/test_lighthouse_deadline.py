import asyncio
import time

import httpx
import pytest
import pytest_asyncio
from fastapi import HTTPException

from convrank_worker import lighthouse_app as worker
from convrank_worker.app import AuditRequest


@pytest_asyncio.fixture(autouse=True)
async def isolated_worker(monkeypatch):
    monkeypatch.setattr(worker, "REQUEST_BUDGET_SECONDS", 0.08)
    monkeypatch.setattr(worker, "CANCELLATION_GRACE_SECONDS", 0.03)
    monkeypatch.setattr(worker, "require_token", lambda _: None)
    async def validate(url):
        return url
    async def robots(*_):
        return True, True
    async def fetch(_, url):
        return httpx.Response(200, headers={"content-type": "text/html"},
            text='<html lang="en"><title>Observed title</title><h1>Services</h1></html>'), url
    async def render(*_):
        return {"available": True, "metrics": {}, "axe": {"available": True, "violations": []}}
    async def lighthouse(*_):
        return {"available": True, "categories": {"performance": 90}}
    monkeypatch.setattr(worker, "validate_public_url", validate)
    monkeypatch.setattr(worker, "robots_allows", robots)
    monkeypatch.setattr(worker, "safe_get", fetch)
    monkeypatch.setattr(worker, "render_and_axe", render)
    monkeypatch.setattr(worker, "run_lighthouse", lighthouse)
    yield
    for task in tuple(worker._active_audits):
        task.cancel()
    if worker._active_audits:
        await asyncio.wait(worker._active_audits, timeout=0.1)
    worker._active_audits.clear()


def request():
    return AuditRequest(url="https://example.com/", render_js=True)


@pytest.mark.asyncio
@pytest.mark.parametrize("phase,function", [
    ("dns", "validate_public_url"), ("robots", "robots_allows"), ("static_fetch", "safe_get")])
async def test_deadline_covers_initial_phases_without_inventing_a_report(monkeypatch, phase, function):
    async def stalled(*_):
        await asyncio.Event().wait()
    monkeypatch.setattr(worker, function, stalled)
    with pytest.raises(HTTPException) as caught:
        await worker.audit(request())
    assert caught.value.status_code == 504
    assert caught.value.detail["phase"] == phase
    assert caught.value.detail["error"] == "request_budget_exceeded"


@pytest.mark.asyncio
async def test_sequential_steps_share_one_budget(monkeypatch):
    for name in ("validate_public_url", "robots_allows", "safe_get"):
        original = getattr(worker, name)
        async def delayed(*args, fn=original):
            await asyncio.sleep(0.035)
            return await fn(*args)
        monkeypatch.setattr(worker, name, delayed)
    with pytest.raises(HTTPException) as caught:
        await worker.audit(request())
    assert caught.value.detail["phase"] == "static_fetch"


@pytest.mark.asyncio
async def test_lighthouse_deadline_preserves_observed_html_and_browser(monkeypatch):
    async def stalled(*_):
        await asyncio.Event().wait()
    monkeypatch.setattr(worker, "run_lighthouse", stalled)
    result = await worker.audit(request())
    assert result["static"]["title"] == "Observed title"
    assert result["coverage"]["javascript_rendering"] is True
    assert result["coverage"]["axe"] is True
    assert result["coverage"]["lighthouse"] is False
    assert result["coverage"]["degraded"] is True
    assert result["audit"]["budget_exhausted_phase"] == "lighthouse"
    assert not any(f["criterion_code"].startswith("SAC-LH") for f in result["findings"])
    assert result["engine"]["official_sac_score"] is False


@pytest.mark.asyncio
async def test_protected_origin_is_not_scored_when_archive_times_out(monkeypatch):
    monkeypatch.setattr(worker, "detect_access_limit", lambda *_: {"limited": True, "reason": "challenge"})
    async def stalled(*_):
        await asyncio.Event().wait()
    monkeypatch.setattr(worker, "archived_site_fallback", stalled)
    result = await worker.audit(request())
    assert result["audit"]["budget_exhausted_phase"] == "archive_fallback"
    assert result["coverage"]["site_content"] is False
    assert result["findings"] == []


@pytest.mark.asyncio
async def test_slow_cancellation_does_not_extend_transport_or_admit_more_browsers(monkeypatch):
    teardown = asyncio.Event()
    async def slow_cleanup(req, checkpoint):
        try:
            await asyncio.Event().wait()
        finally:
            await teardown.wait()
    monkeypatch.setattr(worker, "audit_pipeline", slow_cleanup)
    start = time.perf_counter()
    with pytest.raises(HTTPException) as caught:
        await worker.audit(request())
    assert caught.value.status_code == 504
    assert time.perf_counter() - start < 0.3
    assert len(worker._active_audits) == 1
    with pytest.raises(HTTPException) as busy:
        await worker.audit(request())
    assert busy.value.status_code == 429
    assert busy.value.headers["Retry-After"] == "10"
    teardown.set()
    await asyncio.wait(worker._active_audits, timeout=0.1)
    await asyncio.sleep(0)
    assert not worker._active_audits


@pytest.mark.asyncio
async def test_success_releases_slot_without_degrading_evidence():
    result = await worker.audit(request())
    assert result["lighthouse"]["available"] is True
    assert result["audit"]["budget_exhausted"] is False
    assert not worker._active_audits
