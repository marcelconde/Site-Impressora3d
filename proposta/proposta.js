'use strict';
const token = location.hash.slice(1);
const api = `https://api.forgecon.com.br/quotes/public/${encodeURIComponent(token)}`;
const $ = id => document.getElementById(id);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = cents => (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const labels = {awaiting:'Aguardando sua resposta',accepted:'Aprovado',declined:'Recusado',changes:'Ajustes solicitados',expired:'Prazo encerrado',superseded:'Substituído por uma nova versão'};
async function request(path = '', data) {
  const res = await fetch(api+path,{method:data?'POST':'GET',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined,cache:'no-store'});
  const result = await res.json(); if(!res.ok) throw new Error(result.error || 'Não foi possível concluir.'); return result;
}
function render(q) {
  const d=q.document;
  $('document').hidden=false;
  $('document').innerHTML=`<p class="status">${escape(labels[q.status])}</p><h1>Orçamento ${escape(q.number)}</h1><p>Preparado para <strong>${escape(d.client)}</strong></p><p>Emissão: ${escape(d.date)} · Validade: ${escape(d.validUntil)}</p>${d.items.map(item=>`<div class="item"><h3>${escape(item.name)}</h3><p>${escape(item.description)}</p><p>${item.quantity} un. × ${money(item.unitCents)} <strong>— ${money(item.totalCents)}</strong></p></div>`).join('')}<p class="total">${money(d.totalCents)}</p><h2>${d.delivery==='pickup'?'Retirada no local · sem frete':'Entrega'}</h2><p class="conditions">${escape(d.deliveryDetails || 'Local e horário a combinar com a Forgecon.')}</p><h2>Pagamento</h2><p class="conditions">${escape(d.payment)}</p><h2>Observações</h2><p class="conditions">${escape(d.notes || 'A combinar')}</p><small>Hash do orçamento: ${escape(q.documentHash)}</small>`;
  $('responseSection').hidden=q.status!=='awaiting';
  $('download').hidden=false; $('verify').hidden=false;
  $('pageMessage').textContent=q.status==='expired'?'Solicite à Forgecon um orçamento com nova validade.':q.status==='superseded'?'Consulte o novo link enviado pela Forgecon.':'';
  if(q.response){const r=q.response;$('receipt').hidden=false;$('receipt').innerHTML=`<h2>${r.action==='accepted'?'Aceite eletrônico':'Resposta registrada'}</h2><p>${escape(r.name)} · ${escape(r.email)}</p><p>${escape(new Date(r.at*1000).toLocaleString('pt-BR'))}</p><p>${escape(r.message)}</p><p>Código: ${escape(r.code)}</p><p>Hash de integridade: ${escape(q.receiptHash)}</p><small>E-mail confirmado por código. O hash identifica a integridade deste registro; não é uma assinatura digital certificada.</small>`;}
}
$('decision').addEventListener('change',()=>{const accept=$('decision').value==='accepted';$('consent').required=accept;$('consent').closest('label').hidden=!accept;$('message').required=$('decision').value==='changes';$('respond').textContent=accept?'Confirmar aprovação':$('decision').value==='changes'?'Enviar pedido de ajustes':'Confirmar recusa';});
$('sendCode').addEventListener('click',async()=>{
  if(!$('email').reportValidity())return;
  $('sendCode').disabled=true;$('formMessage').textContent='Enviando código…';
  try{await request('/code',{email:$('email').value});$('formMessage').textContent='Código enviado. Confira sua caixa de entrada e o spam.';}catch(e){$('formMessage').textContent=e.message;}finally{$('sendCode').disabled=false;}
});
$('responseForm').addEventListener('submit',async event=>{
  event.preventDefault();$('respond').disabled=true;$('formMessage').textContent='Registrando resposta…';
  try{const r=await request('/respond',{name:$('name').value,email:$('email').value,code:$('code').value,action:$('decision').value,message:$('message').value,consent:$('consent').checked});render(r.quote);$('pageMessage').textContent=r.emailStatus==='sent'?'Resposta registrada. Enviamos a cópia ao seu e-mail.':'Resposta registrada. Sua cópia está disponível abaixo; o envio por e-mail está pendente e será tentado novamente.';}
  catch(e){$('formMessage').textContent=e.message;}finally{$('respond').disabled=false;}
});
$('download').addEventListener('click',async()=>{ $('download').disabled=true;try{const res=await fetch(api+'/pdf');if(!res.ok)throw new Error('Falha ao baixar PDF.');const url=URL.createObjectURL(await res.blob());const a=document.createElement('a');a.href=url;a.download='orcamento-forgecon.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}catch(e){$('pageMessage').textContent=e.message;}finally{$('download').disabled=false;}});
$('verify').addEventListener('click',async()=>{try{const r=await request('/verify');$('pageMessage').textContent=r.validDocument&&r.validReceipt!==false?'Integridade confirmada: documento e registro correspondem aos hashes armazenados.':'Não foi possível confirmar a integridade. Contate a Forgecon.';}catch(e){$('pageMessage').textContent=e.message;}});
if(!/^[a-f0-9]{64}$/.test(token))$('pageMessage').textContent='Link inválido. Abra o link completo recebido no PDF.';
else request().then(r=>render(r.quote)).catch(e=>{$('pageMessage').textContent=e.message;});
