# Cozinha 360 OS — Omnichannel integration contract v1.5

## Why this layer exists

The core product must not depend on any marketplace-specific state machine. iFood, WhatsApp, Rappi, Keeta and future channels are adapters around one internal event contract.

The operator sees one queue. Providers remain replaceable.

## Canonical ingestion lifecycle

1. Adapter receives the provider event.
2. Validate provider authenticity/signature using the exact raw-body rules from that provider.
3. Persist the event before acknowledging when the provider contract requires it.
4. Deduplicate using the provider event ID plus tenant/provider scope.
5. Normalize to a canonical event type.
6. Apply the internal order transition idempotently.
7. Mark processed, ignored or failed.
8. Retry transient failures; move poison events to dead-letter state with traceable error context.

## Canonical order event vocabulary

Initial vocabulary:

- `order.received`
- `order.confirmed`
- `order.preparing`
- `order.ready`
- `order.dispatched`
- `order.completed`
- `order.cancelled`
- `order.cancellation_requested`

Unknown provider events must be stored and may be marked `ignored`; they must never break subsequent event processing.

## Persistence contract

`integration_connections` stores non-secret connection metadata and health. Provider credentials remain in a secret manager/provider environment, never plaintext in tenant-facing tables.

`integration_events` stores:

- tenant/business
- provider + provider event ID
- provider event type and external order ID
- occurrence/receipt timestamps
- whether provider signature verification succeeded
- SHA-256 of raw payload
- raw payload text for replay/audit
- normalized canonical type/payload
- linked internal order when known
- attempts, retry time and dead-letter status

## Reliability rules

- Every event is idempotent.
- The event ID is the primary duplicate key; raw payload hash is evidence, not the duplicate key.
- A webhook adapter should acknowledge fast and defer expensive work.
- Polling adapters acknowledge only events already persisted/processed according to provider contract.
- Replays must not duplicate internal orders, inventory consumption or finance effects.
- Provider-specific statuses never become new core order statuses without a deliberate product decision.

## iFood first-adapter notes

Official iFood order docs expose unique event IDs, order IDs, lifecycle event codes and both polling and webhook delivery. Their best-practice guidance says to persist before acknowledgment, ignore duplicates by event ID, acknowledge quickly, and use polling as a recovery path when needed.

Useful official references:

- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/events
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/order/workflow
- https://developer.ifood.com.br/en-US/docs/food/guides/modules/events/webhook-best-practices
- https://developer.ifood.com.br/en-US/docs/getting-started/documentation/best-practices

Production iFood activation still requires its own developer account, credentials, test application and homologation. The core contract can be production-ready before those credentials exist.

## Security rules

- Verify signatures before parsing whenever the provider requires raw-byte validation.
- Do not expose provider secrets to the browser.
- Direct PostgREST access to integration tables stays revoked for `anon` and `authenticated` roles.
- Edge/server adapters use server-side credentials and service-role-only RPCs.
- Never scrape restricted marketplace customer data to populate CRM.
