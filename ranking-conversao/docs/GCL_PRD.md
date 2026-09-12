# Global Conversion League (GCL) — Product Requirements Document (PRD)

> Documento normativo de produto, engenharia, dados, segurança, operações e handoff.

## Status

- **IMPLEMENTADO:** Código e infraestrutura existem no ambiente atual.
- **HOMOLOGADO:** Fluxo foi testado com canários/sandbox e passou os gates definidos.
- **BLOQUEADO GO-LIVE:** Existe tecnicamente, mas não deve ser exposto a leads pagantes até dependência externa/controle ser concluído.
- **ROADMAP:** Requisito de evolução, ainda não considerado entregue.

## 1. Controle do Documento

**Nome:** GCL / Global Conversion League — Product Requirements Document (PRD)  
**Versão:** 1.0.4
**Data-base:** 12/09/2026
**Produto:** Global Conversion League (GCL) + SAC / Sites de Alta Conversão  
**URL de produção:** https://plutyx.com/ranking-site/  
**Repositório:** GitHub `plutyx/plutyx`  
**Frontend ativo:** branch `convrank-hostinger-front`, diretório `ranking-conversao/`  
**Backend principal:** Supabase projeto `Wurthmann` (`npgheuzpnkwtxopswpqy`), schema `sac`  
**Objetivo deste documento:** ser a fonte de verdade funcional e técnica para produto, engenharia, design, CRO, dados, segurança, operações e futuros fornecedores/programadores.

Este PRD deve ser atualizado sempre que houver alteração em monetização, score/ranking, contratos de API, modelo de dados, integrações, critérios de elegibilidade, segurança, SLAs ou definição de “produção”. O README pode resumir; este arquivo é a especificação normativa.

## 2. Visão Geral do Produto

A GCL é um SaaS B2B de **conversion intelligence + competição + comunidade + marketplace**. O usuário entra pela curiosidade/competitividade (“quanto meu site pontua?”), compra a auditoria, compara sua maturidade com benchmarks, pode entrar no ranking oficial, candidatar-se aos Awards, participar da comunidade e contratar melhorias comprováveis para aumentar a pontuação após reauditoria.

A plataforma não deve ser posicionada como um “SEO checker” ou concurso puramente visual. O produto cruza engenharia, performance, UX/UI, acessibilidade, SEO, segurança, confiança, arquitetura de conversão, oferta, copy, checkout, tracking, comportamento, experimentação e evidência first-party quando conectada.

**Princípio de confiança:** assinatura compra acesso/visibilidade; **posição no ranking não é comprada**. Serviços comprados nunca adicionam pontos diretamente. Score só muda quando uma nova auditoria encontra evidência melhor.

## 3. Arquitetura de Marca

**Marca-mãe:** Global Conversion League (GCL) — “The global league for high-conversion digital experiences.”  
**Motor de análise:** SAC / Sites de Alta Conversão — Evidence OS + Conversion Readiness.  
**Pesquisa, metodologia e inteligência:** GCL Intelligence.  
**Premiação:** Global Conversion Awards.  
**Comunidade:** GCL Community.  
**Marketplace/serviços:** GCL Market.

A linguagem visual deve transmitir instituição global, competição, precisão e craft premium. Referência de nível: Awwwards, Semrush e produtos B2B de dados; não copiar identidade. Evitar aparência de “curso de marketing”, promessa milagrosa ou estética de guru.

## 4. Tese Estratégica e Diferenciais

A GCL cria um flywheel: **Audit → Compare → Compete → Discuss → Implement → Re-audit → Prove → Rise → Win → Share**. O mesmo usuário pode gerar receita transacional, recorrente e de serviços.

Diferenciais defensáveis:
- Evidence OS: cada conclusão guarda fonte/proveniência e nível de confiança.
- Ranking com cobertura mínima e separação entre técnico, voto popular e júri.
- Benchmark público próprio em larga escala.
- Community baseada em implementação/casos e não apenas conteúdo.
- Market conectado às lacunas reais do scan e ao potencial técnico de recuperação.
- Reauditoria como mecanismo de prova; serviços nunca compram pontos.
- Revenue Architecture para operações de VSL, high-ticket, SaaS, perpétuo e lançamentos.
- Regras explícitas de “não inventar” métricas comportamentais/receita sem first-party data.

## 5. Públicos-Alvo e Personas

**P1 — Empresário / founder:** quer saber se o site está “perdendo dinheiro”, comparar-se, ganhar status, melhorar vendas e delegar correções.  
**P2 — Profissional autônomo / especialista:** copywriter, designer, CRO, dev, gestor de tráfego ou agência; quer reputação, networking, leads e cases.  
**P3 — Growth/CRO Manager enterprise:** precisa de evidência, benchmarks, governança, histórico e integrações.  
**P4 — Agência/consultoria:** gerencia múltiplos domínios, precisa de carteira, export, reauditorias e relatórios para clientes.  
**P5 — Jurado/curador/moderador:** avalia Awards e Community sem alterar score técnico.  
**P6 — Visitante público:** consome ranking, nominees, research e exemplos até sentir vontade de competir.

