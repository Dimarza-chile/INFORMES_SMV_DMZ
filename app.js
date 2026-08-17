/* ============================================================
   Informe Nº 3 — Bitácora de fin de turno (Jameson / Fallback)
   Escribe en el MISMO Firebase y la MISMA parada que curva-s-semiva:
   - Colección "subactividades": igual esquema (subKey + avance.N) para
     que el % que se cargue aquí siga alimentando la Curva S de esa app.
   - Colección nueva "bitacora": texto + fotos por turno, propia de este
     informe (filtrada por informeId), para armar después el Word IT-MEL.
   ============================================================ */

const state = {
  db: null,
  storage: null,
  liveSubs: {},     // subKey -> { avance: {"0": val, ...} }
  liveOtAvance: {},  // otNum (string, "M-xxx" para emergentes) -> { avance: {"0": val, ...} }
  manualEmergentes: [], // actividades emergentes de ESTA área, con forma de OT (sin subactividades)
  bitacora: [],      // entradas de bitácora de este informe, ya ordenadas
  turnoTipoSel: 'Día',
  fotoRows: [],
  otNumsIncluidos: DEFAULT_OT_NUMS.slice(),  // qué OT componen este informe (vive en Firestore)
  pickerPendingSelection: [],                 // selección en edición dentro del picker, sin guardar aún
};

// Firestore no permite "/" dentro de un ID de documento (lo interpreta como separador de
// ruta y revienta con "Invalid document reference"). Solo se sanitiza esa comilla — todo lo
// demás (espacios, tildes, paréntesis) queda igual que antes para no romper IDs ya guardados.
function subKey(otNum, nombre) { return otNum + '::' + nombre.replace(/\//g, '-'); }

function subsCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('subactividades'); }
function otsCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('ots'); }
function emergManualCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('emergentesManual'); }
function bitacoraCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('bitacora'); }
function informeConfigDoc() { return state.db.collection('paradas').doc(PARADA_ID).collection('informes').doc(INFORME_ID); }

// Misma colección "emergentesManual" que usa curva-s-semiva — así una emergente creada
// aquí también aparece allá. Se filtra por área para mostrar solo las de este informe.
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

function defaultFecha() {
  const hoyStr = new Date().toISOString().slice(0, 10);
  const min = INFORME_DATA.turnos[0].slice(0, 10);
  const max = INFORME_DATA.turnos[INFORME_DATA.turnos.length - 1].slice(0, 10);
  if (hoyStr < min) return min;
  if (hoyStr > max) return max;
  return hoyStr;
}

function getSelectedTurnoIdx() {
  const fecha = document.getElementById('fechaInput').value;
  const hora = state.turnoTipoSel === 'Día' ? '08:00:00' : '20:00:00';
  const iso = `${fecha}T${hora}`;
  return INFORME_DATA.turnos.indexOf(iso);
}

