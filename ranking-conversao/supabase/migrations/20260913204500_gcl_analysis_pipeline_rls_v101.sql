-- GCL v101 — analysis pipeline RLS defense in depth.
-- These tables are internal/gateway-only in production and have no direct anon/authenticated data grants.
-- Enabling RLS adds a second boundary without changing RPCs, policies, payment state, or worker scheduling.

alter table sac.fullscan_jobs enable row level security;
alter table sac.audit_runs enable row level security;
alter table sac.pages enable row level security;
alter table sac.source_snapshots enable row level security;
alter table sac.snapshot_browser_jobs enable row level security;
alter table sac.fallback_page_jobs enable row level security;
alter table sac.origin_timing_jobs enable row level security;
alter table sac.domain_probe_jobs enable row level security;
alter table sac.ai_enrichment_jobs enable row level security;
alter table sac.ai_enrichments enable row level security;