**Requisito enterprise futuro:** organizações, múltiplos usuários, RBAC, SSO/SAML, SCIM, API, exports, contratos/SLA e portfolios de centenas de domínios.

## 6. Jornada do Usuário e Funil

**6.1 Atração** — usuário acessa Home, vê liga/temporada, benchmark, ranking, nominees e proposta “quanto seu site pontua?”.  
**6.2 Qualificação sem scan profundo** — cola URL. O sistema cria um `analysis_checkout_intent`, normaliza domínio, valida URL e mostra o que será analisado. Não deve consumir o worker pesado antes do pagamento.  
**6.3 Monetização core** — GCL Conversion Audit completo é desbloqueado após pagamento confirmado.  
**6.4 Execução** — webhook idempotente concede purchase e coloca o full scan na fila automaticamente.  
**6.5 Resultado** — dashboard visual com score/posição (se elegível), dimensões, issues, métricas, evidências, páginas, Awards progress, Revenue Architecture e Market recomendado.  
**6.6 Expansão** — usuário cria conta/reconcilia compra, verifica domínio, assina Ranking/Community e/ou paga Awards.  
**6.7 Retenção** — Community, histórico, missões, cases, experiments, reauditorias profundas agendadas e rank movement.  
**6.8 Monetização principal de longo prazo** — serviços/soluções para corrigir gaps e reauditar.

**Regra de preview:** não mostrar “nota borrada” inventada para o domínio se o scan ainda não ocorreu. O teaser gratuito deve usar dados de produto/metodologia, benchmark público já existente ou relatório demonstrativo; score do próprio usuário só pode existir após coleta real.

## 7. Modelo de Monetização

O modelo é híbrido:
1. **Transacional:** auditoria completa e inscrição Awards.
2. **Recorrente:** Ranking, Community e bundle.
3. **Serviços/Market:** implantação de melhorias ligadas a gaps do scan.
4. **Futuro enterprise:** portfolios, seats, API, SLA, private benchmarking e integrações premium.

**Regra anti-pay-to-win:** nenhuma compra altera score/rank diretamente. Um slot promocional, se existir, deve estar visualmente separado do ranking oficial e rotulado como sponsored/editorial; nunca fixado dentro da ordem técnica.

## 8. Catálogo Comercial Atual

Os valores são configuração de homologação e não constante de código.

| Produto | Código | Preço | Cobrança | Estado |
|---|---|---:|---|---|
| GCL Conversion Audit · Análise Completa | sac_analysis_2026 | R$ 97 | Único | Sandbox homologado; live bloqueado |
| Ranking Global GCL | sac_ranking_monthly | R$ 59/mês | Recorrente | Sandbox homologado; live bloqueado |
| GCL Community | sac_community_monthly | R$ 39/mês | Recorrente | Sandbox homologado; live bloqueado |
| GCL Club · Ranking + Community | sac_ranking_community_monthly | R$ 79/mês | Recorrente | Sandbox homologado; live bloqueado |
| Global Conversion Awards 2026 | sac_awards_entry_2026 | R$ 297/site | Único/temporada | Sandbox homologado; live bloqueado |
| GCL Season Pass 2026 | sac_complete_entry_2026 + recurring | R$ 349 + R$ 79/mês | Entrada + recorrência | Sandbox homologado; live bloqueado |

## 9. Requisitos Funcionais — Superfícies Públicas

**Home/Challenge:** hero competitivo; input URL; benchmark; prova metodológica; ranking; Awards; Community; Market; CTA de análise; transparência do paywall; estados de erro; health degradado sem quebrar UX.

**Ranking:** ordenação somente por score/evidência entre participantes elegíveis; histórico e `rank_delta`; ranking público por snapshot/cache, nunca recalcular tudo por pageview. Filtros por país, vertical, tecnologia e arquétipo continuam evolução P1.

**Awards:** temporada, nominees, categorias, storytelling, score técnico, voto Community e júri separados. Compra de inscrição não garante nomination/award.

**GCL Intelligence / Research:** metodologia, changelog do score, benchmarks, estudos, cases, explicação de fontes e pesquisas. Conteúdo é parte da credibilidade institucional.

**Market:** catálogo de soluções com matching para gaps observados. Quando há scan válido, a UI pode priorizar soluções por gaps/checks e teto técnico de recuperação, sem somar potenciais entre serviços e sem prometer melhoria. Todo card deve explicar que pontos só mudam após reauditoria.

## 10. Requisitos Funcionais — Área do Membro

Login/cadastro via Supabase Auth; dashboard; perfil; sites; análises; purchases; memberships; claim de domínio; checkout contextual; notificações; missões; histórico; monitoramento/reauditoria; acesso a Community, Ranking e Awards conforme entitlement.

