import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quoteReceiptEmail, quoteCodeEmail } from '../worker/quote-emails.js';

const emailExample = {
  number: 'ORC-2026-DEMO', token: 'a'.repeat(64), receipt_hash: '1234567890abcdef'.repeat(4),
  document: JSON.stringify({ totalCents: 32039, delivery: 'pickup', deliveryDetails: 'Retirada com agendamento pelo WhatsApp.', payment: 'Pix ou cartão, conforme combinado.' }),
  response: JSON.stringify({ action: 'accepted', name: 'Cliente de demonstração', at: 1788721200, code: 'ACE-DEMO1234', message: '' }),
};

test('receipt templates escape customer content and preserve receipt details in HTML and plain text', () => {
  const dangerous = '<img src=x onerror="alert(1)">';
  const row = { ...emailExample, response: JSON.stringify({ ...JSON.parse(emailExample.response), name: dangerous, message: 'Primeira linha\n' + dangerous }) };
  const mail = quoteReceiptEmail(row);
  assert.ok(!mail.html.includes(dangerous));
  assert.ok(mail.html.includes('&lt;img'));
  assert.match(mail.html, /Primeira linha<br>/);
  for (const part of [mail.html, mail.text]) {
    assert.ok(part.includes(emailExample.receipt_hash));
    assert.ok(part.includes('ACE-DEMO1234'));
    assert.ok(part.includes(`https://forgecon.com.br/proposta/#${row.token}`));
    assert.ok(part.includes('320,39'));
  }
  assert.ok(mail.text.includes(dangerous));
});

test('each customer decision has its own email state and message', () => {
  for (const [action, title, label] of [
    ['accepted', 'Seu orçamento foi aprovado.', 'APROVADO'],
    ['declined', 'Sua resposta foi registrada.', 'RECUSADO'],
    ['changes', 'Vamos ajustar seu projeto.', 'AJUSTES SOLICITADOS'],
  ]) {
    const row = { ...emailExample, response: JSON.stringify({ ...JSON.parse(emailExample.response), action }) };
    const mail = quoteReceiptEmail(row);
    assert.ok(mail.html.includes(title));
    assert.ok(mail.text.includes(label));
    assert.match(mail.html, /role="presentation"/);
    assert.match(mail.html, /bgcolor="#111128"/);
    assert.ok(!mail.html.includes('<script'));
  }
});

test('confirmation code stays readable, expiring and present in both email formats', () => {
  const mail = quoteCodeEmail(emailExample, '012345');
  assert.match(mail.html, /<strong>012345<\/strong>/);
  assert.match(mail.html, /Válido por 10 minutos/);
  assert.match(mail.text, /Código de confirmação: 012345/);
  assert.ok(!mail.subject.includes('012345'));
});
