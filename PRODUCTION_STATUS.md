# Cozinha 360 OS — Production status

Updated: 2026-09-05 BRT

## Current release classification

The product is a **public production candidate**, not yet a commercial live-production SaaS.

Public origin: `https://cozinha-360-os.netlify.app`

Current cloud topology:

`browser -> Netlify public frontend -> Supabase Edge services -> persistent Supabase PostgreSQL`

The public origin is reachable without password/SSO and continues to pass the generic web smoke. However, the current Netlify production deploy is **not synchronized with the latest `main` frontend**. Release `3.5.0` introduced a verifiable `c360-release` marker, and `public-release-sync` correctly failed because the public HTML does not contain that marker.

The latest source must therefore not be described as publicly deployed until the new Netlify production pipeline verifies the public alias.

## Current source release

Latest merged source includes, among earlier modules:

- System 360, Playbook Lab, Vitrine Studio, Growth Lab, Control Tower and Execution Hub;
- Operating Memory with server-backed cross-device state and revision history;
- Kitchen Intelligence with recipe-component demand and stock projection;
- Cash & Margin with break-even, runway and capacity planning;
- Connection Autopilot, Smart Setup, Connection Doctor and operational fallbacks;
- Plan & Access with server-owned commercial entitlement state.

Core routes include:

- `?system360=1`
- `?playbook=1`
- `?vitrine=1`
- `?growth=1`
- `?control=1`
- `?execution=1`
- `?cash=1`
- `?connections=1`
- `?plan=1`
- `?kitchen=1`
- `?crm=1`
- `?margin=1`
- `?direct=1`
- `?quick=1`
- public storefront `?loja=<slug>`

## Persistent production services

The production Supabase project contains the full application migration chain and server-controlled data architecture, including:

- inventory counts and recipe/order completion snapshots;
- account security and Supabase Auth bridge;
- cloud-native transaction RPCs for order creation, recipe replacement and order completion;
- omnichannel events and customer lifecycle data;
- Operating Memory state/revisions;
- integration credentials and per-business integration profiles;
- `business_billing_accounts` entitlement state;
- `billing_events` provider-event idempotency ledger.

Production Edge services currently include:

- `cozinha360-api-v2`
- `cozinha360-margin-v14`
- `cozinha360-crm-v16`
- `cozinha360-direct-v17`
- `cozinha360-integrations-v29`
- `cozinha360-profile-v31`
- `cozinha360-entitlements-v34`

`cozinha360-entitlements-v34` is active and returns tenant-scoped entitlement state only after Supabase session and membership checks. Current enforcement is deliberately `observe_only`; candidate businesses are not unexpectedly paywalled before checkout/webhook/cancellation/recovery are proven.

## Security posture

- RLS is enabled on server-controlled application tables.
- Direct browser PostgREST DML for `anon` and `authenticated` is intentionally unavailable for protected application data.
- The v3.4 billing tables were verified in production with RLS enabled and zero direct `anon`/`authenticated` grants.
- Integration provider credentials are encrypted server-side and are never returned to the tenant browser.
- The billing event ledger stores provider event IDs and payload hashes rather than raw payment payloads.
- No Netlify authentication token is committed or exposed through `VITE_*` variables.

## Automated release gates

Source/release quality is covered by:

1. `backend-ci` — unit/API/security/domain tests.
2. `frontend-ci` — strict TypeScript, production Vite build and frontend release-marker verification.
3. `backend-postgres-production-ci` — full migration chain, schema invariants, transaction smoke and production-mode tests on PostgreSQL.
4. `container-ci` — production backend/frontend image builds.
5. `browser-e2e` — Chromium customer journeys including Operating Memory, Kitchen Intelligence, Cash & Margin, Connections and Plan & Access.
6. `cloud-edge-smoke` — live Supabase Edge liveness/readiness/auth-boundary checks when Edge code changes.
7. `public-web-smoke` — public-origin availability, HTML/security headers, API readiness and browser-origin behavior.

Public release parity is deliberately separate:

8. `netlify-production-deploy` — builds `main`, deploys only `frontend/dist` to the existing Netlify project, and verifies the public alias serves that exact release. Requires GitHub Actions secret `NETLIFY_AUTH_TOKEN`.
9. `public-release-sync` — independently requires the expected `c360-release` marker and a Vite production asset reference on the real public origin.

A green `public-web-smoke` does **not** imply a green `public-release-sync`.

## Public-hosting state

Netlify project/site ID: `90508832-a343-4223-98d5-9f7ac45adc79`

Currently verified public deploy:

- deploy ID `6a9c54b5b9b112a7042392f0`
- created by API upload, not Git-connected deployment
- `commit_ref=null`
- `branch=null`
- public HTTPS host reachable
- current HTML does not identify as Cozinha 360 release `3.5.0`

`public-release-sync` run #1 fetched the public host successfully and then failed specifically because the `3.5.0` marker was absent. This is expected deployment-drift evidence, not an application source regression.

The repository now contains a reproducible Netlify deployment workflow. Its only deployment credential is expected as the GitHub Actions secret `NETLIFY_AUTH_TOKEN`. See `docs/NETLIFY_RELEASE.md`.

## Commercial blockers still open

1. **Current frontend deployment** — run the new Netlify pipeline successfully and obtain green public release synchronization. Until then, latest `main` is not public.
2. **Transactional e-mail delivery** — recent Gmail searches did not find signup confirmation or recovery messages. The connected Resend account currently has no configured domains. A sending domain/provider must be configured and real confirmation + password recovery delivery verified.
3. **Authenticated public customer journey** — after current frontend + e-mail delivery are verified, execute the full journey on the public origin, including signup/confirmation/login, business setup, product/recipe/order/KDS/finance/inventory and tenant isolation/recovery.
4. **Real billing provider adapter** — server entitlement storage and event idempotency ledger are ready, but no Stripe account/price/customer/subscription has been selected or created. Before charging customers, verify checkout, signed webhook processing, duplicate-event handling, cancellation, past-due recovery and entitlement transitions in test mode and then production.
5. **Operations** — production monitoring/error review plus documented backup/recovery expectations remain required before broad commercial launch.

## Accuracy boundary

Inventory variance and contribution views are operational controls, not statutory accounting statements. Legal, sanitary and safety states that cannot be programmatically verified remain user-declared rather than presented as certified compliance.

## Release rule

Do not call the latest frontend publicly deployed until the Netlify deploy verification and release-sync gate pass. Do not call the product commercial live production until transactional e-mail, authenticated public journey, billing integrity and operational recovery gates are also proven.
