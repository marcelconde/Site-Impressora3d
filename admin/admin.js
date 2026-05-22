/* ── CONFIG ─────────────────────────────────────────────── */
const CONFIG = {
    passwordHash: '9a746577e31a49afb2e11da31af438be9cec053a39e8db95bf4494a3672fcf8f',
    cloudName: 'das730gjc',
    uploadPreset: 'print3d_upload',
    storageKey: 'print3d_products',
};

const CLD_URL = (publicId, w = 600, h = 450) =>
    `https://res.cloudinary.com/${CONFIG.cloudName}/image/upload/w_${w},h_${h},c_fill,q_auto,f_auto/Produtos/${publicId}`;

/* ── STATE ──────────────────────────────────────────────── */
let products = [];
let currentFilter = 'all';
let editingId = null;
let pendingDeleteId = null;
let currentColors = [];
let extraImages = [];

/* ── STORAGE ────────────────────────────────────────────── */
function loadProducts() {
    try {
        const raw = localStorage.getItem(CONFIG.storageKey);
        products = raw ? JSON.parse(raw) : [];
    } catch {
        products = [];
    }
}

function saveProducts() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(products));
}

function nextId() {
    return products.length ? Math.max(...products.map(p => p.id)) + 1 : 1;
}

/* ── AUTH ───────────────────────────────────────────────── */
const loginScreen = document.getElementById('loginScreen');
const adminPanel  = document.getElementById('adminPanel');
const loginForm   = document.getElementById('loginForm');
const loginError  = document.getElementById('loginError');
const togglePw    = document.getElementById('togglePw');
const loginPw     = document.getElementById('loginPassword');
const logoutBtn   = document.getElementById('logoutBtn');

function isLoggedIn() {
    return sessionStorage.getItem('print3d_auth') === '1';
}

function showPanel() {
    loginScreen.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    loadProducts();
    renderGrid();
    updateStats();
}

function showLogin() {
    sessionStorage.removeItem('print3d_auth');
    adminPanel.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginPw.value = '';
    loginError.textContent = '';
}

togglePw.addEventListener('click', () => {
    loginPw.type = loginPw.type === 'password' ? 'text' : 'password';
    togglePw.textContent = loginPw.type === 'password' ? '👁' : '🙈';
});

loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const hash = await sha256(loginPw.value);
    if (hash === CONFIG.passwordHash) {
        sessionStorage.setItem('print3d_auth', '1');
        loginError.textContent = '';
        showPanel();
    } else {
        loginError.textContent = 'Senha incorreta. Tente novamente.';
        loginPw.value = '';
        loginPw.focus();
    }
});

async function sha256(str) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

logoutBtn.addEventListener('click', showLogin);

if (isLoggedIn()) {
    showPanel();
}

/* ── STATS ──────────────────────────────────────────────── */
function updateStats() {
    document.getElementById('statTotal').textContent = products.length;
    const cats = new Set(products.map(p => p.category)).size;
    document.getElementById('statCats').textContent = cats;
    const withPhoto = products.filter(p => p.image).length;
    document.getElementById('statPhotos').textContent = withPhoto;
}

/* ── CATEGORY TABS ──────────────────────────────────────── */
document.getElementById('catTabs').addEventListener('click', e => {
    const btn = e.target.closest('.cat-tab');
    if (!btn) return;
    document.querySelectorAll('.cat-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.cat;
    renderGrid();
});

/* ── GRID RENDER ────────────────────────────────────────── */
function renderGrid() {
    const grid   = document.getElementById('adminGrid');
    const empty  = document.getElementById('emptyState');
    const subtitle = document.getElementById('contentSubtitle');

    const filtered = currentFilter === 'all'
        ? products
        : products.filter(p => p.category === currentFilter);

    subtitle.textContent = currentFilter === 'all'
        ? `${products.length} produto${products.length !== 1 ? 's' : ''} cadastrado${products.length !== 1 ? 's' : ''}`
        : `${filtered.length} produto${filtered.length !== 1 ? 's' : ''} em "${currentFilter}"`;

    if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }

    empty.classList.add('hidden');
    grid.innerHTML = filtered.map(cardHTML).join('');

    grid.querySelectorAll('.edit-btn').forEach(btn =>
        btn.addEventListener('click', () => openModal(+btn.dataset.id)));
    grid.querySelectorAll('.delete-btn').forEach(btn =>
        btn.addEventListener('click', () => confirmDelete(+btn.dataset.id)));
}

