/* ============================================================
   Informe Nº 3 — Registro de avance (formato tipo curva-s-semiva)
   Comparte Firebase/parada con curva-s-semiva:
   - "subactividades" / "ots": mismo esquema que engine.js.
   - "emergentesManual": misma colección que la app principal.
   - "turnoHeaders": cabecera estándar de cada turno.
   - "bitacora": bloques de actividad (título + viñetas + fotos).
   - "pets": PDFs de PETS con las OT a las que aplican.
   ============================================================ */

const CABECERA_ITEMS = [
  { key: 'charla', texto: 'Se llevó a cabo la charla de seguridad.' },
  { key: 'permisos', texto: 'Se procedió con el llenado de los permisos y aprobación con los encargados de área.' },
  { key: 'alistado', texto: 'Se realizó el alistado de herramientas con su respectiva documentación.' },
  { key: 'pets', texto: 'Se realizó la difusión del PETS para realizar el trabajo.' },
  { key: 'firmaDocs', texto: 'Se elabora y se firma documentos de seguridad.' },
];

const ESTADOS_OT = [
  'Vigente',
  'Cancelada (falta de tiempo)',
  'Cancelada (falta de componentes)',
  'Cancelada (en coordinación con sup BHP se canceló)',
  'Cancelada (otro motivo)',
  'En pausa',
];

const state = {
  db: null,
  storage: null,
  liveSubs: {},
  liveOtAvance: {},
  liveOtEstado: {},
  liveOtMotivo: {},
  manualEmergentes: [],
  bitacora: [],
  turnoHeaders: {},
  pets: [],
  etapaSel: 'Parada',
  turnoTipoSel: 'Día',
  fotoRows: [],
  bulletsDraft: '',
  selectedOtKey: null,
  otNumsIncluidos: DEFAULT_OT_NUMS.slice(),
  pickerPendingSelection: [],
  petsPendingOts: [],
};

function subKey(otNum, nombre) { return otNum + '::' + nombre.replace(/\//g, '-'); }

function subsCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('subactividades'); }
function otsCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('ots'); }
function emergManualCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('emergentesManual'); }
function bitacoraCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('bitacora'); }
function turnoHeadersCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('turnoHeaders'); }
function informeConfigDoc() { return state.db.collection('paradas').doc(PARADA_ID).collection('informes').doc(INFORME_ID); }
function petsCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('pets'); }

function turnoHeaderKey(etapa, fecha, turnoTipo) { return `${etapa}::${fecha}::${turnoTipo}`; }

function otsDelInforme() {
  return CATALOGO_OTS.filter((ot) => state.otNumsIncluidos.includes(ot.otNum)).concat(state.manualEmergentes);
}

function carryForward(avanceMap, uptoIdx) {
  let last = 0;
  for (let i = 0; i <= uptoIdx; i++) {
    const raw = avanceMap[i] !== undefined ? avanceMap[i] : avanceMap[String(i)];
    if (raw !== undefined && raw !== null) last = raw;
  }
  return last;
}

function tipoActualPorHora() {
  const h = new Date().getHours();
  return (h >= 8 && h < 20) ? 'Día' : 'Noche';
}

function hoyISO() { return new Date().toISOString().slice(0, 10); }

// Índice de turno calculado dinámicamente (cada 12h desde el primer turno de la parada) —
// siempre da un valor válido, así ninguna actividad queda "inactiva" por fecha.
function getSelectedTurnoIdx() {
  const fecha = document.getElementById('fechaInput').value;
  const hora = state.turnoTipoSel === 'Día' ? '08:00:00' : '20:00:00';
  const cur = new Date(`${fecha}T${hora}`).getTime();
  const base = new Date(INFORME_DATA.turnos[0]).getTime();
  return Math.round((cur - base) / (12 * 3600 * 1000));
}

function pctActualDeSub(otNum, nombre) {
  const rec = state.liveSubs[subKey(otNum, nombre)];
  if (!rec) return 0;
  return carryForward(rec.avance, getSelectedTurnoIdx());
}

