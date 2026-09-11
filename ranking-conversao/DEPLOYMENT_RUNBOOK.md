# GCL production deployment runbook

## Source of truth

- Product branch: `convrank-hostinger-front`
- Validated production artifact branch: `convrank-hostinger-dist`
- Public target: `https://plutyx.com/ranking-site/`
- Render control-plane: `plutyx-hostinger-ranking-site-deployer`

## Release conveyor

1. A merge into `convrank-hostinger-front` runs the Ranking Site Hostinger Build workflow.
2. The build produces the `/ranking-site/` bundle and stamps `gcl-build.json` with the exact source SHA.
3. Validation must pass before the artifact is force-published to `convrank-hostinger-dist`.
4. `gcl-production-proof` wakes the Render control-plane.
5. The Render control-plane compares the public Hostinger provenance with the validated release provenance.
6. If the SHAs differ, it clones only `convrank-hostinger-dist`, validates the GCL application/artifact/base-path contract, and performs an isolated SFTP deployment.
7. The deployer requires `plutyx.com` + `ranking-site` scope, runs public smoke checks, and fails closed on invalid provenance.
8. `gcl-production-proof` waits for the exact source SHA, then runs Chromium against the public routes and the real GCL AI Analyst canary.

## Safety properties

- Render cold starts must never republish the baked-in bundle from an older service deploy.
- Hostinger credentials remain inside the Render deployer and are not copied into GitHub Actions.
- `convrank-hostinger-dist` is the only artifact branch accepted by autosync.
- Accepted provenance requires:
  - `application = Global Conversion League`
  - `artifact = hostinger-production-bundle`
  - `base_path = /ranking-site/`
  - a 40-character Git source SHA
- Production is not considered released until the public Hostinger SHA and browser proof both pass.

## Incident rule

If `gcl-production-proof` is red, do not describe the release as published even if build or artifact publication succeeded. Diagnose the first failing boundary: artifact provenance, Render wake/autosync, SFTP deployment, Hostinger convergence, or public browser proof.
