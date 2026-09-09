# Global Conversion League (GCL) — Product Requirements Document (PRD)

> Documento normativo de produto, engenharia, dados, segurança, operações e handoff.

## Status

- **IMPLEMENTADO:** Código e infraestrutura existem no ambiente atual.
- **HOMOLOGADO:** Fluxo foi testado com canários/sandbox e passou os gates definidos.
- **BLOQUEADO GO-LIVE:** Existe tecnicamente, mas não deve ser exposto a leads pagantes até dependência externa/controle ser concluído.
- **ROADMAP:** Requisito de evolução, ainda não considerado entregue.

## 1. Controle do Documento

**Nome:** GCL / Global Conversion League — Product Requirements Document (PRD)  
**Versão:** 1.0.0  
**Data-base:** 09/09/2026  
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
**Pesquisa e metodologia:** GCL Labs.  
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
- Market conectado às lacunas reais do scan.
- Reauditoria como mecanismo de prova.
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
**6.3 Monetização core** — Raio-X completo é desbloqueado após pagamento confirmado.  
**6.4 Execução** — webhook idempotente concede purchase e coloca o full scan na fila automaticamente.  
**6.5 Resultado** — dashboard visual com score/posição (se elegível), dimensões, issues, métricas, evidências, páginas, awards progress, Revenue Architecture e Market recomendado.  
**6.6 Expansão** — usuário cria conta/reconcilia compra, verifica domínio, assina Ranking/Community e/ou paga Awards.  
**6.7 Retenção** — Community, histórico, missões, cases, experiments, reauditorias e rank movement.  
**6.8 Monetização principal de longo prazo** — serviços/soluções para corrigir gaps e reauditar.

**Regra de preview:** não mostrar “nota borrada” inventada para o domínio se o scan ainda não ocorreu. O teaser gratuito deve usar dados de produto/metodologia, benchmark público já existente ou um relatório demonstrativo; score do próprio usuário só pode existir após coleta real.

## 7. Modelo de Monetização

O modelo é híbrido:
1. **Transacional:** Raio-X completo e inscrição Awards.
2. **Recorrente:** Ranking, Community e bundle.
3. **Serviços/Market:** implantação de melhorias ligadas a gaps do scan.
4. **Futuro enterprise:** portfolios, seats, API, SLA, private benchmarking e integrações premium.

**Regra anti-pay-to-win:** nenhuma compra altera score/rank diretamente. Um slot promocional, se existir, deve estar visualmente separado do ranking oficial e rotulado como “sponsored/editorial”; nunca “fixado” dentro da ordem técnica.

## 8. Catálogo Comercial Atual

Os valores abaixo refletem o catálogo de homologação atual e devem ser tratados como configuração, não constante de código.

| Produto | Código | Preço | Cobrança | Estado |
|---|---|---:|---|---|
| Raio-X SAC · Análise Completa | sac_analysis_2026 | R$ 97 | Pagamento único | Sandbox homologado; live bloqueado |
| Ranking Global GCL | sac_ranking_monthly | R$ 59/mês | Assinatura | Sandbox homologado; live bloqueado |
| GCL Community | sac_community_monthly | R$ 39/mês | Assinatura | Sandbox homologado; live bloqueado |
| Ranking + Community | sac_ranking_community_monthly | R$ 79/mês | Assinatura | Sandbox homologado; live bloqueado |
| Global Conversion Awards 2026 | sac_awards_entry_2026 | R$ 297/site | Pagamento único por temporada | Sandbox homologado; live bloqueado |
| Complete Pass | sac_complete_entry_2026 + sac_complete_monthly | R$ 349 + R$ 79/mês | Entrada + assinatura | Sandbox homologado; live bloqueado |

## 9. Requisitos Funcionais — Superfícies Públicas

**Home/Challenge:** hero competitivo; input URL; benchmark; prova metodológica; ranking; Awards; Community; Market; CTA de análise; transparência do paywall; estados de erro; health degradado sem quebrar UX.

**Ranking:** ordenação somente por score/evidência entre participantes elegíveis; filtros futuros por país, vertical, tecnologia e arquétipo; histórico e rank delta; ranking público deve usar snapshot/cache, nunca recalcular tudo por pageview.