function pctActualDeOt(otNum) {
  const rec = state.liveOtAvance[otNum];
  if (!rec) return 0;
  return carryForward(rec, getSelectedTurnoIdx());
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function fmtFechaLarga(f) {
  const [y, m, d] = f.split('-');
  return `${d}/${m}/${y}`;
}

function fmtHora(iso) {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${mi}`;
}

// Título de una actividad para mostrar. Las emergentes NO llevan prefijo "OT ..." (no tienen
// OT real — mostrar "OT M-xxxxx" es un ID interno sin sentido para el usuario).
function tituloDeActividad(ot) {
  return ot.descripcion.toUpperCase();
}
function etiquetaCorta(ot) {
  return ot.manual ? ot.descripcion : `OT ${ot.otNum} — ${ot.descripcion}`;
}
function otLabel(otNum) {
  if (!otNum) return 'General del turno';
  const ot = CATALOGO_OTS.find((o) => o.otNum === Number(otNum))
    || state.manualEmergentes.find((o) => o.otNum === String(otNum));
  return ot ? etiquetaCorta(ot) : `OT ${otNum}`;
}
function findOt(key) {
  return CATALOGO_OTS.find((o) => String(o.otNum) === String(key))
    || state.manualEmergentes.find((o) => String(o.otNum) === String(key));
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

function setConn(ok, err) {
  const dot = document.getElementById('connDot');
  const txt = document.getElementById('connTxt');
  if (err) { dot.className = 'conn-dot err'; txt.textContent = 'Sin conexión a Firebase'; return; }
  dot.className = ok ? 'conn-dot ok' : 'conn-dot';
  txt.textContent = ok ? 'Conectado' : 'Conectando…';
}

// ---------------- Firebase ----------------

function initFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    state.db = firebase.firestore();
    state.storage = firebase.storage();
    try { state.db.enablePersistence({ synchronizeTabs: true }); } catch (e) {}
    listenSubs();
    listenOtsAvance();
    listenEmergentes();
    listenBitacora();
    listenTurnoHeaders();
    listenInformeConfig();
    listenPets();
    setConn(true);
  } catch (e) {
    console.error('Firebase no configurado', e);
    setConn(false, true);
  }
}

function listenSubs() {
  subsCollection().onSnapshot((snap) => {
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const avance = {};
      Object.keys(d).forEach((k) => { if (k.startsWith('avance.')) avance[k.replace('avance.', '')] = d[k]; });
      if (d.avance && typeof d.avance === 'object') Object.assign(avance, d.avance);
      state.liveSubs[doc.id] = { avance };
    });
    renderAll();
  }, (err) => { console.error('subs error:', err); setConn(false); });
}

function listenOtsAvance() {
  otsCollection().onSnapshot((snap) => {
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const avance = {};
      Object.keys(d).forEach((k) => { if (k.startsWith('avance.')) avance[k.replace('avance.', '')] = d[k]; });
      if (d.avance && typeof d.avance === 'object') Object.assign(avance, d.avance);
      state.liveOtAvance[doc.id] = avance;
      state.liveOtEstado[doc.id] = d.estado || 'Vigente';
      state.liveOtMotivo[doc.id] = d.motivo || '';
    });
    renderAll();
  }, (err) => { console.error('ots avance error:', err); setConn(false); });
}

function listenEmergentes() {
  emergManualCollection().onSnapshot((snap) => {
    state.manualEmergentes = [];
    snap.forEach((doc) => {
      const d = doc.data();
      if (d.area !== INFORME_DATA.area) return;
      state.manualEmergentes.push({
        otNum: 'M-' + doc.id, cuadrilla: '-', area: d.area, tipo: 'Emergente',
        descripcion: d.nombre, pesoPlanHH: d.hhEstimadas || 0,
        inicio: d.fechaDeteccion, fin: d.fechaDeteccion, subactividades: [], manual: true,
      });
    });
    renderAll();
  }, (err) => { console.error('emergentes error:', err); setConn(false); });
}

function listenBitacora() {
  bitacoraCollection().where('informeId', '==', INFORME_ID).onSnapshot((snap) => {
    state.bitacora = [];
    snap.forEach((doc) => state.bitacora.push({ id: doc.id, ...doc.data() }));
    state.bitacora.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }, (err) => { console.error('bitacora error:', err); setConn(false); });
}

function listenTurnoHeaders() {
  turnoHeadersCollection().onSnapshot((snap) => {
    state.turnoHeaders = {};
    snap.forEach((doc) => { state.turnoHeaders[doc.id] = doc.data(); });
    renderCabecera();
  }, (err) => { console.error('turnoHeaders error:', err); setConn(false); });
}

function listenInformeConfig() {
  informeConfigDoc().onSnapshot((doc) => {
    const d = doc.data();
    state.otNumsIncluidos = (d && Array.isArray(d.otNumsIncluidos) && d.otNumsIncluidos.length)
      ? d.otNumsIncluidos : DEFAULT_OT_NUMS.slice();
    renderAll();
    renderResumenSeleccion();
  }, (err) => { console.error('informe config error:', err); setConn(false); });
}

function listenPets() {
  petsCollection().onSnapshot((snap) => {
    state.pets = [];
    snap.forEach((doc) => state.pets.push({ id: doc.id, ...doc.data() }));
    renderDetalle();
  }, (err) => { console.error('pets error:', err); setConn(false); });
}

async function saveSubPct(otNum, nombreCodificado, pct) {
  const idx = getSelectedTurnoIdx();
  const nombre = decodeURIComponent(nombreCodificado);
  const ref = subsCollection().doc(subKey(otNum, nombre));
  const valor = pct === 0 ? firebase.firestore.FieldValue.delete() : pct;
  try {
    await ref.set({ [`avance.${idx}`]: valor, updatedAt: Date.now() }, { merge: true });
    showToast('Avance guardado ✓');
  } catch (e) { console.error(e); showToast('No se pudo guardar — revisa tu conexión'); }
}

async function saveOtPct(otNum, pct) {
  const idx = getSelectedTurnoIdx();
  const ref = otsCollection().doc(String(otNum));
  const valor = pct === 0 ? firebase.firestore.FieldValue.delete() : pct;
  try {
    await ref.set({ [`avance.${idx}`]: valor, updatedAt: Date.now() }, { merge: true });
    showToast('Avance guardado ✓');
  } catch (e) { console.error(e); showToast('No se pudo guardar — revisa tu conexión'); }
}

async function saveOtEstado(otNum, estado, motivo) {
  const payload = { estado, updatedAt: Date.now() };
  if (motivo !== undefined) payload.motivo = motivo;
  try {
    await otsCollection().doc(String(otNum)).set(payload, { merge: true });
    showToast('Estado actualizado ✓');
  } catch (e) { console.error(e); showToast('No se pudo actualizar el estado'); }
}

// ---------------- Cabecera del turno (defaults inteligentes por Nº de turno) ----------------

function cabeceraActualKey() {
  return turnoHeaderKey(state.etapaSel, document.getElementById('fechaInput').value, state.turnoTipoSel);
}

// Turno 0 (el primero de toda la parada): checklist completo.
// Turno 1: igual, menos "alistado".
// Turno 2 en adelante: solo "firma de documentos" (charla/permisos/alistado/pets ya no se repiten).
function defaultsCabeceraPorTurno(idx) {
  if (idx <= 0) return { charla: true, permisos: true, alistado: true, pets: true, firmaDocs: false };
  if (idx === 1) return { charla: true, permisos: true, alistado: false, pets: true, firmaDocs: false };
  return { charla: false, permisos: false, alistado: false, pets: false, firmaDocs: true };
}

function renderCabecera() {
  const wrap = document.getElementById('cabeceraItems');
  const idx = getSelectedTurnoIdx();
  const guardada = state.turnoHeaders[cabeceraActualKey()];
  const defaults = defaultsCabeceraPorTurno(idx);
  wrap.innerHTML = CABECERA_ITEMS.map((item) => {
    const checked = guardada && guardada[item.key] !== undefined ? guardada[item.key] : defaults[item.key];
    return `<label class="cabecera-row">
      <input type="checkbox" class="cabecera-check" data-key="${item.key}" ${checked ? 'checked' : ''}>
      <span>${escapeHtml(item.texto)}</span>
    </label>`;
  }).join('');
  document.getElementById('horaBloqueoInput').value = (guardada && guardada.horaBloqueo) || '';
  document.getElementById('cabeceraHint').textContent = idx <= 0
    ? 'Primer turno de la parada — checklist completo por defecto.'
    : (idx === 1 ? 'Segundo turno — checklist reducido por defecto.' : 'A partir de este turno, por defecto solo firma de documentos + bloqueo.');
}

async function guardarCabecera() {
  const payload = { etapa: state.etapaSel, fecha: document.getElementById('fechaInput').value, turnoTipo: state.turnoTipoSel };
  document.querySelectorAll('.cabecera-check').forEach((chk) => { payload[chk.dataset.key] = chk.checked; });
  payload.horaBloqueo = document.getElementById('horaBloqueoInput').value || '';
  payload.updatedAt = Date.now();
  try {
    await turnoHeadersCollection().doc(cabeceraActualKey()).set(payload, { merge: true });
    showToast('Cabecera del turno guardada ✓');
  } catch (e) { console.error(e); showToast('No se pudo guardar la cabecera'); }
}

// ---------------- Render general ----------------

function renderAll() {
  renderListaOts();
  renderDetalle();
  renderCurvaS();
}

function renderResumenSeleccion() {
  const ots = CATALOGO_OTS.filter((ot) => state.otNumsIncluidos.includes(ot.otNum));
  const totalHH = ots.reduce((s, o) => s + o.pesoPlanHH, 0);
  const el = document.getElementById('resumenSeleccion');
  el.textContent = ots.length
    ? `${ots.length} actividad${ots.length === 1 ? '' : 'es'} incluida${ots.length === 1 ? '' : 's'} · ${totalHH} HH planificadas`
    : 'Sin actividades definidas todavía.';
}

// ---------------- Panel izquierdo: lista ----------------

function pctGeneralDeOt(ot) {
  if (ot.manual || !ot.subactividades.length) return pctActualDeOt(ot.otNum);
  const totalHH = ot.subactividades.reduce((s, x) => s + x.pesoHH, 0) || 1;
  const hecho = ot.subactividades.reduce((s, x) => s + x.pesoHH * pctActualDeSub(ot.otNum, x.nombre) / 100, 0);
  return Math.round((hecho / totalHH) * 100);
}

function renderListaOts() {
  const wrap = document.getElementById('listaOts');
  const ots = otsDelInforme();
  if (!ots.length) {
    wrap.innerHTML = '<p class="empty-hint">Aún no defines qué actividades componen este informe — usa "✏️ Editar selección" arriba.</p>';
    return;
  }
  wrap.innerHTML = ots.map((ot) => {
    const key = String(ot.otNum);
    const pct = pctGeneralDeOt(ot);
    const estado = state.liveOtEstado[key] || 'Vigente';
    const esCancelada = estado.startsWith('Cancelada');
    const activo = state.selectedOtKey === key;
    return `<div class="lista-item ${activo ? 'activo' : ''} ${esCancelada ? 'cancelada' : ''} ${ot.manual ? 'emergente' : ''}" data-key="${key}">
      <div class="lista-item-top">
        <span class="lista-item-titulo">${escapeHtml(etiquetaCorta(ot))}</span>
        ${ot.manual ? '<span class="tag-emergente">EMERGENTE</span>' : ''}
      </div>
      ${esCancelada ? `<span class="tag-cancelada">${escapeHtml(estado)}</span>` : ''}
      <div class="lista-item-bar"><div class="lista-item-bar-fill" style="width:${pct}%"></div></div>
      <span class="lista-item-pct">${pct}%</span>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.lista-item').forEach((el) => {
    el.addEventListener('click', () => seleccionarOt(el.dataset.key));
  });
}

