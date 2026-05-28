/**
 * ai-harvester.js — Motor de harvesting automático de enlaces
 * Cron: 0 4 * * * (4AM UTC = medianoche Bolivia GMT-4)
 */

export async function runAIHarvester(env) {
  const log = (msg) => console.log(`[AIHarvester ${new Date().toISOString()}] ${msg}`);
  log('Iniciando ciclo de harvest...');

  let keywords = [];
  try {
    const { results } = await env.DB.prepare(`
      SELECT ak.keyword, ak.harvest_id, c.category_id, c.slug as category_slug, c.name_es
      FROM ai_harvest_keywords ak
      JOIN categories c ON ak.category_id = c.category_id
      WHERE ak.is_active = 1
      ORDER BY ak.last_harvested_at ASC NULLS FIRST
      LIMIT 5
    `).all();
    keywords = results;
  } catch (err) {
    log(`Error obteniendo keywords: ${err.message}`);
    return;
  }

  if (!keywords.length) { log('No hay keywords activas'); return; }

  const discovered = [];

  for (const kw of keywords) {
    log(`Buscando: "${kw.keyword}" → categoría: ${kw.category_slug}`);
    try {
      const cseUrl = `https://customsearch.googleapis.com/customsearch/v1?` +
        `key=${env.GOOGLE_CSE_API_KEY}&cx=${env.HARVESTER_CSE_ID}` +
        `&q=${encodeURIComponent(kw.keyword + ' herramienta plataforma web app')}` +
        `&num=10&gl=bo&lr=lang_es`;

      const cseRes = await fetch(cseUrl);
      const cseData = await cseRes.json();

      if (cseData.items) {
        for (const item of cseData.items) {
          discovered.push({
            keyword: kw.keyword,
            category_id: kw.category_id,
            category_name: kw.name_es,
            raw_title: item.title,
            raw_url: item.link,
            raw_snippet: item.snippet,
            display_link: item.displayLink
          });
        }
      }

      await new Promise(r => setTimeout(r, 500));

      await env.DB.prepare(
        'UPDATE ai_harvest_keywords SET last_harvested_at = CURRENT_TIMESTAMP WHERE harvest_id = ?'
      ).bind(kw.harvest_id).run();
    } catch (err) {
      log(`Error en CSE para "${kw.keyword}": ${err.message}`);
    }
  }

  log(`Descubiertos ${discovered.length} enlaces candidatos`);

  const unique = [];
  for (const item of discovered) {
    try {
      const domain = new URL(item.raw_url).hostname.replace('www.', '');
      const exists = await env.DB.prepare(
        'SELECT 1 FROM links WHERE url_final LIKE ? LIMIT 1'
      ).bind(`%${domain}%`).first();
      if (!exists) unique.push({ ...item, clean_domain: domain });
    } catch {}
  }
  log(`${unique.length} candidatos únicos (filtrados duplicados)`);

  if (!unique.length) { log('No hay nuevos candidatos'); return; }

  const batchSize = 10;
  const processed = [];

  for (let i = 0; i < unique.length; i += batchSize) {
    const batch = unique.slice(i, i + batchSize);
    const batchProcessed = await processWithLLM(batch, env);
    processed.push(...batchProcessed);
    await new Promise(r => setTimeout(r, 1000));
  }

  const valid = [];
  for (const item of processed) {
    try {
      const checkRes = await fetch(item.url_base_limpia, {
        method: 'HEAD',
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; redbo-harvester/1.0)' },
        signal: AbortSignal.timeout(5000)
      });
      if ([200, 301, 302].includes(checkRes.status)) {
        valid.push(item);
      } else {
        log(`Descartado (HTTP ${checkRes.status}): ${item.url_base_limpia}`);
      }
    } catch {
      log(`Descartado (timeout/error): ${item.url_base_limpia}`);
    }
  }

  log(`${valid.length} enlaces válidos tras validación HTTP`);

  let inserted = 0;
  for (const item of valid) {
    try {
      await env.DB.prepare(`
        INSERT OR IGNORE INTO links
          (category_id, titulo, url_final, descripcion_tooltip, is_approved, origen)
        VALUES (?, ?, ?, ?, 0, 'AI_Harvester')
      `).bind(item.category_id, item.titulo_limpio, item.url_base_limpia, item.descripcion_corta_tooltip).run();
      inserted++;
    } catch {}
  }

  log(`✅ Harvest completado: ${inserted} enlaces insertados en cola de revisión`);
}

async function processWithLLM(batch, env) {
  const prompt = `Analiza estos resultados de búsqueda web y extrae información limpia.
Para cada resultado, devuelve un objeto JSON con exactamente estas claves:
- "titulo_limpio": nombre de la aplicación/plataforma (máx 60 chars)
- "url_base_limpia": solo la URL base del sitio (ej: https://ejemplo.com)
- "descripcion_corta_tooltip": descripción concisa en español (máx 100 chars)
- "category_id": usa el category_id del contexto proporcionado

Descarta: artículos de blog, listicles, páginas de resultados, dominios parkeados, páginas de error.

Datos:
${JSON.stringify(batch.map(b => ({
    category_id: b.category_id,
    raw_title: b.raw_title,
    raw_url: b.raw_url,
    raw_snippet: b.raw_snippet
  })))}

Responde SOLO con un array JSON válido. Sin texto adicional.`;

  const apiKey = env.OPENAI_API_KEY || env.GEMINI_API_KEY;
  if (!apiKey) return [];

  const useGemini = !env.OPENAI_API_KEY;
  let result = [];

  try {
    if (useGemini) {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
        }
      );
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
      result = JSON.parse(text.replace(/```json?|```/g, '').trim());
    } else {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,
          max_tokens: 2000
        })
      });
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '[]';
      result = JSON.parse(text.replace(/```json?|```/g, '').trim());
    }
  } catch (err) {
    console.error('[LLM Error]', err.message);
  }

  return Array.isArray(result) ? result : [];
}
