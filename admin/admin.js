/* ── CONFIG ─────────────────────────────────────────────── */
const CONFIG = {
    workerUrl: 'https://api.forgecon.com.br',
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
let auditPollTimer = null;
let loggedUser = null; 

/* ── PRODUCT STORAGE ────────────────────────────────────── */
function loadCachedProducts() {
    try {
        const raw = localStorage.getItem(CONFIG.storageKey);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveProductsCache() {
    localStorage.setItem(CONFIG.storageKey, JSON.stringify(products));
}

function normalizeProductList(list) {
    return (Array.isArray(list) ? list : []).map(p => {
        const images = Array.isArray(p.images)
            ? p.images.filter(Boolean)
            : (p.image ? [p.image] : []);
        const uniqueImages = images.filter((img, index, arr) => arr.indexOf(img) === index);
        return {
            ...p,
            images: uniqueImages,
            image: p.image || uniqueImages[0] || null,
            colors: Array.isArray(p.colors) ? p.colors : [],
            dimensions: p.dimensions || {},
        };
    });
}

async function loadProducts() {
    const cached = normalizeProductList(loadCachedProducts());

    try {
        const res = await fetchWithTimeout(`${CONFIG.workerUrl}/products`, {}, 12000);
        const data = await res.json().catch(() => ({}));

        if (!res.ok) throw new Error(data.error || 'Erro ao carregar produtos.');

        products = normalizeProductList(data.products || []);

        if (!products.length && cached.length && getToken()) {
            await migrateCachedProducts(cached);
            return;
        }

        saveProductsCache();
    } catch (err) {
        products = cached;
        if (products.length) {
            showToast('Catálogo carregado do cache local. O servidor não respondeu.', 'error');
        } else {
            showToast(err.message || 'Erro ao carregar produtos.', 'error');
        }
    }
}

async function migrateCachedProducts(cached) {
    const imported = [];
    for (const item of cached) {
        const res = await workerFetch('/products', {
            method: 'POST',
            body: JSON.stringify(item),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.product) imported.push(data.product);
    }

    products = normalizeProductList(imported);
    saveProductsCache();

    if (products.length) {
        showToast('Produtos antigos migrados para o catálogo online.');
    }
}

async function saveProductOnServer(product, id = null) {
    const res = await workerFetch(id == null ? '/products' : `/products/${id}`, {
        method: id == null ? 'POST' : 'PUT',
        body: JSON.stringify(product),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro ao salvar produto no servidor.');
    return data.product;
}

async function deleteProductOnServer(id) {
    const res = await workerFetch(`/products/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Erro ao excluir produto no servidor.');
    return true;
}

/* ── AUTH ───────────────────────────────────────────────── */
const loginScreen = document.getElementById('loginScreen');
const adminPanel  = document.getElementById('adminPanel');
const loginForm   = document.getElementById('loginForm');
const loginError  = document.getElementById('loginError');
const togglePw    = document.getElementById('togglePw');
const loginPw     = document.getElementById('loginPassword');
const loginEmail  = document.getElementById('loginEmail');
const loginBtn    = document.getElementById('loginBtn');
const logoutBtn   = document.getElementById('logoutBtn');
const forgotLink  = document.getElementById('forgotLink');
const forgotForm  = document.getElementById('forgotForm');
const forgotBtn   = document.getElementById('forgotBtn');
const forgotMsg   = document.getElementById('forgotMsg');
const backToLogin = document.getElementById('backToLogin');

function getToken() {
    return sessionStorage.getItem('forgecon_token');
}

function isLoggedIn() {
    return !!getToken();
}

async function workerFetch(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return fetchWithTimeout(CONFIG.workerUrl + path, { ...options, headers });
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

// ── AUDITORIA DO FRONTEND ENVIADA PARA O BACKEND ──
async function recordAdminAudit(action, entity, entityId, details = {}) {
    try {
        await workerFetch('/auth/audit-logs', {
            method: 'POST',
            body: JSON.stringify({ action, entity, entityId, details }),
        });
    } catch (err) {
        console.warn('Falha ao registrar auditoria no servidor:', err);
    }
}

async function showPanel() {
    loginScreen.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    
    try {
        const res = await workerFetch('/auth/me');
        if (res.ok) {
            const data = await res.json();
            loggedUser = data.user;
        }
    } catch(e) {
        console.error("Erro ao puxar dados do usuário", e);
    }

    setupAuditView();
    await loadProducts();
    renderGrid();
    updateStats();
    updateQuoteProductOptions();
}

function showLogin() {
    stopAuditPolling();
    sessionStorage.removeItem('forgecon_token');
    loggedUser = null;
    adminPanel.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginForm.classList.remove('hidden');
    forgotForm.classList.add('hidden');
    loginPw.value = '';
    loginEmail.value = '';
    loginError.textContent = '';
}

togglePw.addEventListener('click', () => {
    loginPw.type = loginPw.type === 'password' ? 'text' : 'password';
    togglePw.textContent = loginPw.type === 'password' ? '👁' : '🙈';
});

loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    loginBtn.disabled = true;
    loginBtn.textContent = 'Entrando...';
    loginError.textContent = '';
    try {
        const res = await fetchWithTimeout(CONFIG.workerUrl + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: loginEmail.value.trim(), password: loginPw.value }),
        });
        const data = await res.json();
        if (res.ok) {
            sessionStorage.setItem('forgecon_token', data.token);
            loggedUser = data.user; 
            showPanel();
        } else {
            loginError.textContent = data.error || 'Credenciais inválidas.';
            loginPw.value = '';
            loginPw.focus();
        }
    } catch (error) {
        loginError.textContent = error.name === 'AbortError'
            ? 'Servidor de login demorou para responder. Verifique o Worker no Cloudflare.'
            : 'Erro de conexão. Tente novamente.';
    } finally {
        loginBtn.disabled = false;
        loginBtn.textContent = 'Entrar';
    }
});

forgotLink.addEventListener('click', e => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    forgotForm.classList.remove('hidden');
    forgotMsg.textContent = '';
    forgotMsg.style.color = '';
});

backToLogin.addEventListener('click', e => {
    e.preventDefault();
    forgotForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
});

forgotBtn.addEventListener('click', async () => {
    const email = document.getElementById('forgotEmail').value.trim();
    if (!email) return;
    forgotBtn.disabled = true;
    forgotBtn.textContent = 'Enviando...';
    try {
        await fetch(CONFIG.workerUrl + '/auth/forgot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
        });
        forgotMsg.style.color = '#22c55e';
        forgotMsg.textContent = 'Se esse e-mail existir, você receberá o link em breve.';
    } catch {
        forgotMsg.textContent = 'Erro ao enviar. Tente novamente.';
    } finally {
        forgotBtn.disabled = false;
        forgotBtn.textContent = 'Enviar link';
    }
});

logoutBtn.addEventListener('click', async () => {
    const token = getToken();
    if (token) {
        fetch(CONFIG.workerUrl + '/auth/logout', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
        }).catch(() => {});
    }
    showLogin();
});

// Handle invite link (?invite=TOKEN)
const inviteToken = new URLSearchParams(window.location.search).get('invite');
if (inviteToken) {
    loginForm.classList.add('hidden');
    forgotForm.classList.add('hidden');

    const inviteAcceptDiv = document.createElement('div');
    inviteAcceptDiv.id = 'inviteAcceptForm';
    inviteAcceptDiv.innerHTML = `
        <p id="inviteWelcome" style="text-align:center;color:var(--text2);margin-bottom:16px;font-size:.9rem">Verificando convite...</p>
        <div class="form-group">
            <label for="inviteName">Seu nome</label>
            <input type="text" id="inviteName" placeholder="Como você quer ser chamado" required>
        </div>
        <div class="form-group">
            <label for="inviteNewPw">Criar senha</label>
            <input type="password" id="inviteNewPw" placeholder="Mínimo 6 caracteres" required>
        </div>
        <div class="form-group">
            <label for="inviteNewPw2">Confirmar senha</label>
            <input type="password" id="inviteNewPw2" placeholder="Repita a senha" required>
        </div>
        <span class="login-error" id="inviteAcceptMsg"></span>
        <button type="button" class="btn btn-primary btn-full" id="inviteAcceptBtn">Ativar minha conta</button>`;
    loginScreen.querySelector('.login-box').appendChild(inviteAcceptDiv);

    // Verify token
    fetch(CONFIG.workerUrl + '/auth/invite?token=' + inviteToken)
        .then(r => r.json())
        .then(data => {
            if (data.error) {
                document.getElementById('inviteWelcome').textContent = data.error;
                document.getElementById('inviteAcceptBtn').disabled = true;
            } else {
                document.getElementById('inviteWelcome').textContent = `Convite para ${data.email} — crie sua senha de acesso.`;
            }
        }).catch(() => {
            document.getElementById('inviteWelcome').textContent = 'Erro ao verificar convite.';
        });

    document.getElementById('inviteAcceptBtn').addEventListener('click', async () => {
        const name = document.getElementById('inviteName').value.trim();
        const pw   = document.getElementById('inviteNewPw').value;
        const pw2  = document.getElementById('inviteNewPw2').value;
        const msg  = document.getElementById('inviteAcceptMsg');
        if (!name) { msg.textContent = 'Digite seu nome.'; return; }
        if (pw !== pw2) { msg.textContent = 'As senhas não coincidem.'; return; }
        if (pw.length < 6) { msg.textContent = 'Senha deve ter ao menos 6 caracteres.'; return; }
        const btn = document.getElementById('inviteAcceptBtn');
        btn.disabled = true; btn.textContent = 'Criando conta...';
        try {
            const res = await fetch(CONFIG.workerUrl + '/auth/invite/accept', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: inviteToken, password: pw, name }),
            });
            const data = await res.json();
            if (res.ok) {
                msg.style.color = '#22c55e';
                msg.textContent = 'Conta criada! Redirecionando para o login...';
                setTimeout(() => { window.location.href = '/admin/'; }, 2000);
            } else {
                msg.textContent = data.error || 'Erro ao criar conta.';
                btn.disabled = false; btn.textContent = 'Ativar minha conta';
            }
        } catch {
            msg.textContent = 'Erro de conexão.';
            btn.disabled = false; btn.textContent = 'Ativar minha conta';
        }
    });
}

// Handle password reset link (?reset=TOKEN)
const resetToken = new URLSearchParams(window.location.search).get('reset');
if (resetToken) {
    loginForm.classList.add('hidden');
    forgotForm.classList.add('hidden');
    document.getElementById('resetForm').classList.remove('hidden');

    document.getElementById('resetBtn').addEventListener('click', async () => {
        const pw  = document.getElementById('resetPw').value;
        const pw2 = document.getElementById('resetPwConfirm').value;
        const msg = document.getElementById('resetMsg');
        if (pw !== pw2) { msg.textContent = 'As senhas não coincidem.'; return; }
        if (pw.length < 6) { msg.textContent = 'Senha deve ter ao menos 6 caracteres.'; return; }
        const btn = document.getElementById('resetBtn');
        btn.disabled = true; btn.textContent = 'Salvando...';
        try {
            const res = await fetch(CONFIG.workerUrl + '/auth/reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: resetToken, password: pw }),
            });
            const data = await res.json();
            if (res.ok) {
                msg.style.color = '#22c55e';
                msg.textContent = 'Senha redefinida! Redirecionando...';
                setTimeout(() => { window.location.href = '/admin/'; }, 2000);
            } else {
                msg.textContent = data.error || 'Token inválido ou expirado.';
            }
        } catch {
            msg.textContent = 'Erro de conexão.';
        } finally {
            btn.disabled = false; btn.textContent = 'Salvar nova senha';
        }
    });
} else if (isLoggedIn()) {
    showPanel();
}

/* ── STATS ──────────────────────────────────────────────── */
function updateStats() {
    document.getElementById('statTotal').textContent = products.length;
    const cats = new Set(products.map(p => p.category)).size;
    document.getElementById('statCats').textContent = cats;
    const photoCount = products.reduce((total, p) => total + productImages(p).length, 0);
    document.getElementById('statPhotos').textContent = photoCount;
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

function productImages(p) {
    return (Array.isArray(p.images) && p.images.length)
        ? p.images.filter(Boolean)
        : (p.image ? [p.image] : []);
}

function cardHTML(p) {
    const images = productImages(p);
    const imgTag = images[0]
        ? `<img src="${CLD_URL(images[0], 300, 220)}" alt="${esc(p.name)}" loading="lazy">`
        : `<span>${p.emoji || '📦'}</span>`;
    const price = p.price != null
        ? `<strong>R$ ${Number(p.price).toFixed(2).replace('.', ',')}</strong>`
        : 'Consultar preço';
    const photoBadge = images.length
        ? `<span class="has-photo-badge">${images.length} foto${images.length > 1 ? 's' : ''}</span>`
        : `<span class="no-photo-badge">Sem foto</span>`;
    const dims = p.dimensions || {};
    const specs = [
        p.material ? esc(p.material) : null,
        p.weight ? `${p.weight} g` : null,
        (dims.length && dims.width && dims.height) ? `${dims.length}x${dims.width}x${dims.height} cm` : null,
    ].filter(Boolean);
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
            ${specs.length ? `<div class="admin-card-specs">${specs.map(item => `<span>${item}</span>`).join('')}</div>` : ''}
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
        document.getElementById('fShortDesc').value = p.shortDesc || '';
        document.getElementById('fDesc').value = p.desc || '';
        document.getElementById('fFeatures').value = Array.isArray(p.features) ? p.features.join('\n') : '';
        document.getElementById('fCustomization').value = p.customization || '';
        document.getElementById('fProductionTime').value = p.productionTime || '';
        document.getElementById('fWeight').value = p.weight ?? '';
        document.getElementById('fMaterial').value = p.material || '';
        document.getElementById('fLength').value = p.dimensions?.length ?? '';
        document.getElementById('fWidth').value = p.dimensions?.width ?? '';
        document.getElementById('fHeight').value = p.dimensions?.height ?? '';
        document.getElementById('fEmoji').value = p.emoji || '';
        document.getElementById('fBadge').value = p.badge || '';
        document.getElementById('imagePublicId').value = p.image || '';
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
    const cover = document.getElementById('imagePublicId').value.trim();
    const images = [cover, ...extraImages].filter(Boolean);
    list.innerHTML = images.map((img, i) => `
        <div class="gallery-editor-card${i === 0 ? ' is-cover' : ''}">
            <img src="${CLD_URL(img, 360, 270)}" alt="Foto ${i + 1}" loading="lazy">
            ${i === 0 ? '<span class="gallery-cover-badge">CAPA</span>' : ''}
            <span class="gallery-order">${i + 1}</span>
            <div class="gallery-editor-actions">
                ${i ? `<button type="button" class="btn btn-outline gallery-set-cover" data-i="${i - 1}">Definir capa</button>` : '<span></span>'}
                <button type="button" class="btn btn-del gallery-remove" data-i="${i}">Remover</button>
            </div>
        </div>
    `).join('');
    list.querySelectorAll('.gallery-set-cover').forEach(btn =>
        btn.addEventListener('click', () => setExtraImageAsCover(Number(btn.dataset.i)))
    );
    list.querySelectorAll('.gallery-remove').forEach(btn =>
        btn.addEventListener('click', () => removeGalleryImage(Number(btn.dataset.i)))
    );
}

function setExtraImageAsCover(index) {
    const nextCover = extraImages[index];
    if (!nextCover) return;
    const currentCover = document.getElementById('imagePublicId').value.trim();
    extraImages.splice(index, 1);
    if (currentCover) extraImages.unshift(currentCover);
    document.getElementById('imagePublicId').value = nextCover;
    renderExtraImages();
}

function removeGalleryImage(index) {
    const coverInput = document.getElementById('imagePublicId');
    if (index === 0) {
        coverInput.value = extraImages.shift() || '';
    } else {
        extraImages.splice(index - 1, 1);
    }
    renderExtraImages();
}

const galleryFiles = document.getElementById('galleryFiles');
const galleryUploadBtn = document.getElementById('galleryUploadBtn');

galleryUploadBtn.addEventListener('click', () => galleryFiles.click());
galleryUploadBtn.addEventListener('dragover', e => {
    e.preventDefault();
    galleryUploadBtn.classList.add('drag-over');
});
galleryUploadBtn.addEventListener('dragleave', () => galleryUploadBtn.classList.remove('drag-over'));
galleryUploadBtn.addEventListener('drop', e => {
    e.preventDefault();
    galleryUploadBtn.classList.remove('drag-over');
    uploadGalleryFiles([...e.dataTransfer.files]);
});
galleryFiles.addEventListener('change', () => {
    if (galleryFiles.files.length) uploadGalleryFiles([...galleryFiles.files]);
    galleryFiles.value = '';
});

document.getElementById('syncCloudinaryBtn').addEventListener('click', async () => {
    const hint   = document.getElementById('syncHint');
    const btn    = document.getElementById('syncCloudinaryBtn');
    const category = document.getElementById('fCategory').value;
    const name = document.getElementById('fName').value.trim();

    if (!category || !name) {
        hint.textContent = 'Preencha nome e categoria para localizar a pasta no Cloudinary.';
        hint.style.color = 'var(--red)';
        return;
    }

    const productFolder = `Produtos/${capitalizeFirst(category)}/${sanitizeName(name)}`;

    btn.disabled = true;
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 1s linear infinite"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5"/></svg> Buscando...`;
    hint.style.color = '';
    hint.textContent = `Buscando fotos em ${productFolder}...`;

    try {
        const res  = await workerFetch(`/cloudinary/list?folder=${encodeURIComponent(productFolder)}`);
        const data = await res.json();

        if (!res.ok) {
            hint.textContent = data.error || 'Erro ao buscar fotos.';
            hint.style.color = 'var(--red)';
            return;
        }

        if (!data.images.length) {
            hint.textContent = 'Nenhuma foto encontrada nessa pasta.';
            return;
        }

        const paths = data.images.map(img => img.public_id.replace(/^Produtos\//, '')).filter(Boolean);
        document.getElementById('imagePublicId').value = paths[0] || '';
        extraImages = paths.slice(1);
        renderExtraImages();
        hint.textContent = `${paths.length} foto(s) importada(s) da pasta.`;
        hint.style.color = 'var(--green)';

    } catch {
        hint.textContent = 'Erro de conexão com o Cloudinary.';
        hint.style.color = 'var(--red)';
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-5"/></svg> Buscar fotos`;
    }
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
const uploadProgressWrap = document.getElementById('uploadProgressWrap');
const uploadProgressBar  = document.getElementById('uploadProgressBar');
const uploadProgressText = document.getElementById('uploadProgressText');

async function uploadGalleryFiles(files) {
    const validFiles = files.filter(file => file.type.startsWith('image/'));
    if (!validFiles.length) {
        showToast('Selecione imagens JPG, PNG ou WebP.', 'error');
        return;
    }

    const category = document.getElementById('fCategory').value;
    const name = document.getElementById('fName').value.trim();
    if (!category || !name) {
        showToast('Preencha nome e categoria antes de enviar fotos.', 'error');
        document.getElementById(!name ? 'fName' : 'fCategory').focus();
        return;
    }
    const folder = `Produtos/${capitalizeFirst(category)}/${sanitizeName(name)}`;
    const hint = document.getElementById('syncHint');
    const btn = document.getElementById('galleryUploadBtn');

    btn.disabled = true;
    hint.style.color = '';
    uploadProgressWrap.classList.remove('hidden');
    uploadProgressBar.style.width = '0%';

    try {
        let finished = 0;
        const results = await Promise.all(validFiles.map(async file => {
            const publicId = await uploadToCloudinary(file, folder);
            finished += 1;
            const percent = Math.round((finished / validFiles.length) * 100);
            uploadProgressBar.style.width = `${percent}%`;
            uploadProgressText.textContent = `Enviando ${finished} de ${validFiles.length} fotos…`;
            return publicId.replace(/^Produtos\//, '');
        }));
        const coverInput = document.getElementById('imagePublicId');
        const existing = [coverInput.value.trim(), ...extraImages].filter(Boolean);
        const merged = [...existing, ...results].filter((img, index, arr) => arr.indexOf(img) === index);
        coverInput.value = merged[0] || '';
        extraImages = merged.slice(1);
        renderExtraImages();

        hint.textContent = `${results.length} foto(s) enviadas. Primeira foto usada como capa.`;
        hint.style.color = 'var(--green)';
        showToast('Fotos enviadas com sucesso.');
    } catch (err) {
        hint.textContent = 'Erro ao enviar fotos. Tente novamente.';
        hint.style.color = 'var(--red)';
        showToast('Falha no upload: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        uploadProgressText.textContent = 'Upload concluído.';
        setTimeout(() => uploadProgressWrap.classList.add('hidden'), 1800);
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
    ['fWeight','fLength','fWidth','fHeight'].forEach(id => document.getElementById(id).classList.remove('error'));
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
    ['fWeight','fLength','fWidth','fHeight'].forEach(id => {
        const input = document.getElementById(id);
        if (Number(input.value) <= 0) {
            input.classList.add('error');
            valid = false;
        }
    });
    if (!valid && ['fWeight','fLength','fWidth','fHeight'].some(id => Number(document.getElementById(id).value) <= 0)) {
        showToast('Preencha peso e dimensões da embalagem para liberar o frete.', 'error');
    }
    return valid;
}

/* ── SAVE PRODUCT ───────────────────────────────────────── */
productForm.addEventListener('submit', async e => {
    e.preventDefault();
    if (!validateForm()) return;

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';

    const priceVal = document.getElementById('fPrice').value;
    const coverImage = document.getElementById('imagePublicId').value.trim();
    const images = [coverImage, ...extraImages.map(img => img.trim())]
        .filter(Boolean)
        .filter((img, index, arr) => arr.indexOf(img) === index);
    const existing = editingId != null ? products.find(p => p.id === editingId) : null;
    const product = {
        id: editingId ?? undefined,
        name: document.getElementById('fName').value.trim(),
        category: document.getElementById('fCategory').value,
        price: priceVal !== '' ? parseFloat(priceVal) : null,
        shortDesc: document.getElementById('fShortDesc').value.trim(),
        desc: document.getElementById('fDesc').value.trim(),
        features: document.getElementById('fFeatures').value.split('\n').map(item => item.trim()).filter(Boolean),
        customization: document.getElementById('fCustomization').value.trim() || null,
        productionTime: document.getElementById('fProductionTime').value.trim() || null,
        weight: parseFloat(document.getElementById('fWeight').value) || null,
        material: document.getElementById('fMaterial').value.trim() || null,
        dimensions: {
            length: parseFloat(document.getElementById('fLength').value) || null,
            width: parseFloat(document.getElementById('fWidth').value) || null,
            height: parseFloat(document.getElementById('fHeight').value) || null,
        },
        colors: [...currentColors],
        emoji: document.getElementById('fEmoji').value.trim() || null,
        badge: document.getElementById('fBadge').value.trim() || null,
        image: coverImage || images[0] || null,
        images,
        rating: existing?.rating ?? 5.0,
        reviews: existing?.reviews ?? 0,
    };

    try {
        const savedProduct = normalizeProductList([await saveProductOnServer(product, editingId)])[0];

        if (editingId != null) {
            const idx = products.findIndex(p => p.id === editingId);
            if (idx !== -1) products[idx] = savedProduct;
            showToast('Produto atualizado e publicado!');
        } else {
            products.push(savedProduct);
            showToast('Produto adicionado e publicado!');
        }

        saveProductsCache();
        closeModal();
        renderGrid();
        updateStats();
        updateQuoteProductOptions();
    } catch (err) {
        showToast(err.message || 'Erro ao salvar produto.', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
            Salvar produto
        `;
    }
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

doDelete.addEventListener('click', async () => {
    if (pendingDeleteId == null) return;
    const deletedProduct = products.find(p => p.id === pendingDeleteId);

    doDelete.disabled = true;
    doDelete.textContent = 'Excluindo...';

    try {
        await deleteProductOnServer(pendingDeleteId);
        products = products.filter(p => p.id !== pendingDeleteId);
        saveProductsCache();
        confirmOverlay.classList.add('hidden');
        pendingDeleteId = null;
        renderGrid();
        updateStats();
        updateQuoteProductOptions();
        showToast(deletedProduct ? `"${deletedProduct.name}" excluído.` : 'Produto excluído.');
    } catch (err) {
        showToast(err.message || 'Erro ao excluir produto.', 'error');
    } finally {
        doDelete.disabled = false;
        doDelete.textContent = 'Excluir';
    }
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
    document.getElementById('usersView').classList.toggle('hidden', view !== 'users');
    document.getElementById('settingsView').classList.toggle('hidden', view !== 'settings');
    const auditView = document.getElementById('auditView');
    if (auditView) auditView.classList.toggle('hidden', view !== 'audit');
    if (view === 'users') loadUsersView();
    if (view === 'settings') loadSettingsView();
    if (view === 'calc') updateQuoteProductOptions();
    if (view === 'audit') {
        loadAuditLogs();
        startAuditPolling();
    } else {
        stopAuditPolling();
    }
});

/* ── SITE SETTINGS VIEW ────────────────────────────────── */
const SETTINGS_FIELDS = {
    whatsapp: 'settingsWhatsapp',
    email: 'settingsEmail',
    instagram: 'settingsInstagram',
    shopee: 'settingsShopee',
    mercadolivre: 'settingsMercadoLivre',
};

function fillSettingsForm(settings = {}) {
    Object.entries(SETTINGS_FIELDS).forEach(([key, id]) => {
        const el = document.getElementById(id);
        if (el) el.value = settings[key] || '';
    });
}

function readSettingsForm() {
    return Object.fromEntries(
        Object.entries(SETTINGS_FIELDS).map(([key, id]) => {
            const el = document.getElementById(id);
            return [key, el ? el.value.trim() : ''];
        })
    );
}

function setSettingsMessage(text, type = '') {
    const msg = document.getElementById('settingsMsg');
    msg.textContent = text;
    msg.className = `settings-msg ${type}`.trim();
}

async function loadSettingsView() {
    setSettingsMessage('Carregando configurações...');
    try {
        const res = await workerFetch('/settings');
        const data = await res.json();
        if (!res.ok) {
            setSettingsMessage(data.error || 'Erro ao carregar configurações.', 'error');
            return;
        }
        fillSettingsForm(data.settings || {});
        setSettingsMessage('Configurações carregadas.');
    } catch {
        setSettingsMessage('Erro de conexão ao carregar configurações.', 'error');
    }
}

document.getElementById('settingsSaveBtn').addEventListener('click', async () => {
    const btn = document.getElementById('settingsSaveBtn');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    setSettingsMessage('');

    try {
        const settings = readSettingsForm();
        const res = await workerFetch('/settings', {
            method: 'PUT',
            body: JSON.stringify(settings),
        });
        const data = await res.json();

        if (!res.ok) {
            setSettingsMessage(data.error || 'Erro ao salvar configurações.', 'error');
            return;
        }

        fillSettingsForm(data.settings || settings);
        setSettingsMessage('Configurações salvas. O site público já pode usar os novos links.', 'success');
        showToast('Configurações atualizadas.');
    } catch {
        setSettingsMessage('Erro de conexão ao salvar configurações.', 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Salvar configurações';
    }
});

/* ── USERS & INVITES VIEW ───────────────────────────────── */
async function loadUsersView() {
    await Promise.all([loadUsersList(), loadInvitesList()]);
}

async function loadUsersList() {
    const el = document.getElementById('usersList');
    el.innerHTML = '<div class="user-row-empty">Carregando...</div>';
    try {
        const res = await workerFetch('/auth/users');
        const data = await res.json();
        if (!res.ok) { el.innerHTML = `<div class="user-row-empty">${data.error}</div>`; return; }
        if (!data.users.length) { el.innerHTML = '<div class="user-row-empty">Nenhum usuário cadastrado.</div>'; return; }
        el.innerHTML = data.users.map(u => `
            <div class="user-row">
                <div class="user-avatar">${(u.name || u.email)[0].toUpperCase()}</div>
                <div class="user-info">
                    <div class="user-name">${u.name || '—'}</div>
                    <div class="user-email">${u.email}</div>
                </div>
                <span class="user-badge badge-${u.role}">${u.role}</span>
                <button class="user-action-btn" data-user-id="${u.id}" title="Remover usuário">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                </button>
            </div>`).join('');

        el.querySelectorAll('.user-action-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.dataset.userId;
                if (!confirm('Remover este usuário?')) return;
                const r = await workerFetch(`/auth/users/${id}`, { method: 'DELETE' });
                if (r.ok) { showToast('Usuário removido', 'success'); loadUsersList(); }
                else { const d = await r.json(); showToast(d.error || 'Erro ao remover', 'error'); }
            });
        });
    } catch { el.innerHTML = '<div class="user-row-empty">Erro ao carregar usuários.</div>'; }
}

async function loadInvitesList() {
    const el = document.getElementById('invitesList');
    el.innerHTML = '<div class="user-row-empty">Carregando...</div>';
    try {
        const res = await workerFetch('/auth/invites');
        const data = await res.json();
        if (!res.ok) { el.innerHTML = `<div class="user-row-empty">${data.error}</div>`; return; }
        if (!data.invites.length) { el.innerHTML = '<div class="user-row-empty">Nenhum convite enviado ainda.</div>'; return; }
        el.innerHTML = data.invites.map(i => {
            const status = i.used_at ? 'used' : i.expired ? 'expired' : 'pending';
            const label  = i.used_at ? 'Aceito' : i.expired ? 'Expirado' : 'Pendente';
            return `<div class="user-row">
                <div class="user-avatar" style="background:linear-gradient(135deg,#334155,#1e293b)">✉</div>
                <div class="user-info">
                    <div class="user-name">${i.email}</div>
                    <div class="user-email">Enviado ${new Date(i.created_at * 1000).toLocaleDateString('pt-BR')}</div>
                </div>
                <span class="user-badge badge-${status}">${label}</span>
            </div>`;
        }).join('');
    } catch { el.innerHTML = '<div class="user-row-empty">Erro ao carregar convites.</div>'; }
}

document.getElementById('inviteBtn').addEventListener('click', async () => {
    const email = document.getElementById('inviteEmail').value.trim();
    const msg   = document.getElementById('inviteMsg');
    if (!email) { msg.className = 'invite-msg error'; msg.textContent = 'Digite um e-mail.'; return; }

    const btn = document.getElementById('inviteBtn');
    btn.disabled = true; btn.textContent = 'Enviando...';
    msg.textContent = ''; msg.className = 'invite-msg';

    try {
        const res  = await workerFetch('/auth/invite', { method: 'POST', body: JSON.stringify({ email }) });
        const data = await res.json();
        if (res.ok) {
            msg.className = 'invite-msg success';
            msg.textContent = `Convite enviado para ${email}!`;
            document.getElementById('inviteEmail').value = '';
            loadInvitesList();
        } else {
            msg.className = 'invite-msg error';
            msg.textContent = data.error || 'Erro ao enviar convite.';
        }
    } catch {
        msg.className = 'invite-msg error';
        msg.textContent = 'Erro de conexão.';
    } finally {
        btn.disabled = false; btn.textContent = 'Enviar convite';
    }
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

[
    'cPriceKg', 'cQty', 'cHours', 'cMins', 'cWatts', 'cKwh',
    'cMaintenance', 'cModelHours', 'cHourlyRate', 'cAccessory',
    'cPackaging', 'cShipping',
].forEach(id =>
    document.getElementById(id).addEventListener('input', calcUpdate)
);

function brl(v) {
    return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

let calcAuditTimer = null; 

function calcUpdate() {
    const mat      = MATERIALS[document.getElementById('cMaterial').value] || MATERIALS.pla;
    const priceKg  = parseFloat(document.getElementById('cPriceKg').value) || 0;
    const qty      = parseFloat(document.getElementById('cQty').value)     || 0;
    const hours    = parseFloat(document.getElementById('cHours').value)   || 0;
    const mins     = parseFloat(document.getElementById('cMins').value)    || 0;
    const watts    = parseFloat(document.getElementById('cWatts').value)   || 0;
    const kwh      = parseFloat(document.getElementById('cKwh').value)     || 0;
    const errPct   = parseFloat(document.getElementById('cError').value)   || 0;
    const maintenancePct = parseFloat(document.getElementById('cMaintenance').value) || 0;
    const modelHours = parseFloat(document.getElementById('cModelHours').value) || 0;
    const hourlyRate = parseFloat(document.getElementById('cHourlyRate').value) || 0;
    const accessoryCost = parseFloat(document.getElementById('cAccessory').value) || 0;
    const packagingCost = parseFloat(document.getElementById('cPackaging').value) || 0;
    const shippingCost = parseFloat(document.getElementById('cShipping').value) || 0;

    const matCost    = (qty / mat.div) * priceKg;
    const totalHours = hours + mins / 60;
    const engCost    = (watts / 1000) * totalHours * kwh;
    const subtotal   = matCost + engCost;
    const errCost    = subtotal * (errPct / 100);
    const maintenanceCost = subtotal * (maintenancePct / 100);
    const modelingCost = modelHours * hourlyRate;
    const total = subtotal + errCost + maintenanceCost + modelingCost + accessoryCost + packagingCost + shippingCost;

    document.getElementById('rMaterial').textContent  = brl(matCost);
    document.getElementById('rEnergy').textContent    = brl(engCost);
    document.getElementById('rSub').textContent       = brl(subtotal);
    document.getElementById('rErrorLbl').textContent  = `+ Margem de erro (${errPct}%)`;
    document.getElementById('rError').textContent     = brl(errCost);
    document.getElementById('rMaintenanceLbl').textContent = `+ Manutenção / desgaste (${maintenancePct}%)`;
    document.getElementById('rMaintenance').textContent = brl(maintenanceCost);
    document.getElementById('rModeling').textContent = brl(modelingCost);
    document.getElementById('rAccessory').textContent = brl(accessoryCost);
    document.getElementById('rPackaging').textContent = brl(packagingCost);
    document.getElementById('rShipping').textContent = brl(shippingCost);
    document.getElementById('rTotal').textContent     = brl(total);

    document.getElementById('m50').textContent  = brl(total * 1.5);
    document.getElementById('m100').textContent = brl(total * 2);
    document.getElementById('m150').textContent = brl(total * 2.5);
    document.getElementById('m200').textContent = brl(total * 3);
    updateQuoteTotal();

    clearTimeout(calcAuditTimer);
    calcAuditTimer = setTimeout(() => {
        if(qty > 0 || hours > 0 || mins > 0) {
            recordAdminAudit('usou_calculadora', 'calculadora', null, {
                material: document.getElementById('cMaterial').value,
                peso: qty + 'g',
                tempo: hours + 'h ' + mins + 'm',
                custo_total: brl(total)
            });
        }
    }, 3500); 
}

/* ── QUOTE PDF ─────────────────────────────────────────── */
const quoteEls = {
    productBox: document.getElementById('quoteProductBox'),
    product: document.getElementById('qProduct'),
    client: document.getElementById('qClient'),
    phone: document.getElementById('qPhone'),
    validity: document.getElementById('qValidity'),
    payment: document.getElementById('qPayment'),
    notes: document.getElementById('qNotes'),
    items: document.getElementById('quoteItems'),
    includeCalculated: document.getElementById('qIncludeCalculated'),
    pricingMode: document.getElementById('qPricingMode'),
    calculatedValue: document.getElementById('qCalculatedValue'),
    calcSubtotal: document.getElementById('qCalcSubtotal'),
    itemsSubtotal: document.getElementById('qItemsSubtotal'),
    grandTotal: document.getElementById('qGrandTotal'),
    addItem: document.getElementById('quoteAddItemBtn'),
    addProduct: document.getElementById('quoteAddProductBtn'),
    pdf: document.getElementById('quotePdfBtn'),
};

let quoteItemSequence = 0;
let quoteItems = [];

function moneyInput(value) {
    if (!Number.isFinite(value) || value <= 0) return '';
    return value.toFixed(2);
}

function quoteNumber() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `OS-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function calcSnapshot() {
    const materialKey = document.getElementById('cMaterial').value;
    const mat      = MATERIALS[materialKey] || MATERIALS.pla;
    const priceKg  = parseFloat(document.getElementById('cPriceKg').value) || 0;
    const qty      = parseFloat(document.getElementById('cQty').value)     || 0;
    const hours    = parseFloat(document.getElementById('cHours').value)   || 0;
    const mins     = parseFloat(document.getElementById('cMins').value)    || 0;
    const watts    = parseFloat(document.getElementById('cWatts').value)   || 0;
    const kwh      = parseFloat(document.getElementById('cKwh').value)     || 0;
    const errPct   = parseFloat(document.getElementById('cError').value)   || 0;
    const maintenancePct = parseFloat(document.getElementById('cMaintenance').value) || 0;
    const modelHours = parseFloat(document.getElementById('cModelHours').value) || 0;
    const hourlyRate = parseFloat(document.getElementById('cHourlyRate').value) || 0;
    const accessoryCost = parseFloat(document.getElementById('cAccessory').value) || 0;
    const packagingCost = parseFloat(document.getElementById('cPackaging').value) || 0;
    const shippingCost = parseFloat(document.getElementById('cShipping').value) || 0;
    const matCost  = (qty / mat.div) * priceKg;
    const totalHours = hours + mins / 60;
    const engCost  = (watts / 1000) * totalHours * kwh;
    const subtotal = matCost + engCost;
    const errCost  = subtotal * (errPct / 100);
    const maintenanceCost = subtotal * (maintenancePct / 100);
    const modelingCost = modelHours * hourlyRate;
    const total = subtotal + errCost + maintenanceCost + modelingCost + accessoryCost + packagingCost + shippingCost;

    return {
        materialKey,
        materialName: document.querySelector(`#cMaterial option[value="${materialKey}"]`)?.textContent || materialKey,
        unit: mat.unit,
        unitLabel: mat.unitLbl,
        priceKg,
        qty,
        hours,
        mins,
        watts,
        kwh,
        errPct,
        matCost,
        totalHours,
        engCost,
        subtotal,
        errCost,
        maintenancePct,
        maintenanceCost,
        modelHours,
        hourlyRate,
        modelingCost,
        accessoryCost,
        packagingCost,
        shippingCost,
        total,
        suggested100: total * 2,
    };
}

function quoteCalculatedPrice(calc = calcSnapshot()) {
    const multipliers = {
        cost: 1,
        profit50: 1.5,
        profit100: 2,
        profit150: 2.5,
        profit200: 3,
    };
    const multiplier = multipliers[quoteEls.pricingMode?.value] || 1;
    return quoteEls.includeCalculated?.checked ? calc.total * multiplier : 0;
}

function updateQuoteProductOptions() {
    if (!quoteEls.product) return;
    const current = quoteEls.product.value;
    const ordered = [...products].sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR'));
    quoteEls.product.innerHTML = '<option value="">Escolha um produto...</option>' +
        ordered.map(p => `<option value="${p.id}">${esc(p.name)}${p.price != null ? ` — ${brl(Number(p.price))}` : ' — consultar preço'}</option>`).join('');
    if (current && ordered.some(p => String(p.id) === String(current))) quoteEls.product.value = current;
}

function addQuoteItem(item = {}) {
    if (quoteItems.length >= 12) {
        showToast('A OS aceita até 12 itens para manter o PDF em uma página.', 'error');
        return;
    }
    quoteItems.push({
        id: ++quoteItemSequence,
        name: item.name || '',
        description: item.description || '',
        quantity: Math.max(1, Number(item.quantity) || 1),
        unitPrice: Math.max(0, Number(item.unitPrice) || 0),
    });
    renderQuoteItems();
}

function applyProductToQuote(id) {
    const product = products.find(p => String(p.id) === String(id));
    if (!product) return;

    const category = CAT_LABELS[product.category] || product.category || '';
    const colors = product.colors?.length ? `\nCores disponíveis: ${product.colors.join(', ')}.` : '';
    const dimensions = product.dimensions && (product.dimensions.length || product.dimensions.width || product.dimensions.height)
        ? `\nDimensões aproximadas: ${product.dimensions.length || '-'} x ${product.dimensions.width || '-'} x ${product.dimensions.height || '-'} cm.`
        : '';
    const weight = product.weight ? `\nPeso aproximado: ${product.weight} g.` : '';
    const material = product.material ? `\nMaterial: ${product.material}.` : '';
    const description = [
        product.desc || '',
        category ? `Categoria: ${category}.` : '',
        material,
        dimensions,
        weight,
        colors,
    ].filter(Boolean).join(' ');

    const newItem = {
        name: product.name || 'Produto',
        description,
        quantity: 1,
        unitPrice: quoteEls.includeCalculated?.checked ? 0 : (product.price != null ? Number(product.price) : 0),
    };
    const first = quoteItems[0];
    if (quoteItems.length === 1 && first && !first.name && !first.description && !first.unitPrice) {
        Object.assign(first, newItem);
        renderQuoteItems();
    } else {
        addQuoteItem(newItem);
    }
    quoteEls.product.value = '';
    if (quoteEls.includeCalculated?.checked) {
        showToast('Produto adicionado sem preço extra; valor da calculadora já está na OS.', 'info');
    }
}

function renderQuoteItems() {
    quoteEls.items.innerHTML = quoteItems.length ? quoteItems.map((item, index) => `
        <div class="quote-item" data-item-id="${item.id}">
            <div class="quote-item-top">
                <span class="quote-item-number">Item ${index + 1}</span>
                <button type="button" class="quote-item-remove" data-remove-item="${item.id}" aria-label="Remover item">Remover</button>
            </div>
            <div class="form-group">
                <label>Produto / serviço</label>
                <input type="text" data-item-field="name" value="${esc(item.name)}" placeholder="Ex: Chaveiro personalizado">
            </div>
            <div class="form-group">
                <label>Descrição</label>
                <textarea data-item-field="description" rows="2" placeholder="Material, cor, tamanho, acabamento e acessórios.">${esc(item.description)}</textarea>
            </div>
            <div class="quote-item-values">
                <div class="form-group">
                    <label>Quantidade</label>
                    <input type="number" data-item-field="quantity" min="1" step="1" value="${item.quantity}">
                </div>
                <div class="form-group">
                    <label>Valor unitário</label>
                    <div class="calc-affix"><span class="affix-pre">R$</span><input type="number" data-item-field="unitPrice" min="0" step="0.01" value="${moneyInput(item.unitPrice)}" placeholder="0,00"></div>
                </div>
                <div class="quote-item-subtotal"><span>Subtotal</span><strong>${brl(item.quantity * item.unitPrice)}</strong></div>
            </div>
        </div>`).join('') : '<div class="quote-items-empty">Nenhum item adicional. O valor da calculadora já será incluído na OS.</div>';
    updateQuoteTotal();
}

function updateQuoteTotal() {
    if (!quoteEls.grandTotal) return;
    const itemsTotal = quoteItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    const calculatedTotal = quoteCalculatedPrice();
    quoteEls.calculatedValue.textContent = brl(calculatedTotal);
    quoteEls.calcSubtotal.textContent = brl(calculatedTotal);
    quoteEls.itemsSubtotal.textContent = brl(itemsTotal);
    quoteEls.grandTotal.textContent = brl(calculatedTotal + itemsTotal);
}

function readQuoteForm() {
    const calc = calcSnapshot();
    const days = Math.max(1, parseInt(quoteEls.validity.value, 10) || 7);
    const now = new Date();
    const validUntil = new Date(now);
    validUntil.setDate(validUntil.getDate() + days);
    const extraItems = quoteItems
        .map(item => ({ ...item, name: item.name.trim(), description: item.description.trim() }))
        .filter(item => item.name || item.description || item.unitPrice > 0);
    const calculatedValue = quoteCalculatedPrice(calc);
    const calculatedItem = calculatedValue > 0 ? [{
        id: 'calculated',
        name: 'Produção 3D e execução do pedido',
        description: 'Valor calculado para produção e serviços conforme especificações do pedido.',
        quantity: 1,
        unitPrice: calculatedValue,
        calculated: true,
    }] : [];
    const items = [...calculatedItem, ...extraItems];
    const salePrice = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

    return {
        number: quoteNumber(),
        date: now.toLocaleDateString('pt-BR'),
        validUntil: validUntil.toLocaleDateString('pt-BR'),
        client: quoteEls.client.value.trim() || 'Cliente não informado',
        phone: quoteEls.phone.value.trim(),
        items,
        calculatedValue,
        salePrice,
        payment: quoteEls.payment.value.trim() || 'A combinar',
        notes: quoteEls.notes.value.trim(),
        calc,
    };
}

function addWrappedText(doc, text, x, y, maxWidth, lineHeight = 13) {
    const lines = doc.splitTextToSize(String(text || ''), maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * lineHeight;
}

function drawQuoteHeader(doc, quote) {
    doc.setFillColor(8, 8, 20);
    doc.rect(0, 0, 595, 112, 'F');
    doc.setFillColor(124, 58, 237);
    doc.rect(0, 108, 595, 4, 'F');
    doc.setFillColor(14, 165, 233);
    doc.rect(150, 108, 445, 4, 'F');

    doc.setDrawColor(124, 58, 237);
    doc.setLineWidth(2);
    doc.line(42, 44, 62, 32);
    doc.line(62, 32, 82, 44);
    doc.line(82, 44, 82, 68);
    doc.line(82, 68, 62, 80);
    doc.line(62, 80, 42, 68);
    doc.line(42, 68, 42, 44);
    doc.setFillColor(14, 165, 233);
    doc.circle(62, 56, 11, 'F');

    doc.setTextColor(245, 247, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.text('FORGECON', 102, 54);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(158, 170, 198);
    doc.text('IMPRESSAO 3D PROFISSIONAL', 103, 70);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(245, 247, 255);
    doc.text('ORDEM DE SERVICO', 410, 48);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(190, 198, 218);
    doc.text(quote.number, 430, 65);
    doc.text(`Emitido em ${quote.date}`, 430, 80);
}

function drawInfoBox(doc, title, rows, x, y, w) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(225, 230, 240);
    doc.roundedRect(x, y, w, 70, 8, 8, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(124, 58, 237);
    doc.text(title, x + 14, y + 20);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(68, 77, 96);
    let cursor = y + 37;
    rows.forEach(row => {
        doc.text(row, x + 14, cursor);
        cursor += 14;
    });
}

function fitPdfText(doc, text, maxWidth) {
    let value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value) return '-';
    while (value.length > 4 && doc.getTextWidth(value) > maxWidth) value = value.slice(0, -1);
    return value === String(text || '').replace(/\s+/g, ' ').trim() ? value : `${value.slice(0, -3)}...`;
}

function drawItemsTable(doc, quote, y, margin, pageW) {
    const tableW = pageW - margin * 2;
    const columns = { item: 14, qty: 330, unit: 415, total: 500 };
    const rowHeight = Math.max(23, Math.min(38, 300 / Math.max(1, quote.items.length)));

    doc.setFillColor(15, 23, 42);
    doc.roundedRect(margin, y, tableW, 28, 6, 6, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text('ITEM', margin + columns.item, y + 18);
    doc.text('PRODUTO / SERVICO', margin + 42, y + 18);
    doc.text('QTD.', margin + columns.qty, y + 18, { align: 'right' });
    doc.text('UNITARIO', margin + columns.unit, y + 18, { align: 'right' });
    doc.text('SUBTOTAL', margin + columns.total, y + 18, { align: 'right' });
    y += 28;

    quote.items.forEach((item, index) => {
        if (index % 2 === 0) {
            doc.setFillColor(248, 250, 252);
            doc.rect(margin, y, tableW, rowHeight, 'F');
        }
        doc.setDrawColor(226, 232, 240);
        doc.line(margin, y + rowHeight, pageW - margin, y + rowHeight);
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(String(index + 1).padStart(2, '0'), margin + columns.item, y + 15);
        doc.text(fitPdfText(doc, item.name || 'Item sem nome', 265), margin + 42, y + 13);
        if (rowHeight >= 30 && item.description) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.8);
            doc.setTextColor(100, 116, 139);
            doc.text(fitPdfText(doc, item.description, 265), margin + 42, y + 25);
        }
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(30, 41, 59);
        doc.text(String(item.quantity), margin + columns.qty, y + 15, { align: 'right' });
        doc.text(brl(item.unitPrice), margin + columns.unit, y + 15, { align: 'right' });
        doc.setFont('helvetica', 'bold');
        doc.text(brl(item.quantity * item.unitPrice), margin + columns.total, y + 15, { align: 'right' });
        y += rowHeight;
    });
    return y;
}

function generateQuotePdf() {
    const jsPDF = window.jspdf?.jsPDF;
    const quote = readQuoteForm();
    if (!quote.items.length || !quote.salePrice) {
        showToast('Adicione ao menos um item com valor antes de gerar a OS.', 'error');
        return;
    }
    if (!jsPDF) {
        openQuotePrintFallback(quote);
        return;
    }

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
    const margin = 42;
    const pageW = 595;
    const pageH = 842;

    drawQuoteHeader(doc, quote);
    drawInfoBox(doc, 'CLIENTE', [
        quote.client,
        quote.phone ? `Contato: ${quote.phone}` : 'Contato nao informado',
    ], margin, 132, 245);
    drawInfoBox(doc, 'DOCUMENTO', [
        quote.number,
        `Emissao: ${quote.date}`,
        `Valido ate: ${quote.validUntil}`,
    ], 308, 132, 245);

    let y = drawItemsTable(doc, quote, 222, margin, pageW) + 18;

    doc.setFillColor(124, 58, 237);
    doc.roundedRect(margin, y, pageW - margin * 2, 58, 10, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.text('VALOR TOTAL', margin + 20, y + 34);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(25);
    doc.text(brl(quote.salePrice), pageW - margin - 20, y + 38, { align: 'right' });
    y += 82;

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('Forma de pagamento', margin, y);
    doc.text('Observacoes', 308, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(fitPdfText(doc, quote.payment, 220), margin, y);
    const noteLines = doc.splitTextToSize(quote.notes || 'Prazo, frete e acabamento final devem ser confirmados antes da producao.', 245).slice(0, 3);
    doc.text(noteLines, 308, y);

    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageH - 78, pageW - margin, pageH - 78);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Forgecon - Impressao 3D Profissional', margin, pageH - 55);
    doc.text('Orcamento sujeito a alteracao conforme ajustes de arquivo, acabamento, prazo e disponibilidade de material.', margin, pageH - 42);

    const safeName = quote.client.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cliente';
    doc.save(`${quote.number}-${safeName}.pdf`);

    recordAdminAudit('gerou_os', 'calculadora', null, {
        cliente: quote.client,
        itens: quote.items.length,
        valor: brl(quote.salePrice),
    });
    showToast('OS em PDF gerada.');
}

function openQuotePrintFallback(quote) {
    const win = window.open('', '_blank');
    if (!win) {
        showToast('Não foi possível abrir a janela de impressão.', 'error');
        return;
    }
    win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(quote.number)}</title>
        <style>
            *{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#0f172a;background:#fff}
            header{background:#080814;color:#fff;padding:24px 36px;border-bottom:5px solid #7c3aed;display:flex;justify-content:space-between}
            h1{margin:0;font-size:28px;letter-spacing:2px}.sub{color:#9aa6c0;margin-top:4px}.doc{text-align:right}.doc strong{display:block;font-size:18px}
            main{padding:24px 36px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
            .box{border:1px solid #e2e8f0;border-radius:10px;padding:14px;margin-bottom:16px}.box p{margin:8px 0 0;line-height:1.45}
            table{width:100%;border-collapse:collapse;font-size:12px}th{background:#0f172a;color:#fff;text-align:left;padding:9px}td{padding:8px;border-bottom:1px solid #e2e8f0}th:nth-child(n+2),td:nth-child(n+2){text-align:right}.item-desc{display:block;color:#64748b;font-size:10px;margin-top:3px}
            .total{background:#7c3aed;color:#fff;border-radius:10px;padding:16px 20px;margin-top:16px;display:flex;justify-content:space-between;align-items:center}.total strong{font-size:26px}
            button{margin:16px 36px;padding:10px 16px}@page{size:A4;margin:0}@media print{button{display:none}body{width:210mm;height:297mm;overflow:hidden}}
        </style></head><body>
        <header><div><h1>FORGECON</h1><div class="sub">IMPRESSAO 3D PROFISSIONAL</div></div><div class="doc"><strong>ORDEM DE SERVICO</strong>${esc(quote.number)}<br>${esc(quote.date)}</div></header>
        <main>
            <div class="grid">
                <div class="box"><strong>Cliente</strong><p>${esc(quote.client)}<br>${esc(quote.phone || 'Contato nao informado')}<br>Valido ate ${esc(quote.validUntil)}</p></div>
                <div class="box"><strong>Documento</strong><p>${esc(quote.number)}<br>Emitido em ${esc(quote.date)}<br>Valido ate ${esc(quote.validUntil)}</p></div>
            </div>
            <table><thead><tr><th>Produto / servico</th><th>Qtd.</th><th>Unitario</th><th>Subtotal</th></tr></thead><tbody>
                ${quote.items.map(item => `<tr><td><strong>${esc(item.name || 'Item')}</strong>${item.description ? `<span class="item-desc">${esc(item.description)}</span>` : ''}</td><td>${item.quantity}</td><td>${brl(item.unitPrice)}</td><td><strong>${brl(item.quantity * item.unitPrice)}</strong></td></tr>`).join('')}
            </tbody></table>
            <div class="total"><span>VALOR TOTAL</span><strong>${brl(quote.salePrice)}</strong></div>
            <div class="grid" style="margin-top:20px">
                <div class="box"><strong>Pagamento</strong><p>${esc(quote.payment)}</p></div>
                <div class="box"><strong>Observacoes</strong><p>${esc(quote.notes || 'A combinar').replace(/\n/g, '<br>')}</p></div>
            </div>
            <button onclick="window.print()">Imprimir / salvar PDF</button>
        </main></body></html>`);
    win.document.close();
    win.focus();
}

quoteEls.items?.addEventListener('input', event => {
    const field = event.target.dataset.itemField;
    const row = event.target.closest('.quote-item');
    if (!field || !row) return;
    const item = quoteItems.find(entry => entry.id === Number(row.dataset.itemId));
    if (!item) return;
    item[field] = field === 'name' || field === 'description'
        ? event.target.value
        : Math.max(field === 'quantity' ? 1 : 0, Number(event.target.value) || 0);
    const subtotal = row.querySelector('.quote-item-subtotal strong');
    if (subtotal) subtotal.textContent = brl(item.quantity * item.unitPrice);
    updateQuoteTotal();
});

quoteEls.items?.addEventListener('click', event => {
    const id = Number(event.target.dataset.removeItem);
    if (!id) return;
    quoteItems = quoteItems.filter(item => item.id !== id);
    renderQuoteItems();
});
quoteEls.addItem?.addEventListener('click', () => addQuoteItem());
quoteEls.addProduct?.addEventListener('click', () => {
    if (!quoteEls.product.value) {
        showToast('Escolha um produto para adicionar.', 'error');
        return;
    }
    applyProductToQuote(quoteEls.product.value);
});
quoteEls.includeCalculated?.addEventListener('change', updateQuoteTotal);
quoteEls.pricingMode?.addEventListener('change', updateQuoteTotal);
quoteEls.pdf?.addEventListener('click', generateQuotePdf);
updateQuoteProductOptions();
renderQuoteItems();

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


function setupAuditView() {
    const nav = document.getElementById('adminNav');
    const panel = document.getElementById('adminPanel');

    if (!nav || !panel) return;

    const isSuperAdmin = loggedUser && loggedUser.email === 'marcel.conde@hotmail.com';

    if (isSuperAdmin && !document.querySelector('.admin-nav-tab[data-view="audit"]')) {
        const tab = document.createElement('button');
        tab.type = 'button';
        tab.className = 'admin-nav-tab';
        tab.dataset.view = 'audit';
        tab.textContent = 'Logs e Auditoria';
        nav.appendChild(tab);
    }

    if (!isSuperAdmin) {
       const auditTab = document.querySelector('.admin-nav-tab[data-view="audit"]');
       if(auditTab) auditTab.remove();
    }

    if (isSuperAdmin && !document.getElementById('auditView')) {
        const view = document.createElement('section');
        view.id = 'auditView';
        view.className = 'admin-view hidden';
        view.innerHTML = `
            <div class="content-head">
                <div>
                    <h2>Logs e Auditoria</h2>
                    <p id="auditSubtitle">Acompanhe logins, convites e alterações feitas no painel.</p>
                </div>
                <button type="button" class="btn btn-outline btn-sm" id="refreshAuditBtn">Atualizar</button>
            </div>
            <div class="users-card">
                <div id="auditList" class="users-list">
                    <div class="user-row-empty">Abra esta aba para carregar os logs.</div>
                </div>
            </div>
        `;
        panel.appendChild(view);

        document.getElementById('refreshAuditBtn')?.addEventListener('click', () => loadAuditLogs());
    }
}

function startAuditPolling() {
    stopAuditPolling();
    auditPollTimer = setInterval(() => {
        const auditView = document.getElementById('auditView');
        if (auditView && !auditView.classList.contains('hidden')) loadAuditLogs(false);
    }, 5000);
}

function stopAuditPolling() {
    if (auditPollTimer) {
        clearInterval(auditPollTimer);
        auditPollTimer = null;
    }
}

/* ── NOVO LAYOUT DE AUDITORIA ─────────────────────────────────────────── */

function auditIcon(action) {
    const icons = {
        login: '🔑', logout: '🚪', create: '➕', update: '✏️', delete: '🗑️',
        invite: '✉️', accept_invite: '🤝', usou_calculadora: '🧮',
        recuperar_senha: '🆘', redefinir_senha: '🔐', criar_usuario: '👤',
        excluir_usuario: '🚫', enviar_convite: '📨', gerou_orcamento: '📄', gerou_os: '📄'
    };
    return icons[action] || '📌';
}

function auditActionLabel(action) {
    const labels = {
        login: 'Login', logout: 'Logout', create: 'Criou', update: 'Editou',
        delete: 'Removeu', invite: 'Convidou', accept_invite: 'Aceitou convite',
        usou_calculadora: 'Calculou custo', recuperar_senha: 'Pediu para recuperar senha',
        redefinir_senha: 'Redefiniu senha', criar_usuario: 'Criou usuário',
        excluir_usuario: 'Excluiu usuário', enviar_convite: 'Enviou convite',
        gerou_orcamento: 'Gerou orçamento', gerou_os: 'Gerou ordem de serviço'
    };
    return labels[action] || action;
}

function auditEntityLabel(entity) {
    const labels = {
        auth: 'no sistema', product: 'produto', user: 'usuário',
        category: 'categoria', gallery: 'galeria', calculadora: 'na calculadora',
        users: 'de sistema', invites: 'para administrador'
    };
    return esc(labels[entity] || entity);
}

function formatAuditDate(ts) {
    if (!ts) return '—';
    const date = typeof ts === 'number'
        ? new Date(ts * 1000)
        : new Date(String(ts).replace(' ', 'T') + 'Z');
    if (Number.isNaN(date.getTime())) return String(ts);
    return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Cria os "badges/pílulas" elegantes para os detalhes
function renderAuditDetails(details) {
    if (!details || typeof details !== 'object' || Object.keys(details).length === 0) return '';
    return '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">' +
        Object.entries(details).map(([key, value]) => {
            const cleanKey = esc(key.replace(/_/g, ' ').toUpperCase());
            const cleanVal = esc(typeof value === 'object' ? JSON.stringify(value) : value);
            // Estilo visual moderno das pílulas para contrastar com o fundo escuro
            return `<span style="background: rgba(255,255,255,0.05); color: #cbd5e1; font-size: 0.75rem; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); font-weight: 500;">
                        ${cleanKey}: <strong style="color: #fff">${cleanVal}</strong>
                    </span>`;
        }).join('') +
        '</div>';
}

async function loadAuditLogs(showLoading = true) {
    const el = document.getElementById('auditList');
    if (!el) return;

    if (showLoading) el.innerHTML = '<div class="user-row-empty">Carregando logs...</div>';

    try {
        const res = await workerFetch('/auth/audit-logs?limit=100');
        const data = await res.json();

        if (!res.ok) {
            el.innerHTML = `<div class="user-row-empty">${data.error || 'Acesso negado'}</div>`;
            return;
        }

        if (!data.logs.length) {
            el.innerHTML = '<div class="user-row-empty">Nenhum log registrado ainda.</div>';
            return;
        }

        const subtitle = document.getElementById('auditSubtitle');
        if (subtitle) subtitle.textContent = `${data.logs.length} evento(s) recentes. Atualização automática a cada 5 segundos.`;

        // Renderiza cada log com o novo layout moderno e limpo
        el.innerHTML = data.logs.map(log => `
            <div style="background: var(--bg-panel, #151821); border: 1px solid var(--border, #2a2e3d); border-radius: 8px; padding: 16px; margin-bottom: 12px; display: flex; gap: 16px; align-items: flex-start; transition: border-color 0.2s;">
                <div style="font-size: 1.2rem; background: rgba(124, 58, 237, 0.1); width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; border-radius: 50%; flex-shrink: 0; border: 1px solid rgba(124, 58, 237, 0.2);">
                    ${auditIcon(log.action)}
                </div>
                <div style="flex-grow: 1; min-width: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; flex-wrap: wrap; gap: 8px;">
                        <span style="color: #f8fafc; font-weight: 600; font-size: 0.95rem;">
                            ${auditActionLabel(log.action)} ${auditEntityLabel(log.entity)}${log.entity_id ? ` <span style="color:var(--purple)">#${esc(log.entity_id)}</span>` : ''}
                        </span>
                        <span style="color: #64748b; font-size: 0.8rem; white-space: nowrap;">
                            🕒 ${formatAuditDate(log.created_at)}
                        </span>
                    </div>
                    <div style="color: #94a3b8; font-size: 0.85rem;">
                        Por: <strong style="color:#cbd5e1">${esc(log.user_name || 'Usuário')}</strong> (${esc(log.user_email || 'sem e-mail')})
                    </div>
                    ${renderAuditDetails(log.details)}
                </div>
            </div>`).join('');
    } catch {
        el.innerHTML = '<div class="user-row-empty">Erro ao carregar logs.</div>';
    }
}

window.addEventListener('beforeunload', stopAuditPolling);
