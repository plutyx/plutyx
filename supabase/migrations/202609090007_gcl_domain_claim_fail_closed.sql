-- SECURITY: authenticated callers may record failed checks, but may never assert
-- domain ownership. A successful verification must come from service_role / trusted verifier.
create or replace function public.gcl_record_domain_claim_attempt(
  p_claim_token uuid,
  p_verified boolean,
  p_evidence jsonb default '{}'::jsonb,
  p_error text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path=public,sac,auth
as $$
declare
  uid uuid:=auth.uid();
  c sac.domain_claim_challenges%rowtype;
  d sac.domains%rowtype;
  caller_role text:=coalesce(auth.role(),'');
begin
  if coalesce(p_verified,false) and caller_role<>'service_role' then
    raise exception 'trusted_verifier_required' using errcode='42501';
  end if;

  if uid is null and caller_role='service_role' then
    select user_id into uid
    from sac.domain_claim_challenges
    where public_token=p_claim_token;
  end if;
  if uid is null then raise exception 'authentication_required' using errcode='42501'; end if;

  select * into c
  from sac.domain_claim_challenges
  where public_token=p_claim_token and user_id=uid
  for update;
  if not found then raise exception 'claim_not_found'; end if;
  if c.status<>'pending' then raise exception 'claim_not_pending'; end if;
  if c.expires_at<=now() then
    update sac.domain_claim_challenges set status='expired' where id=c.id;
    raise exception 'claim_expired';
  end if;

  update sac.domain_claim_challenges
  set attempts=attempts+1,
      last_checked_at=now(),
      last_evidence=coalesce(p_evidence,'{}'::jsonb),
      last_error=left(p_error,500),
      status=case when p_verified then 'verified' else status end,
      verified_at=case when p_verified then now() else verified_at end
  where id=c.id
  returning * into c;

  select * into d from sac.domains where id=c.domain_id;

  if p_verified then
    insert into sac.domain_members(domain_id,user_id,role,verified,verification_method,verified_at)
    values(d.id,uid,'owner',true,c.method,now())
    on conflict(domain_id,user_id) do update
      set role=case when sac.domain_members.role='owner' then 'owner' else excluded.role end,
          verified=true,
          verification_method=excluded.verification_method,
          verified_at=now();
    update sac.domains
    set claimed=true,claim_method=c.method,owner_user_id=coalesce(owner_user_id,uid),updated_at=now()
    where id=d.id;
  end if;

  return jsonb_build_object('verified',p_verified,'domain_id',d.id,'domain',d.normalized_domain,'method',c.method,'attempts',c.attempts,'evidence',c.last_evidence);
end;
$$;
