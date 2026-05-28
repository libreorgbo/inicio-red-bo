/**
 * admin.js — Handlers de la API administrativa
 * Todos requieren JWT válido con rol admin o super_admin
 */

import { verifyJWT, sanitizeInput, sanitizeURL, unauthorizedResponse } from '../lib/auth.js';
import { applyModuleSchemaPatch } from '../lib/module-engine.js';
import { runAIHarvester } from '../lib/ai-harvester.js';

function canAdmin(auth) { return auth && ['admin', 'super_admin'].includes(auth.role); }
function canSuper(auth) { return auth && auth.role === 'super_admin'; }

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
}

async function invalidateKV(env, ...keys) {
  for (const key of keys) {
    try { await env.KV_CACHE.delete(key); } catch {}
  }
}

export async function handleAdminRoute(request, env, ctx) {
  const auth = await verifyJWT(request, env);
  if (!auth) return unauthorizedResponse();
  if (!canAdmin(auth)) return unauthorizedResponse();

  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  // ── STATS ──────────────────────────────────────────────
  if (path === '/api/admin/stats' && method === 'GET')
    return handleStats(env);

  // ── LINKS ──────────────────────────────────────────────
  if (path === '/api/admin/links' && method === 'GET')
    return handleListLinks(url, env);

  const linkMatch = path.match(/^\/api\/admin\/links\/(\d+)\/(approve|reject)$/);
  if (linkMatch) {
    if (method === 'PUT' && linkMatch[2] === 'approve') return handleApproveLink(parseInt(linkMatch[1]), url, env, auth, ctx);
    if (method === 'DELETE' && linkMatch[2] === 'reject') return handleRejectLink(parseInt(linkMatch[1]), env, ctx);
    if (method === 'PUT') return handleApproveLink(parseInt(linkMatch[1]), url, env, auth, ctx);
  }

  // ── ENGINES ────────────────────────────────────────────
  if (path === '/api/admin/engines' && method === 'GET') return handleListEngines(env);
  if (path === '/api/admin/engines' && method === 'POST') return handleCreateEngine(request, env);
  const engineMatch = path.match(/^\/api\/admin\/engines\/(\d+)(\/default)?$/);
  if (engineMatch) {
    const id = parseInt(engineMatch[1]);
    if (method === 'PUT' && engineMatch[2] === '/default') return handleSetDefaultEngine(id, env);
    if (method === 'PUT') return handleUpdateEngine(id, request, env);
  }

  // ── ADS ────────────────────────────────────────────────
  if (path === '/api/admin/ads' && method === 'GET') return handleListAds(env);
  if (path === '/api/admin/ads' && method === 'POST') return handleCreateAd(request, env);
  const adMatch = path.match(/^\/api\/admin\/ads\/(\d+)$/);
  if (adMatch && method === 'PUT') return handleUpdateAd(parseInt(adMatch[1]), request, env);

  // ── SEO ────────────────────────────────────────────────
  const seoMatch = path.match(/^\/api\/admin\/seo\/(\d+)$/);
  if (seoMatch && method === 'GET') return handleGetSEO(parseInt(seoMatch[1]), env);
  if (seoMatch && method === 'PUT') return handleUpdateSEO(parseInt(seoMatch[1]), request, env);

  // ── USERS ──────────────────────────────────────────────
  if (path === '/api/admin/users' && method === 'GET') return handleListUsers(url, env);
  const userMatch = path.match(/^\/api\/admin\/users\/(\d+)\/role$/);
  if (userMatch && method === 'PUT') {
    if (!canSuper(auth)) return unauthorizedResponse();
    return handleUpdateUserRole(parseInt(userMatch[1]), request, env);
  }
  const userStatusMatch = path.match(/^\/api\/admin\/users\/(\d+)\/status$/);
  if (userStatusMatch && method === 'PUT') return handleUpdateUserStatus(parseInt(userStatusMatch[1]), request, env);

  // ── MODULES ────────────────────────────────────────────
  if (path === '/api/admin/modules' && method === 'GET') return handleListModules(env);
  if (path === '/api/admin/modules' && method === 'POST') {
    if (!canSuper(auth)) return unauthorizedResponse();
    return handleCreateModule(request, env, auth);
  }

  // ── HARVESTER ──────────────────────────────────────────
  if (path === '/api/admin/harvester/run' && method === 'POST') {
    if (!canSuper(auth)) return unauthorizedResponse();
    ctx.waitUntil(runAIHarvester(env));
    return jsonResponse({ success: true, message: 'Harvester iniciado en background' });
  }
  if (path === '/api/admin/harvester/keywords' && method === 'GET') return handleListKeywords(env);
  if (path === '/api/admin/harvester/keywords' && method === 'POST') return handleCreateKeyword(request, env, auth);
  const kwMatch = path.match(/^\/api\/admin\/harvester\/keywords\/(\d+)$/);
  if (kwMatch && method === 'PUT') return handleUpdateKeyword(parseInt(kwMatch[1]), request, env);
  if (kwMatch && method === 'DELETE') return handleDeleteKeyword(parseInt(kwMatch[1]), env);

  return jsonResponse({ error: 'Ruta admin no encontrada' }, 404);
}

