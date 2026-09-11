"""ConvRank SAC audit worker package."""

from __future__ import annotations

import os


if os.getenv("GCL_RENDER_PROCESS_ISOLATION") == "1" and os.getenv("GCL_RENDER_CHILD") != "1":
    from convrank_worker import axe_app as _axe_app
    from convrank_worker.render_isolation import render_and_axe_in_subprocess as _isolated_render
    from convrank_worker.runtime_telemetry import (
        instrument_pipeline as _instrument_pipeline,
        isolated_chrome_executable as _isolated_chrome_executable,
    )
    from convrank_worker.hardened_lighthouse import hardened_run_lighthouse as _hardened_lighthouse

    _axe_app.render_and_axe = _isolated_render

    from convrank_worker import lighthouse_app as _lighthouse_app

    _original_audit_pipeline = _lighthouse_app.audit_pipeline
    _lighthouse_app.chrome_executable = _isolated_chrome_executable
    _lighthouse_app.run_lighthouse = _hardened_lighthouse
    _lighthouse_app.audit_pipeline = _instrument_pipeline(_original_audit_pipeline)
    _lighthouse_app.APP_VERSION = "0.9.1"
    _lighthouse_app.RENDER_BUDGET_SECONDS = 30
    _lighthouse_app.LIGHTHOUSE_BUDGET_SECONDS = 70
    _lighthouse_app.app.version = "0.9.1"
