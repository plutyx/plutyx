# Cozinha 360 Delivery — benchmark competitivo 2026

Data da revisão: 2026-09-06.

Fontes: páginas públicas oficiais dos fornecedores, consultadas na data acima. O objetivo é modelar capacidades de mercado em arquitetura própria do Cozinha 360, sem copiar código, interface, marca ou conteúdo proprietário.

## 1. Resumo executivo

O mercado brasileiro de software para restaurante/delivery se concentra em quatro propostas complementares:

1. **ERP/PDV completo** — Consumer e Saipos: caixa, fiscal, estoque, ficha técnica, financeiro, delivery e integrações.
2. **Automação de atendimento e venda** — Anota AI: WhatsApp, Instagram, Facebook, cardápio digital e recuperação de vendas.
3. **Cloud modular e dark kitchen multi-marca** — Takeat: múltiplas marcas, KDS, CRM, canal próprio, integrações e operação consolidada.
4. **Logística/roteirização** — Consumer e Saipos: zonas, entregadores, agrupamento de pedidos, rota e rastreamento.

A oportunidade do Cozinha 360 é combinar o que é essencial dessas quatro categorias sem virar um ERP pesado: **canal próprio + margem/contribuição + dark kitchen multi-marca + despacho + recompra**, com integrações externas ativadas apenas quando uma conexão real e válida existir.

O diferencial de decisão não é “mais relatórios”. É responder, por pedido e por canal: **quanto entrou, quanto saiu, quanto sobrou, quanto trabalho gerou e se vale repetir**.

## 2. Preços públicos verificados

| Concorrente | Preço público observado | Observação |
|---|---:|---|
| Consumer | Gratuito em ofertas verticais até 200 pedidos/mês; Essencial R$ 59,90/mês; Profissional R$ 179,90/mês; Alta Performance R$ 269,90/mês | Planos anuais; implantação anunciada como grátis em páginas comerciais. |
| Saipos | Gestão a partir de R$ 240,79/mês | A roteirização/app do entregador possui cobrança própria por volume: R$ 0/100, R$ 49,90/500, R$ 69,90/1.000, R$ 109,90/2.000 e R$ 199,90/mês ilimitado. |
| Anota AI | Oferta pública consultada: primeiro ano por 12x R$ 99,99 | Teste de 7 dias; página informa ausência de comissão por pedido. Pagamentos dentro do cardápio podem ter taxas do meio de pagamento. Não usamos no benchmark preços de outros pacotes que não estejam publicamente verificáveis nesta revisão. |
| Takeat | A partir de R$ 223/mês; anual com 20% de desconto | Sem fidelidade; suporte e implantação assistida anunciados. |

### Fontes oficiais

- Takeat dark kitchen: https://www.takeat.app/para/dark-kitchen
- Takeat planos: https://www.takeat.app/planos
- Takeat institucional: https://takeat.app/
- Consumer delivery: https://consumer.com.br/sistema-pedidos-delivery
- Consumer comparação de planos: https://loja.consumer.com.br/home/compare
- Consumer preços: https://loja.consumer.com.br/
- Saipos delivery: https://saipos.com/sistema/delivery
- Saipos planos: https://saipos.com/planos-e-precos
- Saipos Entregador/roteirização: https://saipos.com/sistema/saipos-entregador
- Anota AI planos: https://lp.anota.ai/planos/

## 3. O que cada concorrente resolve bem

### Takeat — referência em dark kitchen

Capacidades anunciadas que importam ao Cozinha 360:

- múltiplas marcas em um único painel;
- KDS com identificação por marca;
- iFood e 99Food configuráveis por marca;
- canal próprio por marca;
- relatórios individuais e consolidados;
- suporte a múltiplos CNPJs ou várias marcas no mesmo CNPJ;
- CRM/campanhas, cashback e automação por WhatsApp em módulos;
- fiscal, precificação dinâmica, multilojas e autoatendimento em módulos.

