# Feedback de cliente simulado — v0.6

> Este documento registra uma simulação automatizada e uma revisão de produto feitas internamente. Não é depoimento, prova social nem experiência de cliente externo.

## Jornada executada

Foram simulados quatro perfis: owner, membro de produção, membro financeiro e usuário externo. O fluxo passou por cadastro, negócio, workspaces individuais, estoque/par, compras, produto/ficha técnica, pedido com item, KDS, baixa de estoque, alerta de reposição, previsão de demanda, lote de produção, financeiro e isolamento entre tenants.

## O que funcionou bem como cliente

- **Workspace por membro** reduz ruído: produção e financeiro podem abrir o mesmo negócio com telas diferentes.
- **KDS no navegador** evita comprar tela/hardware dedicado para começar.
- **Ficha técnica + estoque + pedido** conectam uma venda ao consumo teórico do ingrediente.
- **Previsão determinística** é simples de explicar e não exige API paga de IA.
- **Financeiro por contribuição** é mais útil para decisão do que um painel centrado só em faturamento.
- **Baixa idempotente** impede consumir o mesmo estoque duas vezes se a conclusão de pedido for repetida.

## Fricções encontradas

1. A inclusão direta de equipe exige que a conta do novo membro já exista e que o owner saiba o e-mail exato.
2. O logout atual remove o JWT do navegador, mas ainda não existe revogação de sessão no servidor.
3. Faltam proteção contra tentativas repetidas de senha e troca de senha com invalidação de sessões antigas.
4. Configuração de estoque no frontend usa prompts simples; funciona, mas não é experiência final de mercado.
5. O catálogo não transforma automaticamente estoque/ficha técnica em `disponível`, `baixo` ou `esgotado`.
6. Verificação de e-mail, recuperação de senha e deploy público persistente ainda dependem da etapa de infraestrutura externa.

## Decisão de iteração v0.7

Prioridades aprovadas porque reduzem custo ou risco sem criar dependência paga:

- convite por link/código compartilhável no WhatsApp, sem serviço de e-mail obrigatório;
- versão de autenticação no usuário para revogar tokens antigos;
- bloqueio temporário após repetidas falhas de login usando o próprio PostgreSQL, sem Redis obrigatório;
- disponibilidade automática de produto calculada pela ficha técnica e estoque;
- manter integrações pagas como opcionais, não como requisito do núcleo.
