# GCL PRD — Delta normativo v1.0.9 · 13/09/2026

> Este delta corrige o snapshot de billing/operations do `GCL_PRD.md` v1.0.8 enquanto a consolidação editorial integral do PRD não é promovida. Em caso de conflito apenas sobre os itens explicitamente abaixo, este delta representa o estado mais recente comprovado do ambiente.

## 1. Stripe / Billing — estado atual

O Stripe da operação MyAds já contém em **livemode** os seis produtos/preços comerciais da GCL, com os mesmos `product_code` do catálogo homologado:

| Product code | Cobrança | Valor |
|---|---|---:|
| `sac_analysis_2026` | one-time | R$ 97 |
| `sac_ranking_monthly` | mensal | R$ 59/mês |
| `sac_community_monthly` | mensal | R$ 39/mês |
| `sac_ranking_community_monthly` | mensal | R$ 79/mês |
| `sac_awards_entry_2026` | one-time | R$ 297 |
| `sac_complete_entry_2026` | one-time / entrada do bundle | R$ 349 |

Os IDs Stripe live são persistidos em `sac.commercial_provider_configs` e **não** devem ser copiados para documentação pública. O registry mantém os ambientes `test` e `live` separados por chave composta `(product_code, provider, provider_environment)`.

### Estado de exposição

- Os 6 registros Stripe live estão `paused`.
- Nenhum deles possui `provider_payment_link_id` ou `checkout_url` live público.
- O checkout comercial live permanece **fechado**.
- Criar produto/preço live **não** significa go-live comercial.
- `public.gcl_public_health().payments.live_catalog_staged=true` significa apenas que os seis pares produto/preço live foram registrados com segurança.
- `live_catalog_public_checkout_open=false` é o estado esperado até o release comercial intencional.

## 2. Webhook Stripe live

`gcl-stripe-webhook` v3 está implantado no Supabase e agora também está versionado no repositório em:

`ranking-conversao/supabase/functions/gcl-stripe-webhook/index.ts`

Contrato:

- aceita test/live conforme `event.livemode`;
- obtém o segredo correto somente server-side via Vault/RPC protegida;
- exige `Stripe-Signature` válida com tolerância temporal;
- assinatura ausente/inválida retorna HTTP 400;
- processa o evento via `gcl_process_stripe_event`;
- ledger financeiro usa idempotência por provider/event ID;
- nunca expõe segredo de assinatura no frontend ou documentação.

## 3. Correção de segurança do checkout — v88

A migração `gcl_stripe_live_registry_v88` foi aplicada em produção e adicionou gates fail-closed.

Falha encontrada pelo teste RED antes da correção: `sac_api_prepare_analysis_core` podia retornar o Payment Link **test** ao visitante público e marcar `checkout_ready=true` apesar do produto ainda não estar live. Isso não permitia uma cobrança real, mas vazava o sandbox para a experiência pública e contrariava o contrato comercial.

Estado após GREEN:

- public qualify/prepare só retorna checkout quando o produto canônico estiver `status='active'`, `provider_environment='live'` e tiver URL configurada;
- caso contrário `checkout_url=null`, `checkout_ready=false`, `next_step='payment_provider_pending'`;
- checkout autenticado live também exige `active + live + URL`;
- sandbox requer escape hatch explícito e não é projetado como checkout público;
- live provider config pode permanecer staged/paused sem abrir cobrança.

Regression gate:

`ranking-conversao/tests/stripe-live-registry-v88.test.mjs`

O teste foi incorporado ao `prebuild`, portanto falha de regressão bloqueia build/promotion.

## 4. Release financeiro global — v89

O teste RED seguinte mostrou que `live + active + URL` em um produto canônico ainda seria suficiente, sozinho, para abrir checkout. A v89 adiciona um kill switch global separado dos produtos e do Stripe:

- `sac.commercial_release_control` possui uma única chave `gcl_public_checkout`;
- estado inicial e atual: `closed`;
- clientes públicos/autenticados não têm escrita nessa tabela;
- `sac.gcl_commercial_release_is_open()` é incorporado aos contratos de checkout;
- live checkout exige simultaneamente: release global aberto + produto live + produto active + URL;
- `public.gcl_set_commercial_release_state()` só aceita mudança via `service_role`;
- tentativa de abrir exige **todos os controles externos verificados**, 6/6 produtos canônicos live/active/URL e 6/6 registros do provider live/active/URL;
- com qualquer requisito ausente, `open` falha com erro e o estado permanece `closed`;
- fechar o release continua sendo operação fail-safe.

Regression gate:

`ranking-conversao/tests/commercial-release-gate-v89.test.mjs`

O gate foi incorporado ao `prebuild`.

Prova de produção após migração:

- `public.gcl_commercial_release_status().state = closed`;
- `public_checkout_open = false`;
- `gcl_public_health().status = healthy`;
- `commercial_release_open = false`;
- tentativa de `open` com controles externos pendentes foi recusada por `external_controls_not_verified`.

## 5. CI / prova de release

Após a correção da migração v88, `gcl-ranking-ci` e `gcl-production-proof` ficaram green. A v89 adicionou um novo regression gate ao mesmo `prebuild`; seu commit é validado pelos workflows automáticos antes de promoção.

Cross-browser CI continua sendo evidência complementar, não substituto de teste físico iOS/Android.

## 6. Incident ownership

O controle externo `incident_ownership` foi formalmente verificado com validade limitada.

Evidência versionada:

`ranking-conversao/docs/GCL_INCIDENT_RUNBOOK_v1.md`

O runbook define Incident Commander, SEV-1/2/3, checkout kill switch, cadeia de evidência Stripe → webhook → ledger → entitlement, resposta de worker/security, rollback, critérios de encerramento e regra de reabertura comercial.

A existência do runbook não atesta os demais controles externos.

## 7. Readiness externo atual

`incident_ownership` deixou de ser blocker. Permanecem cinco controles externos não verificados:

1. `auth_leaked_password_protection` — Leaked Password Protection ainda precisa ser habilitado/atestado no Supabase Auth.
2. `transactional_email_domain` — `mail.plutyx.com` ainda não está verificado no Resend; DKIM/SPF/MX precisam estar corretos no DNS.
3. `real_device_e2e` — CI emula múltiplos engines/devices, mas falta evidência em dispositivos físicos/device farm equivalente.
4. `heavy_worker_capacity` — single-worker/canary saudável não constitui capacity/load attestation para volume pago.
5. `legal_review` — revisão jurídica humana/externa de claims, termos, Awards e benchmark continua obrigatória.

Nenhum desses controles deve ser marcado `verified` sem evidência independente e fresca.

## 8. Atualização do P0 de billing

Substituir a leitura antiga “replicar tudo em livemode” por:

**PARCIALMENTE CONCLUÍDO / CHECKOUT AINDA BLOQUEADO:** produtos/preços live e webhook live assinado já existem; registry live está staged/paused; v88 impede sandbox/links indevidos; v89 exige um release financeiro global explícito, atualmente `closed`. Ainda faltam checkout live/canário real de baixo valor e validação de refund/cancel/subscription lifecycle antes de tráfego pago.

## 9. Regra de go-live

A plataforma **não** está autorizada a cobrar clientes reais apenas porque o catálogo live existe. Antes de abrir checkout público:

- todos os P0 aplicáveis precisam estar concluídos;
- `commercial_ready` deve refletir controles internos + externos frescos;
- release de billing deve ser explícito e auditável;
- executar compra real controlada de baixo valor, conferir webhook/ledger/entitlement/scan, depois refund; para recorrência, conferir create/update/payment failure/cancel lifecycle em canário apropriado;
- somente após o canário verde promover links/sessões live para o frontend e executar o ato explícito de release.

## 10. Segurança de credenciais

Secrets nunca entram no GitHub, PRD, README, frontend ou evidências. Credenciais compartilhadas em arquivos/chat devem ser tratadas como material sensível e rotacionadas quando houver risco de exposição.

## 11. UX comercial — v90