Compra antes do cadastro deve ser reconciliada pelo e-mail **verificado**. Reconciliação de compra não prova propriedade do domínio.

Claim de domínio obrigatório para Ranking/Awards. Métodos implementados: meta tag, arquivo `.well-known` e DNS TXT.

## 11. Community — Produto Social e de Implementação

A Community não é fórum genérico. Espaços: Feed, Hot Seats, Resultados/Wins, Ajuda CRO, Swipe Vault, Action Lab/Classroom, Experiment Lab, Eventos, Projetos & Vagas, Diretório e Announcements.

Interações implementadas/homologadas: posts, comentários, respostas, 4 reações (Útil/Insight/Win/Apoio), reação em comentário, salvar, seguir membro, visualizações únicas, notificações deduplicadas e estados viewer-specific.

Gamificação premia valor recebido de outros membros. Exemplo homologado: reação útil no post +3 pontos; reação útil/insight em comentário +1; troca de reação não duplica contagem. Usuário sem membership recebe `community_access_required`; auto-follow é bloqueado.

**Anti-spam:** não conceder pontos relevantes por mero volume de postagem. Missões privilegiam reauditoria, case verificado, ajuda aprovada e experimentação. Moderation/reporting existe e uma denúncia não remove conteúdo automaticamente.

## 12. Awards — Requisitos e Governança

Temporada atual: `GCL-2026 / Founding Season 2026`. Pipeline: purchase → domínio verificado → análise válida → submission → nominee/elegibilidade → voto Community → júri → award.

Dimensões do júri: Conversion Clarity, User Experience, Technical Execution, Trust & Persuasion, Originality (0–10). Score técnico, Jury Score e Community Vote nunca devem ser fundidos em um único número sem rotulagem.

Proteções: self-vote proibido; janelas de submissão/votação; jurado exige entitlement/role; validação de faixa de score do júri; compra não garante Award; badges emitidos apenas quando critérios e cobertura são satisfeitos.

## 13. Motor de Análise — Evidence OS

O motor privilegia **evidência observável e proveniência**. Cada métrica tem registry, classe de evidência, collection mode, unidade, threshold/referência, confidence e source_kind.

**Snapshot operacional em 10/09/2026:** 779 métricas no catálogo; 684 métricas públicas/autônomas implementadas; 623 diagnósticos autônomos; 500 métricas validadas; 500 sinais Lighthouse/PageSpeed materializáveis; 95 métricas que exigem conexão; 40 `score_input` governados. Profundidade diagnóstica não significa atribuir peso a cada sinal.

Camadas de evidência:
- Public URL/HTTP/HTML/DNS.
- Browser/render sintético.
- Lab (Lighthouse/PageSpeed).
- Field dataset (CrUX).
- First-party/RUM quando conectado.
- Experiment provider.
- Competitive estimate apenas com provider real e rótulo explícito.

Precedência: first-party/RUM > CrUX page > CrUX origin > claim integrity > PageSpeed/Lighthouse > browser snapshot > current HTTP/domain/origin > archetype/semantic. Evidência fraca não pode sobrescrever evidência mais forte.

## 14. Regras Metodológicas Não Negociáveis

- Ausência de coleta ≠ ausência no site.
- `not_verifiable`/`needs_connection` não viram `pass`.
- TBT não é INP.
- Lighthouse `server-response-time` não é TTFB completo.
- CrUX/field vence lab quando a métrica é equivalente.
- Feature opcional ausente pode ser `not_applicable`, não falha.
- JSON-LD válido não prova eligibility para rich results.
- Tipo de schema não observado no sample não é automaticamente falha.
- Tráfego, bounce, conversão, rage clicks, scroll, receita e abandono não podem ser inventados.
- Competitive estimate precisa de provider, data e disclosure.
- Serviços comprados nunca compram pontos.
- Score oficial é gated por cobertura/confiança.
- Ranking oficial inclui somente participantes elegíveis; assinatura compra visibilidade, não posição.

## 15. Categorias de Métricas

Performance/WPO; Core Web Vitals; network/frontend; mobile/responsive; accessibility/WCAG; SEO/on-page; crawl/indexability; structured data; security; privacy; analytics/tracking; social; images/media; UX; forms; trust; copy/offer; conversion architecture; ecommerce/checkout; funnel integrations; technology; local business; video; behavior/RUM; experimentation; traffic intelligence; funnel economics; Revenue Architecture.

## 16. Revenue Architecture / Direct Response

Camada para operações sofisticadas de SaaS, high-ticket, VSL, perpétuo, e-commerce e lançamentos. Mede arquitetura pública observada — **não taxa de conversão ou receita**.

Sinais: video embeds/providers; checkout links; upsell/downsell/order-bump footprint; lead-funnel paths; guarantee/risk-reversal; bonus/offer stack; urgency/scarcity; objection handling/FAQ; countdown; payment platforms; proof/cases/testimonials; diversidade de componentes.