function seleccionarOt(key) {
  state.selectedOtKey = key;
  state.actividadAbierta = null;
  renderListaOts();
  renderDetalle();
  const panel = document.getElementById('panelDetalle');
  if (window.innerWidth < 1024) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ---------------- Panel central: detalle ----------------

function renderDetalle() {
  const empty = document.getElementById('detalleEmpty');
  const content = document.getElementById('detalleContent');
  const ot = state.selectedOtKey ? findOt(state.selectedOtKey) : null;
  if (!ot) {
    empty.style.display = 'block';
    content.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  content.style.display = 'block';

  const estado = state.liveOtEstado[ot.otNum] || 'Vigente';
  const motivo = state.liveOtMotivo[ot.otNum] || '';
  const petsAplicables = state.pets.filter((p) => (p.otNums || []).includes(String(ot.otNum)));

  let subsHtml = '';
  if (ot.manual || !ot.subactividades.length) {
    const pct = pctActualDeOt(ot.otNum);
    subsHtml = `<div class="sub-row">
      <div class="sub-row-top"><span class="sub-name">Avance</span><span class="sub-pct">${pct}%</span></div>
      <input type="range" class="pct-slider" style="--_pct:${pct}%" min="0" max="100" step="10" value="${pct}" data-ot="${ot.otNum}">
    </div>`;
  } else {
    subsHtml = ot.subactividades.map((sub) => {
      const pct = pctActualDeSub(ot.otNum, sub.nombre);
      const nombreEnc = encodeURIComponent(sub.nombre);
      return `<div class="sub-row">
        <div class="sub-row-top"><span class="sub-name">${escapeHtml(sub.nombre)}</span><span class="sub-pct">${pct}%</span></div>
        <div class="sub-meta">${sub.pesoHH} HH · ${fmtHora(sub.inicio)} → ${fmtHora(sub.fin)}</div>
        <input type="range" class="pct-slider" style="--_pct:${pct}%" min="0" max="100" step="10" value="${pct}" data-ot="${ot.otNum}" data-nombre="${nombreEnc}">
      </div>`;
    }).join('');
  }

  content.innerHTML = `
    <div class="detalle-head">
      <h2>${escapeHtml(tituloDeActividad(ot))}</h2>
      <p class="detalle-meta">${ot.manual ? (ot.pesoPlanHH ? ot.pesoPlanHH + ' HH estimadas' : 'Actividad emergente') : `OT ${ot.otNum} · ${ot.pesoPlanHH} HH · Cuadrilla ${ot.cuadrilla}`}</p>
    </div>

    ${petsAplicables.length ? `<div class="pets-block">${petsAplicables.map((p) => `<a href="${p.url}" target="_blank" rel="noopener" class="btn-pets">📄 Ver PETS: ${escapeHtml(p.nombre)}</a>`).join('')}</div>` : '<p class="section-hint">PETS aún no cargado para esta OT.</p>'}

    <label class="field-label">Estado de la actividad</label>
    <select id="estadoSelect" class="field-input">
      ${ESTADOS_OT.map((e) => `<option value="${escapeHtml(e)}" ${e === estado ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
    </select>
    <div id="motivoWrap" style="display:${estado.startsWith('Cancelada') ? 'block' : 'none'};">
      <label class="field-label">Motivo</label>
      <textarea id="motivoInput" class="field-input" rows="2">${escapeHtml(motivo)}</textarea>
    </div>

    <label class="field-label">Avance</label>
    ${subsHtml}

    <button type="button" id="btnToggleComentario" class="btn-toggle-comentario">📝 Agregar comentario / fotos</button>
    <div id="inlineFormSlot">${state.actividadAbierta === state.selectedOtKey ? renderInlineForm() : ''}</div>
    ${ot.manual ? `<button type="button" id="btnBorrarEmergente" class="btn-borrar-emergente">🗑 Eliminar actividad emergente</button>` : ''}
  `;

  document.getElementById('estadoSelect').addEventListener('change', (e) => {
    const nuevoEstado = e.target.value;
    document.getElementById('motivoWrap').style.display = nuevoEstado.startsWith('Cancelada') ? 'block' : 'none';
    saveOtEstado(ot.otNum, nuevoEstado, nuevoEstado.startsWith('Cancelada') ? (document.getElementById('motivoInput') ? document.getElementById('motivoInput').value : '') : '');
  });
  const motivoInput = document.getElementById('motivoInput');
  if (motivoInput) motivoInput.addEventListener('blur', () => saveOtEstado(ot.otNum, document.getElementById('estadoSelect').value, motivoInput.value));

  content.querySelectorAll('.pct-slider').forEach((el) => {
    el.addEventListener('input', () => {
      el.style.setProperty('--_pct', el.value + '%');
      const label = el.closest('.sub-row').querySelector('.sub-pct');
      if (label) label.textContent = el.value + '%';
    });
    el.addEventListener('change', () => {
      if (el.dataset.nombre) saveSubPct(Number(el.dataset.ot), el.dataset.nombre, Number(el.value));
      else saveOtPct(el.dataset.ot, Number(el.value));
    });
  });

  document.getElementById('btnToggleComentario').addEventListener('click', () => toggleComentario(state.selectedOtKey));
  const btnBorrar = document.getElementById('btnBorrarEmergente');
  if (btnBorrar) btnBorrar.addEventListener('click', () => eliminarEmergente(String(ot.otNum).replace('M-', '')));
  if (state.actividadAbierta) wireInlineForm();
}

// ---------------- Formulario inline de comentario/fotos ----------------

function toggleComentario(key) {
  if (state.actividadAbierta === key) {
    state.actividadAbierta = null;
  } else {
    state.actividadAbierta = key;
    state.fotoRows = [{ file: null, previewUrl: null, descripcion: '' }];
    state.bulletsDraft = '';
  }
  renderDetalle();
}

function renderInlineForm() {
  return `<div class="inline-form">
    <label class="field-label">Comentarios — una idea por línea, se listan como en el informe</label>
    <textarea id="bulletsInputInline" class="field-input" rows="4" placeholder="Se realizó el desajuste de pernos.&#10;Se realizó limpieza mecánica.&#10;Personal mecánico realizó maniobras manuales para retirar el componente.">${escapeHtml(state.bulletsDraft || '')}</textarea>
    <label class="field-label">Fotos</label>
    <div id="fotoRowsWrap"></div>
    <button type="button" id="btnAddFoto" class="btn-secundario">+ Agregar otra foto</button>
    <button type="button" id="btnGuardarBitacora" class="btn-principal">Guardar avance de esta actividad</button>
  </div>`;
}

function wireInlineForm() {
  const bulletsEl = document.getElementById('bulletsInputInline');
  if (!bulletsEl) return;
  bulletsEl.addEventListener('input', () => { state.bulletsDraft = bulletsEl.value; });
  document.getElementById('btnAddFoto').addEventListener('click', addFotoRow);
  document.getElementById('btnGuardarBitacora').addEventListener('click', guardarBitacora);
  renderFotoRows();
}

function addFotoRow() {
  state.fotoRows.push({ file: null, previewUrl: null, descripcion: '' });
  renderFotoRows();
}

function renderFotoRows() {
  const wrap = document.getElementById('fotoRowsWrap');
  if (!wrap) return;
  wrap.innerHTML = state.fotoRows.map((row, i) => `
    <div class="foto-row">
      <div class="foto-row-top">
        <label class="foto-pick-btn">
          📷 Tomar foto
          <input type="file" accept="image/*" capture="environment" class="foto-file-input" data-i="${i}" data-mode="camara">
        </label>
        <label class="foto-pick-btn foto-pick-btn-alt">
          🖼 Elegir de galería
          <input type="file" accept="image/*" class="foto-file-input" data-i="${i}" data-mode="galeria">
        </label>
        ${state.fotoRows.length > 1 ? `<button type="button" class="foto-row-remove" data-i="${i}">✕</button>` : ''}
      </div>
      ${row.previewUrl ? `<img class="foto-row-preview" src="${row.previewUrl}">` : (row.file ? `<p class="section-hint">${escapeHtml(row.file.name)}</p>` : '')}
      <input type="text" class="foto-desc-input" data-i="${i}" placeholder="Descripción de la foto (ej: Recepción de tuercas y arandelas)" value="${escapeHtml(row.descripcion).replace(/"/g, '&quot;')}">
    </div>`).join('');

  wrap.querySelectorAll('.foto-file-input').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const i = Number(inp.dataset.i);
      const file = e.target.files[0];
      if (!file) return;
      state.fotoRows[i].file = file;
      const reader = new FileReader();
      reader.onload = () => { state.fotoRows[i].previewUrl = reader.result; renderFotoRows(); };
      reader.readAsDataURL(file);
    });
  });
  wrap.querySelectorAll('.foto-desc-input').forEach((inp) => {
    inp.addEventListener('input', () => { state.fotoRows[Number(inp.dataset.i)].descripcion = inp.value; });
  });
  wrap.querySelectorAll('.foto-row-remove').forEach((btn) => {
    btn.addEventListener('click', () => { state.fotoRows.splice(Number(btn.dataset.i), 1); renderFotoRows(); });
  });
}

function setGuardando(on) {
  const btn = document.getElementById('btnGuardarBitacora');
  if (!btn) return;
  btn.disabled = on;
  btn.textContent = on ? 'Guardando…' : 'Guardar avance de esta actividad';
}

async function guardarBitacora() {
  const key = state.actividadAbierta;
  const ot = findOt(key);
  const fecha = document.getElementById('fechaInput').value;
  const tipo = state.turnoTipoSel;
  const bullets = (document.getElementById('bulletsInputInline').value || '')
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const fotosConFile = state.fotoRows.filter((r) => r.file);

  if (!bullets.length && !fotosConFile.length) {
    showToast('Agrega al menos un comentario o una foto antes de guardar');
    return;
  }

  setGuardando(true);
  try {
    const fotos = [];
    for (const row of fotosConFile) {
      const path = `paradas/${PARADA_ID}/bitacora/${INFORME_ID}/${Date.now()}_${row.file.name}`;
      const ref = state.storage.ref(path);
      await ref.put(row.file);
      const url = await ref.getDownloadURL();
      fotos.push({ url, descripcion: row.descripcion || '' });
    }
    const idx = getSelectedTurnoIdx();
    await bitacoraCollection().add({
      informeId: INFORME_ID,
      etapa: state.etapaSel,
      fecha,
      turnoTipo: tipo,
      turnoIdx: idx,
      otNum: key.startsWith('M-') ? key : Number(key),
      titulo: tituloDeActividad(ot),
      bullets,
      fotos,
      createdAt: Date.now(),
    });
    state.actividadAbierta = null;
    state.bulletsDraft = '';
    state.fotoRows = [];
    renderDetalle();
    showToast('Avance guardado ✓');
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar — revisa tu conexión e intenta de nuevo');
    setGuardando(false);
  }
}

// ---------------- Curva S (estilo Excel) ----------------

function calcularSerieCurvaS() {
  const ots = CATALOGO_OTS.filter((o) => state.otNumsIncluidos.includes(o.otNum));
  const totalHH = ots.reduce((s, ot) => s + ot.subactividades.reduce((s2, x) => s2 + x.pesoHH, 0), 0) || 1;
  const emergHH = state.manualEmergentes.reduce((s, e) => s + (e.pesoPlanHH || 0), 0);
  const turnos = INFORME_DATA.turnos;

  const plan = [], real = [], alcance = [], total = [];
  turnos.forEach((tISO, i) => {
    const t = new Date(tISO).getTime();
    let planHH = 0, realHH = 0;
    ots.forEach((ot) => {
      ot.subactividades.forEach((sub) => {
        const ini = new Date(sub.inicio).getTime();
        const fin = new Date(sub.fin).getTime();
        const frac = fin > ini ? Math.min(1, Math.max(0, (t - ini) / (fin - ini))) : (t >= ini ? 1 : 0);
        planHH += sub.pesoHH * frac;
        realHH += sub.pesoHH * (carryForward(state.liveSubs[subKey(ot.otNum, sub.nombre)] ? state.liveSubs[subKey(ot.otNum, sub.nombre)].avance : {}, i) / 100);
      });
    });
    let realEmergHH = 0;
    state.manualEmergentes.forEach((e) => {
      realEmergHH += (e.pesoPlanHH || 0) * (carryForward(state.liveOtAvance[e.otNum] || {}, i) / 100);
    });
    plan.push(planHH / totalHH * 100);
    real.push(realHH / totalHH * 100);
    alcance.push((totalHH + emergHH) / totalHH * 100);
    total.push((realHH + realEmergHH) / (totalHH + emergHH) * 100);
  });
  return { turnos, plan, real, alcance, total };
}

function renderCurvaS() {
  const wrap = document.getElementById('curvaSWrap');
  if (!wrap) return;
  const { turnos, plan, real, alcance, total } = calcularSerieCurvaS();

  const W = 520, H = 300, padL = 40, padR = 14, padT = 14, padB = 46;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const maxY = 120;
  const x = (i) => padL + (innerW * i) / (turnos.length - 1);
  const y = (v) => padT + innerH - (Math.min(v, maxY) / maxY) * innerH;

  function pathFor(serie) {
    return serie.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  }
  function dotsFor(serie, color) {
    return serie.map((v, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="2.6" fill="${color}"/>`).join('');
  }
  const gridLines = [0, 20, 40, 60, 80, 100, 120].map((v) => `
    <line x1="${padL}" y1="${y(v).toFixed(1)}" x2="${W - padR}" y2="${y(v).toFixed(1)}" stroke="#E4E4E0" stroke-width="1"/>
    <text x="${padL - 6}" y="${y(v).toFixed(1) - 2}" text-anchor="end" font-size="9" fill="#6A6A65" font-family="var(--sans)">${v}%</text>`).join('');
  const xLabels = turnos.map((t, i) => {
    if (i % 2 !== 0 && turnos.length > 6) return '';
    const d = new Date(t);
    const lbl = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}h`;
    return `<text x="${x(i).toFixed(1)}" y="${H - padB + 14}" text-anchor="middle" font-size="8.5" fill="#6A6A65" font-family="var(--sans)">${lbl}</text>`;
  }).join('');

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" class="curva-svg" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>
      ${gridLines}
      <path d="${pathFor(alcance)}" fill="none" stroke="#8FA7C4" stroke-width="1.6" stroke-dasharray="4,3"/>
      <path d="${pathFor(plan)}" fill="none" stroke="#1F3E8C" stroke-width="2.2"/>
      <path d="${pathFor(real)}" fill="none" stroke="#D93B3B" stroke-width="2.2"/>
      <path d="${pathFor(total)}" fill="none" stroke="#E8862C" stroke-width="2.2"/>
      ${dotsFor(plan, '#1F3E8C')}${dotsFor(real, '#D93B3B')}${dotsFor(total, '#E8862C')}
      ${xLabels}
    </svg>
    <div class="curva-legend">
      <span><i style="background:#1F3E8C"></i>Avance Planificado</span>
      <span><i style="background:#D93B3B"></i>Avance Real</span>
      <span><i style="background:#8FA7C4"></i>Alcance Emergentes</span>
      <span><i style="background:#E8862C"></i>Real Total</span>
    </div>
    <p class="curva-actual">Plan ${plan[plan.length - 1].toFixed(0)}% · Real ${real[real.length - 1].toFixed(0)}% · Total ${total[total.length - 1].toFixed(0)}%</p>
  `;
}

