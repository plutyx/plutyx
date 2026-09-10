# GCL Heavy Analysis Capacity Plan

**Status:** production-readiness evidence, not a commercial SLA  
**Measured:** 2026-09-10  
**Applies to:** `full_paid`, `lighthouse_full`, scheduled deep re-audit and `benchmark_deepening`

## Current topology

- Heavy audit service: Render `convrank-sac-audit-v4`.
- Runtime: Playwright/Chromium + axe-core + Lighthouse.
- Current plan: free, one instance, Ohio.
- Database dispatcher policy: `global_slots=1`, `dispatch_batch=1`, queue soft limit 25, hard limit 100.
- Priority: `full_paid` first; member deep re-audits yield to newly paid scans; benchmark deepening remains background-only and disabled for bulk admission until canaries are proven.

## Measured canary evidence

During a production-safe benchmark deepening canary on 2026-09-10, the heavy worker reached approximately:

- CPU usage: `0.1193` on a `0.15` CPU limit (~79.5%).
- Memory usage: `478,720,000` bytes on a `536,870,900` byte limit (~89.2%).
- A cold start was observed before Uvicorn became ready; this consumed meaningful wall-clock budget before the sequential render/axe/Lighthouse pipeline could answer.

These measurements justify keeping global heavy-scan concurrency at **1** on the current plan. Increasing concurrency on the free worker is not an accepted launch optimization.

## Pipeline budget

The current heavy endpoint performs public fetch/robots validation, rendered browser + axe-core, then Lighthouse. Lighthouse itself has a 90-second internal ceiling, so an orchestrator timeout at or below 90–120 seconds can terminate a valid heavy audit before the pipeline has had enough wall-clock time, especially after a cold start.

`benchmark_deepening` uses an isolated background transport budget. This must not silently change the paid-analysis timeout or priority policy.

## Commercial launch requirement

Before paid traffic is treated as scalable production capacity:

1. Move the heavy customer-analysis path to a non-sleeping/warm capacity tier or equivalent architecture with known compute headroom.
2. Re-run controlled concurrent canaries and capture p50/p95/p99 latency, success rate, CPU peak, memory peak and cost per completed audit.
3. Keep paid work strictly ahead of benchmark/background work.
4. Raise `global_slots` only after measured headroom demonstrates the new setting is safe.
5. Keep benchmark deepening disabled for bulk runs until its success/materialization rate is demonstrated independently.

No capacity purchase or plan upgrade is authorized by this document; it records the technical prerequisite for commercial scale.

## Rollback / safety

- If heavy-worker saturation, timeout or stale-processing rises, leave `global_slots=1` and disable background admissions.
- A failed benchmark canary must not affect customer score, ranking or payment state.
- Do not compensate for infrastructure saturation by fabricating missing evidence or marking timed-out signals as pass/fail.
