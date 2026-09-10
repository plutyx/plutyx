create table if not exists sac.market_service_requests(
 id uuid primary key default gen_random_uuid(),
 public_token uuid not null unique default gen_random_uuid(),
 listing_id uuid not null references sac.market_listings(id) on delete restrict,
 owner_user_id uuid references auth.users(id) on delete set null,
 scan_public_token uuid,
 email text not null,
 phone text,
 company_name text,
 role_title text,
 website_url text,
 normalized_domain text,
 message text,
 status text not null default 'new' check(status in('new','qualified','contacted','proposal','won','lost','spam','cancelled')),
 source_path text not null default '/ranking-site/services/',referrer text,utm_source text,utm_medium text,utm_campaign text,utm_content text,utm_term text,
 match_snapshot jsonb not null default '{}'::jsonb,
 marketing_consent boolean not null default false,marketing_consent_at timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index if not exists market_service_requests_status_created_idx on sac.market_service_requests(status,created_at desc);
create index if not exists market_service_requests_email_created_idx on sac.market_service_requests(lower(email),created_at desc);
create index if not exists market_service_requests_domain_created_idx on sac.market_service_requests(normalized_domain,created_at desc) where normalized_domain is not null;
alter table sac.market_service_requests enable row level security;
revoke all on sac.market_service_requests from anon,authenticated;

create or replace function public.gcl_market_request(p_listing_slug text,p_email text,p_phone text default null,p_company_name text default null,p_role_title text default null,p_website_url text default null,p_scan_token uuid default null,p_message text default null,p_source_path text default '/ranking-site/services/',p_referrer text default null,p_utm_source text default null,p_utm_medium text default null,p_utm_campaign text default null,p_utm_content text default null,p_utm_term text default null,p_marketing_consent boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public','sac' as $function$
declare l sac.market_listings%rowtype;v_email text:=lower(btrim(p_email));v_url text:=nullif(btrim(p_website_url),'');v_domain text;v_run uuid;v_match jsonb:='{}'::jsonb;v_existing sac.market_service_requests%rowtype;v_req sac.market_service_requests%rowtype;
begin
 if v_email is null or length(v_email)>254 or v_email !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then raise exception 'invalid_email' using errcode='22023';end if;
 select * into l from sac.market_listings where slug=btrim(p_listing_slug) and curation_status='published' limit 1;
 if l.id is null then raise exception 'listing_not_found' using errcode='22023';end if;
 if p_scan_token is not null then
   select f.audit_run_id,d.normalized_domain,d.url into v_run,v_domain,v_url from sac.fullscan_jobs f left join sac.audit_runs ar on ar.id=f.audit_run_id left join sac.domains d on d.id=ar.domain_id where f.public_token=p_scan_token order by f.created_at desc limit 1;
   if v_run is not null then select value into v_match from jsonb_array_elements(sac.recommend_market_listings(v_run,24)) value where value->>'slug'=l.slug limit 1;end if;
 end if;
 if v_domain is null and v_url is not null then v_domain:=lower(split_part(regexp_replace(v_url,'^https?://','','i'),'/',1));v_domain:=regexp_replace(v_domain,'^www\.','','i');end if;
 perform pg_advisory_xact_lock(hashtextextended('gcl:market-request:'||v_email||':'||l.id::text||':'||coalesce(v_domain,''),0));
 select * into v_existing from sac.market_service_requests where listing_id=l.id and lower(email)=v_email and coalesce(normalized_domain,'')=coalesce(v_domain,'') and status in('new','qualified','contacted','proposal') and created_at>now()-interval '48 hours' order by created_at desc limit 1 for update;
 if v_existing.id is not null then
   update sac.market_service_requests set phone=coalesce(nullif(btrim(p_phone),''),phone),company_name=coalesce(nullif(btrim(p_company_name),''),company_name),role_title=coalesce(nullif(btrim(p_role_title),''),role_title),website_url=coalesce(v_url,website_url),scan_public_token=coalesce(p_scan_token,scan_public_token),message=coalesce(nullif(left(btrim(p_message),4000),''),message),source_path=left(coalesce(nullif(btrim(p_source_path),''),source_path),500),referrer=coalesce(nullif(left(btrim(p_referrer),1000),''),referrer),utm_source=coalesce(nullif(left(btrim(p_utm_source),160),''),utm_source),utm_medium=coalesce(nullif(left(btrim(p_utm_medium),160),''),utm_medium),utm_campaign=coalesce(nullif(left(btrim(p_utm_campaign),240),''),utm_campaign),utm_content=coalesce(nullif(left(btrim(p_utm_content),240),''),utm_content),utm_term=coalesce(nullif(left(btrim(p_utm_term),240),''),utm_term),match_snapshot=case when v_match is not null and v_match<>'{}'::jsonb then v_match else match_snapshot end,marketing_consent=marketing_consent or coalesce(p_marketing_consent,false),marketing_consent_at=case when marketing_consent_at is null and coalesce(p_marketing_consent,false) then now() else marketing_consent_at end,updated_at=now() where id=v_existing.id returning * into v_req;
 else
   insert into sac.market_service_requests(listing_id,scan_public_token,email,phone,company_name,role_title,website_url,normalized_domain,message,source_path,referrer,utm_source,utm_medium,utm_campaign,utm_content,utm_term,match_snapshot,marketing_consent,marketing_consent_at)
   values(l.id,p_scan_token,v_email,nullif(btrim(p_phone),''),nullif(btrim(p_company_name),''),nullif(btrim(p_role_title),''),v_url,v_domain,nullif(left(btrim(p_message),4000),''),left(coalesce(nullif(btrim(p_source_path),''),'/ranking-site/services/'),500),nullif(left(btrim(p_referrer),1000),''),nullif(left(btrim(p_utm_source),160),''),nullif(left(btrim(p_utm_medium),160),''),nullif(left(btrim(p_utm_campaign),240),''),nullif(left(btrim(p_utm_content),240),''),nullif(left(btrim(p_utm_term),240),''),coalesce(v_match,'{}'::jsonb),coalesce(p_marketing_consent,false),case when coalesce(p_marketing_consent,false) then now() end) returning * into v_req;
 end if;
 return jsonb_build_object('saved',true,'request_token',v_req.public_token,'status',v_req.status,'listing',jsonb_build_object('slug',l.slug,'title',l.title,'category',l.category_code),'domain',v_req.normalized_domain,'matched_gaps',nullif(v_req.match_snapshot->>'matched_gaps','')::int,'simulated_max_points',nullif(v_req.match_snapshot->>'simulated_max_points','')::numeric,'score_disclosure',l.verification_note,'duplicate_window_reused',v_existing.id is not null);
end;$function$;
