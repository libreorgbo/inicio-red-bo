/**
 * worker.js — Edge Router principal para inicio.red.bo
 * Cloudflare Workers ES Module
 */

import { handleAdminRoute } from './routes/admin.js';
import { selectAd } from './lib/ad-engine.js';
import { runAIHarvester } from './lib/ai-harvester.js';
import {
  verifyJWT, signJWT, buildGoogleAuthURL,
  exchangeGoogleCode, getGoogleUserInfo,
  sanitizeInput, sanitizeURL, unauthorizedResponse
} from './lib/auth.js';
import { handleDynamicModule } from './lib/module-engine.js';

// ─────────────────────────────────────────────────────────────
// MAIN FETCH HANDLER
// ─────────────────────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') return corsResponse(null, 204);

    try {
      // Static assets served by Cloudflare Assets binding (public/)
      // API routes
      if (pathname === '/' || pathname === '/index.html') return handleHomePage(request, env);
      if (pathname.startsWith('/r/')) return handleRedirect(request, env, ctx, pathname.slice(3));
      if (pathname === '/api/search') return handleSearch(request, env);
      if (pathname === '/api/categories') return handleCategories(request, env);
      if (pathname === '/api/engines') return handleEngines(request, env);
      if (pathname === '/api/analytics') return handleAnalytics(request, env, ctx);
      if (pathname === '/api/ads/next') return handleAdsNext(request, env);
      if (pathname === '/api/submit-link' && method === 'POST') return handleSubmitLink(request, env);
      if (pathname === '/api/auth/me') return handleAuthMe(request, env);
      if (pathname === '/auth/google') return handleGoogleAuth(request, env);
      if (pathname === '/auth/callback') return handleGoogleCallback(request, env, ctx);
      if (pathname === '/auth/logout') return handleLogout(request, env);
      if (pathname === '/admin' || pathname.startsWith('/admin/') || pathname === '/dashboard' || pathname.startsWith('/dashboard/')) return handleDashboard(request, env);
      if (pathname.startsWith('/api/admin/')) return handleAdminRoute(request, env, ctx);
      if (pathname.startsWith('/api/modules/')) return handleDynamicModule(request, env, ctx, pathname.slice(12));

      // Fallback — let Workers Assets handle static files
      return new Response('Not Found', { status: 404 });
    } catch (err) {
      console.error('[worker] unhandled error:', err);
      return jsonResponse({ error: 'Internal Server Error' }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runAIHarvester(env));
  }
};

// ─────────────────────────────────────────────────────────────
// PAGE HANDLERS
// ─────────────────────────────────────────────────────────────
async function handleHomePage(request, env) {
  const url = new URL(request.url);
  const catSlug = url.searchParams.get('cat') || '';

  let metaTitle = 'inicio.red.bo — Directorio Digital Bolivia';
  let metaDesc = 'Directorio de enlaces curado para Bolivia y Latinoamérica. Búsqueda, noticias, gobierno, educación y más.';
  let metaImage = 'https://inicio.red.bo/assets/og-cover.webp';

  if (catSlug && env.KV_CACHE) {
    try {
      const seo = await env.KV_CACHE.get(`seo:${catSlug}`, { type: 'json' });
      if (seo) {
        metaTitle = seo.og_title || metaTitle;
        metaDesc = seo.og_description || metaDesc;
        metaImage = seo.og_image_url || metaImage;
      }
    } catch (_) { /* ignore */ }
  }

  // Serve index.html with injected SEO meta tags
  const html = buildIndexHTML({ metaTitle, metaDesc, metaImage });
  return new Response(html, {
    headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'public,max-age=60' }
  });
}

async function handleDashboard(request, env) {
  const base = new URL(request.url).origin;
  const auth = await verifyJWT(request, env);
  if (!auth) return Response.redirect(`${base}/auth/google`, 302);
  if (!['admin', 'super_admin'].includes(auth.role)) return unauthorizedResponse();

  // Serve dashboard.html from assets
  return Response.redirect(`${base}/dashboard.html`, 302);
}

