'use strict';

const commerceLabels = {awaiting:'Aguardando',accepted:'Aprovado',declined:'Recusado',changes:'Ajustes solicitados',expired:'Expirado',superseded:'Substituído',pending:'A iniciar',production:'Em produção',ready:'Pronto',dispatched:'Enviado',delivered:'Entregue / retirado',cancelled:'Cancelado'};
const cash = cents => (cents/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
let savedQuotes = [];
let categories = [];
let revisionId = null;
let publication = null;
let currentQuote = null;
let paymentRequest = null;
const el = id => document.getElementById(id);
async function commerceApi(path, options) {
    const res = await workerFetch(path,options);
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || 'Não foi possível concluir.');
    return data;
}
async function downloadQuote(token, number) {
    const res = await workerFetch(`/quotes/public/${token}/pdf`);
    if(!res.ok) throw new Error('Não foi possível baixar o PDF. O orçamento continua salvo na guia Orçamentos.');
    const url=URL.createObjectURL(await res.blob());
    const a=document.createElement('a');a.href=url;a.download=`${number}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}

// Move existing cards without cloning inputs: values and calculator listeners survive navigation.
const calcCards = [...document.querySelectorAll('.calc-inputs-col > .calc-card')];
const stepLabels = ['Material e lote','Energia elétrica','Falhas','Custos operacionais','Modelagem','Orçamento'];
const sidebar = document.createElement('nav');sidebar.className='calc-sidebar';sidebar.setAttribute('aria-label','Etapas da calculadora');
sidebar.innerHTML=`<small>CALCULADORA</small>${calcCards.map((card,i)=>`<button type="button" data-calc-step="${i}" aria-controls="calcStep${i}">${String(i+1).padStart(2,'0')} <span>${stepLabels[i]}</span></button>`).join('')}`;
document.querySelector('.calc-layout').prepend(sidebar);
calcCards.forEach((card,i)=>{card.id=`calcStep${i}`;card.tabIndex=-1;});
function selectCalcStep(index, focus = false) {
    calcCards.forEach((card,i)=>card.classList.toggle('hidden',i!==index));
    sidebar.querySelectorAll('button').forEach((button,i)=>{button.classList.toggle('active',i===index);if(i===index)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
    if(focus)calcCards[index].focus({preventScroll:true});
}
sidebar.addEventListener('click',event=>{const button=event.target.closest('[data-calc-step]');if(button)selectCalcStep(Number(button.dataset.calcStep),true);});
selectCalcStep(0);
el('quotePdfBtn').textContent='Salvar orçamento e baixar PDF';
el('qClient').required=true;
el('qValidity').max='365';
el('quotePdfBtn').closest('.quote-actions').insertAdjacentHTML('afterend','<p id="publishMessage" role="status" class="field-hint"></p><p id="publishedLink"></p>');
el('qNotes').closest('.form-group').insertAdjacentHTML('beforebegin',`<div class="form-group"><label for="qDelivery">Recebimento do pedido</label><select id="qDelivery"><option value="delivery">Entrega</option><option value="pickup">Retirada no local — sem frete</option></select></div><div class="form-group"><label for="qDeliveryDetails">Local, prazo e condições de recebimento</label><textarea id="qDeliveryDetails" maxlength="500" rows="2" placeholder="Endereço de retirada ou entrega, horário e prazo combinado."></textarea></div>`);
el('qDelivery').addEventListener('change',()=>{const pickup=el('qDelivery').value==='pickup';el('cShipping').disabled=pickup;calcUpdate();});

window.publishQuote = async function() {
    const client=el('qClient');
    if(!client.reportValidity())return;
    const invalid=[...el('calcView').querySelectorAll('input[type="number"]')].find(input=>!input.disabled&&!input.validity.valid);
    if(invalid){const card=invalid.closest('.calc-card');selectCalcStep(calcCards.indexOf(card));invalid.reportValidity();return;}
    const form=readQuoteForm();
    const calculation=Object.fromEntries([...el('calcView').querySelectorAll('input[id^="c"],select[id^="c"]')].map(input=>[input.id,input.value]));
    const payload={client:form.client,phone:form.phone,items:form.items,payment:form.payment,notes:form.notes,validityDays:Number(el('qValidity').value),delivery:el('qDelivery').value,deliveryDetails:el('qDeliveryDetails').value,calculation,previousId:revisionId};
    const signature=JSON.stringify(payload);
    if(!publication||publication.signature!==signature)publication={signature,key:crypto.randomUUID(),quote:null};
    const pending=publication;
    el('quotePdfBtn').disabled=true;el('publishMessage').textContent='Salvando orçamento…';
    try {
        if(!pending.quote)pending.quote=(await commerceApi('/quotes',{method:'POST',body:JSON.stringify({...payload,requestKey:pending.key})})).quote;
        el('publishedLink').innerHTML=`<a href="${esc(pending.quote.link)}" target="_blank" rel="noopener">Abrir página do cliente · ${esc(pending.quote.number)}</a>`;
        el('publishMessage').textContent='Orçamento salvo. O link de resposta está dentro do PDF.';
        await downloadQuote(pending.quote.token,pending.quote.number);
    } catch(e){el('publishMessage').textContent=e.message;}finally{el('quotePdfBtn').disabled=false;}
};

for(const [name,label] of [['dashboard','Dashboard'],['quotes','Orçamentos'],['categories','Categorias']]) {
    const button=document.createElement('button');button.className='admin-nav-tab';button.dataset.view=name;button.textContent=label;
    el('adminNav').insertBefore(button,el('adminNav').querySelector('[data-view="users"]'));
    const panel=document.createElement('div');panel.id=`${name}View`;panel.className='hidden';document.querySelector('.admin-content').append(panel);
}
el('categoriesView').innerHTML=`<div class="content-header"><div><h1>Categorias</h1><p>Adicione e renomeie as categorias exibidas no catálogo e no site.</p></div></div><form id="categoryForm" class="commerce-toolbar"><label for="categoryName">Nova categoria</label><input id="categoryName" required maxlength="60" placeholder="Ex.: Brindes corporativos"><button class="btn btn-primary">Adicionar categoria</button></form><p id="categoryMessage" role="status"></p><div id="categoryList" class="commerce-list"></div>`;
window.loadAdminCategories = async function() {
    try {
        categories=(await commerceApi('/categories')).categories;
        const selected=el('fCategory').value;
        for(const key of Object.keys(CAT_LABELS))delete CAT_LABELS[key];
        categories.forEach(category=>{CAT_LABELS[category.id]=category.name;});
        el('fCategory').innerHTML='<option value="">Selecione…</option>'+categories.map(category=>`<option value="${esc(category.id)}">${esc(category.name)}</option>`).join('');
        el('fCategory').value=selected;
        el('catTabs').innerHTML=`<button class="cat-tab ${currentFilter==='all'?'active':''}" data-cat="all">Todos</button>`+categories.map(category=>`<button class="cat-tab ${currentFilter===category.id?'active':''}" data-cat="${esc(category.id)}">${esc(category.name)}</button>`).join('');
        el('categoryList').innerHTML=categories.map(category=>`<form class="category-row" data-category-id="${esc(category.id)}"><label class="sr-only" for="category-${esc(category.id)}">Nome da categoria</label><input id="category-${esc(category.id)}" name="name" value="${esc(category.name)}" required maxlength="60"><button class="btn btn-outline">Salvar nome</button><button class="btn btn-ghost" type="button" data-delete-category="${esc(category.id)}">Excluir</button></form>`).join('');
        renderGrid();
    }catch(e){el('categoryMessage').textContent=e.message;showToast('Não foi possível carregar as categorias.','error');}
};
el('categoryForm').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await commerceApi('/categories',{method:'POST',body:JSON.stringify({name:el('categoryName').value})});el('categoryName').value='';el('categoryMessage').textContent='Categoria adicionada.';await loadAdminCategories();}catch(e){el('categoryMessage').textContent=e.message;}finally{button.disabled=false;}});
el('categoryList').addEventListener('submit',async event=>{event.preventDefault();const button=event.submitter;button.disabled=true;try{await commerceApi(`/categories/${event.target.dataset.categoryId}`,{method:'PUT',body:JSON.stringify({name:event.target.elements.name.value})});await loadAdminCategories();el('categoryMessage').textContent='Nome atualizado.';}catch(e){el('categoryMessage').textContent=e.message;}finally{button.disabled=false;}});
el('categoryList').addEventListener('click',async event=>{const button=event.target.closest('[data-delete-category]');if(!button)return;if(!confirm('Excluir esta categoria? Categorias vinculadas a produtos serão preservadas.'))return;button.disabled=true;try{await commerceApi(`/categories/${button.dataset.deleteCategory}`,{method:'DELETE'});await loadAdminCategories();}catch(e){el('categoryMessage').textContent=e.message;}finally{button.disabled=false;}});

el('quotesView').innerHTML=`<div class="content-header"><div><h1>Orçamentos</h1><p>Propostas, respostas dos clientes e andamento dos pedidos.</p></div><div><button class="btn btn-outline" id="refreshQuotes">Atualizar</button> <button class="btn btn-primary" id="newQuote">Novo orçamento</button></div></div><div class="commerce-toolbar"><label for="quoteSearch">Buscar</label><input id="quoteSearch" placeholder="Cliente, número ou produto"><label for="quoteFilter">Situação</label><select id="quoteFilter"><option value="all">Todos</option>${['awaiting','accepted','declined','changes','expired','superseded'].map(status=>`<option value="${status}">${commerceLabels[status]}</option>`).join('')}</select></div><p id="quotesMessage" role="status"></p><div id="savedQuotes" class="commerce-grid"></div><dialog id="quoteDetail"><button class="btn btn-outline" id="closeQuoteDetail">Fechar</button><div id="quoteDetailBody"></div><p id="quoteDetailMessage" role="status"></p></dialog>`;
function renderSavedQuotes() {
    const search=el('quoteSearch').value.toLocaleLowerCase('pt-BR'); const status=el('quoteFilter').value;
    const filtered=savedQuotes.filter(q=>(status==='all'||status===q.status)&&[q.number,q.document.client,...q.document.items.map(item=>item.name)].join(' ').toLocaleLowerCase('pt-BR').includes(search));
    el('savedQuotes').innerHTML=filtered.length?filtered.map(q=>`<article class="commerce-card"><div class="commerce-card-top"><small>${esc(q.number)}</small><span class="status-badge ${q.status}">${commerceLabels[q.status]}</span></div><h2>${esc(q.document.client)}</h2><p>${esc(q.document.items[0]?.name)}</p><strong class="commerce-value">${cash(q.document.totalCents)}</strong><p>${q.status==='accepted'?`${commerceLabels[q.orderStatus]} · Recebido ${cash(q.paidCents)}`:`Validade: ${esc(q.document.validUntil)}`}</p>${q.emailStatus==='pending'?'<p class="commerce-warning">Cópia por e-mail pendente</p>':''}<button class="btn btn-outline" data-open-quote="${q.id}">Ver orçamento e pedido</button></article>`).join(''):'<p>Nenhum orçamento encontrado.</p>';
}
async function loadQuotes() {
    el('quotesMessage').textContent='Carregando…';
    try{const list=[];let offset=0;do{const data=await commerceApi(`/quotes?offset=${offset}`);list.push(...data.quotes);offset=data.nextOffset;}while(offset!==null);savedQuotes=list;renderSavedQuotes();el('quotesMessage').textContent=`${list.length} orçamento(s) salvo(s).`;}catch(e){el('quotesMessage').textContent=e.message;}
}
async function openQuote(id) {
    const data=await commerceApi(`/quotes/${id}`);currentQuote=data.quote;paymentRequest=null;
    const q=data.quote;const d=q.document;const paid=data.payments.reduce((sum,p)=>sum+p.amount_cents,0);
    const transitions={pending:['production','cancelled'],production:['ready','cancelled'],ready:d.delivery==='pickup'?['delivered','cancelled']:['dispatched','delivered','cancelled'],dispatched:['delivered'],delivered:[],cancelled:[]};
    el('quoteDetailBody').innerHTML=`<h2>${esc(q.number)} · ${esc(d.client)}</h2><p class="status-badge ${q.status}">${commerceLabels[q.status]}</p>${d.items.map(item=>`<p><strong>${esc(item.name)}</strong> — ${item.quantity} × ${cash(item.unitCents)} = ${cash(item.totalCents)}<br>${esc(item.description)}</p>`).join('')}<h3>Total ${cash(d.totalCents)}</h3><p>${d.delivery==='pickup'?'Retirada no local — sem frete':'Entrega'} · ${esc(d.deliveryDetails)}</p><p>Pagamento: ${esc(d.payment)}</p><p class="preserve-lines">${esc(d.notes)}</p><div class="commerce-toolbar"><button class="btn btn-primary" data-download-quote>Baixar PDF</button><a class="btn btn-outline" href="${esc(q.link)}" target="_blank" rel="noopener">Página do cliente</a>${['awaiting','changes','declined','expired'].includes(q.status)?'<button class="btn btn-outline" data-revise-quote>Criar revisão</button>':''}</div>${q.response?`<h3>Resposta do cliente</h3><p>${esc(q.response.name)} (${esc(q.response.email)})</p><p>${esc(q.response.message)}</p><p class="hash-text">Hash: ${esc(q.receiptHash)}</p><button class="btn btn-outline" data-retry-mail>Reenviar cópia pendente</button>`:''}${q.status==='accepted'?`<h3>Produção e recebimentos</h3><p>Situação: ${commerceLabels[q.orderStatus]}</p>${transitions[q.orderStatus].length?`<form id="orderStatusForm" class="commerce-toolbar"><label for="orderStatus">Próxima etapa</label><select id="orderStatus">${transitions[q.orderStatus].map(status=>`<option value="${status}">${commerceLabels[status]}</option>`).join('')}</select><button class="btn btn-outline">Atualizar pedido</button></form>`:''}<p>Recebido: ${cash(paid)} · Saldo: ${cash(d.totalCents-paid)}</p>${paid<d.totalCents&&q.orderStatus!=='cancelled'?'<form id="paymentForm" class="commerce-toolbar"><label for="paymentAmount">Valor recebido (R$)</label><input id="paymentAmount" type="number" min="0.01" step="0.01" required><label for="paymentNote">Identificação</label><input id="paymentNote" maxlength="300" placeholder="Ex.: Entrada via Pix"><button class="btn btn-primary">Registrar recebimento</button></form>':''}<ul>${data.payments.map(p=>`<li>${cash(p.amount_cents)} · ${new Date(p.created_at*1000).toLocaleString('pt-BR')} · ${esc(p.note)}</li>`).join('')}</ul>`:''}<h3>Histórico</h3><ul>${data.events.map(event=>{const detail=JSON.parse(event.details);return `<li>${new Date(event.created_at*1000).toLocaleString('pt-BR')} · ${esc(event.event==='published'?'Publicado':event.event==='order'?commerceLabels[detail.status]:commerceLabels[event.event]||event.event)} ${esc(detail.message||'')}</li>`;}).join('')}</ul>`;
    el('quoteDetailMessage').textContent='';if(!el('quoteDetail').open)el('quoteDetail').showModal();
    el('orderStatusForm')?.addEventListener('submit',async event=>{event.preventDefault();if(el('orderStatus').value==='cancelled'&&!confirm('Cancelar a produção deste pedido? Os valores já recebidos permanecem no histórico financeiro.'))return;event.submitter.disabled=true;try{await commerceApi(`/quotes/${q.id}/order`,{method:'PUT',body:JSON.stringify({status:el('orderStatus').value,version:q.version})});await openQuote(q.id);await loadQuotes();}catch(e){el('quoteDetailMessage').textContent=e.message;}finally{event.submitter.disabled=false;}});
    el('paymentForm')?.addEventListener('submit',async event=>{event.preventDefault();const payload={amount:Number(el('paymentAmount').value),note:el('paymentNote').value};const signature=JSON.stringify(payload);if(!paymentRequest||paymentRequest.signature!==signature)paymentRequest={signature,key:crypto.randomUUID()};event.submitter.disabled=true;try{await commerceApi(`/quotes/${q.id}/payments`,{method:'POST',body:JSON.stringify({...payload,requestKey:paymentRequest.key})});await openQuote(q.id);await loadQuotes();}catch(e){el('quoteDetailMessage').textContent=e.message;}finally{event.submitter.disabled=false;}});
}
el('closeQuoteDetail').onclick=()=>el('quoteDetail').close();
el('savedQuotes').addEventListener('click',async event=>{const button=event.target.closest('[data-open-quote]');if(!button)return;button.disabled=true;try{await openQuote(button.dataset.openQuote);}catch(e){el('quotesMessage').textContent=e.message;}finally{button.disabled=false;}});
el('quoteDetailBody').addEventListener('click',async event=>{const button=event.target.closest('button');if(!button)return;try{if(button.hasAttribute('data-download-quote'))await downloadQuote(currentQuote.token,currentQuote.number);if(button.hasAttribute('data-retry-mail')){button.disabled=true;const r=await commerceApi(`/quotes/${currentQuote.id}/retry-email`,{method:'POST'});el('quoteDetailMessage').textContent=r.mail?.status==='sent'?'Cópia enviada.':r.mail?.last_error||'Envio pendente.';}if(button.hasAttribute('data-revise-quote'))startRevision(currentQuote);}catch(e){el('quoteDetailMessage').textContent=e.message;}finally{button.disabled=false;}});
function startRevision(q) {
    el('quoteDetail').close();revisionId=q.id;publication=null;
    for(const [id,value] of Object.entries(q.calculation)){const input=el(id);if(input&&/^c[A-Z]/.test(id))input.value=String(value);}
    el('qClient').value=q.document.client;el('qPhone').value=q.document.phone;el('qPayment').value=q.document.payment;el('qNotes').value=q.document.notes;
    el('qDelivery').value=q.document.delivery;el('qDeliveryDetails').value=q.document.deliveryDetails;el('cShipping').disabled=q.document.delivery==='pickup';
    el('qIncludeCalculated').checked=false;
    quoteItems=q.document.items.map(item=>({id:++quoteItemSequence,name:item.name,description:item.description,quantity:item.quantity,unitPrice:item.unitCents/100}));renderQuoteItems();calcUpdate();
    el('publishMessage').textContent=`Revisão de ${q.number}. Revise os valores; ao publicar, o link anterior será encerrado.`;el('publishedLink').textContent='';
    document.querySelector('[data-view="calc"]').click();selectCalcStep(5,true);
}
el('newQuote').onclick=()=>{revisionId=null;publication=null;el('qClient').value='';el('qPhone').value='';el('qNotes').value='';el('qDeliveryDetails').value='';quoteItems=[];el('qIncludeCalculated').checked=true;renderQuoteItems();el('publishMessage').textContent='Novo orçamento. Confira os custos atuais da calculadora.';el('publishedLink').textContent='';document.querySelector('[data-view="calc"]').click();selectCalcStep(5,true);};
el('refreshQuotes').onclick=loadQuotes;el('quoteSearch').oninput=renderSavedQuotes;el('quoteFilter').onchange=renderSavedQuotes;

el('dashboardView').innerHTML=`<div class="content-header"><div><h1>Visão do negócio</h1><p>Orçamentos aprovados, dinheiro recebido e andamento da produção.</p></div></div><form id="dashboardPeriod" class="commerce-toolbar"><label for="dashStart">De</label><input id="dashStart" type="date"><label for="dashEnd">Até</label><input id="dashEnd" type="date"><button class="btn btn-outline">Atualizar</button></form><p id="dashboardMessage" role="status"></p><div id="dashboardMetrics" class="commerce-grid"></div><div class="commerce-grid"><section class="commerce-card"><h2>Orçamentos emitidos</h2><div id="dashboardQuotes"></div></section><section class="commerce-card"><h2>Pedidos aprovados</h2><div id="dashboardOrders"></div></section><section class="commerce-card"><h2>Recebimentos por mês</h2><div id="dashboardMonthly"></div></section></div>`;
async function loadDashboard() {
    el('dashboardMessage').textContent='Carregando indicadores…';
    try{const data=await commerceApi(`/dashboard?start=${el('dashStart').value}&end=${el('dashEnd').value}`);
        const values=[['Valor aprovado',cash(data.approved.cents),'Aceites no período, sem pedidos cancelados.'],['Recebido',cash(data.received.cents),'Pagamentos registrados no período.'],['Saldo a receber',cash(data.balance.cents),'Todos os pedidos aprovados e ativos.'],['Ticket médio aprovado',cash(data.approved.count?Math.round(data.approved.cents/data.approved.count):0),'Valor aprovado ÷ quantidade aprovada.']];
        el('dashboardMetrics').innerHTML=values.map(([label,value,hint])=>`<article class="commerce-card"><p>${label}</p><strong class="commerce-value">${value}</strong><p class="field-hint">${hint}</p></article>`).join('');
        el('dashboardQuotes').innerHTML=data.quotes.map(row=>`<p>${commerceLabels[row.status]}: <strong>${row.count}</strong> · ${cash(row.cents)}</p>`).join('')||'<p>Nenhum orçamento no período.</p>';
        el('dashboardOrders').innerHTML=data.orders.map(row=>`<p>${commerceLabels[row.status]}: <strong>${row.count}</strong></p>`).join('')||'<p>Nenhum pedido aprovado no período.</p>';
        el('dashboardMonthly').innerHTML=data.monthly.map(row=>`<p>${row.month}: <strong>${cash(row.cents)}</strong></p>`).join('')||'<p>Nenhum recebimento registrado.</p>';
        el('dashboardMessage').textContent='Orçamentos por emissão; pedidos por data de aprovação; recebimentos por data de registro. Pedidos pelo WhatsApp entram após cadastro do orçamento no painel.';
    }catch(e){el('dashboardMessage').textContent=e.message;}
}
el('dashboardPeriod').onsubmit=event=>{event.preventDefault();loadDashboard();};
window.loadCommerceView=view=>view==='categories'?loadAdminCategories():view==='quotes'?loadQuotes():loadDashboard();
window.addEventListener('forgecon:ready', loadAdminCategories);
if (window.forgeconReady) loadAdminCategories();