// ---------------- Picker: qué OT componen este informe ----------------

function abrirPicker() {
  state.pickerPendingSelection = state.otNumsIncluidos.slice();
  document.getElementById('pickerWrap').style.display = 'block';
  document.getElementById('btnTogglePicker').textContent = '✕ Cerrar';
  renderPickerList();
}
function cerrarPicker() {
  document.getElementById('pickerWrap').style.display = 'none';
  document.getElementById('btnTogglePicker').textContent = '✏️ Editar selección';
}
function togglePicker() {
  const abierto = document.getElementById('pickerWrap').style.display === 'block';
  if (abierto) cerrarPicker(); else abrirPicker();
}

function renderPickerList() {
  const areas = [...new Set(CATALOGO_OTS.map((o) => o.area))];
  const wrap = document.getElementById('pickerList');
  wrap.innerHTML = areas.map((area) => {
    const items = CATALOGO_OTS.filter((o) => o.area === area).map((ot) => {
      const checked = state.pickerPendingSelection.includes(ot.otNum);
      return `<label class="picker-row">
        <input type="checkbox" class="picker-check" data-ot="${ot.otNum}" ${checked ? 'checked' : ''}>
        <span class="picker-row-text"><b>OT ${ot.otNum}</b> — ${escapeHtml(ot.descripcion)} <i>(${ot.pesoPlanHH} HH · ${ot.cuadrilla})</i></span>
      </label>`;
    }).join('');
    return `<div class="picker-area-group"><div class="picker-area-title">${escapeHtml(area)}</div>${items}</div>`;
  }).join('');
  wrap.querySelectorAll('.picker-check').forEach((chk) => {
    chk.addEventListener('change', () => {
      const otNum = Number(chk.dataset.ot);
      if (chk.checked) { if (!state.pickerPendingSelection.includes(otNum)) state.pickerPendingSelection.push(otNum); }
      else { state.pickerPendingSelection = state.pickerPendingSelection.filter((n) => n !== otNum); }
    });
  });
}

