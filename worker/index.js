import { handleCommercial, deliverPending } from './commercial.js';

const ALLOWED_ORIGIN = 'https://forgecon.com.br';

function cors(origin) {
  const allowed = origin === ALLOWED_ORIGIN || origin === 'http://localhost:3000';
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data, status = 200, origin = '') {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors(origin) },
  });
}

function err(msg, status = 400, origin = '') {
  return json({ error: msg }, status, origin);
}

// ── Crypto helpers ────────────────────────────────────────────────────────────

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const salt = saltHex
    ? hexToBytes(saltHex)
    : crypto.getRandomValues(new Uint8Array(16));

  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 10_000, hash: 'SHA-256' },
    key, 256
  );
  return {
    salt: bytesToHex(salt),
    hash: bytesToHex(new Uint8Array(bits)),
  };
}

async function verifyPassword(password, saltHex, storedHash) {
  const { hash } = await hashPassword(password, saltHex);
  return hash === storedHash;
}

function bytesToHex(buf) {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return arr;
}

function randomToken(bytes = 32) {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(bytes)));
}

// ── Session helpers ───────────────────────────────────────────────────────────

async function createSession(db, userId) {
  const token = randomToken();
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  await db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(token, userId, expiresAt).run();
  return token;
}

async function getSessionUser(db, token) {
  if (!token) return null;
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare(
    `SELECT u.id, u.email, u.name, u.role
     FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token = ? AND s.expires_at > ?`
  ).bind(token, now).first();
  return row || null;
}

function tokenFromRequest(request) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

// ── Audit helpers ─────────────────────────────────────────────────────────────

async function auditLogSafe(db, request, user, action, entity, entityId = null, details = {}) {
  try {
    await db.prepare(
      `INSERT INTO audit_logs (user_id, user_email, user_name, action, entity, entity_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      user?.id || null,
      user?.email || null,
      user?.name || null,
      action,
      entity,
      entityId === undefined ? null : entityId,
      JSON.stringify(details || {}),
      request.headers.get('CF-Connecting-IP') || '',
      request.headers.get('User-Agent') || ''
    ).run();
  } catch (e) {
    console.error('Audit log failed:', e.message);
  }
}

// ── Email via Resend ──────────────────────────────────────────────────────────

async function sendResetEmail(resendKey, toEmail, resetLink) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Forgecon <noreply@forgecon.com.br>',
      to: [toEmail],
      subject: 'Redefinição de senha — Forgecon Admin',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#7c3aed">Forgecon Admin</h2>
          <p>Recebemos uma solicitação para redefinir sua senha.</p>
          <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>10 minutos</strong>.</p>
          <a href="${resetLink}"
             style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
            Redefinir senha
          </a>
          <p style="color:#666;font-size:13px">Se você não solicitou isso, ignore este email.</p>
        </div>`,
    }),
  });
  return res.ok;
}

async function sendInviteEmail(resendKey, toEmail, inviteLink, inviterName) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Forgecon <noreply@forgecon.com.br>',
      to: [toEmail],
      subject: 'Convite para o Admin — Forgecon',
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
          <h2 style="color:#7c3aed">Forgecon Admin</h2>
          <p><strong>${inviterName}</strong> te convidou para acessar o painel administrativo da Forgecon.</p>
          <p>Clique no botão abaixo para criar sua senha e ativar seu acesso. O link expira em <strong>48 horas</strong>.</p>
          <a href="${inviteLink}"
             style="display:inline-block;background:#7c3aed;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;margin:16px 0">
            Aceitar convite
          </a>
          <p style="color:#666;font-size:13px">Se você não esperava este convite, pode ignorar este email.</p>
        </div>`,
    }),
  });
  return res.ok;
}

// ── Cloudinary listing ────────────────────────────────────────────────────────

async function listCloudinaryFolder(cloudName, apiKey, apiSecret, folder) {
  const credentials = btoa(`${apiKey}:${apiSecret}`);
  const url = `https://api.cloudinary.com/v1_1/${cloudName}/resources/image?prefix=${encodeURIComponent(folder)}&max_results=100&type=upload`;
  const res = await fetch(url, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.resources || []).map(r => ({
    public_id: r.public_id,
    url: `https://res.cloudinary.com/${cloudName}/image/upload/f_auto,q_auto/${r.public_id}`,
    created_at: r.created_at,
  }));
}