// ─────────────────────────────────────────────────────────────
// REDIRECT HANDLER
// ─────────────────────────────────────────────────────────────
async function handleRedirect(request, env, ctx, hash) {
  if (!hash) return new Response('Not Found', { status: 404 });

  // KV cache first
  let linkData = null;
  const cacheKey = `redirect:${hash}`;
  if (env.KV_CACHE) {
    linkData = await env.KV_CACHE.get(cacheKey, { type: 'json' });
  }

  if (!linkData && env.DB) {
    const row = await env.DB.prepare(
      'SELECT link_id, url_final, redirect_type, interstitial_secs, is_deep_link FROM links WHERE hash_custom=? AND is_approved=1 LIMIT 1'
    ).bind(hash).first();
    if (row) {
      linkData = row;
      if (env.KV_CACHE) {
        ctx.waitUntil(env.KV_CACHE.put(cacheKey, JSON.stringify(row), { expirationTtl: 600 }));
      }
    }
  }

  if (!linkData) return new Response('Link not found', { status: 404 });

  // Async click tracking
  ctx.waitUntil(trackClick(env, linkData.link_id, request));

  const url = buildAffiliateURL(linkData.url_final, env.OWNER_AFFILIATE_TAG);

  // Handle redirect types
  if (linkData.redirect_type === 'interstitial_5s') {
    const html = buildInterstitialHTML(url, linkData.interstitial_secs || 5);
    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }

  if (linkData.redirect_type === 'pop_under') {
    const html = buildPopUnderHTML(url);
    return new Response(html, { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
  }

  // Direct redirect
  const target = linkData.is_deep_link ? url : url;
  return Response.redirect(target, 302);
}

// ─────────────────────────────────────────────────────────────
// SEARCH HANDLER
// ─────────────────────────────────────────────────────────────
async function handleSearch(request, env) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') || '';
  const engineSlug = url.searchParams.get('engine') || 'web';
  const start = parseInt(url.searchParams.get('start') || '1');

  if (!q) return jsonResponse({ items: [], total: 0 });

  // Get engine config from D1
  let engine = null;
  if (env.DB) {
    engine = await env.DB.prepare(
      'SELECT engine_id, engine_name, engine_slug, google_cse_id, search_url FROM search_engines WHERE engine_slug=? AND status="activo" LIMIT 1'
    ).bind(engineSlug).first();
  }

  const cseId = engine?.google_cse_id || env.GOOGLE_CSE_ID_DEFAULT || '';
  const apiKey = env.GOOGLE_CSE_API_KEY || '';

  if (!cseId || !apiKey) {
    return jsonResponse({ items: [], total: 0, error: 'Search not configured', engineSlug });
  }

  try {
    const searchURL = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cseId}&q=${encodeURIComponent(q)}&start=${start}&num=10`;
    const res = await fetch(searchURL);
    const data = await res.json();
    return jsonResponse({
      items: (data.items || []).map(item => ({
        title: item.title,
        link: item.link,
        snippet: item.snippet,
        displayLink: item.displayLink,
        favicon: `https://www.google.com/s2/favicons?sz=32&domain=${item.displayLink}`
      })),
      total: parseInt(data.searchInformation?.totalResults || '0'),
      engineSlug
    });
  } catch (err) {
    return jsonResponse({ items: [], total: 0, error: err.message }, 500);
  }
}

// ─────────────────────────────────────────────────────────────
// CATEGORIES HANDLER
// ─────────────────────────────────────────────────────────────
async function handleCategories(request, env) {
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get('page') || '0');
  const catId = url.searchParams.get('id');

  const cacheKey = catId ? `cat:${catId}:${page}` : `cats:all:${page}`;

  // KV cache for page 0
  if (page === 0 && env.KV_CACHE) {
    const cached = await env.KV_CACHE.get(cacheKey, { type: 'json' });
    if (cached) return jsonResponse(cached, 200, { 'X-Cache': 'HIT' });
  }

  if (!env.DB) return jsonResponse({ categories: [], links: [] });

  const PAGE_SIZE = 10;
  const offset = page * PAGE_SIZE;

  const catsResult = await env.DB.prepare(
    `SELECT c.category_id, c.slug, c.name_es, c.color_hex, c.icon_default, c.sort_order,
     m.name_es as macro_name, m.slug as macro_slug
     FROM categories c
     LEFT JOIN macro_categories m ON c.macro_id = m.macro_id
     WHERE c.status='activo'
     ORDER BY c.sort_order ASC, c.category_id ASC
     LIMIT ? OFFSET ?`
  ).bind(PAGE_SIZE, offset).all();

  const categories = catsResult.results || [];

  // Get links for each category if page 0
  if (page === 0 && categories.length > 0) {
    const catIds = categories.map(c => c.category_id);
    const placeholders = catIds.map(() => '?').join(',');
    const linksResult = await env.DB.prepare(
      `SELECT l.link_id, l.hash_custom, l.category_id, l.titulo, l.url_final,
       l.descripcion_tooltip, l.favicon_url, l.total_clicks, l.sort_order
       FROM links l
       WHERE l.category_id IN (${placeholders}) AND l.is_approved=1
       ORDER BY l.sort_order ASC, l.link_id ASC
       LIMIT 100`
    ).bind(...catIds).all();

    const linksByCategory = {};
    for (const link of (linksResult.results || [])) {
      if (!linksByCategory[link.category_id]) linksByCategory[link.category_id] = [];
      linksByCategory[link.category_id].push(link);
    }

    const response = { categories: categories.map(c => ({ ...c, links: linksByCategory[c.category_id] || [] })), page };

    if (env.KV_CACHE) {
      await env.KV_CACHE.put(cacheKey, JSON.stringify(response), { expirationTtl: 300 });
    }
    return jsonResponse(response);
  }

  return jsonResponse({ categories, page });
}