const CAT_LABELS = {
    geek: 'Geek', decoracao: 'Decoração', ferramentas: 'Ferramentas',
    organizacao: 'Organização', gadgets: 'Gadgets', personalizados: 'Personalizados',
};

const CAT_PV = {
    geek: 'pv-geek', decoracao: 'pv-decor', ferramentas: 'pv-tools',
    organizacao: 'pv-org', gadgets: 'pv-gadgets', personalizados: 'pv-custom',
};

function cardHTML(p) {
    const imgTag = p.image
        ? `<img src="${CLD_URL(p.image, 300, 220)}" alt="${esc(p.name)}" loading="lazy">`
        : `<span>${p.emoji || '📦'}</span>`;
    const price = p.price != null
        ? `<strong>R$ ${Number(p.price).toFixed(2).replace('.', ',')}</strong>`
        : 'Consultar preço';
    const photoBadge = p.image
        ? `<span class="has-photo-badge">✓ Foto</span>`
        : `<span class="no-photo-badge">Sem foto</span>`;
    const pvClass = CAT_PV[p.category] || 'pv-geek';

    return `
    <div class="admin-card" data-id="${p.id}">
        <div class="admin-card-img ${pvClass}">
            ${imgTag}
            ${photoBadge}
        </div>
        <div class="admin-card-body">
            <p class="admin-card-cat">${CAT_LABELS[p.category] || p.category}</p>
            <h3 class="admin-card-name">${esc(p.name)}</h3>
            <p class="admin-card-price">${price}</p>
        </div>
        <div class="admin-card-actions">
            <button class="btn btn-edit btn-sm edit-btn" data-id="${p.id}">✏ Editar</button>
            <button class="btn btn-del btn-sm delete-btn" data-id="${p.id}">🗑 Excluir</button>
        </div>
    </div>`;
}

function esc(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── ADD FROM EMPTY STATE ───────────────────────────────── */
document.getElementById('addProductBtn').addEventListener('click', () => openModal());
document.getElementById('addFromEmpty').addEventListener('click', () => openModal());

/* ── MODAL ──────────────────────────────────────────────── */
const productModal = document.getElementById('productModal');
const modalTitle   = document.getElementById('modalTitle');
const productForm  = document.getElementById('productForm');
const cancelBtn    = document.getElementById('cancelBtn');
const modalClose   = document.getElementById('modalClose');

function openModal(id) {
    editingId = id ?? null;
    currentColors = [];
    resetForm();

    if (id != null) {
        const p = products.find(x => x.id === id);
        if (!p) return;
        modalTitle.textContent = 'Editar Produto';
        document.getElementById('editId').value = p.id;
        document.getElementById('fName').value = p.name || '';
        document.getElementById('fCategory').value = p.category || '';
        document.getElementById('fPrice').value = p.price ?? '';
        document.getElementById('fDesc').value = p.desc || '';
        document.getElementById('fEmoji').value = p.emoji || '';
        document.getElementById('fBadge').value = p.badge || '';
        document.getElementById('imagePublicId').value = p.image || '';
        if (p.image) showImagePreview(CLD_URL(p.image));
        currentColors = Array.isArray(p.colors) ? [...p.colors] : [];
        extraImages = Array.isArray(p.images) ? p.images.filter(i => i !== p.image) : [];
    } else {
        modalTitle.textContent = 'Novo Produto';
    }

    renderColorTags();
    renderExtraImages();
    productModal.classList.remove('hidden');
    document.getElementById('fName').focus();
}

function closeModal() {
    productModal.classList.add('hidden');
    editingId = null;
    resetForm();
}

cancelBtn.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);
productModal.addEventListener('click', e => {
    if (e.target === productModal) closeModal();
});

function resetForm() {
    productForm.reset();
    document.getElementById('editId').value = '';
    document.getElementById('imagePublicId').value = '';
    document.getElementById('uploadPreview').classList.add('hidden');
    document.getElementById('uploadPh').classList.remove('hidden');
    document.getElementById('uploadProgressWrap').classList.add('hidden');
    document.getElementById('uploadProgressBar').style.width = '0';
    currentColors = [];
    extraImages = [];
    renderColorTags();
    renderExtraImages();
    clearErrors();
}

