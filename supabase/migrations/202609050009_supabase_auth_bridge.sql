begin;

alter table public.users
  add column if not exists auth_user_id uuid;

create unique index if not exists ux_users_auth_user_id
  on public.users(auth_user_id)
  where auth_user_id is not null;

comment on column public.users.auth_user_id is
  'Maps Supabase Auth UUID to the existing Cozinha 360 application user row.';

commit;
