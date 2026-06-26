'use strict';

/* =============================================
   CLOUDINARY CONFIG
   Para ativar: preencha o cloud_name com o nome
   da sua conta em cloudinary.com (Settings → Account)
   ============================================= */
const CLOUDINARY = {
    cloud_name: 'das730gjc',
    base_url() {
        return `https://res.cloudinary.com/${this.cloud_name}/image/upload`;
    },
    // Gera URL otimizada automaticamente (redimensiona + comprime + converte para WebP)
    // public_id: caminho relativo à pasta Produtos/ — ex: 'Geek/pikachu/capa'
    url(public_id, { width = 600, height = 450, crop = 'fill' } = {}) {
        if (!public_id) return null;
        return `${this.base_url()}/w_${width},h_${height},c_${crop},q_auto,f_auto/Produtos/${public_id}`;
    },
};

/* =============================================
   DATA
   ============================================= */
const DEFAULT_PRODUCTS = [
    // image: caminho relativo à pasta Produtos/ no Cloudinary, sem extensão
    // Exemplo: image: 'Geek/Pikachu/capa'  →  Produtos/Geek/Pikachu/capa
    // Deixe null enquanto não tiver foto — exibe emoji como placeholder

    // ── GEEK ──────────────────────────────────────────────
    { id:1,  name:'Homem Aranha',       category:'geek',        price:null, badge:null, rating:5.0, reviews:0, desc:'Miniatura do Homem Aranha impressa em resina com alto nível de detalhe. Ideal para colecionadores e fãs da Marvel.', emoji:'🕷️', colors:['Vermelho','Azul','Preto','Natural'], image: null },
    { id:2,  name:'The Last Of Us',     category:'geek',        price:null, badge:null, rating:5.0, reviews:0, desc:'Peça colecionável inspirada no universo de The Last Of Us. Detalhes fiéis ao jogo, impressão em resina de alta precisão.', emoji:'🍄', colors:['Natural','Pintado'], image: null },
    { id:3,  name:'Kratos',             category:'geek',        price:null, badge:null, rating:5.0, reviews:0, desc:'Miniatura do Kratos de God of War com detalhes incríveis. Um item obrigatório para fãs da saga.', emoji:'⚔️', colors:['Cinza','Pintado','Natural'], image: null },
    { id:4,  name:'Pikachu',            category:'geek',        price:null, badge:null, rating:5.0, reviews:0, desc:'Pikachu colecionável impresso em PLA com acabamento premium. Disponível em tamanhos variados.', emoji:'⚡', colors:['Amarelo','Natural','Pintado'], image: null },
    { id:5,  name:'Homem de Ferro',     category:'geek',        price:null, badge:null, rating:5.0, reviews:0, desc:'Miniatura do Homem de Ferro com riqueza de detalhes na armadura. Perfeita para decoração de mesa ou coleção.', emoji:'🤖', colors:['Vermelho/Dourado','Preto','Natural'], image: null },

    // ── DECORAÇÃO ─────────────────────────────────────────
    { id:6,  name:'Violão Decorativo',  category:'decoracao',   price:null, badge:null, rating:5.0, reviews:0, desc:'Réplica decorativa de violão em impressão 3D. Ideal para decoração de paredes, estantes e estúdios musicais.', emoji:'🎸', colors:['Madeira','Preto','Branco'], image: null },
    { id:7,  name:'Animais (Geral)',    category:'decoracao',   price:null, badge:null, rating:5.0, reviews:0, desc:'Coleção de animais decorativos impressos em 3D. Diversas espécies disponíveis para decoração de ambientes.', emoji:'🦁', colors:['Natural','Pintado','Colorido'], image: null },
    { id:8,  name:'Gato Decorativo',   category:'decoracao',   price:null, badge:null, rating:5.0, reviews:0, desc:'Estatueta de gato com design moderno e elegante. Disponível em diversas poses e cores para combinar com seu ambiente.', emoji:'🐱', colors:['Preto','Branco','Cinza','Colorido'], image: null },
    { id:9,  name:'Cachorro Decorativo',category:'decoracao',  price:null, badge:null, rating:5.0, reviews:0, desc:'Estatueta de cachorro com acabamento refinado. Personalize com a raça e cor do seu pet favorito.', emoji:'🐶', colors:['Natural','Pintado','Personalizado'], image: null },

    // ── FERRAMENTAS ───────────────────────────────────────
    { id:10, name:'Protetor de Drone',  category:'ferramentas', price:null, badge:null, rating:5.0, reviews:0, desc:'Protetor para hélices e estrutura de drone impresso em PLA resistente. Compatível com os principais modelos do mercado.', emoji:'🚁', colors:['Preto','Laranja','Amarelo'], image: null },
    { id:11, name:'Suporte para Livros',category:'ferramentas', price:null, badge:null, rating:5.0, reviews:0, desc:'Suporte organizador de livros com design minimalista. Mantém seus livros em pé e organizados na estante.', emoji:'📚', colors:['Preto','Branco','Madeira'], image: null },
    { id:12, name:'Porta Lanterna',     category:'ferramentas', price:null, badge:null, rating:5.0, reviews:0, desc:'Suporte para lanterna tático impresso em PLA de alta resistência. Encaixe preciso e fixação segura.', emoji:'🔦', colors:['Preto','Verde Militar','Laranja'], image: null },

    // ── ORGANIZAÇÃO ───────────────────────────────────────
    { id:13, name:'Marca Página',       category:'organizacao', price:null, badge:null, rating:5.0, reviews:0, desc:'Marca páginas personalizados impressos em 3D. Vários modelos criativos e possibilidade de personalização com nome ou frase.', emoji:'🔖', colors:['Colorido','Preto','Natural'], image: null },
    { id:14, name:'Organizador de Cabos',category:'organizacao',price:null, badge:null, rating:5.0, reviews:0, desc:'Organizador de cabos para mesa e parede. Mantém seus cabos USB, carregadores e fones sempre organizados e acessíveis.', emoji:'🔌', colors:['Preto','Branco','Cinza'], image: null },
];

const PRODUCTS_URL = 'https://api.forgecon.com.br/products';