/* ── COLOR TAGS ─────────────────────────────────────────── */
function renderColorTags() {
    const wrap = document.getElementById('colorTags');
    wrap.innerHTML = currentColors.map((c, i) =>
        `<span class="color-tag">${esc(c)}<button type="button" data-i="${i}">×</button></span>`
    ).join('');
    wrap.querySelectorAll('button').forEach(btn =>
        btn.addEventListener('click', () => {
            currentColors.splice(+btn.dataset.i, 1);
            renderColorTags();
        })
    );
}

function renderExtraImages() {
    const list = document.getElementById('extraImagesList');
    list.innerHTML = extraImages.map((img, i) => `
        <div class="extra-img-row">
            <input type="text" value="${esc(img)}" placeholder="Ex: Geek/Produto/foto2" class="input-full extra-img-input" data-i="${i}">
            <button type="button" class="btn btn-del btn-sm extra-img-remove" data-i="${i}">✕</button>
        </div>
    `).join('');
    list.querySelectorAll('.extra-img-input').forEach(inp =>
        inp.addEventListener('input', e => { extraImages[+e.target.dataset.i] = e.target.value.trim(); })
    );
    list.querySelectorAll('.extra-img-remove').forEach(btn =>
        btn.addEventListener('click', e => { extraImages.splice(+e.target.dataset.i, 1); renderExtraImages(); })
    );
}

document.getElementById('addExtraImageBtn').addEventListener('click', () => {
    extraImages.push('');
    renderExtraImages();
    const inputs = document.querySelectorAll('.extra-img-input');
    if (inputs.length) inputs[inputs.length - 1].focus();
});

document.getElementById('colorInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const val = e.target.value.trim();
        if (val && !currentColors.includes(val)) {
            currentColors.push(val);
            renderColorTags();
        }
        e.target.value = '';
    }
});

/* ── IMAGE UPLOAD ───────────────────────────────────────── */
const imageUploadBox  = document.getElementById('imageUploadBox');
const imageFile       = document.getElementById('imageFile');
const uploadPh        = document.getElementById('uploadPh');
const uploadPreview   = document.getElementById('uploadPreview');
const uploadProgressWrap = document.getElementById('uploadProgressWrap');
const uploadProgressBar  = document.getElementById('uploadProgressBar');
const uploadProgressText = document.getElementById('uploadProgressText');

imageUploadBox.addEventListener('click', () => imageFile.click());

imageUploadBox.addEventListener('dragover', e => {
    e.preventDefault();
    imageUploadBox.classList.add('drag-over');
});
imageUploadBox.addEventListener('dragleave', () => imageUploadBox.classList.remove('drag-over'));
imageUploadBox.addEventListener('drop', e => {
    e.preventDefault();
    imageUploadBox.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) handleFileSelected(file);
});

imageFile.addEventListener('change', () => {
    if (imageFile.files[0]) handleFileSelected(imageFile.files[0]);
});

function showImagePreview(url) {
    uploadPreview.src = url;
    uploadPreview.classList.remove('hidden');
    uploadPh.classList.add('hidden');
}

async function handleFileSelected(file) {
    const category = document.getElementById('fCategory').value || 'geral';
    const name     = document.getElementById('fName').value.trim() || 'produto';

    const folder = `Produtos/${capitalizeFirst(category)}/${sanitizeName(name)}`;

    showImagePreview(URL.createObjectURL(file));
    uploadProgressWrap.classList.remove('hidden');
    uploadProgressBar.style.width = '0';
    uploadProgressText.textContent = 'Enviando para Cloudinary…';

    try {
        const publicId = await uploadToCloudinary(file, folder);
        // publicId returned by Cloudinary is absolute; strip the leading 'Produtos/' prefix
        const relative = publicId.replace(/^Produtos\//, '');
        document.getElementById('imagePublicId').value = relative;
        uploadProgressBar.style.width = '100%';
        uploadProgressText.textContent = 'Upload concluído!';
        setTimeout(() => uploadProgressWrap.classList.add('hidden'), 2000);
        showToast('Imagem enviada com sucesso!');
    } catch (err) {
        uploadProgressText.textContent = 'Erro no upload. Tente novamente.';
        uploadProgressBar.style.width = '0';
        console.error(err);
        showToast('Falha no upload: ' + err.message, 'error');
    }
}

async function uploadToCloudinary(file, folder) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('upload_preset', CONFIG.uploadPreset);
    fd.append('folder', folder);

    const res = await fetch(
        `https://api.cloudinary.com/v1_1/${CONFIG.cloudName}/image/upload`,
        { method: 'POST', body: fd }
    );

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || `HTTP ${res.status}`);
    }

    const data = await res.json();
    return data.public_id;
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function sanitizeName(str) {
    return str.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_À-ú]/g, '');
}

