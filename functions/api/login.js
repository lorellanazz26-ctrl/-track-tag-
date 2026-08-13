// POST /api/login -> valida usuario/contraseña y devuelve un token de sesión firmado.

import { verifyPassword, signToken, newSessionExpiry, jsonResponse } from '../_lib/auth.js';

const USERS_KEY = 'users';

export async function onRequestPost(context) {
  const { env, request } = context;

  if (!env.INVENTORY_KV) {
    return jsonResponse({ error: 'Falta el binding KV "INVENTORY_KV" en Cloudflare Pages.' }, 500);
  }
  if (!env.ADMIN_KEY) {
    return jsonResponse({ error: 'Falta la variable secreta ADMIN_KEY (se usa para firmar las sesiones).' }, 500);
  }

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return jsonResponse({ error: 'JSON inválido en la solicitud.' }, 400);
  }

  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');

  if (!username || !password) {
    return jsonResponse({ error: 'Usuario y contraseña son obligatorios.' }, 400);
  }

  try {
    const raw = await env.INVENTORY_KV.get(USERS_KEY);
    const users = raw ? JSON.parse(raw) : [];
    const user = users.find(u => u.username === username);

    if (!user) {
      return jsonResponse({ error: 'Usuario o contraseña incorrectos.' }, 401);
    }

    const ok = await verifyPassword(password, user.hash, user.salt);
    if (!ok) {
      return jsonResponse({ error: 'Usuario o contraseña incorrectos.' }, 401);
    }

    const exp = newSessionExpiry();
    const token = await signToken({ u: user.username, r: user.role, exp }, env.ADMIN_KEY);

    return jsonResponse({
      ok: true,
      token,
      username: user.username,
      role: user.role,
      expiresAt: exp * 1000
    });
  } catch (err) {
    return jsonResponse({ error: 'Error al iniciar sesión: ' + err.message }, 500);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
