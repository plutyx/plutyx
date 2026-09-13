-- GCL v98: workload-backed Community case-study lookup index.
-- The progression and leaderboard paths repeatedly filter verified case studies
-- by user_id and updated_at. Keep this migration deliberately narrow: advisor
-- findings without a demonstrated production access path are not indexed here.

create index if not exists community_case_studies_user_verified_updated_idx
  on sac.community_case_studies(user_id, verification_status, updated_at desc);
