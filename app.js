/* ============================================================
   Informe Nº 3 — Bitácora de fin de turno (Jameson / Fallback)
   Escribe en el MISMO Firebase y la MISMA parada que curva-s-semiva:
   - "subactividades" / "ots": mismo esquema que engine.js, así el % que
     se cargue aquí sigue alimentando la Curva S de esa app.
   - "emergentesManual": misma colección que usa la app principal.
   - "turnoHeaders": lo estándar de cada turno (charla, permisos,
     alistado, PETS, hora de bloqueo) — se guarda UNA vez por turno.
   - "bitacora": un documento por bloque de actividad (título en
     mayúscula + viñetas + fotos), asociado a un turno y una etapa.
   ============================================================ */

const CABECERA_ITEMS = [
  { key: 'charla', texto: 'Se llevó a cabo la charla de seguridad.' },
  { key: 'permisos', texto: 'Se procedió con el llenado de los permisos y aprobación con los encargados de área.' },
  { key: 'alistado', texto: 'Se realizó el alistado de herramientas con su respectiva documentación.' },
  { key: 'pets', texto: 'Se realizó la difusión del PETS para realizar el trabajo.' },
];

const state = {
  db: null,
  storage: null,
  liveSubs: {},       // subKey -> { avance: {"0": val, ...} }
  liveOtAvance: {},    // otNum (string, "M-xxx" para emergentes) -> { avance: {"0": val, ...} }
  manualEmergentes: [], // actividades emergentes de ESTA área, con forma de OT (sin subactividades)
  bitacora: [],         // bloques de actividad guardados
  turnoHeaders: {},     // docId `${etapa}::${fecha}::${turnoTipo}` -> data
  etapaSel: 'Parada',
  turnoTipoSel: 'Día',
  fotoRows: [],
  actividadAbierta: null, // key del formulario inline abierto ('general', otNum numérico o 'M-xxx')
  otNumsIncluidos: DEFAULT_OT_NUMS.slice(),
  pickerPendingSelection: [],
};

// Firestore no permite "/" dentro de un ID de documento (lo interpreta como separador de
// ruta y revienta con "Invalid document reference"). Solo se sanitiza esa comilla — todo lo
// demás (espacios, tildes, paréntesis) queda igual que antes para no romper IDs ya guardados.
function subKey(otNum, nombre) { return otNum + '::' + nombre.replace(/\//g, '-'); }

function subsCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('subactividades'); }
function otsCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('ots'); }
function emergManualCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('emergentesManual'); }
function bitacoraCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('bitacora'); }
function turnoHeadersCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('turnoHeaders'); }
function informeConfigDoc() { return state.db.collection('paradas').doc(PARADA_ID).collection('informes').doc(INFORME_ID); }

function turnoHeaderKey(etapa, fecha, turnoTipo) { return `${etapa}::${fecha}::${turnoTipo}`; }

// Actividades SIEMPRE activas — no se filtran por fecha del Gantt (el trabajo real no avanza
// en simultáneo con lo planificado). "Editar selección" define qué OT pertenecen al informe;
// una vez incluida, una OT queda disponible en todo momento, sin importar la fecha elegida.
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

// Índice de turno calculado dinámicamente (cada 12h desde el primer turno de la parada) — a
// diferencia de buscar la fecha en una lista fija, esto SIEMPRE da un valor válido, incluso
// para fechas fuera del rango original planificado. Así ninguna actividad queda "inactiva".
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

function tituloDeActividad(key) {
  if (key === 'general') return 'GENERAL DEL TURNO';
  const ot = CATALOGO_OTS.find((o) => o.otNum === Number(key))
    || state.manualEmergentes.find((o) => o.otNum === String(key));
  return ot ? ot.descripcion.toUpperCase() : `OT ${key}`;
}

function otLabel(otNum) {
  if (!otNum) return 'General del turno';
  const ot = CATALOGO_OTS.find((o) => o.otNum === Number(otNum))
    || state.manualEmergentes.find((o) => o.otNum === String(otNum));
  return ot ? `OT ${ot.otNum} — ${ot.descripcion}` : `OT ${otNum}`;
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
      Object.keys(d).forEach((k) => {
        if (k.startsWith('avance.')) avance[k.replace('avance.', '')] = d[k];
      });
      if (d.avance && typeof d.avance === 'object') Object.assign(avance, d.avance);
      state.liveSubs[doc.id] = { avance };
    });
    renderActividades();
  }, (err) => { console.error('subs error:', err); setConn(false); });
}

