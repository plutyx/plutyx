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

## 4. CI / prova de release

Após a correção da migração v88:

- `gcl-ranking-ci`: green;
- `gcl-production-proof`: green;
- build inclui o regression gate de Stripe live staging/fail-closed.

Cross-browser CI continua sendo evidência complementar, não substituto de teste físico iOS/Android.

## 5. Incident ownership

O controle externo `incident_ownership` foi formalmente verificado com validade limitada.

Evidência versionada:

`ranking-conversao/docs/GCL_INCIDENT_RUNBOOK_v1.md`

O runbook define Incident Commander, SEV-1/2/3, checkout kill switch, cadeia de evidência Stripe → webhook → ledger → entitlement, resposta de worker/security, rollback, critérios de encerramento e regra de reabertura comercial.

A existência do runbook não atesta os demais controles externos.

## 6. Readiness externo atual

`incident_ownership` deixou de ser blocker. Permanecem cinco controles externos não verificados:

1. `auth_leaked_password_protection` — Leaked Password Protection ainda precisa ser habilitado/atestado no Supabase Auth.
2. `transactional_email_domain` — `mail.plutyx.com` ainda não está verificado no Resend; DKIM/SPF/MX precisam estar corretos no DNS.
3. `real_device_e2e` — CI emula múltiplos engines/devices, mas falta evidência em dispositivos físicos/device farm equivalente.
4. `heavy_worker_capacity` — single-worker/canary saudável não constitui capacity/load attestation para volume pago.
5. `legal_review` — revisão jurídica humana/externa de claims, termos, Awards e benchmark continua obrigatória.

Nenhum desses controles deve ser marcado `verified` sem evidência independente e fresca.

## 7. Atualização do P0 de billing

Substituir a leitura antiga “replicar tudo em livemode” por:

**PARCIALMENTE CONCLUÍDO / CHECKOUT AINDA BLOQUEADO:** produtos/preços live e webhook live assinado já existem; registry live está staged/paused e protegido por gates fail-closed. Ainda faltam a ativação comercial intencional, checkout live, canário real de baixo valor e validação de refund/cancel/subscription lifecycle antes de tráfego pago.

## 8. Regra de go-live

A plataforma **não** está autorizada a cobrar clientes reais apenas porque o catálogo live existe. Antes de abrir checkout público:

- todos os P0 aplicáveis precisam estar concluídos;
- `commercial_ready` deve refletir controles internos + externos frescos;
- release de billing deve ser explícito e auditável;
- executar compra real controlada de baixo valor, conferir webhook/ledger/entitlement/scan, depois refund; para recorrência, conferir create/update/payment failure/cancel lifecycle em canário apropriado;
- somente após o canário verde promover links/sessões live para o frontend.

## 9. Segurança de credenciais

Secrets nunca entram no GitHub, PRD, README, frontend ou evidências. Credenciais compartilhadas em arquivos/chat devem ser tratadas como material sensível e rotacionadas quando houver risco de exposição.