**Awards:** temporada, nominees, categorias, tecnologia, storytelling, score técnico, voto Community e júri separados. Compra de inscrição não garante nomination/award.

**GCL Labs/Blog:** metodologia, changelog do score, benchmarks, estudos, cases, explicação de fontes e pesquisas. Conteúdo é parte da credibilidade institucional.

**Market:** catálogo de soluções com matching para gaps observados. Todo card deve dizer que pontos só mudam após reauditoria.

## 10. Requisitos Funcionais — Área do Membro

Login/cadastro via Supabase Auth; dashboard; perfil; sites; análises; purchases; memberships; claim de domínio; checkout contextual; notificações; missões; histórico; acesso a Community, Ranking e Awards conforme entitlement.

Compra antes do cadastro deve ser reconciliada pelo e-mail **verificado**. Reconciliação de compra não prova propriedade do domínio.

Claim de domínio obrigatório para Ranking/Awards. Métodos implementados: meta tag, arquivo `.well-known` e DNS TXT.

## 11. Community — Produto Social e de Implementação

A Community não deve ser um fórum genérico. Espaços: Feed, Hot Seats, Resultados/Wins, Ajuda CRO, Swipe Vault, Action Lab/Classroom, Experiment Lab, Eventos, Projetos & Vagas, Diretório e Announcements.

Interações implementadas/homologadas: posts, comentários, respostas, 4 reações (Útil/Insight/Win/Apoio), reação em comentário, salvar, seguir membro, visualizações únicas, notificações deduplicadas e estados viewer-specific.

Gamificação premia valor recebido de outros membros. Exemplo homologado: reação útil no post +3 pontos; reação útil/insight em comentário +1; troca de reação não duplica contagem. Usuário sem membership recebe `community_access_required`; auto-follow é bloqueado.

**Anti-spam:** não conceder pontos relevantes por mero volume de postagem. Missões devem privilegiar reauditoria, case verificado, ajuda aprovada e experimentação.

## 12. Awards — Requisitos e Governança

Temporada atual: `GCL-2026 / Founding Season 2026`. Pipeline: purchase → domínio verificado → análise válida → submission → nominee/elegibilidade → voto Community → júri → award.

Dimensões do júri: Conversion Clarity, User Experience, Technical Execution, Trust & Persuasion, Originality (0–10). Score técnico SAC, Jury Score e Community Vote nunca devem ser fundidos em um único número sem rotulagem.

Proteções: self-vote proibido; janelas de submissão/votação; jurado exige entitlement/role; compra não garante Award; badges emitidos apenas quando critérios e cobertura são satisfeitos.

## 13. Motor de Análise — Evidence OS

O motor deve privilegiar **evidência observável e proveniência**. Cada métrica tem registry, classe de evidência, collection mode, unidade, threshold/referência, confidence e source_kind.

Snapshot atual: **249 métricas registradas**, **154 coletores autônomos implementados**, **685 atomic checks** e **183 critérios estruturais**.

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
- Feature opcional ausente pode ser `not_applicable`, não “falha”.
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

Camada criada para análises de operações sofisticadas de SaaS, high-ticket, VSL, perpétuo, e-commerce e lançamentos. Mede arquitetura pública observada — **não taxa de conversão ou receita**.

Sinais atuais: video embeds/providers; checkout links; upsell/downsell/order-bump footprint; lead-funnel paths; guarantee/risk-reversal language; bonus/offer stack; urgency/scarcity; objection handling/FAQ; countdown footprint; payment platform footprints; proof/cases/testimonials; diversidade de componentes.

Índice `observed_readiness` é experimental e deve permanecer separado do score oficial até validação metodológica/estatística suficiente.

## 17. Benchmark e Base de Comparação

Corpus atual desta versão do documento: **15.950 domínios alvo** e **11.105 respostas HTTP 2xx/3xx válidas**. A fonte de expansão é Majestic Million, usada como baseline técnico público.

Definição oficial para a claim “10.000+”: somente resposta HTTP 2xx/3xx com HTML público coletável entra no contador. Jobs concluídos com HTTP de erro não contam.

