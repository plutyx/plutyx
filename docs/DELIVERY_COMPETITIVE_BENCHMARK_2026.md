# Cozinha 360 Delivery — benchmark competitivo 2026

Data da análise: 2026-09-06. Fontes públicas oficiais dos fornecedores, sem copiar código, identidade visual ou conteúdo proprietário. O objetivo é modelar capacidades de mercado em arquitetura própria do Cozinha 360.

## Resumo executivo

O mercado brasileiro de software para delivery/restaurante está concentrado em quatro propostas:

1. **ERP/POS completo**: Saipos e Consumer vendem operação + estoque + financeiro + fiscal + integrações.
2. **Automação de venda/conversa**: Anota AI enfatiza WhatsApp/Instagram/Facebook, recuperação e cardápio.
3. **Sistema cloud modular e dark kitchen**: Takeat enfatiza multi-marca, KDS, delivery próprio, CRM e precificação.
4. **Logística como módulo**: Consumer e Saipos tratam roteirização, app do entregador e rastreamento como recursos próprios ou adicionais.

A oportunidade do Cozinha 360 é não virar um ERP pesado: manter o núcleo de margem/contribuição e operação simples, mas cobrir os fluxos que o dono realmente precisa — canal próprio, multi-marca, KDS, despacho, CRM por marca, agendamento, zonas/taxas, automações e integrações oficiais — com transparência sobre módulos que dependem de terceiros.

## Concorrentes e preços públicos

| Concorrente | Preço público observado | Modelo | Destaques relevantes |
|---|---:|---|---|
| Consumer | Essencial R$59,90/mês; Profissional R$179,90/mês; Alta Performance R$269,90/mês | assinatura por pacote | PDV, cardápio próprio, iFood/99Food/Keeta, Smart Delivery, app entregador, mapa/rastreio, WhatsApp Bot, fiscal, fidelidade |
| Saipos | a partir de R$240,79/mês | assinatura + módulos/recursos | financeiro/DRE, CMV, estoque/ficha técnica, KDS, +100 integrações, iFood, site delivery, roteirização; roteador de R$0 a R$199,90/mês conforme volume |
| Anota AI | oferta anual 12x R$99,99; página funcional também mostra Start R$279,99/mês e Gestão avançada R$399,99/mês | assinatura; campanhas/ofertas variam | robô multicanal, cardápio, PDV, garçom, pagamento, cupons/cashback, recuperador, agendamento, entregadores; KDS/estoque/fiscal/financeiro no avançado |
| Takeat | a partir de R$223/mês; anual com 20% de desconto | assinatura modular | multi-marca/dark kitchen, KDS por estação e marca, iFood/99Food/Keeta, CRM por marca, delivery próprio, cashback, rastreio, precificação dinâmica, financeiro/DRE |

### Fontes oficiais

- Takeat dark kitchen: https://www.takeat.app/para/dark-kitchen
- Takeat planos: https://www.takeat.app/planos
- Takeat soluções: https://takeat.app/solucoes
- Consumer delivery: https://consumer.com.br/sistema-pedidos-delivery
- Consumer preços: https://loja.consumer.com.br/
- Consumer Smart Delivery: https://consumer.com.br/smart-delivery/
- Consumer Bot WhatsApp: https://consumer.com.br/bot-whatsapp
- Saipos delivery: https://saipos.com/sistema/delivery
- Saipos planos: https://saipos.com/planos-e-precos
- Saipos entregador/roteirização: https://saipos.com/sistema/saipos-entregador
- Anota AI: https://lp.anota.ai/
- Anota AI contratação: https://pagamento.anota.ai/register?self_source=LP_SELF_CHECKOUT
- Anota AI funcionalidades: https://anota.ai/home/

## Matriz de capacidades

Legenda: `✓` = anunciado publicamente; `~` = depende de plano/módulo; `—` = não foi identificado na análise pública.