**O que copiamos como problema a resolver, não como implementação:** isolamento operacional por marca, visão consolidada e ligação explícita entre marca, canal, cliente e pedido.

### Consumer — referência de custo de entrada + logística integrada

Capacidades anunciadas:

- PDV e controle de pedidos;
- site próprio sem taxa do software por pedido;
- iFood, 99Food e WhatsApp no mesmo fluxo;
- Smart Delivery com agrupamento/rota;
- app do entregador e rastreamento em mapa;
- zonas por mapa, bairro, CEP e raio;
- pagamento online;
- cupons, pontos e cashback;
- fiscal, relatórios e recursos de salão/autoatendimento nos planos superiores.

**Lição para o Cozinha 360:** o plano gratuito/baixo custo precisa ser realmente utilizável; logística não pode ser um detalhe escondido depois da venda.

### Saipos — referência em gestão de restaurante + operação logística por volume

Capacidades anunciadas:

- financeiro e contas a pagar/receber;
- estoque, ficha técnica e CMV;
- KDS;
- integração com iFood e outros canais;
- suporte 24/7 em páginas comerciais;
- acerto de motoboys;
- app do entregador;
- roteirização com planos graduados por quantidade de pedidos.

**Lição para o Cozinha 360:** recursos caros/variáveis, como roteamento externo, devem ter quota, custo explícito ou provider separado — nunca serem subsidiados silenciosamente pela mensalidade.

### Anota AI — referência em automação comercial e omnicanal

Capacidades anunciadas:

- pedidos pelo WhatsApp;
- cardápio digital;
- recuperação de vendas;
- centralização de WhatsApp, Instagram e Facebook;
- análise de desempenho dos pratos;
- integração/relacionamento com iFood;
- pagamentos dentro do cardápio;
- ausência de comissão por pedido do software na oferta pública consultada.

**Lição para o Cozinha 360:** recompra e atendimento precisam estar no produto, mas somente usando consentimento e conectores reais; não devemos simular “IA no WhatsApp” sem provedor e credenciais válidos.

## 4. Matriz competitiva e decisão de produto

Legenda do Cozinha 360:

- **Nativo**: existe no núcleo próprio e não depende de API paga para a função básica.
- **Conector**: arquitetura existe, mas só é ativada quando o provedor/credencial foi validado.
- **Posterior**: conscientemente fora do foco atual do Delivery 360.

