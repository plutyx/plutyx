-- GCL v103 — benchmark, ranking, reporting and research RLS defense in depth.
-- These tables are internal/gateway-only and currently expose no direct anon/authenticated table data grants.
-- This migration only enables RLS. It does not alter ranking math, benchmark data, reports, RPCs, or commercial state.

alter table sac.benchmark_results enable row level security;
alter table sac.benchmark_snapshots enable row level security;
alter table sac.benchmark_sources enable row level security;
alter table sac.benchmark_targets enable row level security;
alter table sac.score_history enable row level security;
alter table sac.ranking_entries enable row level security;
alter table sac.reports enable row level security;
alter table sac.research_sources enable row level security;
alter table sac.site_highlights enable row level security;
alter table sac.preview_usage enable row level security;
