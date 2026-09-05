# Cozinha 360 OS — Production status

Updated: 2026-09-05

## Current release classification

The product is a **public production candidate**, not yet a commercial live-production release.

Public frontend: `https://cozinha-360-os.netlify.app`

Current cloud topology:

`browser -> Netlify public frontend -> Supabase Edge API -> persistent Supabase PostgreSQL`

The public frontend has been deployed without password/SSO protection and independently verified with HTTP 200, `text/html; charset=UTF-8`, valid HTML and security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`). The public API exposes healthy `/livez` and `/readyz` endpoints.

## Cloud-validated application

- Frontend: mobile-first operation interface covering Today, Orders/KDS, Products/Ficha Técnica, Costs/Inventory, Production, Finance, Customers, Team and individual workspace preferences.
- Authentication: Supabase Auth bridge plus the existing application user/membership domain model.
- Multi-tenant authorization: users, businesses and memberships with owner/admin/member roles.
- Individual workspace preferences per membership.
- Team onboarding with shareable invite codes.
- Product/recipe costing, inventory/par/reorder controls and price-change signals.
- Orders with idempotency, optimistic concurrency and browser KDS.
- Atomic order creation, atomic recipe replacement and atomic order completion in PostgreSQL.
- Order completion freezes recipe quantities, records completion snapshots and consumes inventory exactly once.
- Production planning and deterministic demand forecast using the operation's own history.
- Contribution-first finance view, losses and landed purchases.
- Consent-aware customers.
- Physical inventory counts, theoretical-versus-physical variance, price movers, menu engineering and owner brief.
- Audit/outbox and data-quality controls.

## Persistent database

The production-preparation Supabase PostgreSQL project contains the full application migration chain, including:

- `inventory_counts`
- `order_completion_snapshots`
- `order_recipe_snapshots`
- `user_security_states`
- `auth_action_tokens`
- `users.auth_user_id` bridge to Supabase Auth
- transaction RPCs `c360_create_order`, `c360_set_recipe` and `c360_complete_order`

A real transaction smoke was executed against the persistent database inside a rollback: recipe -> order -> completion -> paid -> stock decrement -> recipe snapshot -> completion snapshot -> audit/outbox. The test stock moved from 5000 to 4800 as expected and the rollback left zero test users, businesses and orders.

Security posture:

- RLS is enabled on application tables.
- Direct browser PostgREST DML for `anon` and `authenticated` is intentionally unavailable for application data.
- Privileged transaction functions are not exposed as general public write APIs.
- Remaining `rls_enabled_no_policy` notices are intentional for the server-controlled data architecture: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Unused-index notices on the new database are not a reason to remove indexes before representative traffic exists: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Automated release gates

The repository now has seven independent gates:

1. `backend-ci` — unit/API/security/domain tests.
2. `frontend-ci` — strict TypeScript and production Vite build.
3. `backend-postgres-production-ci` — full migration chain, schema invariants, cloud-native transaction smoke and production-mode tests on PostgreSQL.
4. `container-ci` — production backend/frontend image builds.
5. `browser-e2e` — real Chromium local customer journey.
6. `cloud-edge-smoke` — live Supabase Edge API liveness/readiness validation.
7. `public-web-smoke` — live Netlify HTML, security headers, public API readiness, browser-origin CORS and non-mutating signup validation.

## Public-hosting result

Netlify site ID: `90508832-a343-4223-98d5-9f7ac45adc79`

Validated deployment:
- deploy ID `6a9c54b5b9b112a7042392f0`
- HTTPS public host reachable without authentication
- HTTP 200
- browser-renderable HTML
- expected security response headers

Railway and Vercel remain deployment alternatives, but they are no longer required for the current public-candidate topology.

## Remaining release blockers

The public-hosting blocker is resolved. The remaining blockers before calling the product a **commercial live-production SaaS** are:

1. **Transactional e-mail delivery** — public signup correctly requires e-mail confirmation, but an actual confirmation message has not yet been observed in the connected Gmail inbox. Production SMTP/provider delivery must be verified, including password recovery.
2. **Authenticated public browser smoke** — after real e-mail confirmation works, run the full customer journey on the public Netlify origin: signup/confirm/login -> business -> ingredient -> product/recipe -> paid order -> KDS completion -> finance -> stock decrement -> inventory count/variance -> second-account tenant isolation -> account recovery.
3. **Billing/entitlements** — verified subscription checkout/webhook signature handling, event idempotency, entitlement state and cancellation/recovery before charging customers.
4. **Operations** — basic production monitoring/error review and documented backup/recovery expectations before broad launch.

## Accuracy boundary

Inventory variance is an operational control, not statutory inventory valuation or accounting P&L. Legacy orders completed before recipe snapshots or without `completed_at` retain explicit lower-confidence fallbacks.

## Release rule

Do not call the product commercial live production until the remaining blockers above pass. A public URL by itself is not sufficient; confirmed-user authentication, the full public customer journey and billing integrity must also be proven.