Benchmark técnico não significa “10.000 páginas de vendas com conversão conhecida”. Comunicação deve dizer exatamente o que a fonte suporta.

## 18. Arquitetura Técnica — Visão Macro

**Frontend:** React/Vite, hospedado na Hostinger em `/ranking-site/`, SPA com fallback de rotas. GitHub branch `convrank-hostinger-front`.  
**Backend/Data:** Supabase Postgres/Auth/Edge Functions/pg_cron/pg_net/Vault, schema isolado `sac`.  
**Workers pesados:** Render (Playwright/Chromium/Lighthouse/axe e deployer Hostinger).  
**Payment sandbox:** Stripe.  
**E-mail:** Resend (domínio ainda não verificado).  
**Deploy:** GitHub CI → build → Render SFTP deployer → Hostinger smoke tests.

Fila é obrigatória para trabalho pesado. Requests públicos não devem manter browser/Lighthouse aberto de forma síncrona.

## 19. Edge Functions e Contratos

Inventário funcional resumido; nomes/versões devem ser consultados no ambiente antes de mudanças.

| Função | Responsabilidade | Segurança/Notas |
|---|---|---|
| sac-ranking-site-api | API pública da plataforma: home, ranking, qualify, status, report, offers, nominees/awards, health. | Pública via Edge; rate limit; sem service key no browser. |
| gcl-member-api | API autenticada da área do membro e Community. | JWT obrigatório; CORS allowlist; rate limit por usuário. |
| gcl-domain-verify | Validação de propriedade de domínio por meta tag, arquivo ou DNS TXT. | JWT; SSRF protection; redirects limitados. |
| gcl-stripe-webhook | Webhook assinado do Stripe para purchase/membership/lifecycle. | Assinatura Stripe; segredo em Vault; idempotência. |
| sac-current-page-probe | Coleta HTML/headers/cookies/SRI/JSON-LD/sinais atuais. | SSRF protection; token de alvo; evidência pública. |
| sac-pagespeed-probe | PageSpeed Insights/Lighthouse + CrUX quando disponível. | Quota/rate semantics; lab e field separados. |
| sac-benchmark-batch | Worker de benchmark público em lotes. | v3: autenticação interna via segredo no Supabase Vault; chamadas externas sem token = 403. |
| sac-benchmark-expand | Importador controlado de nova faixa do benchmark. | DESATIVADO após import; verify_jwt=true; responde 410. |

## 20. Filas, Workers e Concorrência

Full scans, current probes, PageSpeed, browser snapshots e benchmark rodam de forma assíncrona. Use `FOR UPDATE SKIP LOCKED`, idempotência por audit/job e limites de concorrência. O ranking é cacheado/snapshotado.

SLO inicial observado para full scan: média na ordem de ~87s e p95 ~180s em canários anteriores; tratar como baseline, não SLA contratual. Antes de tráfego massivo, executar load test controlado com percentis e custo por audit.

Benchmark batch v3 exige token interno armazenado no Supabase Vault; chamada sem token retorna 403. Importador de expansão foi desativado após carga controlada.

## 21. Segurança, Privacidade e Antiabuso

Controles implementados: JWT na área do membro; RLS; service-role restrito ao backend; CORS allowlist; CSP/headers na Hostinger; rate limiting persistente; SSRF protection (DNS A/AAAA + private IP block + redirect constraints); webhook Stripe assinado; secrets em Vault; idempotência financeira; grants anônimos revogados das RPCs GCL/SAC sensíveis.

Pendência de go-live: habilitar **Leaked Password Protection** no Supabase Auth. Antes de clientes enterprise: MFA, audit log administrativo, role governance, DPA, retenção, export/delete, security page e plano SOC 2.

LGPD/GDPR: coletar apenas dados necessários; explicitar finalidade; suportar consentimento, exportação e exclusão; first-party integrations devem ter escopos mínimos e revogáveis.

## 22. Pagamentos, Billing e Entitlements

Stripe está conectado em **test mode**. Produtos/prices/Payment Links e webhook estão homologados, mas checkout público deve permanecer fechado até replicar tudo em `livemode`.

