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
- Production: production batches, responsible member, planned/produced/waste quantities.
- Demand: deterministic weighted moving average based on the business's own order history, with confidence level and no paid AI dependency.
- Customers: consent-aware customer records.
- Finance: revenue, variable cost, contribution, losses and landed purchases.
- Audit log and outbox tables are part of the production schema.

## Persistent production-preparation database

A real persistent Supabase PostgreSQL project is now provisioned and contains all application migrations through the current release. The schema has also passed an actual transaction smoke test covering user → business → membership → ingredient → product → recipe → order → order item → production batch → invite, with the transaction rolled back after validation.

Security hardening on the persistent database:

- Row Level Security is enabled on every application table in `public`.
- Direct PostgREST privileges for `anon` and `authenticated` are revoked; the browser cannot bypass FastAPI business authorization.
- The trigger helper has an explicit `search_path`.
- Supabase security advisor no longer reports the previous RLS-disabled or mutable-search-path findings; remaining no-policy notices are informational and intentional for this server-only data architecture.
- Foreign keys identified by the performance advisor now have covering indexes. The remaining unused-index notices are expected on a newly provisioned database without production traffic and must be revisited after real usage rather than removed prematurely.

## Automated cloud gates

The repository has three independent CI gates:

1. `backend-ci`: unit/API tests, simulated customer journeys and application import.
2. `frontend-ci`: strict TypeScript typecheck and production Vite build.
3. `backend-postgres-production-ci`: vanilla PostgreSQL service, every versioned migration, schema invariant checks, production-mode API tests and production application import.

The v0.6 market workflow, v0.7 security workflow, v0.7.1 database hardening and v0.7.3 performance changes were merged only after all applicable gates were green.

## Still blocking a public “live production” label

The application code and persistent database are production candidates, but the public release remains blocked by the application-hosting layer:

1. Deploy FastAPI and the React frontend to a real public hosting account.
2. Bind the production backend to the persistent PostgreSQL `DATABASE_URL`, a strong application `SECRET_KEY` and explicit production `CORS_ORIGINS` without exposing credentials in Git.
3. Run the post-deploy smoke test through the public URL: `/api/health`, signup/login, workspace creation, tenant isolation, product/recipe, order completion, stock decrement, demand and finance.
4. Verify runtime logs, uptime/error monitoring, TLS and database backups.
5. Add e-mail verification and secure password recovery before broad public acquisition. Shareable team invites already work without e-mail infrastructure.
6. Add verified subscription billing/webhooks before charging customers inside the SaaS.

Vercel is connected at tool level but currently exposes no team/project account to deploy into. A Railway deployment integration has therefore been selected as the next low-cost hosting path; deployment can continue as soon as that hosting connection is authorized.

## Release rule

Do not label the application “live production” merely because builds and the real database pass. A release is considered public production only after the application is reachable on a public URL, connected to the persistent database, and the post-deploy smoke test passes end-to-end.
