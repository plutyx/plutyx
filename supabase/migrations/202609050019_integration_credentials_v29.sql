begin;

create table if not exists public.integration_credentials (
  connection_id bigint primary key references public.integration_connections(id) on delete cascade,
  business_id bigint not null references public.businesses(id) on delete cascade,
  provider varchar(40) not null,
  ciphertext text not null,
  iv text not null,
  key_version smallint not null default 1,
  expires_at timestamptz,
  scopes_json text not null default '[]',
  metadata_json text not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_integration_credentials_business_provider
  on public.integration_credentials(business_id, lower(provider));

alter table public.integration_credentials enable row level security;

do $$
begin
  if exists(select 1 from pg_roles where rolname='anon') then
    execute 'revoke all privileges on table public.integration_credentials from anon';
  end if;
  if exists(select 1 from pg_roles where rolname='authenticated') then
    execute 'revoke all privileges on table public.integration_credentials from authenticated';
  end if;
end $$;

drop trigger if exists trg_integration_credentials_updated_at on public.integration_credentials;
create trigger trg_integration_credentials_updated_at
before update on public.integration_credentials
for each row execute function public.touch_updated_at();

comment on table public.integration_credentials is
  'Encrypted-at-application-layer provider tokens. Never expose this table through tenant-facing APIs.';

commit;
