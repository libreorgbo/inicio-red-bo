/* harvester.js - AI Link Harvester (Scheduled Worker) - inicio.red.bo */

const CATEGORY_KEYWORDS = {
  noticias: ['noticias', 'news', 'periodico', 'prensa', 'diario', 'actualidad', 'informacion'],
  gobierno: ['gobierno', 'ministerio', 'estado', 'gob', 'municipio', 'alcaldia', 'senado', 'asamblea'],
  educacion: ['universidad', 'educacion', 'escuela', 'colegio', 'academico', 'umsa', 'uagrm', 'udabol'],
  salud: ['salud', 'hospital', 'medico', 'clinica', 'farmacia', 'medicina', 'sedes'],
  tecnologia: ['tecnologia', 'tech', 'software', 'internet', 'digital', 'telecom', 'entel', 'tigo', 'viva'],
  negocios: ['banco', 'finanzas', 'empresa', 'comercio', 'negocio', 'economia', 'mercado', 'bolsa'],
  deportes: ['deporte', 'futbol', 'sport', 'atletismo', 'olimpico', 'liga', 'campeonato'],
  entretenimiento: ['entretenimiento', 'musica', 'cine', 'pelicula', 'arte', 'cultura', 'teatro', 'television']
};

const DEFAULT_SOURCES = [
  'https://eldeber.com.bo',
  'https://lostiempos.com',
  'https://paginasiete.bo',
  'https://erbol.com.bo',
  'https://correodelsur.com',
  'https://opinion.com.bo',
  'https://larazon.com'
];

// ── Normalize & hash URL ──────────────────────────
async function hashURL(url) {
  const normalized = url.toLowerCase()
    .replace(/\/$/, '')
    .replace(/^https?:\/\/(www\.)?/, '');
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Fetch page metadata ───────────────────────────
async function fetchMeta(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'inicio.red.bo-harvester/1.0' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return null;
    const html = await r.text();

    const getTag = (pattern) => {
      const m = html.match(pattern);
      return m ? m[1].trim().replace(/&amp;/g, '&').replace(/&quot;/g, '"').substring(0, 255) : null;
    };

    const title = getTag(/<title[^>]*>([^<]+)<\/title>/i)
      || getTag(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i)
      || getTag(/<meta[^>]*content="([^"]+)"[^>]*property="og:title"/i);

    const description = getTag(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i)
      || getTag(/<meta[^>]*content="([^"]+)"[^>]*name="description"/i)
      || getTag(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i);

    const canonical = getTag(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i) || url;

    const domain = new URL(url).hostname.replace(/^www\./, '');
    const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

    return { title, description, url: canonical, domain, favicon };
  } catch (e) {
    console.warn('[Harvester] fetch error:', url, e.message);
    return null;
  }
}

// ── Categorize by keywords ────────────────────────
function categorize(meta) {
  const text = `${meta.title || ''} ${meta.description || ''} ${meta.domain || ''}`.toLowerCase();
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    if (kws.some(kw => text.includes(kw))) return cat;
  }
  return 'general';
}

// ── Save link to D1 ───────────────────────────────
async function saveLink(env, meta, hash) {
  const category = categorize(meta);
  try {
    await env.DB.prepare(`
      INSERT INTO links (title, url, domain, description, category, favicon, status)
      VALUES (?, ?, ?, ?, ?, ?, 'pending')
      ON CONFLICT(url) DO NOTHING
    `).bind(
      meta.title || meta.domain,
      meta.url,
      meta.domain,
      meta.description || '',
      category,
      meta.favicon || ''
    ).run();
    await env.INICIO_KV.put(`url_hash:${hash}`, '1', { expirationTtl: 86400 * 30 });
    return true;
  } catch (e) {
    console.warn('[Harvester] save error:', meta.url, e.message);
    return false;
  }
}

// ── Main harvester logic ──────────────────────────
export async function runHarvester(env) {
  console.log('[Harvester] starting run', new Date().toISOString());

  // Load sources from KV or use defaults
  let sources = DEFAULT_SOURCES;
  try {
    const kvSources = await env.INICIO_KV.get('harvester:sources', 'json');
    if (Array.isArray(kvSources) && kvSources.length) sources = kvSources;
  } catch {}

  let newCount = 0;
  const results = [];

  for (const src of sources) {
    const hash = await hashURL(src);

    // Skip recently harvested
    const seen = await env.INICIO_KV.get(`url_hash:${hash}`);
    if (seen) continue;

    const meta = await fetchMeta(src);
    if (!meta || !meta.title) continue;

    const saved = await saveLink(env, meta, hash);
    if (saved) {
      newCount++;
      results.push({ url: src, title: meta.title, category: categorize(meta) });
    }

    // Small delay to be polite
    await new Promise(r => setTimeout(r, 500));
  }

  // Update last-run timestamp in KV
  await env.INICIO_KV.put('harvester:last_run', new Date().toISOString());
  await env.INICIO_KV.put('harvester:last_count', String(newCount));

  if (newCount > 10) {
    console.log(`[Harvester] ALERT: ${newCount} new links found!`, JSON.stringify(results.slice(0, 5)));
  }

  console.log(`[Harvester] complete. New links: ${newCount}`);
  return { newCount, results };
}
