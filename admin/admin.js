/* ── CONFIG ─────────────────────────────────────────────── */
const CONFIG = {
    workerUrl: 'https://forgecon-auth.marcel-conde.workers.dev',
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
    const res = await fetch(CONFIG.workerUrl + path, { ...options, headers });
    return res;
}

async function recordAdminAudit(action, entity, entityId, details = {}) {
    try {
        await workerFetch('/auth/audit-logs', {
            method: 'POST',
            body: JSON.stringify({ action, entity, entityId, details }),
        });
    } catch (err) {
        console.warn('Falha ao registrar auditoria:', err);
    }
}

function showPanel() {
    loginScreen.classList.add('hidden');
    adminPanel.classList.remove('hidden');
    loadProducts();
    renderGrid();
    updateStats();
}

function showLogin() {
    sessionStorage.removeItem('forgecon_token');
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
        const res = await fetch(CONFIG.workerUrl + '/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: loginEmail.value.trim(), password: loginPw.value }),
        });
        const data = await res.json();
        if (res.ok) {
            sessionStorage.setItem('forgecon_token', data.token);
            showPanel();
        } else {
            loginError.textContent = data.error || 'Credenciais inválidas.';
            loginPw.value = '';
            loginPw.focus();
        }
    } catch {
        loginError.textContent = 'Erro de conexão. Tente novamente.';
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

document.getElementById('syncCloudinaryBtn').addEventListener('click', async () => {
    const folder = document.getElementById('imagePublicId').value.trim();
    const hint   = document.getElementById('syncHint');
    const btn    = document.getElementById('syncCloudinaryBtn');

    if (!folder) {
        hint.textContent = 'Preencha a pasta da foto de capa primeiro (ex: Geek/Pikachu/capa).';
        hint.style.color = 'var(--red)';
        return;
    }

    // Deriva a pasta do produto a partir do path da capa (remove o último segmento)
    const parts = folder.split('/');
    const productFolder = parts.length > 1 ? 'Produtos/' + parts.slice(0, -1).join('/') : 'Produtos';

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

        extraImages = [];
        const list = document.getElementById('extraImagesList');
        list.innerHTML = `<p style="font-size:.8rem;color:var(--text2);margin:6px 0">Clique nas fotos para incluir (a capa já é adicionada automaticamente):</p>
            <div class="cld-thumb-grid" id="cldThumbGrid"></div>`;

        const coverFull = 'Produtos/' + folder;
        const grid = document.getElementById('cldThumbGrid');

        data.images.forEach(img => {
            const isCover = img.public_id === coverFull;
            const thumb = document.createElement('img');
            thumb.src = `https://res.cloudinary.com/${CONFIG.cloudName}/image/upload/w_140,h_140,c_fill,q_auto,f_auto/${img.public_id}`;
            thumb.className = 'cld-thumb' + (isCover ? ' selected' : '');
            thumb.title = img.public_id;

            if (!isCover) {
                thumb.addEventListener('click', () => {
                    const path = img.public_id.replace('Produtos/', '');
                    if (thumb.classList.contains('selected')) {
                        thumb.classList.remove('selected');
                        extraImages = extraImages.filter(e => e !== path);
                    } else {
                        thumb.classList.add('selected');
                        extraImages.push(path);
                    }
                });
            }
            grid.appendChild(thumb);
        });

        hint.textContent = `${data.images.length} foto(s) encontrada(s). Selecione as que deseja incluir.`;
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
productForm.addEventListener('submit', async e => {
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
        await recordAdminAudit('update', 'product', product.id, {
            name: product.name,
            category: product.category,
            price: product.price,
        });
        showToast('Produto atualizado!');
    } else {
        products.push(product);
        await recordAdminAudit('create', 'product', product.id, {
            name: product.name,
            category: product.category,
            price: product.price,
        });
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
    const deletedProduct = products.find(p => p.id === pendingDeleteId);
    products = products.filter(p => p.id !== pendingDeleteId);
    recordAdminAudit('delete', 'product', pendingDeleteId, deletedProduct ? {
        name: deletedProduct.name,
        category: deletedProduct.category,
        price: deletedProduct.price,
    } : {});
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
    document.getElementById('usersView').classList.toggle('hidden', view !== 'users');
    const auditView = document.getElementById('auditView');
    if (auditView) auditView.classList.toggle('hidden', view !== 'audit');
    if (view === 'users') loadUsersView();
    if (view === 'audit') loadAuditLogs();
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


/* ── AUDIT VIEW ─────────────────────────────────────────── */
function auditActionLabel(action) {
    const labels = {
        login: 'Login',
        create: 'Criou',
        update: 'Editou',
        delete: 'Removeu',
        invite: 'Convidou',
        accept_invite: 'Aceitou convite',
    };
    return labels[action] || action;
}

function formatAuditDate(ts) {
    if (!ts) return '—';
    return new Date(ts * 1000).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
    });
}

function auditDetailsText(details) {
    if (!details || typeof details !== 'object') return '';
    return Object.entries(details)
        .map(([key, value]) => `${key}: ${typeof value === 'object' ? JSON.stringify(value) : value}`)
        .join(' • ');
}

async function loadAuditLogs() {
    const el = document.getElementById('auditList');
    if (!el) return;

    el.innerHTML = '<div class="user-row-empty">Carregando logs...</div>';

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

        el.innerHTML = data.logs.map(log => `
            <div class="user-row audit-row">
                <div class="user-avatar" style="background:linear-gradient(135deg,#7c3aed,#2563eb)">${auditActionLabel(log.action)[0]}</div>
                <div class="user-info">
                    <div class="user-name">${auditActionLabel(log.action)} ${esc(log.entity)}${log.entity_id ? ` #${esc(log.entity_id)}` : ''}</div>
                    <div class="user-email">${esc(log.user_name || 'Usuário')} • ${esc(log.user_email || 'sem e-mail')} • ${formatAuditDate(log.created_at)}</div>
                    <div class="user-email">${esc(auditDetailsText(log.details))}</div>
                </div>
                <span class="user-badge badge-admin">${esc(log.action)}</span>
            </div>`).join('');
    } catch {
        el.innerHTML = '<div class="user-row-empty">Erro ao carregar logs.</div>';
    }
}