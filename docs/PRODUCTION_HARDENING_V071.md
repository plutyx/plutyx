# Production hardening v0.7.1

## Persistent database

The Cozinha 360 OS schema is now applied to the persistent Supabase PostgreSQL project used for production preparation. The application keeps its own `users` table and custom authentication rather than relying on Supabase Auth for business authorization.

## Direct API exposure

Application tables live in `public` because the FastAPI/SQLAlchemy backend expects the default schema. To avoid accidentally exposing those tables through Supabase PostgREST:

- Row Level Security is enabled on every application table.
- `anon` and `authenticated` table/sequence privileges are revoked when those roles exist.
- No permissive RLS policies are created for PostgREST clients.
- Business authorization remains server-side in FastAPI memberships.
- `touch_updated_at` has an explicit `search_path`.

This intentionally produces Supabase informational lints that RLS has no policies. In this architecture that means browser clients cannot bypass FastAPI and query application tables directly.

## Portability

The migration checks whether Supabase-specific roles exist before revoking privileges, so the same migration can also run in the vanilla PostgreSQL CI container.
