-- GCL Community v13: reward value/results rather than posting volume.

create or replace function sac.community_value_points(
  p_user uuid,
  p_since timestamptz default '-infinity'::timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path=sac,public
as $$
declare
  v_ledger bigint:=0;
  v_reactions bigint:=0;
  v_cases bigint:=0;
  v_total bigint:=0;
begin
  if p_user is null then return jsonb_build_object('total',0); end if;

  select coalesce(sum(points),0)::bigint into v_ledger
  from sac.community_point_ledger
  where user_id=p_user and created_at>=p_since;

  select coalesce(sum(weight),0)::bigint into v_reactions
  from (
    select case r.reaction when 'insight' then 8 when 'useful' then 5 when 'win' then 3 else 2 end as weight
    from sac.community_post_reactions r
    join sac.community_posts p on p.id=r.post_id and p.status='published'
    where p.author_user_id=p_user and r.user_id<>p_user and r.created_at>=p_since
    union all
    select case r.reaction when 'insight' then 8 when 'useful' then 5 when 'win' then 3 else 2 end as weight
    from sac.community_comment_reactions r
    join sac.community_comments c on c.id=r.comment_id and c.status='published'
    where c.author_user_id=p_user and r.user_id<>p_user and r.created_at>=p_since
  ) x;

  select coalesce(sum(
    100 + least(250,greatest(0,round(coalesce(score_delta,0)*25)))
  ),0)::bigint into v_cases
  from sac.community_case_studies
  where user_id=p_user
    and verification_status='score_verified'
    and updated_at>=p_since;

  v_total:=v_ledger+v_reactions+v_cases;
  return jsonb_build_object(
    'total',v_total,
    'mission_points',v_ledger,
    'peer_value_points',v_reactions,
    'verified_result_points',v_cases,
    'rules',jsonb_build_object(
      'insight_received',8,
      'useful_received',5,
      'win_received',3,
      'support_received',2,
      'verified_case_base',100,
      'score_delta_point_value',25,
      'score_delta_case_cap',250
    )
  );
end;
$$;

revoke all on function sac.community_value_points(uuid,timestamptz) from public,anon,authenticated;

create or replace function sac.recalculate_member_points(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path=sac,public
as $$
declare
  v_breakdown jsonb;
  v_points bigint:=0;
  v_level int:=1;
  v_name text;
begin
  v_breakdown:=sac.community_value_points(p_user,'-infinity'::timestamptz);
  v_points:=coalesce((v_breakdown->>'total')::bigint,0);
  select level,name into v_level,v_name
  from sac.community_levels
  where min_points<=v_points
  order by min_points desc
  limit 1;

  insert into sac.user_profiles(user_id,community_points,community_level,updated_at)
  values(p_user,v_points,coalesce(v_level,1),now())
  on conflict(user_id) do update
    set community_points=excluded.community_points,
        community_level=excluded.community_level,
        updated_at=now();

  return v_breakdown||jsonb_build_object('points',v_points,'level',coalesce(v_level,1),'level_name',v_name);
end;
$$;

create or replace function sac.community_leaderboard(p_period text default 'week',p_limit integer default 25)
returns jsonb
language sql
stable
security definer
set search_path=sac,public
as $$
with bounds as (
  select case p_period
    when 'day' then now()-interval '1 day'
    when 'month' then now()-interval '30 days'
    when 'all' then '-infinity'::timestamptz
    else now()-interval '7 days'
  end since
),
ledger as (
  select l.user_id,sum(l.points)::bigint points
  from sac.community_point_ledger l,bounds b
  where l.created_at>=b.since
  group by l.user_id
),
peer as (
  select author_user_id user_id,sum(weight)::bigint points
  from (
    select p.author_user_id,
      case r.reaction when 'insight' then 8 when 'useful' then 5 when 'win' then 3 else 2 end weight
    from sac.community_post_reactions r
    join sac.community_posts p on p.id=r.post_id and p.status='published'
    cross join bounds b
    where r.user_id<>p.author_user_id and r.created_at>=b.since
    union all
    select c.author_user_id,
      case r.reaction when 'insight' then 8 when 'useful' then 5 when 'win' then 3 else 2 end weight
    from sac.community_comment_reactions r
    join sac.community_comments c on c.id=r.comment_id and c.status='published'
    cross join bounds b
    where r.user_id<>c.author_user_id and r.created_at>=b.since
  ) q
  group by author_user_id
),
results as (
  select c.user_id,
    sum(100+least(250,greatest(0,round(coalesce(c.score_delta,0)*25))))::bigint points
  from sac.community_case_studies c,bounds b
  where c.verification_status='score_verified' and c.updated_at>=b.since
  group by c.user_id
),
all_points as (
  select user_id,sum(points)::bigint points
  from (
    select * from ledger union all select * from peer union all select * from results
  ) x
  group by user_id
),
ranked as (
  select row_number() over(order by p.points desc,up.contribution_score desc,up.created_at asc)::int rank,
    p.points,up.user_id,up.profile_slug,up.display_name,up.avatar_url,up.headline,up.member_type,up.community_level,
    up.contribution_score
  from all_points p
  join sac.user_profiles up on up.user_id=p.user_id
  where p.points>0
  order by p.points desc,up.contribution_score desc
  limit greatest(1,least(coalesce(p_limit,25),100))
)
select coalesce(jsonb_agg(to_jsonb(r) order by rank),'[]'::jsonb) from ranked r;
$$;

revoke all on function sac.community_leaderboard(text,integer) from public,anon,authenticated;

create or replace function sac.community_progression(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path=sac,public
as $$
declare
  v_points jsonb;
  v_total bigint:=0;
  v_current record;
  v_next record;
  v_pct numeric:=100;
begin
  v_points:=sac.recalculate_member_points(p_user);
  v_total:=coalesce((v_points->>'total')::bigint,0);

  select * into v_current from sac.community_levels
  where min_points<=v_total order by min_points desc limit 1;
  select * into v_next from sac.community_levels
  where min_points>v_total order by min_points asc limit 1;

  if v_next.level is not null and v_next.min_points>v_current.min_points then
    v_pct:=round(100.0*(v_total-v_current.min_points)/(v_next.min_points-v_current.min_points),1);
  end if;

  return jsonb_build_object(
    'points',v_points,
    'current_level',jsonb_build_object('level',coalesce(v_current.level,1),'name',coalesce(v_current.name,'Observer'),'min_points',coalesce(v_current.min_points,0),'benefits',coalesce(v_current.benefits,'{}'::jsonb)),
    'next_level',case when v_next.level is null then null else jsonb_build_object('level',v_next.level,'name',v_next.name,'min_points',v_next.min_points,'benefits',v_next.benefits) end,
    'progress_percent',greatest(0,least(100,v_pct)),
    'points_to_next',case when v_next.level is null then 0 else greatest(0,v_next.min_points-v_total) end
  );
end;
$$;

revoke all on function sac.community_progression(uuid) from public,anon,authenticated;

-- Extend progression while keeping existing levels stable for current members.
insert into sac.community_levels(level,name,min_points,benefits) values
  (6,'Conversion Strategist',5000,'{"badge":"conversion_strategist","access":["strategy_rooms","advanced_swipes"]}'::jsonb),
  (7,'Conversion Elite+',12000,'{"badge":"conversion_elite_plus","access":["elite_roundtables","private_hot_seats","founder_sessions"]}'::jsonb)
on conflict(level) do update set name=excluded.name,min_points=excluded.min_points,benefits=excluded.benefits;

-- Private Action Lab / Swipe Vault content. Original GCL material; no competitor content is copied.
insert into sac.resource_library(slug,resource_type,title,summary,body,platforms,tags,minimum_level,required_plan,evidence_notes,status,published_at,updated_at)
values
('hero-message-15-min','micro_lesson','Headline de alta clareza em 15 minutos','Um sprint curto para transformar uma hero section genérica em promessa específica, verificável e orientada à próxima ação.',
'1. Escreva em uma frase quem é o público.\n2. Nomeie o problema que ele já reconhece.\n3. Troque adjetivos vagos por resultado observável.\n4. Explique o mecanismo em uma linha.\n5. Faça o CTA dizer o que acontece depois do clique.\n6. Rode novamente a GCL Conversion Audit e compare os critérios afetados.\n\nRegra: clareza primeiro; persuasão sem evidência não recebe bônus metodológico.',ARRAY['Web'],ARRAY['headline','copy','hero','cro'],1,'community','Micro-learning prático. Não promete aumento de conversão sem teste/telemetria.','published',now(),now()),
('cro-preflight-checklist','checklist','Checklist pré-flight de página','Checklist operacional antes de enviar tráfego para uma landing page.',
'- Uma ação principal acima da dobra\n- CTA compreensível fora de contexto\n- Prova próxima da promessa\n- Sem overflow horizontal no mobile\n- Formulário pede apenas dados necessários\n- Mensuração do CTA principal funcionando\n- Política/privacidade e confiança visíveis quando aplicável\n- Performance validada em dispositivo móvel\n- Página de confirmação/next step definido\n- Nova auditoria registrada como baseline',ARRAY['Web'],ARRAY['checklist','landing-page','tracking'],1,'community','Checklist de execução; resultados comerciais dependem de tráfego, oferta e público.','published',now(),now()),
('swipe-offer-stack-anatomy','swipe','Anatomia de um Offer Stack','Referência estrutural para estudar ofertas sem copiar identidade, texto ou criativo de terceiros.',
'Analise o stack em seis blocos: problema, promessa, mecanismo, prova, redução de risco e próxima ação. Para cada bloco, registre o que é evidência e o que é apenas claim. Depois compare a ordem dos blocos com a intenção do visitante e o estágio do funil.',ARRAY['Web'],ARRAY['offer','swipe','copy','research'],2,'community','Framework original GCL para dissecação estrutural; não contém cópia de páginas de terceiros.','published',now(),now()),
('mobile-friction-scan','checklist','Mobile Friction Scan','Varredura manual curta para complementar sinais automatizados do browser.',
'Teste com uma mão: primeiro CTA, menu, formulário, teclado, mensagens de erro, sticky elements, modais, checkout e retorno após erro. Registre cada ponto em que o usuário precisa ampliar a tela, voltar, esperar sem feedback ou interpretar linguagem interna da empresa.',ARRAY['Web'],ARRAY['mobile','ux','friction'],2,'community','Complementa automação; observação humana deve permanecer identificada separadamente.','published',now(),now()),
('b2b-landing-blueprint','playbook','Blueprint de Landing Page B2B','Sequência modular para páginas de captação B2B orientadas a decisão.',
'Hero com ICP + resultado + mecanismo; prova verificável; problema/custo da inércia; como funciona; casos/evidências; integrações/compatibilidade; objeções; risco e segurança; CTA contextual; FAQ; next step. Use a sequência como hipótese, não como fórmula universal, e teste contra comportamento real.',ARRAY['Web','HubSpot','Webflow','WordPress'],ARRAY['b2b','landing-page','lead-gen'],3,'community','Blueprint de hipótese. A ordem ideal depende do estágio de consciência e da fonte de tráfego.','published',now(),now()),
('experiment-hypothesis-canvas','template','Canvas de hipótese CRO','Template para impedir testes A/B sem hipótese causal.',
'Observação: __\nProblema: __\nSegmento afetado: __\nHipótese causal: Se mudarmos __ porque __, esperamos __.\nMétrica primária: __\nGuardrails: __\nJanela mínima: __\nCritério de decisão: __\nAprendizado mesmo se perder: __',ARRAY['Web'],ARRAY['experiment','ab-test','template'],3,'community','Evita declarar vencedor apenas por variação percentual sem amostra e incerteza adequadas.','published',now(),now()),
('checkout-friction-playbook','playbook','Checkout Friction Playbook','Plano de diagnóstico para reduzir abandono sem esconder custo ou manipular o usuário.',
'Mapeie campos, erros, meios de pagamento, carregamento, custos inesperados, criação de conta, cupom, endereço, confirmação e recuperação. Priorize falhas técnicas e clareza antes de urgência/copy. Meça abandono por etapa e compare antes/depois.',ARRAY['Shopify','WooCommerce','Custom Commerce'],ARRAY['checkout','commerce','friction'],4,'community','Boas práticas de UX; qualquer ganho deve ser confirmado com dados do próprio negócio.','published',now(),now()),
('conversion-research-brief','playbook','Conversion Research Brief','Brief avançado para unir dados técnicos, comportamento e voz do cliente antes de redesenhar uma página.',
'Consolide: objetivo comercial; segmentos; fontes de tráfego; GCL gaps; analytics first-party; gravações/RUM quando consentidas; tickets/comentários; entrevistas; objeções; experimentos anteriores; restrições técnicas; baseline financeiro. Separe fatos, estimativas e hipóteses em colunas diferentes.',ARRAY['Web','GA4','GTM','Microsoft Clarity'],ARRAY['research','cro','strategy','data'],5,'community','Estrutura de pesquisa; dados pessoais e gravações exigem governança/consentimento apropriados.','published',now(),now())
on conflict(slug) do update set
  resource_type=excluded.resource_type,title=excluded.title,summary=excluded.summary,body=excluded.body,
  platforms=excluded.platforms,tags=excluded.tags,minimum_level=excluded.minimum_level,required_plan=excluded.required_plan,
  evidence_notes=excluded.evidence_notes,status=excluded.status,published_at=coalesce(sac.resource_library.published_at,excluded.published_at),updated_at=now();

-- Never leak protected resource bodies/downloads to a locked member.
create or replace function public.gcl_resource_catalog(p_type text default null,p_limit integer default 50)
returns jsonb
language plpgsql
security definer
set search_path=public,sac
as $$
declare
  u uuid:=auth.uid();
  lvl int:=1;
begin
  if u is null or not sac.has_active_community_access(u) then
    raise exception 'community_access_required' using errcode='42501';
  end if;
  perform sac.recalculate_member_points(u);
  select community_level into lvl from sac.user_profiles where user_id=u;

  return (
    select coalesce(jsonb_agg(to_jsonb(x) order by x.published_at desc),'[]'::jsonb)
    from (
      select id,slug,resource_type,title,summary,
        case when coalesce(lvl,1)>=minimum_level then body else null end body,
        case when coalesce(lvl,1)>=minimum_level then source_url else null end source_url,
        preview_url,
        case when coalesce(lvl,1)>=minimum_level then download_url else null end download_url,
        platforms,tags,minimum_level,required_plan,evidence_notes,published_at,
        (coalesce(lvl,1)>=minimum_level) unlocked,
        greatest(0,minimum_level-coalesce(lvl,1)) levels_to_unlock
      from sac.resource_library
      where status='published' and (p_type is null or resource_type=p_type)
      order by published_at desc
      limit greatest(1,least(coalesce(p_limit,50),100))
    ) x
  );
end;
$$;

-- Dashboard: preserve legacy weekly key and add week/month/all + progression/badges/action-lab counters.
create or replace function public.gcl_member_dashboard()
returns jsonb
language plpgsql
security definer
set search_path=public,sac
as $$
declare
  u uuid:=auth.uid();
  v_profile jsonb; v_memberships jsonb; v_domains jsonb; v_missions jsonb; v_events jsonb; v_saved jsonb;
  v_unread int; v_lb jsonb; v_lbs jsonb; v_analyses jsonb; v_purchases jsonb; v_link jsonb; v_progress jsonb;
  v_progression jsonb; v_badges jsonb; v_resources jsonb;
begin
  if u is null then raise exception 'authentication_required' using errcode='42501'; end if;
  v_link:=public.gcl_link_pending_purchases();
  insert into sac.user_profiles(user_id,display_name,last_active_at)
  values(u,coalesce((select raw_user_meta_data->>'full_name' from auth.users where id=u),(select email from auth.users where id=u)),now())
  on conflict(user_id) do update set last_active_at=now();

  v_progress:=sac.sync_member_progress(u);
  v_progression:=sac.community_progression(u);
  select to_jsonb(p) into v_profile from sac.user_profiles p where user_id=u;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_memberships
  from (select id,domain_id,plan_code,status,current_period_start,current_period_end,ranking_enabled,community_enabled,created_at from sac.memberships where user_id=u order by created_at desc) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.normalized_domain),'[]'::jsonb) into v_domains
  from (select d.id,d.normalized_domain,d.company_name,d.public_profile,dm.role,dm.verified,dm.verification_method,dm.verified_at,e.score_100,e.overall_rank,e.metric_coverage,e.tier,e.calculated_at from sac.domain_members dm join sac.domains d on d.id=dm.domain_id left join sac.autonomous_ranking_entries e on e.domain_id=d.id where dm.user_id=u) x;
  v_analyses:=public.gcl_member_analyses();
  v_purchases:=public.gcl_member_purchases();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.status,x.title),'[]'::jsonb) into v_missions
  from (select m.id,m.code,m.title,m.description,m.mission_type,m.points,coalesce(mm.status,'active') status,coalesce(mm.progress,'{}'::jsonb) progress,mm.completed_at from sac.community_missions m left join sac.community_member_missions mm on mm.mission_id=m.id and mm.user_id=u where m.active) x;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.starts_at),'[]'::jsonb) into v_events
  from (select e.id,e.title,e.event_type,e.starts_at,e.ends_at,e.timezone,e.capacity,e.status,r.status rsvp_status from sac.community_events e left join sac.community_event_rsvps r on r.event_id=e.id and r.user_id=u where e.status in ('scheduled','live') and e.starts_at>=now()-interval '3 hours' and (e.visibility='public' or sac.has_active_community_access(u)) order by e.starts_at limit 8) x;
  select coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) into v_saved
  from (select d.id,d.normalized_domain,s.label,s.alerts_enabled,s.created_at from sac.member_saved_sites s join sac.domains d on d.id=s.domain_id where s.user_id=u order by s.created_at desc limit 20) x;
  select count(*)::int into v_unread from sac.member_notifications where user_id=u and read_at is null;

  if sac.has_active_community_access(u) then
    v_lb:=sac.community_leaderboard('week',10);
    v_lbs:=jsonb_build_object('week',v_lb,'month',sac.community_leaderboard('month',10),'all_time',sac.community_leaderboard('all',10));
    select coalesce(jsonb_agg(jsonb_build_object('code',b.code,'name',b.name,'description',b.description,'icon',b.icon,'badge_type',b.badge_type,'awarded_at',mb.awarded_at,'evidence',mb.evidence) order by mb.awarded_at desc),'[]'::jsonb)
      into v_badges
    from sac.community_member_badges mb join sac.community_badge_definitions b on b.code=mb.badge_code
    where mb.user_id=u;
    select jsonb_build_object(
      'published',(select count(*) from sac.resource_library where status='published'),
      'unlocked',(select count(*) from sac.resource_library where status='published' and minimum_level<=coalesce((select community_level from sac.user_profiles where user_id=u),1)),
      'next_unlock_level',(select min(minimum_level) from sac.resource_library where status='published' and minimum_level>coalesce((select community_level from sac.user_profiles where user_id=u),1))
    ) into v_resources;
  else
    v_lb:='[]'::jsonb; v_lbs=jsonb_build_object('week','[]'::jsonb,'month','[]'::jsonb,'all_time','[]'::jsonb); v_badges='[]'::jsonb; v_resources='{}'::jsonb;
  end if;

  return jsonb_build_object(
    'profile',v_profile,'memberships',v_memberships,'domains',v_domains,'analyses',v_analyses,'purchases',v_purchases,
    'purchase_reconciliation',v_link,'progress_sync',v_progress,'progression',v_progression,'missions',v_missions,
    'upcoming_events',v_events,'saved_sites',v_saved,'unread_notifications',v_unread,
    'community_leaderboard',v_lb,'community_leaderboards',v_lbs,'badges',v_badges,'action_lab',v_resources,
    'access',jsonb_build_object('community',sac.has_active_community_access(u),'ranking',sac.has_active_ranking_access(u,null))
  );
end;
$$;
