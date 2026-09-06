# Cozinha 360 Delivery OS — Competitor Model 2026

Research snapshot: 2026-09-06. Sources are public product/pricing pages from Takeat, Consumer, Saipos and Anota AI.

## Market pattern

The strongest Brazilian restaurant systems converge on six blocks:

1. **Order capture** — own digital menu, WhatsApp automation, marketplace integrations, counter/PDV.
2. **Kitchen execution** — KDS, printing, order status and prep flow.
3. **Delivery logistics** — delivery zones, fees, courier assignment, route/rastreio.
4. **Retention** — CRM, coupons, points/cashback, campaigns and abandoned-order recovery.
5. **Back office** — recipe/stock, CMV, cash/DRE, fiscal, purchases and reports.
6. **Scale** — multi-unit/multi-brand, permissions, integrations and central reporting.

## Public pricing observed

- Consumer: R$59.90 Essential, R$179.90 Professional, R$269.90 High Performance; public free entry exists with limited digital-menu orders.
- Anota AI: monthly R$99.99 up to 150 orders, R$199.99 for 151-250, R$299.99 above 250; annual promotion shown as 12x R$99.99; payment-processing fees are separate.
- Takeat: public site says plans start at R$223/month and annual option has 20% discount.
- Saipos: plans start at R$240.79/month; support is included.

## Best capability to model from each

### Takeat
- Multi-brand dark-kitchen operation in one panel.
- KDS and reporting separated by brand.
- Independent marketplace configuration by brand.
- Consolidated operator view without losing brand identity.
- CRM separated by brand.

### Consumer
- Lowest-friction entry pricing.
- Own-channel digital menu without commission.
- Omnichannel order aggregation.
- Delivery zones by map/neighborhood/CEP/radius.
- Courier app, route grouping and customer tracking.
- Coupons, points and cashback.
- WhatsApp bot tied to ordering and status updates.
- Fiscal/PDV/stock in the same subscription.

### Saipos
- Strong back office: recipe, automatic stock deduction, CMV, DRE, cash flow and purchasing.
- Large integration surface and iFood positioning.
- KDS/Kanban plus operational analytics.
- Multi-unit management and central reporting.
- Route/delivery integrations.

### Anota AI
- WhatsApp-first acquisition and order automation.
- Automated recovery of lost/abandoned demand.
- Digital menu + payment + PDV + KDS.
- Coupons/cashback and ads pixel integration.
- Simple commercial packaging tied to order volume.

## Cozinha 360 thesis

Do not copy four separate products. Build one **decision-first Delivery OS** for small and mid-size food operations:

- Own channel first, marketplaces as optional acquisition channels.
- Multi-brand as a core dark-kitchen primitive, not an enterprise add-on.
- KDS + recipe + stock + contribution margin already share the same operating data.
- Delivery configuration (zones, fees, couriers) belongs beside the order, not in another app.
- Retention (coupon/loyalty/CRM) must use first-party customer consent and contribution margin rules.
- Autopilot/Today should decide what to prepare, buy, pause, promote or recover — competitors usually stop at reporting.
- External APIs use a BYOC model where sensible: the merchant authorizes their provider in a few clicks, so Cozinha 360 can keep the SaaS fee low instead of hiding transaction cost inside the subscription.

## Commercial model candidate

Commercial pricing is a strategy proposal until checkout/billing is enabled and approved:

- **Free — R$0:** 1 brand, own digital storefront, basic KDS/stock, up to 50 direct orders/month.
- **Essencial — R$49.90/month:** 1 brand, up to 500 direct orders, delivery zones, CRM, coupons, Pix/manual payment flows, Today.
- **Growth — R$99.90/month:** unlimited direct orders, online-payment connector, WhatsApp connector, loyalty/cashback, Growth Lab, advanced margins.
- **Scale — R$179.90/month:** up to 5 brands, marketplace connectors, courier/dispatch board, full Autopilot, team roles and consolidated brand reporting.
- **MultiBrand — R$249.90/month:** up to 15 brands/units, advanced API/exports, priority support and consolidated finance.

Third-party charges (payment processing, WhatsApp/Meta conversations, marketplace commission, maps usage, fiscal certificate/provider costs) stay transparent and are charged by the relevant provider whenever possible.

## v4.0 implementation scope

The first production foundation adds:

- Brand registry per business.
- Delivery zones and fees.
- Courier registry/status.
- Loyalty policy.
- Coupon/promo registry.
- Delivery OS command center that combines these with live Cozinha 360 order/finance data.

Later increments add geocoded dispatch optimization, customer live tracking, marketplace write APIs, fiscal adapters, table service/totem and automated WhatsApp order ingestion after provider approvals are available.
