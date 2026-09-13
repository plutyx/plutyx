-- GCL v104 — Awards, Experience and Market RLS defense in depth.
-- These tables are internal/gateway-only and have no direct anon/authenticated table data grants.
-- This migration only enables RLS. It does not alter award logic, experience scorecards, market data, RPCs, policies, or commercial state.

alter table sac.award_definitions enable row level security;
alter table sac.award_seasons enable row level security;
alter table sac.awards enable row level security;
alter table sac.community_ratings enable row level security;
alter table sac.experience_composite_map enable row level security;
alter table sac.experience_dimension_map enable row level security;
alter table sac.experience_dimension_scores enable row level security;
alter table sac.experience_dimensions enable row level security;
alter table sac.market_categories enable row level security;
alter table sac.market_listings enable row level security;
