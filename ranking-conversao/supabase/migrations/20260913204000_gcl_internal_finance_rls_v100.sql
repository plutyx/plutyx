-- GCL v100 — internal finance/control RLS defense in depth.
-- Production readiness already proves these tables have no direct anon/authenticated grants.
-- This migration only enables RLS. It does not add policies or change commercial/payment state.

alter table sac.commercial_products enable row level security;
alter table sac.purchases enable row level security;
alter table sac.memberships enable row level security;
alter table sac.billing_webhooks enable row level security;
alter table sac.runtime_capacity enable row level security;
alter table sac.edge_rate_limits enable row level security;
alter table sac.public_payload_cache enable row level security;
alter table sac.registry_sync_state enable row level security;
alter table sac.official_ranking_history enable row level security;
alter table sac.benchmark_deepening_policy enable row level security;