Índice `observed_readiness` é experimental e permanece separado do score oficial até validação metodológica/estatística suficiente.

## 17. Benchmark e Base de Comparação

Snapshot em 10/09/2026: **15.950 URLs processadas**, **13.823 auditorias concluídas** e **11.668 respostas HTTP 2xx/3xx com HTML público coletável**. Fonte de expansão: Majestic Million como baseline técnico público.

A claim “10.000+” usa somente o contador HTTP válido. Benchmark técnico não significa “10.000 páginas de vendas com conversão conhecida”. O cohort de score profundo materializado continua separado; percentis profundos não devem ser comunicados como corpus-wide enquanto a amostra não atingir o mínimo metodológico.

## 18. Arquitetura Técnica — Visão Macro

**Frontend:** React/Vite na Hostinger `/ranking-site/`; SPA com fallback. Release v39 separa React/Lucide em chunks cacheáveis e usa preconnect ao Supabase.  
**Backend/Data:** Supabase Postgres/Auth/Edge Functions/pg_cron/pg_net/Vault, schema `sac`.  
**Workers pesados:** Render (Playwright/Chromium/Lighthouse/axe e deployer Hostinger).  
**Payment:** Stripe test mode; live bloqueado.  
**E-mail:** Resend `mail.plutyx.com`, status DNS `pending`; não usar como canal transacional de go-live ainda.  
**Deploy:** GitHub CI → build → Render SFTP deployer → Hostinger smoke/proveniência.

Fila é obrigatória para trabalho pesado. Requests públicos não mantêm browser/Lighthouse aberto de forma síncrona.

## 19. Edge Functions e Contratos

| Função | Responsabilidade | Segurança/Notas |
|---|---|---|
| sac-ranking-site-api | API pública: home, ranking, qualify, status, report, offers, Awards, health e Market contextual. | Edge pública; rate limit; sem service key no browser. |
| gcl-member-api | Área do membro e Community. | JWT; CORS allowlist; rate limit por usuário. |
| gcl-monitoring-api | Status/configuração de reauditoria recorrente. | JWT obrigatório; payload 8 KB; domínio verificado + Ranking ativo no RPC. |
| gcl-domain-verify | Claim por meta, arquivo ou DNS TXT. | JWT; SSRF protection; redirects limitados. |
| gcl-market-request | Intake de serviços Market. | CORS; limite por IP + combinação; honeypot; body 16 KB; service role só no servidor. |
| gcl-stripe-webhook | Purchase/membership/lifecycle. | Assinatura Stripe, Vault e idempotência. |
| sac-current-page-probe | HTML/headers/cookies/SRI/JSON-LD/sinais atuais. | SSRF protection e evidência pública. |
| sac-pagespeed-probe | PageSpeed/Lighthouse + CrUX quando disponível. | Lab e field separados. |
| sac-benchmark-batch | Benchmark público em lotes. | Segredo interno Vault; chamada sem token = 403. |
| sac-benchmark-expand | Importador de expansão. | Desativado após carga controlada. |

## 20. Filas, Workers, Concorrência e Monitoramento

Full scans, current probes, PageSpeed, browser snapshots e benchmark são assíncronos. Usar `FOR UPDATE SKIP LOCKED`, idempotência por audit/job e limites de concorrência. Ranking é cacheado/snapshotado.

Capacidade atual `fullscan`: **1 slot global / dispatch batch 1**, com soft limit 25 e hard limit 100. Esta configuração é conservadora e deve permanecer assim até capacity plan/load test comprovar aumento seguro.

**Scheduled re-audit v40:** `monitoring_schedules` exige domínio verificado + Ranking ativo; semanal/mensal para Ranking e diário apenas para entitlement Enterprise. A execução usa `lighthouse_full`, proveniência `scheduled_monitoring`, admite no máximo uma agenda por ciclo e **cede prioridade se houver qualquer `full_paid` queued/processing**. Conclusão/falha gera notificação deduplicada ao membro. Score/rank só mudam pela materialização normal de evidência.

SLO observado de full scan é baseline operacional, não SLA comercial. Antes de tráfego massivo, executar load test controlado com percentis e custo por audit.

## 21. Segurança, Privacidade e Antiabuso

Controles implementados: JWT na área do membro; RLS; service-role restrito ao backend; CORS allowlist; CSP/headers na Hostinger; rate limiting persistente; SSRF protection; webhook Stripe assinado; secrets em Vault; idempotência financeira; grants anônimos revogados das RPCs sensíveis; limites de payload em endpoints públicos críticos; moderação/reporting Community/Awards.

**Pendência P0 externa:** habilitar Leaked Password Protection no Supabase Auth e revisar política Auth/MFA. Antes de enterprise: MFA, audit log administrativo, role governance, DPA, retenção, export/delete, security page e plano SOC 2/ISO.

