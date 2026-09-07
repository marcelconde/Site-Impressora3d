'use strict';
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = cents => (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const date = at => new Date(at*1000).toLocaleString('pt-BR',{timeZone:'America/Recife'});
let token = '';
let loading = false;
async function request(path,body) {
  const res=await fetch('https://api.forgecon.com.br/orders'+path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined,cache:'no-store',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000)});
  const data=await res.json();
  if(!res.ok)throw new Error(data.error||'Não foi possível consultar o pedido. Tente novamente.');
  return data;
}
function render(o) {
  const pickup=o.delivery==='pickup';
  const labels={accepted:'Orçamento aprovado',pending:'Aguardando produção',production:'Em produção',ready:pickup?'Pronto para retirada':'Pronto para envio',dispatched:'Enviado pelos Correios',delivered:pickup?'Retirado pelo cliente':'Entregue',completed:'Pedido concluído',cancelled:'Pedido cancelado'};
  const steps=['pending','production','ready',...(pickup?[]:['dispatched']),'delivered','completed'];
  const active=steps.indexOf(o.status);
  $('orderPanel').innerHTML=`<article>
    <div class="order-top"><div><small>SEU PEDIDO</small><h2>${escape(o.number)}</h2><p>Olá, ${escape(o.name)}.</p></div><span class="status-tag ${escape(o.status)}">${escape(labels[o.status])}</span></div>
    ${o.status==='cancelled'?'<p class="notice">Pedido cancelado. Os pagamentos permanecem registrados. Combine eventuais reembolsos com a Forgecon.</p>':`<ol class="steps" aria-label="Etapas do pedido">${steps.map((s,i)=>`<li class="${i<active?'done':i===active?'current':''}" ${i===active?'aria-current="step"':''}>${escape(labels[s])}</li>`).join('')}</ol>`}
    <div class="metrics"><div><span>Total do pedido</span><strong>${money(o.totalCents)}</strong></div><div><span>Pagamento recebido</span><strong>${money(o.paidCents)}</strong></div><div><span>${o.status==='cancelled'?'Diferença não recebida':'Saldo a pagar'}</span><strong>${money(o.totalCents-o.paidCents)}</strong></div></div>
    <p class="privacy">${o.paidCents>=o.totalCents?'Pagamento integral registrado.':o.paidCents?'Pagamento parcial registrado.':'Nenhum pagamento registrado até o momento.'} Valores informados pela Forgecon.</p>
    <h3>${pickup?'Retirada no local':'Entrega pelos Correios'}</h3><p class="conditions">${escape(o.deliveryDetails||'Local e horário a combinar com a Forgecon.')}</p>
    ${pickup&&o.status==='ready'?'<p class="notice">Sua peça está pronta! Combine o horário de retirada com a Forgecon.</p>':''}
    ${o.trackingCode?`<div class="tracking"><h3>Código de rastreio</h3><code>${escape(o.trackingCode)}</code><br><a href="https://rastreamento.correios.com.br/app/index.php" target="_blank" rel="noopener noreferrer">Consultar nos Correios</a><p class="privacy">Copie o código e cole na consulta dos Correios. A postagem pode levar algum tempo para aparecer.</p></div>`:''}
    </article><section><h2>Seu pedido</h2>${o.items.map(item=>`<div class="order-item"><p><strong>${escape(item.name)}</strong><small>${escape(item.description)}</small><small>${item.quantity} un. × ${money(item.unitCents)}</small></p><strong>${money(item.totalCents)}</strong></div>`).join('')}<p><a href="/proposta/#${token}">Ver orçamento e comprovante de aprovação</a></p></section>
    <section><h2>Histórico do pedido</h2><ol class="timeline">${[...o.timeline].reverse().map(event=>`<li><time datetime="${new Date(event.at*1000).toISOString()}">${escape(date(event.at))} · Brasília</time><p>${escape(event.kind==='payment'?'Pagamento recebido: '+money(event.amountCents):event.trackingChanged?'Rastreio atualizado':labels[event.status||event.kind])}</p>${event.trackingCode?`<small>Rastreio: ${escape(event.trackingCode)}</small>`:''}</li>`).join('')}</ol></section>`;
  $('orderPanel').hidden=false;
  $('orderActions').hidden=false;
  $('accessSection').hidden=true;
}
async function load() {
  if(loading)return;
  loading=true;$('refresh').disabled=true;$('pageMessage').textContent='Consultando seu pedido…';
  try {const data=await request('/'+token);render(data.order);$('pageMessage').textContent='Informações atualizadas agora.';}
  catch(e){$('pageMessage').textContent=e.name==='TimeoutError'?'A consulta demorou. Tente novamente.':e.message;$('orderActions').hidden=false;if($('orderPanel').hidden)$('accessSection').hidden=false;else $('pageMessage').textContent+=' Os dados abaixo são da última consulta.';}
  finally{loading=false;$('refresh').disabled=false;}
}
$('accessForm').addEventListener('submit',async event=>{
  event.preventDefault();$('sendAccess').disabled=true;$('accessMessage').textContent='Solicitando link…';
  try{const data=await request('/access',{email:$('email').value,number:$('number').value});$('accessMessage').textContent=data.message;}
  catch(e){$('accessMessage').textContent=e.name==='TimeoutError'?'A solicitação demorou. Confira seu e-mail antes de tentar novamente.':e.message;}
  finally{$('sendAccess').disabled=false;}
});
$('refresh').onclick=load;
$('leave').onclick=()=>{location.href='/acompanhar/';};
function openLink(){
  token=location.hash.slice(1);
  $('orderPanel').hidden=true;$('orderActions').hidden=true;$('pageMessage').textContent='';
  if(/^[a-f0-9]{64}$/.test(token)){$('accessSection').hidden=true;load();}
  else{$('accessSection').hidden=false;if(token)$('pageMessage').textContent='Link inválido. Solicite outro link usando o formulário acima.';}
}
window.addEventListener('hashchange',()=>location.reload());
openLink();
