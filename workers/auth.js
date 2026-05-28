/* auth.js - JWT RBAC middleware - inicio.red.bo */

const ALG = { name: 'HMAC', hash: 'SHA-256' };
const TOKEN_TTL = 86400; // 24h in seconds
const REFRESH_THRESHOLD = 3600; // refresh if < 1h remaining

const ROLE_LEVELS = { viewer: 1, editor: 2, admin: 3 };

// ── Crypto helpers ───────────────────────────────
async function importKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    ALG,
    false,
    ['sign', 'verify']
  );
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function parseB64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Uint8Array.from(atob(str), c => c.charCodeAt(0));
}

// ── JWT sign ─────────────────────────────────────
export async function signToken(payload, secret) {
  const header = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(new TextEncoder().encode(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL
  })));
  const msg = `${header}.${body}`;
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return `${msg}.${b64url(sig)}`;
}

// ── JWT verify ───────────────────────────────────
export async function verifyToken(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return { user: null, error: 'missing_token' };

  const token = auth.slice(7);

  // Check blacklist
  const revoked = await env.INICIO_KV.get(`blacklist:${token}`);
  if (revoked) return { user: null, error: 'revoked' };

  const parts = token.split('.');
  if (parts.length !== 3) return { user: null, error: 'malformed' };

  try {
    const payload = JSON.parse(new TextDecoder().decode(parseB64url(parts[1])));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp < now) return { user: null, error: 'expired' };

    const msg = `${parts[0]}.${parts[1]}`;
    const key = await importKey(env.JWT_SECRET || 'changeme-in-production');
    const sig = parseB64url(parts[2]);
    const valid = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(msg));

    if (!valid) return { user: null, error: 'invalid_signature' };

    // Auto-refresh if < REFRESH_THRESHOLD remaining
    let refreshToken = null;
    if (payload.exp - now < REFRESH_THRESHOLD) {
      refreshToken = await signToken(
        { sub: payload.sub, email: payload.email, role: payload.role },
        env.JWT_SECRET || 'changeme-in-production'
      );
    }

    return { user: payload, role: payload.role, refreshToken, error: null };
  } catch {
    return { user: null, error: 'parse_error' };
  }
}

// ── Role check ───────────────────────────────────
export function requireRole(userRole, minRole) {
  return (ROLE_LEVELS[userRole] || 0) >= (ROLE_LEVELS[minRole] || 99);
}

// ── Hash password (PBKDF2) ───────────────────────
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    key, 256
  );
  const saltHex = [...salt].map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  return `${saltHex}:${hashHex}`;
}

export async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 },
    key, 256
  );
  const derived = [...new Uint8Array(bits)].map(b => b.toString(16).padStart(2, '0')).join('');
  return derived === hashHex;
}

// ── Login handler ────────────────────────────────
export async function handleLogin(request, env) {
  let body;
  try { body = await request.json(); } catch { return err(400, 'invalid_json'); }

  const { email, password } = body || {};
  if (!email || !password) return err(400, 'missing_fields');

  const user = await env.DB.prepare('SELECT * FROM users WHERE email = ? AND active = 1')
    .bind(email.toLowerCase()).first();

  if (!user) return err(401, 'invalid_credentials');

  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) return err(401, 'invalid_credentials');

  const token = await signToken(
    { sub: user.id, email: user.email, role: user.role },
    env.JWT_SECRET || 'changeme-in-production'
  );

  return json({ token, user: { id: user.id, email: user.email, role: user.role } });
}

// ── Logout (revoke token) ────────────────────────
export async function handleLogout(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    await env.INICIO_KV.put(`blacklist:${token}`, '1', { expirationTtl: TOKEN_TTL + 3600 });
  }
  return json({ ok: true });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function err(status, code) {
  return json({ error: code }, status);
}