// ── STATS ────────────────────────────────────────────────────
async function handleStats(env) {
  const [totalLinks, pendingLinks, todayClicks, todayImpressions] = await Promise.all([
    env.DB.prepare('SELECT COUNT(*) as n FROM links WHERE is_approved = 1').first(),
    env.DB.prepare('SELECT COUNT(*) as n FROM links WHERE is_approved = 0').first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM analytics_events WHERE event_type='click' AND date(created_at)=date('now')").first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM analytics_events WHERE event_type='impression' AND date(created_at)=date('now')").first(),
  ]);

  const recentLinks = await env.DB.prepare(`
    SELECT l.link_id, l.titulo, l.url_final, l.origen, c.name_es as category_name, l.created_at
    FROM links l LEFT JOIN categories c ON l.category_id = c.category_id
    ORDER BY l.created_at DESC LIMIT 10
  `).all();

  const weeklyActivity = await env.DB.prepare(`
    SELECT date(created_at) as day, COUNT(*) as clicks
    FROM analytics_events
    WHERE event_type='click' AND created_at >= datetime('now','-7 days')
    GROUP BY day ORDER BY day ASC
  `).all();

  return jsonResponse({
    stats: {
      totalLinks: totalLinks?.n || 0,
      pendingLinks: pendingLinks?.n || 0,
      todayClicks: todayClicks?.n || 0,
      todayImpressions: todayImpressions?.n || 0
    },
    recentLinks: recentLinks.results,
    weeklyActivity: weeklyActivity.results
  });
}