async function guardarSeleccion() {
  if (!state.pickerPendingSelection.length) { showToast('Selecciona al menos una actividad'); return; }
  try {
    await informeConfigDoc().set({ otNumsIncluidos: state.pickerPendingSelection, updatedAt: Date.now() }, { merge: true });
    showToast('Actividades del informe actualizadas ✓');
    cerrarPicker();
  } catch (e) { console.error(e); showToast('No se pudo guardar la selección'); }
}

// ---------------- Actividad emergente ----------------

function abrirModalEmergente() {
  document.getElementById('emergNombre').value = '';
  document.getElementById('emergHH').value = '';
  document.getElementById('emergBackdrop').classList.add('open');
}
function cerrarModalEmergente() { document.getElementById('emergBackdrop').classList.remove('open'); }

async function crearEmergente() {
  const nombre = document.getElementById('emergNombre').value.trim();
  if (!nombre) { showToast('Escribe el nombre de la actividad'); return; }
  const hh = Number(document.getElementById('emergHH').value) || 0;
  try {
    await emergManualCollection().add({
      nombre, area: INFORME_DATA.area, hhEstimadas: hh,
      fechaDeteccion: document.getElementById('fechaInput').value, createdAt: Date.now(),
    });
    showToast('Actividad emergente creada ✓');
    cerrarModalEmergente();
  } catch (e) { console.error(e); showToast('No se pudo crear la actividad emergente'); }
}

