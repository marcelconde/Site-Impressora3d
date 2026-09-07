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
- Produção: a iniciar, em produção, pronto, enviado, entregue/retirado, concluído ou cancelado.

Pagamentos parciais são registros independentes e não podem exceder o saldo.
Cancelar a produção não apaga nem estorna recebimentos. Esta versão não efetua
cobrança automática, conciliação bancária, emissão fiscal ou estornos. A data do
recebimento é a data em que o administrador o registra.

Pedidos iniciados por WhatsApp precisam ser cadastrados como orçamento no painel
para aparecer nos indicadores. O formulário público abre a mensagem preenchida;
o cliente precisa enviá-la no WhatsApp para que o atendimento a receba.

## Acompanhamento do cliente

O menu “Acompanhar pedido” abre `/acompanhar/`. O cliente informa o número completo
do orçamento (`ORC-AAAA-XXXXXXXX`) e o e-mail confirmado no aceite. O Resend envia
um link privado, sem cadastro ou senha. A resposta do formulário não revela se os
dados existem. Há limite de dez solicitações por IP em quinze minutos e intervalo
de dois minutos por pedido. O IP fica armazenado somente como hash, por esse prazo.

O link usa o mesmo token secreto do orçamento e tem o mesmo caráter de acesso
privado: quem possui o link pode consultar o pedido e o documento. Não expira
automaticamente; não deve ser compartilhado publicamente. A consulta inclui etapas,
itens, pagamentos, saldo, recebimento e rastreio, mas não notas financeiras internas,
cálculos de custo, identidade do administrador ou dados técnicos do aceite.

No painel, marque produção, pronto para retirada/envio, entregue/retirado e
“Pedido concluído”. Para entrega, a etapa “Enviado” exige o código dos Correios
(duas letras, nove números e BR). O código pode ser corrigido depois da postagem.
Retirada não aceita rastreio. A conclusão é um marco posterior à entrega, não uma
confirmação automática de pagamento. No banco, `completed_at` distingue esse marco
sem modificar o documento nem reconstruir as tabelas anteriores.

Cada mudança de etapa/rastreio e cada recebimento gera um evento e uma notificação
na mesma transação. Os e-mails mantêm a identidade visual Forgecon e o retrato dos
dados no momento do evento, mesmo se enviados com atraso. Falhas ficam na fila
`order_mail`; o painel mostra pendências e permite repetir o envio. O agendamento
de dez minutos também processa essa fila. Registros anteriores à migração não
geram notificações retroativas. A confirmação do Resend indica aceitação pelo
serviço, não comprovação de leitura ou entrega na caixa de entrada.

O cliente consulta as informações mais recentes ao abrir a página ou clicar em
“Atualizar acompanhamento”. O código e o link oficial dos Correios aparecem no
site e no e-mail; não há sincronização automática dos eventos da transportadora.
Pedidos do WhatsApp entram nesse fluxo após cadastro e aprovação do orçamento.

No rollback, mantenha também as colunas, filas e gatilhos da migração
`0002_order_tracking.sql`; não exclua históricos ou notificações pendentes.

## Categorias e retirada

Categorias podem ser criadas e renomeadas no painel. O identificador permanece
estável para não quebrar produtos, imagens ou filtros. Exclusão é bloqueada quando
há produtos vinculados, inclusive produtos desativados.

Retirada é uma opção para todo o carrinho, para solicitações públicas e para os
orçamentos. Zera o frete, dispensa CEP/endereço no carrinho e limpa cotações antigas.
Endereço e horário de retirada são combinados no atendimento e podem ser registrados
nas condições do orçamento. Na OS, valores unitários são arredondados para centavos;
o total é sempre a quantidade multiplicada por esse valor unitário.