// ── LINKS ────────────────────────────────────────────────────
async function handleListLinks(url, env) {
  const page = parseInt(url.searchParams.get('page') || '0');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const origen = url.searchParams.get('origen') || '';
  const category = url.searchParams.get('category') || '';
  const approved = url.searchParams.get('approved');

  let where = [];
  let binds = [];
  if (origen) { where.push('l.origen = ?'); binds.push(origen); }
  if (category) { where.push('c.slug = ?'); binds.push(category); }
  if (approved !== null && approved !== '') { where.push('l.is_approved = ?'); binds.push(parseInt(approved)); }

  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const { results } = await env.DB.prepare(`
    SELECT l.*, c.name_es as category_name, c.color_hex,
           u.display_name as user_name, u.email as user_email
    FROM links l
    LEFT JOIN categories c ON l.category_id = c.category_id
    LEFT JOIN users u ON l.user_id = u.user_id
    ${whereClause}
    ORDER BY l.created_at DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, limit, page * limit).all();

  const countRes = await env.DB.prepare(`
    SELECT COUNT(*) as total FROM links l
    LEFT JOIN categories c ON l.category_id = c.category_id
    ${whereClause}
  `).bind(...binds).first();

  return jsonResponse({ links: results, total: countRes?.total || 0, page });
}

async function handleApproveLink(id, url, env, auth, ctx) {
  const mode = url.searchParams.get('mode') || 'user';

  const link = await env.DB.prepare('SELECT * FROM links WHERE link_id = ?').bind(id).first();
  if (!link) return jsonResponse({ error: 'Link no encontrado' }, 404);

  let updateQuery = 'UPDATE links SET is_approved = 1, updated_at = CURRENT_TIMESTAMP';
  const binds = [];

  if (mode === 'owner') {
    updateQuery += ', owner_affiliate_tag = ?';
    binds.push(env.OWNER_AFFILIATE_TAG || '');
  }
  updateQuery += ' WHERE link_id = ?';
  binds.push(id);

  await env.DB.prepare(updateQuery).bind(...binds).run();
  ctx.waitUntil(invalidateKV(env, 'cat:page:0', `cat:${link.category_id}:links`));
  return jsonResponse({ success: true });
}

async function handleRejectLink(id, env, ctx) {
  const link = await env.DB.prepare('SELECT category_id FROM links WHERE link_id = ?').bind(id).first();
  await env.DB.prepare('DELETE FROM links WHERE link_id = ?').bind(id).run();
  if (link) ctx.waitUntil(invalidateKV(env, 'cat:page:0', `cat:${link.category_id}:links`));
  return jsonResponse({ success: true });
}

// ── ENGINES ──────────────────────────────────────────────────
async function handleListEngines(env) {
  const { results } = await env.DB.prepare('SELECT * FROM search_engines ORDER BY sort_order ASC').all();
  return jsonResponse(results);
}

async function handleCreateEngine(request, env) {
  const body = await request.json();
  const { engine_name, engine_slug, google_cse_id, search_url, sort_order } = body;
  if (!engine_name || !engine_slug) return jsonResponse({ error: 'Nombre y slug requeridos' }, 400);

  await env.DB.prepare(`
    INSERT INTO search_engines (engine_name, engine_slug, google_cse_id, search_url, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).bind(engine_name, engine_slug, google_cse_id || null, search_url || null, sort_order || 0).run();

  await invalidateKV(env, 'engines:active');
  return jsonResponse({ success: true }, 201);
}

async function handleUpdateEngine(id, request, env) {
  const body = await request.json();
  const fields = ['engine_name', 'google_cse_id', 'search_url', 'sort_order', 'status'];
  const updates = Object.keys(body).filter(k => fields.includes(k));
  if (!updates.length) return jsonResponse({ error: 'Sin campos válidos' }, 400);

  const setClauses = updates.map(f => `${f} = ?`).join(', ');
  await env.DB.prepare(`UPDATE search_engines SET ${setClauses} WHERE engine_id = ?`)
    .bind(...updates.map(f => body[f]), id).run();

  await invalidateKV(env, 'engines:active');
  return jsonResponse({ success: true });
}

async function handleSetDefaultEngine(id, env) {
  await env.DB.prepare('UPDATE search_engines SET is_default = 0').run();
  await env.DB.prepare('UPDATE search_engines SET is_default = 1 WHERE engine_id = ?').bind(id).run();
  await invalidateKV(env, 'engines:active');
  return jsonResponse({ success: true });
}

// ── ADS ──────────────────────────────────────────────────────
async function handleListAds(env) {
  const { results } = await env.DB.prepare('SELECT * FROM advertisements ORDER BY created_at DESC').all();
  return jsonResponse(results);
}

async function handleCreateAd(request, env) {
  const body = await request.json();
  const { ad_name, formato, network_source, script_code_or_html, impresiones_compradas, geo_targeting, device_targeting, priority } = body;
  if (!ad_name || !formato) return jsonResponse({ error: 'Nombre y formato requeridos' }, 400);

  await env.DB.prepare(`
    INSERT INTO advertisements (ad_name, formato, network_source, script_code_or_html, impresiones_compradas, geo_targeting, device_targeting, priority)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(ad_name, formato, network_source || 'AdSense', script_code_or_html || '', impresiones_compradas || 0,
    JSON.stringify(geo_targeting || []), device_targeting || 'all', priority || 5).run();

  return jsonResponse({ success: true }, 201);
}

async function handleUpdateAd(id, request, env) {
  const body = await request.json();
  const fields = ['ad_name', 'script_code_or_html', 'impresiones_compradas', 'geo_targeting', 'device_targeting', 'is_active', 'priority'];
  const updates = Object.keys(body).filter(k => fields.includes(k));
  if (!updates.length) return jsonResponse({ error: 'Sin campos válidos' }, 400);

  const setClauses = updates.map(f => `${f} = ?`).join(', ');
  await env.DB.prepare(`UPDATE advertisements SET ${setClauses} WHERE ad_id = ?`)
    .bind(...updates.map(f => body[f]), id).run();

  return jsonResponse({ success: true });
}

// ── SEO ──────────────────────────────────────────────────────
async function handleGetSEO(categoryId, env) {
  const seo = await env.DB.prepare('SELECT * FROM seo_metadata WHERE category_id = ?').bind(categoryId).first();
  return jsonResponse(seo || { category_id: categoryId });
}

async function handleUpdateSEO(categoryId, request, env) {
  const body = await request.json();
  const { og_title, og_description, og_image_url, meta_keywords, canonical_url } = body;

  await env.DB.prepare(`
    INSERT INTO seo_metadata (category_id, og_title, og_description, og_image_url, meta_keywords, canonical_url, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(category_id) DO UPDATE SET
      og_title = excluded.og_title,
      og_description = excluded.og_description,
      og_image_url = excluded.og_image_url,
      meta_keywords = excluded.meta_keywords,
      canonical_url = excluded.canonical_url,
      updated_at = CURRENT_TIMESTAMP
  `).bind(categoryId, og_title, og_description, og_image_url, meta_keywords, canonical_url).run();

  await invalidateKV(env, `seo:${categoryId}`);
  return jsonResponse({ success: true });
}

// ── USERS ────────────────────────────────────────────────────
async function handleListUsers(url, env) {
  const page = parseInt(url.searchParams.get('page') || '0');
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

  const { results } = await env.DB.prepare(`
    SELECT u.user_id, u.email, u.display_name, u.avatar_url, u.status, u.created_at,
           r.role_name
    FROM users u LEFT JOIN roles r ON u.role_id = r.role_id
    ORDER BY u.created_at DESC LIMIT ? OFFSET ?
  `).bind(limit, page * limit).all();

  const countRes = await env.DB.prepare('SELECT COUNT(*) as total FROM users').first();
  return jsonResponse({ users: results, total: countRes?.total || 0, page });
}

async function handleUpdateUserRole(id, request, env) {
  const { role_name } = await request.json();
  const role = await env.DB.prepare('SELECT role_id FROM roles WHERE role_name = ?').bind(role_name).first();
  if (!role) return jsonResponse({ error: 'Rol inválido' }, 400);

  await env.DB.prepare('UPDATE users SET role_id = ? WHERE user_id = ?').bind(role.role_id, id).run();
  return jsonResponse({ success: true });
}

async function handleUpdateUserStatus(id, request, env) {
  const { status } = await request.json();
  if (!['activo', 'suspendido', 'pendiente'].includes(status)) return jsonResponse({ error: 'Estado inválido' }, 400);
  await env.DB.prepare('UPDATE users SET status = ? WHERE user_id = ?').bind(status, id).run();
  return jsonResponse({ success: true });
}

// ── MODULES ──────────────────────────────────────────────────
async function handleListModules(env) {
  const { results } = await env.DB.prepare('SELECT * FROM system_modules ORDER BY created_at DESC').all();
  return jsonResponse(results);
}

async function handleCreateModule(request, env, auth) {
  const body = await request.json();
  const { module_name, module_slug, sidebar_icon, schema_patch, ui_component_json, routes_config } = body;

  if (!module_name || !module_slug) return jsonResponse({ error: 'Nombre y slug requeridos' }, 400);
  if (!/^[a-z0-9_-]+$/.test(module_slug)) return jsonResponse({ error: 'Slug inválido (solo a-z, 0-9, -, _)' }, 400);

  if (schema_patch) {
    try {
      await applyModuleSchemaPatch(env, module_slug, schema_patch);
    } catch (err) {
      return jsonResponse({ error: `Error en schema: ${err.message}` }, 400);
    }
  }

  await env.DB.prepare(`
    INSERT INTO system_modules (module_name, module_slug, sidebar_icon, schema_patch, ui_component_json, routes_config, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(module_name, module_slug, sidebar_icon || '🧩', schema_patch || null,
    typeof ui_component_json === 'object' ? JSON.stringify(ui_component_json) : ui_component_json,
    typeof routes_config === 'object' ? JSON.stringify(routes_config) : routes_config,
    auth.user_id).run();

  await invalidateKV(env, 'modules:active');
  return jsonResponse({ success: true, message: `Módulo '${module_name}' creado exitosamente` }, 201);
}

// ── HARVESTER KEYWORDS ───────────────────────────────────────
async function handleListKeywords(env) {
  const { results } = await env.DB.prepare(`
    SELECT ak.*, c.name_es as category_name
    FROM ai_harvest_keywords ak
    LEFT JOIN categories c ON ak.category_id = c.category_id
    ORDER BY ak.created_at DESC
  `).all();
  return jsonResponse(results);
}

async function handleCreateKeyword(request, env, auth) {
  const { keyword, category_id } = await request.json();
  if (!keyword || !category_id) return jsonResponse({ error: 'Keyword y categoría requeridos' }, 400);

  await env.DB.prepare(`
    INSERT INTO ai_harvest_keywords (keyword, category_id, created_by)
    VALUES (?, ?, ?)
  `).bind(sanitizeInput(keyword), category_id, auth.user_id).run();

  return jsonResponse({ success: true }, 201);
}

async function handleUpdateKeyword(id, request, env) {
  const { is_active } = await request.json();
  await env.DB.prepare('UPDATE ai_harvest_keywords SET is_active = ? WHERE harvest_id = ?').bind(is_active ? 1 : 0, id).run();
  return jsonResponse({ success: true });
}

async function handleDeleteKeyword(id, env) {
  await env.DB.prepare('DELETE FROM ai_harvest_keywords WHERE harvest_id = ?').bind(id).run();
  return jsonResponse({ success: true });
}