function listenOtsAvance() {
  otsCollection().onSnapshot((snap) => {
    snap.forEach((doc) => {
      const d = doc.data() || {};
      const avance = {};
      Object.keys(d).forEach((k) => {
        if (k.startsWith('avance.')) avance[k.replace('avance.', '')] = d[k];
      });
      if (d.avance && typeof d.avance === 'object') Object.assign(avance, d.avance);
      state.liveOtAvance[doc.id] = avance;
    });
    renderActividades();
  }, (err) => { console.error('ots avance error:', err); setConn(false); });
}

function listenEmergentes() {
  emergManualCollection().onSnapshot((snap) => {
    state.manualEmergentes = [];
    snap.forEach((doc) => {
      const d = doc.data();
      if (d.area !== INFORME_DATA.area) return; // solo las emergentes de esta área/informe
      state.manualEmergentes.push({
        otNum: 'M-' + doc.id, cuadrilla: '-', area: d.area, tipo: 'Emergente',
        descripcion: d.nombre, pesoPlanHH: d.hhEstimadas || 0,
        inicio: d.fechaDeteccion, fin: d.fechaDeteccion, subactividades: [], manual: true,
      });
    });
    renderActividades();
  }, (err) => { console.error('emergentes error:', err); setConn(false); });
}

function listenBitacora() {
  bitacoraCollection().where('informeId', '==', INFORME_ID).onSnapshot((snap) => {
    state.bitacora = [];
    snap.forEach((doc) => state.bitacora.push({ id: doc.id, ...doc.data() }));
    state.bitacora.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    renderBitacora();
    setConn(true);
  }, (err) => { console.error('bitacora error:', err); setConn(false); });
}

function listenTurnoHeaders() {
  turnoHeadersCollection().onSnapshot((snap) => {
    state.turnoHeaders = {};
    snap.forEach((doc) => { state.turnoHeaders[doc.id] = doc.data(); });
    renderCabecera();
    renderBitacora();
  }, (err) => { console.error('turnoHeaders error:', err); setConn(false); });
}

function listenInformeConfig() {
  informeConfigDoc().onSnapshot((doc) => {
    const d = doc.data();
    state.otNumsIncluidos = (d && Array.isArray(d.otNumsIncluidos) && d.otNumsIncluidos.length)
      ? d.otNumsIncluidos : DEFAULT_OT_NUMS.slice();
    renderActividades();
    renderResumenSeleccion();
  }, (err) => { console.error('informe config error:', err); setConn(false); });
}

async function saveSubPct(otNum, nombreCodificado, pct) {
  const idx = getSelectedTurnoIdx();
  const nombre = decodeURIComponent(nombreCodificado);
  const ref = subsCollection().doc(subKey(otNum, nombre));
  const valor = pct === 0 ? firebase.firestore.FieldValue.delete() : pct;
  try {
    await ref.set({ [`avance.${idx}`]: valor, updatedAt: Date.now() }, { merge: true });
    showToast('Avance guardado ✓ (se refleja en la Curva S)');
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar el avance — revisa tu conexión');
  }
}

async function saveOtPct(otNum, pct) {
  const idx = getSelectedTurnoIdx();
  const ref = otsCollection().doc(String(otNum));
  const valor = pct === 0 ? firebase.firestore.FieldValue.delete() : pct;
  try {
    await ref.set({ [`avance.${idx}`]: valor, updatedAt: Date.now() }, { merge: true });
    showToast('Avance guardado ✓');
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar el avance — revisa tu conexión');
  }
}

// ---------------- Cabecera del turno ----------------

function cabeceraActualKey() {
  return turnoHeaderKey(state.etapaSel, document.getElementById('fechaInput').value, state.turnoTipoSel);
}

