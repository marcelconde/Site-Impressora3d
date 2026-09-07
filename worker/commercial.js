import { quotePdf, quoteLink } from './quote-pdf.js';
import { quoteReceiptEmail, quoteCodeEmail } from './quote-emails.js';
import { email } from './email.js';
import { orderStatus, orderLink, orderView, requestOrderAccess, deliverOrderPending, deliverOrderMail } from './orders.js';

const now = () => Math.floor(Date.now() / 1000);
const random = () => crypto.randomUUID();
const emailValid = email => typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export async function digest(text) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(b => b.toString(16).padStart(2,'0')).join('');
}
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function text(value, max, label, required = false) {
  if (typeof value !== 'string' || value.trim().length > max || (required && !value.trim())) fail(`${label} inválido.`);
  return value.trim();
}
function cents(value) {
  const n = Number(value);
  if (value === '' || value == null || !Number.isFinite(n) || n < 0 || n > 10000000) fail('Valor monetário inválido.');
  return Math.round((n + Number.EPSILON) * 100);
}

export function normalizeQuote(input, timestamp = now()) {
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 50) fail('Inclua de 1 a 50 itens.');
  const items = input.items.map(item => {
    const quantity = Number(item.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100000) fail('Quantidade inválida.');
    const unitCents = cents(item.unitPrice);
    return { name: text(item.name, 160, 'Produto', true), description: text(item.description || '', 2000, 'Descrição'), quantity, unitCents, totalCents: unitCents * quantity };
  });
  const totalCents = items.reduce((sum, item) => sum + item.totalCents, 0);
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0 || totalCents > 1000000000) fail('Total deve ser maior que zero e até R$ 10 milhões.');
  const days = Number(input.validityDays);
  if (!Number.isInteger(days) || days < 1 || days > 365) fail('Validade deve ser de 1 a 365 dias.');
  if (!['pickup', 'delivery'].includes(input.delivery)) fail('Selecione entrega ou retirada.');
  const date = seconds => new Date(seconds * 1000).toLocaleDateString('pt-BR', { timeZone: 'America/Recife' });
  return {
    schema: 1, client: text(input.client, 160, 'Cliente', true), phone: text(input.phone || '', 40, 'Telefone'),
    items, totalCents, date: date(timestamp), validUntil: date(timestamp + days * 86400),
    delivery: input.delivery, deliveryDetails: text(input.deliveryDetails || '', 500, 'Detalhes de recebimento'),
    payment: text(input.payment || 'A combinar', 1000, 'Pagamento'), notes: text(input.notes || '', 4000, 'Observações'),
  };
}

function view(row, admin = false) {
  const status = row.status === 'awaiting' && row.expires_at <= now() ? 'expired' : row.status;
  const result = {
    id: row.id, number: row.number, document: JSON.parse(row.document), documentHash: row.document_hash,
    status, createdAt: row.created_at, expiresAt: row.expires_at,
    response: row.response ? JSON.parse(row.response) : null, receiptHash: row.receipt_hash,
    orderStatus: orderStatus(row), trackingCode: row.tracking_code, completedAt: row.completed_at, version: row.version,
  };
  if (admin) Object.assign(result, { link: quoteLink(row.token), orderLink: orderLink(row.token), token: row.token, calculation: JSON.parse(row.calculation), previousId: row.previous_id });
  return result;
}

export async function deliverReceipt(env, id) {
  const locked = await env.DB.prepare(`UPDATE quote_mail SET lease_until = ?, attempts = attempts + 1 WHERE quote_id = ? AND status = 'pending' AND lease_until <= ? RETURNING *`).bind(now()+120, id, now()).first();
  if (!locked) return;
  try {
    const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first();
    const response = JSON.parse(row.response);
    const pdf = await quotePdf(row);
    let binary = '';
    for (const byte of pdf) binary += String.fromCharCode(byte);
    await email(env, response.email, quoteReceiptEmail(row),
      `quote-receipt-${id}`, [{ filename: `${row.number}.pdf`, content: btoa(binary) }]);
    await env.DB.prepare("UPDATE quote_mail SET status = 'sent', sent_at = ?, lease_until = 0, last_error = NULL WHERE quote_id = ?").bind(now(), id).run();
  } catch (e) {
    await env.DB.prepare('UPDATE quote_mail SET lease_until = 0, next_attempt = ?, last_error = ? WHERE quote_id = ?').bind(now() + Math.min(3600, 60 * 2 ** Math.min(locked.attempts,6)), String(e.message).slice(0,200), id).run();
  }
}