Webhook: assinatura verificada, ledger idempotente, purchases, memberships, subscription lifecycle, `past_due`, cancelamento, invoice failure/success. Canário confirmou replay = 1 event / 1 purchase / 1 scan.

Ranking/Community são recorrentes; Awards e Raio-X são one-time; Complete combina entrada + recorrência. Upgrade/downgrade/cancelamento devem futuramente usar Customer Portal live.

Nunca interpretar `gcl_public_health().payments.operational=true` como “cartões reais habilitados”; significa que a infraestrutura de pagamento está saudável.

## 23. E-mail e Lifecycle Messaging

Resend está conectado, porém sem domínio verificado. **BLOQUEADO GO-LIVE** para e-mail transacional até validar domínio de envio (ex.: `mail.plutyx.com`).

Eventos necessários: pagamento confirmado, análise iniciada, análise concluída, claim de domínio, membership ativa, payment failed, cancellation, rank movement, nominee, award, novo comentário/reply, Hot Seat selecionado.

E-mails devem usar idempotência/dedupe e preference center para comunicações não transacionais.

## 24. CI/CD, Hosting e Ambientes

Frontend:
- CI dedicado: `.github/workflows/gcl-ranking-ci.yml`.
- Build Hostinger: workflow `ranking-conversao.yml`.
- Deployer: Render `plutyx-hostinger-ranking-site-deployer`, branch `convrank-hostinger-front`, SFTP para `public_html/ranking-site`.
- Rotas críticas devem retornar HTTP 200 após promoção.

Ambientes recomendados para evolução: local → preview/staging → production. Nunca testar migrations destrutivas diretamente em produção sem branch/backup quando houver risco de dados.

Secrets não entram no GitHub, DOCX, README ou frontend.

## 25. Observabilidade e SLOs

Health deve cobrir: análise queue, jobs stale, PageSpeed, browser snapshots, current probes, webhook failures, payment states, cron, ranking cache, edge availability e Hostinger.

Gates iniciais:
- fila warning > 300s;
- critical > 900s;
- processing stale > 600s;
- ranking cache stale > 300s;
- webhook failure > 0 requer investigação;
- deploy só é aceito após CI + Hostinger smoke.

Snapshot deste documento: health = **healthy**, fila principal = **0**.

## 26. Testes e QA Obrigatórios

**E2E visitante:** Home → URL → qualify → paywall; nenhuma análise profunda antes do pagamento.  
**E2E comprador:** pagamento sandbox/live → webhook → scan → report.  
**E2E member:** login → reconcile → dashboard → claim → subscription → entitlement.  
**Community:** post, reação, troca de reação, comentário, reply, save, follow, notification, points, outsider blocked, self-action blocked.  
**Awards:** purchase → verified domain → submit → nominee → vote → self-vote blocked → jury.  
**Security:** invalid webhook signature, rate limits, SSRF targets, direct RPC exposure, CORS, auth expiry.  
**Data correctness:** evidence precedence, coverage gating, no fabricated metrics.  
**Cross-device:** Chrome/Safari/Firefox + iOS/Android responsive.  
**Load:** concurrent qualify, concurrent full scans, feeds, leaderboard, payments and cache under pressure.

Todo bug achado em canário deve gerar regression test quando razoável.

## 27. Requisitos para Atender Grandes Players Globais

**ROADMAP enterprise prioritário:**
- Organization/workspace multi-seat.
- RBAC: owner/admin/analyst/marketer/developer/agency/viewer/judge/moderator.
- SSO/SAML + SCIM.
- Portfolio de domínios e bulk onboarding.
- Auditorias agendadas e diff visual/métrico.
- Deep crawl configurável (10/100/1.000+ páginas) com orçamento de compute.
- API pública/enterprise com keys, quotas e webhooks.
- Export PDF/CSV/JSON e share links privados.
- Private benchmark e benchmark por vertical/geografia/funnel type.
- GA4, Clarity, Search Console, Stripe/Shopify/HubSpot, VWO/Optimizely e data warehouse connectors.
- Private Community/teams para empresas.
- SLA/priority queue, data retention policy e region options.
- DPA, subprocessors page, security center e roadmap SOC 2/ISO 27001.
- Multi-language PT/EN/ES e multi-currency/tax.
- Invoice/contract billing para enterprise.

