# Simulação de cliente — método de teste

Este documento registra feedback derivado de jornadas automatizadas no próprio produto. Não é prova social nem depoimento de cliente real.

Personas de teste:
- Dona de dark kitchen caseira: precisa cadastrar custo, produto, receita, venda e saber o que produzir amanhã.
- Membro de produção: precisa ver pedidos e lote sem enxergar/configurar tudo que só o owner deveria alterar.
- Membro financeiro: precisa ver contribuição, compras e perdas sem depender de planilha externa.

Critérios:
1. cadastro e login sem intervenção manual;
2. isolamento entre negócios;
3. personalização salva por membro, não globalmente;
4. venda por produto alimenta demanda;
5. conclusão de pedido não pode consumir estoque duas vezes;
6. estoque abaixo do mínimo vira alerta simples;
7. previsão deve assumir incerteza quando há poucos dados;
8. financeiro deve separar receita de contribuição;
9. telas principais devem funcionar em celular;
10. nenhum cálculo operacional depende de chamada paga de IA.

As iterações aprovadas só são integradas à `main` depois de CI em PostgreSQL no modo de produção.
