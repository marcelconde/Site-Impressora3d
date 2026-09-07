import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import worker from '../worker/index.js';
import { normalizeQuote, digest, deliverPending } from '../worker/commercial.js';
import { PDFDocument } from 'pdf-lib';
import { orderEmail } from '../worker/quote-emails.js';

// Executes the actual queries against SQLite, including atomic D1-style batches.
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8'));
  for (const file of readdirSync(new URL('../worker/migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()) sqlite.exec(readFileSync(new URL(`../worker/migrations/${file}`,import.meta.url),'utf8'));
  sqlite.exec("INSERT INTO users(id,email,name,password_hash,password_salt,role) VALUES(1,'admin@example.com','Admin','x','x','admin'); INSERT INTO sessions(token,user_id,expires_at) VALUES('admin',1,9999999999)");
  const db = {
    prepare(sql) {
      let args=[];
      return {
        bind(...values){args=values;return this;},
        first(){return sqlite.prepare(sql).get(...args)||null;},
        all(){return {results:sqlite.prepare(sql).all(...args)};},
        run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};},
      };
    },
    batch(statements){sqlite.exec('BEGIN');try{const results=statements.map(s=>s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}},
  };
  const env={DB:db,RESEND_API_KEY:'test-key',MELHOR_ENVIO_TOKEN:'test',ORIGIN_CEP:'03810110'};
  async function api(path,method='GET',body,auth=true) {
    const headers={'Content-Type':'application/json','Origin':'https://forgecon.com.br','CF-Connecting-IP':'192.0.2.1'};
    if(auth)headers.Authorization='Bearer admin';
    return worker.fetch(new Request(`https://api.forgecon.com.br${path}`,{method,headers,body:body?JSON.stringify(body):undefined}),env);
  }
  return {sqlite,env,api};
}
const sample = (overrides={}) => ({client:'Cliente de teste',phone:'11999999999',items:[{name:'Chaveiro',description:'PLA, preto',quantity:20,unitPrice:5.35}],validityDays:7,payment:'Pix',delivery:'pickup',deliveryDetails:'Retirada agendada',notes:'Produção em cinco dias úteis',requestKey:crypto.randomUUID(),...overrides});
async function create(f,input=sample()) {const res=await f.api('/quotes','POST',input);assert.equal(res.status,201,await res.clone().text());return (await res.json()).quote;}
function mockMail(t,failReceipt=false) {
  const messages=[];
  t.mock.method(globalThis,'fetch',async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');const body=JSON.parse(options.body);messages.push(body);return new Response('{}',{status:failReceipt&&body.attachments?503:200});});
  return messages;
}
async function respond(f,q,messages,action='accepted') {
  const base=`/quotes/public/${q.token}`;
  assert.equal((await f.api(base+'/code','POST',{email:'client@example.com'},false)).status,200);
  const code=messages.at(-1).html.match(/<strong>(\d{6})<\/strong>/)[1];
  return f.api(base+'/respond','POST',{email:'client@example.com',name:'Cliente',code,action,consent:true,message:action==='changes'?'Trocar a cor':''},false);
}

test('totals are computed from rounded unit prices, never trusted from client',()=>{
  const doc=normalizeQuote(sample({salePrice:1,items:[{name:'Peça',description:'',quantity:3,unitPrice:1.005}]}));
  assert.equal(doc.totalCents,303);
  for(const items of [[],[{name:'X',quantity:-1,unitPrice:2}],[{name:'X',quantity:1.5,unitPrice:2}],[{name:'X',quantity:1,unitPrice:-1}],[{name:'X',quantity:1,unitPrice:Infinity}]])assert.throws(()=>normalizeQuote(sample({items})));
});
test('categories persist, rename keeps product key, referenced categories cannot be removed',async()=>{
  const f=fixture();
  assert.equal((await f.api('/categories','POST',{name:'Brindes'},false)).status,401);
  const c=await (await f.api('/categories','POST',{name:'Brindes'})).json();
  const id=c.category.id;
  f.sqlite.prepare('INSERT INTO products(name,category,data) VALUES(?,?,?)').run('Item',id,'{}');
  assert.equal((await f.api(`/categories/${id}`,'PUT',{name:'Brindes personalizados'})).status,200);
  assert.equal((await f.api(`/categories/${id}`,'DELETE')).status,409);
  assert.equal(f.sqlite.prepare('SELECT category FROM products').get().category,id);
  assert.equal((await f.api('/categories','POST',{name:'Brindes personalizados'})).status,409);
});
test('publication retry is idempotent, public response hides calculation and admin list requires auth',async()=>{
  const f=fixture();const input=sample({calculation:{cPriceKg:90}});const q=await create(f,input);
  const retry=await (await f.api('/quotes','POST',input)).json();assert.equal(retry.quote.id,q.id);
  assert.equal((await f.api('/quotes','POST',{...input,client:'Changed'})).status,409);
  const publicQ=(await (await f.api(`/quotes/public/${q.token}`,'GET',null,false)).json()).quote;
  assert.equal(publicQ.calculation,undefined);assert.equal(publicQ.token,undefined);
  assert.equal((await f.api('/quotes','GET',null,false)).status,401);
});
test('verified acceptance is immutable; PDF link, mail attachment and SHA-256 receipt agree',async t=>{
  const messages=mockMail(t);const f=fixture();const q=await create(f);
  const res=await respond(f,q,messages);assert.equal(res.status,200,await res.clone().text());
  const result=await res.json();assert.equal(result.emailStatus,'sent');assert.equal(result.quote.status,'accepted');
  const row=f.sqlite.prepare('SELECT * FROM quotes').get();
  assert.equal(await digest(`${row.document_hash}\n${row.response}`),row.receipt_hash);
  const mail=messages.at(-1);assert.equal(mail.to[0],'client@example.com');assert.match(mail.html,new RegExp(row.receipt_hash));
  const pdf=await PDFDocument.load(Buffer.from(mail.attachments[0].content,'base64'));
  assert.ok(pdf.getPageCount()>=1);assert.ok(pdf.getPages().some(page=>page.node.Annots()?.size()>0));
  assert.equal((await f.api(`/quotes/public/${q.token}/respond`,'POST',{action:'declined'},false)).status,409);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM quote_mail').get().n,1);
  const verify=await (await f.api(`/quotes/public/${q.token}/verify`,'GET',null,false)).json();assert.equal(verify.validReceipt,true);
  assert.equal((await f.api('/quotes','POST',sample({previousId:q.id}))).status,409);
});
test('codes are throttled, bound to email and limited to five attempts',async t=>{
  mockMail(t);const f=fixture();const q=await create(f);const base=`/quotes/public/${q.token}`;
  assert.equal((await f.api(base+'/code','POST',{email:'a@example.com'},false)).status,200);
  assert.equal((await f.api(base+'/code','POST',{email:'b@example.com'},false)).status,429);
  for(let i=0;i<7;i++)assert.equal((await f.api(base+'/respond','POST',{action:'accepted',name:'A',email:'a@example.com',code:'wrong',consent:true},false)).status,400);
  assert.equal(f.sqlite.prepare('SELECT attempts FROM quote_email_challenges').get().attempts,5);
  assert.equal(f.sqlite.prepare('SELECT status FROM quotes').get().status,'awaiting');
});
test('failed Resend delivery preserves response and retries pending mail',async t=>{
  const messages=mockMail(t,true);const f=fixture();const q=await create(f);
  const result=await (await respond(f,q,messages)).json();assert.equal(result.emailStatus,'pending');assert.equal(result.quote.status,'accepted');
  t.mock.restoreAll();mockMail(t);f.sqlite.exec('UPDATE quote_mail SET next_attempt=0');await deliverPending(f.env);
  assert.equal(f.sqlite.prepare('SELECT status FROM quote_mail').get().status,'sent');
});
test('revisions preserve the prior document, adjustment response and invalidate old link',async t=>{
  const messages=mockMail(t);const f=fixture();const q=await create(f);assert.equal((await respond(f,q,messages,'changes')).status,200);
  const original=f.sqlite.prepare('SELECT document FROM quotes WHERE id=?').get(q.id).document;
  const next=await create(f,sample({previousId:q.id,notes:'Cor alterada'}));assert.equal(next.previousId,q.id);
  const old=f.sqlite.prepare('SELECT * FROM quotes WHERE id=?').get(q.id);assert.equal(old.status,'superseded');assert.equal(old.document,original);assert.match(old.response,/Trocar a cor/);
  assert.equal((await f.api(`/quotes/public/${q.token}/code`,'POST',{email:'a@example.com'},false)).status,409);
});
test('expired budgets cannot be accepted and can be revised',async t=>{
  mockMail(t);const f=fixture();const q=await create(f);f.sqlite.exec('UPDATE quotes SET expires_at=1');
  assert.equal((await f.api(`/quotes/public/${q.token}/code`,'POST',{email:'a@example.com'},false)).status,410);
  const next=await create(f,sample({previousId:q.id}));assert.notEqual(next.id,q.id);
});
test('payments are bounded and idempotent; approved revenue is distinct from cash',async t=>{
  const messages=mockMail(t);const f=fixture();const q=await create(f);
  assert.equal((await f.api(`/quotes/${q.id}/payments`,'POST',{amount:20,requestKey:'pay-1'})).status,409);
  await respond(f,q,messages);
  assert.equal((await f.api(`/quotes/${q.id}/payments`,'POST',{amount:20,requestKey:'pay-1'})).status,201);
  assert.equal((await f.api(`/quotes/${q.id}/payments`,'POST',{amount:20,requestKey:'pay-1'})).status,200);
  assert.equal((await f.api(`/quotes/${q.id}/payments`,'POST',{amount:100,requestKey:'pay-2'})).status,409);
  const dash=await (await f.api('/dashboard')).json();assert.equal(dash.approved.cents,10700);assert.equal(dash.received.cents,2000);assert.equal(dash.balance.cents,8700);
  assert.equal((await f.api(`/quotes/${q.id}/order`,'PUT',{status:'production',version:2})).status,200);
  assert.equal((await f.api(`/quotes/${q.id}/order`,'PUT',{status:'production',version:2})).status,409);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM quote_events WHERE event='order'").get().n,1);
});
test('shipping requests only PAC/SEDEX and rejects other carriers and premium variants',async t=>{
  const f=fixture();let requested;
  t.mock.method(globalThis,'fetch',async(url,options)=>{requested=JSON.parse(options.body);return Response.json([
    {id:1,name:'PAC',company:{name:'Correios'},price:10},{id:2,name:'SEDEX',company:{name:'Correios'},price:20},
    {id:3,name:'Package',company:{name:'Jadlog'},price:5},{id:17,name:'SEDEX 10',company:{name:'Correios'},price:40},
  ]);});
  const res=await f.api('/shipping/quote','POST',{cep:'01001000',product:{weight:100,width:10,height:10,length:10,price:20}},false);
  assert.equal(res.status,200);assert.equal(requested.services,'1,2');assert.deepEqual((await res.json()).options.map(x=>x.id),[1,2]);
});
test('concurrent publication, decisions and payments create exactly one record',async t=>{
  const messages=mockMail(t);const f=fixture();const input=sample();
  const publications=await Promise.all([f.api('/quotes','POST',input),f.api('/quotes','POST',input)]);
  assert.deepEqual(publications.map(r=>r.status).sort(),[200,201]);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM quotes').get().n,1);
  const q=(await publications[0].json()).quote;
  const base=`/quotes/public/${q.token}`;
  await f.api(base+'/code','POST',{email:'client@example.com'},false);
  const code=messages.at(-1).html.match(/<strong>(\d{6})<\/strong>/)[1];
  const response={email:'client@example.com',name:'Cliente',code,action:'accepted',consent:true};
  const decisions=await Promise.all([f.api(base+'/respond','POST',response,false),f.api(base+'/respond','POST',response,false)]);
  assert.deepEqual(decisions.map(r=>r.status).sort(),[200,409]);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM quote_events WHERE event='accepted'").get().n,1);
  const payment={amount:20,requestKey:'concurrent-payment'};
  const payments=await Promise.all([f.api(`/quotes/${q.id}/payments`,'POST',payment),f.api(`/quotes/${q.id}/payments`,'POST',payment)]);
  assert.deepEqual(payments.map(r=>r.status).sort(),[200,201]);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM quote_payments').get().n,1);
});

test('order lookup never exposes a token, validates verified email and throttles queued access',async t=>{
  const messages=mockMail(t),f=fixture(),q=await create(f);
  assert.equal((await f.api(`/orders/${q.token}`,'GET',null,false)).status,404);
  await respond(f,q,messages);
  const lookup=(email,number=q.number)=>f.api('/orders/access','POST',{email,number},false);
  const missing=await lookup('unknown@example.com');
  const matched=await lookup(' CLIENT@example.com ');
  assert.equal(matched.status,202);assert.deepEqual(await matched.json(),await missing.json());
  await Promise.all([lookup('client@example.com'),lookup('client@example.com')]);
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM order_mail').get().n,1);
  assert.equal((await lookup('client@example.com','bad')).status,400);
  await deliverPending(f.env);
  assert.match(messages.at(-1).html,new RegExp('/acompanhar/#'+q.token));
  assert.deepEqual(messages.at(-1).to,['client@example.com']);
  for(let i=0;i<10;i++)await lookup('unknown@example.com');
  f.sqlite.prepare("DELETE FROM order_access_limits WHERE key=?").run('quote-'+q.id);
  await lookup('client@example.com');
  assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM order_mail').get().n,1);
  assert.equal((await f.api('/orders/'+ 'f'.repeat(64),'GET',null,false)).status,404);
});

test('delivery requires Correios tracking; updates, corrections and completion notify and preserve receipts',async t=>{
  const messages=mockMail(t),f=fixture(),q=await create(f,sample({delivery:'delivery'}));
  await respond(f,q,messages);
  const original=f.sqlite.prepare('SELECT document,receipt_hash,response FROM quotes').get();
  let version=2;
  async function move(status,trackingCode){const res=await f.api(`/quotes/${q.id}/order`,'PUT',{status,version,trackingCode});if(res.ok)version++;return res;}
  assert.equal((await move('completed')).status,400);
  assert.equal((await move('production')).status,200);
  assert.equal((await move('ready')).status,200);
  assert.equal((await move('delivered')).status,400);
  assert.equal((await move('dispatched')).status,400);
  assert.equal((await move('dispatched','not-a-code')).status,400);
  assert.equal((await move('dispatched','ab123456789br')).status,200);
  assert.match(messages.at(-1).text,/AB123456789BR/);
  assert.match(messages.at(-1).html,/rastreamento.correios.com.br/);
  assert.equal((await move('dispatched','CD987654321BR')).status,200);
  assert.match(messages.at(-1).subject,/Rastreio atualizado/);
  assert.equal((await move('delivered')).status,200);
  assert.equal((await move('completed')).status,200);
  assert.match(messages.at(-1).subject,/Pedido concluído/);
  assert.equal((await move('production')).status,400);
  const order=(await (await f.api(`/orders/${q.token}`,'GET',null,false)).json()).order;
  assert.equal(order.status,'completed');assert.ok(order.completedAt);assert.equal(order.trackingCode,'CD987654321BR');
  assert.equal(order.timeline.length,7);
  assert.deepEqual(f.sqlite.prepare('SELECT document,receipt_hash,response FROM quotes').get(),original);
  const dash=await (await f.api('/dashboard')).json();assert.deepEqual(dash.orders,[{status:'completed',count:1}]);
  const admin=await (await f.api(`/quotes/${q.id}`)).json();assert.equal(admin.notifications.length,6);assert.ok(admin.notifications.every(n=>n.status==='sent'));
});

test('pickup, cancellation and payment privacy remain consistent for the customer',async t=>{
  const messages=mockMail(t),f=fixture(),q=await create(f,sample({calculation:{privateCost:15}}));
  await respond(f,q,messages);
  assert.equal((await f.api(`/quotes/${q.id}/order`,'PUT',{status:'production',version:2},false)).status,401);
  for(const [status,version] of [['production',2],['ready',3]])assert.equal((await f.api(`/quotes/${q.id}/order`,'PUT',{status,version})).status,200);
  assert.match(messages.at(-1).text,/Pronto para retirada/);
  assert.equal((await f.api(`/quotes/${q.id}/order`,'PUT',{status:'dispatched',version:4,trackingCode:'AB123456789BR'})).status,400);
  const payment={amount:20,requestKey:'privacy-pay',note:'PRIVATE BANK REFERENCE'};
  const responses=await Promise.all([f.api(`/quotes/${q.id}/payments`,'POST',payment),f.api(`/quotes/${q.id}/payments`,'POST',payment)]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,201]);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM order_mail WHERE json_extract(payload,'$.kind')='payment'").get().n,1);
  assert.equal(messages.filter(m=>m.subject.startsWith('Pagamento registrado')).length,1);
  const publicResponse=await (await f.api(`/orders/${q.token}`,'GET',null,false)).text();
  for(const privateField of ['PRIVATE BANK REFERENCE','privateCost','userAgent','192.0.2.1','admin@example.com','client@example.com'])assert.ok(!publicResponse.includes(privateField),privateField);
  assert.ok(!messages.at(-1).text.includes('PRIVATE BANK REFERENCE'));
  assert.equal(JSON.parse(publicResponse).order.paidCents,2000);
  await f.api(`/quotes/${q.id}/order`,'PUT',{status:'cancelled',version:4});
  const cancelled=(await (await f.api(`/orders/${q.token}`,'GET',null,false)).json()).order;
  assert.equal(cancelled.status,'cancelled');assert.equal(cancelled.paidCents,2000);assert.match(messages.at(-1).text,/reembolsos/);
});

test('outbox snapshots survive Resend failure and conflicting status updates create only one event',async t=>{
  const messages=mockMail(t),f=fixture(),q=await create(f);await respond(f,q,messages);
  t.mock.restoreAll();
  t.mock.method(globalThis,'fetch',async()=>new Response('{}',{status:503}));
  const statuses=await Promise.all(['production','cancelled'].map(status=>f.api(`/quotes/${q.id}/order`,'PUT',{status,version:2})));
  assert.deepEqual(statuses.map(r=>r.status).sort(),[200,409]);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM quote_events WHERE event='order'").get().n,1);
  const pending=f.sqlite.prepare('SELECT * FROM order_mail').get();assert.equal(pending.status,'pending');assert.match(pending.last_error,/503/);
  // Move ahead while earlier mail is delayed: its snapshot must not change.
  await f.api(`/quotes/${q.id}/payments`,'POST',{amount:10,requestKey:'delayed-pay'});
  assert.equal(JSON.parse(f.sqlite.prepare('SELECT payload FROM order_mail WHERE id=?').get(pending.id).payload).paidCents,0);
  t.mock.restoreAll();const retry=mockMail(t);
  f.sqlite.exec('UPDATE order_mail SET next_attempt=0');await deliverPending(f.env);
  assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM order_mail WHERE status='pending'").get().n,0);
  assert.match(retry[0].text,/Recebido: R\$\s*0,00/);
  assert.match(retry[1].text,/recebimento de R\$\s*10,00/);
  const before=retry.length;await deliverPending(f.env);assert.equal(retry.length,before);
});

test('order email escapes text and retains branding, tracking and plain-text access',()=>{
  const row={number:'ORC-2026-12345678',token:'a'.repeat(64),document:JSON.stringify({delivery:'pickup',deliveryDetails:'<img src=x>'}),response:JSON.stringify({name:'<script>bad</script>'}),total_cents:1000};
  const email=orderEmail(row,{kind:'order',at:1788700000,status:'ready',trackingCode:'',paidCents:500,details:{}});
  assert.match(email.html,/&lt;script&gt;/);assert.ok(!email.html.includes('<script>'));assert.match(email.html,/#7c3aed/);assert.match(email.text,/Pronto para retirada/);assert.match(email.text,/acompanhar\/#a{64}/);
});

test('access link dispatch uses the Worker background context without waiting for the cron',async t=>{
  const messages=mockMail(t),f=fixture(),q=await create(f);await respond(f,q,messages);
  const tasks=[];
  const response=await worker.fetch(new Request('https://api.forgecon.com.br/orders/access',{method:'POST',headers:{'Content-Type':'application/json','CF-Connecting-IP':'192.0.2.2'},body:JSON.stringify({email:'client@example.com',number:q.number})}),f.env,{waitUntil:task=>tasks.push(task)});
  assert.equal(response.status,202);assert.equal(tasks.length,1);await Promise.all(tasks);
  assert.match(messages.at(-1).subject,/Acompanhar pedido/);
  assert.equal(f.sqlite.prepare('SELECT status FROM order_mail').get().status,'sent');
});

test('additive tracking migration preserves historical records without retroactive email',()=>{
  const db=new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../worker/migrations/0001_commercial.sql',import.meta.url),'utf8'));
  db.exec("INSERT INTO quotes(id,token,request_key,request_hash,number,document,document_hash,total_cents,created_at,expires_at,status,response,receipt_hash,order_status) VALUES('old','token','key','hash','ORC-2026-12345678','{}','immutable',1000,1,2,'accepted','{}','receipt','delivered')");
  const before=db.prepare('SELECT document,document_hash,response,receipt_hash,order_status FROM quotes').get();
  db.exec(readFileSync(new URL('../worker/migrations/0002_order_tracking.sql',import.meta.url),'utf8'));
  assert.deepEqual(db.prepare('SELECT document,document_hash,response,receipt_hash,order_status FROM quotes').get(),before);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM order_mail').get().n,0);
  assert.equal(db.prepare('SELECT completed_at FROM quotes').get().completed_at,null);db.close();
});
