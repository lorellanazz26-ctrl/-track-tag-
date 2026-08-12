// GET /api/read            -> devuelve todos los registros (uso interno del admin, contadores)
// GET /api/read?codigo=XXX -> devuelve los registros cuyo código contiene XXX (uso público)

const KV_KEY = 'records';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    }
  });
}

export async function onRequestGet(context) {
  const { env, request } = context;

  if (!env.INVENTORY_KV) {
    return jsonResponse({ error: 'Falta el binding KV "INVENTORY_KV" en Cloudflare Pages.' }, 500);
  }

  try {
    const url = new URL(request.url);
    const codigo = (url.searchParams.get('codigo') || '').trim().toLowerCase();

    const raw = await env.INVENTORY_KV.get(KV_KEY);
    const records = raw ? JSON.parse(raw) : [];

    if (!codigo) {
      // Sin filtro: se usa para contadores del panel admin.
      return jsonResponse({ records });
    }

    const filtered = records.filter(r =>
      String(r.codigo || '').toLowerCase().includes(codigo)
    );

    return jsonResponse({ records: filtered });
  } catch (err) {
    return jsonResponse({ error: 'Error al leer los registros: ' + err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