// Cache local é apenas fallback; o catálogo oficial vem do Worker/D1.
function normalizeProducts(list) {
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

function loadCachedProducts() {
    try {
        const raw = localStorage.getItem('print3d_products');
        const saved = raw ? JSON.parse(raw) : null;
        return (saved && saved.length) ? normalizeProducts(saved) : DEFAULT_PRODUCTS;
    } catch {
        return DEFAULT_PRODUCTS;
    }
}

function cacheProducts(list) {
    try {
        localStorage.setItem('print3d_products', JSON.stringify(list));
    } catch {
        // Cache é opcional; o site continua funcionando sem ele.
    }
}

let PRODUCTS = loadCachedProducts();

const CATEGORY_LABELS = {
    all:            'Todos',
    geek:           'Geek',
    decoracao:      'Decoração',
    organizacao:    'Organização',
    ferramentas:    'Ferramentas',
    gadgets:        'Gadgets',
    personalizados: 'Personalizados',
};

// Pasta base no Cloudinary — não altere
const CLD_BASE = 'Produtos';
const SITE_SETTINGS_URL = 'https://api.forgecon.com.br/settings';
const SHIPPING_QUOTE_URL = 'https://api.forgecon.com.br/shipping/quote';
const CART_STORAGE_KEY = 'forgecon_cart';
const DEFAULT_WHATSAPP_MESSAGE = 'Olá, vim pelo site e gostaria de solicitar um orçamento';
let SITE_SETTINGS = {
    whatsapp: '11 95028-0670',
    email: 'contato@forgecon.com.br',
    instagram: '@_forgecon_',
    shopee: '',
    mercadolivre: '',
};

const TESTIMONIALS = [
    { name:'Marcel Conde',     city:'Recife, PE',           rating:5, avatar:'MC', text:'Vamo fazer essa porra funcionar mano' },
];

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function moneyBRL(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return 'Consultar preço';
    return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

function normalizePhoneDigits(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    return digits.startsWith('55') ? digits : `55${digits}`;
}

function whatsappUrl(message = DEFAULT_WHATSAPP_MESSAGE) {
    const phone = normalizePhoneDigits(SITE_SETTINGS.whatsapp);
    return phone ? `https://wa.me/${phone}?text=${encodeURIComponent(message)}` : '#';
}

function productCardImageUrl(publicId) {
    return CLOUDINARY.url(publicId, { width: 600, height: 450, crop: 'fill' });
}

function productMainImageUrl(publicId) {
    return CLOUDINARY.url(publicId, { width: 1200, height: 900, crop: 'fit' });
}

function productThumbImageUrl(publicId) {
    return CLOUDINARY.url(publicId, { width: 180, height: 135, crop: 'fill' });
}

/* =============================================
   PRELOADER
   ============================================= */
window.addEventListener('load', () => {
    setTimeout(() => {
        const pre = document.getElementById('preloader');
        if (!pre) return;
        pre.classList.add('hide');
        pre.addEventListener('transitionend', () => pre.remove(), { once: true });
    }, 850);
});

/* =============================================
   NAVBAR
   ============================================= */
const navbar  = document.getElementById('navbar');
const toggle  = document.getElementById('navToggle');
const navList = document.getElementById('navLinks');
const navLinks = document.querySelectorAll('.nav-link');
const backTopBtn = document.getElementById('backTop');

window.addEventListener('scroll', () => {
    if (navbar) navbar.classList.toggle('scrolled', window.scrollY > 40);
    if (backTopBtn) backTopBtn.classList.toggle('visible', window.scrollY > 400);
}, { passive: true });

if (toggle && navList) toggle.addEventListener('click', () => {
    const open = navList.classList.toggle('mobile-open');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
    document.body.classList.toggle('no-scroll', open);
});

if (navList && toggle) navList.addEventListener('click', e => {
    if (e.target.classList.contains('nav-link')) {
        navList.classList.remove('mobile-open');
        toggle.classList.remove('open');
        toggle.setAttribute('aria-expanded', false);
        document.body.classList.remove('no-scroll');
    }
});

// Active nav link on scroll
const sections = document.querySelectorAll('section[id]');
const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            const id = e.target.id;
            navLinks.forEach(l => {
                const href = l.getAttribute('href') || '';
                if (href.startsWith('#')) l.classList.toggle('active', href === `#${id}`);
            });
        }
    });
}, { threshold: .35 });
sections.forEach(s => sectionObserver.observe(s));

const currentPage = window.location.pathname === '/' ? '/' : window.location.pathname;
navLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href && !href.startsWith('#')) {
        const path = new URL(href, window.location.origin).pathname;
        link.classList.toggle('active', path === currentPage);
    }
});

/* =============================================
   HERO CANVAS — PARTICLE NETWORK
   ============================================= */
(function initCanvas() {
    const canvas = document.getElementById('heroCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, particles = [], mouse = { x: -9999, y: -9999 };

    const COLORS = ['rgba(124,58,237,', 'rgba(14,165,233,', 'rgba(167,139,250,'];
    const COUNT  = () => Math.floor((W * H) / 14000);
    const MAX_DIST = 140;

    class Particle {
        constructor() { this.reset(true); }
        reset(init = false) {
            this.x  = Math.random() * W;
            this.y  = init ? Math.random() * H : -10;
            this.vx = (Math.random() - .5) * .6;
            this.vy = Math.random() * .4 + .15;
            this.r  = Math.random() * 2 + 1;
            this.c  = COLORS[Math.floor(Math.random() * COLORS.length)];
            this.a  = Math.random() * .6 + .2;
        }
        update() {
            const dx = this.x - mouse.x, dy = this.y - mouse.y;
            const d  = Math.sqrt(dx*dx + dy*dy);
            if (d < 100) {
                this.vx += dx / d * .06;
                this.vy += dy / d * .06;
            }
            this.vx *= .98;
            this.vy *= .98;
            this.x += this.vx;
            this.y += this.vy;
            if (this.y > H + 10 || this.x < -10 || this.x > W + 10) this.reset();
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            ctx.fillStyle = this.c + this.a + ')';
            ctx.fill();
        }
    }

    function resize() {
        W = canvas.width  = canvas.offsetWidth;
        H = canvas.height = canvas.offsetHeight;
        const need = COUNT();
        while (particles.length < need) particles.push(new Particle());
        while (particles.length > need) particles.pop();
    }

    function drawLines() {
        for (let i = 0; i < particles.length; i++) {
            for (let j = i + 1; j < particles.length; j++) {
                const dx = particles[i].x - particles[j].x;
                const dy = particles[i].y - particles[j].y;
                const d  = Math.sqrt(dx*dx + dy*dy);
                if (d < MAX_DIST) {
                    const alpha = (1 - d / MAX_DIST) * .18;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = `rgba(124,58,237,${alpha})`;
                    ctx.lineWidth   = .8;
                    ctx.stroke();
                }
            }
        }
    }

    let raf;
    function animate() {
        ctx.clearRect(0, 0, W, H);
        particles.forEach(p => { p.update(); p.draw(); });
        drawLines();
        raf = requestAnimationFrame(animate);
    }

    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('mousemove', e => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = e.clientX - rect.left;
        mouse.y = e.clientY - rect.top;
    }, { passive: true });

    resize();
    animate();
})();

