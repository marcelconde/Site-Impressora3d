import { money, quoteLink } from './quote-pdf.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const paragraph = 'margin:0 0 20px;font-size:15px;line-height:25px;color:#b8c2d5;';

// Email clients need inline colors and table layout. The wordmark remains visible
// even when remote images are blocked; Outlook can use the fixed-width wrapper.
function frame(preheader, content) {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">
<title>Forgecon</title></head>
<body bgcolor="#06060f" style="margin:0;padding:0;background-color:#06060f;font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;color:#06060f;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escape(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#06060f" style="background-color:#06060f;"><tr><td align="center" style="padding:32px 12px;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#111128" style="width:100%;max-width:600px;table-layout:fixed;background-color:#111128;border:1px solid #2b2547;border-radius:18px;">
  <tr><td style="padding:28px 32px;background-color:#0d0d1e;border-radius:18px 18px 0 0;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td width="56" valign="middle"><img src="https://forgecon.com.br/assets/icons/forgecon-icon-192.png" width="44" height="44" alt="" style="display:block;border:0;border-radius:12px;"></td>
      <td valign="middle"><div style="font-size:25px;line-height:30px;font-weight:800;letter-spacing:2px;color:#f1f5f9;">FORGE<span style="color:#a78bfa;">CON</span></div><div style="font-size:10px;line-height:18px;letter-spacing:2px;color:#94a3b8;">IMPRESSÃO 3D PROFISSIONAL</div></td>
    </tr></table>
  </td></tr>
  <tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="70%" height="3" bgcolor="#7c3aed" style="font-size:0;line-height:3px;">&nbsp;</td><td height="3" bgcolor="#0ea5e9" style="font-size:0;line-height:3px;">&nbsp;</td></tr></table></td></tr>
  <tr><td style="padding:32px;color:#e2e8f0;word-wrap:break-word;">${content}</td></tr>
  <tr><td style="padding:24px 32px;border-top:1px solid #2b2547;background-color:#0d0d1e;border-radius:0 0 18px 18px;">
    <p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#c4b5fd;font-weight:bold;">Da ideia à peça. Camada por camada.</p>
    <p style="margin:0;font-size:12px;line-height:20px;color:#94a3b8;">Forgecon · Impressão 3D<br><a href="https://forgecon.com.br" style="color:#7dd3fc;text-decoration:none;">forgecon.com.br</a></p>
  </td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
<p style="max-width:540px;margin:20px auto 0;font-size:11px;line-height:18px;color:#94a3b8;">Esta é uma mensagem automática referente ao seu orçamento ou pedido.<br>Para falar com a Forgecon, utilize os canais de atendimento no site.</p>
</td></tr></table>
</body></html>`;
}

function button(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;"><tr><td align="center" bgcolor="#7c3aed" style="background-color:#7c3aed;border-radius:9px;mso-padding-alt:16px 24px;"><a href="${escape(url)}" style="display:inline-block;padding:16px 24px;font-size:14px;line-height:20px;font-weight:bold;color:#ffffff;text-decoration:none;border:1px solid #7c3aed;border-radius:9px;">${label}</a></td></tr></table>`;
}

