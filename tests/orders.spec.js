import { test, expect } from '@playwright/test';
import { orderEmail } from '../worker/quote-emails.js';
const token='a'.repeat(64);
const order={number:'ORC-2026-12345678',name:'Cliente de teste',status:'dispatched',delivery:'delivery',deliveryDetails:'Correios SEDEX · endereço combinado no orçamento',items:[{name:'Chaveiros personalizados',description:'PLA preto, com argola',quantity:20,unitCents:535,totalCents:10700}],totalCents:10700,paidCents:5000,trackingCode:'AB123456789BR',payments:[{at:1788700000,amountCents:5000}],timeline:[{kind:'accepted',at:1788700000},{kind:'order',status:'production',at:1788700100},{kind:'payment',amountCents:5000,at:1788700200},{kind:'order',status:'ready',at:1788700300},{kind:'order',status:'dispatched',trackingCode:'AB123456789BR',at:1788700400}]};
for(const width of [1280,390])test(`customer tracking, passwordless access and refresh at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let current=structuredClone(order),failure=false,lookup;
  await page.route('https://api.forgecon.com.br/orders**',route=>{
    if(route.request().url().endsWith('/access')){lookup=route.request().postDataJSON();return route.fulfill({status:202,json:{message:'Se os dados corresponderem a um pedido aprovado, enviaremos um link privado ao e-mail cadastrado.'}});}
    return route.fulfill({status:failure?503:200,json:failure?{error:'Falha temporária. Tente novamente.'}:{order:current}});
  });
  await page.goto('/acompanhar/');
  await page.locator('#email').fill('client@example.com');await page.locator('#number').fill(order.number);await page.locator('#sendAccess').click();
  await expect(page.locator('#accessMessage')).toContainText('enviaremos um link');
  expect(lookup).toEqual({email:'client@example.com',number:order.number});await expect(page.locator('#orderPanel')).toBeHidden();
  await page.goto('/acompanhar/#'+token);
  await expect(page.locator('.status-tag')).toHaveText('Enviado pelos Correios');
  await expect(page.locator('.tracking')).toContainText('AB123456789BR');await expect(page.locator('.metrics')).toContainText('R$ 57,00');
  await expect(page.getByRole('link',{name:'Consultar nos Correios'})).toHaveAttribute('href','https://rastreamento.correios.com.br/app/index.php');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`/tmp/forgecon-order-${width}.png`,fullPage:true});
  failure=true;await page.locator('#refresh').click();await expect(page.locator('#pageMessage')).toContainText('última consulta');await expect(page.locator('.tracking')).toBeVisible();
  failure=false;current={...current,delivery:'pickup',status:'ready',trackingCode:'',deliveryDetails:'Retirada com horário agendado.'};
  await page.locator('#refresh').click();await expect(page.locator('.status-tag')).toHaveText('Pronto para retirada');await expect(page.locator('.tracking')).toHaveCount(0);
  current.status='completed';await page.locator('#refresh').click();await expect(page.locator('.status-tag')).toHaveText('Pedido concluído');
  current.status='cancelled';await page.locator('#refresh').click();await expect(page.locator('.notice')).toContainText('reembolsos');
  await page.locator('#leave').click();await expect(page.locator('#accessSection')).toBeVisible();expect(errors).toEqual([]);
});

test('admin requires tracking on dispatch and exposes completion and delivery retries',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const quote={id:'abc123',token,number:order.number,status:'accepted',document:{client:order.name,items:order.items,totalCents:10700,delivery:'delivery',deliveryDetails:'SEDEX',payment:'Pix',notes:''},orderStatus:'ready',version:4,response:{name:order.name,email:'client@example.com'},link:'/proposta/#'+token,orderLink:'/acompanhar/#'+token,trackingCode:''};
  let sent;
  await page.addInitScript(()=>sessionStorage.setItem('forgecon_token','admin'));
  await page.route('https://api.forgecon.com.br/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/order')){sent=route.request().postDataJSON();quote.orderStatus=sent.status;quote.trackingCode=sent.trackingCode||quote.trackingCode;quote.version++;return route.fulfill({json:{ok:true}});}
    const data=path==='/auth/me'?{user:{id:1,name:'Admin',email:'admin@example.com',role:'admin'}}:path==='/quotes'?{quotes:[quote],nextOffset:null}:path==='/quotes/abc123'?{quote,events:[],payments:[],notifications:[{id:'event-1',status:'pending'}]}:path==='/categories'?{categories:[]}:path==='/products'?{products:[]}:path==='/settings'?{settings:{}}:{};
    return route.fulfill({json:data});
  });
  await page.goto('/admin/');await page.locator('[data-view="quotes"]').click();await page.locator('[data-open-quote]').click();
  await expect(page.locator('#orderTrackingCode')).toBeVisible();await expect(page.locator('#orderTrackingCode')).toHaveAttribute('required','');
  await page.locator('#orderStatusForm button').click();expect(sent).toBeUndefined();
  await page.locator('#orderTrackingCode').fill('AB123456789BR');await page.locator('#orderStatusForm button').click();
  await expect(page.locator('#trackingForm')).toHaveCount(1);expect(sent).toEqual({status:'dispatched',version:4,trackingCode:'AB123456789BR'});
  await expect(page.locator('#quoteDetailBody')).toContainText('envio(s) pendente(s)');
  await page.locator('#orderStatusForm button').click();await expect(page.locator('#orderStatus')).toHaveValue('completed');
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/forgecon-admin-tracking-390.png',fullPage:true});
  await page.locator('#orderStatusForm button').click();await expect(page.locator('#quoteDetailBody')).toContainText('Pedido concluído');await expect(page.locator('#orderStatusForm')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('new notification emails preserve readable responsive brand layout',async({page})=>{
  const row={number:order.number,token,document:JSON.stringify({delivery:order.delivery,deliveryDetails:order.deliveryDetails}),response:JSON.stringify({name:order.name}),total_cents:order.totalCents};
  for(const width of [800,390]){
    await page.setViewportSize({width,height:1000});
    for(const kind of ['order','access']){
      await page.setContent(orderEmail(row,{kind,at:1788700000,status:'dispatched',trackingCode:order.trackingCode,paidCents:5000,details:{}}).html);
      await expect(page.getByRole('link',{name:'Acompanhar meu pedido'})).toBeVisible();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`/tmp/forgecon-${kind}-email-${width}.png`,fullPage:true});
    }
  }
});

test('tracking menu is usable without overflowing at tablet and mobile widths',async({page})=>{
  await page.route('https://api.forgecon.com.br/**',route=>route.fulfill({json:{}}));
  for(const width of [1440,1100,950,390]){
    await page.setViewportSize({width,height:900});await page.goto('/');
    expect(await page.locator('.nav-container').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
    if(width<=1180)await page.locator('#navToggle').click();
    await expect(page.locator('#navLinks').getByRole('link',{name:'Acompanhar pedido'})).toBeVisible();
    await page.locator('#navLinks').getByRole('link',{name:'Acompanhar pedido'}).click();await expect(page.locator('#accessForm')).toBeVisible();
  }
});
