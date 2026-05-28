/**
 * auth.js — OAuth2 Google + JWT Edge + RBAC
 * Cloudflare Workers Web Crypto API
 */

// ─────────────────────────────────────────────────────────────
// JWT (HMAC SHA-256)
// ─────────────────────────────────────────────────────────────

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str) {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return atob(s + pad);
}

export async function signJWT(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claims = { ...payload, iat: now, exp: now + 7 * 24 * 3600 };

  const enc = new TextEncoder();
  const headerB64 = base64UrlEncode(enc.encode(JSON.stringify(header)));
  const payloadB64 = base64UrlEncode(enc.encode(JSON.stringify(claims)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(signingInput));
  const sigB64 = base64UrlEncode(sig);

  return `${signingInput}.${sigB64}`;
}

export async function verifyJWT(request, env) {
  const token = extractToken(request);
  if (!token) return null;

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const secret = env?.JWT_SECRET || 'dev-secret';
    const enc = new TextEncoder();
    const signingInput = `${parts[0]}.${parts[1]}`;

    const key = await crypto.subtle.importKey(
      'raw', enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false, ['verify']
    );

    const sigBytes = Uint8Array.from(atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(signingInput));
    if (!valid) return null;

    const claims = JSON.parse(base64UrlDecode(parts[1]));
    if (claims.exp && claims.exp < Math.floor(Date.now() / 1000)) return null;

    return claims;
  } catch {
    return null;
  }
}

export function extractToken(request) {
  // Check Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) return authHeader.slice(7);

  // Check Cookie
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(/(?:^|;\s*)auth_token=([^;]+)/);
  return match ? match[1] : null;
}

// ─────────────────────────────────────────────────────────────
// GOOGLE OAUTH2
// ─────────────────────────────────────────────────────────────

export function buildGoogleAuthURL(env, state) {
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID || '',
    redirect_uri: env.GOOGLE_REDIRECT_URI || 'https://inicio.red.bo/auth/callback',
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account'
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code, env) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID || '',
      client_secret: env.GOOGLE_CLIENT_SECRET || '',
      redirect_uri: env.GOOGLE_REDIRECT_URI || 'https://inicio.red.bo/auth/callback',
      grant_type: 'authorization_code'
    })
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`);
  return res.json();
}

export async function getGoogleUserInfo(accessToken) {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`UserInfo failed: ${res.status}`);
  return res.json();
}

// ─────────────────────────────────────────────────────────────
// RBAC
// ─────────────────────────────────────────────────────────────

const ROLE_HIERARCHY = { super_admin: 3, admin: 2, usuario: 1 };

export function requireRole(...allowedRoles) {
  return async (request, env) => {
    const auth = await verifyJWT(request, env);
    if (!auth) return unauthorizedResponse();
    if (!allowedRoles.includes(auth.role)) {
      return new Response(JSON.stringify({ error: 'Insufficient permissions' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    return auth; // return auth payload for downstream use
  };
}

export async function canAdminLinks(request, env) {
  const auth = await verifyJWT(request, env);
  if (!auth) return null;
  return ['admin', 'super_admin'].includes(auth.role) ? auth : null;
}

export async function canSuperAdmin(request, env) {
  const auth = await verifyJWT(request, env);
  if (!auth) return null;
  return auth.role === 'super_admin' ? auth : null;
}

export async function canViewProfile(request, env) {
  return verifyJWT(request, env);
}

// ─────────────────────────────────────────────────────────────
// SANITIZATION
// ─────────────────────────────────────────────────────────────

export function sanitizeInput(str, maxLen = 500) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeURL(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return '';
  try {
    const u = new URL(urlStr.trim());
    if (!['http:', 'https:'].includes(u.protocol)) return '';
    return u.toString();
  } catch {
    return '';
  }
}

export function unauthorizedResponse() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'Content-Type': 'application/json',
      'WWW-Authenticate': 'Bearer'
    }
  });
}
