// Utilidades para guardar las fotos aparte de los registros (clave KV "foto:<id>").

export const FOTO_PREFIX = 'foto:';

export function fotoKey(id) {
  return FOTO_PREFIX + id;
}

export function validId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(id);
}

// "data:image/jpeg;base64,XXXX" -> { bytes, contentType } (o null si no es válido)
export function dataUrlToBytes(dataUrl) {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!m) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { bytes, contentType: m[1] };
  } catch {
    return null;
  }
}