LGPD/GDPR: coletar apenas dados necessários; explicitar finalidade; suportar consentimento, exportação e exclusão; first-party integrations com escopos mínimos e revogáveis.

## 22. Pagamentos, Billing e Entitlements

Stripe está em **test mode**. Produtos/prices/Payment Links e webhook estão homologados, mas checkout público deve permanecer fail-closed até replicar tudo em `livemode` e executar compra real controlada + refund/cancel lifecycle.

Webhook: assinatura verificada, ledger idempotente, purchases, memberships, lifecycle, `past_due`, cancelamento, invoice failure/success. Canário confirmou replay idempotente.

Ranking/Community são recorrentes; Awards e Audit são one-time; Complete combina entrada + recorrência. Customer Portal live é requisito para lifecycle comercial escalável.

## 23. E-mail e Lifecycle Messaging

Resend está conectado a `mail.plutyx.com`, região `sa-east-1`, sending habilitado, porém o domínio segue **pending** até DKIM/SPF/MX verificarem no DNS. Portanto e-mail transacional continua **BLOQUEADO GO-LIVE**.

Eventos necessários: pagamento confirmado, análise iniciada/concluída, claim, membership, payment failed, cancellation, rank movement, nominee, award, comentário/reply, Hot Seat selecionado e scheduled re-audit concluída/falha.

E-mails devem usar idempotência/dedupe e preference center para comunicações não transacionais.

## 24. CI/CD, Hosting e Ambientes

- CI dedicado: `.github/workflows/gcl-ranking-ci.yml`.
- Build Hostinger: `.github/workflows/ranking-conversao.yml`.
- Deployer Render: `plutyx-hostinger-ranking-site-deployer`, autoDeploy off, promoção manual após gates.
- SFTP: `public_html/ranking-site`.
- Toda promoção aceita exige proveniência SHA + smoke das rotas críticas.
- Release v39 publicado: `5c411395a42377c346d1beb47f4e4b64baaeb46b`.

Ambientes: local → preview/branch → production. Nunca testar migration destrutiva em produção sem branch/backup quando houver risco de dados. Secrets não entram no GitHub, documentação ou frontend.

## 25. Observabilidade e SLOs

Health cobre fila, stale jobs, probes, webhook, payments, cron, ranking cache e infraestrutura. Gates: queue warning >300s; critical >900s; processing stale >600s; ranking cache stale >300s; webhook failure exige investigação; deploy só após CI + smoke.

Snapshot 10/09/2026 21:59 UTC: `ops_health_payload.status = degraded`; fila fullscan queued=0/processing=0; ranking cache ~35s; webhook failures 24h=0. Estado operacional e **commercial go-live são conceitos separados**: checkout live continua bloqueado por Stripe livemode e controles externos P0.

## 26. Testes e QA Obrigatórios

**E2E visitante:** Home → URL → qualify → paywall; nenhuma análise profunda antes do pagamento.  
**E2E comprador:** pagamento sandbox/live → webhook → scan → report.  
**E2E member:** login → reconcile → dashboard → claim → subscription → entitlement → monitoring.  
**Community:** post, reação/troca, comentário, reply, save, follow, notification, points, outsider/self-action blocked.  
**Awards:** purchase → verified domain → submit → nominee → vote → self-vote blocked → jury.  
**Security:** webhook inválido, rate limits, SSRF, RPC exposure, CORS, auth expiry, payload guards.  
**Data correctness:** evidence precedence, coverage gating, no fabricated metrics.  
**Cross-device:** Chromium/WebKit/Firefox em CI + iOS/Android físicos antes de paid traffic.  
**Load:** qualify, full scans, feeds, leaderboard, payments e cache sob pressão.

Todo bug achado em canário deve gerar regression gate quando razoável. O bug v40 “monitoramento recorrente usando `rendered_preview`” passa a ser protegido por CI que exige `lighthouse_full`, `scheduled_monitoring` e `yield_to_full_paid`.

## 27. Requisitos para Atender Grandes Players Globais

**ROADMAP enterprise prioritário:** organizations/workspaces multi-seat; RBAC; SSO/SAML + SCIM; portfolio e bulk onboarding; diff visual/métrico; deep crawl configurável 10/100/1.000+ páginas com orçamento de compute; API/keys/quotas/webhooks; export PDF/CSV/JSON; private benchmark; GA4/Clarity/Search Console/Stripe/Shopify/HubSpot/VWO/Optimizely/data warehouse; Community privada; SLA/priority queue; retention/region; DPA/subprocessors/security center; multi-language/multi-currency/tax; invoice/contract billing.

Auditorias agendadas básicas deixam de ser roadmap a partir da v40; **deep crawl enterprise e diff avançado** continuam roadmap.

## 28. UX/Branding — Critérios de Qualidade

