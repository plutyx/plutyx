-- GCL v102 — scoring and metrics core RLS defense in depth.
-- These registries/evidence tables are internal/gateway-only and have no direct anon/authenticated data grants.
-- This migration only enables RLS; it does not alter score math, policies, RPCs, data, or commercial state.

alter table sac.criteria enable row level security;
alter table sac.atomic_checks enable row level security;
alter table sac.atomic_evaluations enable row level security;
alter table sac.criterion_evaluations enable row level security;
alter table sac.detector_code_map enable row level security;
alter table sac.metric_registry enable row level security;
alter table sac.metric_observations enable row level security;
alter table sac.signal_calibration enable row level security;
alter table sac.semantic_prototypes enable row level security;
alter table sac.engine_registry enable row level security;
