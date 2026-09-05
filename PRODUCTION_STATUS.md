# Cozinha 360 OS — Production status

Updated: 2026-09-05

## Cloud-validated

- Backend: FastAPI + SQLAlchemy.
- Frontend: React + TypeScript + Vite, mobile-first.
- Authentication: account creation/login with Argon2 password hashing and signed, versioned JWTs.
- Account security v1.0: e-mail verification, secure password recovery, one-time hashed action tokens, expiry/revocation, reset-driven session invalidation and account-security screens.
- Session controls: server-side token revocation, password-change invalidation and temporary login lockout.
- Multi-tenant model: users, businesses and memberships with owner/admin/member roles.
- Individual workspace: preferences are stored per membership; production, finance and sales members can use different module views in the same business.
- Team onboarding: direct member association plus shareable invite codes/links.
- Core economic engine: contribution, channel pricing, CPA guard and capacity guard.
- Orders: idempotency key, optimistic concurrency/versioning, status workflow, browser KDS and outbox event.
- Products: product catalog, recipes/fichas técnicas and automatic availability derived from ingredient stock.
- Costs: ingredients, on-hand/par/reorder inventory, purchases, landed cost and price-change alerts.
- Inventory intelligence: physical count snapshots, theoretical-versus-physical variance and shrink/surplus signal.
- Historical recipe integrity: every newly completed order freezes the ingredient quantities used at completion, so later recipe edits do not rewrite historical theoretical usage. Legacy pre-v0.9 orders are explicitly identified and use a lower-confidence fallback.
- Inventory timing integrity: stock consumption is assigned to the physical-count interval by `completed_at`, matching the moment inventory is actually consumed; legacy completed rows without that timestamp retain an explicit `created_at` fallback.
- Market intelligence: ingredient price movers, menu engineering using popularity x item contribution, and an owner brief that prioritizes next actions instead of adding dashboards indiscriminately.
- Production: production batches, responsible member, planned/produced/waste quantities.
- Demand: deterministic weighted moving average based on the business's own order history, with confidence level and no paid AI dependency.
- Customers: consent-aware customer records.
- Finance: revenue, variable cost, contribution, losses, landed purchases and daily controllable operating view. This view is intentionally not presented as statutory accounting P&L.
- Audit log and outbox tables are part of the production schema; owner/admin audit retrieval is available.
- Data-quality gate detects active products without recipes, ingredients without pars, negative stock, paid orders without item detail and completed legacy orders without recipe snapshots before downstream automation is trusted.

## Persistent production-preparation database

A persistent Supabase PostgreSQL project is provisioned and contains all application migrations through account security v1.0, including:

- `inventory_counts`
- `order_completion_snapshots`
- `order_recipe_snapshots`
- `user_security_states`
- `auth_action_tokens`

The `account_security_v10` migration was applied successfully to the persistent project after the same eight-migration chain, schema invariants and production-mode tests passed on vanilla PostgreSQL in CI.

Security hardening on the persistent database:

- Row Level Security is enabled on every application table in `public`, including the account-security tables.
- Direct PostgREST DML privileges for `anon` and `authenticated` are revoked; the browser cannot bypass FastAPI business authorization.
- The account-security token table stores only SHA-256 token hashes, not the raw reset/verification token.
- The trigger helper has an explicit `search_path`.
- Supabase security advisor does not report the previous RLS-disabled or mutable-search-path findings. Remaining no-policy notices are informational and intentional for this server-only data architecture: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Foreign keys identified by the performance advisor have covering indexes. Remaining unused-index notices on the new database must be evaluated after meaningful traffic rather than removed pre-emptively: https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index

## Automated cloud gates

The repository has five independent CI gates:

1. `backend-ci`: unit/API tests, simulated customer journeys, security flows, inventory intelligence and application import.
2. `frontend-ci`: strict TypeScript typecheck and production Vite build.
3. `backend-postgres-production-ci`: vanilla PostgreSQL service, every versioned migration, schema invariant checks, production-mode API tests and production application import.
4. `container-ci`: builds both production Docker images so deployment cannot rely on an untested Dockerfile.
5. `browser-e2e`: real Chromium journey covering signup, business creation, ingredient/stock, product/recipe, order creation, KDS completion, finance, stock consumption and schema-aware readiness.

Account security v1.0 was merged only after all five gates passed. Production-mode account-security tests additionally verify that a missing SMTP provider never exposes debug tokens or debug links, while token hashing/replay protection is tested independently of the delivery transport.

## Railway deployment preparation

The repository contains production Config-as-Code for the selected Railway architecture:

- `/backend/railway.toml` -> `/readyz` health gate.
- `/frontend/railway.toml` -> `/healthz` health gate.
- `RAILWAY_DEPLOY.md` -> two-service monorepo layout, private API networking, environment variables and post-deploy customer smoke test.

Target topology:

`browser -> public web service -> same-origin /api proxy -> private api service -> persistent Supabase PostgreSQL`

This intentionally avoids exposing the API directly for normal browser traffic. The frontend runtime can reference the Railway private `api` service while the browser sees only the public web origin.

## Remaining accuracy boundary

Post-v0.9 recipe quantities are historically stable because they are frozen at order completion, and physical-count intervals are aligned to the order completion timestamp rather than the order creation timestamp. Legacy orders completed before recipe snapshots still require the documented current-recipe fallback and are reported with lower confidence. Legacy completed rows without `completed_at` use `created_at` only as a temporal fallback and are explicitly counted in the variance response.

The inventory-variance feature remains an operational control, not statutory inventory valuation or accounting P&L. Accounting-grade inventory would additionally require formal costing policy, period close/reopen controls, purchase/production valuation rules and jurisdiction-specific accounting treatment.

## Still blocking a public “live production” label

The application code, five automated gates, production containers and persistent database are production candidates, but the public release is not yet labeled live until the hosting runtime is created and validated:

1. Create/deploy Railway `api` and `web` services from this repository.
2. Bind `api` to the intended persistent Supabase `DATABASE_URL`, a strong `SECRET_KEY`, explicit `CORS_ORIGINS` and the public application URL without committing credentials.
3. Configure a production transactional e-mail provider/SMTP and verify real e-mail verification + password-reset delivery.
4. Bind `web` `API_UPSTREAM` to the Railway private `api` endpoint.
5. Expose `web` on HTTPS and verify `/healthz`, `/api/livez` and `/api/readyz` return 200.
6. Run the full public customer smoke test documented in `RAILWAY_DEPLOY.md`, including tenant isolation and account recovery.
7. Verify runtime logs, uptime/error monitoring, TLS and database backup/recovery expectations.
8. Add verified subscription billing/webhooks before charging SaaS subscriptions.

## Release rule

Do not label the application “live production” merely because builds and the real database pass. A release is considered public production only after the application is reachable on a public URL, connected to the intended persistent database, `/api/readyz` is healthy through the public frontend, production e-mail delivery is verified, and the post-deploy smoke test passes end-to-end.