/* =============================================
   TYPEWRITER EFFECT
   ============================================= */
(function typewriter() {
    const el = document.getElementById('typewriter');
    if (!el) return;
    const phrases = ['ideias em realidade', 'designs em objetos', 'criatividade em forma', 'sonhos em peças'];
    if (window.matchMedia('(max-width: 600px)').matches) {
        el.textContent = phrases[0];
        return;
    }
    let pi = 0, ci = 0, deleting = false;
    const speed = { type: 80, delete: 45, pause: 2200 };

    function tick() {
        const phrase = phrases[pi];
        if (!deleting) {
            el.textContent = phrase.slice(0, ++ci);
            if (ci === phrase.length) { deleting = true; setTimeout(tick, speed.pause); return; }
        } else {
            el.textContent = phrase.slice(0, --ci);
            if (ci === 0) { deleting = false; pi = (pi + 1) % phrases.length; }
        }
        setTimeout(tick, deleting ? speed.delete : speed.type);
    }
    tick();
})();

/* =============================================
   COUNTER ANIMATION
   ============================================= */
function animateCounters() {
    document.querySelectorAll('.hstat-n').forEach(el => {
        const target  = parseFloat(el.dataset.target);
        const decimal = parseInt(el.dataset.decimal || '0');
        const dur     = 1800;
        const step    = 16;
        const inc     = target / (dur / step);
        let cur       = 0;

        const t = setInterval(() => {
            cur = Math.min(cur + inc, target);
            el.textContent = cur.toFixed(decimal);
            if (cur >= target) clearInterval(t);
        }, step);
    });
}

const statsObserver = new IntersectionObserver(entries => {
    if (entries[0].isIntersecting) {
        animateCounters();
        statsObserver.disconnect();
    }
}, { threshold: .5 });
const statsEl = document.querySelector('.hero-stats');
if (statsEl) statsObserver.observe(statsEl);

/* =============================================
   SCROLL REVEAL
   ============================================= */
const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(e => {
        if (e.isIntersecting) {
            e.target.classList.add('revealed');
            revealObserver.unobserve(e.target);
        }
    });
}, { threshold: .12, rootMargin: '0px 0px -40px 0px' });

document.querySelectorAll('[data-reveal]').forEach(el => revealObserver.observe(el));

/* =============================================
   PRODUCTS — RENDER & FILTER
   ============================================= */
const grid      = document.getElementById('productsGrid');
const filterBtns = document.querySelectorAll('.filter-btn');
let activeFilter = 'all';

function pvClass(cat) {
    return {
        geek:           'pv-games',
        decoracao:      'pv-decor',
        organizacao:    'pv-functional',
        ferramentas:    'pv-functional',
        gadgets:        'pv-art',
        personalizados: 'pv-custom',
    }[cat] || 'pv-games';
}

function productImages(p) {
    return (Array.isArray(p.images) && p.images.length)
        ? p.images.filter(Boolean)
        : (p.image ? [p.image] : []);
}

function productPreview(p) {
    const images = productImages(p);
    const imgUrl = productCardImageUrl(images[0]);
    const photoCount = images.length > 1
        ? `<div class="product-photo-count">${images.length} fotos</div>`
        : '';
    if (imgUrl) {
        return `
            <div class="product-preview ${pvClass(p.category)} has-image">
                ${p.badge ? `<div class="product-badge">${p.badge}</div>` : ''}
                ${photoCount}
                <img src="${imgUrl}" alt="${p.name}" loading="lazy" onerror="this.parentElement.classList.remove('has-image');this.remove()">
            </div>`;
    }
    return `
        <div class="product-preview ${pvClass(p.category)}">
            ${p.badge ? `<div class="product-badge">${p.badge}</div>` : ''}
            <div class="product-preview-emoji">${p.emoji}</div>
        </div>`;
}

function renderProducts(filter = 'all') {
    if (!grid) return;
    const list = filter === 'all' ? PRODUCTS : PRODUCTS.filter(p => p.category === filter);

    grid.innerHTML = list.map(p => `
        <div class="product-card" data-id="${p.id}" tabindex="0" role="button" aria-label="Ver detalhes de ${p.name}">
            ${productPreview(p)}
            <div class="product-body">
                <div class="product-category">${CATEGORY_LABELS[p.category]}</div>
                <h3>${p.name}</h3>
                <p class="product-desc">${p.desc}</p>
                <div class="product-footer">
                    <div class="product-price">
                        ${moneyBRL(p.price)}
                        <small>+ frete • personalizável</small>
                    </div>
                    <div class="product-rating">
                        <span class="star">★</span>
                        <span>${p.rating}</span>
                        <span>(${p.reviews})</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');

    // Animate in
    grid.querySelectorAll('.product-card').forEach((card, i) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        setTimeout(() => {
            card.style.transition = 'opacity .4s ease, transform .4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, i * 60);
    });

    // Click → modal
    grid.querySelectorAll('.product-card').forEach(card => {
        card.addEventListener('click', () => openModal(parseInt(card.dataset.id)));
        card.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') openModal(parseInt(card.dataset.id)); });
    });
}

async function syncProductsFromApi() {
    if (!grid) return;

    try {
        const res = await fetch(PRODUCTS_URL, { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));

        if (!res.ok || !Array.isArray(data.products) || !data.products.length) return;

        PRODUCTS = normalizeProducts(data.products);
        cacheProducts(PRODUCTS);
        renderProducts(activeFilter);
    } catch {
        // Mantém o catálogo em cache/defaults caso a API esteja temporariamente indisponível.
    }
}

if (grid) filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        renderProducts(activeFilter);
    });
});

if (grid) {
    renderProducts();
    syncProductsFromApi();
}

/* =============================================
   CART — PRODUCT FLOW WITHOUT LEAVING THE MODAL
   ============================================= */
let cartItems = loadCartItems();

function loadCartItems() {
    try {
        const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch {
        return [];
    }
}

function saveCartItems() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cartItems));
    renderCartUI();
}

function cartQuantity() {
    return cartItems.reduce((total, item) => total + Number(item.qty || 1), 0);
}

function cartProductsTotal() {
    return cartItems.reduce((total, item) => {
        const price = Number(item.price || 0);
        return total + price * Number(item.qty || 1);
    }, 0);
}

function sameCartItem(a, b) {
    return String(a.productId) === String(b.productId)
        && String(a.color || '') === String(b.color || '')
        && String(a.cep || '') === String(b.cep || '')
        && String(a.shipping?.name || '') === String(b.shipping?.name || '');
}

function addToCart(item, { open = true } = {}) {
    const existing = cartItems.find(current => sameCartItem(current, item));
    if (existing) {
        existing.qty = Number(existing.qty || 1) + Number(item.qty || 1);
    } else {
        cartItems.push({
            ...item,
            key: `${item.productId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        });
    }
    saveCartItems();
    if (open) openCartDrawer();
}

