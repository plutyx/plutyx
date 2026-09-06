begin;

create index if not exists ix_loyalty_programs_updated_by
  on public.loyalty_programs(updated_by_user_id)
  where updated_by_user_id is not null;

commit;