## 28. UX/Branding — Critérios de Qualidade

A plataforma precisa impressionar CMO/CRO/founders sofisticados. Direção: editorial premium, forte typographic hierarchy, density quando é dado, whitespace quando é narrativa, microinterações discretas, zero “template genérico de SaaS”.

O relatório deve parecer ferramenta de inteligência, não PDF de agência: score + confidence + coverage + provenance + benchmark + issues priorizados + impacto potencial + Market + reauditoria.

Awwwards é referência de ritual, nominee e prestige; Semrush de densidade e dashboards; Circle/Skool de comunidade; GCL deve ter identidade própria baseada em league/labs/evidence.

## 29. Requisitos de Dados e Modelo

Entidades centrais: domains, audit_runs, pages, metric_registry, metric_observations, atomic_checks, atomic_evaluations, experience_dimension_scores, benchmark_sources/targets/results, autonomous_ranking_entries/history, commercial_products, analysis_checkout_intents, checkout_intents, purchases, memberships, payment_provider_events, profiles, domain_members/claims, community spaces/posts/comments/reactions/follows/saves/views/notifications, experiments, case_studies, projects, hot_seats, awards entries/votes/jury scores, market listings, blog, ops health.

Toda tabela nova deve definir ownership, RLS, grants, índices, retenção e estratégia de deleção antes de ser considerada pronta.

## 30. Estados e Máquinas de Estado

**Analysis intent:** prepared → paid → scan_queued → scan_started/completed ou failed/expired conforme implementação.  
**Audit:** queued → processing → completed/failed.  
**Membership:** active → past_due → canceled/expired; entitlement acompanha estado.  
**Domain claim:** prepared → verified ou failed/expired.  
**Awards entry:** draft/submitted → nominee/eligible → voting/judging → awarded/not_awarded/withdrawn conforme evolução.  
**Benchmark target:** queued → processing → completed/failed/skipped.

Mudanças de estado financeiras devem ser idempotentes e auditáveis.

## 31. P0 — Bloqueadores para Go-Live Comercial

1. Conectar Stripe `livemode`, replicar produtos/prices/webhook e executar compra real de baixo valor + refund/cancel lifecycle.
2. Habilitar Leaked Password Protection e revisar políticas Auth/MFA.
3. Verificar domínio Resend e ligar e-mails transacionais.
4. Completar E2E visual em browsers/dispositivos reais.
5. Stress/load test e orçamento/capacity plan para workers.
6. Publicar termos, privacidade, cookies, refund/cancellation e regras do Awards.
7. Moderation/abuse/reporting para Community e Awards.
8. Backups/runbook/incident response e owners operacionais.
9. Revisão jurídica da linguagem “conversion”, Awards, benchmarks e claims.
10. Validar acessibilidade da própria GCL.

## 32. P1 — Produto para Crescimento

- Scheduled re-audit + alertas de rank delta.
- Benchmarks por vertical/país/arquétipo.
- Connectors first-party (GA4/Clarity/Search Console/commerce).
- Cases verificados exibidos no Market/profile.
- Hot Seats/Event rooms.
- Swipe Vault e templates.
- Referral/affiliate apenas se não contaminar score.
- Public profile de especialistas e marketplace de jobs.
- Share cards e badges verificáveis com URL pública de validação.

## 33. P2 — Enterprise e Defensabilidade

- Enterprise orgs/RBAC/SSO/SCIM.
- API e warehouse exports.
- Deep crawl enterprise.
- Private competitions e internal awards.
- Statistical benchmarking e percentile por cluster.
- Research datasets anonimizados do GCL Labs.
- Anti-gaming/anomaly detection de Awards/Community.
- SOC 2/ISO roadmap e security reviews independentes.
- Global billing/tax/localization.

## 34. Definition of Done — Feature