function removeFromCart(key) {
    cartItems = cartItems.filter(item => item.key !== key);
    saveCartItems();
}

function updateCartQty(key, nextQty) {
    const item = cartItems.find(entry => entry.key === key);
    if (!item) return;
    item.qty = Math.max(1, Number(nextQty) || 1);
    saveCartItems();
}

function buildCartMessage() {
    const lines = [
        'Olá, vim pelo site e gostaria de solicitar um orçamento/pedido com estes itens:',
        '',
    ];

    cartItems.forEach((item, index) => {
        lines.push(`${index + 1}. ${item.name}`);
        lines.push(`Quantidade: ${item.qty || 1}`);
        if (item.color) lines.push(`Cor: ${item.color}`);
        if (item.price) lines.push(`Valor unitário: ${moneyBRL(item.price)}`);
        if (item.cep) lines.push(`CEP: ${item.cep}`);
        if (item.shipping?.name) {
            lines.push(`Frete selecionado: ${item.shipping.name} - ${item.shipping.price} (${item.shipping.deadline})`);
        }
        lines.push('');
    });

    const total = cartProductsTotal();
    if (total > 0) {
        lines.push(`Subtotal dos produtos: ${moneyBRL(total)}`);
        lines.push('Frete e personalizações podem alterar o valor final.');
    }

    return lines.join('\n').trim();
}

function checkoutCart() {
    if (!cartItems.length) {
        alert('Adicione pelo menos um produto ao carrinho.');
        return;
    }
    window.open(whatsappUrl(buildCartMessage()), '_blank', 'noopener');
}

function ensureCartUI() {
    if (document.getElementById('cartDrawer')) return;

    document.body.insertAdjacentHTML('beforeend', `
        <button class="cart-fab" id="cartFab" type="button" aria-label="Abrir carrinho">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l2.2 11.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 2-1.5L21 8H7"/></svg>
            <span id="cartCount">0</span>
        </button>
        <div class="cart-overlay" id="cartOverlay" aria-hidden="true"></div>
        <aside class="cart-drawer" id="cartDrawer" aria-label="Carrinho">
            <div class="cart-head">
                <div>
                    <span>Carrinho</span>
                    <strong>Pedido pelo WhatsApp</strong>
                </div>
                <button type="button" id="cartClose" aria-label="Fechar carrinho">×</button>
            </div>
            <div class="cart-list" id="cartList"></div>
            <div class="cart-foot">
                <div class="cart-total">
                    <span>Subtotal</span>
                    <strong id="cartTotal">Consultar</strong>
                </div>
                <button class="btn btn-primary" type="button" id="cartCheckout">Enviar pedido pelo WhatsApp</button>
                <button class="btn btn-outline" type="button" id="cartContinue">Continuar escolhendo</button>
            </div>
        </aside>
    `);

    document.getElementById('cartFab')?.addEventListener('click', openCartDrawer);
    document.getElementById('cartOverlay')?.addEventListener('click', closeCartDrawer);
    document.getElementById('cartClose')?.addEventListener('click', closeCartDrawer);
    document.getElementById('cartContinue')?.addEventListener('click', closeCartDrawer);
    document.getElementById('cartCheckout')?.addEventListener('click', checkoutCart);
    renderCartUI();
}

function openCartDrawer() {
    ensureCartUI();
    document.getElementById('cartOverlay')?.classList.add('open');
    document.getElementById('cartDrawer')?.classList.add('open');
}

function closeCartDrawer() {
    document.getElementById('cartOverlay')?.classList.remove('open');
    document.getElementById('cartDrawer')?.classList.remove('open');
}

function renderCartUI() {
    const count = document.getElementById('cartCount');
    if (count) count.textContent = cartQuantity();

    const list = document.getElementById('cartList');
    const totalEl = document.getElementById('cartTotal');
    if (!list || !totalEl) return;

    totalEl.textContent = cartProductsTotal() > 0 ? moneyBRL(cartProductsTotal()) : 'Consultar';

    if (!cartItems.length) {
        list.innerHTML = `
            <div class="cart-empty">
                <strong>Nenhum produto selecionado</strong>
                <p>Escolha um produto, selecione a cor e adicione ao carrinho.</p>
            </div>`;
        return;
    }

    list.innerHTML = cartItems.map(item => {
        const img = item.image ? productThumbImageUrl(item.image) : '';
        return `
            <div class="cart-item" data-key="${escapeHTML(item.key)}">
                <div class="cart-item-img">
                    ${img ? `<img src="${img}" alt="${escapeHTML(item.name)}">` : `<span>${escapeHTML(item.emoji || '📦')}</span>`}
                </div>
                <div class="cart-item-body">
                    <strong>${escapeHTML(item.name)}</strong>
                    <p>${item.color ? `Cor: ${escapeHTML(item.color)}` : 'Cor a combinar'}</p>
                    ${item.shipping?.name ? `<p>Frete: ${escapeHTML(item.shipping.name)} • ${escapeHTML(item.shipping.price)}</p>` : ''}
                    <div class="cart-item-actions">
                        <button type="button" class="cart-qty" data-cart-dec>-</button>
                        <span>${item.qty || 1}</span>
                        <button type="button" class="cart-qty" data-cart-inc>+</button>
                        <button type="button" class="cart-remove" data-cart-remove>Remover</button>
                    </div>
                </div>
                <div class="cart-item-price">${item.price ? moneyBRL(Number(item.price) * Number(item.qty || 1)) : 'Consultar'}</div>
            </div>`;
    }).join('');

    list.querySelectorAll('.cart-item').forEach(row => {
        const key = row.dataset.key;
        const item = cartItems.find(entry => entry.key === key);
        row.querySelector('[data-cart-dec]')?.addEventListener('click', () => updateCartQty(key, Number(item?.qty || 1) - 1));
        row.querySelector('[data-cart-inc]')?.addEventListener('click', () => updateCartQty(key, Number(item?.qty || 1) + 1));
        row.querySelector('[data-cart-remove]')?.addEventListener('click', () => removeFromCart(key));
    });
}

