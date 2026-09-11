-- GCL v81: first-party paid-acquisition attribution for diagnostic leads.
-- UTMs/referrer are first-party operational attribution. Ad click IDs require separate tracking consent.

alter table sac.leads
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists utm_content text,
  add column if not exists utm_term text,
  add column if not exists referrer text,
  add column if not exists landing_path text,
  add column if not exists gclid text,
  add column if not exists fbclid text,
  add column if not exists msclkid text,
  add column if not exists ttclid text,
  add column if not exists tracking_consent boolean not null default false,
  add column if not exists tracking_consent_at timestamptz,
  add column if not exists attribution_first_seen_at timestamptz;

create or replace function public.sac_api_save_lead_v81(
  p_preview_token uuid,
  p_email text,
  p_phone text default null,
  p_company_name text default null,
  p_segment text default null,
  p_goal text default null,
  p_ticket_band text default null,
  p_selected_modules text[] default '{}',
  p_marketing_consent boolean default false,
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
  p_tracking_consent boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, sac
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
  v_scan_exists boolean;
  v_tracking boolean := coalesce(p_tracking_consent,false);
  v_now timestamptz := now();
begin
  if v_email is null or length(v_email) > 254 or v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then
    raise exception 'invalid_email' using errcode='22023';
  end if;

  select exists(
    select 1 from sac.fullscan_jobs
    where public_token=p_preview_token and mode='rendered_preview' and status='completed'
  ) into v_scan_exists;

  if not v_scan_exists then
    raise exception 'preview_not_completed' using errcode='P0001';
  end if;

  insert into sac.leads(
    preview_token,email,phone,company_name,segment,goal,ticket_band,selected_modules,
    marketing_consent,marketing_consent_at,
    utm_source,utm_medium,utm_campaign,utm_content,utm_term,referrer,landing_path,
    gclid,fbclid,msclkid,ttclid,tracking_consent,tracking_consent_at,attribution_first_seen_at,
    updated_at
  ) values (
    p_preview_token,v_email,left(nullif(btrim(p_phone),''),40),left(nullif(btrim(p_company_name),''),160),
    left(nullif(btrim(p_segment),''),120),left(nullif(btrim(p_goal),''),160),left(nullif(btrim(p_ticket_band),''),80),
    coalesce(p_selected_modules,'{}'),coalesce(p_marketing_consent,false),
    case when coalesce(p_marketing_consent,false) then v_now else null end,
    left(nullif(btrim(p_utm_source),''),255),left(nullif(btrim(p_utm_medium),''),255),
    left(nullif(btrim(p_utm_campaign),''),255),left(nullif(btrim(p_utm_content),''),255),
    left(nullif(btrim(p_utm_term),''),255),left(nullif(btrim(p_referrer),''),2048),
    left(nullif(btrim(p_landing_path),''),1024),
    case when v_tracking then left(nullif(btrim(p_gclid),''),255) else null end,
    case when v_tracking then left(nullif(btrim(p_fbclid),''),255) else null end,
    case when v_tracking then left(nullif(btrim(p_msclkid),''),255) else null end,
    case when v_tracking then left(nullif(btrim(p_ttclid),''),255) else null end,
    v_tracking,case when v_tracking then v_now else null end,v_now,v_now
  )
  on conflict(preview_token) do update set
    email=excluded.email,
    phone=excluded.phone,
    company_name=excluded.company_name,
    segment=excluded.segment,
    goal=excluded.goal,
    ticket_band=excluded.ticket_band,
    selected_modules=excluded.selected_modules,
    marketing_consent=excluded.marketing_consent,
    marketing_consent_at=case
      when excluded.marketing_consent and not sac.leads.marketing_consent then v_now
      when not excluded.marketing_consent then null
      else sac.leads.marketing_consent_at end,
    utm_source=coalesce(sac.leads.utm_source,excluded.utm_source),
    utm_medium=coalesce(sac.leads.utm_medium,excluded.utm_medium),
    utm_campaign=coalesce(sac.leads.utm_campaign,excluded.utm_campaign),
    utm_content=coalesce(sac.leads.utm_content,excluded.utm_content),
    utm_term=coalesce(sac.leads.utm_term,excluded.utm_term),
    referrer=coalesce(sac.leads.referrer,excluded.referrer),
    landing_path=coalesce(sac.leads.landing_path,excluded.landing_path),
    gclid=case when excluded.tracking_consent then coalesce(sac.leads.gclid,excluded.gclid) else null end,
    fbclid=case when excluded.tracking_consent then coalesce(sac.leads.fbclid,excluded.fbclid) else null end,
    msclkid=case when excluded.tracking_consent then coalesce(sac.leads.msclkid,excluded.msclkid) else null end,
    ttclid=case when excluded.tracking_consent then coalesce(sac.leads.ttclid,excluded.ttclid) else null end,
    tracking_consent=excluded.tracking_consent,
    tracking_consent_at=case
      when excluded.tracking_consent and not sac.leads.tracking_consent then v_now
      when not excluded.tracking_consent then null
      else sac.leads.tracking_consent_at end,
    attribution_first_seen_at=coalesce(sac.leads.attribution_first_seen_at,excluded.attribution_first_seen_at),
    updated_at=v_now
  returning id into v_id;

  return jsonb_build_object(
    'saved',true,
    'lead_id',v_id,
    'attribution_saved',true,
    'tracking_ids_saved',v_tracking
  );
end;
$$;

revoke execute on function public.sac_api_save_lead_v81(uuid,text,text,text,text,text,text,text[],boolean,text,text,text,text,text,text,text,text,text,text,text,boolean)
from public, anon, authenticated;
grant execute on function public.sac_api_save_lead_v81(uuid,text,text,text,text,text,text,text[],boolean,text,text,text,text,text,text,text,text,text,text,text,boolean)
to service_role;

comment on function public.sac_api_save_lead_v81(uuid,text,text,text,text,text,text,text[],boolean,text,text,text,text,text,text,text,text,text,text,text,boolean) is
'GCL v81 diagnostic lead writer with first-touch acquisition attribution. Ad click IDs are persisted only when separate tracking consent is true.';
