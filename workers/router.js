/* router.js - Edge Router / Cloudflare Worker - inicio.red.bo */

import { verifyToken, requireRole, handleLogin, handleLogout } from './auth.js';
import { runHarvester } from './harvester.js';

const ALLOWED_ORIGINS = [
  'https://inicio.red.bo',
  'https://www.inicio.red.bo',
  'http://localhost:8787',
  'http://localhost:3000'
];
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW = 60;

// ── CORS ─────────────────────────────────────────
function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

// ── Rate limiting ─────────────────────────────────
async function checkRate(env, ip) {
  const window = Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW);
  const key = `rl:${ip}:${window}`;
  const count = parseInt(await env.RATE_LIMIT_KV.get(key) || '0');
  if (count >= RATE_LIMIT_MAX) return false;
  await env.RATE_LIMIT_KV.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW * 2 });
  return true;
}

// ── Response helpers ──────────────────────────────
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...extra }
  });
}

function err(status, message, cors = {}) {
  return json({ error: message }, status, cors);
}

function cached(data, ttl = 60, swr = 300) {
  return {
    'Cache-Control': `public, max-age=${ttl}, stale-while-revalidate=${swr}`
  };
}

// ── /api/categories ───────────────────────────────
async function getCategories(env, cors) {
  const { results } = await env.DB.prepare(
    'SELECT id, name, emoji, order_index FROM categories ORDER BY order_index ASC'
  ).all();
  return json({ data: results || [], meta: { total: results?.length || 0 } }, 200, { ...cors, ...cached(300, 600) });
}

// ── /api/links ────────────────────────────────────
async function getLinks(env, url, cors) {
  const cat = url.searchParams.get('cat') || url.searchParams.get('category') || 'all';
  const q = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim();
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(20, Math.max(1, parseInt(url.searchParams.get('limit') || '10')));
  const offset = (page - 1) * limit;

  let where = "status = 'active'";
  const params = [];

  if (cat && cat !== 'all') { where += ' AND category = ?'; params.push(cat); }
  if (q) {
    where += ' AND (title LIKE ? OR description LIKE ? OR domain LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const [countRow, { results }] = await Promise.all([
    env.DB.prepare(`SELECT COUNT(*) as n FROM links WHERE ${where}`).bind(...params).first(),
    env.DB.prepare(`SELECT id,title,url,domain,description,category,tags,favicon,clicks,created_at FROM links WHERE ${where} ORDER BY clicks DESC LIMIT ? OFFSET ?`)
      .bind(...params, limit, offset).all()
  ]);

  const total = countRow?.n || 0;
  const links = (results || []).map(l => ({ ...l, tags: safeJSON(l.tags, []) }));

  return json({
    data: links,
    meta: { total, page, limit, hasMore: offset + limit < total }
  }, 200, { ...cors, ...cached(60, 300) });
}

// ── /api/search ───────────────────────────────────
async function search(env, url, cors) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q || q.length < 2) return json({ data: [], meta: { total: 0 } }, 200, cors);
  return getLinks(env, url, cors);
}

// ── /api/links/:id click tracking ─────────────────
async function trackClick(env, id, cors) {
  await Promise.all([
    env.DB.prepare('UPDATE links SET clicks = clicks + 1 WHERE id = ?').bind(id).run(),
    env.DB.prepare('INSERT INTO link_clicks (link_id) VALUES (?)').bind(id).run()
  ]);
  return json({ ok: true }, 200, cors);
}

// ── Admin: links CRUD ─────────────────────────────
async function adminLinks(request, env, url, cors) {
  const id = url.pathname.split('/').filter(Boolean).pop();
  const method = request.method;

  if (method === 'GET') return getLinks(env, url, cors);

  if (method === 'POST') {
    const b = await request.json();
    const { title, url: linkUrl, domain, description, category, tags } = b;
    if (!title || !linkUrl) return err(400, 'title and url required', cors);
    const r = await env.DB.prepare(
      'INSERT INTO links (title, url, domain, description, category, tags) VALUES (?,?,?,?,?,?)'
    ).bind(title, linkUrl, domain || new URL(linkUrl).hostname, description || '', category || 'general', JSON.stringify(tags || [])).run();
    return json({ ok: true, id: r.meta?.last_row_id }, 201, cors);
  }

  if (method === 'PUT') {
    const b = await request.json();
    const { title, description, category, tags, status } = b;
    await env.DB.prepare(
      'UPDATE links SET title=?,description=?,category=?,tags=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?'
    ).bind(title, description || '', category || 'general', JSON.stringify(tags || []), status || 'active', id).run();
    return json({ ok: true }, 200, cors);
  }

  if (method === 'DELETE') {
    await env.DB.prepare('DELETE FROM links WHERE id = ?').bind(id).run();
    return json({ ok: true }, 200, cors);
  }

  return err(405, 'method not allowed', cors);
}

