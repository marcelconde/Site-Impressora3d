const ALLOWED_ORIGIN = 'https://forgecon.com.br';

function cors(origin) {
  const allowed = origin === ALLOWED_ORIGIN || origin === 'http://localhost:3000';
  return {
    'Access-Control-Allow-Origin': allowed ? origin : ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
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
          <p>Clique no botão abaixo para criar uma nova senha. O link expira em <strong>1 hora</strong>.</p>
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

// ── Router ────────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (e) {
      const origin = request.headers.get('Origin') || '';
      return new Response(JSON.stringify({ error: 'Worker exception', detail: e.message, stack: e.stack }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...cors(origin) },
      });
    }
  },
};

async function handleRequest(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const path = url.pathname;

    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    // ── POST /auth/setup ──────────────────────────────────────────────────────
    // Creates the very first admin user. Disabled once any user exists.
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

    // ── POST /auth/login ──────────────────────────────────────────────────────
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
      return json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } }, 200, origin);
    }

    // ── POST /auth/logout ─────────────────────────────────────────────────────
    if (path === '/auth/logout' && request.method === 'POST') {
      const token = tokenFromRequest(request);
      if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
      return json({ ok: true }, 200, origin);
    }

    // ── GET /auth/me ──────────────────────────────────────────────────────────
    if (path === '/auth/me' && request.method === 'GET') {
      const user = await getSessionUser(env.DB, tokenFromRequest(request));
      if (!user) return err('Não autenticado', 401, origin);
      return json({ user }, 200, origin);
    }

    // ── POST /auth/forgot ─────────────────────────────────────────────────────
    if (path === '/auth/forgot' && request.method === 'POST') {
      const { email } = await request.json();
      if (!email) return err('email é obrigatório', 400, origin);

      const user = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();

      // Always return 200 to prevent email enumeration
      if (user) {
        const resetToken = randomToken();
        const expiresAt = Math.floor(Date.now() / 1000) + 3600; // 1 hour
        await env.DB.prepare(
          'INSERT INTO reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)'
        ).bind(resetToken, user.id, expiresAt).run();

        const resetLink = `${ALLOWED_ORIGIN}/admin/?reset=${resetToken}`;
        await sendResetEmail(env.RESEND_API_KEY, email, resetLink);
      }

      return json({ ok: true, message: 'Se este email existir, você receberá as instruções.' }, 200, origin);
    }

    // ── POST /auth/reset ──────────────────────────────────────────────────────
    if (path === '/auth/reset' && request.method === 'POST') {
      const { token, password } = await request.json();
      if (!token || !password) return err('token e password são obrigatórios', 400, origin);

      const now = Math.floor(Date.now() / 1000);
      const row = await env.DB.prepare(
        'SELECT user_id FROM reset_tokens WHERE token = ? AND expires_at > ? AND used_at IS NULL'
      ).bind(token, now).first();

      if (!row) return err('Token inválido ou expirado', 400, origin);

      const { salt, hash } = await hashPassword(password);
      await env.DB.prepare(
        'UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?'
      ).bind(hash, salt, row.user_id).run();

      await env.DB.prepare(
        'UPDATE reset_tokens SET used_at = ? WHERE token = ?'
      ).bind(now, token).run();

      // Invalidate all sessions for this user
      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(row.user_id).run();

      return json({ ok: true, message: 'Senha redefinida com sucesso' }, 200, origin);
    }

    // ── GET /auth/users ───────────────────────────────────────────────────────
    if (path === '/auth/users' && request.method === 'GET') {
      const me = await getSessionUser(env.DB, tokenFromRequest(request));
      if (!me) return err('Não autenticado', 401, origin);
      if (me.role !== 'admin') return err('Acesso negado', 403, origin);

      const { results } = await env.DB.prepare(
        'SELECT id, email, name, role, created_at FROM users ORDER BY created_at ASC'
      ).all();
      return json({ users: results }, 200, origin);
    }

    // ── POST /auth/users ──────────────────────────────────────────────────────
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

      return json({ ok: true, id: result.meta.last_row_id }, 201, origin);
    }

    // ── DELETE /auth/users/:id ────────────────────────────────────────────────
    const deleteMatch = path.match(/^\/auth\/users\/(\d+)$/);
    if (deleteMatch && request.method === 'DELETE') {
      const me = await getSessionUser(env.DB, tokenFromRequest(request));
      if (!me) return err('Não autenticado', 401, origin);
      if (me.role !== 'admin') return err('Acesso negado', 403, origin);

      const targetId = parseInt(deleteMatch[1]);
      if (targetId === me.id) return err('Não é possível excluir sua própria conta', 400, origin);

      await env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(targetId).run();
      await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(targetId).run();
      return json({ ok: true }, 200, origin);
    }

    // ── GET /cloudinary/list?folder=X ─────────────────────────────────────────
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

    return err('Not found', 404, origin);
}
