export async function email(env, to, message, key, attachments) {
  if (!env.RESEND_API_KEY) throw new Error('Serviço de e-mail não configurado.');
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ from: 'Forgecon <noreply@forgecon.com.br>', to: [to], ...message, ...(attachments ? { attachments } : {}) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Falha no envio de e-mail (${res.status}).`);
}
