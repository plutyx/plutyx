# Cozinha 360 OS — Provider setup v2.9

This checklist is for the platform operator, not for tenant users. Tenant users must never paste provider client secrets or long-lived access tokens into the browser.

## Public integration gateway

Base URL:

`https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integrations-v29`

Health:

- `/livez`
- `/readyz`

## Redirect URLs

Register the exact callback URLs below in each provider application:

- Google: `https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integrations-v29/oauth/google/callback`
- Mercado Pago: `https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integrations-v29/oauth/mercadopago/callback`
- WhatsApp / Meta authorization: `https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integrations-v29/oauth/whatsapp/callback`
- Meta Ads: `https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integrations-v29/oauth/meta_ads/callback`

The iFood distributed authorization flow uses a Partner Portal user code and authorization code rather than a browser redirect callback.

## Server-only secrets

Configure these only in the Supabase Edge Function secret environment. Never place them in `VITE_*`, source control, localStorage or tenant-facing tables.

### Meta / WhatsApp

- `META_APP_ID`
- `META_APP_SECRET`

The Meta app still needs the provider permissions/review required for the selected WhatsApp Business and Marketing API capabilities. Do not label a tenant channel operational until the provider account and required assets are actually available to the token.

### Mercado Pago / Pix

- `MERCADOPAGO_CLIENT_ID`
- `MERCADOPAGO_CLIENT_SECRET`

Register the Mercado Pago callback URL above. The tenant flow uses Authorization Code + PKCE and stores refresh/access material encrypted server-side.

### Google

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_ADS_DEVELOPER_TOKEN` — required for Google Ads API calls, not merely for OAuth identity

Register the Google callback URL above. The Google Cloud project also needs the applicable Google Business Profile API access/enablement and Google Ads developer-token approval before those product features can be considered live.

### iFood

- `IFOOD_CLIENT_ID`
- `IFOOD_CLIENT_SECRET`

Production use depends on the official iFood developer application / homologation. The tenant flow requests a user code, sends the merchant to the Partner Portal, and exchanges the returned authorization code server-side.

## Optional platform hardening secret

- `C360_INTEGRATION_KEY`

If supplied, this becomes the dedicated application-layer AES-GCM/HMAC root for encrypted provider credentials and signed OAuth state. If absent, v2.9 deterministically derives a key from the server-only Supabase service role key. A dedicated key is preferred for independent rotation.

## Frontend

Netlify production build variable:

- `VITE_INTEGRATIONS_API_URL=https://npgheuzpnkwtxopswpqy.supabase.co/functions/v1/cozinha360-integrations-v29`

The browser receives only provider catalog metadata, account display metadata, connection health and temporary authorization URLs. Provider client secrets and stored access/refresh tokens are never returned by the tenant API.

## Tenant flow target

Recommended onboarding order in the UI:

1. WhatsApp Business
2. Mercado Pago / Pix
3. Google Business
4. iFood when the business actually sells there
5. Meta Ads / Google Ads after order, margin and attribution foundations are configured

This order is a product default, not a requirement. The operator should avoid asking a small business to connect channels it does not use.

## Production acceptance gate

Before marking a provider green for customers:

1. Provider application credentials are configured server-side.
2. OAuth/user-code start flow succeeds from a real tenant owner account.
3. Callback/token exchange succeeds.
4. The correct provider account/merchant asset is resolved.
5. `Testar` returns success against the provider API.
6. Credentials are absent from browser/network responses except short-lived provider authorization URLs.
7. Disconnect removes encrypted credentials without deleting historical operational events.
8. If the provider sends events, signature verification, idempotency and replay/dead-letter behavior follow `INTEGRATION_CONTRACT_2026.md`.
