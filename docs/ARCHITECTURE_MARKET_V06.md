# Arquitetura alvo — market v0.6

Camadas:
- React/Vite/PWA: workspace personalizado, KDS, produção, custos, produtos, financeiro e equipe.
- FastAPI: autenticação própria, autorização multi-tenant, regras de negócio, auditoria e API.
- PostgreSQL: fonte de verdade; migrations versionadas.
- GitHub Actions: backend, frontend e PostgreSQL em `ENVIRONMENT=production` como gates obrigatórios.

Entidades novas desta etapa:
- `order_items`: produto/quantidade/preço/custo por pedido.
- `production_batches`: plano e execução de produção por produto e responsável.
- estoque no ingrediente: disponível, mínimo e alvo de reposição.
- preferências individuais expandidas em `memberships.preferences_json`.

Regras críticas:
- consumo teórico de ingredientes ocorre uma única vez quando pedido chega a `completed`;
- idempotência de pedido continua preservada;
- previsão de demanda usa somente dados do próprio negócio e retorna confiança;
- membros nunca acessam dados de outro negócio;
- preferências visuais não elevam permissões;
- cálculos financeiros usam centavos inteiros.
