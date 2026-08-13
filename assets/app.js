/* Helpers compartidos entre index.html y admin.html */

const Tracker = (() => {

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function formatDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  async function fetchRecords(codigo) {
    const url = codigo
      ? `/api/read?codigo=${encodeURIComponent(codigo)}`
      : `/api/read`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Error ${res.status} al consultar`);
    }
    return res.json();
  }

  async function createRecord(record, adminKey) {
    const res = await fetch('/api/write', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey || ''
      },
      body: JSON.stringify(record)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `Error ${res.status} al guardar`);
    }
    return body;
  }

  async function updateRecord(patch, adminKey) {
    const res = await fetch('/api/update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': adminKey || ''
      },
      body: JSON.stringify(patch)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || `Error ${res.status} al actualizar`);
    }
    return body;
  }

  // Para cada código, devuelve el set de ids cuyo registro es el más reciente
  // de ese código (usado en la vista pública para mostrar una sola foto por código).
  function groupLatestPhotoIds(records) {
    const byCode = {};
    records.forEach(r => {
      if (!byCode[r.codigo]) byCode[r.codigo] = [];
      byCode[r.codigo].push(r);
    });
    const ids = new Set();
    Object.values(byCode).forEach(list => {
      let latest = list[0];
      list.forEach(r => {
        if (new Date(r.fecha) > new Date(latest.fecha)) latest = r;
      });
      ids.add(latest.id);
    });
    return ids;
  }

  // Redimensiona y comprime una imagen (File/Blob) a JPEG base64 dataURL
  function compressImage(file, maxDim = 1100, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round(height * (maxDim / width));
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round(width * (maxDim / height));
            height = maxDim;
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => reject(new Error('No se pudo leer la imagen'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
      reader.readAsDataURL(file);
    });
  }

  // Formulario inline de edición (reemplaza la ficha cuando está en modo edición)
  function editFormHtml(rec) {
    const photo = rec.imagen
      ? `<img class="tag-photo" src="${rec.imagen}" alt="Foto de ${escapeHtml(rec.codigo)}">`
      : `<div class="tag-photo-empty">Sin fotografía</div>`;
    return `
      <div class="tag-card tag-card-editing" data-id="${rec.id}">
        <span class="tag-punch"></span>
        ${photo}
        <div class="tag-body">
          <div class="field">
            <label>Código</label>
            <input type="text" class="edit-codigo" value="${escapeHtml(rec.codigo)}">
          </div>
          <div class="field">
            <label>Ubicación origen</label>
            <input type="text" class="edit-origen" value="${escapeHtml(rec.ubicacionOrigen || '')}">
          </div>
          <div class="field">
            <label>Cantidad</label>
            <input type="number" min="0" step="1" class="edit-cantidad" value="${escapeHtml(rec.cantidad ?? 0)}">
          </div>
          <div class="field">
            <label>Ubicación destino</label>
            <input type="text" class="edit-destino" value="${escapeHtml(rec.ubicacionDestino || '')}">
          </div>
          <div class="field">
            <label>Descripción</label>
            <textarea rows="2" class="edit-descripcion">${escapeHtml(rec.descripcion || '')}</textarea>
          </div>
          <label class="check-row" style="margin-bottom:14px;">
            <input type="checkbox" class="edit-cambiado" ${rec.cambiado ? 'checked' : ''}>
            <span><span class="check-label">CAMBIADO</span></span>
          </label>
          <div class="tag-edit-actions">
            <button type="button" class="btn btn-ghost" data-cancel-id="${rec.id}">Cancelar</button>
            <button type="button" class="btn" data-save-id="${rec.id}">Guardar</button>
          </div>
        </div>
      </div>`;
  }

  function tagCard(rec, opts = {}) {
    if (opts.editingId && rec.id === opts.editingId) {
      return editFormHtml(rec);
    }

    const cambiado = !!rec.cambiado;

    // En la vista pública se pasa `latestPhotoIds`: solo el registro más
    // reciente de cada código muestra su fotografía.
    const showPhoto = opts.latestPhotoIds ? opts.latestPhotoIds.has(rec.id) : true;
    const photo = !showPhoto
      ? `<div class="tag-photo-empty subtle">Ver foto en el registro más reciente</div>`
      : (rec.imagen
          ? `<img class="tag-photo" src="${rec.imagen}" alt="Foto de ${escapeHtml(rec.codigo)}" loading="lazy">`
          : `<div class="tag-photo-empty">Sin fotografía</div>`);

    const editBtn = opts.editable
      ? `<button type="button" class="tag-edit-btn" data-edit-id="${rec.id}" aria-label="Editar registro">✎</button>`
      : '';

    const descripcionHtml = rec.descripcion
      ? `<p class="tag-desc">${escapeHtml(rec.descripcion)}</p>`
      : '';

    const fechaCambioHtml = (cambiado && rec.fechaCambio)
      ? `<p class="tag-date tag-date-changed">Cambiado: ${formatDate(rec.fechaCambio)}</p>`
      : '';

    return `
      <div class="tag-card" data-id="${rec.id}">
        <span class="tag-punch"></span>
        ${editBtn}
        ${photo}
        <div class="tag-body">
          <p class="tag-code">${escapeHtml(rec.codigo)}</p>
          <div class="tag-route">
            <span class="loc">${escapeHtml(rec.ubicacionOrigen || '—')}</span>
            <span class="arrow">&#8594;</span>
            <span class="loc">${escapeHtml(rec.ubicacionDestino || '—')}</span>
          </div>
          ${descripcionHtml}
          <div class="tag-meta">
            <span class="qty-pill">Cant. ${escapeHtml(rec.cantidad ?? '—')}</span>
            <span class="badge ${cambiado ? 'ok' : 'pending'}">${cambiado ? 'Cambiado' : 'Por cambiar'}</span>
          </div>
          <p class="tag-date">Registrado: ${formatDate(rec.fecha)}</p>
          ${fechaCambioHtml}
        </div>
      </div>`;
  }

  function renderResults(container, records, emptyMessage, opts = {}) {
    if (!records || records.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <strong>Sin resultados</strong>
          ${escapeHtml(emptyMessage || 'No encontramos registros con ese código.')}
        </div>`;
      return;
    }
    container.innerHTML = `<div class="tag-grid">${records.map(r => tagCard(r, opts)).join('')}</div>`;
  }

  function showToast(el, message, type = 'ok') {
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  return {
    fetchRecords, createRecord, updateRecord, compressImage,
    tagCard, renderResults, groupLatestPhotoIds,
    showToast, escapeHtml, formatDate
  };
})();
