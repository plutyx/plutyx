import asyncio
import json
from pathlib import Path

import pytest

from convrank_worker import render_isolation as isolation


class FakeProcess:
    def __init__(self, payload=None, returncode=0, stall=False):
        self.pid = 424242
        self.returncode = returncode
        self.payload = payload or {"available": True, "axe": {"available": True}}
        self.stall = stall

    async def communicate(self, _input=None):
        if self.stall:
            await asyncio.Event().wait()
        return json.dumps(self.payload).encode(), b""


def test_process_isolation_contract_is_fail_closed():
    source = Path(__file__).with_name("render_isolation.py").read_text(encoding="utf-8")
    package = Path(__file__).with_name("__init__.py").read_text(encoding="utf-8")
    child = Path(__file__).with_name("render_subprocess.py").read_text(encoding="utf-8")

    assert 'env["GCL_RENDER_CHILD"] = "1"' in source
    assert "start_new_session=True" in source
    assert "os.killpg(proc.pid, signal.SIGKILL)" in source
    assert "RENDER_CHILD_BUDGET_SECONDS = 28" in source
    assert 'os.getenv("GCL_RENDER_PROCESS_ISOLATION") == "1"' in package
    assert 'os.getenv("GCL_RENDER_CHILD") != "1"' in package
    assert "_lighthouse_app.APP_VERSION =" in package
    assert "await render_and_axe(url, screenshot)" in child


@pytest.mark.asyncio
async def test_successful_child_result_keeps_evidence_and_marks_isolation(monkeypatch):
    proc = FakeProcess({"available": True, "metrics": {"title": "Observed"}, "axe": {"available": True}})

    async def spawn(*_args, **_kwargs):
        assert _kwargs["start_new_session"] is True
        assert _kwargs["env"]["GCL_RENDER_CHILD"] == "1"
        return proc

    reaps = []

    async def reap(target):
        reaps.append(target)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(isolation, "_kill_process_group", reap)

    result = await isolation.render_and_axe_in_subprocess("https://example.com/", False)

    assert result["available"] is True
    assert result["metrics"]["title"] == "Observed"
    assert result["execution_isolation"] == "subprocess_process_group"
    assert result["process_tree_reaped"] is True
    assert reaps[-1] is proc


@pytest.mark.asyncio
async def test_stalled_child_returns_bounded_degraded_result(monkeypatch):
    proc = FakeProcess(stall=True)

    async def spawn(*_args, **_kwargs):
        return proc

    killed = asyncio.Event()

    async def reap(_target):
        killed.set()

    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(isolation, "_kill_process_group", reap)
    monkeypatch.setattr(isolation, "RENDER_CHILD_BUDGET_SECONDS", 0.02)

    result = await isolation.render_and_axe_in_subprocess("https://example.com/", False)

    assert result["available"] is False
    assert result["degraded"] is True
    assert result["error"] == "render_process_budget_exceeded_0.02s"
    assert result["process_tree_reaped"] is True
    assert killed.is_set()
