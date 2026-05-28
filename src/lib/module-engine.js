/**
 * module-engine.js — Motor de plugins dinámicos
 * CRUD genérico sobre tablas module_{slug}
 */

export async function handleDynamicModule(request, env, ctx, path) {
  const url = new URL(request.url);
  const pathParts = path.split('/').filter(Boolean);
  const slug = pathParts[0];
  const recordId = pathParts[1];
  const method = request.method;

  if (slug === 'active') {
    const cacheKey = 'modules:active';
    try {
      const cached = await env.KV_CACHE.get(cacheKey, { type: 'json' });
      if (cached) return jsonResponse(cached);
    } catch {}

    const { results } = await env.DB.prepare(
      'SELECT module_id, module_name, module_slug, sidebar_icon, ui_component_json, routes_config FROM system_modules WHERE status = ?'
    ).bind('activo').all();

    try {
      await env.KV_CACHE.put(cacheKey, JSON.stringify(results), { expirationTtl: 300 });
    } catch {}

    return jsonResponse(results);
  }

  const module = await env.DB.prepare(
    'SELECT * FROM system_modules WHERE module_slug = ? AND status = ?'
  ).bind(slug, 'activo').first();

  if (!module) {
    return new Response(JSON.stringify({ error: `Módulo '${slug}' no encontrado` }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return executeDynamicCRUD(request, env, module, method, recordId);
}

async function executeDynamicCRUD(request, env, module, method, recordId) {
  const tableName = `module_${module.module_slug}`;

  try {
    switch (method) {
      case 'GET': {
        const url = new URL(request.url);
        const page = parseInt(url.searchParams.get('page') || '0');
        const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);

        if (recordId) {
          const record = await env.DB.prepare(`SELECT * FROM ${tableName} WHERE id = ?`).bind(recordId).first();
          return jsonResponse(record || {}, record ? 200 : 404);
        }

        const { results } = await env.DB.prepare(
          `SELECT * FROM ${tableName} ORDER BY id DESC LIMIT ? OFFSET ?`
        ).bind(limit, page * limit).all();

        const countRes = await env.DB.prepare(`SELECT COUNT(*) as total FROM ${tableName}`).first();
        return jsonResponse({ records: results, total: countRes?.total || 0, page });
      }

      case 'POST': {
        const body = await request.json();
        const ui = JSON.parse(module.ui_component_json || '{}');
        const fields = ui.form?.fields || [];
        const allowedFields = fields.map(f => f.name);
        const insertFields = allowedFields.filter(f => body[f] !== undefined);
        const placeholders = insertFields.map(() => '?').join(',');
        const values = insertFields.map(f => body[f]);

        await env.DB.prepare(
          `INSERT INTO ${tableName} (${insertFields.join(',')}, created_at) VALUES (${placeholders}, CURRENT_TIMESTAMP)`
        ).bind(...values).run();

        return jsonResponse({ success: true, message: 'Registro creado' }, 201);
      }

      case 'PUT': {
        if (!recordId) return jsonResponse({ error: 'ID requerido' }, 400);
        const body = await request.json();
        const ui = JSON.parse(module.ui_component_json || '{}');
        const allowedFields = (ui.form?.fields || []).map(f => f.name);
        const updateFields = Object.keys(body).filter(k => allowedFields.includes(k));
        if (!updateFields.length) return jsonResponse({ error: 'No hay campos válidos para actualizar' }, 400);

        const setClauses = updateFields.map(f => `${f} = ?`).join(', ');
        const values = [...updateFields.map(f => body[f]), recordId];

        await env.DB.prepare(
          `UPDATE ${tableName} SET ${setClauses}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
        ).bind(...values).run();

        return jsonResponse({ success: true });
      }

      case 'DELETE': {
        if (!recordId) return jsonResponse({ error: 'ID requerido' }, 400);
        await env.DB.prepare(`DELETE FROM ${tableName} WHERE id = ?`).bind(recordId).run();
        return jsonResponse({ success: true });
      }

      default:
        return new Response('Method Not Allowed', { status: 405 });
    }
  } catch (err) {
    return jsonResponse({ error: err.message }, 500);
  }
}

export async function applyModuleSchemaPatch(env, moduleSlug, schemaPatch) {
  const ALLOWED_PATTERNS = [
    /^CREATE TABLE IF NOT EXISTS\s+module_/i,
    /^CREATE INDEX IF NOT EXISTS/i
  ];

  const statements = schemaPatch.split(';').map(s => s.trim()).filter(Boolean);

  for (const stmt of statements) {
    const isAllowed = ALLOWED_PATTERNS.some(p => p.test(stmt));
    if (!isAllowed) throw new Error(`SQL no permitido en schema_patch: "${stmt.slice(0, 60)}..."`);
    await env.DB.prepare(stmt).run();
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