ensureCartUI();

/* =============================================
   PRODUCT MODAL
   ============================================= */
const modal     = document.getElementById('productModal');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');

function productSpecsHTML(p) {
    const dims = p.dimensions || {};
    const hasDims = dims.length || dims.width || dims.height;
    const specs = [
        p.material ? ['Material', p.material] : null,
        hasDims ? ['Dimensões', `${dims.length || '-'} x ${dims.width || '-'} x ${dims.height || '-'} cm`] : null,
        p.weight ? ['Peso', `${p.weight} g`] : null,
    ].filter(Boolean);

    if (!specs.length) return '';
    return `
        <div class="modal-specs">
            <p class="modal-section-title">Ficha técnica</p>
            <div class="modal-specs-grid">
                ${specs.map(([label, value]) => `
                    <div class="modal-spec">
                        <span>${escapeHTML(label)}</span>
                        <strong>${escapeHTML(value)}</strong>
                    </div>
                `).join('')}
            </div>
        </div>`;
}

function shippingBoxHTML(p) {
    const dims = p.dimensions || {};
    const canQuote = Boolean(p.weight && dims.length && dims.width && dims.height);
    return `
        <div class="modal-shipping" data-product-id="${p.id}">
            <p class="modal-section-title">Calcular frete</p>
            <div class="shipping-row">
                <input type="text" id="shippingCep" inputmode="numeric" maxlength="9" placeholder="Digite seu CEP">
                <button class="btn btn-outline" id="shippingBtn" ${canQuote ? '' : 'disabled'}>Calcular</button>
            </div>
            <div class="shipping-result" id="shippingResult">
                ${canQuote ? 'Informe o CEP para consultar as opções de envio.' : 'Frete disponível depois que peso e dimensões forem cadastrados.'}
            </div>
        </div>`;
}

function shippingPayload(p, cep) {
    const dims = p.dimensions || {};
    return {
        cep: cep.replace(/\D/g, ''),
        product: {
            id: p.id,
            name: p.name,
            weight: Number(p.weight || 0),
            width: Number(dims.width || 0),
            height: Number(dims.height || 0),
            length: Number(dims.length || 0),
            price: Number(p.price || 0),
        },
    };
}

