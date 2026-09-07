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
<p style="max-width:540px;margin:20px auto 0;font-size:11px;line-height:18px;color:#94a3b8;">Esta é uma mensagem automática referente ao seu orçamento.<br>Para falar com a Forgecon, utilize os canais de atendimento no site.</p>
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
