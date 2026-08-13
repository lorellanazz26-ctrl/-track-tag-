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

  function httpError(message, status) {
    const err = new Error(message);
    err.status = status;
    return err;
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

  async function createRecord(record, token) {
    const res = await fetch('/api/write', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || ''}`
      },
      body: JSON.stringify(record)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw httpError(body.error || `Error ${res.status} al guardar`, res.status);
    }
    return body;
  }

  async function updateRecord(patch, token) {
    const res = await fetch('/api/update', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || ''}`
      },
      body: JSON.stringify(patch)
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw httpError(body.error || `Error ${res.status} al actualizar`, res.status);
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

  // ---- Sesión y usuarios ----

  async function login(username, password) {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw httpError(body.error || `Error ${res.status} al iniciar sesión`, res.status);
    }
    return body; // { token, username, role, expiresAt }
  }

  async function fetchUsers(token) {
    const res = await fetch('/api/users', {
      headers: { 'Authorization': `Bearer ${token || ''}` }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw httpError(body.error || `Error ${res.status} al listar usuarios`, res.status);
    }
    return body; // { users: [...] }
  }

  async function createUser({ username, password, role }, token, bootstrapAdminKey) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (bootstrapAdminKey) headers['X-Admin-Key'] = bootstrapAdminKey;
    const res = await fetch('/api/users', {
      method: 'POST',
      headers,
      body: JSON.stringify({ username, password, role })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw httpError(body.error || `Error ${res.status} al crear usuario`, res.status);
    }
    return body;
  }

  async function deleteUser(username, token) {
    const res = await fetch('/api/users', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || ''}`
      },
      body: JSON.stringify({ username })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw httpError(body.error || `Error ${res.status} al eliminar usuario`, res.status);
    }
    return body;
  }

  // Elige el formato de código de barra según la cantidad de dígitos
  function chooseBarcodeFormat(value) {
    if (/^\d{13}$/.test(value)) return 'EAN13';
    if (/^\d{12}$/.test(value)) return 'UPC';
    if (/^\d{8}$/.test(value)) return 'EAN8';
    return 'CODE128';
  }

  // Recorre el contenedor y dibuja los códigos de barra pendientes (JsBarcode
  // debe estar cargado globalmente). Marca cada uno como renderizado para no
  // repetir el trabajo si se vuelve a llamar sobre el mismo contenedor.
  function renderBarcodes(container) {
    if (typeof JsBarcode === 'undefined' || !container) return;
    const nodes = container.querySelectorAll('.barcode-svg[data-barcode-value]:not([data-rendered])');
    nodes.forEach(svg => {
      const value = svg.getAttribute('data-barcode-value');
      if (!value) return;
      try {
        JsBarcode(svg, value, {
          format: chooseBarcodeFormat(value),
          lineColor: '#111111',
          width: 2,
          height: 46,
          fontSize: 12,
          margin: 6,
          displayValue: true
        });
      } catch (err) {
        svg.closest('.tag-barcode')?.remove();
      }
      svg.setAttribute('data-rendered', 'true');
    });
  }

  function barcodeBlockHtml(rec) {
    if (!rec.codigoBarra) return '';
    return `
      <div class="tag-barcode">
        <svg class="barcode-svg" data-barcode-value="${escapeHtml(rec.codigoBarra)}"></svg>
      </div>`;
  }

  // Formulario inline de edición (reemplaza la ficha cuando está en modo edición)
  function editFormHtml(rec) {
    const photo = rec.imagen
      ? `<img class="tag-photo" src="${rec.imagen}" alt="Foto de ${escapeHtml(rec.codigo)}">`
      : `<div class="tag-photo-empty">Sin fotografía</div>`;
    const barcodeHint = rec.codigoBarra
      ? `Código de barra: ${escapeHtml(rec.codigoBarra)}`
      : 'Sin código de barra asociado';
    return `
      <div class="tag-card tag-card-editing" data-id="${rec.id}">
        <span class="tag-punch"></span>
        ${photo}
        <div class="tag-body">
          <div class="field">
            <label>Código</label>
            <input type="text" class="edit-codigo" value="${escapeHtml(rec.codigo)}">
            <input type="hidden" class="edit-codigobarra" value="${escapeHtml(rec.codigoBarra || '')}">
            <p class="barcode-hint edit-barcode-hint">${barcodeHint}</p>
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
          ${barcodeBlockHtml(rec)}
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

  // Agrupa los registros por código y los muestra como una línea de tiempo
  // (del más antiguo al más nuevo), en vez de un mosaico. Cada grupo solo
  // muestra la fotografía de su registro más reciente.
  function renderTimeline(container, records, emptyMessage, opts = {}) {
    if (!records || records.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <strong>Sin resultados</strong>
          ${escapeHtml(emptyMessage || 'No encontramos registros con ese código.')}
        </div>`;
      return;
    }

    const groups = {};
    records.forEach(r => {
      if (!groups[r.codigo]) groups[r.codigo] = [];
      groups[r.codigo].push(r);
    });

    const codes = Object.keys(groups).sort((a, b) => {
      const latestA = Math.max(...groups[a].map(r => new Date(r.fecha).getTime()));
      const latestB = Math.max(...groups[b].map(r => new Date(r.fecha).getTime()));
      return latestB - latestA; // grupos con actividad más reciente primero
    });

    const html = codes.map(code => {
      const list = groups[code].slice().sort((a, b) => new Date(a.fecha) - new Date(b.fecha)); // antiguo -> nuevo
      const latestId = list[list.length - 1].id;
      const changedCount = list.filter(r => r.cambiado).length;

      const items = list.map(rec => {
        const cardOpts = { ...opts, latestPhotoIds: new Set([latestId]) };
        const isLatest = rec.id === latestId;
        return `<div class="timeline-node ${isLatest ? 'is-latest' : ''}">${tagCard(rec, cardOpts)}</div>`;
      }).join('');

      return `
        <div class="timeline-group">
          <div class="timeline-group-header">
            <span>${escapeHtml(code)}</span>
            <span class="code-badge-count">${list.length} registro${list.length === 1 ? '' : 's'} · ${changedCount} cambiado(s)</span>
          </div>
          <div class="timeline-list">${items}</div>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="timeline-groups">${html}</div>`;
  }

  function showToast(el, message, type = 'ok') {
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  return {
    fetchRecords, createRecord, updateRecord, compressImage,
    login, fetchUsers, createUser, deleteUser,
    tagCard, renderResults, renderTimeline, renderBarcodes, groupLatestPhotoIds,
    showToast, escapeHtml, formatDate
  };
})();