export function quoteReceiptEmail(row) {
  const document = JSON.parse(row.document);
  const response = JSON.parse(row.response);
  const states = {
    accepted: { label: 'APROVADO', title: 'Seu orçamento foi aprovado.', description: 'Seu aceite foi registrado. Obrigado por escolher a Forgecon para dar forma ao seu projeto.', color: '#86efac', background: '#12342d' },
    declined: { label: 'RECUSADO', title: 'Sua resposta foi registrada.', description: 'Registramos a recusa do orçamento. Agradecemos por considerar a Forgecon e seguimos à disposição para futuros projetos.', color: '#fda4af', background: '#3b1d2d' },
    changes: { label: 'AJUSTES SOLICITADOS', title: 'Vamos ajustar seu projeto.', description: 'Seu pedido de ajustes foi registrado para análise da Forgecon. Você receberá um novo orçamento após o alinhamento das alterações.', color: '#fde68a', background: '#352b1e' },
  };
  const state = states[response.action];
  const date = new Date(response.at * 1000).toLocaleString('pt-BR', { timeZone: 'America/Recife' });
  const delivery = document.delivery === 'pickup' ? 'Retirada no local · sem frete' : 'Entrega';
  const url = quoteLink(row.token);
  const content = `
    <p style="margin:0 0 20px;font-size:11px;line-height:18px;font-weight:bold;letter-spacing:2px;color:#a78bfa;">SEU PROJETO NA FORGECON</p>
    <h1 style="margin:0 0 20px;font-size:30px;line-height:38px;letter-spacing:-.5px;color:#f1f5f9;">${state.title}</h1>
    <p style="${paragraph}">Olá, <strong style="color:#e2e8f0;">${escape(response.name)}</strong>.<br>${state.description}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#191532" style="background-color:#191532;border:1px solid #493478;border-radius:12px;table-layout:fixed;">
      <tr><td style="padding:24px;">
        <span style="display:inline-block;padding:5px 9px;background-color:${state.background};color:${state.color};font-size:10px;line-height:16px;font-weight:bold;letter-spacing:1px;border-radius:5px;">${state.label}</span>
        <p style="margin:18px 0 6px;color:#c4b5fd;font-size:12px;line-height:18px;">Orçamento ${escape(row.number)}</p>
        <p style="margin:0;font-size:34px;line-height:42px;font-weight:bold;color:#f1f5f9;">${escape(money(document.totalCents))}</p>
        <p style="margin:4px 0 20px;font-size:11px;line-height:18px;color:#94a3b8;">VALOR DO ORÇAMENTO</p>
        <p style="margin:0;padding-top:16px;border-top:1px solid #493478;font-size:13px;line-height:22px;color:#e2e8f0;"><strong>Recebimento</strong><br>${delivery}<br><span style="color:#b8c2d5;">${escape(document.deliveryDetails).replace(/\n/g, '<br>')}</span></p>
        <p style="margin:14px 0 0;font-size:13px;line-height:22px;color:#e2e8f0;"><strong>Pagamento</strong><br><span style="color:#b8c2d5;">${escape(document.payment).replace(/\n/g, '<br>')}</span></p>
      </td></tr>
    </table>
    <p style="${paragraph}margin-top:24px;"><strong style="color:#7dd3fc;">Seu PDF está anexado.</strong><br>Guarde a cópia completa do orçamento e o registro da sua resposta. Você também pode consultá-los pelo botão abaixo.</p>
    ${button(url, 'Ver orçamento e comprovante')}
    ${response.action === 'accepted' ? button(`https://forgecon.com.br/acompanhar/#${row.token}`, 'Acompanhar meu pedido') : ''}
    ${response.message ? `<p style="${paragraph}"><strong style="color:#e2e8f0;">Sua mensagem</strong><br>${escape(response.message).replace(/\n/g, '<br>')}</p>` : ''}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;"><tr><td style="padding:22px 0 0;border-top:1px solid #2b2547;">
      <p style="margin:0 0 12px;font-size:11px;line-height:18px;letter-spacing:1.5px;font-weight:bold;color:#a78bfa;">${response.action === 'accepted' ? 'COMPROVANTE DO ACEITE' : 'COMPROVANTE DA RESPOSTA'}</p>
      <p style="margin:0 0 14px;font-size:12px;line-height:21px;color:#b8c2d5;">Registrado em ${escape(date)} (horário de Brasília)<br>Código: <strong style="color:#e2e8f0;">${escape(response.code)}</strong></p>
      <p style="margin:0 0 6px;font-size:11px;line-height:18px;color:#94a3b8;">Hash de integridade do registro</p>
      <p style="margin:0;font-family:Consolas,'Courier New',monospace;font-size:10px;line-height:18px;color:#b8c2d5;word-break:break-all;overflow-wrap:anywhere;">${escape(row.receipt_hash)}</p>
      <p style="margin:14px 0 0;font-size:11px;line-height:18px;color:#94a3b8;">${response.action === 'accepted' ? 'O aceite confirma a aprovação do orçamento, não o recebimento de pagamento. ' : ''}Este link é privado: compartilhe apenas com pessoas autorizadas.</p>
    </td></tr></table>`;
  return {
    subject: `Cópia do orçamento ${row.number} — Forgecon`,
    html: frame(`${state.title} Orçamento ${row.number}, ${money(document.totalCents)}. PDF completo em anexo.`, content),
    text: `FORGECON — IMPRESSÃO 3D PROFISSIONAL\n\n${state.title}\nOlá, ${response.name}. ${state.description}\n\nOrçamento: ${row.number}\nSituação: ${state.label}\nValor: ${money(document.totalCents)}\nRecebimento: ${delivery}\n${document.deliveryDetails || ''}\nPagamento: ${document.payment}\n\nA cópia completa em PDF está anexada.\nConsultar documento e comprovante: ${url}\n\n${response.message ? `Sua mensagem: ${response.message}\n\n` : ''}Registrado em ${date} (horário de Brasília)\nCódigo: ${response.code}\nHash de integridade: ${row.receipt_hash}\n\nEste link é privado.\nForgecon — https://forgecon.com.br`,
  };
}