/* ── FORM VALIDATION ────────────────────────────────────── */
function clearErrors() {
    ['fNameErr','fCategoryErr','fDescErr'].forEach(id => {
        document.getElementById(id).textContent = '';
    });
}

function validateForm() {
    clearErrors();
    let valid = true;
    const name = document.getElementById('fName').value.trim();
    const cat  = document.getElementById('fCategory').value;
    const desc = document.getElementById('fDesc').value.trim();

    if (!name) {
        document.getElementById('fNameErr').textContent = 'Nome obrigatório';
        valid = false;
    }
    if (!cat) {
        document.getElementById('fCategoryErr').textContent = 'Selecione uma categoria';
        valid = false;
    }
    if (!desc) {
        document.getElementById('fDescErr').textContent = 'Descrição obrigatória';
        valid = false;
    }
    return valid;
}

/* ── SAVE PRODUCT ───────────────────────────────────────── */
productForm.addEventListener('submit', e => {
    e.preventDefault();
    if (!validateForm()) return;

    const priceVal = document.getElementById('fPrice').value;
    const existing = editingId != null ? products.find(p => p.id === editingId) : null;
    const product = {
        id: editingId ?? nextId(),
        name: document.getElementById('fName').value.trim(),
        category: document.getElementById('fCategory').value,
        price: priceVal !== '' ? parseFloat(priceVal) : null,
        desc: document.getElementById('fDesc').value.trim(),
        colors: [...currentColors],
        emoji: document.getElementById('fEmoji').value.trim() || null,
        badge: document.getElementById('fBadge').value.trim() || null,
        image: document.getElementById('imagePublicId').value.trim() || null,
        images: [document.getElementById('imagePublicId').value.trim(), ...extraImages].filter(Boolean),
        rating: existing?.rating ?? 5.0,
        reviews: existing?.reviews ?? 0,
    };

    if (editingId != null) {
        const idx = products.findIndex(p => p.id === editingId);
        if (idx !== -1) products[idx] = product;
        showToast('Produto atualizado!');
    } else {
        products.push(product);
        showToast('Produto adicionado!');
    }

    saveProducts();
    closeModal();
    renderGrid();
    updateStats();
});

/* ── DELETE ─────────────────────────────────────────────── */
const confirmOverlay = document.getElementById('confirmOverlay');
const confirmMsg     = document.getElementById('confirmMsg');
const cancelDelete   = document.getElementById('cancelDelete');
const doDelete       = document.getElementById('doDelete');

function confirmDelete(id) {
    const p = products.find(x => x.id === id);
    if (!p) return;
    pendingDeleteId = id;
    confirmMsg.textContent = `"${p.name}" será excluído permanentemente.`;
    confirmOverlay.classList.remove('hidden');
}

cancelDelete.addEventListener('click', () => {
    confirmOverlay.classList.add('hidden');
    pendingDeleteId = null;
});

confirmOverlay.addEventListener('click', e => {
    if (e.target === confirmOverlay) {
        confirmOverlay.classList.add('hidden');
        pendingDeleteId = null;
    }
});

doDelete.addEventListener('click', () => {
    if (pendingDeleteId == null) return;
    products = products.filter(p => p.id !== pendingDeleteId);
    saveProducts();
    confirmOverlay.classList.add('hidden');
    pendingDeleteId = null;
    renderGrid();
    updateStats();
    showToast('Produto excluído.');
});

/* ── TOAST ──────────────────────────────────────────────── */
let toastTimer;
const toast = document.getElementById('toast');

function showToast(msg, type = 'success') {
    clearTimeout(toastTimer);
    toast.textContent = msg;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3000);
}

