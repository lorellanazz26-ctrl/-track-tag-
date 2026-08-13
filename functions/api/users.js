// GET    /api/users -> lista usuarios (requiere sesión con rol admin)
// POST   /api/users -> crea un usuario (requiere sesión admin, o ADMIN_KEY si todavía no existe ningún usuario)
// DELETE /api/users -> elimina un usuario (requiere sesión admin)

import { hashPassword, verifyToken, getBearerToken, jsonResponse } from '../_lib/auth.js';

const USERS_KEY = 'users';
const VALID_ROLES = ['admin', 'operador'];

async function loadUsers(env) {
  const raw = await env.INVENTORY_KV.get(USERS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveUsers(env, users) {
  await env.INVENTORY_KV.put(USERS_KEY, JSON.stringify(users));
}

function publicUser(u) {
  return { username: u.username, role: u.role, createdAt: u.createdAt };
}

async function requireAdminSession(env, request) {
  const token = getBearerToken(request);
  const payload = await verifyToken(token, env.ADMIN_KEY);
  if (!payload || payload.r !== 'admin') return null;
  return payload;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  if (!env.INVENTORY_KV || !env.ADMIN_KEY) {
    return jsonResponse({ error: 'Configuración incompleta (falta INVENTORY_KV o ADMIN_KEY).' }, 500);
  }

  const session = await requireAdminSession(env, request);
  if (!session) {
    return jsonResponse({ error: 'No autorizado. Iniciá sesión como administrador.' }, 401);
  }

  const users = await loadUsers(env);
  return jsonResponse({ users: users.map(publicUser) });
}

export async function onRequestPost(context) {
  const { env, request } = context;
  if (!env.INVENTORY_KV || !env.ADMIN_KEY) {
    return jsonResponse({ error: 'Configuración incompleta (falta INVENTORY_KV o ADMIN_KEY).' }, 500);
  }

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return jsonResponse({ error: 'JSON inválido en la solicitud.' }, 400);
  }

  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const requestedRole = VALID_ROLES.includes(body.role) ? body.role : 'operador';

  if (!username || username.length < 3) {
    return jsonResponse({ error: 'El usuario debe tener al menos 3 caracteres.' }, 400);
  }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return jsonResponse({ error: 'El usuario solo puede tener letras, números, puntos, guiones y guiones bajos.' }, 400);
  }
  if (!password || password.length < 6) {
    return jsonResponse({ error: 'La contraseña debe tener al menos 6 caracteres.' }, 400);
  }

  const users = await loadUsers(env);

  // Arranque: si todavía no existe ningún usuario, se puede crear el primer
  // administrador presentando la ADMIN_KEY (llave maestra de Cloudflare) en
  // vez de una sesión. Una vez que exista al menos un usuario, esta puerta
  // se cierra sola y todo pasa a manejarse con usuario/contraseña.
  const bootstrapKey = request.headers.get('X-Admin-Key') || '';
  const isBootstrap = users.length === 0 && bootstrapKey && bootstrapKey === env.ADMIN_KEY;

  if (!isBootstrap) {
    const session = await requireAdminSession(env, request);
    if (!session) {
      return jsonResponse({ error: 'No autorizado. Iniciá sesión como administrador para crear usuarios.' }, 401);
    }
  }

  if (users.some(u => u.username === username)) {
    return jsonResponse({ error: 'Ese nombre de usuario ya existe.' }, 409);
  }

  const { hash, salt } = await hashPassword(password);
  const role = isBootstrap ? 'admin' : requestedRole;

  users.push({
    username,
    hash,
    salt,
    role,
    createdAt: new Date().toISOString()
  });

  await saveUsers(env, users);

  return jsonResponse({ ok: true, user: { username, role } }, 201);
}

export async function onRequestDelete(context) {
  const { env, request } = context;
  if (!env.INVENTORY_KV || !env.ADMIN_KEY) {
    return jsonResponse({ error: 'Configuración incompleta (falta INVENTORY_KV o ADMIN_KEY).' }, 500);
  }

  const session = await requireAdminSession(env, request);
  if (!session) {
    return jsonResponse({ error: 'No autorizado. Iniciá sesión como administrador.' }, 401);
  }

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return jsonResponse({ error: 'JSON inválido en la solicitud.' }, 400);
  }

  const username = String(body.username || '').trim().toLowerCase();
  if (!username) {
    return jsonResponse({ error: 'Falta el usuario a eliminar.' }, 400);
  }
  if (username === session.u) {
    return jsonResponse({ error: 'No podés eliminar tu propio usuario mientras estás conectado con él.' }, 400);
  }

  const users = await loadUsers(env);
  const filtered = users.filter(u => u.username !== username);

  if (filtered.length === users.length) {
    return jsonResponse({ error: 'Usuario no encontrado.' }, 404);
  }

  await saveUsers(env, filtered);
  return jsonResponse({ ok: true });
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Admin-Key'
    }
  });
}
