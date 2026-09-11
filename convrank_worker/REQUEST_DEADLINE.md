# GCL worker 0.6.0

The /audit request has one 120-second collection budget, beginning before DNS,
robots and redirect fetching. Component budgets remain 25 seconds for rendering
and 55 seconds for Lighthouse. A further maximum of 8 seconds is reserved for
cancellation and cleanup, below the existing 150-second pg_net transport limit.
The deadline does not restart between phases. Queue waiting is handled in Postgres.

Completed HTML/browser evidence is retained if the global deadline interrupts a
later component. The response marks budget_exhausted, budget_exhausted_phase and
coverage.degraded; missing measurements are not scored as site failures. If no
HTML was collected, the response is HTTP 504 with a structured retryable error.
Protected challenge pages never become successful site findings.

One audit is admitted per process. Concurrent requests get HTTP 429 and Retry-After.
Cancellation is not allowed to hold the HTTP response forever: a task that still
hasn't finished teardown after the grace interval retains the slot until it ends.
This prevents additional Chrome instances from accumulating during slow cleanup.
Lighthouse cleanup also kills its process group when the parent CLI already exited.

Validation: pytest convrank_worker covers phase stalls, shared sequential budget,
partial evidence, protected origins, delayed cancellation, capacity and process trees.
Rollback: deploy the previous worker commit and revert the retry policy separately.