async function eliminarEmergente(id) {
  if (!confirm('¿Eliminar esta actividad emergente? Esta acción no se puede deshacer.')) return;
  try {
    await emergManualCollection().doc(id).delete();
    if (state.selectedOtKey === 'M-' + id) state.selectedOtKey = null;
    showToast('Actividad emergente eliminada');
  } catch (e) { console.error(e); showToast('No se pudo eliminar'); }
}

// ---------------- PETS ----------------

function abrirModalPets() {
  document.getElementById('petsNombre').value = '';
  document.getElementById('petsArchivo').value = '';
  state.petsPendingOts = [];
  const wrap = document.getElementById('petsOtsList');
  const ots = otsDelInforme();
  wrap.innerHTML = ots.map((ot) => `<label class="picker-row">
    <input type="checkbox" class="pets-ot-check" data-ot="${ot.otNum}">
    <span class="picker-row-text">${escapeHtml(etiquetaCorta(ot))}</span>
  </label>`).join('') || '<p class="section-hint">No hay actividades en este informe todavía.</p>';
  wrap.querySelectorAll('.pets-ot-check').forEach((chk) => {
    chk.addEventListener('change', () => {
      const v = chk.dataset.ot;
      if (chk.checked) state.petsPendingOts.push(v);
      else state.petsPendingOts = state.petsPendingOts.filter((x) => x !== v);
    });
  });
  document.getElementById('petsBackdrop').classList.add('open');
}
function cerrarModalPets() { document.getElementById('petsBackdrop').classList.remove('open'); }

