# Cozinha 360 OS — Production status

Updated: 2026-09-05

## Cloud-validated

- Backend: FastAPI + SQLAlchemy.
- Frontend: React + TypeScript + Vite, mobile-first.
- Authentication: account creation/login with Argon2 password hashing and signed, versioned JWTs.
- Session controls: server-side token revocation, password-change invalidation and temporary login lockout.
- Multi-tenant model: users, businesses and memberships with owner/admin/member roles.
- Individual workspace: preferences are stored per membership; production, finance and sales members can use different module views in the same business.
- Team onboarding: direct member association plus shareable invite codes/links that do not require a paid e-mail provider.
- Core economic engine: contribution, channel pricing, CPA guard and capacity guard.
- Orders: idempotency key, optimistic concurrency/versioning, status workflow, browser KDS and outbox event.
- Products: product catalog, recipes/fichas técnicas and automatic availability derived from ingredient stock.
- Costs: ingredients, on-hand/par/reorder inventory, purchases, landed cost and price-change alerts.
- Inventory intelligence: physical count snapshots, theoretical-versus-physical variance and shrink/surplus signal.
- Market intelligence: ingredient price movers, menu engineering using popularity x item contribution, and an owner brief that prioritizes next actions instead of adding dashboards indiscriminately.
- Production: production batches, responsible member, planned/produced/waste quantities.
- Demand: deterministic weighted moving average based on the business's own order history, with confidence level and no paid AI dependency.
- Customers: consent-aware customer records.
- Finance: revenue, variable cost, contribution, losses, landed purchases and daily controllable operating view. This view is intentionally not presented as statutory accounting P&L.
- Audit log and outbox tables are part of the production schema; owner/admin audit retrieval is available.
- Data-quality gate detects active products without recipes, ingredients without pars, negative stock and paid orders without item detail before downstream automation is trusted.

## Persistent production-preparation database

A real persistent Supabase PostgreSQL project is provisioned and contains all application migrations through the current release, including `inventory_counts`. The schema has passed actual database smoke checks and the production-mode CI applies the full migration chain from zero on vanilla PostgreSQL.

Security hardening on the persistent database:

- Row Level Security is enabled on every application table in `public`, including the physical inventory-count table.
- Direct PostgREST privileges for `anon` and `authenticated` are revoked; the browser cannot bypass FastAPI business authorization.
- The trigger helper has an explicit `search_path`.
- Supabase security advisor does not report the previous RLS-disabled or mutable-search-path findings. Remaining no-policy notices are informational and intentional for this server-only data architecture.
- Foreign keys identified by the performance advisor have covering indexes. Remaining unused-index notices are expected on a newly provisioned database without meaningful production traffic and must be evaluated after real usage, not removed pre-emptively.

## Automated cloud gates

The repository has five independent CI gates:

1. `backend-ci`: unit/API tests, simulated customer journeys, security flows, inventory intelligence and application import.
2. `frontend-ci`: strict TypeScript typecheck and production Vite build.
3. `backend-postgres-production-ci`: vanilla PostgreSQL service, every versioned migration, schema invariant checks, production-mode API tests and production application import.
4. `container-ci`: builds both production Docker images so deployment cannot rely on an untested Dockerfile.
5. `browser-e2e`: real Chromium journey covering signup, business creation, ingredient/stock, product/recipe, order creation, KDS completion, finance, stock consumption and schema-aware readiness.

The browser E2E gate initially caught a real selector ambiguity that unit/API tests could not detect; it was corrected and the full five-gate matrix passed before v0.8.2 was merged. v0.8.1 added separate liveness/readiness endpoints and the backend container becomes unhealthy if the database is unreachable or required migrations are missing.

## Railway deployment preparation

The repository now contains production Config-as-Code for the selected Railway architecture:

- `/backend/railway.toml` -> `/readyz` health gate.
- `/frontend/railway.toml` -> `/healthz` health gate.
- `RAILWAY_DEPLOY.md` -> exact two-service monorepo layout, private API networking, variable references and post-deploy customer smoke test.

Target topology:

`browser -> public web service -> same-origin /api proxy -> private api service -> persistent Supabase PostgreSQL`

This intentionally avoids exposing the API directly for normal browser traffic. The frontend runtime can reference `api.RAILWAY_PRIVATE_DOMAIN` while the browser sees only the public web origin.

## Known accuracy boundary

Inventory variance currently reconstructs theoretical usage from the current recipe. If a recipe changes between two physical counts, historical theoretical usage can be imperfect because recipe-version snapshots are not yet persisted. This must be fixed before using variance as an accounting-grade shrink figure. The feature is presently an operational diagnostic, not a statutory inventory valuation.

## Still blocking a public “live production” label

The application code, five automated gates, production containers, Railway deployment configuration and persistent database are production candidates, but the public release is not yet being labeled live until the hosting runtime is actually created and validated:

1. Create/deploy the Railway `api` and `web` services from this repository.
2. Bind `api` to the intended persistent Supabase `DATABASE_URL`, a strong `SECRET_KEY` and explicit `CORS_ORIGINS` without committing credentials.
3. Bind `web` `API_UPSTREAM` to the Railway private `api` endpoint.
4. Expose `web` on HTTPS and verify `/healthz`, `/api/livez` and `/api/readyz` return 200.
5. Run the full public customer smoke test documented in `RAILWAY_DEPLOY.md`.
6. Verify runtime logs, uptime/error monitoring, TLS and database backup/recovery expectations.
7. Add e-mail verification and secure password recovery before broad public acquisition.
8. Add verified subscription billing/webhooks before charging SaaS subscriptions.

## Release rule

Do not label the application “live production” merely because builds and the real database pass. A release is considered public production only after the application is reachable on a public URL, connected to the intended persistent database, `/api/readyz` is healthy through the public frontend, and the post-deploy smoke test passes end-to-end.