// ── Admin: dashboard stats ─────────────────────────
async function adminStats(env, cors) {
  const today = new Date().toISOString().slice(0, 10);
  const [total, pending, clicksToday, topCats] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as n FROM links WHERE status='active'").first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM links WHERE status='pending'").first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM link_clicks WHERE date(clicked_at)=?").bind(today).first(),
    env.DB.prepare("SELECT category, COUNT(*) as n FROM links WHERE status='active' GROUP BY category ORDER BY n DESC LIMIT 5").all()
  ]);
  return json({
    data: {
      totalLinks: total?.n || 0,
      pendingLinks: pending?.n || 0,
      clicksToday: clicksToday?.n || 0,
      topCategories: topCats?.results || []
    }
  }, 200, cors);
}

// ── Module config ─────────────────────────────────
async function getModuleConfig(env, cors) {
  const cfg = await env.INICIO_KV.get('modules:config', 'json');
  return json({
    data: cfg || {
      order: ['TopLinks', 'NewLinks', 'RandomPick', 'TrendingSearch'],
      visible: { TopLinks: true, NewLinks: true, RandomPick: true, TrendingSearch: true }
    }
  }, 200, { ...cors, ...cached(120, 600) });
}

// ── Main router ───────────────────────────────────
async function handleAPI(request, env, ctx, url) {
  const origin = request.headers.get('Origin') || '';
  const cors = corsHeaders(origin);
  const path = url.pathname;
  const method = request.method;

  // Public auth routes
  if (path === '/api/auth/login' && method === 'POST') return handleLogin(request, env);
  if (path === '/api/auth/logout' && method === 'POST') return handleLogout(request, env);

  // Public read routes
  if (path === '/api/categories' && method === 'GET') return getCategories(env, cors);
  if (path === '/api/links' && method === 'GET') return getLinks(env, url, cors);
  if (path === '/api/search' && method === 'GET') return search(env, url, cors);
  if (path === '/api/modules/config' && method === 'GET') return getModuleConfig(env, cors);

  // Click tracking (no auth needed)
  const clickMatch = path.match(/^\/api\/links\/(\d+)\/click$/);
  if (clickMatch && method === 'POST') return trackClick(env, clickMatch[1], cors);

  // Protected routes
  const { user, role, refreshToken, error } = await verifyToken(request, env);
  if (error) return err(401, error, cors);

  const headers = { ...cors };
  if (refreshToken) headers['X-Refresh-Token'] = refreshToken;

  // Editor+ routes
  if (path.startsWith('/api/links') && ['POST', 'PUT', 'DELETE'].includes(method)) {
    if (!requireRole(role, 'editor')) return err(403, 'forbidden', cors);
    return adminLinks(request, env, url, headers);
  }

  // Admin-only routes
  if (path.startsWith('/api/admin/')) {
    if (!requireRole(role, 'admin')) return err(403, 'forbidden', cors);
    if (path === '/api/admin/stats') return adminStats(env, headers);
    if (path === '/api/admin/harvest' && method === 'POST') {
      ctx.waitUntil(runHarvester(env));
      return json({ ok: true, message: 'Harvest started' }, 202, headers);
    }
  }

  return err(404, 'not found', cors);
}

// ── Worker export ─────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname.startsWith('/api/')) {
      const ip = request.headers.get('CF-Connecting-IP') || '0.0.0.0';
      const allowed = await checkRate(env, ip).catch(() => true);
      if (!allowed) {
        return json({ error: 'rate_limit_exceeded' }, 429, corsHeaders(origin));
      }
      return handleAPI(request, env, ctx, url).catch(e => {
        console.error('[Router] error:', e);
        return json({ error: 'internal_error' }, 500, corsHeaders(origin));
      });
    }

    // Static assets
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runHarvester(env));
  }
};

function safeJSON(s, fallback) {
  try { return JSON.parse(s || ''); } catch { return fallback; }
}
