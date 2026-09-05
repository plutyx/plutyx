# Real persistent DB smoke plan

The production-preparation database must pass these checks after every schema release:

1. every migration is recorded and application tables exist;
2. RLS is enabled for application tables exposed in `public`;
3. PostgREST `anon`/`authenticated` cannot read or mutate app-owned tables;
4. relational constraints reject cross-entity corruption;
5. a transaction can create user → business → membership → ingredient → product → recipe → order → item and roll back cleanly;
6. the FastAPI deployment, once connected with server database credentials, must pass signup/login, tenant isolation, order completion, stock decrement and finance summary against this same persistent database.

The first five checks can be executed directly against Supabase. Step six is the post-deploy blocker for declaring the public app live.