A camada de comércio não deve mais comunicar que “Stripe live precisa ser conectado”, porque a infraestrutura live já está registrada e o bloqueio atual é deliberado.

Estado aprovado:

- interface informa que a infraestrutura Stripe live está preparada;
- CTA indisponível é descrito como **checkout em abertura controlada**;
- nenhum usuário é instruído a “conectar Stripe live”;
- sandbox validado permanece oculto de leads reais;
- ausência de checkout significa `release comercial fechado`, não falha de integração.

Regression gate: `ranking-conversao/tests/commercial-state-copy-v90.test.mjs`.

## 12. Prova de release e cross-browser — hardening de 13/09/2026

A experiência Research tinha uma condição de corrida de remount em Firefox: o handler de mudança de profundidade podia reter referência a um `.markdown` substituído pelo React. A correção passou a resolver o nó atual e preservar o modo desejado durante remounts.

Evidência posterior:

- matrix Chromium + Firefox + WebKit + perfis mobile: **85 expected, 0 unexpected, 0 flaky, 0 skipped**;
- isso permanece evidência de engine/emulação e **não** satisfaz `real_device_e2e`.

O pipeline de produção também foi endurecido em dois pontos:

1. o `gcl-production-proof` passou a interpretar `autosync.phase`, `autosync.ok` e erro sanitizado, em vez de tratar HTTP 200 do control-plane como prova de deploy;
2. `Ranking Site Hostinger Build` e `gcl-production-proof` foram acoplados para disparar com o mesmo source SHA quando qualquer um dos workflows muda, impedindo proofs de um SHA para o qual nenhum bundle foi gerado.

Última prova completa anterior a esta atualização documental: source SHA `b40695fb0b53f55b0861409f99c61abec2cfb385`, com provenance Hostinger, rotas públicas e canário real do GCL AI Analyst verdes.

## 13. Superfície SECURITY DEFINER — v92 e v93

O Security Advisor identificou helpers administrativos/operacionais `SECURITY DEFINER` executáveis diretamente por clientes autenticados. A revisão distinguiu funções de produto intencionais de helpers internos.

### v92

Execução direta por `anon`/`authenticated` foi revogada para:

- `public.gcl_commercial_release_status()`;
- `public.gcl_external_control_readiness()`.

Somente `service_role` mantém `EXECUTE` direto. Superfícies agregadas/trusted continuam consumindo os helpers internamente.

Migration versionada:

`ranking-conversao/supabase/migrations/20260913153400_gcl_security_definer_surface_v92.sql`

### v93

Execução direta por `anon`/`authenticated` também foi revogada para:

- `public.gcl_scan_queue_health()`;
- `public.gcl_worker_capacity_health()`.

Dependências verificadas antes da mudança mostram que esses helpers são consumidos por funções `SECURITY DEFINER` trusted/service-role ou pelo health agregado. Após o hardening, `public.gcl_public_health()` continuou saudável para sua superfície autorizada.

Migration versionada:

`ranking-conversao/supabase/migrations/20260913153600_gcl_internal_health_surface_v93.sql`

O warning do Advisor caiu de 53 para 51 funções autenticadas. Os 51 casos restantes **não devem ser revogados em massa**: revisão estrutural mostrou `search_path` fixado em 51/51, e as funções mutantes identificadas possuem guard aparente de identidade/acesso. Funções como moderação, vendas e júri usam autorização interna específica e dependem do role `authenticated` para usuários legítimos.

## 14. Guard financeiro pós-hardening

Após v92/v93 foi executada auditoria read-only do ledger/provider events:

- `commercial_release_open=false`;
- 0 eventos Stripe live registrados;
- 0 eventos Stripe live nas últimas 24h;
- 0 falhas de processamento live;
- 1 evento Stripe test registrado.

Portanto, o hardening de segurança não abriu cobrança nem fulfillment live por efeito colateral.

A próxima evolução desejada para billing continua sendo um **gate técnico de canário live** com evidência separada de one-time e subscription, validade temporal e exigência explícita antes de `commercial_release=open`. Essa evolução não está implementada enquanto o ambiente permanecer fail-closed.
