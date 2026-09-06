# Cozinha 360 OS — deployment gate

Production frontend target: `https://cozinha-360-os.netlify.app`

The deployment gate is intentionally separate from ordinary CI.

A release is considered **source-valid** only when the applicable PR gates are green:

- `frontend-ci`
- `backend-ci`
- `backend-postgres-production-ci`
- `container-ci`
- `browser-e2e`
- `cloud-edge-smoke` when Supabase/Edge changes are present
- `public-web-smoke`

A release is considered **publicly synchronized** only after both of these additional checks pass:

1. `netlify-production-deploy` builds the exact frontend from `main`, deploys the prebuilt `frontend/dist` to Netlify project `90508832-a343-4223-98d5-9f7ac45adc79`, and verifies the public alias serves the same `c360-release` marker.
2. `public-release-sync` independently fetches the public site and verifies the expected release marker and Vite production asset reference.

`public-web-smoke` proves that a public web surface is reachable and structurally healthy. It does **not** prove that the current `main` frontend has been deployed.

Netlify authentication must exist only as the GitHub Actions secret `NETLIFY_AUTH_TOKEN`. Never commit the token or expose it through frontend `VITE_*` variables.

See `docs/NETLIFY_RELEASE.md` for the operational release procedure and failure interpretation.
