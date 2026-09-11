import os
import signal
from pathlib import Path

import pytest

from convrank_worker import hardened_lighthouse as hl


def _fake_proc(root: Path, pid: int, cmdline: bytes, name: str = "chrome", rss_kb: int = 1234):
    p = root / str(pid)
    p.mkdir()
    (p / "cmdline").write_bytes(cmdline)
    (p / "comm").write_text(name, encoding="utf-8")
    (p / "status").write_text(f"Name:\t{name}\nVmRSS:\t{rss_kb} kB\n", encoding="utf-8")


def test_find_profile_processes_matches_only_exact_profile_token(tmp_path):
    token = "/tmp/gcl-lh-abc123"
    _fake_proc(tmp_path, 111, f"chrome\0--user-data-dir={token}\0".encode())
    _fake_proc(tmp_path, 222, b"chrome\0--user-data-dir=/tmp/gcl-lh-other\0")
    found = hl.find_profile_processes(token, tmp_path)
    assert [x["pid"] for x in found] == [111]
    assert found[0]["rss_bytes"] == 1234 * 1024


@pytest.mark.asyncio
async def test_sweep_never_uses_broad_process_kill(monkeypatch):
    token = "/tmp/gcl-lh-unique"
    calls = []
    rounds = [[{"pid": 333, "name": "chrome", "rss_bytes": 4096}], []]

    monkeypatch.setattr(hl, "find_profile_processes", lambda _token: rounds.pop(0))
    monkeypatch.setattr(os, "kill", lambda pid, sig: calls.append((pid, sig)))

    result = await hl.sweep_profile_processes(token)
    assert calls == [(333, signal.SIGKILL)]
    assert result["matched_before"] == 1
    assert result["matched_after"] == 0
    assert result["scope"] == "exact_lighthouse_user_data_dir"


def test_hardened_source_has_unique_user_data_dir_and_no_pkill():
    source = Path(__file__).with_name("hardened_lighthouse.py").read_text(encoding="utf-8")
    package = Path(__file__).with_name("__init__.py").read_text(encoding="utf-8")
    assert 'tempfile.mkdtemp(prefix="gcl-lh-")' in source
    assert 'f"--user-data-dir={profile_path}"' in source
    assert "os.kill(int(item[\"pid\"]), signal.SIGKILL)" in source
    assert "pkill" not in source.lower()
    assert "killall" not in source.lower()
    assert 'LIGHTHOUSE_CATEGORY_PROFILE = "performance_only"' in source
    assert '"--only-categories=performance"' in source
    assert 'performance,seo,best-practices' not in source
    assert "_lighthouse_app.run_lighthouse = _hardened_lighthouse" in package
    assert '_lighthouse_app.APP_VERSION = "0.9.2"' in package
    assert "_lighthouse_app.RENDER_BUDGET_SECONDS = 30" in package
    assert "_lighthouse_app.LIGHTHOUSE_BUDGET_SECONDS = 70" in package
