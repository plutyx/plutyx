from __future__ import annotations

import asyncio
from typing import Any

from axe_playwright_python.async_playwright import Axe

from convrank_worker import snapshot_axe_app as base

AXE_RULES = [
    "color-contrast",
    "button-name",
    "link-name",
    "image-alt",
    "input-button-name",
    "input-image-alt",
    "label",
    "select-name",
    "html-has-lang",
    "html-lang-valid",
    "aria-roles",
    "aria-valid-attr",
    "aria-valid-attr-value",
    "aria-required-attr",
    "aria-required-children",
    "aria-required-parent",
    "autocomplete-valid",
    "video-caption",
    "audio-caption",
    "meta-viewport",
    "nested-interactive",
]


async def _axe_fast(page) -> dict[str, Any]:
    try:
        result = await asyncio.wait_for(
            Axe().run(
                page=page,
                options={
                    "runOnly": {"type": "rule", "values": AXE_RULES},
                    "resultTypes": ["violations"],
                },
            ),
            timeout=18.0,
        )
        raw = result.response
        violations = []
        for item in raw.get("violations", []):
            violations.append(
                {
                    "id": item.get("id"),
                    "impact": item.get("impact"),
                    "help": item.get("help"),
                    "description": item.get("description"),
                    "help_url": item.get("helpUrl"),
                    "tags": item.get("tags", []),
                    "nodes_count": len(item.get("nodes", [])),
                    "targets": [n.get("target", []) for n in item.get("nodes", [])[:8]],
                }
            )
        return {
            "available": True,
            "mode": "atomic_wcag_rules_18s",
            "rules_requested": AXE_RULES,
            "version": (raw.get("testEngine") or {}).get("version"),
            "violations_count": len(raw.get("violations", [])),
            "violations": violations,
            "disclosure": "Targeted axe-core automated checks only; absence of a violation is interpreted only for explicitly requested rules and manual WCAG evaluation is not implied.",
        }
    except asyncio.TimeoutError:
        return {"available": False, "mode": "atomic_wcag_rules_18s", "error": "axe_atomic_timeout_18s", "rules_requested": AXE_RULES}
    except Exception as exc:
        return {"available": False, "mode": "atomic_wcag_rules_18s", "error": str(exc)[:1000], "rules_requested": AXE_RULES}


base._axe = _axe_fast
base.APP_VERSION = "0.1.2-fast-axe-18s"
app = base.app
