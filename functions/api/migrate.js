// Migración única (solo administradores): saca las fotos de dentro de "records"
// y las guarda aparte. Todo el trabajo pesado lo hace el navegador.
//
//  GET  /api/migrate                -> devuelve el contenido crudo de "records" (sin procesarlo)
//  POST /api/migrate?id=<id>        -> guarda la foto (bytes de la imagen en el cuerpo)
//  POST /api/migrate?action=finish  -> recibe la lista liviana de registros, la valida y la guarda

import { verifyToken, getBearerToken, jsonResponse } from '../_lib/auth.js';
import { FOTO_PREFIX, fotoKey, validId } from '../_lib/fotos.js';

const KV_KEY = 'records';

async function requireAdmin(context) {
  const { env, request } = context;
  if (!env.INVENTORY_KV) return { error: jsonResponse({ error: 'Falta el binding KV.' }, 500) };
  if (!env.ADMIN_KEY) return { error: jsonResponse({ error: 'Falta ADMIN_KEY.' }, 500) };
  const session = await verifyToken(getBearerToken(request), env.ADMIN_KEY);
  if (!session) return { error: jsonResponse({ error: 'Sesión inválida o expirada.' }, 401) };
  if (session.r !== 'admin') return { error: jsonResponse({ error: 'Solo administradores.' }, 403) };
  return { session };
}

async function listFotoIds(kv) {
  const ids = new Set();
  let cursor;
  do {
    const page = await kv.list({ prefix: FOTO_PREFIX, cursor });
    for (const k of page.keys) ids.add(k.name.slice(FOTO_PREFIX.length));
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return ids;
}

export async function onRequestGet(context) {
  const auth = await requireAdmin(context);
  if (auth.error) return auth.error;
  const stream = await context.env.INVENTORY_KV.get(KV_KEY, 'stream');
  return new Response(stream || '[]', {
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

export async function onRequestPost(context) {
  const auth = await requireAdmin(context);
  if (auth.error) return auth.error;
  const { env, request } = context;
  const url = new URL(request.url);

  if (url.searchParams.get('action') === 'finish') {
    let records;
    try {
      records = JSON.parse(await request.text());
    } catch {
      return jsonResponse({ error: 'JSON inválido.' }, 400);
    }
    if (!Array.isArray(records)) return jsonResponse({ error: 'Se esperaba una lista de registros.' }, 400);
    if (records.some(r => r && r.imagen)) {
      return jsonResponse({ error: 'Todavía hay registros con la foto adentro.' }, 400);
    }
    const existing = await listFotoIds(env.INVENTORY_KV);
    const missing = records.filter(r => r.tieneFoto && !existing.has(r.id)).length;
    if (missing) return jsonResponse({ error: `Faltan ${missing} fotos por subir. Reintentá la migración.` }, 409);

    await env.INVENTORY_KV.put(KV_KEY, JSON.stringify(records));
    return jsonResponse({ ok: true, registros: records.length, fotos: existing.size });
  }

  const id = url.searchParams.get('id') || '';
  if (!validId(id)) return jsonResponse({ error: 'Id inválido.' }, 400);

  const already = await env.INVENTORY_KV.list({ prefix: fotoKey(id), limit: 1 });
  if (already.keys.some(k => k.name === fotoKey(id))) return jsonResponse({ ok: true, skipped: true });

  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return jsonResponse({ error: 'Foto vacía.' }, 400);
  if (bytes.byteLength > 5 * 1024 * 1024) return jsonResponse({ error: 'Foto demasiado pesada.' }, 413);
  const ct = (request.headers.get('Content-Type') || 'image/jpeg').split(';')[0];
  await env.INVENTORY_KV.put(fotoKey(id), bytes, { metadata: { ct } });
  return jsonResponse({ ok: true });
}
