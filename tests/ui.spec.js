import { test, expect } from '@playwright/test';
const product={id:1,name:'Chaveiro teste',category:'geek',desc:'Peça de teste',price:5,colors:['Preto'],weight:20,dimensions:{length:10,width:10,height:5}};
const categories=[{id:'geek',name:'Geek'},{id:'cat-brindes',name:'Brindes novos'}];
async function mockApi(page) {
  await page.route('https://api.forgecon.com.br/**',route=>{
    const path=new URL(route.request().url()).pathname;
    const data=path==='/auth/me'?{user:{id:1,name:'Admin',email:'admin@example.com',role:'admin'}}:path==='/products'?{products:[product]}:path==='/categories'?{categories}:path==='/settings'?{settings:{whatsapp:'11950280670'}}:path==='/quotes'?{quotes:[],nextOffset:null}:path==='/dashboard'?{quotes:[],orders:[],monthly:[],approved:{count:0,cents:0},received:{cents:0},balance:{cents:0}}:{};
    return route.fulfill({json:data});
  });
}
test('calculator steps retain all costs; pickup zeros shipping and categories load dynamically',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await mockApi(page);
  await page.addInitScript(()=>sessionStorage.setItem('forgecon_token','admin'));
  await page.goto('/admin/');await page.getByRole('button',{name:'Calculadora de Custo',exact:true}).click();
  await page.locator('#cQty').fill('100');await page.locator('#cBatchQty').fill('20');
  await page.locator('[data-calc-step="1"]').click();await page.locator('#cHours').fill('2');
  await page.locator('[data-calc-step="3"]').click();await page.locator('#cAccessory').fill('0.50');await page.locator('#cPackaging').fill('2');await page.locator('#cShipping').fill('20');
  await expect(page.locator('#rTotal')).toHaveText('R$ 43,12');
  await page.locator('[data-calc-step="5"]').click();await expect(page.locator('#qGrandTotal')).toHaveText('R$ 43,20');
  await page.locator('#qDelivery').selectOption('pickup');await expect(page.locator('#rShipping')).toHaveText('R$ 0,00');await expect(page.locator('#qGrandTotal')).toHaveText('R$ 23,20');
  await page.locator('[data-calc-step="0"]').click();await expect(page.locator('#cQty')).toHaveValue('100');
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:'/tmp/forgecon-admin-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/forgecon-admin-mobile.png',fullPage:true});
  await page.locator('[data-calc-step="5"]').click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Categorias',exact:true}).click();await expect(page.locator('#categoryList')).toContainText('Salvar nome');await expect(page.locator('#fCategory option[value="cat-brindes"]')).toHaveText('Brindes novos');
  await page.getByRole('button',{name:'Dashboard',exact:true}).click();await expect(page.locator('#dashboardMetrics')).toContainText('Saldo a receber');
  expect(errors).toEqual([]);
});
test('store pickup needs no postal code, zeros cached freight and generates pickup message',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await mockApi(page);
  await page.addInitScript(()=>localStorage.setItem('forgecon_cart',JSON.stringify([{key:'old',productId:1,name:'Chaveiro teste',price:5,qty:1,shipping:{name:'Jadlog Package',price:'R$ 80,00'},cep:'01001000'}])));
  await page.goto('/produtos/');await expect(page.locator('.filter-btn[data-filter="cat-brindes"]')).toHaveText('Brindes novos');
  await page.locator('.product-card').first().click();await page.locator('#productDeliveryMode').selectOption('pickup');
  await expect(page.locator('#shippingCep')).toBeHidden();await page.locator('#modalAddCart').click();
  await expect(page.locator('#cartDeliveryMode')).toHaveValue('pickup');await expect(page.locator('#cartDeliveryCep')).toBeHidden();await expect(page.locator('#cartShippingTotal')).toContainText('R$ 0,00');
  await page.locator('#cartCustomerName').fill('Cliente');await page.locator('#cartCustomerPhone').fill('11999999999');
  const message=await page.evaluate(()=>buildCartMessage());expect(message).toContain('Retirada no local');expect(message).not.toContain('CEP:');expect(message).not.toContain('Jadlog');
  expect(await page.evaluate(()=>validateDeliveryData(getDeliveryData()))).toBe('');
  await page.screenshot({path:'/tmp/forgecon-pickup.png',fullPage:true});expect(errors).toEqual([]);
});
test('public budget shows complete terms, verifies email before decision and displays receipt',async({page})=>{
  const token='a'.repeat(64);
  const quote={id:'1',number:'ORC-TESTE',status:'awaiting',documentHash:'b'.repeat(64),document:{client:'Cliente teste',date:'06/09/2026',validUntil:'13/09/2026',items:[{name:'Chaveiros',description:'PLA preto, com argola',quantity:20,unitCents:535,totalCents:10700}],totalCents:10700,delivery:'pickup',deliveryDetails:'Retirada agendada',payment:'Pix',notes:'Produção em cinco dias úteis.'}};
  await page.route(`https://api.forgecon.com.br/quotes/public/${token}**`,async route=>{const path=new URL(route.request().url()).pathname;if(path.endsWith('/respond'))return route.fulfill({json:{quote:{...quote,status:'accepted',receiptHash:'c'.repeat(64),response:{action:'accepted',name:'Cliente',email:'client@example.com',at:1788700000,code:'ACE-1234',message:''}},emailStatus:'sent'}});return route.fulfill({json:path.endsWith('/code')?{ok:true}:{quote}});});
  await page.goto(`/proposta/#${token}`);await expect(page.locator('#document')).toContainText('R$ 107,00');
  await page.locator('#name').fill('Cliente');await page.locator('#email').fill('client@example.com');await page.locator('#sendCode').click();await expect(page.locator('#formMessage')).toContainText('Código enviado');
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'/tmp/forgecon-public-mobile.png',fullPage:true});
  await page.locator('#code').fill('123456');await page.locator('#consent').check();await page.locator('#respond').click();await expect(page.locator('#receipt')).toContainText('ACE-1234');await expect(page.locator('#responseSection')).toBeHidden();
});