export function quoteCodeEmail(row, code) {
  const url = quoteLink(row.token);
  return {
    subject: `Código para responder ao orçamento ${row.number}`,
    html: frame('Seu código de confirmação Forgecon. Válido por dez minutos.', `
      <p style="margin:0 0 20px;font-size:11px;line-height:18px;font-weight:bold;letter-spacing:2px;color:#a78bfa;">CONFIRMAÇÃO DE E-MAIL</p>
      <h1 style="margin:0 0 20px;font-size:30px;line-height:38px;color:#f1f5f9;">Seu projeto começa<br>com confiança.</h1>
      <p style="${paragraph}">Use o código abaixo na página do orçamento <strong style="color:#e2e8f0;">${escape(row.number)}</strong> para confirmar seu e-mail e registrar sua resposta.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#191532" style="background-color:#191532;border:1px solid #493478;border-radius:12px;"><tr><td align="center" style="padding:28px 12px;">
        <p style="margin:0 0 12px;font-size:10px;line-height:16px;letter-spacing:2px;color:#c4b5fd;">SEU CÓDIGO DE CONFIRMAÇÃO</p>
        <div style="font-family:Consolas,'Courier New',monospace;font-size:36px;line-height:46px;letter-spacing:6px;color:#f1f5f9;"><strong>${escape(code)}</strong></div>
        <p style="margin:12px 0 0;font-size:12px;line-height:18px;color:#7dd3fc;">Válido por 10 minutos</p>
      </td></tr></table>
      ${button(url, 'Voltar ao orçamento')}
      <p style="${paragraph}">Após confirmar o e-mail, você poderá aprovar, recusar ou solicitar ajustes no orçamento.</p>
      <p style="margin:0;font-size:12px;line-height:20px;color:#94a3b8;">Não compartilhe este código. Se você não solicitou esta confirmação, ignore a mensagem.</p>`),
    text: `FORGECON — IMPRESSÃO 3D PROFISSIONAL\n\nCódigo de confirmação: ${code}\nOrçamento: ${row.number}\nVálido por 10 minutos.\n\nDigite o código na página do orçamento para confirmar seu e-mail e registrar sua resposta.\n${url}\n\nNão compartilhe o código. Se não solicitou, ignore esta mensagem.`,
  };
}