function setupShippingCalculator(p, onSelect = () => {}) {
    const cepInput = document.getElementById('shippingCep');
    const btn = document.getElementById('shippingBtn');
    const result = document.getElementById('shippingResult');
    if (!cepInput || !btn || !result) return;

    cepInput.addEventListener('input', () => {
        const digits = cepInput.value.replace(/\D/g, '').slice(0, 8);
        cepInput.value = digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
    });

    btn.addEventListener('click', async () => {
        const cep = cepInput.value.replace(/\D/g, '');
        if (cep.length !== 8) {
            result.textContent = 'Digite um CEP válido com 8 números.';
            result.className = 'shipping-result error';
            onSelect(null);
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Calculando...';
        result.textContent = 'Consultando opções de envio...';
        result.className = 'shipping-result';

        try {
            const res = await fetch(SHIPPING_QUOTE_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(shippingPayload(p, cep)),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok || !data.options?.length) {
                result.textContent = 'Frete será confirmado no atendimento.';
                result.className = 'shipping-result error';
                onSelect(null);
                return;
            }

            const options = data.options.map(opt => ({
                name: opt.name || 'Envio',
                price: opt.price || 'A confirmar',
                deadline: opt.deadline || 'Prazo a confirmar',
                cep: cepInput.value,
            }));

            result.className = 'shipping-result ok';
            result.innerHTML = options.map((opt, index) => `
                <button type="button" class="shipping-option${index === 0 ? ' active' : ''}" data-shipping-index="${index}">
                    <span>${escapeHTML(opt.name)}</span>
                    <strong>${escapeHTML(opt.price)}</strong>
                    <small>${escapeHTML(opt.deadline)}</small>
                </button>
            `).join('');

            const selectShipping = index => {
                const option = options[index];
                if (!option) return;
                result.querySelectorAll('.shipping-option').forEach(el => {
                    el.classList.toggle('active', Number(el.dataset.shippingIndex) === index);
                });
                onSelect(option);
            };

            result.querySelectorAll('.shipping-option').forEach(el => {
                el.addEventListener('click', () => selectShipping(Number(el.dataset.shippingIndex || 0)));
            });
            selectShipping(0);
        } catch {
            result.textContent = 'Frete será confirmado no atendimento.';
            result.className = 'shipping-result error';
            onSelect(null);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Calcular';
        }
    });
}

function openModal(id) {
    if (!modal || !modalBody) return;
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;

    const allImages = productImages(p)
        .filter(Boolean)
        .filter((img, index, arr) => arr.indexOf(img) === index);
    let activeImageIndex = 0;
    let selectedColor = (p.colors || [])[0] || '';
    let selectedShipping = null;
    let selectedQty = 1;
    const modalPreview = allImages.length
        ? `<div class="modal-gallery" data-gallery-count="${allImages.length}">
            <div class="modal-gallery-main">
                <img id="mgMain" src="${productMainImageUrl(allImages[0])}" alt="${escapeHTML(p.name)}">
                ${allImages.length > 1 ? `
                    <button class="mg-nav mg-prev" type="button" aria-label="Foto anterior">‹</button>
                    <button class="mg-nav mg-next" type="button" aria-label="Próxima foto">›</button>
                    <span class="mg-counter" id="mgCounter">1 / ${allImages.length}</span>
                ` : ''}
            </div>
            ${allImages.length > 1 ? `<div class="modal-gallery-thumbs">
                ${allImages.map((img, i) => `<img src="${productThumbImageUrl(img)}" class="mg-thumb${i===0?' active':''}" data-i="${i}" alt="${escapeHTML(p.name)} ${i+1}">`).join('')}
            </div>` : ''}
           </div>`
        : `<div class="modal-preview ${pvClass(p.category)}">${escapeHTML(p.emoji || '📦')}</div>`;

    modalBody.innerHTML = `
        <div class="modal-product-layout">
            <div class="modal-media">
                ${modalPreview}
            </div>
            <div class="modal-info">
                <div class="modal-category">${escapeHTML(CATEGORY_LABELS[p.category] || p.category || 'Produto')}</div>
                <h3>${escapeHTML(p.name)}</h3>
                <p class="modal-desc">${escapeHTML(p.desc)}</p>
                <div class="modal-price">
                    ${moneyBRL(p.price)}
                    <small>Frete calculado no pedido • personalização disponível</small>
                </div>
                <div class="modal-colors">
                    <p class="modal-colors-lbl">Cores disponíveis</p>
                    <div class="modal-colors-list">
                        ${(p.colors || []).length
                            ? (p.colors || []).map((c, i) => `<button type="button" class="mcolor${i === 0 ? ' active' : ''}" data-color="${escapeHTML(c)}">${escapeHTML(c)}</button>`).join('')
                            : '<span class="modal-muted">Cor a combinar</span>'}
                    </div>
                </div>
                ${productSpecsHTML(p)}
                ${shippingBoxHTML(p)}
                <div class="modal-purchase">
                    <div>
                        <p class="modal-section-title">Pedido</p>
                        <p class="modal-selected" id="modalSelectedSummary"></p>
                    </div>
                    <div class="qty-control" aria-label="Quantidade">
                        <button type="button" id="qtyMinus" aria-label="Diminuir quantidade">-</button>
                        <span id="qtyValue">1</span>
                        <button type="button" id="qtyPlus" aria-label="Aumentar quantidade">+</button>
                    </div>
                </div>
                <div class="modal-btns">
                    <button type="button" class="btn btn-primary" id="modalAddCart">Adicionar ao carrinho</button>
                    <button type="button" class="btn btn-outline" id="modalBuyNow">Finalizar pedido</button>
                </div>
            </div>
        </div>
    `;

    modal.classList.add('open');
    document.body.classList.add('no-scroll');

    const updateSelectedSummary = () => {
        const summary = document.getElementById('modalSelectedSummary');
        if (!summary) return;
        const parts = [
            selectedColor ? `Cor: ${selectedColor}` : 'Cor: a combinar',
            `Qtd: ${selectedQty}`,
            selectedShipping ? `Frete: ${selectedShipping.name} (${selectedShipping.price})` : 'Frete: a calcular',
        ];
        summary.textContent = parts.join(' • ');
    };

    document.querySelectorAll('.mcolor').forEach(btn => {
        btn.addEventListener('click', () => {
            selectedColor = btn.dataset.color || '';
            document.querySelectorAll('.mcolor').forEach(el => el.classList.toggle('active', el === btn));
            updateSelectedSummary();
        });
    });

    const qtyValue = document.getElementById('qtyValue');
    const setQty = next => {
        selectedQty = Math.max(1, Math.min(99, Number(next) || 1));
        if (qtyValue) qtyValue.textContent = selectedQty;
        updateSelectedSummary();
    };

    document.getElementById('qtyMinus')?.addEventListener('click', () => setQty(selectedQty - 1));
    document.getElementById('qtyPlus')?.addEventListener('click', () => setQty(selectedQty + 1));

    const cartPayload = () => ({
        productId: p.id,
        name: p.name,
        category: p.category,
        price: Number(p.price || 0) || null,
        image: allImages[0] || p.image || null,
        emoji: p.emoji || '📦',
        color: selectedColor || null,
        qty: selectedQty,
        cep: selectedShipping?.cep || null,
        shipping: selectedShipping,
    });

    document.getElementById('modalAddCart')?.addEventListener('click', () => {
        addToCart(cartPayload());
    });
    document.getElementById('modalBuyNow')?.addEventListener('click', () => {
        addToCart(cartPayload(), { open: false });
        openCartDrawer();
    });

    setupShippingCalculator(p, option => {
        selectedShipping = option;
        updateSelectedSummary();
    });
    updateSelectedSummary();

    const mainImg = document.getElementById('mgMain');
    const counter = document.getElementById('mgCounter');
    const setGalleryImage = index => {
        if (!mainImg || !allImages.length) return;
        activeImageIndex = (index + allImages.length) % allImages.length;
        mainImg.src = productMainImageUrl(allImages[activeImageIndex]);
        document.querySelectorAll('.mg-thumb').forEach(t => {
            t.classList.toggle('active', Number(t.dataset.i) === activeImageIndex);
        });
        if (counter) counter.textContent = `${activeImageIndex + 1} / ${allImages.length}`;
    };

    document.querySelectorAll('.mg-thumb').forEach(thumb => {
        thumb.addEventListener('click', () => {
            setGalleryImage(Number(thumb.dataset.i || 0));
        });
    });
    document.querySelector('.mg-prev')?.addEventListener('click', () => setGalleryImage(activeImageIndex - 1));
    document.querySelector('.mg-next')?.addEventListener('click', () => setGalleryImage(activeImageIndex + 1));
}

function closeModal() {
    if (!modal) return;
    modal.classList.remove('open');
    document.body.classList.remove('no-scroll');
}

if (modalClose) modalClose.addEventListener('click', closeModal);
if (modal) modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

/* =============================================
   TESTIMONIALS CAROUSEL
   ============================================= */
(function initTestimonials() {
    const track  = document.getElementById('testiTrack');
    const dotsEl = document.getElementById('testiDots');
    const prev   = document.getElementById('testiPrev');
    const next   = document.getElementById('testiNext');
    if (!track || !dotsEl || !prev || !next) return;

    track.innerHTML = TESTIMONIALS.map(t => `
        <div class="testi-card">
            <div class="testi-stars">${'★'.repeat(t.rating)}${'☆'.repeat(5-t.rating)}</div>
            <p class="testi-text">${t.text}</p>
            <div class="testi-author">
                <div class="testi-avatar">${t.avatar}</div>
                <div>
                    <p class="testi-name">${t.name}</p>
                    <p class="testi-city">${t.city}</p>
                </div>
            </div>
        </div>
    `).join('');

    const cards = track.querySelectorAll('.testi-card');
    let   idx   = 0;
    let   perPage = window.innerWidth < 600 ? 1 : window.innerWidth < 900 ? 2 : 3;

    function buildDots() {
        const pages = Math.ceil(cards.length / perPage);
        dotsEl.innerHTML = Array.from({ length: pages }, (_, i) =>
            `<button class="testi-dot${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="Depoimento ${i+1}"></button>`
        ).join('');
        dotsEl.querySelectorAll('.testi-dot').forEach(d =>
            d.addEventListener('click', () => goTo(parseInt(d.dataset.i)))
        );
    }

    function goTo(page) {
        const pages = Math.ceil(cards.length / perPage);
        if (!cards.length || !pages) return;
        idx = Math.max(0, Math.min(page, pages - 1));
        const gapPx = 24;
        const cardW = cards[0].offsetWidth;
        track.style.transform = `translateX(-${idx * (cardW + gapPx) * perPage}px)`;
        dotsEl.querySelectorAll('.testi-dot').forEach((d, i) => d.classList.toggle('active', i === idx));
    }

    prev.addEventListener('click', () => goTo(idx - 1));
    next.addEventListener('click', () => goTo(idx + 1));

    window.addEventListener('resize', () => {
        const newPer = window.innerWidth < 600 ? 1 : window.innerWidth < 900 ? 2 : 3;
        if (newPer !== perPage) { perPage = newPer; idx = 0; buildDots(); goTo(0); }
    }, { passive: true });

    buildDots();

    // Auto-play
    let timer = setInterval(() => goTo(idx + 1 >= Math.ceil(cards.length / perPage) ? 0 : idx + 1), 5000);
    const wrap = track.closest('.testimonials-wrap');
    if (wrap) {
        wrap.addEventListener('mouseenter', () => clearInterval(timer));
        wrap.addEventListener('mouseleave', () => {
            timer = setInterval(() => goTo(idx + 1 >= Math.ceil(cards.length / perPage) ? 0 : idx + 1), 5000);
        });
    }
})();

/* =============================================
   ORDER FORM — MULTI-STEP
   ============================================= */
(function initForm() {
    const form     = document.getElementById('orderForm');
    const success  = document.getElementById('formSuccess');
    const resetBtn = document.getElementById('formReset');
    if (!form) return;

    let currentStep = 1;

    function setStep(step) {
        document.querySelectorAll('.form-page').forEach(p => p.classList.remove('active'));
        const activePage = document.getElementById(`formPage${step}`);
        if (!activePage) return;
        activePage.classList.add('active');

        document.querySelectorAll('.fstep').forEach((el, i) => {
            el.classList.remove('active', 'done');
            if (i + 1 === step) el.classList.add('active');
            else if (i + 1 < step) el.classList.add('done');
        });
        currentStep = step;
    }

    function validateStep(step) {
        const page    = document.getElementById(`formPage${step}`);
        if (!page) return false;
        const inputs  = page.querySelectorAll('[required]');
        let   valid   = true;

        inputs.forEach(inp => {
            const errEl = inp.parentElement.querySelector('.form-err');
            inp.classList.remove('error');
            if (errEl) errEl.textContent = '';

            if (!inp.value.trim()) {
                inp.classList.add('error');
                if (errEl) errEl.textContent = 'Campo obrigatório';
                valid = false;
            } else if (inp.type === 'email' && !/\S+@\S+\.\S+/.test(inp.value)) {
                inp.classList.add('error');
                if (errEl) errEl.textContent = 'E-mail inválido';
                valid = false;
            } else if (inp.type === 'tel' && inp.value.replace(/\D/g,'').length < 10) {
                inp.classList.add('error');
                if (errEl) errEl.textContent = 'Telefone inválido';
                valid = false;
            }
        });

        return valid;
    }

    document.getElementById('step1Next')?.addEventListener('click', () => {
        if (validateStep(1)) setStep(2);
    });
    document.getElementById('step2Back')?.addEventListener('click', () => setStep(1));
    document.getElementById('step2Next')?.addEventListener('click', () => {
        if (validateStep(2)) setStep(3);
    });
    document.getElementById('step3Back')?.addEventListener('click', () => setStep(2));

    form.addEventListener('submit', e => {
        e.preventDefault();
        if (!validateStep(3)) return;

        // Simulate submission
        const btn = form.querySelector('[type="submit"]');
        btn.disabled = true;
        btn.textContent = 'Enviando…';

        setTimeout(() => {
            document.querySelectorAll('.form-page').forEach(p => p.classList.remove('active'));
            const stepsBar = document.querySelector('.form-steps-bar');
            if (stepsBar) stepsBar.style.display = 'none';
            if (success) success.classList.add('show');
        }, 1200);
    });

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            form.reset();
            if (success) success.classList.remove('show');
            const stepsBar = document.querySelector('.form-steps-bar');
            if (stepsBar) stepsBar.style.display = '';
            setStep(1);
        });
    }
})();