/* ── NAV TABS ───────────────────────────────────────────── */
document.getElementById('adminNav').addEventListener('click', e => {
    const tab = e.target.closest('.admin-nav-tab');
    if (!tab) return;
    const view = tab.dataset.view;
    document.querySelectorAll('.admin-nav-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('catalogView').classList.toggle('hidden', view !== 'catalog');
    document.getElementById('calcView').classList.toggle('hidden', view !== 'calc');
});

/* ── CALCULATOR ─────────────────────────────────────────── */
const MATERIALS = {
    pla:    { price: 90,  unit: 'g',  unitLbl: 'kg',    div: 1000, hint: 'Peso do filamento usado na impressão' },
    petg:   { price: 100, unit: 'g',  unitLbl: 'kg',    div: 1000, hint: 'Peso do filamento usado na impressão' },
    abs:    { price: 90,  unit: 'g',  unitLbl: 'kg',    div: 1000, hint: 'Peso do filamento usado na impressão' },
    tpu:    { price: 130, unit: 'g',  unitLbl: 'kg',    div: 1000, hint: 'Peso do filamento flexível usado na impressão' },
    asa:    { price: 110, unit: 'g',  unitLbl: 'kg',    div: 1000, hint: 'Peso do filamento usado na impressão' },
    resina: { price: 150, unit: 'mL', unitLbl: 'litro', div: 1000, hint: 'Volume de resina consumido na impressão' },
};

document.getElementById('cMaterial').addEventListener('change', function () {
    const mat = MATERIALS[this.value];
    if (!mat) return;
    document.getElementById('cPriceKg').value        = mat.price;
    document.getElementById('cPriceLbl').textContent = `Preço por ${mat.unitLbl}`;
    document.getElementById('cQtyLbl').textContent   = `Quantidade usada (${mat.unit})`;
    document.getElementById('cQtySuf').textContent   = mat.unit;
    document.getElementById('cQtyHint').textContent  = mat.hint;
    calcUpdate();
});

document.getElementById('cErrorRange').addEventListener('input', function () {
    document.getElementById('cError').value = this.value;
    sliderFill(this);
    calcUpdate();
});
document.getElementById('cError').addEventListener('input', function () {
    const v = Math.min(100, Math.max(0, +this.value || 0));
    document.getElementById('cErrorRange').value = v;
    sliderFill(document.getElementById('cErrorRange'));
    calcUpdate();
});

function sliderFill(el) {
    const pct = (el.value / el.max) * 100;
    el.style.background = `linear-gradient(90deg, var(--purple) ${pct}%, var(--border2) ${pct}%)`;
}

['cPriceKg', 'cQty', 'cHours', 'cMins', 'cWatts', 'cKwh'].forEach(id =>
    document.getElementById(id).addEventListener('input', calcUpdate)
);

function brl(v) {
    return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

function calcUpdate() {
    const mat      = MATERIALS[document.getElementById('cMaterial').value] || MATERIALS.pla;
    const priceKg  = parseFloat(document.getElementById('cPriceKg').value) || 0;
    const qty      = parseFloat(document.getElementById('cQty').value)     || 0;
    const hours    = parseFloat(document.getElementById('cHours').value)   || 0;
    const mins     = parseFloat(document.getElementById('cMins').value)    || 0;
    const watts    = parseFloat(document.getElementById('cWatts').value)   || 0;
    const kwh      = parseFloat(document.getElementById('cKwh').value)     || 0;
    const errPct   = parseFloat(document.getElementById('cError').value)   || 0;

    const matCost    = (qty / mat.div) * priceKg;
    const totalHours = hours + mins / 60;
    const engCost    = (watts / 1000) * totalHours * kwh;
    const subtotal   = matCost + engCost;
    const errCost    = subtotal * (errPct / 100);
    const total      = subtotal + errCost;

    document.getElementById('rMaterial').textContent  = brl(matCost);
    document.getElementById('rEnergy').textContent    = brl(engCost);
    document.getElementById('rSub').textContent       = brl(subtotal);
    document.getElementById('rErrorLbl').textContent  = `+ Margem de erro (${errPct}%)`;
    document.getElementById('rError').textContent     = brl(errCost);
    document.getElementById('rTotal').textContent     = brl(total);

    document.getElementById('m50').textContent  = brl(total * 1.5);
    document.getElementById('m100').textContent = brl(total * 2);
    document.getElementById('m150').textContent = brl(total * 2.5);
    document.getElementById('m200').textContent = brl(total * 3);
}

/* ── ESC to close ───────────────────────────────────────── */
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (!productModal.classList.contains('hidden')) closeModal();
        if (!confirmOverlay.classList.contains('hidden')) {
            confirmOverlay.classList.add('hidden');
            pendingDeleteId = null;
        }
    }
});