A plataforma precisa impressionar CMO/CRO/founders sofisticados. Direção: editorial premium, hierarquia tipográfica forte, densidade quando é dado, whitespace quando é narrativa, microinterações discretas, zero template genérico de SaaS.

O relatório deve parecer ferramenta de inteligência: score + confidence + coverage + provenance + benchmark + issues priorizados + impacto potencial + Market + reauditoria.

Awwwards é referência de ritual/nominee/prestige; Semrush de densidade/dashboards; Circle/Skool de comunidade. GCL mantém identidade própria baseada em **league + intelligence + evidence**.

## 29. Requisitos de Dados e Modelo

Entidades: domains, audit_runs, pages, metric_registry/observations, atomic checks/evaluations, experience scores, benchmark sources/targets/results, ranking entries/history, commercial products, checkout intents, purchases, memberships, payment events, profiles, domain members/claims, community, notifications, monitoring_schedules, experiments, case studies, projects, hot seats, awards, market, blog e ops health.

Toda tabela nova define ownership, RLS, grants, índices, retenção e deleção antes de ser pronta.

## 30. Estados e Máquinas de Estado

**Analysis intent:** prepared → paid → scan_queued → scan_started/completed ou failed/expired.  
**Audit:** queued → processing → completed/failed.  
**Membership:** active → past_due → canceled/expired.  
**Domain claim:** prepared → verified ou failed/expired.  
**Awards:** draft/submitted → nominee/eligible → voting/judging → awarded/not_awarded/withdrawn.  
**Benchmark:** queued → processing → completed/failed/skipped.  
**Scheduled monitoring:** configured → queued_deep_reaudit/in_flight → completed_deep_reaudit ou failed_deep_reaudit; pode ser adiado pela fila paga sem alterar evidência.

Mudanças financeiras são idempotentes e auditáveis.

## 31. P0 — Bloqueadores para Go-Live Comercial

1. **BLOQUEADO:** Stripe `livemode`, produtos/prices/webhook, compra real controlada + refund/cancel lifecycle.
2. **BLOQUEADO:** Leaked Password Protection e revisão Auth/MFA.
3. **BLOQUEADO:** DNS/Resend `mail.plutyx.com` verified + lifecycle transacional.
4. **BLOQUEADO EXTERNO:** E2E visual em dispositivos reais iOS/Android e browsers físicos relevantes.
5. **BLOQUEADO:** stress/load test final e capacity/cost plan para workers pesados.
6. **IMPLEMENTADO / REVISÃO EXTERNA PENDENTE:** termos, privacidade, cookies, refunds/cancellation e regras Awards estão publicados no produto; revisão jurídica continua obrigatória.
7. **IMPLEMENTADO/HOMOLOGADO:** moderation/abuse/reporting para Community/Awards.
8. **PARCIAL/BLOQUEADO:** backups/runbook existem parcialmente; incident response e owners operacionais precisam de fechamento formal.
9. **BLOQUEADO EXTERNO:** revisão jurídica de “conversion”, Awards, benchmark e claims.
10. **HOMOLOGADO EM CI / EXTERNO PENDENTE:** WCAG A/AA automatizado passa; completar validação assistiva/device real.

## 32. P1 — Produto para Crescimento

- **IMPLEMENTADO/HOMOLOGADO v40:** scheduled deep re-audit + alertas de rank movement.
- ROADMAP: benchmarks por vertical/país/arquétipo.
- ROADMAP: connectors first-party GA4/Clarity/Search Console/commerce.
- ROADMAP: cases verificados exibidos no Market/profile.
- IMPLEMENTADO/P1 CONTÍNUO: Hot Seats, Action Lab, jobs/diretório e workflows sociais; evoluir rooms/live.
- IMPLEMENTADO/P1 CONTÍNUO: Swipe Vault/templates; ampliar acervo e regras de desbloqueio.
- ROADMAP: referral/affiliate sem contaminar score.
- IMPLEMENTADO/P1 CONTÍNUO: public profile/especialistas e marketplace de jobs; amadurecer matching/reputação.
- IMPLEMENTADO/P1 CONTÍNUO: share cards/badges; ampliar validação pública e distribuição.

## 33. P2 — Enterprise e Defensabilidade

Enterprise orgs/RBAC/SSO/SCIM; API/warehouse exports; deep crawl; private competitions/internal awards; benchmarking estatístico por cluster; research datasets anonimizados do GCL Intelligence; anti-gaming/anomaly detection; SOC 2/ISO roadmap; global billing/tax/localization.

## 34. Definition of Done — Feature

Uma feature só é Done quando requisito/estados estão definidos; happy/negative paths passam; auth/RLS/grants revisados; idempotência quando aplicável; observabilidade e erro útil existem; CI passa; produção/staging foi smoke-tested; copy não faz claim acima da evidência; documentação/changelog atualizados; rollback definido para risco.

## 35. Definition of Ready — Plataforma para Leads Reais

