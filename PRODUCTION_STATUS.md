# Cozinha 360 OS — Production status

Updated: 2026-09-05

## Cloud-validated

- Backend: FastAPI + SQLAlchemy + PostgreSQL-compatible persistence.
- Frontend: React + TypeScript + Vite, mobile-first.
- Authentication: account creation/login with Argon2 password hashing and signed JWTs.
- Multi-tenant model: users, businesses and memberships with owner/admin/member roles.
- Core economic engine: contribution, channel pricing, CPA guard and capacity guard.
- Orders: idempotency key, optimistic concurrency/versioning, status workflow and outbox event.
- Costs: ingredients, purchases, landed cost and price-change alerts.
- Customers: consent-aware customer records.
- Finance: revenue, variable cost, contribution, losses and landed purchases.
- Audit log and outbox tables are part of the production schema.
- Production security config rejects SQLite, weak app secrets and wildcard CORS.
- Supabase-compatible PostgreSQL migration exists under `supabase/migrations/`.
- Vercel routing/entrypoint files exist for frontend and FastAPI backend.

## Automated cloud gates

The repository currently has three independent CI gates:

1. `backend-ci`: unit/API tests and application import.
2. `frontend-ci`: strict TypeScript typecheck and production Vite build.
3. `backend-postgres-production-ci`: PostgreSQL 16 service, production migration, schema invariant checks, production-mode API tests and production application import.

All three gates passed in the latest deployment-preparation pull request before merge.

## Not yet safe to call publicly live production

The code is a production candidate, but public launch should remain blocked until these external actions are completed on the real provider accounts:

1. Provision the persistent Supabase PostgreSQL project and apply the migration.
2. Configure the real `DATABASE_URL`, a strong application `SECRET_KEY` and explicit production `CORS_ORIGINS`.
3. Create the Vercel backend and frontend projects and bind the production environment variables.
4. Verify `/api/health`, account signup/login and tenant isolation against the persistent database.
5. Configure domain, TLS, log retention, uptime/error monitoring and database backups.
6. Add password reset/email verification/session revocation before broad public acquisition.
7. Add subscription billing/webhook verification before charging customers.

## Release rule

Do not label the application “live production” merely because the build passes. A release is considered production only after the persistent database and public deployment are provisioned and the post-deploy smoke test passes.
