// GET /api/foto?id=<id del registro> -> devuelve la foto de ese registro (imagen).

import { fotoKey, validId } from '../_lib/fotos.js';

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.INVENTORY_KV) return new Response('Falta KV', { status: 500 });

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!validId(id)) return new Response('Id inválido', { status: 400 });

  const { value, metadata } = await env.INVENTORY_KV.getWithMetadata(fotoKey(id), 'stream');
  if (!value) return new Response('Sin foto', { status: 404 });

  return new Response(value, {
    headers: {
      'Content-Type': (metadata && metadata.ct) || 'image/jpeg',
      // La foto de un registro no cambia nunca: el navegador puede guardarla.
      'Cache-Control': 'public, max-age=31536000, immutable'
    }
  });
}