// ─────────────────────────────────────────────────────────────
// ENGINES HANDLER
// ─────────────────────────────────────────────────────────────
async function handleEngines(request, env) {
  if (env.KV_CACHE) {
    const cached = await env.KV_CACHE.get('engines:active', { type: 'json' });
    if (cached) return jsonResponse(cached, 200, { 'X-Cache': 'HIT' });
  }

  if (!env.DB) return jsonResponse({ engines: [] });

  const result = await env.DB.prepare(
    'SELECT engine_id, engine_name, engine_slug, google_cse_id, is_default, sort_order FROM search_engines WHERE status="activo" ORDER BY sort_order ASC'
  ).all();

  const response = { engines: result.results || [] };

  if (env.KV_CACHE) {
    await env.KV_CACHE.put('engines:active', JSON.stringify(response), { expirationTtl: 1800 });
  }

  return jsonResponse(response);
}

// ─────────────────────────────────────────────────────────────
// ANALYTICS HANDLER
// ─────────────────────────────────────────────────────────────
async function handleAnalytics(request, env, ctx) {
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405);

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const { event_type, link_id, ad_id } = body;
  if (!event_type) return jsonResponse({ error: 'event_type required' }, 400);

  ctx.waitUntil((async () => {
    if (!env.DB) return;
    const country = request.cf?.country || null;
    const deviceType = getDeviceType(request);
    const ipHash = await hashIP(request.headers.get('CF-Connecting-IP') || '');
    const referrer = request.headers.get('Referer') || null;

    await env.DB.prepare(
      'INSERT INTO analytics_events (event_type, link_id, ad_id, country, device_type, ip_hash, referrer) VALUES (?,?,?,?,?,?,?)'
    ).bind(event_type, link_id || null, ad_id || null, country, deviceType, ipHash, referrer).run();
  })());

  return jsonResponse({ ok: true });
}

// ─────────────────────────────────────────────────────────────
// ADS HANDLER
// ─────────────────────────────────────────────────────────────
async function handleAdsNext(request, env) {
  const country = request.cf?.country || 'BO';
  const device = getDeviceType(request);
  const ad = await selectAd(env, country, device);
  if (!ad) return jsonResponse({ ad: null });
  return jsonResponse({ ad });
}

// ─────────────────────────────────────────────────────────────
// AUTH HANDLERS
// ─────────────────────────────────────────────────────────────
async function handleAuthMe(request, env) {
  const auth = await verifyJWT(request, env);
  if (!auth) return jsonResponse({ user: null }, 200);
  return jsonResponse({ user: { user_id: auth.user_id, email: auth.email, display_name: auth.display_name, avatar_url: auth.avatar_url, role: auth.role } });
}

async function handleGoogleAuth(request, env) {
  const state = crypto.randomUUID();
  const authURL = buildGoogleAuthURL(env, state);
  // Store state in cookie for CSRF verification
  return new Response(null, {
    status: 302,
    headers: {
      'Location': authURL,
      'Set-Cookie': `oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=600`
    }
  });
}