function pctActualDeSub(otNum, nombre) {
  const rec = state.liveSubs[subKey(otNum, nombre)];
  if (!rec) return 0;
  const idx = getSelectedTurnoIdx();
  const maxIdx = idx === -1 ? INFORME_DATA.turnos.length - 1 : idx;
  return carryForward(rec.avance, maxIdx);
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

function otLabel(otNum) {
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

function listenBitacora() {
  bitacoraCollection().where('informeId', '==', INFORME_ID).onSnapshot((snap) => {
    state.bitacora = [];
    snap.forEach((doc) => state.bitacora.push({ id: doc.id, ...doc.data() }));
    state.bitacora.sort((a, b) => {
      if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
      const orden = { 'Día': 0, 'Noche': 1 };
      if (orden[a.turnoTipo] !== orden[b.turnoTipo]) return orden[a.turnoTipo] - orden[b.turnoTipo];
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
    renderBitacora();
    setConn(true);
  }, (err) => { console.error('bitacora error:', err); setConn(false); });
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
    populateOtSelect();
  }, (err) => { console.error('emergentes error:', err); setConn(false); });
}

function listenInformeConfig() {
  informeConfigDoc().onSnapshot((doc) => {
    const d = doc.data();
    state.otNumsIncluidos = (d && Array.isArray(d.otNumsIncluidos) && d.otNumsIncluidos.length)
      ? d.otNumsIncluidos : DEFAULT_OT_NUMS.slice();
    renderActividades();
    renderResumenSeleccion();
    populateOtSelect();
  }, (err) => { console.error('informe config error:', err); setConn(false); });
}

async function saveSubPct(otNum, nombreCodificado, pct) {
  const idx = getSelectedTurnoIdx();
  if (idx === -1) { showToast('Elige una fecha dentro del rango de la parada para actualizar el %'); return; }
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
  if (idx === -1) { showToast('Elige una fecha dentro del rango de la parada para actualizar el %'); return; }
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

function pctActualDeOt(otNum) {
  const rec = state.liveOtAvance[otNum];
  if (!rec) return 0;
  const idx = getSelectedTurnoIdx();
  const maxIdx = idx === -1 ? INFORME_DATA.turnos.length - 1 : idx;
  return carryForward(rec, maxIdx);
}

// ---------------- Render: Actividades / Gantt del informe ----------------

function renderActividades() {
  const wrap = document.getElementById('actividadesWrap');
  const ots = otsDelInforme();
  if (!ots.length) {
    wrap.innerHTML = '<p class="empty-hint">Aún no defines qué actividades componen este informe — usa "✏️ Editar selección" arriba.</p>';
    return;
  }
  const idx = getSelectedTurnoIdx();
  const fueraDeRango = idx === -1;
  wrap.innerHTML = ots.map((ot) => renderOtCard(ot, fueraDeRango)).join('');
  wrap.querySelectorAll('.pct-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      saveSubPct(Number(btn.dataset.ot), btn.dataset.nombre, Number(btn.dataset.v));
    });
  });
  wrap.querySelectorAll('.pct-btn-ot').forEach((btn) => {
    btn.addEventListener('click', () => {
      saveOtPct(btn.dataset.ot, Number(btn.dataset.v));
    });
  });
  wrap.querySelectorAll('.btn-borrar-emergente').forEach((btn) => {
    btn.addEventListener('click', () => eliminarEmergente(btn.dataset.id));
  });
}

