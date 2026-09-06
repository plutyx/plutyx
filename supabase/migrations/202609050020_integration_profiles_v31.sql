begin;

create table if not exists public.integration_profiles (
  business_id bigint primary key references public.businesses(id) on delete cascade,
  order_source varchar(20) not null default 'direct',
  use_mercadopago boolean not null default true,
  use_google boolean not null default true,
  use_meta_ads boolean not null default false,
  configured_at timestamptz,
  updated_by_user_id bigint references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_integration_profiles_order_source
    check (order_source in ('direct','whatsapp','ifood','mixed'))
);

alter table public.integration_profiles enable row level security;

do $$
begin
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all privileges on table public.integration_profiles from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all privileges on table public.integration_profiles from authenticated';
  end if;
end $$;

drop trigger if exists trg_integration_profiles_updated_at on public.integration_profiles;
create trigger trg_integration_profiles_updated_at
before update on public.integration_profiles
for each row execute function public.touch_updated_at();

comment on table public.integration_profiles is
  'Business-owned integration intent used by Connection Autopilot. Contains preferences only; never provider secrets.';

commit;