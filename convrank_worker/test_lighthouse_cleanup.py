import asyncio
import os
import sys

import pytest

from convrank_worker.lighthouse_app import terminate_process_tree


@pytest.mark.asyncio
async def test_terminate_process_tree_reaps_child_holding_pipes_open():
    """Regression: killing only the Lighthouse parent can leave Chrome holding pipes.

    The child intentionally inherits stdout/stderr. If only the parent is killed,
    communicate() can wait for the child to close those descriptors. The production
    cleanup must kill the whole process group and return promptly.
    """
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "import subprocess,time; subprocess.Popen(['sleep','60']); time.sleep(60)",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        start_new_session=True,
    )

    assert proc.pid > 0
    assert os.getpgid(proc.pid) == proc.pid

    await asyncio.wait_for(terminate_process_tree(proc), timeout=3.0)

    assert proc.returncode is not None


@pytest.mark.asyncio
async def test_terminate_process_tree_is_safe_for_completed_process():
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-c",
        "print('ok')",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        start_new_session=True,
    )
    await proc.communicate()
    assert proc.returncode == 0

    await asyncio.wait_for(terminate_process_tree(proc), timeout=1.0)
    assert proc.returncode == 0
