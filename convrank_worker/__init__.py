"""ConvRank SAC audit worker package."""

from __future__ import annotations

import os


# The heavy GCL worker can opt into process-isolated browser rendering without
# changing preview/sibling workers that share this package. The child process
# marks itself so importing the package does not recursively wrap render_and_axe.
if os.getenv("GCL_RENDER_PROCESS_ISOLATION") == "1" and os.getenv("GCL_RENDER_CHILD") != "1":
    from convrank_worker import axe_app as _axe_app
    from convrank_worker.render_isolation import render_and_axe_in_subprocess as _isolated_render

    _axe_app.render_and_axe = _isolated_render

    # Preload the heavy app after the patch so its `from axe_app import
    # render_and_axe` binding receives the isolated implementation. Runtime
    # globals are then upgraded for truthful health/provenance reporting.
    from convrank_worker import lighthouse_app as _lighthouse_app

    _lighthouse_app.APP_VERSION = "0.7.0"
    _lighthouse_app.RENDER_BUDGET_SECONDS = 30
    _lighthouse_app.app.version = "0.7.0"
