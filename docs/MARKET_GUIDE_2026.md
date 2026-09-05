# Cozinha 360 OS — Market guide 2026

## Product thesis

Home-based delivery and dark-kitchen operators do not primarily suffer from a lack of modules. They suffer from fragmented decisions: orders spread across channels, unclear contribution margin, shared inventory across brands, disconnected customer data, and operational overload during service.

The product should therefore optimize for **fewer touches to the right decision**, not for ERP breadth.

## Problems to solve first

1. One operating queue for orders from direct and marketplace channels.
2. Contribution-first pricing by channel, including percentage fee, fixed fee, delivery, promotion, media and recipe cost.
3. Shared ingredient stock across multiple virtual brands.
4. Browser KDS with high contrast, clear elapsed-time states and distinct audio alerts.
5. Direct-channel customer ownership with consent-aware CRM.
6. Production planning based on own sales history and committed open orders.
7. Traceable connection between marketing spend and direct-channel sales.

## UX principles

- Dark kitchen mode by default for operational screens.
- Critical actions should take no more than two taps where feasible.
- Cards/Kanban for time-sensitive order flow; tables only for analysis/configuration.
- Distinct sounds for new order, WhatsApp/direct lead and dispatch state.
- Beginner-first onboarding: one product, one recipe, one channel, one price, one paid order.

## Roadmap discipline

### Now
- multibrand + shared stock
- channel-aware margin engine
- KDS audio/timing
- account security and transactional email
- public browser E2E

### Next
- official webhook adapters for marketplaces/WhatsApp, behind a canonical order-event contract
- direct ordering storefront and first-party attribution
- consent-aware CRM segmentation (new / repeat / dormant)
- ad attribution imports and contribution-after-media reporting

### Later / regulated
- fiscal document providers
- payroll/freelancer accounting
- marketplace settlement reconciliation
- route optimization and dispatch integrations

These later modules require provider, tax and jurisdiction validation and must not be presented as universal compliance automation.

## Benchmark patterns

Use established restaurant SaaS products as pattern references, not as a feature-count target: unified order intake, browser/tablet KDS, recipe costing, purchase-price propagation, vendor alerts, customer history, direct ordering and operational reporting.

The defensible positioning is a beginner-first operating system for small kitchens that explicitly tells the operator what to fix before increasing demand.
