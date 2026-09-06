# Forgecon

Site estático no GitHub Pages e API em Cloudflare Workers com D1. O catálogo,
autenticação e as configurações existentes são preservados.

## Desenvolvimento e validação

```sh
npm ci
npm test
python3 -m http.server 3000
npx playwright test
npm run check:worker
```

Os testes de navegador usam Chrome no macOS e simulam a API. Os testes do servidor
executam as consultas SQL em SQLite, sem acessar dados ou enviar e-mails reais.
Para executar a API localmente: aplique `worker/schema.sql` com Wrangler D1,
aplique as migrações locais e execute `npm run dev:api`.

## Publicação

1. Aplique a migração aditiva antes de publicar a API:
   `npx wrangler d1 migrations apply forgecon-db --remote`.
2. Publique a API: `npx wrangler deploy`.
3. Publique o site pelo branch `main`, configurado no GitHub Pages.

Os segredos `RESEND_API_KEY` e `MELHOR_ENVIO_TOKEN` permanecem no Worker.
`ORIGIN_CEP` continua em `wrangler.toml`. O cálculo consulta exclusivamente os
serviços 1 e 2 do Melhor Envio: PAC e SEDEX dos Correios. O resultado também é
filtrado no servidor e no navegador.

Rollback: reverta a versão do Worker e o commit do site, mantendo as tabelas novas.
Não remova dados de orçamentos, respostas ou pagamentos em um rollback.
As migrações não alteram nem removem produtos, usuários ou contatos existentes.

## Orçamentos e aceite

“Salvar orçamento e baixar PDF” grava uma versão imutável, com os itens e valores
calculados pelo servidor. Repetir a mesma publicação não duplica o orçamento.
O PDF contém um link privado para `/proposta/#TOKEN`. Quem possui o link pode
consultar o documento: não o publique em redes sociais ou páginas abertas.

O cliente confirma seu e-mail com um código enviado pelo Resend e pode aprovar,
recusar ou solicitar ajustes. O código expira em dez minutos, permite até cinco
tentativas e pode ser reenviado a cada dois minutos. A aprovação exige concordância
explícita. Só a primeira resposta é registrada, inclusive com solicitações concorrentes.

O aceite registra nome, e-mail confirmado, horário do servidor, IP informado pela
Cloudflare, navegador e código de aceite. O hash SHA-256 do orçamento é calculado
sobre o JSON UTF-8 imutável armazenado em `quotes.document`. O hash do registro é
SHA-256 de `document_hash + "\n" + response`, usando a string JSON armazenada em
`quotes.response`. São hashes dos dados, não dos bytes do PDF. O botão de
verificação recalcula os hashes. Isso fornece registro de integridade e controle
do e-mail; não é assinatura digital certificada nem comprovação de identidade civil.

A cópia da resposta, com PDF completo anexado, é enviada pelo Resend. Falhas não
desfazem o aceite: ficam visíveis no painel. O Worker tenta novamente a cada dez
minutos, com controle de concorrência, intervalo crescente e chave de idempotência
do Resend. Há também uma ação para repetir um envio pendente no painel.

Uma revisão preserva o documento e a resposta anteriores, cria novo link e encerra
o link antigo para novas respostas. Orçamentos já aprovados não podem ser reescritos.
O PDF comporta múltiplas páginas e não corta itens ou observações para caber em uma folha.

## Indicadores e pedidos

- Valor aprovado: aceites no período, excluindo pedidos com produção cancelada.
- Recebido: pagamentos efetivamente registrados no painel, por data de registro.
- Saldo a receber: total dos pedidos aprovados e ativos menos seus recebimentos.
- Ticket médio: valor aprovado dividido pela quantidade de orçamentos aprovados.
- Orçamentos: agrupados pela data de emissão e situação da proposta.
- Produção: a iniciar, em produção, pronto, enviado, entregue/retirado ou cancelado.

Pagamentos parciais são registros independentes e não podem exceder o saldo.
Cancelar a produção não apaga nem estorna recebimentos. Esta versão não efetua
cobrança automática, conciliação bancária, emissão fiscal ou estornos. A data do
recebimento é a data em que o administrador o registra.

Pedidos iniciados por WhatsApp precisam ser cadastrados como orçamento no painel
para aparecer nos indicadores. O formulário público abre a mensagem preenchida;
o cliente precisa enviá-la no WhatsApp para que o atendimento a receba.

## Categorias e retirada

Categorias podem ser criadas e renomeadas no painel. O identificador permanece
estável para não quebrar produtos, imagens ou filtros. Exclusão é bloqueada quando
há produtos vinculados, inclusive produtos desativados.

Retirada é uma opção para todo o carrinho, para solicitações públicas e para os
orçamentos. Zera o frete, dispensa CEP/endereço no carrinho e limpa cotações antigas.
Endereço e horário de retirada são combinados no atendimento e podem ser registrados
nas condições do orçamento. Na OS, valores unitários são arredondados para centavos;
o total é sempre a quantidade multiplicada por esse valor unitário.