export function orderEmail(row, update) {
  const doc = JSON.parse(row.document);
  const name = JSON.parse(row.response).name;
  const url = `https://forgecon.com.br/acompanhar/#${row.token}`;
  const labels = {pending:'Aguardando produção',production:'Em produção',ready:doc.delivery==='pickup'?'Pronto para retirada':'Pronto para envio',dispatched:'Enviado pelos Correios',delivered:doc.delivery==='pickup'?'Retirado pelo cliente':'Entregue',completed:'Pedido concluído',cancelled:'Pedido cancelado'};
  const access = update.kind === 'access';
  const title = access ? 'Seu pedido, de perto.' : update.kind === 'payment' ? 'Pagamento registrado.' : update.details?.trackingChanged ? 'Rastreio atualizado.' : `${labels[update.status]}.`;
  const date = new Date(update.at*1000).toLocaleString('pt-BR',{timeZone:'America/Recife'});
  const tracking = !access && update.trackingCode ? `Código de rastreio: ${update.trackingCode}` : '';
  const finances = access ? '' : `Total: ${money(row.total_cents)} · Recebido: ${money(update.paidCents)} · Saldo: ${money(row.total_cents-update.paidCents)}`;
  const description = access ? 'Você solicitou acesso ao acompanhamento. Use o botão abaixo para consultar as etapas, pagamentos e informações de recebimento, sem precisar de senha.' : update.kind==='payment' ? `Registramos o recebimento de ${money(update.details.amountCents)}. Você pode conferir todos os pagamentos no acompanhamento.` : update.status==='cancelled' ? 'O pedido foi cancelado. Os pagamentos anteriores permanecem registrados; eventuais reembolsos devem ser combinados com a Forgecon.' : update.status==='ready' && doc.delivery==='pickup' ? 'Sua peça está pronta! Combine o horário de retirada com a Forgecon.' : 'A Forgecon atualizou o andamento do seu pedido. Confira os detalhes abaixo.';
  return {
    subject: `${access?'Acompanhar pedido':title} ${row.number} — Forgecon`,
    html: frame(`${title} Pedido ${row.number}.`, `
      <p style="color:#a78bfa;font-size:11px;letter-spacing:2px;font-weight:bold;">ACOMPANHAMENTO DO PEDIDO</p>
      <h1 style="margin:20px 0;font-size:30px;line-height:38px;color:#f1f5f9;">${escape(title)}</h1>
      <p style="${paragraph}">Olá, <strong style="color:#e2e8f0;">${escape(name)}</strong>.<br>${escape(description)}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;background-color:#191532;border:1px solid #493478;border-radius:12px;"><tr><td style="padding:24px;">
        <p style="margin:0 0 12px;font-size:13px;color:#c4b5fd;">Pedido ${escape(row.number)}</p>
        ${access?'':`<p style="font-size:24px;line-height:32px;font-weight:bold;color:#f1f5f9;">${escape(labels[update.status])}</p><p style="${paragraph}">${escape(finances)}</p>`}
        <p style="${paragraph}">${doc.delivery==='pickup'?'Retirada no local':'Entrega pelos Correios'}<br>${escape(doc.deliveryDetails).replace(/\n/g,'<br>')}</p>
        ${tracking?`<p style="font-size:13px;color:#b8c2d5;">Código de rastreio<br><strong style="font-size:18px;line-height:30px;color:#7dd3fc;white-space:nowrap;">${escape(update.trackingCode)}</strong></p><p style="${paragraph}"><a style="color:#7dd3fc;" href="https://rastreamento.correios.com.br/app/index.php">Consultar nos Correios</a><br>A postagem pode levar algum tempo para aparecer no rastreio.</p>`:''}
      </td></tr></table>
      ${button(url,'Acompanhar meu pedido')}
      ${access?'':`<p style="${paragraph}">Atualização registrada em ${escape(date)} (horário de Brasília). O acompanhamento mostra a situação mais recente.</p>`}
      <p style="font-size:12px;line-height:20px;color:#94a3b8;">Este link é privado e dá acesso ao seu pedido. Não o compartilhe. ${access?'Se não solicitou este e-mail, ignore a mensagem.':''}</p>`),
    text: `FORGECON\n\n${title}\nOlá, ${name}. ${description}\n\nPedido: ${row.number}\n${access?'':`Situação: ${labels[update.status]}\n${finances}\nRegistrado em ${date} (horário de Brasília)\n`}${doc.delivery==='pickup'?'Retirada no local':'Entrega pelos Correios'}\n${doc.deliveryDetails}\n${tracking?`${tracking}\nhttps://rastreamento.correios.com.br/app/index.php\n`:''}\nAcompanhar meu pedido: ${url}\n\nEste link é privado. Não o compartilhe.`,
  };
}