async function handleGoogleCallback(request, env, ctx) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');

  if (!code) return new Response('Authorization code missing', { status: 400 });

  try {
    const tokenData = await exchangeGoogleCode(code, env);
    const userInfo = await getGoogleUserInfo(tokenData.access_token);

    if (!userInfo?.email) return new Response('Failed to get user info', { status: 400 });

    let user = null;
    if (env.DB) {
      // Upsert user
      await env.DB.prepare(
        `INSERT INTO users (google_id, email, display_name, avatar_url, status) VALUES (?,?,?,?,'activo')
         ON CONFLICT(email) DO UPDATE SET google_id=excluded.google_id, display_name=excluded.display_name, avatar_url=excluded.avatar_url, updated_at=CURRENT_TIMESTAMP`
      ).bind(userInfo.sub, userInfo.email, userInfo.name, userInfo.picture).run();

      user = await env.DB.prepare(
        'SELECT u.user_id, u.email, u.display_name, u.avatar_url, r.role_name FROM users u JOIN roles r ON u.role_id=r.role_id WHERE u.email=? LIMIT 1'
      ).bind(userInfo.email).first();
    }

    if (!user) {
      user = { user_id: 0, email: userInfo.email, display_name: userInfo.name, avatar_url: userInfo.picture, role_name: 'usuario' };
    }

    const jwt = await signJWT({ user_id: user.user_id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url, role: user.role_name }, env.JWT_SECRET || 'dev-secret');

    const base = new URL(request.url).origin;
    return new Response(null, {
      status: 302,
      headers: {
        'Location': `${base}/`,
        'Set-Cookie': `auth_token=${jwt}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`
      }
    });
  } catch (err) {
    console.error('[auth] callback error:', err);
    return new Response('Authentication failed', { status: 500 });
  }
}

async function handleLogout(request, env) {
  const base = new URL(request.url).origin;
  return new Response(null, {
    status: 302,
    headers: {
      'Location': `${base}/`,
      'Set-Cookie': 'auth_token=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
    }
  });
}

// ─────────────────────────────────────────────────────────────
// SUBMIT LINK HANDLER
// ─────────────────────────────────────────────────────────────
async function handleSubmitLink(request, env) {
  const auth = await verifyJWT(request, env);
  if (!auth) return unauthorizedResponse();

  let body;
  try { body = await request.json(); } catch { return jsonResponse({ error: 'Invalid JSON' }, 400); }

  const titulo = sanitizeInput(body.titulo, 200);
  const url_final = sanitizeURL(body.url_final);
  const categoria_id = parseInt(body.category_id) || 0;
  const descripcion = sanitizeInput(body.descripcion || '', 500);

  if (!titulo || !url_final || !categoria_id) {
    return jsonResponse({ error: 'titulo, url_final y category_id son requeridos' }, 400);
  }

  if (!env.DB) return jsonResponse({ error: 'Database not available' }, 503);

  await env.DB.prepare(
    'INSERT INTO links (category_id, user_id, titulo, url_final, descripcion_tooltip, is_approved, origen) VALUES (?,?,?,?,?,0,"user_submit")'
  ).bind(categoria_id, auth.user_id, titulo, url_final, descripcion).run();

  return jsonResponse({ ok: true, message: 'Link enviado para moderación' }, 201);
}

// ─────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────
export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders
    }
  });
}

export function corsResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}

export function buildAffiliateURL(url, ownerTag) {
  if (!ownerTag) return url;
  try {
    const u = new URL(url);
    u.searchParams.set('ref', ownerTag);
    return u.toString();
  } catch { return url; }
}

export async function trackClick(env, linkId, request) {
  if (!env.DB || !linkId) return;
  try {
    await env.DB.prepare('UPDATE links SET total_clicks=total_clicks+1, updated_at=CURRENT_TIMESTAMP WHERE link_id=?').bind(linkId).run();
    const country = request.cf?.country || null;
    const device = getDeviceType(request);
    const ipHash = await hashIP(request.headers.get('CF-Connecting-IP') || '');
    await env.DB.prepare(
      'INSERT INTO analytics_events (event_type, link_id, country, device_type, ip_hash) VALUES ("click",?,?,?,?)'
    ).bind(linkId, country, device, ipHash).run();
  } catch (err) {
    console.error('[trackClick] error:', err);
  }
}

export async function hashIP(ip) {
  if (!ip) return null;
  const msgBuf = new TextEncoder().encode(ip);
  const hashBuf = await crypto.subtle.digest('SHA-256', msgBuf);
  return Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
}

