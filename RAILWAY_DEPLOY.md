# Cozinha 360 OS — Railway production deployment

This repository is a two-service monorepo:

- `api`: FastAPI backend from `/backend`
- `web`: React/Nginx frontend from `/frontend`

Production traffic should follow:

`browser -> web (public) -> /api -> api (Railway private network) -> Supabase PostgreSQL`

The backend does not need a public domain for normal browser traffic. Keeping API traffic behind the frontend proxy reduces public surface area and keeps the browser on one origin.

## 1. Create the Railway project

Create one Railway project and one `production` environment. Attach this GitHub repository to two services named exactly:

- `api`
- `web`

For `api`:

- Root Directory: `/backend`
- Config as Code file: `/backend/railway.toml`
- Dockerfile: `/backend/Dockerfile` (auto-detected from the root directory)
- Public networking: optional; private networking is enough for `web -> api`

For `web`:

- Root Directory: `/frontend`
- Config as Code file: `/frontend/railway.toml`
- Dockerfile: `/frontend/Dockerfile`
- Public networking: enabled; generate a Railway domain first and add the final custom domain later

## 2. Backend variables (`api`)

Required:

```text
ENVIRONMENT=production
DATABASE_URL=<sealed Supabase PostgreSQL connection string>
SECRET_KEY=<random secret with at least 48 characters>
CORS_ORIGINS=https://${{web.RAILWAY_PUBLIC_DOMAIN}}
```

Recommended:

```text
ACCESS_TOKEN_MINUTES=10080
RAILWAY_DEPLOYMENT_DRAINING_SECONDS=20
```

Important:

- Do not commit `DATABASE_URL` or `SECRET_KEY`.
- Seal secrets in Railway after they are set.
- Use the persistent Supabase database already migrated for this application; do not silently create a second production database.
- If a custom frontend domain is added, append that exact HTTPS origin to `CORS_ORIGINS` and redeploy `api`.

## 3. Frontend variables (`web`)

Required:

```text
API_UPSTREAM=http://${{api.RAILWAY_PRIVATE_DOMAIN}}:${{api.PORT}}
```

The Nginx container proxies `/api/*` over Railway's private network. The React bundle therefore continues to call same-origin `/api` and does not contain a backend secret or private hostname.

## 4. Health and deploy behavior

Backend deployment health is `/readyz`. It returns 200 only when:

- the process is alive,
- the database is reachable,
- the required production schema is present.

Frontend deployment health is `/healthz`.

Both services use `ON_FAILURE` restart policy and health checks are enforced before Railway promotes the new deployment.

## 5. Public smoke test

After both services are active, the minimum infrastructure checks are:

```text
GET https://<web-domain>/healthz
GET https://<web-domain>/api/livez
GET https://<web-domain>/api/readyz
```

All must return HTTP 200.

Then run the customer journey through the public web domain:

1. Create a fresh account.
2. Create a business/workspace.
3. Add one ingredient and configure stock/par/target.
4. Create one product and its recipe.
5. Create a paid order with an item.
6. Advance the KDS to completed.
7. Verify theoretical stock consumption.
8. Verify revenue/contribution in Finance.
9. Record a physical inventory count and inspect variance.
10. Check Owner Brief and Data Quality.
11. Create a second account and verify tenant isolation.

The repository also contains a Chromium E2E gate that executes the core customer journey on every pull request. Public deployment still requires this post-deploy smoke test because CI success is not proof that DNS, runtime variables, private networking, TLS and the real database are wired correctly.

## 6. Release conditions

Do not call the system public production until all are true:

- `web` has a reachable HTTPS domain;
- `/api/readyz` is healthy through the public frontend;
- Railway `api` is connected to the intended Supabase database;
- browser customer smoke test passes against the public URL;
- runtime logs show no recurring 5xx/startup errors;
- Supabase backups/recovery expectations are documented;
- password recovery/e-mail verification are implemented before broad acquisition;
- verified billing/webhooks are implemented before charging SaaS subscriptions.
