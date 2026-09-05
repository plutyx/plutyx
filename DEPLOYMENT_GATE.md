# Vercel + Supabase deployment gate

Cloud deployment preparation for Cozinha 360 OS.

This gate verifies the code after:
- Supabase PostgreSQL production migration
- backend FastAPI Vercel entrypoint and routing
- frontend same-origin `/api` default with local proxy
- frontend SPA routing on Vercel

The application must keep both backend and frontend CI green before deployment credentials are applied.
