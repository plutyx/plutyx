# Cozinha 360 OS — benchmark de produto 2026

Objetivo: incorporar padrões úteis de softwares maduros de restaurante sem copiar marca, interface ou código proprietário e sem transformar o produto em um ERP pesado.

## Padrões observados

### Square for Restaurants
- Centraliza pedidos de salão/online/delivery e permite filtrar por origem/status.
- KDS com roteamento, timers e atualização em tempo real.
- Relatórios por item/menu, fechamento diário, custos e equipe.
- Estoque com alerta de baixo nível; inventário de ingrediente/receitas via MarketMan é add-on de US$99/mês por local.
- Diretório de clientes, fidelidade e marketing automatizado.
- Insights assistidos por IA estão sendo adicionados ao produto.

### Loyverse
- PDV, dashboard, KDS, estoque essencial, fidelidade e múltiplas lojas têm camada gratuita.
- Gestão de funcionários e estoque avançado são add-ons pagos.
- Padrões úteis: operação mobile, pedidos abertos, alertas de baixo estoque, produção a partir de ingredientes, relatórios e permissões.

### GloriaFood
- Referência histórica de pedido online sem mensalidade/comissão para recursos essenciais, QR code, pedido agendado, promoções, multi-local e relatórios.
- O serviço informa que foi descontinuado para novos cadastros, criando espaço para uma experiência leve de venda direta em soluções novas.

## Tradução para o Cozinha 360 OS

1. **Workspace individual por membro**: cada membro escolhe foco, ordem de módulos, widgets, densidade e módulos ocultos; permissões continuam controladas pelo papel no negócio.
2. **KDS sem hardware dedicado**: quadro de pedidos responsivo no navegador/PWA, aproveitando celular/tablet existente.
3. **Estoque de ingrediente gratuito**: estoque atual, nível mínimo, alvo de reposição, compra e alerta ficam no núcleo do produto; não dependem de add-on caro.
4. **Receita conectada à venda**: itens do pedido apontam para produtos; produto aponta para ingredientes; conclusão do pedido baixa consumo teórico uma única vez.
5. **Previsão de demanda sem custo de IA externa**: média móvel ponderada da própria venda do negócio, com sinal de confiança e recomendação de quantidade. IA generativa fica opcional, nunca necessária para cálculo.
6. **Produção planejada**: lote planejado/produzido/perdido e status, ligado ao produto e ao membro responsável.
7. **Financeiro de contribuição**: receita, custo variável, contribuição, perdas e compras no mesmo painel — sem chamar faturamento de lucro.
8. **Equipe simples**: owner/admin/member, associação por e-mail de conta existente e preferências individuais por membership.
9. **Princípio de custo**: primeiro usar PostgreSQL, navegador/PWA e cálculos determinísticos. Serviços pagos só entram quando substituem trabalho real ou risco operacional.

## Regra de produto

O Cozinha 360 OS não tenta reproduzir cada módulo de grandes POS/ERP. A prioridade é reduzir erro e custo para microoperações: poucas telas, dados conectados e uma próxima ação clara.
