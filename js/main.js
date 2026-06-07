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

// Admin panel saves products to localStorage; use those if available, fallback to defaults
function loadProducts() {
    try {
        const raw = localStorage.getItem('print3d_products');
        const saved = raw ? JSON.parse(raw) : null;
        return (saved && saved.length) ? saved : DEFAULT_PRODUCTS;
    } catch {
        return DEFAULT_PRODUCTS;
    }
}
const PRODUCTS = loadProducts();

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

const TESTIMONIALS = [
    { name:'Marcel Conde',     city:'Recife, PE',           rating:5, avatar:'MC', text:'Vamo fazer essa porra funcionar mano' },
];

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

function productPreview(p) {
    const imgUrl = CLOUDINARY.url(p.image, { width: 600, height: 450 });
    if (imgUrl) {
        return `
            <div class="product-preview ${pvClass(p.category)} has-image">
                ${p.badge ? `<div class="product-badge">${p.badge}</div>` : ''}
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
                        ${p.price ? `R$ ${p.price.toFixed(2).replace('.',',')}` : 'Consultar preço'}
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

if (grid) filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter;
        renderProducts(activeFilter);
    });
});

if (grid) renderProducts();

/* =============================================
   PRODUCT MODAL
   ============================================= */
const modal     = document.getElementById('productModal');
const modalBody = document.getElementById('modalBody');
const modalClose = document.getElementById('modalClose');

function openModal(id) {
    if (!modal || !modalBody) return;
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return;

    const allImages = (p.images && p.images.length) ? p.images : (p.image ? [p.image] : []);
    const modalPreview = allImages.length
        ? `<div class="modal-gallery">
            <div class="modal-gallery-main">
                <img id="mgMain" src="${CLOUDINARY.url(allImages[0], {width:800,height:500})}" alt="${p.name}">
            </div>
            ${allImages.length > 1 ? `<div class="modal-gallery-thumbs">
                ${allImages.map((img, i) => `<img src="${CLOUDINARY.url(img, {width:120,height:90})}" class="mg-thumb${i===0?' active':''}" data-full="${CLOUDINARY.url(img, {width:800,height:500})}" alt="${p.name} ${i+1}">`).join('')}
            </div>` : ''}
           </div>`
        : `<div class="modal-preview ${pvClass(p.category)}">${p.emoji || '📦'}</div>`;

    modalBody.innerHTML = `
        ${modalPreview}
        <div class="modal-info">
            <div class="modal-category">${CATEGORY_LABELS[p.category]}</div>
            <h3>${p.name}</h3>
            <p class="modal-desc">${p.desc}</p>
            <div class="modal-price">
                ${p.price ? `R$ ${p.price.toFixed(2).replace('.',',')}` : 'Consultar preço'}
                <small>Frete calculado no pedido • personalização disponível</small>
            </div>
            <div class="modal-colors">
                <p class="modal-colors-lbl">Cores disponíveis</p>
                <div class="modal-colors-list">
                    ${(p.colors || []).map(c => `<span class="mcolor">${c}</span>`).join('')}
                </div>
            </div>
            <div class="modal-btns">
                <a href="/orcamento/" class="btn btn-primary" id="modalOrder">Fazer Pedido</a>
                <button class="btn btn-outline" id="modalCloseBtn">Fechar</button>
            </div>
        </div>
    `;

    modal.classList.add('open');
    document.body.classList.add('no-scroll');

    document.getElementById('modalOrder').addEventListener('click', closeModal);
    document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
    document.querySelectorAll('.mg-thumb').forEach(thumb => {
        thumb.addEventListener('click', () => {
            document.getElementById('mgMain').src = thumb.dataset.full;
            document.querySelectorAll('.mg-thumb').forEach(t => t.classList.remove('active'));
            thumb.classList.add('active');
        });
    });
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
    const whatsappMessage = 'Olá, vim pelo site e gostaria de solicitar um orçamento';

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
        update('nav-shopee',    shopee);
        update('footer-shopee', shopee);
        update('ml-shopee',     shopee);
    }
    if (mercadolivre) {
        update('footer-ml',       mercadolivre);
        update('ml-mercadolivre', mercadolivre);
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