Uma feature só é “Done” quando:
- requisito funcional e estados estão definidos;
- happy path e principais negative paths passam;
- auth/RLS/grants foram revisados;
- idempotência existe quando aplicável;
- observabilidade/erro útil existe;
- CI passa;
- produção/staging foi smoke-tested;
- copy não faz claim acima da evidência;
- documentação/PRD/changelog foi atualizada;
- rollback está definido para mudanças de risco.

## 35. Definition of Ready — Plataforma para Leads Reais

Para declarar “pronta para tráfego pago”, todos os P0 de go-live devem estar concluídos. Enquanto Stripe estiver em test mode ou e-mail sem domínio verificado, a plataforma pode ser publicamente testada, mas não deve ser anunciada como checkout comercial integral.

## 36. Runbook Operacional Resumido

**Se scan travar:** checar `gcl_public_health`, audit queue, stale jobs, workers Render, PageSpeed/current probes e cron.  
**Se pagamento não liberar:** verificar Stripe event → assinatura → payment_provider_events → purchase → membership/analysis intent; nunca reenfileirar manualmente antes de conferir idempotência.  
**Se ranking não atualizar:** checar autonomous ranking refresh e public payload cache.  
**Se Community falhar:** validar JWT, membership, rate limit e RPC grants.  
**Se deploy falhar:** manter versão anterior; CI dedicado + build Hostinger + SFTP + smoke HTTP são gates separados.  
**Se claim metodológica mudar:** atualizar código, GCL Labs e este PRD no mesmo release.

## 37. Governança do Código e Handoff

Branch/paths devem ser identificados no início de cada tarefa. Evitar misturar mudanças do GCL com o produto Cozinha360 que vive no mesmo repositório/Supabase.

Migrations precisam de nomes semânticos e nunca devem “consertar” schemas legados não relacionados durante uma feature GCL.

Decisões metodológicas precisam de ADR/changelog. Alterar threshold, evidence precedence, eligibility ou ranking exige versão de metodologia e backfill/recompute controlado.

Nenhum programador deve substituir valores reais por mocks em produção para “preencher dashboard”.

## 38. Glossário

**SAC:** motor Sites de Alta Conversão.  
**GCL:** Global Conversion League.  
**Evidence OS:** camada que materializa métricas/evidências e aplica precedência.  
**Atomic check:** verificação granular com status/evidência.  
**Coverage:** proporção de checks/métricas elegíveis realmente observados.  
**Confidence:** confiança ponderada da evidência.  
**Official Score:** score liberado somente após gates de cobertura.  
**RUM:** Real User Monitoring.  
**CrUX:** Chrome UX Report.  
**Nominee:** candidatura elegível/publicada no Awards.  
**Entitlement:** direito de acesso derivado de compra/membership.

## Apêndice A — Rotas de Produção

| Superfície | URL | Acesso |
|---|---|---|
| Home / Challenge | https://plutyx.com/ranking-site/ | Pública |
| Ranking | https://plutyx.com/ranking-site/ranking/ | Pública |
| Awards / Nominees | https://plutyx.com/ranking-site/awards/ | Pública + ações autenticadas |
| Community | https://plutyx.com/ranking-site/community/ | Conteúdo protegido por membership |
| Market / Serviços | https://plutyx.com/ranking-site/services/ | Pública; checkout/configuração por contexto |
| Blog / GCL Labs | https://plutyx.com/ranking-site/blog/ | Pública |
| Institucional | https://plutyx.com/ranking-site/about/ | Pública |
| Minha Área | https://plutyx.com/ranking-site/account/ | Autenticada |

## Apêndice B — Edge Functions Principais

Ver seção 19. O ambiente é a fonte de verdade para versão e configuração ativa de cada função.

## Apêndice C — Status Atual e Dependências

**Snapshot:** 09/09/2026 — rodada de produção/handoff.  
Health: `healthy`. Fila principal: 0. Market listings: 10.  
Métricas e benchmark são dinâmicos; consultar API/DB para números atuais antes de apresentação externa.

## Changelog

- **1.0.0 — 09/09/2026:** baseline de produção/handoff criado; inclui arquitetura GCL, SAC Evidence OS, Community social, Awards, Revenue Architecture, billing sandbox, segurança, benchmark estrito e gates de go-live.
