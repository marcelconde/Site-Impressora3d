import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../worker/index.js';
import { normalizeQuote, digest, deliverPending } from '../worker/commercial.js';
import { PDFDocument } from 'pdf-lib';

// Executes the actual queries against SQLite, including atomic D1-style batches.
function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('../worker/schema.sql',import.meta.url),'utf8'));
  sqlite.exec(readFileSync(new URL('../worker/migrations/0001_commercial.sql',import.meta.url),'utf8'));
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
