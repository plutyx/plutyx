import asyncio
from pathlib import Path

import pytest

from convrank_worker import runtime_telemetry as telemetry


class FakeProcess:
    def __init__(self, stdout=b"/tmp/chromium", stderr=b"", returncode=0, stall=False):
        self.pid = 515151
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr
        self._stall = stall

    async def communicate(self, _input=None):
        if self._stall:
            await asyncio.Event().wait()
        return self._stdout, self._stderr


def test_memory_snapshot_exposes_process_and_cgroup_fields():
    result = telemetry.memory_snapshot()
    assert "process_rss_bytes" in result
    assert "cgroup_current_bytes" in result
    assert "cgroup_file_bytes" in result
    assert "cgroup_anon_bytes" in result


@pytest.mark.asyncio
async def test_chrome_path_lookup_runs_in_disposable_process_group(monkeypatch):
    proc = FakeProcess()
    async def spawn(*args, **kwargs):
        assert args[0]
        assert "convrank_worker.chrome_path_subprocess" in args
        assert kwargs["start_new_session"] is True
        assert kwargs["env"]["GCL_RENDER_CHILD"] == "1"
        return proc
    reaped = []
    async def reap(target):
        reaped.append(target)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", spawn)
    monkeypatch.setattr(telemetry, "_kill_process_group", reap)

    path = await telemetry.isolated_chrome_executable()

    assert path == "/tmp/chromium"
    assert reaped[-1] is proc


@pytest.mark.asyncio
async def test_pipeline_instrumentation_preserves_result_and_adds_memory(monkeypatch):
    snapshots = [
        {"process_rss_bytes": 10, "cgroup_current_bytes": 20},
        {"process_rss_bytes": 11, "cgroup_current_bytes": 21},
    ]
    monkeypatch.setattr(telemetry, "memory_snapshot", lambda: snapshots.pop(0))

    async def original(req, checkpoint):
        return {"engine": {"version": "test"}, "audit": {"ok": True}}

    wrapped = telemetry.instrument_pipeline(original)
    result = await wrapped(object(), {})

    assert result["audit"]["ok"] is True
    assert result["runtime_memory"]["before"]["process_rss_bytes"] == 10
    assert result["runtime_memory"]["after_pipeline"]["cgroup_current_bytes"] == 21


def test_heavy_worker_runtime_patch_includes_isolated_lookup_and_version_assignment():
    source = Path(__file__).with_name("__init__.py").read_text(encoding="utf-8")
    assert "_lighthouse_app.chrome_executable = _isolated_chrome_executable" in source
    assert "_lighthouse_app.audit_pipeline = _instrument_pipeline(_original_audit_pipeline)" in source
    assert "_lighthouse_app.APP_VERSION = " in source
    assert "_lighthouse_app.app.version = " in source
