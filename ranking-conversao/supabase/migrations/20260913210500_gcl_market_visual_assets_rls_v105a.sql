-- GCL v105a — low-coupling assets, Market internals and Visual Modules RLS defense in depth.
-- These tables have no direct anon/authenticated data grants. This migration only enables RLS.
-- It does not alter Market recommendations, submissions, visual-module mappings, assets, RPCs, policies, or commercial state.

alter table sac.assets enable row level security;
alter table sac.market_listing_engines enable row level security;
alter table sac.market_submissions enable row level security;
alter table sac.visual_module_criteria enable row level security;
alter table sac.visual_modules enable row level security;
