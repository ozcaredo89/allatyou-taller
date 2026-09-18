/**
 * Eurofrenos — Estimador de Precios (Beta)
 * Vanilla JS, sin dependencias externas.
 * Protegido por ef_token (friccion beta, no autenticacion real).
 */
(function () {
  'use strict';

  // ─── Config ─────────────────────────────────────────────────────────────────
  const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3001/api'
    : 'https://allatyou-taller-production.up.railway.app/api';
  const SLUG = 'eurofrenos';
  const PHONE = '573103793785';

  // ─── Estado ──────────────────────────────────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const efToken = params.get('ef_token') || '';

  let vehiculosData = [];   // [{ marca, linea }]
  let marcaSeleccionada = '';
  let lineaSeleccionada = '';

  // ─── Helpers de formato ──────────────────────────────────────────────────────
  function formatCOP(valor) {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(valor);
  }

  function apiUrl(path, extraParams) {
    const u = new URL(API_BASE + path);
    u.searchParams.set('ef_token', efToken);
    if (extraParams) {
      Object.entries(extraParams).forEach(([k, v]) => u.searchParams.set(k, v));
    }
    return u.toString();
  }

  // ─── Pantallas ───────────────────────────────────────────────────────────────
  function showScreen(name) {
    ['screen-locked', 'screen-loading', 'screen-main'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = (id === name) ? 'block' : 'none';
    });
  }

  // ─── Inicialización ──────────────────────────────────────────────────────────
  async function init() {
    showScreen('screen-loading');

    try {
      const res = await fetch(apiUrl('/public/precios/' + SLUG + '/vehiculos'));
      if (res.status === 403 || res.status === 503) {
        showScreen('screen-locked');
        return;
      }
      if (!res.ok) throw new Error('Error ' + res.status);

      const data = await res.json();
      vehiculosData = data.vehiculos || [];

      if (vehiculosData.length === 0) {
        showScreen('screen-locked');
        return;
      }

      poblarMarcas();
      showScreen('screen-main');
    } catch (e) {
      console.error('[Precios]', e);
      showScreen('screen-locked');
    }
  }

  // ─── Selectores en cascada ───────────────────────────────────────────────────
  function poblarMarcas() {
    const selMarca = document.getElementById('sel-marca');
    const marcasUnicas = [...new Set(vehiculosData.map(v => v.marca))].sort();

    marcasUnicas.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m;
      opt.textContent = m;
      selMarca.appendChild(opt);
    });

    selMarca.addEventListener('change', onMarcaChange);
  }

  function onMarcaChange(e) {
    marcaSeleccionada = e.target.value;
    lineaSeleccionada = '';
    const selLinea = document.getElementById('sel-linea');

    selLinea.innerHTML = '<option value="">— Selecciona un modelo —</option>';
    document.getElementById('precios-section').style.display = 'none';

    if (!marcaSeleccionada) {
      selLinea.disabled = true;
      return;
    }

    const lineas = vehiculosData
      .filter(v => v.marca === marcaSeleccionada)
      .map(v => v.linea)
      .sort();

    lineas.forEach(l => {
      const opt = document.createElement('option');
      opt.value = l;
      opt.textContent = l;
      selLinea.appendChild(opt);
    });

    selLinea.disabled = false;
    selLinea.addEventListener('change', onLineaChange);
  }

  function onLineaChange(e) {
    lineaSeleccionada = e.target.value;
    if (!lineaSeleccionada) {
      document.getElementById('precios-section').style.display = 'none';
      return;
    }
    cargarMatriz();
  }

  // ─── Tabla de precios ────────────────────────────────────────────────────────
  async function cargarMatriz() {
    const section = document.getElementById('precios-section');
    const tbody = document.getElementById('precios-tbody');
    const empty = document.getElementById('precios-empty');
    const titulo = document.getElementById('precios-titulo');

    section.style.display = 'block';
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--slate-400)">Calculando precios...</td></tr>';
    empty.style.display = 'none';
    titulo.textContent = marcaSeleccionada + ' ' + lineaSeleccionada + ' — Servicios';

    try {
      const res = await fetch(apiUrl('/public/precios/' + SLUG + '/matriz', {
        marca: marcaSeleccionada,
        linea: lineaSeleccionada,
      }));
      if (!res.ok) throw new Error('Error ' + res.status);
      const data = await res.json();
      const items = data.items || [];

      tbody.innerHTML = '';

      if (items.length === 0) {
        document.getElementById('precios-tabla').style.display = 'none';
        empty.style.display = 'block';
        return;
      }

      document.getElementById('precios-tabla').style.display = '';

      items.forEach(item => {
        const tr = document.createElement('tr');

        const tipoBadge = item.tipo === 'repuesto'
          ? '<span class="badge-tipo badge-repuesto">Repuesto</span>'
          : '<span class="badge-tipo badge-mano">Mano de obra</span>';

        const mismoRango = item.precio_min === item.precio_max;
        const rangoHtml = mismoRango
          ? '<div class="price-range">' + formatCOP(item.precio_promedio) + '</div>'
          : '<div class="price-range">' + formatCOP(item.precio_min) + ' &ndash; ' + formatCOP(item.precio_max) + '</div>' +
            '<div class="price-avg">Prom: ' + formatCOP(item.precio_promedio) + '</div>';

        const waMsg = encodeURIComponent(
          'Hola Eurofrenos, vi en el estimador de precios el servicio de "' + item.nombre +
          '" para mi ' + marcaSeleccionada + ' ' + lineaSeleccionada +
          ' y quisiera agendar una revision.'
        );

        tr.innerHTML = [
          '<td><strong>' + escHtml(item.nombre) + '</strong><br><small style="color:var(--slate-600)">' + escHtml(item.categoria) + '</small></td>',
          '<td>' + tipoBadge + '</td>',
          '<td>' + rangoHtml + '</td>',
          '<td><span class="ef-count">' + item.ocurrencias + ' caso' + (item.ocurrencias !== 1 ? 's' : '') + '</span></td>',
          '<td style="display:flex;gap:6px;flex-wrap:wrap;">' +
            '<button class="btn-auditoria" data-key="' + escHtml(item.key) + '" data-nombre="' + escHtml(item.nombre) + '">Ver origen</button>' +
            '<a class="btn-wapp" href="https://wa.me/' + PHONE + '?text=' + waMsg + '" target="_blank">&#128172; Cotizar</a>' +
          '</td>',
        ].join('');

        tbody.appendChild(tr);
      });

      // Delegar eventos de auditoria
      tbody.querySelectorAll('.btn-auditoria').forEach(btn => {
        btn.addEventListener('click', () => {
          abrirAuditoria(btn.dataset.key, btn.dataset.nombre);
        });
      });

    } catch (e) {
      console.error('[Precios] cargarMatriz error:', e);
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--red-lt)">Error al cargar precios. Intenta nuevamente.</td></tr>';
    }
  }

  // ─── Modal de Auditoría ──────────────────────────────────────────────────────
  async function abrirAuditoria(itemKey, itemNombre) {
    const modal = document.getElementById('modal-auditoria');
    const modalTitle = document.getElementById('modal-title');
    const modalSubtitle = document.getElementById('modal-subtitle');
    const modalBody = document.getElementById('modal-body');

    modalTitle.textContent = itemNombre;
    modalSubtitle.textContent = marcaSeleccionada + ' ' + lineaSeleccionada + ' — Ordenes reales que componen el promedio';
    modalBody.innerHTML = '<div class="modal-loading">Cargando ordenes...</div>';
    modal.classList.add('open');

    try {
      const res = await fetch(apiUrl('/public/precios/' + SLUG + '/auditoria', {
        marca: marcaSeleccionada,
        linea: lineaSeleccionada,
        item: itemKey,
      }));
      if (!res.ok) throw new Error('Error ' + res.status);
      const data = await res.json();
      const casos = data.casos || [];

      if (casos.length === 0) {
        modalBody.innerHTML = '<p style="color:var(--slate-400);text-align:center;padding:24px;">No hay casos disponibles para mostrar.</p>';
        return;
      }

      modalBody.innerHTML = casos.map(c => {
        const modeloStr = c.modelo_anio ? ' (' + c.modelo_anio + ')' : '';
        const descStr = c.nombre_servicio || itemNombre;
        return [
          '<div class="auditoria-row">',
          '  <div class="auditoria-meta">',
          '    <div>' + escHtml(descStr) + modeloStr + '</div>',
          '    <div class="fecha">' + escHtml(c.fecha) + '</div>',
          '    <div class="placa">' + escHtml(c.placa_enmascarada) + '</div>',
          '  </div>',
          '  <div class="auditoria-valor">' + formatCOP(c.valor_cobrado) + '</div>',
          '</div>',
        ].join('');
      }).join('');

    } catch (e) {
      console.error('[Precios] auditoria error:', e);
      modalBody.innerHTML = '<p style="color:var(--red-lt);text-align:center;padding:24px;">Error al cargar el detalle. Intenta nuevamente.</p>';
    }
  }

  // ─── Cerrar modal ────────────────────────────────────────────────────────────
  document.getElementById('modal-close-btn').addEventListener('click', () => {
    document.getElementById('modal-auditoria').classList.remove('open');
  });
  document.getElementById('modal-auditoria').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) e.currentTarget.classList.remove('open');
  });

  // ─── Escape HTML helper ───────────────────────────────────────────────────────
  function escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Arranque ────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
