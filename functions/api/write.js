// POST /api/write -> crea un nuevo registro. Requiere header X-Admin-Key.

const KV_KEY = 'records';
const MAX_BODY_BYTES = 8 * 1024 * 1024; // 8MB de margen (KV admite hasta 25MB por valor)

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

function uuid() {
  return (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
}

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.INVENTORY_KV) {
    return jsonResponse({ error: 'Falta el binding KV "INVENTORY_KV" en Cloudflare Pages.' }, 500);
  }
  if (!env.ADMIN_KEY) {
    return jsonResponse({ error: 'Falta la variable secreta ADMIN_KEY en Cloudflare Pages.' }, 500);
  }

  const providedKey = request.headers.get('X-Admin-Key') || '';
  if (providedKey !== env.ADMIN_KEY) {
    return jsonResponse({ error: 'Clave de administrador incorrecta.' }, 401);
  }

  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return jsonResponse({ error: 'La imagen es demasiado pesada. Probá con una foto más liviana.' }, 413);
    }
    body = JSON.parse(text);
  } catch (err) {
    return jsonResponse({ error: 'JSON inválido en la solicitud.' }, 400);
  }

  const codigo = String(body.codigo || '').trim();
  const codigoBarra = String(body.codigoBarra || '').trim();
  const ubicacionOrigen = String(body.ubicacionOrigen || '').trim();
  const ubicacionDestino = String(body.ubicacionDestino || '').trim();
  const descripcion = String(body.descripcion || '').trim();
  const cantidad = Number(body.cantidad);
  const cambiado = !!body.cambiado;
  const imagen = typeof body.imagen === 'string' && body.imagen.startsWith('data:image') ? body.imagen : null;

  if (!codigo) return jsonResponse({ error: 'El código es obligatorio.' }, 400);
  if (!ubicacionOrigen) return jsonResponse({ error: 'La ubicación de origen es obligatoria.' }, 400);
  if (!ubicacionDestino) return jsonResponse({ error: 'La ubicación de destino es obligatoria.' }, 400);
  if (!Number.isFinite(cantidad) || cantidad < 0) return jsonResponse({ error: 'La cantidad debe ser un número válido.' }, 400);

  try {
    const raw = await env.INVENTORY_KV.get(KV_KEY);
    const records = raw ? JSON.parse(raw) : [];

    const now = new Date().toISOString();
    const newRecord = {
      id: uuid(),
      codigo,
      codigoBarra: codigoBarra || null,
      ubicacionOrigen,
      ubicacionDestino,
      descripcion,
      cantidad,
      cambiado,
      fechaCambio: cambiado ? now : null,
      imagen,
      fecha: now
    };

    records.unshift(newRecord);
    await env.INVENTORY_KV.put(KV_KEY, JSON.stringify(records));

    return jsonResponse({ ok: true, record: newRecord }, 201);
  } catch (err) {
    return jsonResponse({ error: 'Error al guardar el registro: ' + err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key'
    }
  });
}
