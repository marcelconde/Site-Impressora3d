import { email } from './email.js';
import { orderEmail } from './quote-emails.js';

const now = () => Math.floor(Date.now() / 1000);
export const orderStatus = row => row.completed_at ? 'completed' : row.order_status;
export const orderLink = token => `https://forgecon.com.br/acompanhar/#${token}`;

// Only customer-facing information crosses this boundary. Internal notes, pricing
// calculations, identities and acceptance IP/user-agent never enter the portal.
export async function orderView(env, row) {
  const doc = JSON.parse(row.document);
  const { results: payments } = await env.DB.prepare('SELECT amount_cents AS amountCents,created_at AS at FROM quote_payments WHERE quote_id=? ORDER BY created_at,id').bind(row.id).all();
  const { results: events } = await env.DB.prepare("SELECT event,details,created_at FROM quote_events WHERE quote_id=? AND event IN ('order','payment') ORDER BY id").bind(row.id).all();
  return {
    number: row.number, name: JSON.parse(row.response).name, status: orderStatus(row),
    delivery: doc.delivery, deliveryDetails: doc.deliveryDetails, items: doc.items,
    totalCents: row.total_cents, paidCents: payments.reduce((sum,p) => sum+p.amountCents,0),
    trackingCode: row.tracking_code, completedAt: row.completed_at, payments,
    timeline: [{ kind:'accepted', at:row.responded_at }, ...events.map(e => {
      const d = JSON.parse(e.details);
      return { kind:e.event, at:e.created_at, status:d.status, trackingCode:d.trackingCode, trackingChanged:d.trackingChanged === true, amountCents:d.amountCents };
    })],
  };
}

export async function deliverOrderMail(env, id) {
  const locked = await env.DB.prepare("UPDATE order_mail SET lease_until=?,attempts=attempts+1 WHERE id=? AND status='pending' AND lease_until<=? RETURNING *").bind(now()+120,id,now()).first();
  if (!locked) return;
  try {
    const row = await env.DB.prepare('SELECT * FROM quotes WHERE id=?').bind(locked.quote_id).first();
    await email(env,JSON.parse(row.response).email,orderEmail(row,JSON.parse(locked.payload)),`order-${id}`);
    await env.DB.prepare("UPDATE order_mail SET status='sent',sent_at=?,lease_until=0,last_error=NULL WHERE id=?").bind(now(),id).run();
  } catch (e) {
    await env.DB.prepare('UPDATE order_mail SET lease_until=0,next_attempt=?,last_error=? WHERE id=?').bind(now()+Math.min(3600,60*2**Math.min(locked.attempts,6)),String(e.message).slice(0,200),id).run();
  }
}

export async function deliverOrderPending(env, quoteId = null) {
  const { results } = await env.DB.prepare("SELECT id FROM order_mail WHERE status='pending' AND lease_until<=? AND (? IS NULL AND next_attempt<=? OR quote_id=?) ORDER BY rowid LIMIT 10").bind(now(),quoteId,now(),quoteId).all();
  for (const row of results) await deliverOrderMail(env,row.id);
  await env.DB.prepare('DELETE FROM order_access_limits WHERE expires_at<=?').bind(now()).run();
}

// Every well-formed lookup returns the same answer, even if delivery fails.
// Atomic IP and per-order limits prevent enumeration and repeated mail bombing.
export async function requestOrderAccess(env, input, ipHash) {
  const address = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const number = typeof input.number === 'string' ? input.number.trim().toUpperCase() : '';
  if (address.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address) || !/^ORC-\d{4}-[A-F0-9]{8}$/.test(number)) {
    throw Object.assign(new Error('Informe o e-mail e o número completo do pedido (ORC-AAAA-XXXXXXXX).'),{status:400});
  }
  const limit = await env.DB.prepare(`INSERT INTO order_access_limits(key,expires_at) VALUES(?,?)
    ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires_at<=? THEN 1 ELSE count+1 END,
    expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END
    WHERE expires_at<=? OR count<10 RETURNING key`).bind(`ip-${ipHash}`,now()+900,now(),now(),now()).first();
  if (!limit) return;
  const row = await env.DB.prepare("SELECT * FROM quotes WHERE number=? AND status='accepted' AND lower(json_extract(response,'$.email'))=? AND json_extract(response,'$.emailVerified')=1").bind(number,address).first();
  if (!row) return;
  const id = crypto.randomUUID();
  const batch = await env.DB.batch([
    env.DB.prepare(`INSERT INTO order_access_limits(key,expires_at) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET expires_at=excluded.expires_at WHERE expires_at<=?`).bind(`quote-${row.id}`,now()+120,now()),
    env.DB.prepare('INSERT INTO order_mail(id,quote_id,payload) SELECT ?,?,? WHERE changes()>0').bind(id,row.id,JSON.stringify({kind:'access',at:now()})),
  ]);
  // The caller sends in the background; the scheduled worker retries failures.
  return batch[1].meta.changes ? id : null;
}