function renderCabecera() {
  const wrap = document.getElementById('cabeceraItems');
  const guardada = state.turnoHeaders[cabeceraActualKey()] || {};
  wrap.innerHTML = CABECERA_ITEMS.map((item) => {
    const checked = guardada[item.key] !== undefined ? guardada[item.key] : true;
    return `<label class="cabecera-row">
      <input type="checkbox" class="cabecera-check" data-key="${item.key}" ${checked ? 'checked' : ''}>
      <span>${escapeHtml(item.texto)}</span>
    </label>`;
  }).join('');
  document.getElementById('horaBloqueoInput').value = guardada.horaBloqueo || '';
}

async function guardarCabecera() {
  const payload = { etapa: state.etapaSel, fecha: document.getElementById('fechaInput').value, turnoTipo: state.turnoTipoSel };
  document.querySelectorAll('.cabecera-check').forEach((chk) => { payload[chk.dataset.key] = chk.checked; });
  payload.horaBloqueo = document.getElementById('horaBloqueoInput').value || '';
  payload.updatedAt = Date.now();
  try {
    await turnoHeadersCollection().doc(cabeceraActualKey()).set(payload, { merge: true });
    showToast('Cabecera del turno guardada ✓');
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar la cabecera — revisa tu conexión');
  }
}

function bulletsDeCabecera(header) {
  if (!header) return [];
  const bullets = CABECERA_ITEMS.filter((item) => header[item.key] !== false).map((item) => item.texto);
  if (header.horaBloqueo) bullets.push(`Se realizó el bloqueo a las ${header.horaBloqueo} h.`);
  return bullets;
}

// ---------------- Render: Actividades (siempre activas) ----------------

