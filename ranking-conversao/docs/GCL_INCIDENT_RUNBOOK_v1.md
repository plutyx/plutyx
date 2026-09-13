# GCL Production Incident Runbook v1

**Scope:** Global Conversion League / SAC production at `https://plutyx.com/ranking-site/`.

**Control objective:** every production incident has an accountable owner, a fail-closed response path, evidence capture, rollback criteria and a clear rule for restoring customer-facing functionality.

## 1. Ownership

- **Accountable role:** `owner` in `sac.gcl_staff_roles`.
- **Incident Commander (IC):** the active GCL `owner`, unless the owner explicitly delegates the incident in the incident record.
- **Engineering responder:** person operating GitHub/Supabase/Render/Hostinger for the incident.
- **Commercial responder:** owner or delegate responsible for customer-facing communication, refunds and checkout state.
- If no active owner can be established, commercial checkout remains closed and the incident is treated as **SEV-1 governance failure**.

Never place passwords, API keys, webhook secrets, database credentials or full payment payloads in tickets, chat, logs or this runbook.

## 2. Severity

| Severity | Definition | Examples | Default action |
|---|---|---|---|
| **SEV-1** | Money, access, security or integrity can be wrong for multiple customers | duplicate charge risk, entitlement granted without payment, leaked secret, compromised auth, ranking integrity failure | close affected write/checkout path immediately; owner becomes IC |
| **SEV-2** | Material production degradation without known integrity loss | scans stuck, payment webhook failures, member area unavailable | contain, preserve evidence, restore within safe degraded mode |
| **SEV-3** | Limited defect with workaround | isolated UI failure, stale non-critical projection | ticket, regression test, normal release |

When uncertain, classify one level higher until evidence supports downgrade.

## 3. First 10 actions

1. Declare incident time, severity, affected surface and IC.
2. Preserve evidence: relevant event IDs, deployment SHA, function version, timestamps and sanitized logs.
3. Check `public.gcl_public_health()` and the payment/queue/ranking sections.
4. For payment incidents, compare Stripe event → signed webhook → `sac.payment_provider_events` → purchase → membership/analysis intent.
5. Do **not** manually replay or create purchases before checking provider/event/session idempotency.
6. If billing integrity is uncertain, close checkout using the kill switch below.
7. If scan integrity is uncertain, stop new paid admission before mutating or deleting queued work.
8. Restore from the smallest reversible change; never patch customer rows to hide symptoms.
9. Run the relevant regression and production smoke gates.
10. Only reopen the affected surface after the IC records evidence that the failure mode is contained.

## 4. Checkout kill switch

GCL checkout is fail-closed. A product is publicly chargeable only when the canonical commercial record is explicitly `active`, `provider_environment='live'` and has a live checkout URL. The live Stripe provider registry can remain staged independently as `paused` with product/price IDs and no Payment Link/URL.

**Emergency close:** set the affected canonical commercial product to `paused` and clear its public checkout URL. Do not delete Stripe products/prices and do not disable the signed webhook merely to stop new checkout sessions, because lifecycle events for existing subscriptions may still need processing.

**Restore:** require all of the following: root cause identified or safely bounded; signed webhook healthy; no unresolved failed provider events; relevant regression green; commercial record intentionally returned to `active`; IC approval recorded.

## 5. Stripe / entitlement incident

Evidence chain:

`Stripe event ID → gcl-stripe-webhook signature verification → payment_provider_events → checkout intent → purchase → membership / Awards / paid scan`

Rules:

- `provider_event_id` and checkout session processing must remain idempotent.
- A webhook replay must not create a second purchase, scan or membership.
- Environment mismatch (`test` vs `live`) is an integrity failure, not a recoverable warning.
- `invoice.payment_failed` must not leave paid-only access falsely active when lifecycle logic marks it `past_due`.
- Subscription deletion/cancellation must recompute ranking entitlement where applicable.
- Refund/cancellation work must preserve the audit trail rather than deleting the purchase/event ledger.

## 6. Analysis worker incident

Check queue admission state, stale processing, Render worker health, browser cleanup, PageSpeed/current probes and queue age. Keep heavy work asynchronous. Never claim a completed audit when evidence collection is partial or failed. If paid capacity is not attested, do not use a healthy single-worker canary as evidence for paid-volume readiness.

## 7. Security incident

For suspected credential compromise:

1. close the exposed feature if required;
2. rotate the affected credential at its provider;
3. update only the server-side secret store/Vault;
4. redeploy the minimal dependent services;
5. invalidate old credentials/tokens where supported;
6. review access logs and provider events;
7. never commit replacement secrets to GitHub or frontend bundles.

For auth incidents, commercial go-live remains blocked while required auth controls are not freshly attested.

## 8. Deployment rollback

- Identify the last known-good commit/deployment SHA.
- Prefer reversible database migrations and additive schema changes.
- Never roll back financial ledgers by deleting provider events or purchases.
- Frontend rollback requires CI plus production smoke tests.
- Edge Function rollback must preserve webhook signature validation and environment separation.
- After rollback, create a regression test reproducing the incident before reintroducing the change where reasonable.

## 9. Evidence required to close an incident

Minimum incident record:

- incident ID and severity;
- start/containment/resolution timestamps;
- IC role and responder(s);
- affected surfaces and customer impact;
- root cause or bounded failure statement;
- sanitized evidence references (event IDs, function/deploy version, commit SHA);
- containment and rollback actions;
- regression/smoke results;
- follow-up owner and due date;
- whether external control attestations must be invalidated or renewed.

## 10. Commercial reopen rule

`public.gcl_public_health().commercial_go_live.commercial_ready=true` is necessary but not sufficient on its own to authorize a risky manual change. Reopening real checkout additionally requires an intentional release step and a real low-value purchase/refund/cancel canary when the billing configuration changes.

A healthy lead-capture path never implies that card charging, transactional email, legal review or paid-worker capacity are ready.

## 11. Review cadence

Review this runbook after every SEV-1/SEV-2 incident and at least every 30 days while GCL is in commercial launch phase. Any material change to Stripe fulfillment, ranking integrity, auth, worker architecture or external-control semantics must update this document and the relevant regression gates.
