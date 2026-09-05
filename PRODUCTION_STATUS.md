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

The repository has four independent CI gates:

1. `backend-ci`: unit/API tests, simulated customer journeys, security flows, inventory intelligence and application import.
2. `frontend-ci`: strict TypeScript typecheck and production Vite build.
3. `backend-postgres-production-ci`: vanilla PostgreSQL service, every versioned migration, schema invariant checks, production-mode API tests and production application import.
4. `container-ci`: builds both production Docker images so deployment cannot rely on an untested Dockerfile.

The v0.6 market workflow, v0.7 security workflow, v0.7.1 database hardening, v0.7.3 performance changes and v0.8 market-intelligence release were merged only after all applicable gates were green. v0.8.1 adds a separate process liveness check and a schema-aware readiness check; the backend container now becomes unhealthy if the database is unreachable or required migrations are missing.

## Known accuracy boundary

Inventory variance currently reconstructs theoretical usage from the current recipe. If a recipe changes between two physical counts, historical theoretical usage can be imperfect because recipe-version snapshots are not yet persisted. This must be fixed before using variance as an accounting-grade shrink figure. The feature is presently an operational diagnostic, not a statutory inventory valuation.

## Still blocking a public “live production” label

The application code, production containers and persistent database are production candidates, but the public release remains blocked by the application-hosting layer:

1. Deploy FastAPI and the React frontend to a real public hosting account.
2. Bind the production backend to the persistent PostgreSQL `DATABASE_URL`, a strong application `SECRET_KEY` and explicit production `CORS_ORIGINS` without exposing credentials in Git.
3. Bind the frontend runtime `API_UPSTREAM` to the backend internal/public service endpoint. Browser traffic continues to use same-origin `/api`, reducing CORS complexity.
4. Run the post-deploy smoke test through the public URL: `/livez`, `/readyz`, signup/login, workspace creation, tenant isolation, product/recipe, physical count, order completion, stock decrement, variance, demand, owner brief and finance.
5. Verify runtime logs, uptime/error monitoring, TLS and database backups.
6. Add e-mail verification and secure password recovery before broad public acquisition. Shareable team invites already work without e-mail infrastructure.
7. Add verified subscription billing/webhooks before charging customers inside the SaaS.

Vercel is connected at tool level but currently exposes no team/project account to deploy into. Railway remains the selected low-cost hosting path; the Railway integration is discoverable but is not yet authorized in this conversation, so no public deployment is being claimed.

## Release rule

Do not label the application “live production” merely because builds and the real database pass. A release is considered public production only after the application is reachable on a public URL, connected to the persistent database, `/readyz` is healthy, and the post-deploy smoke test passes end-to-end.
