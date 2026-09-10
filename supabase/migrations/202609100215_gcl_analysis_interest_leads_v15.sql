create table if not exists sac.analysis_interest_leads (
  id uuid primary key default gen_random_uuid(),
  intent_id uuid not null references sac.analysis_checkout_intents(id) on delete cascade,
  email text not null,
  phone text,
  company_name text,
  role_title text,
  stage text not null default 'checkout_interest' check(stage in ('checkout_interest','checkout_blocked','checkout_opened','contacted','qualified','converted','lost')),
  source_path text not null default '/ranking-site/',
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  marketing_consent boolean not null default false,
  marketing_consent_at timestamptz,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(intent_id,email)
);
create index if not exists analysis_interest_leads_stage_created_idx on sac.analysis_interest_leads(stage,created_at desc);
create index if not exists analysis_interest_leads_email_idx on sac.analysis_interest_leads(lower(email));
create index if not exists analysis_interest_leads_intent_idx on sac.analysis_interest_leads(intent_id);
alter table sac.analysis_interest_leads enable row level security;
revoke all on sac.analysis_interest_leads from anon,authenticated;

create or replace function public.gcl_capture_analysis_interest(
  p_intent_token uuid,p_email text,p_phone text default null,p_company_name text default null,p_role_title text default null,
  p_stage text default 'checkout_interest',p_source_path text default '/ranking-site/',p_referrer text default null,
  p_utm_source text default null,p_utm_medium text default null,p_utm_campaign text default null,p_utm_content text default null,
  p_utm_term text default null,p_marketing_consent boolean default false
) returns jsonb language plpgsql security definer set search_path to 'public','sac' as $function$
declare v_intent sac.analysis_checkout_intents%rowtype;v_email text:=lower(btrim(p_email));v_id uuid;v_stage text:=coalesce(nullif(btrim(p_stage),''),'checkout_interest');
begin
  if v_email is null or length(v_email)>254 or v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then raise exception 'invalid_email' using errcode='22023'; end if;
  if v_stage not in ('checkout_interest','checkout_blocked','checkout_opened') then v_stage:='checkout_interest'; end if;
  select * into v_intent from sac.analysis_checkout_intents where public_token=p_intent_token and expires_at>now() and status in ('prepared','paid','scan_queued','completed') limit 1;
  if v_intent.id is null then raise exception 'analysis_intent_not_found'; end if;
  insert into sac.analysis_interest_leads(intent_id,email,phone,company_name,role_title,stage,source_path,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,marketing_consent,marketing_consent_at,last_seen_at,updated_at)
  values(v_intent.id,v_email,nullif(left(btrim(coalesce(p_phone,'')),80),''),nullif(left(btrim(coalesce(p_company_name,'')),180),''),nullif(left(btrim(coalesce(p_role_title,'')),140),''),v_stage,left(coalesce(nullif(p_source_path,''),'/ranking-site/'),500),nullif(left(btrim(coalesce(p_referrer,'')),1000),''),nullif(left(btrim(coalesce(p_utm_source,'')),160),''),nullif(left(btrim(coalesce(p_utm_medium,'')),160),''),nullif(left(btrim(coalesce(p_utm_campaign,'')),240),''),nullif(left(btrim(coalesce(p_utm_content,'')),240),''),nullif(left(btrim(coalesce(p_utm_term,'')),240),''),coalesce(p_marketing_consent,false),case when coalesce(p_marketing_consent,false) then now() else null end,now(),now())
  on conflict(intent_id,email) do update set phone=coalesce(excluded.phone,sac.analysis_interest_leads.phone),company_name=coalesce(excluded.company_name,sac.analysis_interest_leads.company_name),role_title=coalesce(excluded.role_title,sac.analysis_interest_leads.role_title),stage=case when sac.analysis_interest_leads.stage in ('converted','qualified') then sac.analysis_interest_leads.stage else excluded.stage end,source_path=excluded.source_path,referrer=coalesce(excluded.referrer,sac.analysis_interest_leads.referrer),utm_source=coalesce(excluded.utm_source,sac.analysis_interest_leads.utm_source),utm_medium=coalesce(excluded.utm_medium,sac.analysis_interest_leads.utm_medium),utm_campaign=coalesce(excluded.utm_campaign,sac.analysis_interest_leads.utm_campaign),utm_content=coalesce(excluded.utm_content,sac.analysis_interest_leads.utm_content),utm_term=coalesce(excluded.utm_term,sac.analysis_interest_leads.utm_term),marketing_consent=excluded.marketing_consent,marketing_consent_at=case when excluded.marketing_consent and not sac.analysis_interest_leads.marketing_consent then now() when not excluded.marketing_consent then null else sac.analysis_interest_leads.marketing_consent_at end,last_seen_at=now(),updated_at=now()
  returning id into v_id;
  return jsonb_build_object('saved',true,'lead_id',v_id,'intent_token',p_intent_token,'stage',v_stage,'domain',v_intent.normalized_domain,'product_code',v_intent.product_code,'payment_required',v_intent.status='prepared');
end;$function$;
revoke all on function public.gcl_capture_analysis_interest(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean) from public;
grant execute on function public.gcl_capture_analysis_interest(uuid,text,text,text,text,text,text,text,text,text,text,text,text,boolean) to service_role;