/* =============================================
   PHONE MASK
   ============================================= */
const phoneInput = document.getElementById('fphone');
if (phoneInput) {
    phoneInput.addEventListener('input', function () {
        let v = this.value.replace(/\D/g, '').slice(0, 11);
        if (v.length > 10) v = v.replace(/^(\d{2})(\d{5})(\d{4})$/, '($1) $2-$3');
        else if (v.length > 6) v = v.replace(/^(\d{2})(\d{4})(\d{0,4})$/, '($1) $2-$3');
        else if (v.length > 2) v = v.replace(/^(\d{2})(\d{0,5})$/, '($1) $2');
        else if (v.length > 0) v = v.replace(/^(\d{0,2})$/, '($1');
        this.value = v;
    });
}

/* =============================================
   BACK TO TOP
   ============================================= */
if (backTopBtn) backTopBtn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

const mobileRefreshBtn = document.getElementById('mobileRefresh');
if (mobileRefreshBtn) {
    mobileRefreshBtn.addEventListener('click', () => {
        if (typeof window.ForgeconRefreshApp === 'function') {
            window.ForgeconRefreshApp();
        } else {
            window.location.reload();
        }
    });
}

/* =============================================
   SMOOTH SCROLL
   ============================================= */
document.querySelectorAll('a[href^="#"]').forEach(a => {
    a.addEventListener('click', e => {
        const id = a.getAttribute('href').slice(1);
        const el = document.getElementById(id);
        if (!el) return;
        e.preventDefault();
        const offset = el.getBoundingClientRect().top + window.scrollY - 72;
        window.scrollTo({ top: offset, behavior: 'smooth' });
    });
});

/* =============================================
   FOOTER — CURRENT YEAR
   ============================================= */
const yearEl = document.getElementById('currentYear');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* =============================================
   PWA FRESHNESS — KEEP APP UPDATED
   ============================================= */