async function guardarPets() {
  const nombre = document.getElementById('petsNombre').value.trim();
  const file = document.getElementById('petsArchivo').files[0];
  if (!nombre) { showToast('Escribe el nombre del PETS'); return; }
  if (!file) { showToast('Elige el archivo PDF'); return; }
  if (!state.petsPendingOts.length) { showToast('Elige al menos una actividad'); return; }
  const btn = document.getElementById('petsSave');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const path = `paradas/${PARADA_ID}/pets/${Date.now()}_${file.name}`;
    const ref = state.storage.ref(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    await petsCollection().add({ nombre, url, otNums: state.petsPendingOts, createdAt: Date.now() });
    showToast('PETS guardado ✓');
    cerrarModalPets();
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar el PETS');
  }
  btn.disabled = false; btn.textContent = 'Guardar PETS';
}

// ---------------- Turno selector (etapa + fecha + Día/Noche) ----------------

function setEtapaToggleActive() {
  document.querySelectorAll('#etapaToggle button').forEach((b) => b.classList.toggle('active', b.dataset.etapa === state.etapaSel));
}
function setTurnoToggleActive() {
  document.querySelectorAll('#turnoToggle button').forEach((b) => b.classList.toggle('active', b.dataset.tipo === state.turnoTipoSel));
}