| Capacidade | Consumer | Saipos | Anota AI | Takeat | Cozinha 360 alvo |
|---|:---:|:---:|:---:|:---:|:---:|
| Canal próprio sem comissão do software | ✓ | ✓ | ✓ | ✓ | ✓ |
| Centralização marketplace | ✓ | ✓ | ✓ | ✓ | ✓ via conectores oficiais |
| iFood | ✓ | ✓ | ✓ | ✓ | ✓ conector preparado |
| 99Food | ✓ | ~ | — | ✓ | arquitetura pronta; só marcar ativo após credencial/API real |
| Keeta | ✓ | ✓ | — | ✓ | arquitetura pronta |
| KDS | ✓ | ✓ | ~ | ✓ | ✓ existente; reforçar marca/estação/SLA |
| Multi-marca dark kitchen | ~ | multi-loja/multi culinária | — | ✓ forte | ✓ prioridade central |
| CRM/fidelidade | ✓ | ✓ | ✓ | ✓ | ✓, com isolamento por marca |
| Cupons/cashback | ✓ | ~ | ✓ | ✓ | ✓ |
| Recuperação automática | campanhas/bot | CRM | ✓ forte | automação WhatsApp | ✓ via regras + consentimento + provedor conectado |
| Agendamento de pedidos | ~ | ~ | ✓ | ~ | ✓ |
| Zonas/taxas por bairro/CEP/raio | ✓ | ✓ | ~ | ✓ | ✓ |
| App/gestão de entregador | ✓ | ✓ | cadastro | rastreio | ✓ PWA/portal progressivo |
| Agrupamento/roteirização | ✓ forte | ✓ forte | — | ✓ | ✓ provider-neutral; sem falsa promessa de GPS sem API |
| Rastreamento cliente | ✓ | ~ | — | ✓ | ✓ somente quando localização/provider estiver ativo |
| Acerto de entregadores | ✓/fechamento | ✓ | — | ~ | ✓ ledger próprio |
| Estoque/ficha técnica/CMV | ✓ | ✓ forte | avançado | ✓ | ✓ núcleo já existente |
| Margem por canal | relatórios | ✓ | ~ | ✓ | ✓ diferencial: contribuição por pedido/canal |
| DRE/financeiro | ✓ | ✓ forte | avançado | ✓ | ✓ módulos existentes, evoluir sem duplicar ERP |
| WhatsApp/IA | ✓ | integrações | ✓ forte | ✓ | ✓ conector + automação; custo do provedor separado |
| Fiscal | ✓ | ✓ | avançado | ~ | apenas por provedor fiscal validado; não prometer automação universal |
| Autoatendimento/mesa | ✓ | ✓ | ✓ | ✓ | posterior; não é prioridade do Delivery v40 |

## Estratégia de preço proposta para o Cozinha 360

A estratégia é entrar abaixo dos pacotes completos, mas evitar subsidiar APIs variáveis. Mensalidade do software não inclui taxas de gateway, WhatsApp, marketplaces, mapas, fiscal ou logística de terceiros.

| Plano | Mensal | Anual sugerido | Escopo recomendado |
|---|---:|---:|---|
| Free | R$0 | R$0 | 1 marca, até 50 pedidos online/mês, pedido manual, loja direta básica, 1 zona e 1 entregador |
| Start | R$49,90 | R$499/ano | 1 marca, pedidos ilimitados no software, KDS, estoque/custos, loja própria, zonas, entregadores, CRM básico, cupons |
| Pro | R$99,90 | R$999/ano | até 3 marcas, CRM por marca, fidelidade/cashback, agendamento, despacho, relatórios por canal/marca, integrações oficiais, automações condicionais |
| 360 | R$199,90 | R$1.999/ano | até 10 marcas, dark kitchen consolidada, Autopilot, analytics avançado, API/webhooks, roteamento provider-neutral, controles e auditoria avançados |

O desconto anual fica próximo de dois meses gratuitos. Isso posiciona o Start abaixo do Consumer Essencial e o plano 360 abaixo dos pontos de entrada públicos de Takeat/Saipos e do pacote mensal avançado da Anota AI, sem prometer suporte humano ou APIs pagas que ainda não estejam financiadas.

## Arquitetura de produto adotada

### 1. Multi-marca de verdade

- marca em produto, pedido, storefront, zona, CRM e relatório;
- KDS identifica marca e estação;
- cliente pode existir no negócio, mas consentimento e relacionamento de marketing são separados por marca;
- visão consolidada sem misturar métricas da marca individual.

### 2. Delivery próprio com quote antes do checkout

- endereço, bairro/CEP, zona, taxa, pedido mínimo e ETA;
- cupom e fidelidade aplicados de modo auditável;
- agendamento opcional;
- gateway é desacoplado do pedido.

### 3. Despacho e logística progressivos

- nível 1: zona + entregador + status + SLA;
- nível 2: agrupamento manual/inteligente de entregas por zona;
- nível 3: rota otimizada por provider oficial conectado;
- nível 4: localização/rastreamento em tempo real quando cliente/entregador autorizarem.

Sem provider de mapas ativo, o produto nunca deve alegar rota ótima ou rastreio em tempo real.

### 4. CRM e recompra com LGPD como limite de produto

- consentimento por marca;
- opt-out independente;
- segmentos por frequência, ticket, última compra e margem;
- campanhas só são enviadas por provedor conectado;
- recuperação de carrinho/pedido deve ser opt-in e idempotente.

### 5. Unit economics antes de "vender mais"

O diferencial do Cozinha 360 será manter a contribuição real visível em toda ação: cupom, cashback, canal, taxa de entrega, mídia e comissão. Uma promoção que aumenta faturamento e destrói contribuição deve aparecer como alerta, não como sucesso.

## Sequência de implementação

1. Endereço/agendamento/quote + taxa por zona.
2. CRM por marca e consentimento separado.
3. Ledger de entregadores e fechamento.
4. Route batches/stops provider-neutral.
5. Painel de SLA/tempo de preparo/entrega.
6. Catálogo comercial Free/Start/Pro/360 em modo observação até billing real ser validado.
7. Integrações 99Food/Keeta e mapas somente após credenciais e API oficiais.
8. Fiscal somente via parceiro/provedor validado para jurisdição aplicável.
