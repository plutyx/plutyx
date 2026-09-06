# Netlify production release — Cozinha 360 OS

## Production target

- Netlify project: `cozinha-360-os`
- Site/Project ID: `90508832-a343-4223-98d5-9f7ac45adc79`
- Public alias: `https://cozinha-360-os.netlify.app`
- Frontend source: `frontend/`
- Published directory: `frontend/dist`

## Why this pipeline exists

The original public candidate was published by API upload and is not connected to the GitHub repository. A successful HTTP smoke therefore proves availability, not that production matches `main`.

The release chain now separates three questions:

1. `frontend-ci`: can the source typecheck and build a production bundle?
2. `netlify-production-deploy`: was that prebuilt bundle accepted by the correct Netlify project and does the public alias serve its release marker?
3. `public-release-sync`: does the public HTML still identify as the release expected by the repository?

## Required GitHub secret

`NETLIFY_AUTH_TOKEN`

This must be stored in GitHub Actions secrets for `plutyx/plutyx`. It must never be committed, copied into `VITE_*`, checked into a `.env` file, or exposed to browser code.

The site ID is not a credential and remains explicit in the workflow so a release cannot accidentally create or select another project.

## Deployment behavior

`.github/workflows/netlify-production-deploy.yml`:

- runs on relevant `main` frontend/deployment-workflow changes and manual dispatch;
- uses Node 22;
- refuses to proceed if `NETLIFY_AUTH_TOKEN` is absent;
- installs and typechecks the frontend;
- creates the Vite production bundle with explicit production API URLs;
- reads the `c360-release` identity from `dist/index.html`;
- uses pinned `netlify-cli@27.5.0` to deploy only `frontend/dist` to the existing site with `--prod`;
- never uploads source secrets or server configuration;
- polls the public alias and requires both the same release marker and a Vite JavaScript asset reference before reporting success.

A successful Netlify command by itself is not enough. Public-alias verification is part of the same job.

## Failure interpretation

- **`Netlify credential missing`**: repository code is deployable, but GitHub has no authorized Netlify token. Add the secret; do not put a token in source control.
- **build/typecheck failure**: source release is invalid; do not deploy.
- **Netlify deploy command failure**: provider/auth/project issue; previous production remains authoritative.
- **alias did not converge**: deploy was accepted but public production cannot yet be proven current.
- **`public-release-sync` stale failure**: public host is reachable but is serving an older release. This is deployment drift, not an uptime success.

## Release rule

Do not describe the latest frontend as publicly deployed until `netlify-production-deploy` has verified the public alias and `public-release-sync` is green for the expected release.