-- GCL v13: absorb lead spikes without multiplying identical full scans.
-- Heavy worker concurrency remains bounded by dispatch_fullscan_jobs; this only widens queue admission.

create unique index if not exists fullscan_jobs_public_active_url_uidx
on sac.fullscan_jobs(url,mode)
where owner_user_id is null and mode='lighthouse_full' and status in ('queued','processing');

create or replace function public.sac_api_request_preview(p_url text, p_bucket_key text)
returns jsonb
language plpgsql
security definer
set search_path=public,sac
as $$
declare
  v_url text:=btrim(p_url);
  v_bucket text:=left(coalesce(nullif(btrim(p_bucket_key),''),'anonymous'),128);
  v_count integer;
  v_active integer;
  v_existing record;
  v_job uuid;
  v_token uuid;
begin
  if v_url is null or length(v_url)<8 or length(v_url)>2048 or v_url !~* '^https?://' then
    raise exception 'invalid_url' using errcode='22023';
  end if;

  -- Only identical URLs serialize. Different prospects still enqueue in parallel.
  perform pg_advisory_xact_lock(hashtextextended('gcl-public-preview:'||v_url,0));

  select request_count into v_count
  from sac.preview_usage
  where bucket_key=v_bucket and usage_date=current_date
  for update;
  if coalesce(v_count,0)>=5 then
    raise exception 'daily_preview_limit' using errcode='P0001';
  end if;

  select id,public_token,status,mode into v_existing
  from sac.fullscan_jobs
  where url=v_url
    and created_at>now()-interval '12 hours'
    and mode='lighthouse_full'
    and status in ('queued','processing','completed')
  order by created_at desc
  limit 1;
  if v_existing.id is not null then
    return jsonb_build_object(
      'token',v_existing.public_token,
      'status',v_existing.status,
      'mode',v_existing.mode,
      'reused',true,
      'queue_admission','deduplicated'
    );
  end if;

  select count(*) into v_active
  from sac.fullscan_jobs
  where status in ('queued','processing');
  if v_active>=100 then
    raise exception 'scanner_busy' using errcode='P0001';
  end if;

  insert into sac.preview_usage(bucket_key,usage_date,request_count,last_request_at)
  values(v_bucket,current_date,1,now())
  on conflict(bucket_key,usage_date)
  do update set request_count=sac.preview_usage.request_count+1,last_request_at=now();

  insert into sac.fullscan_jobs(owner_user_id,url,mode,status)
  values(null,v_url,'lighthouse_full','queued')
  returning id,public_token into v_job,v_token;

  return jsonb_build_object(
    'token',v_token,
    'status','queued',
    'mode','lighthouse_full',
    'max_pages',10,
    'reused',false,
    'queue_admission','accepted'
  );
exception
  when unique_violation then
    -- Defense in depth if two calls bypass the advisory-lock path for any reason.
    select id,public_token,status,mode into v_existing
    from sac.fullscan_jobs
    where url=v_url and mode='lighthouse_full' and owner_user_id is null
      and status in ('queued','processing')
    order by created_at desc limit 1;
    if v_existing.id is not null then
      return jsonb_build_object(
        'token',v_existing.public_token,
        'status',v_existing.status,
        'mode',v_existing.mode,
        'reused',true,
        'queue_admission','deduplicated_race'
      );
    end if;
    raise;
end;
$$;
