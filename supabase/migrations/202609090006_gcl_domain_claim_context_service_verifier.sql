-- The browser resolves only its own claim. The trusted Edge verifier may resolve a
-- claim by token under service_role after the member gateway has already authorized it.
create or replace function public.gcl_domain_claim_context(p_claim_token uuid)
returns jsonb
language plpgsql
security definer
set search_path=public,sac,auth
as $$
declare
  uid uuid:=auth.uid();
  caller_role text:=coalesce(auth.role(),'');
  c sac.domain_claim_challenges%rowtype;
  d sac.domains%rowtype;
begin
  if uid is null and caller_role<>'service_role' then
    raise exception 'authentication_required' using errcode='42501';
  end if;

  if caller_role='service_role' then
    select * into c from sac.domain_claim_challenges where public_token=p_claim_token;
  else
    select * into c from sac.domain_claim_challenges where public_token=p_claim_token and user_id=uid;
  end if;

  if not found then raise exception 'claim_not_found'; end if;
  if c.status<>'pending' then raise exception 'claim_not_pending'; end if;
  if c.expires_at<=now() then
    update sac.domain_claim_challenges set status='expired' where id=c.id;
    raise exception 'claim_expired';
  end if;

  select * into d from sac.domains where id=c.domain_id;
  return jsonb_build_object(
    'claim_token',c.public_token,
    'domain_id',d.id,
    'domain',d.normalized_domain,
    'method',c.method,
    'verification_token',c.verification_token,
    'expires_at',c.expires_at,
    'attempts',c.attempts
  );
end;
$$;