// ── Site settings ────────────────────────────────────────────────────────────

const SITE_SETTING_KEYS = ['whatsapp', 'email', 'instagram', 'shopee', 'mercadolivre'];

function normalizeSettingsPayload(payload = {}) {
  const settings = {};
  for (const key of SITE_SETTING_KEYS) {
    settings[key] = typeof payload[key] === 'string' ? payload[key].trim() : '';
  }
  return settings;
}

async function readSiteSettings(db) {
  const settings = Object.fromEntries(SITE_SETTING_KEYS.map(key => [key, '']));
  const { results } = await db.prepare('SELECT key, value FROM site_settings').all();

  for (const row of results || []) {
    if (SITE_SETTING_KEYS.includes(row.key)) settings[row.key] = row.value || '';
  }

  return settings;
}

async function saveSiteSettings(db, settings, userId) {
  const now = Math.floor(Date.now() / 1000);

  for (const key of SITE_SETTING_KEYS) {
    await db.prepare(
      `INSERT INTO site_settings (key, value, updated_at, updated_by)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         value = excluded.value,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`
    ).bind(key, settings[key] || '', now, userId || null).run();
  }

  return readSiteSettings(db);
}

// ── Product catalog ──────────────────────────────────────────────────────────

function canManageProducts(user) {
  return user && (user.role === 'admin' || user.role === 'editor');
}

