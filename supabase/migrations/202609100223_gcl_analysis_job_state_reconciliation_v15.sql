alter table sac.fullscan_jobs add column if not exists analysis_intent_id uuid references sac.analysis_checkout_intents(id) on delete set null;
create index if not exists fullscan_jobs_analysis_intent_idx on sac.fullscan_jobs(analysis_intent_id,created_at desc) where analysis_intent_id is not null;
update sac.fullscan_jobs j set analysis_intent_id=i.id from sac.analysis_checkout_intents i where i.scan_public_token=j.public_token and j.analysis_intent_id is null;
alter table sac.analysis_checkout_intents drop constraint if exists analysis_checkout_intents_status_check;
alter table sac.analysis_checkout_intents add constraint analysis_checkout_intents_status_check check(status=any(array['prepared','paid','scan_queued','completed','scan_failed','expired','cancelled']::text[]));
create or replace function sac.sync_analysis_intent_from_fullscan_trg() returns trigger language plpgsql security definer set search_path to 'sac','public' as $function$
begin
 if new.analysis_intent_id is null then return new;end if;
 if new.status='completed' then update sac.analysis_checkout_intents set status='completed',scan_public_token=new.public_token,updated_at=now() where id=new.analysis_intent_id and status not in('expired','cancelled');
 elsif new.status in('failed','cancelled') then update sac.analysis_checkout_intents set status='scan_failed',scan_public_token=new.public_token,updated_at=now() where id=new.analysis_intent_id and status not in('completed','expired','cancelled');
 elsif new.status in('queued','processing') then update sac.analysis_checkout_intents set status='scan_queued',scan_public_token=new.public_token,updated_at=now() where id=new.analysis_intent_id and status in('paid','scan_queued','scan_failed');end if;
 return new;
end;$function$;
drop trigger if exists trg_sync_analysis_intent_from_fullscan on sac.fullscan_jobs;
create trigger trg_sync_analysis_intent_from_fullscan after insert or update of status on sac.fullscan_jobs for each row execute function sac.sync_analysis_intent_from_fullscan_trg();
update sac.analysis_checkout_intents i set status=case when j.status='completed' then 'completed' when j.status in('failed','cancelled') then 'scan_failed' else i.status end,updated_at=now() from sac.fullscan_jobs j where j.analysis_intent_id=i.id and i.status='scan_queued' and j.status in('completed','failed','cancelled');
create or replace function public.sac_api_request_paid_analysis(p_intent_token uuid) returns jsonb language plpgsql security definer set search_path to 'public','sac' as $function$
declare v sac.analysis_checkout_intents%rowtype;v_job uuid;v_token uuid;v_queue jsonb;v_old_job sac.fullscan_jobs%rowtype;v_job_count int:=0;
begin
 select * into v from sac.analysis_checkout_intents where public_token=p_intent_token limit 1 for update;
 if v.id is null then raise exception 'analysis_intent_not_found' using errcode='22023';end if;
 if v.expires_at<=now() and v.status='prepared' then update sac.analysis_checkout_intents set status='expired',updated_at=now() where id=v.id;raise exception 'analysis_intent_expired';end if;
 if v.status not in('paid','scan_queued','completed','scan_failed') then raise exception 'payment_required';end if;
 if v.scan_public_token is not null then select * into v_old_job from sac.fullscan_jobs where public_token=v.scan_public_token limit 1;if v_old_job.id is not null and v_old_job.status in('queued','processing','completed') then return jsonb_build_object('token',v.scan_public_token,'status',case when v_old_job.status='completed' then 'completed' else 'scan_queued' end,'mode',v_old_job.mode,'reused',true,'queue_admission','deduplicated_paid_intent');end if;end if;
 select count(*)::int into v_job_count from sac.fullscan_jobs where analysis_intent_id=v.id;if v_job_count>=3 then raise exception 'analysis_retry_limit';end if;
 insert into sac.fullscan_jobs(owner_user_id,url,mode,status,analysis_intent_id) values(v.owner_user_id,v.url,'full_paid','queued',v.id) returning id,public_token into v_job,v_token;
 update sac.analysis_checkout_intents set scan_public_token=v_token,status='scan_queued',updated_at=now() where id=v.id;
 v_queue:=public.gcl_scan_queue_health();return jsonb_build_object('token',v_token,'job_id',v_job,'status','queued','mode','full_paid','max_pages',10,'paid',true,'reused',false,'queue_admission','accepted_paid','estimated_wait_seconds',v_queue->'estimated_paid_wait_seconds','queue',jsonb_build_object('queued_paid',v_queue->'queued_paid','processing_paid',v_queue->'processing_paid','available_slots',v_queue->'available_slots','admission_state',v_queue->'admission_state'));
end;$function$;