(function initPwaFreshness() {
    const clearAppCache = async () => {
        if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map(key => caches.delete(key)));
        }
        if (navigator.serviceWorker?.controller) {
            navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_APP_CACHE' });
        }
    };

    window.ForgeconRefreshApp = async function() {
        try {
            await clearAppCache();
        } finally {
            window.location.reload();
        }
    };

    if ('serviceWorker' in navigator) {
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });

        const updateServiceWorker = async () => {
            try {
                await clearAppCache();
                const registrations = await navigator.serviceWorker.getRegistrations();
                await Promise.all(registrations.map(registration => registration.update()));
            } catch (error) {
                console.warn('Não foi possível verificar atualização do app:', error);
            }
        };

        window.addEventListener('pageshow', updateServiceWorker);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') updateServiceWorker();
        });
    }
})();

/* =============================================
   CATEGORY CARDS — FILTER PRODUCTS
   ============================================= */
document.querySelectorAll('.cat-card[data-category]').forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
        const cat = card.dataset.category;
        const productsSection = document.getElementById('products');
        if (productsSection) {
            const offset = productsSection.getBoundingClientRect().top + window.scrollY - 72;
            window.scrollTo({ top: offset, behavior: 'smooth' });
        }
        setTimeout(() => {
            filterBtns.forEach(b => b.classList.remove('active'));
            const target = document.querySelector(`.filter-btn[data-filter="${cat}"]`);
            if (target) target.classList.add('active');
            renderProducts(cat);
        }, 600);
    });
});

/* =============================================
   GALLERY ITEMS — PARALLAX ON HOVER
   ============================================= */
document.querySelectorAll('.gi').forEach(item => {
    item.addEventListener('mousemove', e => {
        const r  = item.getBoundingClientRect();
        const x  = ((e.clientX - r.left) / r.width  - .5) * 10;
        const y  = ((e.clientY - r.top)  / r.height - .5) * 10;
        item.style.transform = `scale(1.02) rotateY(${x}deg) rotateX(${-y}deg)`;
        item.style.transition = 'transform .1s ease';
    });
    item.addEventListener('mouseleave', () => {
        item.style.transform = '';
        item.style.transition = 'transform .4s ease';
    });
});

/* =============================================
   CONFIG HELPERS (para atualizar links facilmente)
   ============================================= */
window.configurarSite = function(config = {}) {
    const {
        instagram, shopee, mercadolivre,
        whatsapp, email, nome
    } = config;
    SITE_SETTINGS = {
        ...SITE_SETTINGS,
        ...Object.fromEntries(
            Object.entries({ instagram, shopee, mercadolivre, whatsapp, email })
                .filter(([, value]) => value !== undefined && value !== null)
        ),
    };
    const whatsappMessage = DEFAULT_WHATSAPP_MESSAGE;

    const clean = value => typeof value === 'string' ? value.trim() : '';
    const normalizeInstagram = value => {
        const raw = clean(value);
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        const username = raw
            .replace(/^@/, '')
            .replace(/^instagram\.com\//i, '')
            .replace(/^www\.instagram\.com\//i, '')
            .replace(/\/$/, '');
        return username ? `https://www.instagram.com/${username}/` : '';
    };
    const instagramLabel = value => {
        const raw = clean(value);
        if (!raw) return '';
        const fromUrl = raw.replace(/\/$/, '').split('/').pop();
        return '@' + fromUrl.replace(/^@/, '');
    };
    const normalizeWhatsapp = value => {
        const raw = clean(value);
        const digits = raw.replace(/\D/g, '');
        if (!digits) return '';
        return `https://wa.me/${digits.startsWith('55') ? digits : `55${digits}`}?text=${encodeURIComponent(whatsappMessage)}`;
    };
    const normalizeExternalUrl = value => {
        const raw = clean(value);
        if (!raw) return '';
        if (/^https?:\/\//i.test(raw)) return raw;
        if (/^\/\//.test(raw)) return `https:${raw}`;
        return `https://${raw}`;
    };

    const update = (id, href) => {
        const el = document.getElementById(id);
        if (el && href) el.href = href;
    };

    if (instagram) {
        const instagramUrl = normalizeInstagram(instagram);
        update('nav-instagram',    instagramUrl);
        update('footer-instagram', instagramUrl);
        update('cta-instagram',    instagramUrl);
        const c = document.getElementById('contact-instagram');
        if (c) {
            c.textContent = instagramLabel(instagram);
            c.href = instagramUrl;
        }
    }
    if (shopee) {
        const shopeeUrl = normalizeExternalUrl(shopee);
        update('nav-shopee',    shopeeUrl);
        update('footer-shopee', shopeeUrl);
        update('ml-shopee',     shopeeUrl);
    }
    if (mercadolivre) {
        const mercadoLivreUrl = normalizeExternalUrl(mercadolivre);
        update('footer-ml',       mercadoLivreUrl);
        update('ml-mercadolivre', mercadoLivreUrl);
    }
    if (whatsapp) {
        const whatsappUrl = normalizeWhatsapp(whatsapp);
        update('footer-whatsapp', whatsappUrl);
        const el = document.getElementById('contact-whatsapp');
        if (el) {
            el.textContent = whatsapp;
            if (whatsappUrl) el.href = whatsappUrl;
        }
    }
    if (email) {
        const el = document.getElementById('contact-email');
        if (el) {
            el.textContent = email;
            el.href = `mailto:${email}`;
        }
    }
    if (nome) {
        document.querySelectorAll('.logo-main').forEach(el => {
            el.innerHTML = nome + (el.querySelector('.logo-accent') ? '' : '');
        });
        document.title = nome + ' — Impressão 3D Profissional';
    }
    console.log('✅ Site configurado!', config);
};

async function carregarConfiguracoesDoSite() {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
        const res = await fetch(SITE_SETTINGS_URL, {
            cache: 'no-store',
            signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        if (data.settings) configurarSite(data.settings);
    } catch (error) {
        console.warn('Configurações remotas indisponíveis:', error);
    } finally {
        clearTimeout(timeoutId);
    }
}

carregarConfiguracoesDoSite();

// Exemplo de uso (descomentar e preencher quando tiver os dados):
// configurarSite({
//   instagram: 'https://instagram.com/seuinstagram',
//   shopee: 'https://shopee.com.br/sualoja',
//   mercadolivre: 'https://mercadolivre.com/sualoja',
//   whatsapp: '(11) 99999-9999',
//   email: 'contato@suaempresa.com',
//   nome: 'NOME DA EMPRESA'
// });