function renderResumenSeleccion() {
  const ots = otsDelInforme();
  const totalHH = ots.reduce((s, o) => s + o.pesoPlanHH, 0);
  const el = document.getElementById('resumenSeleccion');
  el.textContent = ots.length
    ? `${ots.length} actividad${ots.length === 1 ? '' : 'es'} incluida${ots.length === 1 ? '' : 's'} · ${totalHH} HH planificadas`
    : 'Sin actividades definidas todavía.';
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

function renderOtCard(ot, fueraDeRango) {
  if (ot.manual) {
    const pct = pctActualDeOt(ot.otNum);
    return `<div class="ot-card ot-card-emergente">
      <div class="ot-card-head">⚡ ${escapeHtml(ot.descripcion)} <span class="tag-emergente">EMERGENTE</span></div>
      <div class="ot-card-meta">${ot.pesoPlanHH ? ot.pesoPlanHH + ' HH estimadas · ' : ''}Detectada ${fmtFechaLarga((ot.fin || '').slice(0, 10) || defaultFecha())}</div>
      <div class="sub-row">
        <div class="sub-row-top">
          <span class="sub-name">Avance</span>
          <span class="sub-pct">${pct}%</span>
        </div>
        <div class="pct-btns" ${fueraDeRango ? 'style="opacity:.4;pointer-events:none;"' : ''}>
          ${[0, 25, 50, 75, 100].map((v) => `<button type="button" class="pct-btn-ot ${pct === v ? 'active' : ''}" data-ot="${ot.otNum}" data-v="${v}">${v}%</button>`).join('')}
        </div>
      </div>
      <button type="button" class="btn-borrar-emergente" data-id="${ot.otNum.replace('M-', '')}">🗑 Eliminar actividad emergente</button>
    </div>`;
  }
  const subsHtml = ot.subactividades.map((sub) => {
    const pct = pctActualDeSub(ot.otNum, sub.nombre);
    const nombreEnc = encodeURIComponent(sub.nombre);
    return `<div class="sub-row">
      <div class="sub-row-top">
        <span class="sub-name">${escapeHtml(sub.nombre)}</span>
        <span class="sub-pct">${pct}%</span>
      </div>
      <div class="sub-meta">${sub.pesoHH} HH · ${fmtHora(sub.inicio)} → ${fmtHora(sub.fin)}</div>
      <div class="pct-btns" ${fueraDeRango ? 'style="opacity:.4;pointer-events:none;"' : ''}>
        ${[0, 25, 50, 75, 100].map((v) => `<button type="button" class="pct-btn ${pct === v ? 'active' : ''}" data-ot="${ot.otNum}" data-nombre="${nombreEnc}" data-v="${v}">${v}%</button>`).join('')}
      </div>
    </div>`;
  }).join('');
  return `<div class="ot-card">
    <div class="ot-card-head">OT ${ot.otNum} — ${escapeHtml(ot.descripcion)}</div>
    <div class="ot-card-meta">${ot.pesoPlanHH} HH · Cuadrilla ${ot.cuadrilla} · ${ot.subactividades.length} subactividad${ot.subactividades.length === 1 ? '' : 'es'}</div>
    ${subsHtml}
  </div>`;
}

// ---------------- Render: Bitácora (feed estilo informe) ----------------

function renderBitacora() {
  const wrap = document.getElementById('bitacoraFeed');
  if (!state.bitacora.length) {
    wrap.innerHTML = '<p class="empty-hint">Aún no hay avances registrados para este informe. Usa el formulario de arriba al terminar cada turno.</p>';
    return;
  }
  const grupos = [];
  let cur = null;
  state.bitacora.forEach((entry) => {
    const key = entry.fecha + '::' + entry.turnoTipo;
    if (!cur || cur.key !== key) {
      cur = { key, fecha: entry.fecha, turnoTipo: entry.turnoTipo, entries: [] };
      grupos.push(cur);
    }
    cur.entries.push(entry);
  });
  wrap.innerHTML = grupos.map(renderGrupoHTML).join('');
  wrap.querySelectorAll('.btn-borrar-entrada').forEach((btn) => {
    btn.addEventListener('click', () => borrarEntrada(btn.dataset.id));
  });
}

function renderGrupoHTML(g) {
  let html = `<div class="fecha-banner">FECHA: ${fmtFechaLarga(g.fecha)}</div>
    <div class="turno-banner">TURNO ${g.turnoTipo.toUpperCase()}</div>`;
  g.entries.forEach((entry) => {
    const otTag = entry.otNum ? otLabel(entry.otNum) : 'General del área';
    html += `<div class="bitacora-entry">
      <div class="entry-head">
        <span class="entry-ot-tag">${escapeHtml(otTag)}</span>
        <button type="button" class="btn-borrar-entrada" data-id="${entry.id}" title="Eliminar esta entrada">🗑</button>
      </div>`;
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

// ---------------- Formulario de carga ----------------

function populateOtSelect() {
  const sel = document.getElementById('otSelect');
  const valorPrevio = sel.value;
  sel.innerHTML = '<option value="">General del turno (toda el área)</option>' +
    otsDelInforme().map((ot) => `<option value="${ot.otNum}">OT ${ot.otNum} — ${escapeHtml(ot.descripcion)}</option>`).join('');
  if ([...sel.options].some((o) => o.value === valorPrevio)) sel.value = valorPrevio;
}

function addFotoRow() {
  state.fotoRows.push({ file: null, previewUrl: null, descripcion: '' });
  renderFotoRows();
}

function renderFotoRows() {
  const wrap = document.getElementById('fotoRowsWrap');
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
  btn.disabled = on;
  btn.textContent = on ? 'Guardando…' : 'Guardar avance de turno';
}

async function guardarBitacora() {
  const fecha = document.getElementById('fechaInput').value;
  const tipo = state.turnoTipoSel;
  const otVal = document.getElementById('otSelect').value;
  const bullets = document.getElementById('bulletsInput').value
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const horaBloqueo = document.getElementById('horaBloqueoInput').value;
  if (horaBloqueo) bullets.unshift(`Se realizó el bloqueo a las ${horaBloqueo} h.`);
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
      fecha,
      turnoTipo: tipo,
      turnoIdx: idx === -1 ? null : idx,
      otNum: otVal ? (otVal.startsWith('M-') ? otVal : Number(otVal)) : null,
      bullets,
      fotos,
      createdAt: Date.now(),
    });
    document.getElementById('bulletsInput').value = '';
    document.getElementById('otSelect').value = '';
    document.getElementById('horaBloqueoInput').value = '';
    state.fotoRows = [];
    addFotoRow();
    showToast('Avance de turno guardado ✓');
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar — revisa tu conexión e intenta de nuevo');
  }
  setGuardando(false);
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

// ---------------- Turno selector (fecha + Día/Noche) ----------------

function setTurnoToggleActive() {
  document.querySelectorAll('#turnoToggle button').forEach((b) => {
    b.classList.toggle('active', b.dataset.tipo === state.turnoTipoSel);
  });
}

function renderTurnoHint() {
  const hint = document.getElementById('turnoHint');
  const idx = getSelectedTurnoIdx();
  if (idx === -1) {
    hint.textContent = '⚠ Esta fecha/turno queda fuera del rango planificado de la parada (12–16 Ago) — el comentario y las fotos igual se guardan, pero el % no se sincroniza con la Curva S.';
    hint.classList.add('warn');
  } else {
    hint.textContent = `Turno ${idx + 1} de ${INFORME_DATA.turnos.length} de la parada — ${INFORME_DATA.turnoLabels[idx]}.`;
    hint.classList.remove('warn');
  }
}

function onTurnoChange() {
  renderActividades();
  renderTurnoHint();
}

// ---------------- Init ----------------

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('paradaTitle').textContent = INFORME_DATA.paradaNombre;
  document.getElementById('paradaSub').textContent = INFORME_DATA.paradaSubtitulo;
  document.getElementById('informeTitulo').textContent = `Informe Nº ${INFORME_DATA.numero} — ${INFORME_DATA.titulo}`;
  document.getElementById('informeSub').textContent = `${INFORME_DATA.area} · Encargado: ${INFORME_DATA.encargado}`;

  const fechaInput = document.getElementById('fechaInput');
  fechaInput.min = INFORME_DATA.turnos[0].slice(0, 10);
  fechaInput.max = INFORME_DATA.turnos[INFORME_DATA.turnos.length - 1].slice(0, 10);
  fechaInput.value = defaultFecha();
  fechaInput.addEventListener('change', onTurnoChange);

  state.turnoTipoSel = tipoActualPorHora();
  setTurnoToggleActive();
  document.querySelectorAll('#turnoToggle button').forEach((b) => {
    b.addEventListener('click', () => {
      state.turnoTipoSel = b.dataset.tipo;
      setTurnoToggleActive();
      onTurnoChange();
    });
  });

  populateOtSelect();
  addFotoRow();
  document.getElementById('btnAddFoto').addEventListener('click', addFotoRow);
  document.getElementById('btnGuardarBitacora').addEventListener('click', guardarBitacora);

  document.getElementById('btnTogglePicker').addEventListener('click', togglePicker);
  document.getElementById('btnGuardarSeleccion').addEventListener('click', guardarSeleccion);

  document.getElementById('btnAddEmergente').addEventListener('click', abrirModalEmergente);
  document.getElementById('emergCancel').addEventListener('click', cerrarModalEmergente);
  document.getElementById('emergSave').addEventListener('click', crearEmergente);

  renderTurnoHint();
  initFirebase();
});