function renderTurnoHint() {
  const hint = document.getElementById('turnoHint');
  const fecha = document.getElementById('fechaInput').value;
  hint.textContent = `${state.etapaSel} — ${fmtFechaLarga(fecha)}, Turno ${state.turnoTipoSel}.`;
}

function onTurnoChange() {
  renderAll();
  renderCabecera();
  renderTurnoHint();
}

// ---------------- Init ----------------

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('paradaTitle').textContent = INFORME_DATA.paradaNombre;
  document.getElementById('paradaSub').textContent = INFORME_DATA.paradaSubtitulo;
  document.getElementById('informeTitulo').textContent = `Informe Nº ${INFORME_DATA.numero} — ${INFORME_DATA.titulo}`;
  document.getElementById('informeSub').textContent = `${INFORME_DATA.area} · Encargado: ${INFORME_DATA.encargado}`;

  const linkDrive = document.getElementById('linkDrive');
  if (typeof DRIVE_CERTIFICADOS_URL !== 'undefined' && DRIVE_CERTIFICADOS_URL) {
    linkDrive.href = DRIVE_CERTIFICADOS_URL;
  } else {
    linkDrive.classList.add('disabled');
    linkDrive.addEventListener('click', (e) => { e.preventDefault(); showToast('Aún no se ha cargado el link de Drive'); });
  }

  const fechaInput = document.getElementById('fechaInput');
  fechaInput.value = hoyISO();
  fechaInput.addEventListener('change', onTurnoChange);

  state.etapaSel = 'Parada';
  setEtapaToggleActive();
  document.querySelectorAll('#etapaToggle button').forEach((b) => {
    b.addEventListener('click', () => { state.etapaSel = b.dataset.etapa; setEtapaToggleActive(); onTurnoChange(); });
  });

  state.turnoTipoSel = tipoActualPorHora();
  setTurnoToggleActive();
  document.querySelectorAll('#turnoToggle button').forEach((b) => {
    b.addEventListener('click', () => { state.turnoTipoSel = b.dataset.tipo; setTurnoToggleActive(); onTurnoChange(); });
  });

  document.getElementById('btnGuardarCabecera').addEventListener('click', guardarCabecera);
  document.getElementById('btnTogglePicker').addEventListener('click', togglePicker);
  document.getElementById('btnGuardarSeleccion').addEventListener('click', guardarSeleccion);
  document.getElementById('btnAddEmergente').addEventListener('click', abrirModalEmergente);
  document.getElementById('emergCancel').addEventListener('click', cerrarModalEmergente);
  document.getElementById('emergSave').addEventListener('click', crearEmergente);
  document.getElementById('btnAddPets').addEventListener('click', abrirModalPets);
  document.getElementById('petsCancel').addEventListener('click', cerrarModalPets);
  document.getElementById('petsSave').addEventListener('click', guardarPets);

  renderTurnoHint();
  renderCabecera();
  initFirebase();
});
