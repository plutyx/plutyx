-- GCL v105b — final high-coupling core gateway RLS defense in depth.
-- These five internal tables have no direct anon/authenticated table data grants.
-- Representative production gateways were transaction-tested under RLS before promotion:
-- public home/ranking, snapshot, preview status, deep report, competition context, replay payload and lead capture.
-- This migration only enables RLS; it does not alter policies, RPCs, data, score math, lead semantics or commercial state.

alter table sac.domains enable row level security;
alter table sac.findings enable row level security;
alter table sac.leads enable row level security;
alter table sac.methodologies enable row level security;
alter table sac.snapshot_replay_tokens enable row level security;
