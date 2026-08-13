// PATCH /api/update -> edita un registro existente (incluye cambiar el estado CAMBIADO).
// Requiere header X-Admin-Key.

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

export async function onRequestPatch(context) {
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
    body = JSON.parse(await request.text());
  } catch (err) {
    return jsonResponse({ error: 'JSON inválido en la solicitud.' }, 400);
  }

  const id = String(body.id || '').trim();
  const codigo = String(body.codigo || '').trim();
  const ubicacionOrigen = String(body.ubicacionOrigen || '').trim();
  const ubicacionDestino = String(body.ubicacionDestino || '').trim();
  const descripcion = String(body.descripcion || '').trim();
  const cantidad = Number(body.cantidad);
  const cambiado = !!body.cambiado;

  if (!id) return jsonResponse({ error: 'Falta el id del registro a editar.' }, 400);
  if (!codigo) return jsonResponse({ error: 'El código es obligatorio.' }, 400);
  if (!ubicacionOrigen) return jsonResponse({ error: 'La ubicación de origen es obligatoria.' }, 400);
  if (!ubicacionDestino) return jsonResponse({ error: 'La ubicación de destino es obligatoria.' }, 400);
  if (!Number.isFinite(cantidad) || cantidad < 0) return jsonResponse({ error: 'La cantidad debe ser un número válido.' }, 400);

  try {
    const raw = await env.INVENTORY_KV.get(KV_KEY);
    const records = raw ? JSON.parse(raw) : [];
    const idx = records.findIndex(r => r.id === id);

    if (idx === -1) {
      return jsonResponse({ error: 'No se encontró el registro a editar.' }, 404);
    }

    const prev = records[idx];

    // Si pasa de "por cambiar" a "cambiado", queda la fecha de ese cambio.
    // Si se vuelve a marcar como "por cambiar", se limpia la fecha de cambio.
    let fechaCambio = prev.fechaCambio || null;
    if (cambiado && !prev.cambiado) {
      fechaCambio = new Date().toISOString();
    } else if (!cambiado) {
      fechaCambio = null;
    }

    const updated = {
      ...prev,
      codigo,
      ubicacionOrigen,
      ubicacionDestino,
      descripcion,
      cantidad,
      cambiado,
      fechaCambio,
      fechaActualizacion: new Date().toISOString()
    };

    records[idx] = updated;
    await env.INVENTORY_KV.put(KV_KEY, JSON.stringify(records));

    return jsonResponse({ ok: true, record: updated });
  } catch (err) {
    return jsonResponse({ error: 'Error al actualizar el registro: ' + err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key'
    }
  });
}
