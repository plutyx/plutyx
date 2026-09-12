-- GCL v82: consent-aware first-party acquisition event ledger.
-- Non-essential browser events are written only through the public Edge gateway.
-- The table is private; the writer is service-role-only.

create table if not exists sac.gcl_acquisition_events (
  id bigint generated always as identity primary key,
  event_name text not null check (event_name in ('landing_view','diagnostic_started','lead_saved','consent_updated')),
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now(),
  session_id uuid not null,
  preview_token uuid,
  lead_id uuid,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  referrer text,
  landing_path text,
  gclid text,
  fbclid text,
  msclkid text,
  ttclid text,
  analytics_consent boolean not null default false,
  ads_consent boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  constraint gcl_acquisition_events_metadata_object check (jsonb_typeof(metadata) = 'object')
);

create index if not exists idx_gcl_acquisition_events_received_at
  on sac.gcl_acquisition_events(received_at desc);
create index if not exists idx_gcl_acquisition_events_session
  on sac.gcl_acquisition_events(session_id, received_at desc);
create index if not exists idx_gcl_acquisition_events_preview
  on sac.gcl_acquisition_events(preview_token, received_at desc)
  where preview_token is not null;
create index if not exists idx_gcl_acquisition_events_lead
  on sac.gcl_acquisition_events(lead_id, received_at desc)
  where lead_id is not null;

alter table sac.gcl_acquisition_events enable row level security;
revoke all on table sac.gcl_acquisition_events from public, anon, authenticated;
grant select, insert, update, delete on table sac.gcl_acquisition_events to service_role;
grant usage, select on sequence sac.gcl_acquisition_events_id_seq to service_role;

create or replace function public.gcl_record_acquisition_event(
  p_event_name text,
  p_session_id uuid,
  p_preview_token uuid default null,
  p_lead_id uuid default null,
  p_utm_source text default null,
  p_utm_medium text default null,
  p_utm_campaign text default null,
  p_utm_content text default null,
  p_utm_term text default null,
  p_referrer text default null,
  p_landing_path text default null,
  p_gclid text default null,
  p_fbclid text default null,
  p_msclkid text default null,
  p_ttclid text default null,
  p_analytics_consent boolean default false,
  p_ads_consent boolean default false,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, sac
as $$
declare
  v_event text := lower(btrim(coalesce(p_event_name,'')));
  v_id bigint;
  v_metadata jsonb := coalesce(p_metadata,'{}'::jsonb);
begin
  if v_event not in ('landing_view','diagnostic_started','lead_saved','consent_updated') then
    raise exception 'invalid_acquisition_event' using errcode='22023';
  end if;
  if p_session_id is null then
    raise exception 'invalid_session_id' using errcode='22023';
  end if;
  if v_event in ('landing_view','diagnostic_started') and not coalesce(p_analytics_consent,false) then
    raise exception 'analytics_consent_required' using errcode='P0001';
  end if;
  if v_event = 'lead_saved' and p_lead_id is null then
    raise exception 'lead_id_required' using errcode='22023';
  end if;
  if jsonb_typeof(v_metadata) <> 'object' or octet_length(v_metadata::text) > 4096 then
    raise exception 'invalid_event_metadata' using errcode='22023';
  end if;

  insert into sac.gcl_acquisition_events(
    event_name,session_id,preview_token,lead_id,
    utm_source,utm_medium,utm_campaign,utm_content,utm_term,referrer,landing_path,
    gclid,fbclid,msclkid,ttclid,analytics_consent,ads_consent,metadata
  ) values (
    v_event,p_session_id,p_preview_token,p_lead_id,
    left(nullif(btrim(p_utm_source),''),255),left(nullif(btrim(p_utm_medium),''),255),
    left(nullif(btrim(p_utm_campaign),''),255),left(nullif(btrim(p_utm_content),''),255),
    left(nullif(btrim(p_utm_term),''),255),left(nullif(btrim(p_referrer),''),2048),
    left(nullif(btrim(p_landing_path),''),1024),
    case when p_ads_consent then left(nullif(btrim(p_gclid),''),255) else null end,
    case when p_ads_consent then left(nullif(btrim(p_fbclid),''),255) else null end,
    case when p_ads_consent then left(nullif(btrim(p_msclkid),''),255) else null end,
    case when p_ads_consent then left(nullif(btrim(p_ttclid),''),255) else null end,
    coalesce(p_analytics_consent,false),coalesce(p_ads_consent,false),v_metadata
  ) returning id into v_id;

  return jsonb_build_object('recorded',true,'event_id',v_id,'event_name',v_event);
end;
$$;

revoke all on function public.gcl_record_acquisition_event(text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,jsonb)
  from public, anon, authenticated;
grant execute on function public.gcl_record_acquisition_event(text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,jsonb)
  to service_role;

comment on table sac.gcl_acquisition_events is
'Private GCL first-party acquisition ledger. Browser analytics events require analytics consent; ad click identifiers require ads consent.';
comment on function public.gcl_record_acquisition_event(text,uuid,uuid,uuid,text,text,text,text,text,text,text,text,text,text,text,boolean,boolean,jsonb) is
'Service-role-only GCL v82 acquisition event writer. Click IDs are discarded unless p_ads_consent is true.';