| Capacidade | Consumer | Saipos | Anota AI | Takeat | Cozinha 360 v4.1 |
|---|:---:|:---:|:---:|:---:|---|
| Canal próprio | ✓ | ✓ | ✓ | ✓ | **Nativo** |
| Preço calculado no servidor | ~ | ~ | ~ | ✓ | **Nativo** |
| Margem/contribuição por pedido/canal | relatórios | ✓ | ~ | ✓ | **Nativo e diferencial central** |
| Multi-marca dark kitchen | ~ | multiunidade | — | ✓ forte | **Nativo** |
| KDS por marca | ~ | ✓ | ~ | ✓ | **Nativo / evolução contínua** |
| CRM isolado por marca | ~ | ~ | ~ | ✓ | **Nativo** |
| Consentimento/opt-out por marca | ~ | ~ | ~ | ~ | **Nativo** |
| Cupom | ✓ | ~ | ✓ | ✓ | **Nativo** |
| Pontos/cashback | ✓ | ~ | ✓ | ✓ | **Nativo** |
| Pedido agendado | ~ | ~ | ✓ | ~ | **Nativo** |
| Zona por bairro | ✓ | ✓ | ~ | ✓ | **Nativo** |
| Zona por CEP | ✓ | ✓ | ~ | ✓ | **Nativo** |
| Zona por raio | ✓ | ✓ | ~ | ✓ | **Nativo**, coordenadas validadas |
| Pedido mínimo por zona | ✓ | ✓ | ~ | ✓ | **Nativo** |
| Frete grátis por valor | ✓ | ✓ | ✓ | ✓ | **Nativo** |
| Entregadores próprios | ✓ | ✓ | ✓/cadastro | ✓ | **Nativo** |
| Taxa cobrada ≠ repasse do entregador | ~ | ✓ | — | ~ | **Nativo** |
| Acerto/saldo do entregador | ✓ | ✓ | — | ~ | **Nativo** |
| Agrupamento manual de entregas | ✓ | ✓ | — | ✓ | **Nativo** |
| Otimização automática de rota | ✓ | ✓ | — | ✓ | **Conector**; bloqueada sem provider válido |
| GPS em tempo real | ✓ | ✓ | — | ✓ | **Conector**; não anunciado como ativo sem provider |
| Tracking de status | ✓ | ✓ | ~ | ✓ | **Nativo**; mapa depende de provider |
| WhatsApp automático | ✓ | integração | ✓ forte | ✓ | **Conector** |
| iFood | ✓ | ✓ | ✓/relacionamento | ✓ | **Conector** |
| 99Food | ✓ | ~ | — | ✓ | **Conector** |
| Keeta | ✓ | ~ | — | ✓ | **Conector preparado** |
| Estoque/ficha técnica/CMV | ✓ | ✓ forte | pacote/gestão | ✓ | **Núcleo Cozinha 360 existente** |
| Financeiro/DRE | ✓ | ✓ forte | gestão | ✓ | **Núcleo existente; contribuição priorizada** |
| Fiscal | ✓ | ✓ | gestão | módulo | **Conector posterior**, somente provedor fiscal validado |
| Totem/mesa/TEF | ✓ | ✓ | ✓ | ✓ | **Posterior** |

## 5. Estratégia de preço proposta para o Cozinha 360

O Cozinha 360 não deve competir prometendo que APIs variáveis são “grátis”. Mensalidade cobre o software. Gateway, WhatsApp oficial, marketplaces, mapas, emissão fiscal e operadores logísticos podem cobrar valores próprios e devem aparecer separadamente.

| Plano | Mensal | Anual sugerido | Papel na oferta |
|---|---:|---:|---|
| Free | R$ 0 | R$ 0 | 1 marca, até 50 pedidos online/mês, loja direta básica, pedido manual, 1 zona e 1 entregador. Entrada real, não demo disfarçada. |
| Start | R$ 49,90 | R$ 499 | 1 marca, loja própria, pedidos do software sem limite rígido de operação, KDS, estoque/custos, zonas, entregadores, CRM básico e cupons. |
| Pro | R$ 99,90 | R$ 999 | até 3 marcas, CRM por marca, fidelidade, agendamento, despacho, relatórios por marca/canal, integrações oficiais e automações condicionais. |
| 360 | R$ 199,90 | R$ 1.999 | até 10 marcas, operação consolidada de dark kitchen, Autopilot, analytics, API/webhooks, auditoria e roteamento provider-neutral. |

### Racional competitivo

- **Start R$ 49,90** fica abaixo do Consumer Essencial de R$ 59,90.
- **Pro R$ 99,90** encosta na oferta promocional pública da Anota AI, mas precisa ganhar por logística + multi-marca + contribuição, não por “bot mais barato”.
- **360 R$ 199,90** fica abaixo dos pontos de entrada públicos da Takeat (R$ 223) e Saipos (R$ 240,79), preservando margem porque APIs variáveis ficam desacopladas.
- O anual entrega aproximadamente dois meses de economia sem travar o produto em fidelidade técnica.

Esses preços são posicionamento comercial inicial. Antes de hard-enforcement em produção, precisam passar por validação de CAC, suporte, churn, consumo real de infraestrutura, inadimplência e custo dos conectores.

## 6. Arquitetura adotada

### 6.1 Multi-marca de verdade