export async function deliverPending(env) {
  const { results } = await env.DB.prepare("SELECT quote_id FROM quote_mail WHERE status = 'pending' AND next_attempt <= ? AND lease_until <= ? LIMIT 10").bind(now(),now()).all();
  for (const row of results) await deliverReceipt(env,row.quote_id);
  await deliverOrderPending(env);
}

export async function handleCommercial(request, env, helpers) {
  const { json, err, getSessionUser, tokenFromRequest } = helpers;
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  const path = url.pathname;
  if (!/^\/(categories|quotes|dashboard|orders)(\/|$)/.test(path)) return null;
  const reply = (value, status = 200) => {
    const res = json(value, status, origin);
    res.headers.set('Cache-Control','no-store'); res.headers.set('Referrer-Policy','no-referrer'); return res;
  };
  const body = async () => {
    const source = await request.text();
    if (source.length > 100000) fail('Dados excedem o tamanho permitido.',413);
    try { const data = JSON.parse(source); if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Dados inválidos.'); return data; } catch { fail('JSON inválido.'); }
  };
  try {
    if (path === '/orders/access' && request.method === 'POST') {
      const mailId = await requestOrderAccess(env,await body(),await digest(request.headers.get('CF-Connecting-IP') || 'unknown'));
      if (mailId && helpers.waitUntil) helpers.waitUntil(deliverOrderMail(env,mailId));
      return reply({message:'Se os dados corresponderem a um pedido aprovado, enviaremos um link privado ao e-mail cadastrado. Confira também o spam.'},202);
    }
    const orderMatch = path.match(/^\/orders\/([a-f0-9]{64})$/);
    if (orderMatch && request.method === 'GET') {
      const row = await env.DB.prepare("SELECT * FROM quotes WHERE token=? AND status='accepted'").bind(orderMatch[1]).first();
      if (!row) fail('Pedido não encontrado. Solicite um novo link com seu e-mail e número do pedido.',404);
      return reply({order:await orderView(env,row)});
    }
    if (path === '/categories' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT id, name FROM categories ORDER BY name COLLATE NOCASE').all();
      return reply({ categories: results });
    }
    const publicMatch = path.match(/^\/quotes\/public\/([a-f0-9]{64})(?:\/(code|respond|pdf|verify))?$/);
    if (publicMatch) {
      const row = await env.DB.prepare('SELECT * FROM quotes WHERE token = ?').bind(publicMatch[1]).first();
      if (!row) fail('Orçamento não encontrado.',404);
      const action = publicMatch[2];
      if (request.method === 'GET' && action === 'pdf') {
        return new Response(await quotePdf(row), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${row.number}.pdf"`, 'Cache-Control': 'no-store', ...helpers.cors(origin) } });
      }
      if (request.method === 'GET' && action === 'verify') {
        const validDocument = await digest(row.document) === row.document_hash;
        const validReceipt = row.response ? await digest(`${row.document_hash}\n${row.response}`) === row.receipt_hash : null;
        return reply({ validDocument, validReceipt, documentHash: row.document_hash, receiptHash: row.receipt_hash });
      }
      if (request.method === 'GET' && !action) return reply({ quote: view(row) });
      if (request.method !== 'POST' || !['code','respond'].includes(action)) fail('Rota não encontrada.',404);
      if (row.status !== 'awaiting') fail('Este orçamento já recebeu uma resposta ou foi substituído.',409);
      if (row.expires_at <= now()) fail('Orçamento expirado. Solicite uma nova versão à Forgecon.',410);
      const input = await body();
      const address = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
      if (!emailValid(address)) fail('Informe um e-mail válido.');
      if (action === 'code') {
        // Per-document throttling and bounded guesses; raw codes never enter storage.
        const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6,'0');
        const codeHash = await digest(`${row.id}:${address}:${code}`);
        const changed = await env.DB.prepare(`INSERT INTO quote_email_challenges (quote_id,email,code_hash,expires_at,sent_at) VALUES (?,?,?,?,?)
          ON CONFLICT(quote_id) DO UPDATE SET email=excluded.email,code_hash=excluded.code_hash,expires_at=excluded.expires_at,sent_at=excluded.sent_at,attempts=0
          WHERE quote_email_challenges.sent_at <= ? RETURNING quote_id`).bind(row.id,address,codeHash,now()+600,now(),now()-120).first();
        if (!changed) fail('Aguarde dois minutos antes de solicitar outro código.',429);
        try { await email(env,address,quoteCodeEmail(row,code),`quote-code-${random()}`); }
        catch { fail('Não foi possível enviar o código. Tente novamente em dois minutos.',503); }
        return reply({ ok: true });
      }
      if (!['accepted','declined','changes'].includes(input.action)) fail('Resposta inválida.');
      if (input.action === 'accepted' && input.consent !== true) fail('Confirme que leu e concorda com o orçamento.');
      const name = text(input.name,160,'Nome',true);
      const message = text(input.message || '',2000,'Mensagem', input.action === 'changes');
      const challenge = await env.DB.prepare('UPDATE quote_email_challenges SET attempts = attempts + 1 WHERE quote_id = ? AND email = ? AND expires_at > ? AND attempts < 5 RETURNING *').bind(row.id,address,now()).first();
      if (!challenge || challenge.code_hash !== await digest(`${row.id}:${address}:${String(input.code || '')}`)) fail('Código inválido ou expirado. Solicite outro código.');
      const response = JSON.stringify({ schema:1, action:input.action, name, email:address, message, at:now(), code:`ACE-${random().slice(0,8).toUpperCase()}`, ip:request.headers.get('CF-Connecting-IP') || '', userAgent:(request.headers.get('User-Agent') || '').slice(0,500), emailVerified:true, consent:input.consent === true });
      const receiptHash = await digest(`${row.document_hash}\n${response}`);
      // Conditional update plus atomic batch prevents two tabs from accepting/declining twice.
      const batch = await env.DB.batch([
        env.DB.prepare("UPDATE quotes SET status = ?, response = ?, receipt_hash = ?, responded_at = ?, version = version + 1 WHERE id = ? AND status = 'awaiting' AND expires_at > ?").bind(input.action,response,receiptHash,now(),row.id,now()),
        env.DB.prepare("INSERT OR IGNORE INTO quote_mail (quote_id) SELECT id FROM quotes WHERE id = ? AND receipt_hash = ?").bind(row.id,receiptHash),
        env.DB.prepare("INSERT INTO quote_events (quote_id,event,details) SELECT id,?,? FROM quotes WHERE id = ? AND receipt_hash = ?").bind(input.action,JSON.stringify({name,email:address,message}),row.id,receiptHash),
      ]);
      if (!batch[0].meta.changes) fail('Outra resposta já foi registrada. Atualize a página.',409);
      await deliverReceipt(env,row.id);
      const mail = await env.DB.prepare('SELECT status FROM quote_mail WHERE quote_id = ?').bind(row.id).first();
      return reply({ ok:true, emailStatus:mail.status, quote:view(await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(row.id).first()) });
    }

    const user = await getSessionUser(env.DB,tokenFromRequest(request));
    if (!user) fail('Não autenticado.',401);
    if (!['admin','editor'].includes(user.role)) fail('Acesso negado.',403);
    if (path === '/categories' && request.method === 'POST') {
      const input = await body(); const name = text(input.name,60,'Categoria',true);
      const id = `cat-${random()}`;
      try { await env.DB.prepare('INSERT INTO categories (id,name) VALUES (?,?)').bind(id,name).run(); }
      catch (e) { if (String(e.message).includes('UNIQUE')) fail('Já existe uma categoria com esse nome.',409); throw e; }
      return reply({category:{id,name}},201);
    }
    const categoryMatch = path.match(/^\/categories\/([a-z0-9-]+)$/);
    if (categoryMatch) {
      const id = categoryMatch[1];
      if (request.method === 'PUT') {
        const input = await body(); const name = text(input.name,60,'Categoria',true);
        try {
          const result = await env.DB.prepare('UPDATE categories SET name = ? WHERE id = ? RETURNING id,name').bind(name,id).first();
          if (!result) fail('Categoria não encontrada.',404); return reply({category:result});
        } catch (e) { if (String(e.message).includes('UNIQUE')) fail('Já existe uma categoria com esse nome.',409); throw e; }
      }
      if (request.method === 'DELETE') {
        const result = await env.DB.prepare('DELETE FROM categories WHERE id = ? AND NOT EXISTS (SELECT 1 FROM products WHERE category = ?) RETURNING id').bind(id,id).first();
        if (!result) fail('Categoria vinculada a produtos ou não encontrada. Mova os produtos antes de excluir.',409);
        return reply({ok:true});
      }
    }
    if (path === '/quotes' && request.method === 'POST') {
      const input = await body();
      const key = text(input.requestKey,80,'Identificador',true);
      const requestHash = await digest(JSON.stringify(input));
      const existing = await env.DB.prepare('SELECT * FROM quotes WHERE request_key = ?').bind(key).first();
      if (existing) { if (existing.request_hash !== requestHash) fail('Identificador já usado para outro orçamento.',409); return reply({quote:view(existing,true)}); }
      const timestamp = now();
      const document = normalizeQuote(input,timestamp);
      const id = random(); const token = [...crypto.getRandomValues(new Uint8Array(32))].map(b=>b.toString(16).padStart(2,'0')).join('');
      const number = `ORC-${new Date().getFullYear()}-${id.slice(0,8).toUpperCase()}`;
      document.number = number;
      document.expiresAt = timestamp + Number(input.validityDays) * 86400;
      const source = JSON.stringify(document); const hash = await digest(source);
      const previousId = input.previousId ? text(input.previousId,80,'Revisão',true) : null;
      const calculation = JSON.stringify(input.calculation || {});
      const insert = env.DB.prepare(`INSERT INTO quotes (id,token,request_key,request_hash,number,document,document_hash,calculation,total_cents,previous_id,created_at,expires_at,created_by)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ? IS NULL OR EXISTS (SELECT 1 FROM quotes WHERE id = ? AND status IN ('awaiting','changes','declined'))`).bind(id,token,key,requestHash,number,source,hash,calculation,document.totalCents,previousId,timestamp,timestamp+Number(input.validityDays)*86400,user.id,previousId,previousId);
      const statements = [insert];
      if (previousId) statements.push(env.DB.prepare("UPDATE quotes SET status = 'superseded', version = version + 1 WHERE id = ? AND EXISTS (SELECT 1 FROM quotes WHERE id = ?)").bind(previousId,id));
      statements.push(env.DB.prepare("INSERT INTO quote_events (quote_id,event,details,user_id) SELECT id,'published',?,? FROM quotes WHERE id = ?").bind(JSON.stringify({previousId}),user.id,id));
      let results;
      try { results = await env.DB.batch(statements); }
      catch (e) {
        const retry = await env.DB.prepare('SELECT * FROM quotes WHERE request_key = ?').bind(key).first();
        if (retry?.request_hash === requestHash) return reply({quote:view(retry,true)});
        throw e;
      }
      if (!results[0].meta.changes) fail('Só é possível revisar orçamentos aguardando, recusados ou com ajustes solicitados.',409);
      return reply({quote:view(await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first(),true)},201);
    }
    if (path === '/quotes' && request.method === 'GET') {
      const offset = Math.max(0,Number(url.searchParams.get('offset')) || 0);
      const {results} = await env.DB.prepare(`SELECT q.*, m.status AS email_status, m.last_error AS email_error,
        COALESCE((SELECT SUM(amount_cents) FROM quote_payments WHERE quote_id=q.id),0) AS paid_cents
        FROM quotes q LEFT JOIN quote_mail m ON m.quote_id=q.id ORDER BY q.created_at DESC,q.id LIMIT 100 OFFSET ?`).bind(offset).all();
      return reply({quotes:results.map(row=>({...view(row,true),paidCents:row.paid_cents,emailStatus:row.email_status,emailError:row.email_error})),nextOffset:results.length === 100 ? offset+100 : null});
    }
    const quoteMatch = path.match(/^\/quotes\/([a-f0-9-]+)(?:\/(order|payments|retry-email))?$/);
    if (quoteMatch) {
      const id = quoteMatch[1]; const action = quoteMatch[2];
      const row = await env.DB.prepare('SELECT * FROM quotes WHERE id = ?').bind(id).first();
      if (!row) fail('Orçamento não encontrado.',404);
      if (!action && request.method === 'GET') {
        const {results:events} = await env.DB.prepare('SELECT * FROM quote_events WHERE quote_id = ? ORDER BY id').bind(id).all();
        const {results:payments} = await env.DB.prepare('SELECT * FROM quote_payments WHERE quote_id = ? ORDER BY created_at').bind(id).all();
        const {results:notifications} = await env.DB.prepare("SELECT id,status,last_error AS error,sent_at AS sentAt FROM order_mail WHERE quote_id=? AND json_extract(payload,'$.kind')!='access' ORDER BY rowid DESC").bind(id).all();
        return reply({quote:view(row,true),events,payments,notifications});
      }
      if (action === 'retry-email' && request.method === 'POST') {
        await deliverReceipt(env,id);
        await deliverOrderPending(env,id);
        const pending = await env.DB.prepare("SELECT COUNT(*) AS count FROM order_mail WHERE quote_id=? AND status='pending'").bind(id).first();
        return reply({mail:await env.DB.prepare('SELECT status,last_error FROM quote_mail WHERE quote_id = ?').bind(id).first(),pendingUpdates:pending.count});
      }
      if (action === 'order' && request.method === 'PUT') {
        const input = await body();
        if (!Number.isInteger(input.version) || input.version < 1) fail('Versão do pedido inválida.');
        if (row.version !== input.version) fail('Pedido atualizado por outra pessoa. Recarregue.',409);
        const pickup = JSON.parse(row.document).delivery === 'pickup';
        const transitions = {pending:['production','cancelled'],production:['ready','cancelled'],ready:pickup?['delivered','cancelled']:['dispatched','cancelled'],dispatched:['delivered'],delivered:['completed'],completed:[],cancelled:[]};
        const current = orderStatus(row);
        if (input.trackingCode !== undefined && typeof input.trackingCode !== 'string') fail('Código de rastreio inválido.');
        const tracking = typeof input.trackingCode === 'string' ? input.trackingCode.trim().toUpperCase() : row.tracking_code;
        const trackingChanged = tracking !== row.tracking_code;
        const correction = input.status === current && ['dispatched','delivered','completed'].includes(current) && trackingChanged;
        if (!transitions[current]?.includes(input.status) && !correction) fail('Mudança de produção inválida.');
        if (pickup && tracking) fail('Pedido de retirada não possui rastreio dos Correios.');
        if ((!pickup && input.status === 'dispatched' || tracking) && !/^[A-Z]{2}\d{9}BR$/.test(tracking)) fail('Informe o código dos Correios com 2 letras, 9 números e BR (ex.: AB123456789BR).');
        if (trackingChanged && !correction && input.status !== 'dispatched') fail('Informe o rastreio ao marcar o pedido como enviado.');
        const storedStatus = input.status === 'completed' ? 'delivered' : input.status;
        const batch = await env.DB.batch([
          env.DB.prepare("UPDATE quotes SET order_status=?,tracking_code=?,completed_at=?,version=version+1 WHERE id=? AND version=? AND status='accepted'").bind(storedStatus,tracking,input.status==='completed'?(row.completed_at || now()):row.completed_at,id,input.version),
          env.DB.prepare('INSERT INTO quote_events (quote_id,event,details,user_id) SELECT id,?,?,? FROM quotes WHERE id=? AND version=? AND changes()>0').bind('order',JSON.stringify({status:input.status,version:input.version+1,trackingCode:tracking,trackingChanged:correction}),user.id,id,input.version+1),
        ]);
        if (!batch[0].meta.changes) fail('Pedido atualizado por outra pessoa ou ainda não aprovado. Recarregue.',409);
        await deliverOrderPending(env,id);
        return reply({ok:true});
      }
      if (action === 'payments' && request.method === 'POST') {
        const input = await body(); const paymentId = text(input.requestKey,80,'Identificador',true); const amount = cents(input.amount);
        if (amount <= 0) fail('Informe o valor recebido.');
        const existing = await env.DB.prepare('SELECT * FROM quote_payments WHERE id=?').bind(paymentId).first();
        if (existing) { if(existing.quote_id !== id || existing.amount_cents !== amount) fail('Identificador já utilizado.',409); return reply({ok:true}); }
        const result = await env.DB.prepare(`INSERT OR IGNORE INTO quote_payments (id,quote_id,amount_cents,note,created_at,user_id)
          SELECT ?,id,?,?,?,? FROM quotes WHERE id=? AND status='accepted' AND order_status != 'cancelled'
          AND total_cents - COALESCE((SELECT SUM(amount_cents) FROM quote_payments WHERE quote_id=?),0) >= ?`).bind(paymentId,amount,text(input.note || '',300,'Observação'),now(),user.id,id,id,amount).run();
        if(!result.meta.changes) {
          const retry = await env.DB.prepare('SELECT * FROM quote_payments WHERE id=?').bind(paymentId).first();
          if(retry?.quote_id===id && retry.amount_cents===amount) return reply({ok:true});
          fail('Valor excede o saldo ou pedido não está aprovado/ativo.',409);
        }
        await deliverOrderPending(env,id);
        return reply({ok:true},201);
      }
    }
    if (path === '/dashboard' && request.method === 'GET') {
      const start = url.searchParams.get('start'); const end = url.searchParams.get('end');
      if ((start && !/^\d{4}-\d{2}-\d{2}$/.test(start)) || (end && !/^\d{4}-\d{2}-\d{2}$/.test(end))) fail('Período inválido.');
      const from = start ? Date.parse(`${start}T00:00:00-03:00`)/1000 : 0;
      const until = end ? Date.parse(`${end}T00:00:00-03:00`)/1000+86400 : now()+1;
      if (!Number.isFinite(from) || !Number.isFinite(until) || from >= until) fail('Período inválido.');
      const {results:quotes} = await env.DB.prepare(`SELECT CASE WHEN status='awaiting' AND expires_at <= ? THEN 'expired' ELSE status END AS status, COUNT(*) AS count, SUM(total_cents) AS cents FROM quotes WHERE created_at >= ? AND created_at < ? GROUP BY 1`).bind(now(),from,until).all();
      const approved = await env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(total_cents),0) AS cents FROM quotes WHERE status='accepted' AND order_status!='cancelled' AND responded_at>=? AND responded_at<?").bind(from,until).first();
      const received = await env.DB.prepare('SELECT COALESCE(SUM(amount_cents),0) AS cents FROM quote_payments WHERE created_at>=? AND created_at<?').bind(from,until).first();
      const {results:orders} = await env.DB.prepare("SELECT CASE WHEN completed_at IS NOT NULL THEN 'completed' ELSE order_status END AS status,COUNT(*) AS count FROM quotes WHERE status='accepted' AND responded_at>=? AND responded_at<? GROUP BY 1").bind(from,until).all();
      const {results:monthly} = await env.DB.prepare("SELECT strftime('%Y-%m',created_at-10800,'unixepoch') AS month,SUM(amount_cents) AS cents FROM quote_payments WHERE created_at>=? AND created_at<? GROUP BY 1 ORDER BY 1").bind(from,until).all();
      const balance = await env.DB.prepare("SELECT COALESCE(SUM(total_cents - COALESCE((SELECT SUM(amount_cents) FROM quote_payments WHERE quote_id=quotes.id),0)),0) AS cents FROM quotes WHERE status='accepted' AND order_status!='cancelled'").first();
      return reply({quotes,approved,received,orders,monthly,balance});
    }
    fail('Rota não encontrada.',404);
  } catch (e) {
    if (!e.status) console.error('Commercial request failed', e.message);
    return err(e.status ? e.message : 'Não foi possível concluir. Tente novamente.',e.status || 500,origin);
  }
}
