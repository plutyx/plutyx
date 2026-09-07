# Cozinha 360 OS — Omnichannel checklist 2026

This checklist converts the current dark-kitchen/home-delivery market guide into product gates.

## Hub omnichannel / OMS
- [x] canonical internal order + items + channel/source model
- [x] browser KDS states
- [x] idempotent order creation
- [ ] official iFood adapter + webhook signature/idempotency
- [ ] official WhatsApp Business adapter
- [ ] Rappi/Keeta adapters only where official access is available
- [x] channel event normalization contract and replay/dead-letter core

## KDS
- [x] Kanban-style status flow
- [x] elapsed-time calculation
- [x] distinct browser audio for new order and delivery state
- [x] live grouped prep view by identical menu product across open kitchen orders
- [x] explode grouped prep into identical recipe/pre-prep components (e.g. total buns, patties, sauces)
- [ ] configurable SLA per product/channel
- [ ] optional printer bridge; never block core workflow on hardware

## Finance and pricing
- [x] recipe/ingredient costing
- [x] shared stock consumption on completion
- [x] channel fee/fixed/delivery/promo/media cost model
- [x] contribution-first minimum-price guidance
- [ ] settlement reconciliation by provider
- [ ] statutory fiscal/accounting integrations only through validated regional providers

## CRM / data
- [x] consent-aware customer records
- [x] lifecycle segments: new / repeat / dormant (+ prospect)
- [x] first-party direct-order attribution preserving UTM/referrer/click IDs
- [x] campaign attribution using contribution after media, not revenue-only ROAS

## Marketing engine
- [x] first-party storefront event model
- [ ] Meta CAPI adapter
- [ ] TikTok Events/API adapter
- [ ] GA4 server/client event mapping
- [x] source-of-truth purchase conversion event with deterministic deduplication

## Logistics / purchasing
- [x] supplier/purchase records
- [x] inventory alerts and reorder target
- [ ] dispatch/route provider adapter
- [x] purchase planning from demand + par levels
- [x] open-order committed ingredient demand before forecast demand
- [x] weighted recent/history demand forecast exploded through recipe items
- [x] confidence reduction for short sales history and explicit recipe-coverage signal
- [x] supplier comparison remains historical; purchase remains explicit and user-confirmed

### Demand planning v5.3
The purchase planner combines the current stock position, open unconsumed orders, recipe quantities, the reorder target/par level and completed-order history. The recent seven-day rate has more weight than the prior observation period. When history is short, forecast influence is reduced rather than filled with invented demand. The output can raise a suggested replenishment above the static target, but it never creates a purchase, reserves stock or claims live supplier availability.

## Product guardrails
- Integrations are adapters behind the Cozinha 360 canonical model; they must not leak provider-specific state into core tables.
- Webhook ingestion must verify signatures where available, persist provider event IDs, acknowledge fast, and process idempotently.
- Public storefront prices are server-authoritative; the browser never decides sale price or unit cost.
- Financial decisions use contribution after variable/channel/media costs.
- CRM campaign suggestions never override consent/opt-out state.
- Conversion adapters must deduplicate with the Cozinha 360 event ID before sending to ad platforms.
- Purchase forecasts are deterministic operational guidance, not demand guarantees or autonomous purchasing.
- No claim of fiscal, labor or marketplace compliance without provider/jurisdiction validation.
