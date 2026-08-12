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

  function tagCard(rec) {
    const cambiado = !!rec.cambiado;
    const photo = rec.imagen
      ? `<img class="tag-photo" src="${rec.imagen}" alt="Foto de ${escapeHtml(rec.codigo)}" loading="lazy">`
      : `<div class="tag-photo-empty">Sin fotografía</div>`;
    return `
      <div class="tag-card">
        <span class="tag-punch"></span>
        ${photo}
        <div class="tag-body">
          <p class="tag-code">${escapeHtml(rec.codigo)}</p>
          <div class="tag-route">
            <span class="loc">${escapeHtml(rec.ubicacionOrigen || '—')}</span>
            <span class="arrow">&#8594;</span>
            <span class="loc">${escapeHtml(rec.ubicacionDestino || '—')}</span>
          </div>
          <div class="tag-meta">
            <span class="qty-pill">Cant. ${escapeHtml(rec.cantidad ?? '—')}</span>
            <span class="badge ${cambiado ? 'ok' : 'pending'}">${cambiado ? 'Cambiado' : 'Por cambiar'}</span>
          </div>
          <p class="tag-date">${formatDate(rec.fecha)}</p>
        </div>
      </div>`;
  }

  function renderResults(container, records, emptyMessage) {
    if (!records || records.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <strong>Sin resultados</strong>
          ${escapeHtml(emptyMessage || 'No encontramos registros con ese código.')}
        </div>`;
      return;
    }
    container.innerHTML = `<div class="tag-grid">${records.map(tagCard).join('')}</div>`;
  }

  function showToast(el, message, type = 'ok') {
    el.textContent = message;
    el.className = `toast show ${type}`;
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  return { fetchRecords, createRecord, compressImage, tagCard, renderResults, showToast, escapeHtml, formatDate };
})();
