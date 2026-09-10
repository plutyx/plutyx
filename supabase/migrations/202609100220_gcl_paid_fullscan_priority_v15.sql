create or replace function public.sac_api_request_paid_analysis(p_intent_token uuid)
returns jsonb language plpgsql security definer set search_path to 'public','sac' as $function$
declare v sac.analysis_checkout_intents%rowtype;v_job uuid;v_token uuid;v_queue jsonb;
begin
 select * into v from sac.analysis_checkout_intents where public_token=p_intent_token limit 1 for update;
 if v.id is null then raise exception 'analysis_intent_not_found' using errcode='22023';end if;
 if v.expires_at<=now() then update sac.analysis_checkout_intents set status='expired',updated_at=now() where id=v.id;raise exception 'analysis_intent_expired';end if;
 if v.status not in('paid','scan_queued','completed') then raise exception 'payment_required';end if;
 if v.scan_public_token is not null then return jsonb_build_object('token',v.scan_public_token,'status',v.status,'mode','full_paid','reused',true,'queue_admission','deduplicated_paid_intent');end if;
 insert into sac.fullscan_jobs(owner_user_id,url,mode,status) values(v.owner_user_id,v.url,'full_paid','queued') returning id,public_token into v_job,v_token;
 update sac.analysis_checkout_intents set scan_public_token=v_token,status='scan_queued',updated_at=now() where id=v.id;
 v_queue:=public.gcl_scan_queue_health();
 return jsonb_build_object('token',v_token,'job_id',v_job,'status','queued','mode','full_paid','max_pages',10,'paid',true,'reused',false,'queue_admission','accepted_paid','estimated_wait_seconds',v_queue->'estimated_paid_wait_seconds','queue',jsonb_build_object('queued_paid',v_queue->'queued_paid','processing_paid',v_queue->'processing_paid','available_slots',v_queue->'available_slots','admission_state',v_queue->'admission_state'));
end;$function$;
