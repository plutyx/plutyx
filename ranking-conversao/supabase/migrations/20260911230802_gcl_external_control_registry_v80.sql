-- GCL v80: auditable external commercial-readiness controls.
-- External evidence is private; the public projection exposes only sanitized status metadata.

create table if not exists sac.gcl_external_control_attestations (
  id bigint generated always as identity primary key,
  control_code text not null check (control_code in (
    'auth_leaked_password_protection',
    'transactional_email_domain',
    'real_device_e2e',
    'heavy_worker_capacity',
    'legal_review',
    'incident_ownership'
  )),
  status text not null check (status in ('verified','blocked','unknown')),
  source text not null check (length(trim(source)) between 1 and 120),
  observed_at timestamptz not null,
  valid_until timestamptz,
  evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(evidence)='object'),
  note text,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until > observed_at)
);

create index if not exists gcl_external_control_attestations_latest_idx
  on sac.gcl_external_control_attestations(control_code, observed_at desc, id desc);

alter table sac.gcl_external_control_attestations enable row level security;
revoke all on sac.gcl_external_control_attestations from public, anon, authenticated, service_role;

create or replace function public.gcl_record_external_control_attestation(
  p_control_code text,
  p_status text,
  p_source text,
  p_observed_at timestamptz default now(),
  p_valid_until timestamptz default null,
  p_evidence jsonb default '{}'::jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, sac, auth
as $$
declare
  v_role text := coalesce(nullif(auth.role(),''), nullif(current_setting('request.jwt.claim.role', true), ''), '');
  v_id bigint;
begin
  if v_role <> 'service_role' then
    raise exception 'service_role_required' using errcode='42501';
  end if;

  if p_control_code not in (
    'auth_leaked_password_protection','transactional_email_domain','real_device_e2e',
    'heavy_worker_capacity','legal_review','incident_ownership'
  ) then
    raise exception 'invalid_external_control' using errcode='22023';
  end if;

  if p_status not in ('verified','blocked','unknown') then
    raise exception 'invalid_external_control_status' using errcode='22023';
  end if;

  if nullif(trim(coalesce(p_source,'')),'') is null or length(trim(p_source))>120 then
    raise exception 'invalid_external_control_source' using errcode='22023';
  end if;

  if p_observed_at is null or p_observed_at > now() + interval '5 minutes' then
    raise exception 'invalid_external_control_observed_at' using errcode='22023';
  end if;

  if p_status='verified' and (
    p_valid_until is null
    or p_valid_until<=p_observed_at
    or p_valid_until>p_observed_at+interval '30 days'
  ) then
    raise exception 'verified_attestation_requires_bounded_validity' using errcode='22023';
  end if;

  if p_evidence is null or jsonb_typeof(p_evidence)<>'object' or octet_length(p_evidence::text)>16384 then
    raise exception 'invalid_external_control_evidence' using errcode='22023';
  end if;

  insert into sac.gcl_external_control_attestations(
    control_code,status,source,observed_at,valid_until,evidence,note
  ) values (
    p_control_code,p_status,trim(p_source),p_observed_at,p_valid_until,p_evidence,left(p_note,2000)
  ) returning id into v_id;

  return jsonb_build_object(
    'recorded',true,
    'id',v_id,
    'control_code',p_control_code,
    'status',p_status,
    'observed_at',p_observed_at,
    'valid_until',p_valid_until
  );
end;
$$;

revoke execute on function public.gcl_record_external_control_attestation(text,text,text,timestamptz,timestamptz,jsonb,text)
from public, anon, authenticated;
grant execute on function public.gcl_record_external_control_attestation(text,text,text,timestamptz,timestamptz,jsonb,text)
to service_role;

create or replace function public.gcl_external_control_readiness()
returns jsonb
language sql
stable
security definer
set search_path = public, sac
as $$
with required(control_code) as (
  values
    ('auth_leaked_password_protection'::text),
    ('transactional_email_domain'::text),
    ('real_device_e2e'::text),
    ('heavy_worker_capacity'::text),
    ('legal_review'::text),
    ('incident_ownership'::text)
), latest as (
  select r.control_code,a.status,a.source,a.observed_at,a.valid_until
  from required r
  left join lateral (
    select x.status,x.source,x.observed_at,x.valid_until
    from sac.gcl_external_control_attestations x
    where x.control_code=r.control_code
    order by x.observed_at desc,x.id desc
    limit 1
  ) a on true
), normalized as (
  select control_code,
         case
           when status='verified' and valid_until>now() then 'verified'
           when status='verified' then 'stale'
           when status in ('blocked','unknown') then status
           else 'unknown'
         end as effective_status,
         (status='verified' and valid_until>now()) as verified,
         source,observed_at,valid_until
  from latest
)
select jsonb_build_object(
  'all_verified',coalesce(bool_and(coalesce(verified,false)),false),
  'verified_count',count(*) filter(where coalesce(verified,false)),
  'total_controls',count(*),
  'blockers',coalesce(
    jsonb_agg(control_code order by control_code) filter(where not coalesce(verified,false)),
    '[]'::jsonb
  ),
  'controls',coalesce(jsonb_agg(jsonb_build_object(
    'control_code',control_code,
    'status',effective_status,
    'source',coalesce(source,'unattested'),
    'observed_at',observed_at,
    'valid_until',valid_until,
    'fresh',coalesce(verified,false)
  ) order by control_code),'[]'::jsonb),
  'disclosure','External controls are fail-closed. Only fresh, bounded verified attestations satisfy commercial readiness; raw evidence remains private.'
)
from normalized;
$$;

grant execute on function public.gcl_external_control_readiness() to anon, authenticated, service_role;

-- Seed only states observed through connected production sources on 2026-09-11.
-- These are blockers, not approvals. Future service-role attestations supersede them by observed_at.
insert into sac.gcl_external_control_attestations(
  control_code,status,source,observed_at,valid_until,evidence,note
)
values
  (
    'auth_leaked_password_protection','blocked','supabase_security_advisor',
    '2026-09-11T22:59:17.618Z',null,
    jsonb_build_object('finding','auth_leaked_password_protection','state','disabled'),
    'Supabase security advisor reports leaked password protection disabled.'
  ),
  (
    'transactional_email_domain','blocked','resend_domain',
    '2026-09-11T23:00:00Z',null,
    jsonb_build_object(
      'domain','mail.plutyx.com','status','failed','dkim','failed','mx','failed','spf','failed','region','sa-east-1'
    ),
    'Resend domain verification failed; DNS records are not verified.'
  );

create or replace function public.gcl_public_health()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, sac
as $$
declare
  v_base jsonb;
  v_external jsonb;
  v_commercial jsonb;
  v_machine boolean;
  v_external_ok boolean;
begin
  v_base := public.gcl_public_health_base_v59()
    || jsonb_build_object('heavy_worker', public.gcl_worker_capacity_health());
  v_external := public.gcl_external_control_readiness();
  v_machine := coalesce((v_base->'commercial_go_live'->>'machine_checks_passed')::boolean,false);
  v_external_ok := coalesce((v_external->>'all_verified')::boolean,false);

  v_commercial := (v_base->'commercial_go_live') || jsonb_build_object(
    'external_controls',v_external,
    'external_attestations_passed',v_external_ok,
    'external_blockers',v_external->'blockers',
    'commercial_ready',v_machine and v_external_ok
  );

  return jsonb_set(v_base,'{commercial_go_live}',v_commercial,true);
end;
$$;