Para declarar “pronta para tráfego pago”, todos os P0 precisam estar concluídos. Enquanto Stripe estiver em test mode ou e-mail sem domínio verificado, a plataforma pode ser publicamente testada, mas **não é checkout comercial integral**.

## 36. Runbook Operacional Resumido

**Scan travado:** `ops_health_payload`, fila, stale jobs, workers Render, probes e cron.  
**Pagamento não liberou:** Stripe event → payment_provider_events → purchase → membership/analysis intent; conferir idempotência antes de reenfileirar.  
**Ranking não atualizou:** refresh oficial/autônomo + payload cache.  
**Monitoring não rodou:** schedule/entitlement/domain verification → `run_due_monitoring` → paid queue → fullscan job → materialization.  
**Community falhou:** JWT, membership, rate limit e RPC grants.  
**Deploy falhou:** manter versão anterior; CI + build + SFTP + smoke são gates separados.  
**Claim metodológica mudou:** atualizar código, GCL Intelligence e PRD no mesmo release.

## 37. Governança do Código e Handoff

Identificar branch/paths no início; não misturar GCL com Cozinha360 no mesmo release. Migrations têm nomes semânticos e não corrigem schemas legados não relacionados. Alterar threshold, evidence precedence, eligibility ou ranking exige versão metodológica e recompute controlado. Nunca substituir dados reais por mocks em produção.

## 38. Glossário

**SAC:** motor Sites de Alta Conversão.  
**GCL:** Global Conversion League.  
**Evidence OS:** materialização/proveniência + precedência de evidência.  
**Atomic check:** verificação granular.  
**Coverage:** proporção de checks elegíveis observados.  
**Confidence:** confiança ponderada da evidência.  
**Official Score:** score liberado após gates de cobertura/confiança.  
**RUM:** Real User Monitoring.  
**CrUX:** Chrome UX Report.  
**Nominee:** candidatura elegível/publicada no Awards.  
**Entitlement:** direito derivado de compra/membership.  
**Deep re-audit:** nova coleta `lighthouse_full` programada por monitoring, sujeita a entitlement/capacidade e sem alteração direta de score.

## Apêndice A — Rotas de Produção

| Superfície | URL | Acesso |
|---|---|---|
| Home / Challenge | https://plutyx.com/ranking-site/ | Pública |
| Ranking | https://plutyx.com/ranking-site/ranking/ | Pública |
| Awards / Nominees | https://plutyx.com/ranking-site/awards/ | Pública + ações autenticadas |
| Community | https://plutyx.com/ranking-site/community/ | Guest lobby + membership para ações/feed completo |
| Market / Serviços | https://plutyx.com/ranking-site/services/ | Pública; contextual por scan |
| Research / GCL Intelligence | https://plutyx.com/ranking-site/blog/ | Pública |
| Institucional | https://plutyx.com/ranking-site/about/ | Pública |
| Minha Área | https://plutyx.com/ranking-site/account/ | Autenticada |

## Apêndice B — Edge Functions Principais

Ver seção 19. O ambiente é fonte de verdade para versão ativa; código/migration precisam permanecer versionados no repositório.

## Apêndice C — Status Atual e Dependências

**Snapshot:** 10/09/2026 — release v39 publicado e v40 em homologação.  
Operacional: fila principal 0; Ranking operacional/cache ativo; Market 10 listings; benchmark HTTP válido 11.668.  
Comercial: **go-live permanece bloqueado** por Stripe livemode e controles P0 externos.  
Métricas/benchmark são dinâmicos; consultar API/DB antes de apresentação externa.

## Changelog

- **1.0.6 — 12/09/2026:** GCL AI Analyst 2.3 reduz o envelope do refinador aos sinais CRO essenciais e corrige a telemetria quando todas as rotas gratuitas falham, preservando contagem de tentativas e erros primário/fallback. A mudança responde ao canário 2.2, no qual o brief base concluiu, mas os dois refinadores excederam o orçamento com um prompt excessivo.
  - Canário real: refinamento concluído pelo Nemotron Lightning na primeira tentativa; envelope de 2.017 caracteres, 44,6 s de tempo total, duas chamadas e custo OpenRouter registrado em zero — redução aproximada de 44,5% contra o canário 2.1.
  - Backend homologado no worker v10; contratos 2.1 e 2.2 permanecem preservados como histórico imutável.
- **1.0.5 — 12/09/2026:** GCL AI Analyst 2.2 torna Nemotron Lightning o refinador primário gratuito após o canário 2.1 comprovar conclusão no fallback, preserva Nemotron Ultra como recuperação e mantém telemetria explícita de rota, tentativas e erro primário. O objetivo é remover o timeout recorrente do caminho normal sem reduzir o truth gate ou a rastreabilidade das versões anteriores.
- **1.0.4 — 12/09/2026:** GCL AI Analyst 2.1 versionado no repositório; refinamento OpenRouter continua gratuito e passa a usar Nemotron Ultra com fallback Nemotron Lightning, evidência compactada, telemetria de rota e cabeçalho oficial de atribuição. Contrato 2.0 permanece imutável para auditoria histórica.
  - Canário real: base Nex Mini + fallback Lightning concluído em 80,4 s após timeout controlado do Ultra; três chamadas, custo OpenRouter registrado em zero e `refinement_status=completed`.
