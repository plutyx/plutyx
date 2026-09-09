# Ranking Site — Hostinger subpath build

Target public route: `https://plutyx.com/ranking-site/`

## Build

```bash
npm install
VITE_BASE_PATH=/ranking-site/ npm run build
```

Publish **the contents of `dist/`** to the existing Hostinger folder mapped to `public_html/ranking-site/`.

The production Vite base is `/ranking-site/`, and `public/.htaccess` is copied into `dist/.htaccess` so SPA navigation, scoped rewrites and security headers remain inside this folder.

## Backend boundary

The browser calls only the server-side gateway `sac-ranking-site-api`. Service-role credentials, Render worker tokens, pg_net request IDs and the internal `sac` schema are not exposed to the browser.

## Operational metric policy

- A metric is active in the public analyzer only when it has an implemented autonomous collector.
- Private/RUM/experiment/provider-only metrics stay in the scientific catalogue but do not count toward the public score or active metric total.
- Absence of evidence is never treated as pass.
- Browser/snapshot CRO evidence is labeled synthetic/browser and is not represented as RUM, eye-tracking or actual conversion rate.
- Official/layer scores remain coverage-gated.

## Current production target

- Public route: `/ranking-site/`
- Active public metrics: autonomous collectors only.
- Backend gateway: Supabase Edge Function `sac-ranking-site-api`.
- Heavy browser/lab work runs in dedicated workers and is materialized with provenance.