function cleanString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function cleanNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function cleanImagePath(value) {
  return cleanString(value).replace(/^Produtos\//, '').replace(/^\/+/, '');
}

function normalizeImages(payload = {}) {
  const raw = Array.isArray(payload.images) ? payload.images : [];
  const cover = cleanImagePath(payload.image || '');
  return [cover, ...raw.map(cleanImagePath)]
    .filter(Boolean)
    .filter((img, index, arr) => arr.indexOf(img) === index);
}

function normalizeProductPayload(payload = {}, id = null) {
  const name = cleanString(payload.name);
  const category = cleanString(payload.category);
  const desc = cleanString(payload.desc || payload.description);

  if (!name) return { error: 'Nome do produto é obrigatório.' };
  if (!category) return { error: 'Categoria é obrigatória.' };
  if (!desc) return { error: 'Descrição é obrigatória.' };

  const images = normalizeImages(payload);
  const dimensions = payload.dimensions || {};
  const product = {
    id,
    name,
    category,
    price: cleanNumber(payload.price),
    badge: cleanString(payload.badge) || null,
    rating: cleanNumber(payload.rating) ?? 5,
    reviews: cleanNumber(payload.reviews) ?? 0,
    shortDesc: cleanString(payload.shortDesc) || null,
    desc,
    features: Array.isArray(payload.features)
      ? payload.features.map(item => cleanString(item)).filter(Boolean)
      : [],
    customization: cleanString(payload.customization) || null,
    productionTime: cleanString(payload.productionTime) || null,
    emoji: cleanString(payload.emoji) || null,
    colors: Array.isArray(payload.colors)
      ? payload.colors.map(color => cleanString(color)).filter(Boolean)
      : [],
    image: images[0] || null,
    images,
    material: cleanString(payload.material) || null,
    weight: cleanNumber(payload.weight),
    dimensions: {
      length: cleanNumber(dimensions.length),
      width: cleanNumber(dimensions.width),
      height: cleanNumber(dimensions.height),
    },
  };

  return { product };
}

function parseProductRow(row) {
  let product = {};
  try {
    product = JSON.parse(row.data || '{}');
  } catch {
    product = {};
  }

  return {
    ...product,
    id: row.id,
    name: product.name || row.name,
    category: product.category || row.category,
  };
}

async function listProducts(db) {
  const { results } = await db.prepare(
    `SELECT id, name, category, data
     FROM products
     WHERE active = 1
     ORDER BY category ASC, name ASC, id ASC`
  ).all();
  return (results || []).map(parseProductRow);
}

async function getProduct(db, id) {
  const row = await db.prepare(
    `SELECT id, name, category, data
     FROM products
     WHERE id = ? AND active = 1`
  ).bind(id).first();
  return row ? parseProductRow(row) : null;
}

async function createProduct(db, payload, userId) {
  const normalized = normalizeProductPayload(payload);
  if (normalized.error) return normalized;

  const now = Math.floor(Date.now() / 1000);
  const draft = normalized.product;
  if (!await db.prepare('SELECT id FROM categories WHERE id = ?').bind(draft.category).first()) return { error: 'Categoria não encontrada. Atualize a lista.' };
  const result = await db.prepare(
    `INSERT INTO products (name, category, data, active, created_at, updated_at, updated_by)
     VALUES (?, ?, ?, 1, ?, ?, ?)`
  ).bind(draft.name, draft.category, JSON.stringify(draft), now, now, userId || null).run();

  const id = result.meta.last_row_id;
  const product = { ...draft, id };
  await db.prepare(
    `UPDATE products
     SET data = ?, updated_at = ?, updated_by = ?
     WHERE id = ?`
  ).bind(JSON.stringify(product), now, userId || null, id).run();

  return { product };
}

async function updateProduct(db, id, payload, userId) {
  const existing = await getProduct(db, id);
  if (!existing) return { error: 'Produto não encontrado.', status: 404 };

  const normalized = normalizeProductPayload({ ...existing, ...payload }, id);
  if (normalized.error) return normalized;

  const now = Math.floor(Date.now() / 1000);
  const product = normalized.product;
  if (!await db.prepare('SELECT id FROM categories WHERE id = ?').bind(product.category).first()) return { error: 'Categoria não encontrada. Atualize a lista.' };
  await db.prepare(
    `UPDATE products
     SET name = ?, category = ?, data = ?, updated_at = ?, updated_by = ?
     WHERE id = ? AND active = 1`
  ).bind(product.name, product.category, JSON.stringify(product), now, userId || null, id).run();

  return { product };
}

// ── Shipping quote ───────────────────────────────────────────────────────────

function normalizeCep(value = '') {
  return String(value).replace(/\D/g, '').slice(0, 8);
}

function positiveNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function normalizeShippingName(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function isAllowedShippingOption(item = {}) {
  const company = normalizeShippingName(item.company?.name);
  const service = normalizeShippingName(item.name);

  return company.trim() === 'CORREIOS' && ['PAC', 'SEDEX'].includes(service.trim()) && [1, 2].includes(Number(item.id));
}

async function quoteShipping(env, payload = {}) {
  if (!env.MELHOR_ENVIO_TOKEN || !env.ORIGIN_CEP) {
    return {
      ok: false,
      status: 501,
      error: 'Cálculo de frete ainda não configurado. Configure MELHOR_ENVIO_TOKEN e ORIGIN_CEP no Worker.',
    };
  }

  const cep = normalizeCep(payload.cep);
  const product = payload.product || {};
  if (cep.length !== 8) {
    return { ok: false, status: 400, error: 'CEP inválido.' };
  }

  const weightKg = Math.max(0.01, positiveNumber(product.weight) / 1000);
  const width = Math.max(1, positiveNumber(product.width));
  const height = Math.max(1, positiveNumber(product.height));
  const length = Math.max(1, positiveNumber(product.length));

  if (!weightKg || !width || !height || !length) {
    return { ok: false, status: 400, error: 'Produto sem peso ou dimensões para calcular frete.' };
  }

  const body = {
    from: { postal_code: normalizeCep(env.ORIGIN_CEP) },
    to: { postal_code: cep },
    products: [{
      id: String(product.id || 'produto'),
      width,
      height,
      length,
      weight: weightKg,
      insurance_value: Math.max(1, positiveNumber(product.price, 1)),
      quantity: 1,
    }],
    options: {
      receipt: false,
      own_hand: false,
      collect: false,
    },
    services: '1,2', // Melhor Envio: Correios PAC and SEDEX only.
  };

  const res = await fetch('https://www.melhorenvio.com.br/api/v2/me/shipment/calculate', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.MELHOR_ENVIO_TOKEN}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'Forgecon Admin (contato@forgecon.com.br)',
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !Array.isArray(data)) {
    return {
      ok: false,
      status: res.status || 502,
      error: 'Não foi possível calcular o frete agora.',
      detail: data,
    };
  }

  const options = data
    .filter(item => !item.error && item.price && isAllowedShippingOption(item))
    .map(item => ({
      id: item.id,
      name: `${item.company?.name || 'Transportadora'} ${item.name || ''}`.trim(),
      price: `R$ ${Number(item.price).toFixed(2).replace('.', ',')}`,
      deadline: item.delivery_time ? `${item.delivery_time} dia(s) úteis` : 'Prazo a confirmar',
    }));

  return { ok: true, options };
}

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(deliverPending(env));
  },
  async fetch(request, env, ctx) {
    try {
      return await handleRequest(request, env, ctx);
    } catch (e) {
      const origin = request.headers.get('Origin') || '';
      return new Response(JSON.stringify({ error: 'Worker exception', detail: e.message, stack: e.stack }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }
  },
};

async function handleRequest(request, env, ctx) {
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors(origin) });
  }

  const commercial = await handleCommercial(request, env, { json, err, cors, getSessionUser, tokenFromRequest, waitUntil:ctx ? promise => ctx.waitUntil(promise) : undefined });
  if (commercial) return commercial;

  if (path === '/' || path === '/health') {
    return json({
      ok: true,
      service: 'forgecon-auth',
      time: new Date().toISOString(),
    }, 200, origin);
  }

  if (path === '/settings' && request.method === 'GET') {
    const settings = await readSiteSettings(env.DB);
    return json({ settings }, 200, origin);
  }

  if (path === '/settings' && request.method === 'PUT') {
    const me = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!me) return err('Não autenticado', 401, origin);
    if (me.role !== 'admin') return err('Acesso negado', 403, origin);

    const payload = await request.json();
    const settings = normalizeSettingsPayload(payload);
    const saved = await saveSiteSettings(env.DB, settings, me.id);

    await auditLogSafe(env.DB, request, me, 'atualizar_configuracoes', 'settings', null, saved);
    return json({ ok: true, settings: saved }, 200, origin);
  }

  if (path === '/products' && request.method === 'GET') {
    const products = await listProducts(env.DB);
    return json({ products }, 200, origin);
  }

  if (path === '/products' && request.method === 'POST') {
    const me = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!me) return err('Não autenticado', 401, origin);
    if (!canManageProducts(me)) return err('Acesso negado', 403, origin);

    const payload = await request.json().catch(() => ({}));
    const result = await createProduct(env.DB, payload, me.id);
    if (result.error) return err(result.error, result.status || 400, origin);

    await auditLogSafe(env.DB, request, me, 'criar_produto', 'products', result.product.id, {
      nome: result.product.name,
      categoria: result.product.category,
      fotos: result.product.images.length,
    });
    return json({ product: result.product }, 201, origin);
  }

  const productMatch = path.match(/^\/products\/(\d+)$/);
  if (productMatch && request.method === 'GET') {
    const product = await getProduct(env.DB, parseInt(productMatch[1], 10));
    if (!product) return err('Produto não encontrado.', 404, origin);
    return json({ product }, 200, origin);
  }

  if (productMatch && request.method === 'PUT') {
    const me = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!me) return err('Não autenticado', 401, origin);
    if (!canManageProducts(me)) return err('Acesso negado', 403, origin);

    const id = parseInt(productMatch[1], 10);
    const payload = await request.json().catch(() => ({}));
    const result = await updateProduct(env.DB, id, payload, me.id);
    if (result.error) return err(result.error, result.status || 400, origin);

    await auditLogSafe(env.DB, request, me, 'atualizar_produto', 'products', id, {
      nome: result.product.name,
      categoria: result.product.category,
      fotos: result.product.images.length,
    });
    return json({ product: result.product }, 200, origin);
  }

  if (productMatch && request.method === 'DELETE') {
    const me = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!me) return err('Não autenticado', 401, origin);
    if (!canManageProducts(me)) return err('Acesso negado', 403, origin);

    const id = parseInt(productMatch[1], 10);
    const existing = await getProduct(env.DB, id);
    if (!existing) return err('Produto não encontrado.', 404, origin);

    await env.DB.prepare(
      `UPDATE products
       SET active = 0, updated_at = ?, updated_by = ?
       WHERE id = ?`
    ).bind(Math.floor(Date.now() / 1000), me.id, id).run();

    await auditLogSafe(env.DB, request, me, 'excluir_produto', 'products', id, {
      nome: existing.name,
      categoria: existing.category,
    });
    return json({ ok: true }, 200, origin);
  }

  if (path === '/shipping/quote' && request.method === 'POST') {
    const payload = await request.json().catch(() => ({}));
    const result = await quoteShipping(env, payload);
    if (!result.ok) return err(result.error, result.status || 502, origin);
    return json({ options: result.options }, 200, origin);
  }

  if (path === '/auth/setup' && request.method === 'POST') {
    const count = await env.DB.prepare('SELECT COUNT(*) as n FROM users').first();
    if (count.n > 0) return err('Setup already done', 403, origin);

    const { email, password, name } = await request.json();
    if (!email || !password) return err('email e password são obrigatórios', 400, origin);

    const { salt, hash } = await hashPassword(password);
    await env.DB.prepare(
      'INSERT INTO users (email, name, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?)'
    ).bind(email, name || 'Admin', hash, salt, 'admin').run();

    return json({ ok: true, message: 'Usuário admin criado com sucesso' }, 201, origin);
  }

  if (path === '/auth/login' && request.method === 'POST') {
    const { email, password } = await request.json();
    if (!email || !password) return err('Credenciais inválidas', 400, origin);

    const user = await env.DB.prepare(
      'SELECT id, email, name, role, password_hash, password_salt FROM users WHERE email = ?'
    ).bind(email.toLowerCase()).first();

    if (!user) return err('Credenciais inválidas', 401, origin);

    const ok = await verifyPassword(password, user.password_salt, user.password_hash);
    if (!ok) return err('Credenciais inválidas', 401, origin);

    const token = await createSession(env.DB, user.id);
    const safeUser = { id: user.id, email: user.email, name: user.name, role: user.role };

    await auditLogSafe(env.DB, request, safeUser, 'login', 'auth', user.id, { email: user.email });
    return json({ token, user: safeUser }, 200, origin);
  }

  if (path === '/auth/logout' && request.method === 'POST') {
    const token = tokenFromRequest(request);
    if (token) {
      const user = await getSessionUser(env.DB, token);
      if (user) {
        await auditLogSafe(env.DB, request, user, 'logout', 'auth', user.id, { email: user.email });
      }
      await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
    }
    return json({ ok: true }, 200, origin);
  }

  if (path === '/auth/me' && request.method === 'GET') {
    const user = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!user) return err('Não autenticado', 401, origin);
    return json({ user }, 200, origin);
  }

  if (path === '/auth/forgot' && request.method === 'POST') {
    const { email } = await request.json();
    if (!email) return err('email é obrigatório', 400, origin);

    const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();

    if (user) {
      const resetToken = randomToken();
      const expiresAt = Math.floor(Date.now() / 1000) + 600; 
      await env.DB.prepare(
        'INSERT INTO reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)'
      ).bind(resetToken, user.id, expiresAt).run();

      const resetLink = `${ALLOWED_ORIGIN}/admin/?reset=${resetToken}`;
      await sendResetEmail(env.RESEND_API_KEY, email, resetLink);
      
      await auditLogSafe(env.DB, request, {id: user.id, email: email, name: ''}, 'recuperar_senha', 'auth', user.id, { email: email });
    }

    return json({ ok: true, message: 'Se este email existir, você receberá as instruções.' }, 200, origin);
  }

  if (path === '/auth/reset' && request.method === 'POST') {
    const { token, password } = await request.json();
    if (!token || !password) return err('token e password são obrigatórios', 400, origin);

    const now = Math.floor(Date.now() / 1000);
    const row = await env.DB.prepare(
      'SELECT r.user_id, u.email, u.name FROM reset_tokens r JOIN users u ON u.id = r.user_id WHERE r.token = ? AND r.expires_at > ? AND r.used_at IS NULL'
    ).bind(token, now).first();

    if (!row) return err('Token inválido ou expirado', 400, origin);

    const { salt, hash } = await hashPassword(password);
    await env.DB.prepare(
      'UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?'
    ).bind(hash, salt, row.user_id).run();

    await env.DB.prepare(
      'UPDATE reset_tokens SET used_at = ? WHERE token = ?'
    ).bind(now, token).run();

    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id).run();

    await auditLogSafe(env.DB, request, {id: row.user_id, email: row.email, name: row.name}, 'redefinir_senha', 'auth', row.user_id, { email: row.email });

    return json({ ok: true, message: 'Senha redefinida com sucesso' }, 200, origin);
  }

  if (path === '/auth/users' && request.method === 'GET') {
    const me = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!me) return err('Não autenticado', 401, origin);
    if (me.role !== 'admin') return err('Acesso negado', 403, origin);

    const { results } = await env.DB.prepare(
      'SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC'
    ).all();
    return json({ users: results }, 200, origin);
  }

  if (path === '/auth/users' && request.method === 'POST') {
    const me = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!me) return err('Não autenticado', 401, origin);
    if (me.role !== 'admin') return err('Acesso negado', 403, origin);

    const { email, password, name, role = 'editor' } = await request.json();
    if (!email || !password) return err('email e password são obrigatórios', 400, origin);

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
    if (existing) return err('Email já cadastrado', 409, origin);

    const { salt, hash } = await hashPassword(password);
    const result = await env.DB.prepare(
      'INSERT INTO users (email, name, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?)'
    ).bind(email.toLowerCase(), name || email, hash, salt, role).run();

    const novoId = result.meta.last_row_id;
    await auditLogSafe(env.DB, request, me, 'criar_usuario', 'users', novoId, { email_criado: email, regra: role });

    return json({ ok: true, id: novoId }, 201, origin);
  }

  const deleteMatch = path.match(/^\/auth\/users\/(\d+)$/);
  if (deleteMatch && request.method === 'DELETE') {
    const me = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!me) return err('Não autenticado', 401, origin);
    if (me.role !== 'admin') return err('Acesso negado', 403, origin);

    const targetId = parseInt(deleteMatch[1]);
    if (targetId === me.id) return err('Não é possível excluir sua própria conta', 400, origin);

    await auditLogSafe(env.DB, request, me, 'excluir_usuario', 'users', targetId, { id_excluido: targetId });

    await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId).run();
    return json({ ok: true }, 200, origin);
  }

  if (path === '/auth/invite' && request.method === 'POST') {
    const me = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!me) return err('Não autenticado', 401, origin);
    if (me.role !== 'admin') return err('Acesso negado', 403, origin);

    const { email, role = 'admin' } = await request.json();
    if (!email) return err('email é obrigatório', 400, origin);

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
    if (existing) return err('Este email já possui uma conta', 409, origin);

    const pending = await env.DB.prepare(
      'SELECT token FROM invites WHERE email = ? AND used_at IS NULL AND expires_at > ?'
    ).bind(email.toLowerCase(), Math.floor(Date.now() / 1000)).first();
    if (pending) return err('Já existe um convite pendente para este email', 409, origin);

    const token = randomToken();
    const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 48;
    await env.DB.prepare(
      'INSERT INTO invites (token, email, role, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(token, email.toLowerCase(), role, expiresAt).run();

    const inviteLink = `${ALLOWED_ORIGIN}/admin/?invite=${token}`;
    await sendInviteEmail(env.RESEND_API_KEY, email, inviteLink, me.name);

    await auditLogSafe(env.DB, request, me, 'enviar_convite', 'invites', null, { email_convidado: email });

    return json({ ok: true, message: 'Convite enviado com sucesso' }, 201, origin);
  }

  if (path === '/auth/invite' && request.method === 'GET') {
    const token = url.searchParams.get('token');
    if (!token) return err('token é obrigatório', 400, origin);

    const now = Math.floor(Date.now() / 1000);
    const invite = await env.DB.prepare(
      'SELECT email, role FROM invites WHERE token = ? AND expires_at > ? AND used_at IS NULL'
    ).bind(token, now).first();

    if (!invite) return err('Convite inválido ou expirado', 400, origin);
    return json({ email: invite.email, role: invite.role }, 200, origin);
  }

  if (path === '/auth/invite/accept' && request.method === 'POST') {
    const { token, password, name } = await request.json();
    if (!token || !password) return err('token e password são obrigatórios', 400, origin);

    const now = Math.floor(Date.now() / 1000);
    const invite = await env.DB.prepare(
      'SELECT email, role FROM invites WHERE token = ? AND expires_at > ? AND used_at IS NULL'
    ).bind(token, now).first();

    if (!invite) return err('Convite inválido ou expirado', 400, origin);

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(invite.email).first();
    if (existing) return err('Este email já possui uma conta', 409, origin);

    const { salt, hash } = await hashPassword(password);
    const result = await env.DB.prepare(
      'INSERT INTO users (email, name, password_hash, password_salt, role) VALUES (?, ?, ?, ?, ?)'
    ).bind(invite.email, name || invite.email, hash, salt, invite.role).run();

    const novoId = result.meta.last_row_id;
    await env.DB.prepare('UPDATE invites SET used_at = ? WHERE token = ?').bind(now, token).run();

    await auditLogSafe(env.DB, request, {id: novoId, email: invite.email, name: name}, 'aceitar_convite', 'invites', novoId, { email: invite.email });

    return json({ ok: true, message: 'Conta criada com sucesso. Faça login para continuar.' }, 201, origin);
  }

  if (path === '/auth/invites' && request.method === 'GET') {
    const me = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!me) return err('Não autenticado', 401, origin);
    if (me.role !== 'admin') return err('Acesso negado', 403, origin);

    const now = Math.floor(Date.now() / 1000);
    const { results } = await env.DB.prepare(
      'SELECT token, email, role, expires_at, used_at, created_at FROM invites ORDER BY created_at DESC'
    ).all();
    return json({ invites: results.map(i => ({ ...i, expired: !i.used_at && i.expires_at < now })) }, 200, origin);
  }

  if (path === '/cloudinary/list' && request.method === 'GET') {
    const me = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!me) return err('Não autenticado', 401, origin);

    const folder = url.searchParams.get('folder') || 'Produtos';
    const images = await listCloudinaryFolder(
      env.CLOUDINARY_CLOUD_NAME,
      env.CLOUDINARY_API_KEY,
      env.CLOUDINARY_API_SECRET,
      folder
    );

    if (images === null) return err('Erro ao buscar imagens do Cloudinary', 502, origin);
    return json({ images }, 200, origin);
  }

  // ── ROTA PARA RECEBER A AUDITORIA DO FRONTEND (O que faltava!) ──
  if (path === '/auth/audit-logs' && request.method === 'POST') {
    const me = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!me) return err('Não autenticado', 401, origin);
    
    const { action, entity, entityId, details } = await request.json();
    await auditLogSafe(env.DB, request, me, action, entity, entityId, details);
    
    return json({ ok: true }, 201, origin);
  }

  if (path === '/auth/audit-logs' && request.method === 'GET') {
    const me = await getSessionUser(env.DB, tokenFromRequest(request));
    if (!me) return err('Não autenticado', 401, origin);
    
    if (me.email !== 'marcel.conde@hotmail.com') {
      return err('Acesso negado. Apenas o super-admin pode ver os logs.', 403, origin);
    }

    const { results } = await env.DB.prepare(
      'SELECT * FROM audit_logs ORDER BY rowid DESC LIMIT 100'
    ).all();
    
    return json({ logs: results }, 200, origin);
  }

  return err('Not found', 404, origin);
}