- marca em produto, pedido, vitrine, zona, CRM e relatório;
- operação consolidada e visão individual por marca;
- consentimento de marketing por marca;
- canal próprio por marca;
- estrutura preparada para vínculo de integração por marca.

### 6.2 Checkout próprio com quote antes de criar o pedido

Fluxo:

1. itens e preços vêm do servidor;
2. cliente escolhe retirada ou entrega;
3. endereço determina zona válida;
4. servidor aplica pedido mínimo, frete e regra de frete grátis;
5. cupom é validado no servidor;
6. agendamento é validado pela janela permitida;
7. total final é persistido junto ao contexto do checkout;
8. pedido utiliza idempotência para impedir duplicação acidental.

O navegador nunca é autoridade de preço.

### 6.3 Logística progressiva

- **Nível 1 — nativo:** zona + taxa + entregador + status + SLA.
- **Nível 2 — nativo:** agrupamento manual de entregas e sequência de paradas.
- **Nível 3 — conector:** rota assistida/otimizada por provider oficial.
- **Nível 4 — conector:** localização e rastreamento em tempo real, mediante consentimento e provider compatível.

Sem provider ativo, o sistema não deve chamar uma sequência manual de “rota ótima”.

### 6.4 CRM/recompra com LGPD como requisito de produto

- perfil cliente × marca;
- consentimento por marca;
- opt-out independente;
- frequência, última compra, receita e contribuição por marca;
- campanhas somente por provider conectado;
- toda automação comercial deve ser auditável e idempotente.

### 6.5 Unit economics antes de crescimento

Toda promoção, cupom, cashback, taxa de entrega, comissão, mídia e canal deve convergir para uma pergunta: **a contribuição ficou melhor ou pior?**

Faturamento maior com contribuição destruída deve gerar alerta — não selo de sucesso.

## 7. Estado de implementação do Delivery 360 v4.1

### Já modelado no núcleo

- catálogo comercial Free/Start/Pro/360;
- multi-marca;
- canal próprio;
- checkout/quote de entrega;
- bairro/CEP/raio;
- taxa, pedido mínimo e frete grátis;
- cupom;
- agendamento;
- tracking de status;
- entregadores e disponibilidade;
- repasse separado da taxa do cliente;
- ledger/acerto de entregadores;
- route batches e route stops manuais;
- SLA e metas de preparo/ETA;
- CRM por marca e opt-out;
- fidelidade por pontos ou cashback;
- painel consolidado de pedidos, contribuição e logística;
- integrações representadas pelo estado real da conexão.

### Dependente de conexão externa validada

- iFood/99Food/Keeta em produção por conta/marca;
- WhatsApp oficial e mensagens de status;
- otimização de rotas;
- GPS em tempo real;
- pagamentos online por gateway;
- emissão fiscal.

### Intencionalmente posterior

- totem de autoatendimento;
- tablet de mesa;
- TEF universal;
- hardware proprietário.

## 8. Critério de paridade: não marcar checkbox falso

Uma função só pode aparecer como **ativa** para o usuário quando todas as dependências técnicas estiverem realmente configuradas. O produto distingue:

- recurso nativo disponível;
- integração preparada, mas não conectada;
- integração conectada e saudável;
- integração em erro;
- função futura.

Isso evita o padrão comum de vender “100 integrações” e entregar ao usuário uma lista de logos sem credenciais, SLA, logs ou fallback operacional.

## 9. Próximas extensões recomendadas

1. vínculo `marca × provedor × loja externa`, para iFood/99Food/Keeta por marca;
2. perfil fiscal por marca/CNPJ como cadastro estrutural, sem emitir nota até provedor fiscal validado;
3. quota de rotas ligada a consumo real do provider;
4. saúde de integração por marca, com última sincronização e erro acionável;
5. recomendação de canal baseada em contribuição, prazo de repasse, atraso, falha, esforço operacional, acesso aos dados e risco contratual;
6. experimentos de preço dos planos antes de enforcement definitivo.
