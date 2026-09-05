# Release checklist v0.6

- [ ] migration 000002 aplica em PostgreSQL vazio e após 000001
- [ ] backend unit/API tests verdes
- [ ] frontend typecheck/build verdes
- [ ] production-mode PostgreSQL tests verdes
- [ ] simulação owner + produção + financeiro verde
- [ ] baixa de estoque idempotente ao concluir pedido
- [ ] tenant isolation cobrindo novas rotas
- [ ] preferências individuais persistem por membership
- [ ] demanda sem dados retorna confiança baixa, sem inventar previsão
- [ ] financeiro separa receita, custo variável, contribuição, perdas e compras
- [ ] documentação de rollback/migration atualizada
- [ ] deploy público continua bloqueado sem provedor persistente e smoke test pós-deploy
