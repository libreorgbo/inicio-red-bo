/**
 * ad-engine.js — Motor publicitario rotativo
 * Algoritmo de posición: (fila * 2) % 5
 */

export function getAdPosition(rowNumber) {
  if (rowNumber < 2) return null;
  return (rowNumber * 2) % 5;
}

export function shouldInsertAd(rowNumber) {
  return rowNumber >= 2;
}

export async function selectAd(env, country, device) {
  const cacheKey = `ads:${country}:${device}`;

  try {
    const cached = await env.KV_CACHE.get(cacheKey, { type: 'json' });
    if (cached) return cached;
  } catch {}

  let ad = null;
  try {
    ad = await env.DB.prepare(`
      SELECT * FROM advertisements
      WHERE is_active = 1
        AND (device_targeting = ? OR device_targeting = 'all')
        AND impresiones_servidas < impresiones_compradas
      ORDER BY
        CASE WHEN geo_targeting LIKE '%"' || ? || '"%' THEN 0 ELSE 1 END,
        priority DESC,
        RANDOM()
      LIMIT 1
    `).bind(device, country).first();
  } catch {}

  const result = ad || {
    ad_id: null,
    network_source: 'AdSense',
    script_code_or_html: env.ADSENSE_DEFAULT_CODE || '<div class="ad-placeholder" style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--clr-text-muted);font-size:12px;">Publicidad</div>'
  };

  try {
    await env.KV_CACHE.put(cacheKey, JSON.stringify(result), { expirationTtl: 600 });
  } catch {}

  return result;
}
