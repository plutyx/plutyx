# Ranking Conversão — Hostinger subpath build

Target public route: `https://plutyx.com/ranking-conversao/`

## Build

```bash
npm install
npm run build
```

Upload **the contents of `dist/`** to the Hostinger folder that maps to `public_html/ranking-conversao/`.

The Vite base is already `/ranking-conversao/`, and `public/.htaccess` is copied into `dist/.htaccess` so client-side navigation and security headers remain scoped to this folder.

## Backend boundary

The browser calls only the Supabase Edge Function `sac-public-api` with the project's public anon credential. Service-role credentials, Render worker tokens, `pg_net` request IDs and the internal `sac` schema are not exposed to the browser.

## Integrity gates

- Public preview is **not** the official SAC Score.
- Ranking stays locked while `ranking_live=false`.
- The `10.000+ analisados` claim must only be shown when `benchmark.claim_10000_ready=true`.
- Lighthouse is lab data; it must not be presented as CrUX/field data.