- **1.0.1 — 10/09/2026:** branding canônico GCL Intelligence; benchmark/métricas sincronizados; Market contextual; hardening de intake; separação health operacional/comercial; performance v39; scheduled monitoring corrigido para deep re-audit `lighthouse_full` com prioridade para scans pagos e notificações; P0/P1 reconciliados com produção.
- **1.0.0 — 09/09/2026:** baseline de produção/handoff com arquitetura GCL, Evidence OS, Community social, Awards, Revenue Architecture, billing sandbox, segurança, benchmark estrito e gates de go-live.


## Atualização 1.0.2 — Diagnóstico e prazo de coleta (v44/v45)

- O relatório e o perfil de pontuação distinguem diagnóstico provisório de competição oficial. A colocação pública exige `score_status=official`, `ranking_scope=official_competition` e `official_competition_eligible=true`. Um antigo `eligibility_status=eligible` isolado nunca libera posição.
- A cobertura principal conta verificações com pass/warning/fail sobre o total de verificações. `collector_metric_coverage` aparece separadamente como sinais coletados. Ausência do novo contrato não transforma cobertura legada em cobertura verificada.
- Notas provisórias aparecem arredondadas com ≈; valores e cobertura por eixo permanecem no contrato de evidência. Cobertura baixa não sustenta precisão decimal ou classificação definitiva.
- Revenue Architecture GCL-SALES-1.1 identifica o modelo comercial. Serviços/lead generation apresentam CTAs, formulários e prova; checkout/pagamento são não aplicáveis. Readiness é experimental e não representa conversão ou receita.
- As quatro migrations v44 foram recuperadas do histórico aplicado no Supabase, preservando versões e SQL. A migration de margem de transporte v43 também foi recuperada.
- Worker 0.6.0: orçamento único de 120 s desde DNS/robots, com até 8 s adicionais para cancelamento. A evidência já observada é preservada com status parcial; sem HTML, retorna HTTP 504. O transporte continua com margem de 150 s (210 s para o processamento de benchmark).
- Fila: HTTP 429/502/503/504 e timeout admitem no máximo uma repetição, com intervalo mínimo de 30 s. Tentativa sem resposta após 4 min é repetida uma vez e então encerrada como falha. A prioridade de compras permanece preservada.
- Validação de publicação: testes de regressão do worker e do contrato visual, CI, proveniência Hostinger e canários reais. O orçamento por requisição não é um SLA da auditoria inteira: espera em fila, novas tentativas e coletores assíncronos têm duração própria.
- Rollback: reverter o commit do frontend/deploy do worker; restaurar a definição anterior da coleta/fila se necessário. Não reaplicar as migrations já registradas nem apagar auditorias históricas.


## Atualização 1.0.3 — Validação de produção e correções de interface (v58)

- O roteador decide a renderização das seis páginas do Trust Center antes de criar qualquer raiz React. Removida a disputa entre a página de política injetada após dois frames e o commit assíncrono da rota 404, observada no Firefox no run 34560525486 (79 testes passaram, um falhou).
- A matriz Chromium/Firefox/WebKit, incluindo perfis Android/iOS, passa a executar também em pull requests para o frontend. A regressão cobre acesso direto às políticas, navegação Privacidade → Awards e retorno à liga.
- Histórico: um score ausente, vazio ou em formação não vira zero. O registro nulo inicial do HawkSEM estava produzindo uma melhoria fictícia de +88,8 pontos. Zero medido continua válido; variações de diagnósticos provisórios são aproximadas e os pontos são descritos como registros, sem alegar auditorias independentes.
- Checkpoint recuperado em 11/09/2026: frontend v57 (`29fe0d5`), worker 0.9.2 (`6bc40f3`), fila operacional sem jobs pendentes. Os cinco canários antes problemáticos concluíram com evidência parcial: WebFX 93,7 s, Disruptive Advertising 120,1 s, Conversion Sciences 93,2 s, Speero 93,4 s e Seth Godin 105,3 s (última coleta, worker 0.9.2). Tempos correspondem à coleta interna, não à espera total em fila.
- Lighthouse local continua sujeito ao orçamento e à CPU disponível. `completed` não afirma cobertura completa: indisponibilidade de laboratório e degradação permanecem explícitas. O snapshot de health distingue captação de leads operacional de pagamentos reais ainda bloqueados por Stripe livemode.
- Rollback desta interface: reverter o commit v58 e republicar o bundle pelo deployer Hostinger existente. Nenhuma migration adicional é necessária para essas correções visuais.