function renderActividades() {
  const wrap = document.getElementById('actividadesWrap');
  const ots = otsDelInforme();
  let html = renderActividadCard('general', 'GENERAL DEL TURNO', 'Comentarios que no son de una actividad puntual.', null);
  if (!ots.length) {
    html += '<p class="empty-hint">Aún no defines qué actividades componen este informe — usa "✏️ Editar selección" arriba.</p>';
  } else {
    html += ots.map((ot) => renderOtCard(ot)).join('');
  }
  wrap.innerHTML = html;

  wrap.querySelectorAll('.pct-slider').forEach((el) => {
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
  wrap.querySelectorAll('.btn-toggle-comentario').forEach((btn) => {
    btn.addEventListener('click', () => toggleComentario(btn.dataset.key));
  });
  wrap.querySelectorAll('.btn-borrar-emergente').forEach((btn) => {
    btn.addEventListener('click', () => eliminarEmergente(btn.dataset.id));
  });
  if (state.actividadAbierta) wireInlineForm();
}

function renderResumenSeleccion() {
  const ots = CATALOGO_OTS.filter((ot) => state.otNumsIncluidos.includes(ot.otNum));
  const totalHH = ots.reduce((s, o) => s + o.pesoPlanHH, 0);
  const el = document.getElementById('resumenSeleccion');
  el.textContent = ots.length
    ? `${ots.length} actividad${ots.length === 1 ? '' : 'es'} incluida${ots.length === 1 ? '' : 's'} · ${totalHH} HH planificadas`
    : 'Sin actividades definidas todavía.';
}

function renderOtCard(ot) {
  const esEmergente = !!ot.manual;
  const keyStr = String(ot.otNum);
  let sliders;
  if (esEmergente) {
    const pct = pctActualDeOt(ot.otNum);
    sliders = `<div class="sub-row">
      <div class="sub-row-top"><span class="sub-name">Avance</span><span class="sub-pct">${pct}%</span></div>
      <input type="range" class="pct-slider" style="--_pct:${pct}%" min="0" max="100" step="10" value="${pct}" data-ot="${ot.otNum}">
    </div>`;
  } else {
    sliders = ot.subactividades.map((sub) => {
      const pct = pctActualDeSub(ot.otNum, sub.nombre);
      const nombreEnc = encodeURIComponent(sub.nombre);
      return `<div class="sub-row">
        <div class="sub-row-top">
          <span class="sub-name">${escapeHtml(sub.nombre)}</span>
          <span class="sub-pct">${pct}%</span>
        </div>
        <div class="sub-meta">${sub.pesoHH} HH · ${fmtHora(sub.inicio)} → ${fmtHora(sub.fin)}</div>
        <input type="range" class="pct-slider" style="--_pct:${pct}%" min="0" max="100" step="10" value="${pct}" data-ot="${ot.otNum}" data-nombre="${nombreEnc}">
      </div>`;
    }).join('');
  }
  const cardClass = esEmergente ? 'ot-card ot-card-emergente' : 'ot-card';
  const tag = esEmergente ? ' <span class="tag-emergente">EMERGENTE</span>' : '';
  const meta = esEmergente
    ? `${ot.pesoPlanHH ? ot.pesoPlanHH + ' HH estimadas · ' : ''}Detectada ${ot.fin ? fmtFechaLarga(ot.fin.slice(0, 10)) : ''}`
    : `${ot.pesoPlanHH} HH · Cuadrilla ${ot.cuadrilla} · OT ${ot.otNum}`;
  const btnBorrar = esEmergente ? `<button type="button" class="btn-borrar-emergente" data-id="${ot.otNum.replace('M-', '')}">🗑 Eliminar actividad emergente</button>` : '';
  return `<div class="${cardClass}">
    <div class="ot-card-head">${escapeHtml(ot.descripcion.toUpperCase())}${tag}</div>
    <div class="ot-card-meta">${meta}</div>
    ${sliders}
    <button type="button" class="btn-toggle-comentario" data-key="${keyStr}">📝 Agregar comentario / fotos</button>
    <div class="inline-form-slot" data-slot="${keyStr}">${state.actividadAbierta === keyStr ? renderInlineForm() : ''}</div>
    ${btnBorrar}
  </div>`;
}

function renderActividadCard(key, titulo, subtitulo, meta) {
  return `<div class="ot-card ot-card-general">
    <div class="ot-card-head">${escapeHtml(titulo)}</div>
    <div class="ot-card-meta">${escapeHtml(subtitulo)}</div>
    <button type="button" class="btn-toggle-comentario" data-key="${key}">📝 Agregar comentario / fotos</button>
    <div class="inline-form-slot" data-slot="${key}">${state.actividadAbierta === key ? renderInlineForm() : ''}</div>
  </div>`;
}

// ---------------- Formulario inline (por actividad) ----------------

function toggleComentario(key) {
  if (state.actividadAbierta === key) {
    state.actividadAbierta = null;
  } else {
    state.actividadAbierta = key;
    state.fotoRows = [{ file: null, previewUrl: null, descripcion: '' }];
    state.bulletsDraft = '';
  }
  renderActividades();
}

function renderInlineForm() {
  return `<div class="inline-form">
    <label class="field-label">Comentarios — una idea por línea, se listan como en el informe</label>
    <textarea id="bulletsInputInline" class="field-input" rows="4" placeholder="Se soldó e instaló el ducto nuevo de 8'' en sector norte.&#10;Se dio inicio al cambio del ducto concentrado.">${escapeHtml(state.bulletsDraft || '')}</textarea>
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
          📷 ${row.file ? 'Cambiar foto' : 'Elegir foto'}
          <input type="file" accept="image/*" capture="environment" class="foto-file-input" data-i="${i}">
        </label>
        ${state.fotoRows.length > 1 ? `<button type="button" class="foto-row-remove" data-i="${i}">✕</button>` : ''}
      </div>
      ${row.previewUrl ? `<img class="foto-row-preview" src="${row.previewUrl}">` : ''}
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
      otNum: key === 'general' ? null : (String(key).startsWith('M-') ? key : Number(key)),
      titulo: tituloDeActividad(key),
      bullets,
      fotos,
      createdAt: Date.now(),
    });
    state.actividadAbierta = null;
    state.bulletsDraft = '';
    state.fotoRows = [];
    renderActividades();
    showToast('Avance guardado ✓');
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar — revisa tu conexión e intenta de nuevo');
    setGuardando(false);
  }
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
      if (chk.checked) {
        if (!state.pickerPendingSelection.includes(otNum)) state.pickerPendingSelection.push(otNum);
      } else {
        state.pickerPendingSelection = state.pickerPendingSelection.filter((n) => n !== otNum);
      }
    });
  });
}

async function guardarSeleccion() {
  if (!state.pickerPendingSelection.length) { showToast('Selecciona al menos una actividad'); return; }
  try {
    await informeConfigDoc().set({ otNumsIncluidos: state.pickerPendingSelection, updatedAt: Date.now() }, { merge: true });
    showToast('Actividades del informe actualizadas ✓');
    cerrarPicker();
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar la selección — revisa tu conexión');
  }
}

// ---------------- Render: Bitácora (feed estilo informe, con etapas) ----------------

function renderBitacora() {
  const wrap = document.getElementById('bitacoraFeed');
  const gruposMap = new Map(); // key etapa::fecha::turno -> { etapa, fecha, turnoTipo, entries: [] }

  function grupo(etapa, fecha, turnoTipo) {
    const k = turnoHeaderKey(etapa, fecha, turnoTipo);
    if (!gruposMap.has(k)) gruposMap.set(k, { etapa, fecha, turnoTipo, entries: [] });
    return gruposMap.get(k);
  }

  Object.values(state.turnoHeaders).forEach((h) => { grupo(h.etapa, h.fecha, h.turnoTipo); });
  state.bitacora.forEach((entry) => { grupo(entry.etapa, entry.fecha, entry.turnoTipo).entries.push(entry); });

  const grupos = [...gruposMap.values()].sort((a, b) => {
    if (a.etapa !== b.etapa) return a.etapa === 'Preparativos' ? -1 : 1;
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    const orden = { 'Día': 0, 'Noche': 1 };
    return orden[a.turnoTipo] - orden[b.turnoTipo];
  });

  if (!grupos.length) {
    wrap.innerHTML = '<p class="empty-hint">Aún no hay avances registrados para este informe. Usa "Cabecera del turno" y las actividades de arriba.</p>';
    return;
  }

  let html = '';
  let etapaActual = null;
  grupos.forEach((g) => {
    if (g.etapa !== etapaActual) {
      etapaActual = g.etapa;
      html += `<div class="etapa-banner">${etapaActual === 'Preparativos' ? '4.1 ACTIVIDADES REALIZADAS EN PERIODO DE PREPARATIVOS' : '4.2 ACTIVIDADES DE LA ETAPA DE PARADA'}</div>`;
    }
    html += renderGrupoHTML(g);
  });
  wrap.innerHTML = html;
  wrap.querySelectorAll('.btn-borrar-entrada').forEach((btn) => {
    btn.addEventListener('click', () => borrarEntrada(btn.dataset.id));
  });
}

function renderGrupoHTML(g) {
  const header = state.turnoHeaders[turnoHeaderKey(g.etapa, g.fecha, g.turnoTipo)];
  let html = `<div class="fecha-banner">FECHA: ${fmtFechaLarga(g.fecha)}</div>
    <div class="turno-banner">TURNO ${g.turnoTipo.toUpperCase()}</div>`;

  const cabeceraBullets = bulletsDeCabecera(header);
  if (cabeceraBullets.length) {
    html += `<div class="bitacora-entry entry-cabecera"><ul class="entry-bullets">${cabeceraBullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul></div>`;
  }

  g.entries.forEach((entry) => {
    html += `<div class="bitacora-entry">
      <div class="entry-head">
        <span class="entry-titulo">${escapeHtml(entry.titulo || otLabel(entry.otNum))}</span>
        <button type="button" class="btn-borrar-entrada" data-id="${entry.id}" title="Eliminar esta entrada">🗑</button>
      </div>`;
    if (entry.otNum) html += `<div class="entry-ot-tag">${escapeHtml(otLabel(entry.otNum))}</div>`;
    if (entry.bullets && entry.bullets.length) {
      html += `<ul class="entry-bullets">${entry.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join('')}</ul>`;
    }
    if (entry.fotos && entry.fotos.length) {
      html += '<div class="entry-fotos">';
      entry.fotos.forEach((f, i) => {
        html += `<div class="entry-foto">
          <img src="${f.url}" loading="lazy" alt="Imagen ${i + 1}">
          <div class="entry-foto-cap"><b>Imagen ${i + 1}</b>${f.descripcion ? ' — ' + escapeHtml(f.descripcion) : ''}</div>
        </div>`;
      });
      html += '</div>';
    }
    html += '</div>';
  });
  return html;
}

async function borrarEntrada(id) {
  if (!confirm('¿Eliminar esta entrada de la bitácora? Esta acción no se puede deshacer.')) return;
  try {
    await bitacoraCollection().doc(id).delete();
    showToast('Entrada eliminada');
  } catch (e) {
    console.error(e);
    showToast('No se pudo eliminar');
  }
}

// ---------------- Actividad emergente ----------------

function abrirModalEmergente() {
  document.getElementById('emergNombre').value = '';
  document.getElementById('emergHH').value = '';
  document.getElementById('emergBackdrop').classList.add('open');
}
function cerrarModalEmergente() {
  document.getElementById('emergBackdrop').classList.remove('open');
}

async function crearEmergente() {
  const nombre = document.getElementById('emergNombre').value.trim();
  if (!nombre) { showToast('Escribe el nombre de la actividad'); return; }
  const hh = Number(document.getElementById('emergHH').value) || 0;
  try {
    await emergManualCollection().add({
      nombre,
      area: INFORME_DATA.area,
      hhEstimadas: hh,
      fechaDeteccion: document.getElementById('fechaInput').value,
      createdAt: Date.now(),
    });
    showToast('Actividad emergente creada ✓');
    cerrarModalEmergente();
  } catch (e) {
    console.error(e);
    showToast('No se pudo crear la actividad emergente');
  }
}

async function eliminarEmergente(id) {
  if (!confirm('¿Eliminar esta actividad emergente? Esta acción no se puede deshacer.')) return;
  try {
    await emergManualCollection().doc(id).delete();
    showToast('Actividad emergente eliminada');
  } catch (e) {
    console.error(e);
    showToast('No se pudo eliminar');
  }
}

// ---------------- Turno selector (etapa + fecha + Día/Noche) ----------------

function setEtapaToggleActive() {
  document.querySelectorAll('#etapaToggle button').forEach((b) => {
    b.classList.toggle('active', b.dataset.etapa === state.etapaSel);
  });
}
function setTurnoToggleActive() {
  document.querySelectorAll('#turnoToggle button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tipo === state.turnoTipoSel);
  });
}

function renderTurnoHint() {
  const hint = document.getElementById('turnoHint');
  const fecha = document.getElementById('fechaInput').value;
  hint.textContent = `${state.etapaSel} — ${fmtFechaLarga(fecha)}, Turno ${state.turnoTipoSel}.`;
  hint.classList.remove('warn');
}

function onTurnoChange() {
  renderActividades();
  renderCabecera();
  renderBitacora();
  renderTurnoHint();
}

// ---------------- Init ----------------

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('paradaTitle').textContent = INFORME_DATA.paradaNombre;
  document.getElementById('paradaSub').textContent = INFORME_DATA.paradaSubtitulo;
  document.getElementById('informeTitulo').textContent = `Informe Nº ${INFORME_DATA.numero} — ${INFORME_DATA.titulo}`;
  document.getElementById('informeSub').textContent = `${INFORME_DATA.area} · Encargado: ${INFORME_DATA.encargado}`;

  const fechaInput = document.getElementById('fechaInput');
  fechaInput.value = hoyISO(); // siempre la fecha real actual — editable después
  fechaInput.addEventListener('change', onTurnoChange);

  state.etapaSel = 'Parada';
  setEtapaToggleActive();
  document.querySelectorAll('#etapaToggle button').forEach((b) => {
    b.addEventListener('click', () => { state.etapaSel = b.dataset.etapa; setEtapaToggleActive(); onTurnoChange(); });
  });

  state.turnoTipoSel = tipoActualPorHora();
  setTurnoToggleActive();
  document.querySelectorAll('#turnoToggle button').forEach((b) => {
    b.addEventListener('click', () => {
      state.turnoTipoSel = b.dataset.tipo;
      setTurnoToggleActive();
      onTurnoChange();
    });
  });

  document.getElementById('btnGuardarCabecera').addEventListener('click', guardarCabecera);

  document.getElementById('btnTogglePicker').addEventListener('click', togglePicker);
  document.getElementById('btnGuardarSeleccion').addEventListener('click', guardarSeleccion);

  document.getElementById('btnAddEmergente').addEventListener('click', abrirModalEmergente);
  document.getElementById('emergCancel').addEventListener('click', cerrarModalEmergente);
  document.getElementById('emergSave').addEventListener('click', crearEmergente);

  renderTurnoHint();
  initFirebase();
});