function getDeviceType(request) {
  const ua = request.headers.get('User-Agent') || '';
  if (/Mobile|Android|iPhone|iPad/.test(ua)) return 'mobile';
  return 'desktop';
}

// ─────────────────────────────────────────────────────────────
// HTML BUILDERS
// ─────────────────────────────────────────────────────────────
function buildIndexHTML({ metaTitle, metaDesc, metaImage }) {
  // In production, this would transform the public/index.html
  // For now, redirect to static asset
  return `<!DOCTYPE html>
<html lang="es" data-theme="dark">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta name="description" content="${escapeHTML(metaDesc)}"/>
<meta name="theme-color" content="#0a0a0f"/>
<meta property="og:title" content="${escapeHTML(metaTitle)}"/>
<meta property="og:description" content="${escapeHTML(metaDesc)}"/>
<meta property="og:image" content="${escapeHTML(metaImage)}"/>
<meta property="og:type" content="website"/>
<meta name="twitter:card" content="summary_large_image"/>
<link rel="manifest" href="/manifest.json"/>
<title>${escapeHTML(metaTitle)}</title>
<script>window.location.replace('/index.html'+(window.location.search||''));</script>
</head>
<body></body>
</html>`;
}

function buildInterstitialHTML(url, secs) {
  return `<!DOCTYPE html>
<html lang="es" data-theme="dark">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<meta http-equiv="refresh" content="${secs};url=${escapeHTML(url)}"/>
<title>Redirigiendo...</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0f;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center}
.container{text-align:center;max-width:480px;padding:2rem}
.countdown-ring{position:relative;width:120px;height:120px;margin:0 auto 2rem}
.countdown-ring svg{transform:rotate(-90deg)}
.countdown-ring circle{fill:none;stroke:#1a1a24;stroke-width:6}
.countdown-ring .progress{stroke:#6366f1;stroke-linecap:round;transition:stroke-dashoffset 1s linear}
.count-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:2.5rem;font-weight:700;color:#6366f1}
h2{font-size:1.25rem;margin-bottom:.5rem;color:rgba(255,255,255,.9)}
p{color:rgba(255,255,255,.5);font-size:.875rem;margin-bottom:2rem;word-break:break-all}
.btn{display:inline-flex;align-items:center;gap:.5rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;padding:.75rem 1.5rem;border-radius:12px;font-weight:600;font-size:1rem;transition:opacity .2s}
.btn:hover{opacity:.85}
.progress-bar{width:100%;height:3px;background:#1a1a24;border-radius:2px;margin-top:1.5rem;overflow:hidden}
.progress-fill{height:100%;background:linear-gradient(90deg,#6366f1,#8b5cf6);border-radius:2px;animation:fill ${secs}s linear forwards}
@keyframes fill{from{width:100%}to{width:0}}
</style>
</head>
<body>
<div class="container">
  <div class="countdown-ring">
    <svg width="120" height="120">
      <circle cx="60" cy="60" r="52"/>
      <circle class="progress" cx="60" cy="60" r="52" stroke-dasharray="${2 * Math.PI * 52}" stroke-dashoffset="0" id="ring"/>
    </svg>
    <div class="count-num" id="count">${secs}</div>
  </div>
  <h2>Serás redirigido en...</h2>
  <p>${escapeHTML(url)}</p>
  <a href="${escapeHTML(url)}" class="btn">Ir ahora →</a>
  <div class="progress-bar"><div class="progress-fill"></div></div>
</div>
<script>
let n=${secs};
const ring=document.getElementById('ring');
const count=document.getElementById('count');
const circ=${2 * Math.PI * 52};
const tick=setInterval(()=>{
  n--;
  count.textContent=n;
  ring.style.strokeDashoffset=circ*(1-n/${secs});
  if(n<=0){clearInterval(tick);window.location.href='${escapeJS(url)}';}
},1000);
</script>
</body>
</html>`;
}

function buildPopUnderHTML(url) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"/><title>Abriendo...</title>
<script>
window.open('${escapeJS(url)}','_blank');
window.close();
</script>
</head><body><p>Abriendo enlace...</p></body></html>`;
}

function escapeHTML(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escapeJS(str) {
  return String(str).replace(/'/g,"\\'").replace(/</g,'\\x3c');
}
