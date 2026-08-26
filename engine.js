/* ============================================================
   Curva S — App de avance de parada (v2: por subactividad)
   ============================================================ */

const state = {
  filtroSupervisor: null,
  filtroInforme: null, // array de otNum (string) cuando se entra a "Actividades" desde un informe
  informeActivo: null, // el informe abierto en la vista de detalle
  liveSubs: {},
  liveOtEstado: {},
  liveOtMotivo: {},
  liveOtSupervisor: {}, // otNum -> { A: 'nombre', B: 'nombre' }
  liveOtAvance: {},
  manualEmergentes: [],
  expanded: {},
  db: null,
};

const ICON_SUN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>`;
const ICON_MOON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.4 14.7A8.5 8.5 0 1 1 9.3 3.6a7 7 0 0 0 11.1 11.1z"/></svg>`;
const ICON_LIST = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>`;
const ICON_CHART = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18M7 15l4-5 3 3 5-7"/></svg>`;
const ICON_CHEV = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6"/></svg>`;
// Único ícono de "volver" — mismo SVG en todos los botones de retroceso de
// la app (antes había flechas de texto "←", botones de color marca, y
// texto plano mezclados; ahora es siempre este mismo círculo con chevron).
const ICON_BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>`;

function subKey(otNum, nombre) { return otNum + '::' + nombre; }

function turnoActualIdx() {
  const now = new Date();
  const turnos = SEED_DATA.turnos.map((t) => new Date(t));
  let idx = 0;
  for (let i = 0; i < turnos.length; i++) {
    if (now >= turnos[i]) idx = i; else break;
  }
  return idx;
}

function initFirebase() {
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    state.db = firebase.firestore();
    try { state.db.enablePersistence({ synchronizeTabs: true }); } catch (e) {}
    listenLive();
    listenComponentes();
    listenPolines();
    listenPolinesEmergentes();
    listenFotosActividad();
    listenBitacora();
    listenPetsDinamicos();
    listenInformes();
    setConn(true);
  } catch (e) {
    console.error('Firebase no configurado todavía', e);
    setConn(false, true);
  }
}
function subsCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('subactividades'); }
function otsCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('ots'); }
function emergManualCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('emergentesManual'); }

function listenLive() {
  subsCollection().onSnapshot((snap) => {
    snap.forEach((doc) => {
      const d = doc.data() || {};
      // Firestore guarda avance.0, avance.1... como campos planos o como objeto anidado
      // Normalizamos a un objeto { "0": val, "1": val, ... }
      const avance = {};
      Object.keys(d).forEach((k) => {
        if (k.startsWith('avance.')) {
          avance[k.replace('avance.', '')] = d[k];
        }
      });
      if (d.avance && typeof d.avance === 'object') {
        Object.assign(avance, d.avance);
      }
      state.liveSubs[doc.id] = { avance };
    });
    renderAll();
    setConn(true);
  }, (err) => { console.error('subs error:', err); setConn(false); });
  otsCollection().onSnapshot((snap) => {
    snap.forEach((doc) => {
      const d = doc.data() || {};
      state.liveOtEstado[doc.id] = d.estado || 'Vigente';
      state.liveOtMotivo[doc.id] = d.motivo || '';
      state.liveOtSupervisor[doc.id] = { A: d.supervisorA || '', B: d.supervisorB || '' };
      // Normalizar avance igual que subactividades
      const avance = {};
      Object.keys(d).forEach((k) => {
        if (k.startsWith('avance.')) avance[k.replace('avance.', '')] = d[k];
      });
      if (d.avance && typeof d.avance === 'object') Object.assign(avance, d.avance);
      state.liveOtAvance[doc.id] = avance;
    });
    renderAll();
  });
  emergManualCollection().onSnapshot((snap) => {
    state.manualEmergentes = [];
    snap.forEach((doc) => {
      const d = doc.data();
      state.manualEmergentes.push({
        otNum: 'M-' + doc.id, area: d.area, tipo: 'Emergente', descripcion: d.nombre,
        pesoPlanHH: d.hhEstimadas || 0, inicio: d.fechaDeteccion, fin: d.fechaDeteccion,
        fechaDeteccion: d.fechaDeteccion, subactividades: [], hhPorTurno: null, manual: true,
      });
    });
    renderAll();
  });
}

function allOts() { return SEED_DATA.ots.concat(state.manualEmergentes); }

// En pantallas anchas la app usa el layout de 3 paneles: el panel izquierdo
// queda compacto (solo OT + nombre) y el detalle se abre en el panel central.
function esLayoutEscritorio() { return window.innerWidth >= 1024; }

async function saveSubAvance(otNum, nombre, turnoIdx, pct) {
  const ref = subsCollection().doc(subKey(otNum, nombre));
  const valor = pct === 0 ? firebase.firestore.FieldValue.delete() : pct;
  await ref.set({ [`avance.${turnoIdx}`]: valor, updatedAt: Date.now() }, { merge: true });
}
async function saveOtAvance(otNum, turnoIdx, pct) {
  const ref = otsCollection().doc(String(otNum));
  const valor = pct === 0 ? firebase.firestore.FieldValue.delete() : pct;
  await ref.set({ [`avance.${turnoIdx}`]: valor, updatedAt: Date.now() }, { merge: true });
}
async function saveOtEstado(otNum, estado, motivo) {
  const payload = { estado, updatedAt: Date.now() };
  if (motivo !== undefined) payload.motivo = motivo;
  await otsCollection().doc(String(otNum)).set(payload, { merge: true });
}
function getOtMotivo(otNum) { return state.liveOtMotivo[otNum] || ''; }

function turnoTipoDe(idx) {
  const t = SEED_DATA.turnos[idx];
  if (!t) return 'A';
  return new Date(t).getHours() === 8 ? 'A' : 'B';
}
function turnoTipoActual() { return turnoTipoDe(turnoActualIdx()); }

async function saveOtSupervisor(otNum, tipo, nombre) {
  const campo = tipo === 'B' ? 'supervisorB' : 'supervisorA';
  await otsCollection().doc(String(otNum)).set({ [campo]: nombre, updatedAt: Date.now() }, { merge: true });
}
function getOtSupervisor(otNum, tipo) {
  const rec = state.liveOtSupervisor[otNum] || {};
  const t = tipo || turnoTipoActual();
  return rec[t] || '';
}

// ---- v20: filtro por PAR de supervisores (turno A + turno B que trabajan juntos en la misma OT) ----
function getSupervisorPares() {
  const map = new Map();
  allOts().forEach((ot) => {
    const a = getOtSupervisor(ot.otNum, 'A');
    const b = getOtSupervisor(ot.otNum, 'B');
    if (a && b && a !== b) {
      const key = [a, b].sort().join(' :: ');
      if (!map.has(key)) map.set(key, { a, b });
    }
  });
  return [...map.values()].sort((x, y) => x.a.localeCompare(y.a));
}
function mismoParSupervisor(par1, par2) {
  if (!par1 || !par2) return false;
  return (par1.a === par2.a && par1.b === par2.b) || (par1.a === par2.b && par1.b === par2.a);
}
function otCoincideConParSupervisor(ot, par) {
  if (!par) return true;
  const a = getOtSupervisor(ot.otNum, 'A');
  const b = getOtSupervisor(ot.otNum, 'B');
  return a === par.a || a === par.b || b === par.a || b === par.b;
}

// Muestra los DOS supervisores (turno A y turno B) de una OT, resaltando
// con mas fuerza al que corresponde al turno actual.
function renderSupervisoresParOt(otNum) {
  const tActual = turnoTipoActual();
  const supA = getOtSupervisor(otNum, 'A');
  const supB = getOtSupervisor(otNum, 'B');
  const partes = [];
  // El punto de color identifica a la persona; el TEXTO siempre usa un color fijo de alto
  // contraste (nunca el color de la persona) para que nombres como el amarillo sigan siendo legibles.
  if (supA) {
    const activo = tActual === 'A';
    partes.push(`<span class="gantt-sup-tag${activo ? ' gantt-sup-activo' : ''}"><i class="gantt-sup-dot" style="background:${colorForSupervisor(supA)}"></i>${supA}${activo ? ' (turno actual)' : ''}</span>`);
  }
  if (supB) {
    const activo = tActual === 'B';
    partes.push(`<span class="gantt-sup-tag${activo ? ' gantt-sup-activo' : ''}"><i class="gantt-sup-dot" style="background:${colorForSupervisor(supB)}"></i>${supB}${activo ? ' (turno actual)' : ''}</span>`);
  }
  return partes.length ? ` · ${partes.join(' ')}` : '';
}

// Paleta reducida y en tonos apagados a proposito — con 8 colores vivos + los colores de estado
// (a tiempo/atrasado/emergente) + terceros, la pantalla se sentia recargada. Menos tonos, mas
// desaturados, para que el ojo se vaya primero a lo que importa (avance y atrasos).
const SUPERVISOR_PALETTE = ['#5B84AD', '#7C8FA0', '#8E7BA0', '#A08768'];
// Color unico para toda actividad de terceros (Andamios/Aseo/Instrumentacion) — antes cada
// categoria tenia su propio color vivo (morado/verde/celeste); ahora es un solo tono neutro,
// ya que estas actividades son solo contexto y no deben competir visualmente con el avance real.
const TERCEROS_COLOR = '#93A2B5';
function colorForSupervisor(nombre) {
  if (!nombre) return null;
  let hash = 0;
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) >>> 0;
  return SUPERVISOR_PALETTE[hash % SUPERVISOR_PALETTE.length];
}

// Limpieza liviana de texto escrito rápido en terreno: espacios, mayúscula inicial,
// signos de puntuación repetidos. No es corrección ortográfica real (eso requeriría
// un servidor intermedio para no exponer una llave de API en el navegador).
function limpiarComentario(txt) {
  if (!txt) return '';
  let t = txt.trim().replace(/\s+/g, ' ');
  t = t.replace(/([.,;:!?])\1+/g, '$1');
  if (t.length > 0) t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length > 0 && !/[.!?]$/.test(t)) t += '.';
  return t;
}
async function addManualEmergente(nombre, area, hhEstimadas) {
  await emergManualCollection().add({
    nombre, area: area || 'Emergentes registrados en terreno',
    hhEstimadas: hhEstimadas || 0, fechaDeteccion: new Date().toISOString(), createdAt: Date.now(),
  });
}
async function deleteManualEmergente(otNum) {
  const docId = String(otNum).replace(/^M-/, '');
  await emergManualCollection().doc(docId).delete();
  await otsCollection().doc(String(otNum)).delete().catch(() => {});
}

function setConn(online, noConfig) {
  const dot = document.getElementById('connDot');
  const txt = document.getElementById('connTxt');
  if (noConfig) { dot.className = 'conn-dot offline'; txt.textContent = 'Falta configurar Firebase'; return; }
  dot.className = 'conn-dot ' + (online ? 'online' : 'offline');
  txt.textContent = online ? 'Sincronizado' : 'Sin conexión — se guarda al reconectar';
}

function carryForward(avanceMap, uptoIdx) {
  if (!avanceMap) return undefined;
  let v;
  for (let i = 0; i <= uptoIdx; i++) {
    // Firestore devuelve las claves como strings aunque se guardaron como números
    const raw = avanceMap[i] !== undefined ? avanceMap[i] : avanceMap[String(i)];
    if (raw !== undefined && raw !== null) v = raw;
  }
  return v;
}

function getSubLive(otNum, nombre) {
  return state.liveSubs[subKey(otNum, nombre)] || { avance: {} };
}
function getOtEstado(otNum) { return state.liveOtEstado[otNum] || 'Vigente'; }

function otProgressAt(ot, turnoIdx) {
  if (esCampaniaPolines(ot)) {
    return polinesPct(ot.otNum);
  }
  if (!ot.subactividades || ot.subactividades.length === 0) {
    return carryForward(state.liveOtAvance[ot.otNum], turnoIdx) || 0;
  }
  let num = 0, den = 0;
  ot.subactividades.forEach((s) => {
    const live = getSubLive(ot.otNum, s.nombre);
    const cf = carryForward(live.avance, turnoIdx);
    if (s.pesoHH <= 0) return;
    den += s.pesoHH;
    num += s.pesoHH * (cf || 0);
  });
  return den > 0 ? num / den : 0;
}

function lastReportedTurno() {
  let max = -1;
  allOts().forEach((ot) => {
    if (!ot.subactividades || ot.subactividades.length === 0) {
      Object.keys(state.liveOtAvance[ot.otNum] || {}).forEach((k) => { const i = parseInt(k, 10); if (i > max) max = i; });
      return;
    }
    ot.subactividades.forEach((s) => {
      const live = getSubLive(ot.otNum, s.nombre);
      Object.keys(live.avance || {}).forEach((k) => { const i = parseInt(k, 10); if (i > max) max = i; });
    });
  });
  return max;
}

function computeCurve() {
  const N = SEED_DATA.turnoLabels.length;
  const total = SEED_DATA.totalHH;
  const planAcum = []; let running = 0;
  for (let i = 0; i < N; i++) { running += SEED_DATA.hhPlanPorTurno[i]; planAcum.push(running); }
  const percentPlan = planAcum.map((v) => v / total);
  const lastRep = lastReportedTurno();

  const planificados = allOts().filter((o) => o.tipo === 'Planificado');
  const emergentes = allOts().filter((o) => o.tipo === 'Emergente');
  const sumPesoPlan = planificados.reduce((s, o) => s + o.pesoPlanHH, 0);

  // Polines emergentes (agregados en terreno con "+ Polín emergente") tambien cuentan como
  // alcance emergente en la Curva S, con las HH que se les cargo al agregarlos. Su avance es
  // binario: cambiado (100%) o no (0%), a diferencia de una OT que tiene subactividades.
  const polinesEmerg = (state.polinesEmergentes || []).filter((p) => p.pesoPlanHH > 0);
  function progresoPolinEmerg(p, turnoIdx) {
    const e = state.polinesEstado[polinKey(p.otNum, p.id)];
    if (!e || e.estado !== 'Cambiado') return 0;
    // Si el cambio se registro en un turno posterior al que estamos evaluando, todavia no cuenta
    const turnoCambio = SEED_DATA.turnoLabels.indexOf(e.turno);
    if (turnoCambio >= 0 && turnoCambio > turnoIdx) return 0;
    return 1;
  }

  const percentReal = [], alcanceEmerg = [], percentRealTotal = [];
  for (let i = 0; i < N; i++) {
    if (i > lastRep) { percentReal.push(null); percentRealTotal.push(null); }
    else {
      let num = 0;
      planificados.forEach((o) => { num += o.pesoPlanHH * otProgressAt(o, i); });
      percentReal.push(sumPesoPlan > 0 ? num / sumPesoPlan : 0);

      let numEmerg = 0;
      emergentes.forEach((o) => { numEmerg += o.pesoPlanHH * otProgressAt(o, i); });
      polinesEmerg.forEach((p) => { numEmerg += p.pesoPlanHH * progresoPolinEmerg(p, i); });
      percentRealTotal.push((num + numEmerg) / total);
    }
    const turnoDate = new Date(SEED_DATA.turnos[i]);
    let emergHH = 0;
    emergentes.forEach((o) => { if (new Date(o.fechaDeteccion) <= turnoDate) emergHH += o.pesoPlanHH; });
    polinesEmerg.forEach((p) => { if (new Date(p.fechaDeteccion) <= turnoDate) emergHH += p.pesoPlanHH; });
    alcanceEmerg.push((total + emergHH) / total);
  }

  const hhEmergentes = emergentes.reduce((s, o) => s + o.pesoPlanHH, 0) + polinesEmerg.reduce((s, p) => s + p.pesoPlanHH, 0);
  const canceladas = planificados.filter((o) => getOtEstado(o.otNum).startsWith('Cancelada'));
  const hhCanceladas = canceladas.reduce((s, o) => s + o.pesoPlanHH, 0);
  const netoHH = hhEmergentes - hhCanceladas;

  // El avance real de una parada NUNCA deberia bajar de un turno al siguiente — es la misma
  // idea de carryForward pero aplicada a la curva ya calculada, como red de seguridad final.
  // Si algun calculo intermedio (ej. una OT que no es turno-aware, como los polines) produce
  // un bajon puntual, esto lo aplana para que la curva mostrada sea siempre no-decreciente.
  function forzarNoDecreciente(arr) {
    let maxHasta = 0;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i] === null || arr[i] === undefined) continue;
      maxHasta = Math.max(maxHasta, arr[i]);
      arr[i] = maxHasta;
    }
    return arr;
  }
  forzarNoDecreciente(percentReal);
  forzarNoDecreciente(percentRealTotal);

  // Conteo de actividades por estado de avance (solo vigentes, no canceladas)
  const vigentes = allOts().filter((o) => !getOtEstado(o.otNum).startsWith('Cancelada'));
  const lastIdxForCount = N - 1;
  let nCompletadas = 0, nNoIniciadas = 0, nEnCurso = 0;
  vigentes.forEach((o) => {
    const p = otProgressAt(o, lastIdxForCount);
    if (p >= 0.999) nCompletadas++;
    else if (p <= 0.001) nNoIniciadas++;
    else nEnCurso++;
  });
  const nTotalVigentes = vigentes.length;

  return {
    labels: SEED_DATA.turnoLabels, percentPlan, percentReal, alcanceEmerg, percentRealTotal,
    kpis: {
      hhEmergentes, pctCrecimiento: hhEmergentes / total, nEmergentes: emergentes.length,
      hhCanceladas, pctCancelado: hhCanceladas / total, nCanceladas: canceladas.length,
      netoHH, netoPct: netoHH / total,
      nCompletadas, nNoIniciadas, nEnCurso, nTotalVigentes,
      pctCompletadas: nTotalVigentes ? nCompletadas / nTotalVigentes : 0,
      pctNoIniciadas: nTotalVigentes ? nNoIniciadas / nTotalVigentes : 0,
      pctEnCurso: nTotalVigentes ? nEnCurso / nTotalVigentes : 0,
    }
  };
}

function fmtPct(v) { return v === null || v === undefined ? '—' : Math.round(v * 100) + '%'; }

// Combina los dos filtros de actividades que puede haber activos a la vez:
// por par de supervisor (ya existía) y por informe (nuevo — al entrar a
// "Actividades" desde un informe, solo se ven las OT que ese informe
// agrupa). Se usa en la vista Lista y en la Línea de tiempo.
function otsVisibles() {
  let ots = allOts();
  if (state.filtroSupervisor) ots = ots.filter((o) => otCoincideConParSupervisor(o, state.filtroSupervisor));
  if (state.filtroInforme) ots = ots.filter((o) => state.filtroInforme.includes(String(o.otNum)));
  return ots;
}

function renderList() {
  const wrap = document.getElementById('otList');
  const filtroSup = state.filtroSupervisor;
  const otsFiltradas = otsVisibles();
  const areas = [...new Set(otsFiltradas.map((o) => o.area))];
  let html = '';
  if ((filtroSup || state.filtroInforme) && otsFiltradas.length === 0) {
    wrap.innerHTML = `<p style="padding:16px; color:var(--ink-muted); font-size:12.5px;">${state.filtroInforme ? 'Este informe no tiene actividades asignadas.' : 'Ese par de supervisores no tiene actividades asignadas.'}</p>`;
    return;
  }
  areas.forEach((area) => {
    html += `<div class="area-header">${area}</div>`;
    otsFiltradas.filter((o) => o.area === area).forEach((ot) => {
      const estado = getOtEstado(ot.otNum);
      const isEmerg = ot.tipo === 'Emergente';
      const isCancel = estado.startsWith('Cancelada');
      const pct = otProgressAt(ot, SEED_DATA.turnoLabels.length - 1);
      const hasSubs = ot.subactividades && ot.subactividades.length > 0;
      const isOpen = esLayoutEscritorio() ? false : !!state.expanded[ot.otNum];
      const esSeleccionada = String(state.otSeleccionada) === String(ot.otNum);
      const cardClass = ['ot-card', isEmerg ? 'emergente' : '', isCancel ? 'cancelada' : '', esSeleccionada ? 'seleccionada' : ''].join(' ').trim();
      const badge = isCancel ? `<span class="ot-badge cancelada">CANCELADA</span>` : (isEmerg ? `<span class="ot-badge emergente">EMERGENTE</span>` : '');
      const barColor = isCancel ? 'var(--cancelada)' : (isEmerg ? 'var(--emergente)' : 'var(--brand)');
      const supA = getOtSupervisor(ot.otNum, 'A');
      const supB = getOtSupervisor(ot.otNum, 'B');
      const supColorA = colorForSupervisor(supA);
      const supColorB = colorForSupervisor(supB);
      const supTag = (supA || supB) ? `<div class="supervisor-tags">${supA ? `<span class="supervisor-tag" style="color:${supColorA}"><i style="background:${supColorA}"></i>A: ${supA}</span>` : ''}${supB ? `<span class="supervisor-tag" style="color:${supColorB}"><i style="background:${supColorB}"></i>B: ${supB}</span>` : ''}</div>` : '';
      const cardStyle = (() => {
        if (isCancel) return `style="border-left:3px solid var(--cancelada);"`;
        if (isEmerg) return `style="border-left:3px solid var(--emergente);"`;
        const ini = new Date(ot.inicio), ahora = new Date();
        const expected = expectedPctNow(ot, ahora);
        const behind = ahora > ini && pct < expected - 0.1 && pct < 0.999;
        return `style="border-left:3px solid ${behind ? 'var(--cancelada)' : 'var(--atiempo)'};"`;
      })();

      if (esCampaniaPolines(ot)) {
        const pPct = polinesPct(ot.otNum);
        const items = todosLosPolinesDeOt(ot.otNum);
        const cambiados = items.filter((p) => {
          const e = state.polinesEstado[polinKey(ot.otNum, p.id)];
          return e && e.estado === 'Cambiado';
        }).length;
        html += `
          <div class="${cardClass} polines-card" ${cardStyle} data-otcard="${ot.otNum}" data-polines="${ot.otNum}">
            <div class="ot-row1">
              <div>
                <div class="ot-desc">🔧 OT ${ot.otNum} — ${ot.descripcion}</div>
                <div class="ot-num">Cambio de polines · ${cambiados}/${items.length} cambiados${ot.cuadrilla ? ' · Cuadrilla ' + cuadrillaLabel(ot.cuadrilla) : ''}</div>
                ${supTag}
              </div>
              <span class="ot-badge polines">POLINES</span>
            </div>
            <div class="progress-row">
              <div class="progress-track"><div class="progress-fill" style="width:${Math.round(pPct*100)}%; background:var(--brand)"></div></div>
              <div class="progress-pct">${Math.round(pPct*100)}%</div>
            </div>
          </div>`;
        return;
      }

      if (!hasSubs) {
        // Emergente simple: sin acordeón, toda la tarjeta abre el panel de % directo
        const btnEliminarEmerg = isEmerg ? `<button type="button" class="btn-x-emergente" data-eliminaremerg="${ot.otNum}" title="Eliminar esta actividad emergente">✕</button>` : '';
        html += `
          <div class="${cardClass}" ${cardStyle} data-otcard="${ot.otNum}" data-direct="${ot.otNum}">
            <div class="ot-row1">
              <div>
                <div class="ot-desc">OT ${ot.otNum} — ${ot.descripcion}</div>
                <div class="ot-num">${ot.pesoPlanHH ? ot.pesoPlanHH.toFixed(1) + ' HH · ' : ''}avance directo</div>
                ${supTag}
              </div>
              <div style="display:flex; align-items:center; gap:6px;">
                ${badge}
                ${btnEliminarEmerg}
              </div>
            </div>
            <div class="progress-row">
              <div class="progress-track"><div class="progress-fill" style="width:${Math.round(pct*100)}%; background:${barColor}"></div></div>
              <div class="progress-pct">${Math.round(pct*100)}%</div>
            </div>
          </div>`;
        return;
      }

      const subsOrdenadas = [...ot.subactividades].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
      const comps = (SEED_DATA.complementarias || []).filter((c) => c.otRelacionada === ot.otNum);
      const timeline = [
        ...comps.map((c) => ({ type: 'comp', data: c, inicio: c.inicio })),
        ...subsOrdenadas.map((s) => ({ type: 'sub', data: s, inicio: s.inicio })),
      ].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

      html += `
        <div class="${cardClass}" ${cardStyle} data-otcard="${ot.otNum}">
          <div class="ot-row1" data-toggle="${ot.otNum}">
            <div>
              <div class="ot-desc">OT ${ot.otNum} — ${ot.descripcion}</div>
              <div class="ot-num">${ot.pesoPlanHH.toFixed(1)} HH · ${subsOrdenadas.length} subactividades${comps.length ? ' · ' + comps.length + ' de terceros' : ''}${ot.cuadrilla ? ' · Cuadrilla ' + cuadrillaLabel(ot.cuadrilla) : ''}</div>
              ${supTag}
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              ${badge}
              <span class="chev" style="transform:rotate(${isOpen ? 90 : 0}deg); transition:transform .15s; color:var(--ink-dim);">${ICON_CHEV}</span>
            </div>
          </div>
          <div class="progress-row" data-toggle="${ot.otNum}">
            <div class="progress-track"><div class="progress-fill" style="width:${Math.round(pct*100)}%; background:${barColor}"></div></div>
            <div class="progress-pct">${Math.round(pct*100)}%</div>
          </div>
          <div class="sub-list" style="display:${isOpen ? 'block' : 'none'}">
            ${timeline.map((item) => item.type === 'comp' ? renderCompRow(item.data) : renderSubRow(ot, item.data)).join('')}
            <div class="ot-status-row">
              <label>Supervisor Turno A</label>
              <input type="text" class="supervisor-input" data-supervisor="${ot.otNum}" data-turnotipo="A" value="${getOtSupervisor(ot.otNum, 'A')}" placeholder="Nombre y apellido">
            </div>
            <div class="ot-status-row">
              <label>Supervisor Turno B</label>
              <input type="text" class="supervisor-input" data-supervisor="${ot.otNum}" data-turnotipo="B" value="${getOtSupervisor(ot.otNum, 'B')}" placeholder="Nombre y apellido">
            </div>
            <div class="ot-status-row">
              <label>Estado de la OT</label>
              <select class="estado-select" data-ot="${ot.otNum}">
                <option value="Vigente" ${estado==='Vigente'?'selected':''}>Vigente</option>
                <option value="Cancelada (falta de tiempo)" ${estado==='Cancelada (falta de tiempo)'?'selected':''}>Cancelada (falta de tiempo)</option>
                <option value="Cancelada (falta de componentes)" ${estado==='Cancelada (falta de componentes)'?'selected':''}>Cancelada (falta de componentes)</option>
                <option value="Cancelada (en coordinación con sup Centinela se canceló)" ${estado==='Cancelada (en coordinación con sup Centinela se canceló)'?'selected':''}>Cancelada (en coordinación con sup Centinela se canceló)</option>
                <option value="Cancelada (otro motivo)" ${estado==='Cancelada (otro motivo)'?'selected':''}>Cancelada (otro motivo)</option>
                <option value="En pausa" ${estado==='En pausa'?'selected':''}>En pausa</option>
              </select>
              <div class="motivo-row" data-motivorow="${ot.otNum}" style="display:${estado.startsWith('Cancelada') ? 'block' : 'none'};">
                <label>Cuéntanos qué pasó (se ordena solo al guardar)</label>
                <textarea class="motivo-textarea" data-motivo="${ot.otNum}" placeholder="Ej: no alcanzo el tiempo pq llego tarde el repuesto">${getOtMotivo(ot.otNum)}</textarea>
              </div>
            </div>
          </div>
        </div>`;
    });
  });
  wrap.innerHTML = html || `<div class="empty-note">Sin actividades registradas.</div>`;


  wrap.querySelectorAll('[data-toggle]').forEach((el) => {
    el.addEventListener('click', () => {
      const ot = el.dataset.toggle;
      // En el layout de 3 paneles (escritorio) el panel izquierdo se mantiene
      // compacto: el detalle de la OT se abre en el panel central, no aqui.
      if (esLayoutEscritorio()) {
        state.otSeleccionada = ot;
        abrirDetalleOt(ot);
        renderList();
        return;
      }
      state.expanded[ot] = !state.expanded[ot];
      renderList();
    });
  });
  wrap.querySelectorAll('[data-direct]').forEach((el) => {
    el.addEventListener('click', () => {
      state.otSeleccionada = el.dataset.direct;
      openSheetDirect(el.dataset.direct);
      renderList();
    });
  });
  wrap.querySelectorAll('[data-eliminaremerg]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('¿Estás seguro de eliminar esta actividad emergente? Se borrará también su avance registrado.')) return;
      try {
        await deleteManualEmergente(btn.dataset.eliminaremerg);
        showToast('Emergente eliminada');
      } catch (err) {
        console.error(err);
        showToast('No se pudo eliminar — revisa tu conexión');
      }
    });
  });
  wrap.querySelectorAll('[data-polines]').forEach((el) => {
    el.addEventListener('click', () => {
      state.otSeleccionada = el.dataset.polines;
      openPolinesSheet(el.dataset.polines);
      renderList();
    });
  });
  wrap.querySelectorAll('.sub-row:not(.comp-row)').forEach((el) => {
    el.addEventListener('click', () => openSheet(el.dataset.ot, decodeURIComponent(el.dataset.nombre)));
  });
  wrap.querySelectorAll('.supervisor-input').forEach((inp) => {
    inp.addEventListener('click', (e) => e.stopPropagation());
    inp.addEventListener('blur', async (e) => {
      const otNum = parseInt(inp.dataset.supervisor, 10) || inp.dataset.supervisor;
      const tipo = inp.dataset.turnotipo;
      const nombre = e.target.value.trim();
      try {
        await saveOtSupervisor(otNum, tipo, nombre);
        if (nombre) showToast('Supervisor Turno ' + tipo + ' asignado');
      } catch (err) {
        console.error(err);
        showToast('No se pudo guardar el supervisor');
      }
    });
  });
  wrap.querySelectorAll('.estado-select').forEach((sel) => {
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('change', async (e) => {
      const otNum = parseInt(sel.dataset.ot, 10) || sel.dataset.ot;
      const motivoRow = wrap.querySelector(`[data-motivorow="${sel.dataset.ot}"]`);
      const isCancel = e.target.value.startsWith('Cancelada');
      if (motivoRow) motivoRow.style.display = isCancel ? 'block' : 'none';
      await saveOtEstado(otNum, e.target.value);
      showToast('Estado actualizado');
    });
  });
  wrap.querySelectorAll('.motivo-textarea').forEach((ta) => {
    ta.addEventListener('click', (e) => e.stopPropagation());
    ta.addEventListener('blur', async (e) => {
      const otNum = parseInt(ta.dataset.motivo, 10) || ta.dataset.motivo;
      const limpio = limpiarComentario(e.target.value);
      e.target.value = limpio;
      const estadoSel = wrap.querySelector(`.estado-select[data-ot="${ta.dataset.motivo}"]`);
      await saveOtEstado(otNum, estadoSel ? estadoSel.value : getOtEstado(otNum), limpio);
      if (limpio) showToast('Motivo guardado');
    });
  });
}

function renderCompRow(c) {
  const tagLabel = { AND: 'Andamios', ASEO: 'Aseo / Operaciones', INST: 'Instrumentación' }[c.tag] || c.tag;
  const tagColor = TERCEROS_COLOR;
  return `
    <div class="sub-row comp-row" style="cursor:default;">
      <div class="comp-tag" style="background:${tagColor}22; color:${tagColor}; border:1px solid ${tagColor}55;">${tagLabel}</div>
      <div class="sub-info">
        <div class="sub-name">${c.nombre}</div>
        <div class="sub-meta">${c.pesoHH.toFixed(1)} HH · no cuenta en tu avance</div>
      </div>
    </div>`;
}

function renderSubRow(ot, s) {
  const live = getSubLive(ot.otNum, s.nombre);
  const lastIdx = SEED_DATA.turnoLabels.length - 1;
  const cf = carryForward(live.avance, lastIdx) || 0;
  const done = cf >= 0.999;
  return `
    <div class="sub-row" data-ot="${ot.otNum}" data-nombre="${encodeURIComponent(s.nombre)}">
      <div class="sub-check ${done ? 'done' : ''}">${done ? '✓' : ''}</div>
      <div class="sub-info">
        <div class="sub-name">${s.nombre}</div>
        <div class="sub-meta">${s.pesoHH.toFixed(1)} HH</div>
      </div>
      <div class="sub-pct">${Math.round(cf*100)}%</div>
    </div>`;
}

let sheetCtx = null;

function openSheet(otNum, nombre) {
  const isManual = typeof otNum === 'string' && otNum.startsWith('M-');
  otNum = isManual ? otNum : parseInt(otNum, 10);
  const ot = allOts().find((o) => o.otNum === otNum);
  const s = ot.subactividades.find((x) => x.nombre === nombre);
  const live = getSubLive(otNum, nombre);
  const tIdx = turnoActualIdx();
  const vieneDeLista = sheetCtx && sheetCtx.otNum === otNum && sheetCtx.esLista;
  activarModoDetalleMovil();
  actualizarOtActualEnBoton(otNum);
  sheetCtx = { otNum, nombre, turnoIdx: tIdx, direct: false, manual: false, otNumOrigenLista: vieneDeLista || (esLayoutEscritorio() ? otNum : null) };
  ocultarListaSubactividades();

  document.getElementById('sheetTitle').textContent = s.nombre;
  let volverBtn = document.getElementById('btnVolverSubs');
  if (ot.subactividades && ot.subactividades.length > 1) {
    if (!volverBtn) {
      volverBtn = document.createElement('button');
      volverBtn.id = 'btnVolverSubs';
      volverBtn.type = 'button';
      volverBtn.textContent = '← Volver a subactividades';
      volverBtn.style.cssText = 'background:none; border:none; color:var(--brand); font-size:12px; font-weight:700; cursor:pointer; padding:0 0 8px; font-family:var(--sans);';
      document.getElementById('sheetTitle').insertAdjacentElement('beforebegin', volverBtn);
    }
    volverBtn.style.display = 'block';
    volverBtn.onclick = () => abrirDetalleOt(otNum);
  } else if (volverBtn) {
    volverBtn.style.display = 'none';
  }
  document.getElementById('sheetMeta').textContent = `OT ${otNum} — ${ot.descripcion} · ${s.pesoHH.toFixed(1)} HH${ot.cuadrilla ? ' · Cuadrilla ' + cuadrillaLabel(ot.cuadrilla) : ''}${getOtSupervisor(otNum) ? ' · Sup: ' + getOtSupervisor(otNum) : ''}`;
  document.getElementById('sheetDelete').style.display = 'none';

  const cf = carryForward(live.avance, tIdx) || 0;
  const raw = (live.avance && live.avance[tIdx] !== undefined) ? live.avance[tIdx] : cf;
  const slider = document.getElementById('pctSlider');
  slider.value = Math.round(raw * 100);
  document.getElementById('pctDisplay').textContent = slider.value + '%';

  populateTurnoOverride(tIdx, live.avance);
  renderPetsBlock(otNum);
  renderEstadoOtBlock(otNum);
  resetComentarioForm();
  renderComentarioFeed(otNum);
  renderGanttActividad(otNum);
  poblarSupervisoresPanel(otNum);
  document.body.classList.remove('polines-abierto');
  const polinesPanel = document.getElementById('polinesSheetBackdrop');
  if (polinesPanel) polinesPanel.classList.remove('open');
  renderProtocoloPanel(null);
  document.getElementById('sheetBackdrop').classList.add('open');
  document.getElementById('sheetBackdrop').classList.add('tiene-seleccion');
}

// Convierte un link normal de "Compartir" de Google Drive (.../file/d/ID/view?...) en un link
// de descarga directa (uc?export=download&id=ID). Si no reconoce el formato, usa el link tal cual.
function petsDownloadUrl(rawUrl) {
  const m = rawUrl.match(/\/d\/([a-zA-Z0-9_-]+)/) || rawUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  const id = m ? m[1] : null;
  return id ? `https://drive.google.com/uc?export=download&id=${id}` : rawUrl;
}

// El PETS vive en Google Drive del usuario, no en Firebase/GitHub — PETS_LINKS (pets-links.js)
// es solo un mapa estatico OT -> URL que se completa a mano. Si la OT no tiene link cargado
// todavia, se muestra un aviso en vez de un boton roto.
// Además del mapa estático PETS_LINKS (arriba), un administrador puede subir un PETS en PDF
// directamente desde la app (botón "+ PETS" del header) y elegir a qué actividades aplica —
// sin necesidad de editar código ni redesplegar. Ambas fuentes se muestran juntas.
function petsCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('pets'); }
state.petsDinamicos = [];
let petsPendingOts = [];

function listenPetsDinamicos() {
  petsCollection().onSnapshot((snap) => {
    state.petsDinamicos = [];
    snap.forEach((doc) => state.petsDinamicos.push({ id: doc.id, ...doc.data() }));
    if (sheetCtx) renderPetsBlock(sheetCtx.otNum);
  }, (err) => console.error('pets error:', err));
}

// ---- Informes: agrupar N actividades bajo un nombre (ej. "Informe N°3") y adjuntar
// su Word/PDF ya editado, para tenerlo a un toque desde la portada. El plan es que de
// UN Gantt completo salgan VARIOS informes — cada uno es solo un subconjunto de OTs con
// un archivo asociado, nada más. Mismo patrón que el PETS (subida a Storage + Firestore). ----
function informesCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('informes'); }
state.informes = [];
let informePendingOts = [];

function listenInformes() {
  // includeMetadataChanges + doc.metadata.hasPendingWrites: un informe creado
  // con mala señal puede quedar guardado SOLO en este dispositivo (Firestore
  // lo muestra igual, optimista, antes de confirmar con el servidor) — sin
  // esto no había forma de distinguir "ya está en la nube" de "todavía no
  // sale de este celular/computador", que es justo lo que explica ver
  // informes distintos en cada dispositivo.
  informesCollection().onSnapshot({ includeMetadataChanges: true }, (snap) => {
    state.informes = [];
    snap.forEach((doc) => state.informes.push({ id: doc.id, ...doc.data(), _pendiente: doc.metadata.hasPendingWrites }));
    if (document.getElementById('view-informes')) renderVistaInformes();
    if (state.informeActivo) {
      const actualizado = state.informes.find((i) => i.id === state.informeActivo.id);
      if (actualizado) { state.informeActivo = actualizado; actualizarBadgePendienteInforme(); }
    }
  }, (err) => console.error('informes error:', err));
}

// ============================================================
// Vista "Informes": lista de informes + detalle de cada uno (portada de
// datos + actividades filtradas a solo las de ese informe). Reemplaza el
// viejo listado suelto en la portada — ahora es su propia página.
// ============================================================

function ensureVistaInformes() {
  if (document.getElementById('view-informes')) return;
  const main = document.querySelector('main');
  if (!main) return;
  const div = document.createElement('div');
  div.className = 'view';
  div.id = 'view-informes';
  div.innerHTML = `
    <div class="informes-header">
      <button type="button" class="btn-back" id="btnVolverDeInformes" title="Volver a Portada">${ICON_BACK}</button>
      <h2>Informes</h2>
      <button type="button" class="btn-mini btn-mini-primary" id="btnCrearInformeVista">+ Crear informe</button>
    </div>
    <div id="listaInformesCompleta"></div>
  `;
  main.appendChild(div);
  document.getElementById('btnVolverDeInformes').addEventListener('click', () => { irAVista('inicio'); });
  document.getElementById('btnCrearInformeVista').addEventListener('click', abrirModalInforme);
}

function renderVistaInformes() {
  ensureVistaInformes();
  const wrap = document.getElementById('listaInformesCompleta');
  if (!state.informes.length) {
    wrap.innerHTML = '<p class="empty-note">Todavía no hay informes creados — toca "+ Crear informe" para armar el primero.</p>';
    return;
  }
  wrap.innerHTML = state.informes.map((inf) => `
    <div class="informe-card-grande" data-abririnforme="${inf.id}">
      <div class="informe-card-nombre">📝 ${escBit(inf.nombre || '(sin nombre)')}</div>
      <div class="informe-card-meta">
        ${inf._pendiente ? '<span class="informe-card-pendiente" title="Todavía no se confirma que llegó al servidor — puede que no se vea en otros dispositivos hasta que este termine de subir">⏳ Subiendo…</span>' : `${(inf.otNums || []).length} actividad(es)`}
      </div>
      <button type="button" class="btn-borrar-informe" data-borrarinforme="${inf.id}" title="Eliminar informe">🗑</button>
      <span class="informe-card-flecha">›</span>
    </div>`).join('');
  wrap.querySelectorAll('[data-abririnforme]').forEach((card) => {
    card.addEventListener('click', () => abrirInformeDetalle(card.dataset.abririnforme));
  });
  wrap.querySelectorAll('[data-borrarinforme]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      borrarInforme(btn.dataset.borrarinforme);
    });
  });
}

function borrarInforme(id, alBorrar) {
  const inf = state.informes.find((i) => i.id === id);
  if (!inf) return;
  if (!confirm(`¿Eliminar el informe "${inf.nombre}"? Esta acción no se puede deshacer (las actividades y su avance NO se borran, solo este informe).`)) return;
  // No se espera la confirmación del servidor antes de avanzar: en terreno con
  // mala señal esa confirmación puede tardar mucho o no llegar, y dejaría la
  // pantalla de detalle trabada. state.informes ya se actualiza al instante
  // (caché local de Firestore), así que la navegación puede seguir de una vez;
  // si el borrado falla de verdad, el informe simplemente reaparece en la lista.
  informesCollection().doc(id).delete().catch((e) => {
    console.error(e);
    showToast('No se pudo eliminar — revisa tu conexión');
  });
  showToast('Informe eliminado ✓');
  if (alBorrar) alBorrar();
}

// ---- Detalle de un informe: la "portada de datos" (foto, objetivo, tabla de
// administradores/supervisores, distribución de población, herramientas,
// anexos, recomendaciones por actividad) + acceso a sus actividades filtradas
// + generar/abrir el Word y el PDF de ese informe. ----

function ensureVistaInformeDetalle() {
  if (document.getElementById('view-informe-detalle')) return;
  const main = document.querySelector('main');
  if (!main) return;
  const div = document.createElement('div');
  div.className = 'view';
  div.id = 'view-informe-detalle';
  div.innerHTML = `
    <div class="informes-header">
      <button type="button" class="btn-back" id="btnVolverDeDetalleInforme" title="Volver a Informes">${ICON_BACK}</button>
      <h2 id="detalleInformeNombre">—</h2>
      <span id="detalleInformePendiente" class="informe-card-pendiente" style="display:none; font-size:11px;" title="Todavía no se confirma que este informe llegó al servidor — puede que no se vea en otros dispositivos hasta que termine de subir">⏳ Subiendo…</span>
      <button type="button" class="btn-borrar-informe" id="btnBorrarInformeDetalle" title="Eliminar informe" style="font-size:18px;">🗑</button>
    </div>

    <button type="button" class="btn-entrar" id="btnVerActividadesInforme" style="width:100%; margin-bottom:16px;">📋 Ver actividades de este informe</button>

    <div class="informe-form-bloque">
      <label class="rotulo-mini">Foto de portada</label>
      <div id="detallePortadaPreviewWrap"></div>
      <label class="foto-slot-btn" style="display:inline-block; margin-top:6px;">📷 Elegir/cambiar foto<input type="file" accept="image/*" id="inputPortadaFoto" style="display:none;"></label>
    </div>

    <div class="informe-form-bloque">
      <label class="rotulo-mini">Elaborado por (encargado de este informe)</label>
      <label>Nombre del supervisor</label>
      <input type="text" id="inputEncargadoNombre" placeholder="Nombre">
      <label>Firma (foto o escaneo)</label>
      <div id="detalleFirmaPreviewWrap"></div>
      <label class="foto-slot-btn" style="display:inline-block; margin-top:6px;">✍️ Elegir/cambiar firma<input type="file" accept="image/*" id="inputEncargadoFirma" style="display:none;"></label>
    </div>

    <div class="informe-form-bloque">
      <label class="rotulo-mini">Objetivo principal</label>
      <textarea id="inputObjetivoPrincipal" rows="4" placeholder="Ej: Ejecutar el cambio de ductos y válvulas del área Fallback, cumpliendo con los tiempos y estándares de seguridad establecidos..."></textarea>
    </div>

    <div class="informe-form-bloque">
      <label class="rotulo-mini">Administradores de contrato</label>
      <label>Administrador de Contratos Centinela</label>
      <input type="text" id="inputAdminCentinela" placeholder="Nombre">
      <label>Administrador de Contratos SEMIVA Chile SPA</label>
      <input type="text" id="inputAdminSemiva" placeholder="Nombre">
    </div>

    <div class="informe-form-bloque">
      <label class="rotulo-mini">Distribución de población</label>
      <div id="detalleDistribPreviewWrap"></div>
      <label class="foto-slot-btn" style="display:inline-block; margin-top:6px;">📎 Elegir/cambiar archivo<input type="file" accept="image/*,.pdf" id="inputDistribPoblacion" style="display:none;"></label>
    </div>

    <div class="informe-form-bloque">
      <label class="rotulo-mini">Actividades de etapa de preparativos</label>
      <p style="font-size:11.5px; color:var(--ink-dim); margin:0 0 8px;">Descripción y fotos de lo hecho en preparativos (antes de la parada).</p>
      <textarea id="inputPreparativosTexto" rows="3" placeholder="Una idea por línea, como en actividades de parada"></textarea>
      <div id="preparativosFotosWrap"></div>
      <button id="btnAddPreparativosFoto" type="button" class="btn-add-foto">+ Agregar foto</button>
      <button id="btnGuardarPreparativos" type="button" class="btn-guardar-comentario">Guardar preparativos</button>
    </div>

    <div class="informe-form-bloque">
      <label class="rotulo-mini">Herramientas (texto o pegado de Excel)</label>
      <textarea id="inputHerramientas" rows="4" placeholder="Una herramienta por línea — ej: Llave torquímetro 1&quot; — 2 und."></textarea>
    </div>

    <div class="informe-form-bloque">
      <label class="rotulo-mini">Anexos (PDF o imágenes — cada hoja en su propia página)</label>
      <div id="anexosListWrap"></div>
      <label class="foto-slot-btn" style="display:inline-block; margin-top:6px;">📎 + Agregar anexo<input type="file" accept="image/*,.pdf" id="inputAnexo" style="display:none;"></label>
    </div>

    <div class="informe-form-bloque">
      <label class="rotulo-mini">Recomendaciones por actividad (opcional)</label>
      <div id="recomendacionesListWrap"></div>
    </div>

    <div class="informe-card-acciones" style="margin-top:6px; margin-bottom:24px;">
      <a href="#" target="_blank" rel="noopener" class="btn-mini" id="linkAbrirWordInforme" style="display:none;">Abrir Word</a>
      <button type="button" class="btn-mini" id="btnVistaPreviaWordInforme">👁 Vista previa</button>
      <button type="button" class="btn-mini btn-mini-primary" id="btnRellenarWordInforme">⬇ Rellenar Word</button>
      <button type="button" class="btn-mini" id="btnGenerarPdfInforme">⬇ PDF (borrador)</button>
    </div>
  `;
  main.appendChild(div);

  document.getElementById('btnVolverDeDetalleInforme').addEventListener('click', () => { renderVistaInformes(); irAVista('informes'); });
  document.getElementById('btnBorrarInformeDetalle').addEventListener('click', () => {
    if (!state.informeActivo) return;
    borrarInforme(state.informeActivo.id, () => { renderVistaInformes(); irAVista('informes'); });
  });
  document.getElementById('btnVerActividadesInforme').addEventListener('click', () => {
    if (!state.informeActivo) return;
    state.filtroInforme = (state.informeActivo.otNums || []).map(String);
    irAVista('avance');
  });

  document.getElementById('inputPortadaFoto').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    mostrarPreviewLocalPendiente('detallePortadaPreviewWrap', file, false);
    subirArchivoInforme(file, 'portadaFotoUrl', renderDetallePortadaPreview);
  });
  document.getElementById('inputDistribPoblacion').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    mostrarPreviewLocalPendiente('detalleDistribPreviewWrap', file, false);
    subirArchivoInforme(file, 'distribucionPoblacionUrl', renderDetalleDistribPreview);
  });
  document.getElementById('inputEncargadoFirma').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    mostrarPreviewLocalPendiente('detalleFirmaPreviewWrap', file, true);
    subirArchivoInforme(file, 'encargadoFirmaUrl', renderDetalleFirmaPreview);
  });
  document.getElementById('inputAnexo').addEventListener('change', (e) => subirAnexoInforme(e.target.files[0]));

  ['inputObjetivoPrincipal', 'inputAdminCentinela', 'inputAdminSemiva', 'inputEncargadoNombre', 'inputHerramientas'].forEach((id) => {
    const campoMap = {
      inputObjetivoPrincipal: 'objetivoPrincipal', inputAdminCentinela: 'adminCentinela', inputAdminSemiva: 'adminSemiva',
      inputEncargadoNombre: 'encargadoNombre', inputHerramientas: 'herramientasTexto',
    };
    document.getElementById(id).addEventListener('blur', (e) => guardarCampoInformeActivo(campoMap[id], e.target.value));
  });

  document.getElementById('btnAddPreparativosFoto').addEventListener('click', () => {
    preparativosFotoRows.push({ file: null, previewUrl: null, descripcion: '' });
    renderPreparativosFotoRows();
  });
  document.getElementById('btnGuardarPreparativos').addEventListener('click', guardarPreparativosInforme);

  document.getElementById('btnRellenarWordInforme').addEventListener('click', async () => {
    const btn = document.getElementById('btnRellenarWordInforme');
    const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Generando…';
    try { await generateInformeWordReal(state.informeActivo); }
    catch (e) { console.error(e); showToast(e.message || 'No se pudo generar el Word'); }
    btn.disabled = false; btn.textContent = txt;
  });
  document.getElementById('btnVistaPreviaWordInforme').addEventListener('click', async () => {
    const btn = document.getElementById('btnVistaPreviaWordInforme');
    const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Generando…';
    try { await abrirVistaPreviaWord(state.informeActivo); }
    catch (e) { console.error(e); showToast(e.message || 'No se pudo generar la vista previa'); }
    btn.disabled = false; btn.textContent = txt;
  });
  document.getElementById('btnGenerarPdfInforme').addEventListener('click', async () => {
    const btn = document.getElementById('btnGenerarPdfInforme');
    const txt = btn.textContent; btn.disabled = true; btn.textContent = 'Generando…';
    try { await generateInformePdf(state.informeActivo); }
    catch (e) { console.error(e); showToast('No se pudo generar el PDF'); }
    btn.disabled = false; btn.textContent = txt;
  });
}

function renderDetallePortadaPreview() {
  const wrap = document.getElementById('detallePortadaPreviewWrap');
  if (!wrap || !state.informeActivo) return;
  const url = state.informeActivo.portadaFotoUrl;
  wrap.innerHTML = url ? `<img src="${url}" style="max-width:220px; border-radius:8px; display:block;">` : '<p style="font-size:11.5px; color:var(--ink-dim); margin:0;">Sin foto todavía.</p>';
}

function renderDetalleFirmaPreview() {
  const wrap = document.getElementById('detalleFirmaPreviewWrap');
  if (!wrap || !state.informeActivo) return;
  const url = state.informeActivo.encargadoFirmaUrl;
  wrap.innerHTML = url ? `<img src="${url}" style="max-width:180px; max-height:80px; background:#fff; border-radius:8px; display:block; padding:4px;">` : '<p style="font-size:11.5px; color:var(--ink-dim); margin:0;">Sin firma todavía.</p>';
}

function renderDetalleDistribPreview() {
  const wrap = document.getElementById('detalleDistribPreviewWrap');
  if (!wrap || !state.informeActivo) return;
  const url = state.informeActivo.distribucionPoblacionUrl;
  wrap.innerHTML = url ? `<a href="${url}" target="_blank" rel="noopener" class="btn-mini">Ver archivo cargado</a>` : '<p style="font-size:11.5px; color:var(--ink-dim); margin:0;">Sin archivo todavía.</p>';
}

// Anexos en camino (elegidos pero todavía subiéndose a Storage) — se muestran
// de una vez en la lista, igual que la vista previa local de portada/firma,
// para que subir un anexo con mala señal no se sienta como que "no pasó nada".
let anexosPendientes = [];

function renderAnexosLista() {
  const wrap = document.getElementById('anexosListWrap');
  if (!wrap || !state.informeActivo) return;
  const anexos = state.informeActivo.anexos || [];
  const filasGuardadas = anexos.map((a, i) => `
    <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--line);">
      <a href="${a.url}" target="_blank" rel="noopener" style="flex:1; font-size:12.5px; color:var(--brand); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escBit(a.nombre)}</a>
      <button type="button" class="btn-x-emergente-mini" data-quitaranexo="${i}">✕</button>
    </div>`).join('');
  const filasPendientes = anexosPendientes.map((p) => `
    <div style="display:flex; align-items:center; gap:8px; padding:6px 0; border-bottom:1px solid var(--line); opacity:.6;">
      <span style="flex:1; font-size:12.5px; color:var(--ink-dim); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">⏳ Subiendo ${escBit(p.nombre)}…</span>
    </div>`).join('');
  wrap.innerHTML = (filasGuardadas + filasPendientes) || '<p style="font-size:11.5px; color:var(--ink-dim); margin:0;">Sin anexos todavía.</p>';
  wrap.querySelectorAll('[data-quitaranexo]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const anexos = (state.informeActivo.anexos || []).slice();
      anexos.splice(parseInt(btn.dataset.quitaranexo, 10), 1);
      await informesCollection().doc(state.informeActivo.id).update({ anexos });
      state.informeActivo.anexos = anexos;
      renderAnexosLista();
    });
  });
}

function renderRecomendacionesLista() {
  const wrap = document.getElementById('recomendacionesListWrap');
  if (!wrap || !state.informeActivo) return;
  const ots = (state.informeActivo.otNums || []).map((n) => allOts().find((o) => String(o.otNum) === String(n))).filter(Boolean);
  const recs = state.informeActivo.recomendaciones || {};
  wrap.innerHTML = ots.map((ot) => `
    <div style="margin-bottom:10px;">
      <label style="font-size:11.5px; color:var(--ink-muted); display:block; margin-bottom:4px;">${ot.manual ? escBit(ot.descripcion) : `OT ${ot.otNum} — ${escBit(ot.descripcion)}`}</label>
      <textarea rows="2" data-recomendacion="${ot.otNum}" placeholder="(opcional)">${escBit(recs[ot.otNum] || '')}</textarea>
    </div>`).join('') || '<p style="font-size:11.5px; color:var(--ink-dim); margin:0;">Este informe no tiene actividades todavía.</p>';
  wrap.querySelectorAll('[data-recomendacion]').forEach((ta) => {
    ta.addEventListener('blur', async () => {
      const recs = { ...(state.informeActivo.recomendaciones || {}) };
      recs[ta.dataset.recomendacion] = ta.value;
      await informesCollection().doc(state.informeActivo.id).update({ recomendaciones: recs });
      state.informeActivo.recomendaciones = recs;
    });
  });
}

async function guardarCampoInformeActivo(campo, valor) {
  if (!state.informeActivo) return;
  try {
    await informesCollection().doc(state.informeActivo.id).update({ [campo]: valor });
    state.informeActivo[campo] = valor;
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar — revisa tu conexión');
  }
}

// ============================================================
// Subida de archivos de un informe (foto de portada, firma, distribución de
// población, anexos, fotos de preparativos) a Firebase Storage.
//
// Con mala señal en terreno una subida puede demorar bastante o fallar del
// todo, así que TODOS los casos siguen el mismo patrón:
//   1. Se muestra de una vez una vista previa local (no depende de la red),
//      para que elegir el archivo se sienta como que sí funcionó.
//   2. Mientras haya alguna subida real en curso, se avisa antes de cerrar
//      o refrescar la pestaña — si no, se pierde a medio camino sin aviso.
//   3. Si falla, se avisa con un mensaje claro y se vuelve a mostrar lo que
//      de verdad quedó guardado (nunca se deja una vista previa engañosa).
// ============================================================

let subidasInformeEnCurso = 0;
window.addEventListener('beforeunload', (e) => {
  if (subidasInformeEnCurso > 0) { e.preventDefault(); e.returnValue = ''; }
});

function mostrarPreviewLocalPendiente(wrapId, file, esImagenChica) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const blobUrl = URL.createObjectURL(file);
  const estiloImg = esImagenChica
    ? 'max-width:180px; max-height:80px; background:#fff; border-radius:8px; display:block; padding:4px; opacity:.55;'
    : 'max-width:220px; border-radius:8px; display:block; opacity:.55;';
  wrap.innerHTML = file.type.startsWith('image/')
    ? `<img src="${blobUrl}" style="${estiloImg}">`
    : '';
  wrap.innerHTML += `<p style="font-size:11px; color:var(--brand); margin:4px 0 0;">⏳ Subiendo ${escBit(file.name)}…</p>`;
}

// Sube un archivo a paradas/{PARADA_ID}/informes/{id}/{pathSufijo} y devuelve
// su URL final. Lanza si falla — cada llamador decide cómo reaccionar.
async function subirArchivoAStorage(file, pathSufijo) {
  subidasInformeEnCurso++;
  try {
    const path = `paradas/${PARADA_ID}/informes/${state.informeActivo.id}/${pathSufijo}`;
    const ref = firebase.storage().ref(path);
    await ref.put(file);
    return await ref.getDownloadURL();
  } finally {
    subidasInformeEnCurso--;
  }
}

async function subirArchivoInforme(file, campo, callbackRender) {
  if (!file || !state.informeActivo) return;
  try {
    const url = await subirArchivoAStorage(file, `${campo}_${Date.now()}_${file.name}`);
    await guardarCampoInformeActivo(campo, url);
    showToast('Archivo guardado ✓');
  } catch (e) {
    console.error(e);
    showToast('No se pudo subir el archivo — revisa tu conexión, e inténtalo de nuevo');
  }
  // Se vuelve a mostrar lo que de verdad quedó guardado, haya funcionado o
  // no — así nunca queda en pantalla la vista previa "Subiendo…" colgada.
  if (callbackRender) callbackRender();
}

async function subirAnexoInforme(file) {
  if (!file || !state.informeActivo) return;
  const pendiente = { tempId: Date.now() + '_' + file.name, nombre: file.name };
  anexosPendientes.push(pendiente);
  renderAnexosLista();
  try {
    const url = await subirArchivoAStorage(file, `anexos/${Date.now()}_${file.name}`);
    const anexos = (state.informeActivo.anexos || []).concat([{ nombre: file.name, url, tipo: file.type }]);
    await informesCollection().doc(state.informeActivo.id).update({ anexos });
    state.informeActivo.anexos = anexos;
    showToast('Anexo agregado ✓');
  } catch (e) {
    console.error(e);
    showToast('No se pudo subir el anexo — revisa tu conexión, e inténtalo de nuevo');
  }
  anexosPendientes = anexosPendientes.filter((p) => p.tempId !== pendiente.tempId);
  renderAnexosLista();
}

let preparativosFotoRows = [];
function renderPreparativosFotoRows() {
  const wrap = document.getElementById('preparativosFotosWrap');
  if (!wrap) return;
  wrap.innerHTML = preparativosFotoRows.map((row, i) => `
    <div class="comentario-foto-row">
      <div class="comentario-foto-actions">
        <label class="foto-slot-btn">📷 Tomar foto<input type="file" accept="image/*" capture="environment" class="preparativos-foto-input" data-i="${i}" style="display:none;"></label>
        <label class="foto-slot-btn foto-slot-btn-alt">🖼 Galería<input type="file" accept="image/*" class="preparativos-foto-input" data-i="${i}" style="display:none;"></label>
        <button type="button" class="comentario-foto-remove" data-i="${i}">✕</button>
      </div>
      ${row.previewUrl ? `<img class="comentario-foto-preview" src="${row.previewUrl}">` : ''}
      <input type="text" class="comentario-foto-desc" data-i="${i}" placeholder="Descripción de la foto" value="${escBit(row.descripcion).replace(/"/g, '&quot;')}">
    </div>`).join('');
  wrap.querySelectorAll('.preparativos-foto-input').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const i = Number(inp.dataset.i);
      const file = e.target.files[0];
      if (!file) return;
      preparativosFotoRows[i].file = file;
      const reader = new FileReader();
      reader.onload = () => { preparativosFotoRows[i].previewUrl = reader.result; renderPreparativosFotoRows(); };
      reader.readAsDataURL(file);
    });
  });
  wrap.querySelectorAll('.comentario-foto-desc').forEach((inp) => {
    inp.addEventListener('input', () => { preparativosFotoRows[Number(inp.dataset.i)].descripcion = inp.value; });
  });
  wrap.querySelectorAll('.comentario-foto-remove').forEach((btn) => {
    btn.addEventListener('click', () => { preparativosFotoRows.splice(Number(btn.dataset.i), 1); renderPreparativosFotoRows(); });
  });
}

async function guardarPreparativosInforme() {
  if (!state.informeActivo) return;
  const btn = document.getElementById('btnGuardarPreparativos');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const fotos = [];
    // Cada fila es o una foto ya guardada antes (sin .file, solo previewUrl)
    // o una recién elegida (con .file, todavía sin subir) — las dos tienen
    // que terminar en la lista final, si no, guardar de nuevo borraba las
    // fotos de preparativos que ya estaban.
    for (const row of preparativosFotoRows) {
      if (row.file) {
        const url = await subirArchivoAStorage(row.file, `preparativos/${Date.now()}_${row.file.name}`);
        fotos.push({ url, descripcion: row.descripcion || '' });
      } else if (row.previewUrl) {
        fotos.push({ url: row.previewUrl, descripcion: row.descripcion || '' });
      }
    }
    const bullets = (document.getElementById('inputPreparativosTexto').value || '').split('\n').map((s) => s.trim()).filter(Boolean);
    await informesCollection().doc(state.informeActivo.id).update({ preparativosTexto: bullets, preparativosFotos: fotos });
    state.informeActivo.preparativosTexto = bullets;
    state.informeActivo.preparativosFotos = fotos;
    showToast('Preparativos guardados ✓');
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar — revisa tu conexión');
  }
  btn.disabled = false; btn.textContent = 'Guardar preparativos';
}

// Actualiza el aviso "⏳ Subiendo…" del detalle según si este informe todavía
// no se confirma con el servidor (doc.metadata.hasPendingWrites) — se llama
// tanto al abrir el informe como cada vez que llega una actualización en vivo.
function actualizarBadgePendienteInforme() {
  const badge = document.getElementById('detalleInformePendiente');
  if (!badge || !state.informeActivo) return;
  badge.style.display = state.informeActivo._pendiente ? '' : 'none';
}

function abrirInformeDetalle(id) {
  const inf = state.informes.find((i) => i.id === id);
  if (!inf) return;
  state.informeActivo = inf;
  ensureVistaInformeDetalle();
  actualizarBadgePendienteInforme();

  document.getElementById('detalleInformeNombre').textContent = inf.nombre || '(sin nombre)';
  document.getElementById('inputObjetivoPrincipal').value = inf.objetivoPrincipal || '';
  document.getElementById('inputAdminCentinela').value = inf.adminCentinela || '';
  document.getElementById('inputAdminSemiva').value = inf.adminSemiva || '';
  document.getElementById('inputEncargadoNombre').value = inf.encargadoNombre || '';
  document.getElementById('inputHerramientas').value = inf.herramientasTexto || '';
  document.getElementById('inputPreparativosTexto').value = (inf.preparativosTexto || []).join('\n');
  preparativosFotoRows = (inf.preparativosFotos || []).map((f) => ({ file: null, previewUrl: f.url, descripcion: f.descripcion }));
  renderPreparativosFotoRows();
  renderDetalleFirmaPreview();
  anexosPendientes = [];

  const linkWord = document.getElementById('linkAbrirWordInforme');
  if (inf.url) { linkWord.href = inf.url; linkWord.style.display = ''; } else { linkWord.style.display = 'none'; }

  renderDetallePortadaPreview();
  renderDetalleDistribPreview();
  renderAnexosLista();
  renderRecomendacionesLista();

  irAVista('informe-detalle');
}

function abrirModalInforme() {
  document.getElementById('informeNumero').value = '';
  document.getElementById('informeTituloGeneral').value = '';
  informePendingOts = [];
  const wrap = document.getElementById('informeOtsList');
  const areas = [...new Set(allOts().map((o) => o.area))];
  wrap.innerHTML = areas.map((area) => `
    <div style="font-size:10.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--brand); margin:8px 0 4px;">${area}</div>
    ${allOts().filter((o) => o.area === area).map((ot) => `
      <label style="display:flex; align-items:flex-start; gap:8px; padding:6px 2px; border-bottom:1px solid var(--line); cursor:pointer;">
        <input type="checkbox" class="informe-ot-check" data-ot="${ot.otNum}" style="width:18px; height:18px; margin-top:1px; flex:none; accent-color:var(--brand);">
        <span style="font-size:12.5px; color:var(--ink); line-height:1.4;">${ot.manual ? ot.descripcion : `OT ${ot.otNum} — ${ot.descripcion}`}</span>
      </label>`).join('')}
  `).join('');
  wrap.querySelectorAll('.informe-ot-check').forEach((chk) => {
    chk.addEventListener('change', () => {
      const v = chk.dataset.ot;
      if (chk.checked) informePendingOts.push(v);
      else informePendingOts = informePendingOts.filter((x) => x !== v);
    });
  });
  document.getElementById('informeBackdrop').classList.add('open');
}

async function guardarInformeAdmin() {
  const numero = document.getElementById('informeNumero').value.trim();
  const tituloGeneral = document.getElementById('informeTituloGeneral').value.trim();
  if (!numero) { showToast('Escribe el N° de informe'); return; }
  if (!tituloGeneral) { showToast('Escribe el título del trabajo'); return; }
  if (!informePendingOts.length) { showToast('Elige al menos una actividad'); return; }
  const codigo = `IT-MCEN-${numero}-SUL`;
  const nombre = `${codigo} — ${tituloGeneral}`;
  const btn = document.getElementById('informeSave');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    await informesCollection().add({ nombre, numero, tituloGeneral, otNums: informePendingOts, createdAt: Date.now() });
    showToast('Informe guardado ✓');
    document.getElementById('informeBackdrop').classList.remove('open');
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar el informe — revisa tu conexión');
  }
  btn.disabled = false; btn.textContent = 'Guardar informe';
}

// Arma el informe completo en PDF a partir de lo que ya se cargó en la app (bitácora
// de cada OT del grupo: comentarios turno a turno + fotos con su descripción) — nada
// que tipear aparte. Fotos en pares (2 por fila), máximo 9cm de ancho x 7cm de alto,
// respetando su proporción real. Se regenera cada vez que se toca el botón, así que
// cualquier ajuste que hagas en la app (editar un comentario, agregar una foto) queda
// reflejado con solo volver a generar.
// ============================================================
// Relleno automático del Word REAL (no una recreación) — se descarga la
// plantilla tal cual vive en ./assets/plantilla-informe.docx, se abre como
// zip (es lo que un .docx es), se ubica la tabla real "ACTIVIDADES
// REALIZADAS EN PERIODO DE PARADA" dentro de word/document.xml, y se le
// agregan filas nuevas (FECHA / TURNO DÍA-NOCHE / actividad en negrita /
// viñetas) CLONANDO exactamente el estilo (fuente, tamaño, bordes, sombreado,
// lista con viñetas numId=5) que ya usa esa misma tabla en la plantilla real.
// No se toca ni una letra de lo que ya existe en el documento — solo se
// insertan filas nuevas justo antes de que la tabla se cierre.
// ============================================================

const INFORME_TABLA_ANCLA = 'ACTIVIDADES REALIZADAS EN PERIODO DE PARADA';
const PREPARATIVOS_TABLA_ANCLA = 'ACTIVIDADES REALIZADAS EN PERIODO DE PREPARATIVOS';
const PORTADA_FOTO_ANCLA = 'DEL SERVICIO DE:';
const DISTRIBUCION_POBLACION_ANCLA = 'DISTRIBUCIÓN DE POBLACIÓN';
const ENCARGADO_ANCLA = 'ENCARGADO';
const OBJETIVO_PRINCIPAL_ANCLA = 'OBJETIVO PRINCIPAL';

// Si el usuario escribió su propio objetivo, se usa tal cual. Si no, se arma
// uno en el mismo estilo que trae la plantilla de ejemplo, pero con las
// actividades reales de ESTE informe en vez de las del ejemplo.
function generarObjetivoPrincipalTexto(informe) {
  if (informe.objetivoPrincipal && informe.objetivoPrincipal.trim()) return informe.objetivoPrincipal.trim();
  const ots = (informe.otNums || []).map((n) => allOts().find((o) => String(o.otNum) === String(n))).filter(Boolean);
  const nombres = ots.map((o) => tituloSinEquipo(o.descripcion)).join(', ') || 'las actividades de este informe';
  return `Registrar y sustentar el cumplimiento del servicio de mantenimiento en ${nombres}, detallando actividades, desviaciones/interferencias y evidencias de control, con el fin de respaldar la conformidad del trabajo ejecutado según planificación y estándares de minera Centinela.`;
}

function buildParrafoObjetivoWord(texto) {
  return `<w:p><w:pPr><w:ind w:left="708" w:right="142"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic"/></w:rPr><w:t xml:space="preserve">${escXmlWord(texto)}</w:t></w:r></w:p>`;
}

// Última posición de `texto` dentro de xml, buscando solo entre [desde, hasta)
// — para ubicar "el último par de fotos de ESTA sección" sin agarrar por error
// contenido de otra sección más adelante en el documento (como preparativos
// vs. parada, que usan el mismo patrón de tabla dos veces).
function ultimoIndiceEnRango(xml, texto, desde, hasta) {
  let idx = -1, cursor = desde;
  for (;;) {
    const encontrado = xml.indexOf(texto, cursor);
    if (encontrado === -1 || (hasta !== undefined && hasta !== -1 && encontrado >= hasta)) break;
    idx = encontrado;
    cursor = encontrado + texto.length;
  }
  return idx;
}
const INFORME_TC_BORDERS = '<w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders>';

function escXmlWord(str) {
  return String(str == null ? '' : str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function randParaIdWord() {
  return Math.floor(Math.random() * 0xFFFFFFFF).toString(16).toUpperCase().padStart(8, '0');
}

function fechaDDMMYYYY(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

// Fila "FECHA: dd/mm/aaaa" — clon exacto de la fila con fondo rosado de la plantilla real.
function buildFilaFechaWord(fechaTexto) {
  const pid = randParaIdWord();
  return `<w:tr w14:paraId="${pid}" w14:textId="${pid}"><w:trPr><w:trHeight w:val="283"/><w:jc w:val="center"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="10206" w:type="dxa"/>${INFORME_TC_BORDERS}<w:shd w:val="clear" w:color="auto" w:fill="F2DBDB" w:themeFill="accent2" w:themeFillTint="33"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Sinespaciado"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Cambria" w:hAnsi="Century Gothic" w:cs="Times New Roman"/><w:b/><w:color w:val="000000" w:themeColor="text1"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:eastAsia="es-PE"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Cambria" w:hAnsi="Century Gothic" w:cs="Times New Roman"/><w:b/><w:color w:val="000000" w:themeColor="text1"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:eastAsia="es-PE"/></w:rPr><w:t xml:space="preserve">FECHA: ${escXmlWord(fechaTexto)}</w:t></w:r></w:p></w:tc></w:tr>`;
}

// Quita el "(Equipo 12345)" del final del nombre de la OT — en el resto de la app
// se muestra (Gantt, hoja de detalle), pero en el Word del informe no va.
function tituloSinEquipo(desc) {
  return String(desc || '').replace(/\s*\(Equipo[^)]*\)\s*$/i, '').trim();
}

// Fila "TURNO DÍA/NOCHE" con, dentro, una o más actividades (título en negrita
// sacado del nombre de la OT + sus comentarios como viñetas) — mismo clon de estilo.
// continuaMismoDia=true cuando es el segundo turno bajo la misma fecha (ej. noche
// después del día): se le agrega un borde superior más grueso para que quede
// claramente separado del turno anterior, no solo la linea fina de la celda.
function buildFilaTurnoWord(turnoLabel, items, continuaMismoDia) {
  const pid = randParaIdWord();
  const tcBorders = continuaMismoDia
    ? '<w:tcBorders><w:top w:val="single" w:sz="12" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders>'
    : INFORME_TC_BORDERS;
  const header = `<w:p><w:pPr><w:spacing w:before="120"/><w:ind w:right="115"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Calibri" w:hAnsi="Century Gothic" w:cs="Times New Roman"/><w:b/><w:iCs/><w:sz w:val="20"/><w:u w:val="single"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Calibri" w:hAnsi="Century Gothic" w:cs="Times New Roman"/><w:b/><w:iCs/><w:sz w:val="20"/><w:u w:val="single"/></w:rPr><w:t>${escXmlWord(turnoLabel)}</w:t></w:r></w:p>`;
  const cuerpo = items.map(({ titulo, bullets }) => {
    const tituloPara = `<w:p><w:pPr><w:spacing w:before="80"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic" w:cs="Times New Roman"/><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic" w:cs="Times New Roman"/><w:b/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escXmlWord(tituloSinEquipo(titulo))}</w:t></w:r></w:p>`;
    const listaBullets = (bullets.length ? bullets : ['(sin comentarios registrados)']).map((b) =>
      `<w:p><w:pPr><w:pStyle w:val="Sinespaciado"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="5"/></w:numPr><w:spacing w:line="276" w:lineRule="auto"/><w:ind w:left="1170" w:hanging="709"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic" w:cs="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic" w:cs="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escXmlWord(b)}</w:t></w:r></w:p>`
    ).join('');
    return tituloPara + listaBullets;
  }).join('');
  return `<w:tr w14:paraId="${pid}" w14:textId="${pid}"><w:trPr><w:trHeight w:val="482"/><w:jc w:val="center"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="10206" w:type="dxa"/>${tcBorders}<w:vAlign w:val="center"/></w:tcPr>${header}${cuerpo}</w:tc></w:tr>`;
}

const INFORME_EMU_POR_CM = 360000;
const INFORME_FOTO_MAX_ANCHO_CM = 9;
const INFORME_FOTO_MAX_ALTO_CM = 7;

// Baja la foto (URL de Firebase Storage), la RECORTA al centro para que su
// proporción sea exactamente 9:7 (así no quedan márgenes/franjas vacías dentro
// de la celda de 9x7cm — la foto la llena completa), la reduce a un tamaño
// razonable para imprimir y la vuelve a codificar como JPEG — así siempre se
// sabe el formato que se está incrustando, sin importar si el original era
// HEIC/PNG/lo que sea. Devuelve null (en vez de lanzar) si la foto no se pudo
// procesar, para que una foto rota no tumbe el informe completo.
async function prepararFotoParaWord(url, cxDestino, cyDestino) {
  try {
    const r = await fetch(url);
    const blob = await r.blob();
    const bitmap = await createImageBitmap(blob);

    const cx = cxDestino || Math.round(INFORME_FOTO_MAX_ANCHO_CM * INFORME_EMU_POR_CM);
    const cy = cyDestino || Math.round(INFORME_FOTO_MAX_ALTO_CM * INFORME_EMU_POR_CM);
    const targetRatio = cx / cy;
    let sx = 0, sy = 0, sw = bitmap.width, sh = bitmap.height;
    const srcRatio = sw / sh;
    if (srcRatio > targetRatio) {
      sw = Math.round(sh * targetRatio);
      sx = Math.round((bitmap.width - sw) / 2);
    } else if (srcRatio < targetRatio) {
      sh = Math.round(sw / targetRatio);
      sy = Math.round((bitmap.height - sh) / 2);
    }

    const maxDim = 1600;
    let outW = sw, outH = sh;
    if (outW > maxDim || outH > maxDim) {
      const s = maxDim / Math.max(outW, outH);
      outW = Math.round(outW * s); outH = Math.round(outH * s);
    }
    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    canvas.getContext('2d').drawImage(bitmap, sx, sy, sw, sh, 0, 0, outW, outH);
    const outBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    const bytes = new Uint8Array(await outBlob.arrayBuffer());

    // La foto ya viene recortada exactamente a la proporción de cx/cy, así que
    // no hace falta (ni conviene) recalcular el tamaño final en base a ella.
    return { bytes, cx, cy };
  } catch (e) {
    console.error('No se pudo preparar una foto para el Word:', e);
    return null;
  }
}

// Firma escaneada/foteada: a diferencia de una foto de actividad, NO se
// recorta a una proporción fija — se escala completa a una altura fija
// (2cm, igual que las firmas de ejemplo que ya trae la plantilla) y el
// ancho se calcula solo, respetando la proporción real de la imagen. Se usa
// PNG (no JPEG) para conservar la transparencia si la firma la trae.
async function prepararFirmaParaWord(url, cyDestino) {
  try {
    const r = await fetch(url);
    const blob = await r.blob();
    const bitmap = await createImageBitmap(blob);
    const cy = cyDestino || Math.round(2 * INFORME_EMU_POR_CM);
    const cx = Math.round(cy * (bitmap.width / bitmap.height));

    const maxDim = 800;
    let outW = bitmap.width, outH = bitmap.height;
    if (outW > maxDim || outH > maxDim) {
      const s = maxDim / Math.max(outW, outH);
      outW = Math.round(outW * s); outH = Math.round(outH * s);
    }
    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    canvas.getContext('2d').drawImage(bitmap, 0, 0, outW, outH);
    const outBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    const bytes = new Uint8Array(await outBlob.arrayBuffer());
    return { bytes, cx, cy };
  } catch (e) {
    console.error('No se pudo preparar la firma para el Word:', e);
    return null;
  }
}

// XML de una foto ya incrustada (<w:drawing> inline, sin recorte ni borde) —
// clon del patrón <wp:inline> que ya usa la propia plantilla para sus fotos.
function buildDrawingXmlWord(rId, cx, cy, docPrId) {
  return `<w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="${docPrId}" name="Imagen ${docPrId}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="Picture ${docPrId}"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill rotWithShape="1"><a:blip r:embed="${rId}"/><a:stretch/></pic:blipFill><pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:ln><a:noFill/></a:ln></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing>`;
}

// ---- Bloque "REGISTRO FOTOGRÁFICO": clon EXACTO de cómo la plantilla real
// arma cada par de fotos — mapeado directo desde el documento real, no
// inventado. Cada par vive en su PROPIA tabla chica de 2 columnas (FECHA con
// gridSpan=2, "IMAGEN N / IMAGEN N+1" en verde, la foto en su celda de 9x7cm,
// "Descripción:" en gris) y esa tabla va, a su vez, DENTRO de una fila de una
// tabla contenedora más grande — la fila trae 2 párrafos vacíos ANTES de la
// tabla chica, que son el espacio de separación entre un par y el siguiente
// (el mismo "aire" que se ve en la plantilla real entre pares). Cada par
// nuevo se agrega como una fila hermana más de esa tabla contenedora, justo
// después del último par que ya existe — nunca dentro de "ACTIVIDADES
// REALIZADAS", que es donde estaban mal puestas las fotos antes. ----
const REGISTRO_FOTOS_ANCLA = 'REGISTRO FOTOGR';
const REGISTRO_FOTOS_TC_ANCHO = 5102; // twips — mitad de la tabla del par (10204), ≈9cm

function buildFilaFechaRegistroWord(fechaTexto) {
  const pid = randParaIdWord();
  return `<w:tr w14:paraId="${pid}" w14:textId="${pid}"><w:trPr><w:trHeight w:val="283"/><w:jc w:val="center"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="10204" w:type="dxa"/><w:gridSpan w:val="2"/><w:shd w:val="clear" w:color="auto" w:fill="F2DBDB"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Cambria" w:hAnsi="Century Gothic"/><w:b/><w:color w:val="000000" w:themeColor="text1"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Cambria" w:hAnsi="Century Gothic"/><w:b/><w:color w:val="000000" w:themeColor="text1"/></w:rPr><w:t xml:space="preserve">FECHA: ${escXmlWord(fechaTexto)}</w:t></w:r></w:p></w:tc></w:tr>`;
}

function buildFilaImagenHeaderWord(numA, numB) {
  const pid = randParaIdWord();
  const celda = (num) => `<w:tc><w:tcPr><w:tcW w:w="${REGISTRO_FOTOS_TC_ANCHO}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="92D050"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Cambria" w:hAnsi="Century Gothic"/><w:b/><w:color w:val="000000" w:themeColor="text1"/></w:rPr></w:pPr>${num ? `<w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Cambria" w:hAnsi="Century Gothic"/><w:b/><w:color w:val="000000" w:themeColor="text1"/></w:rPr><w:t xml:space="preserve">IMAGEN ${num}</w:t></w:r>` : ''}</w:p></w:tc>`;
  return `<w:tr w14:paraId="${pid}" w14:textId="${pid}"><w:trPr><w:trHeight w:val="283"/><w:jc w:val="center"/></w:trPr>${celda(numA)}${celda(numB)}</w:tr>`;
}

function buildFilaFotoWord(drawingXmlA, drawingXmlB) {
  const pid = randParaIdWord();
  const celda = (drawingXml) => `<w:tc><w:tcPr><w:tcW w:w="${REGISTRO_FOTOS_TC_ANCHO}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Contenido"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic"/></w:rPr></w:pPr>${drawingXml ? `<w:r>${drawingXml}</w:r>` : ''}</w:p></w:tc>`;
  return `<w:tr w14:paraId="${pid}" w14:textId="${pid}"><w:trPr><w:trHeight w:val="3969"/><w:jc w:val="center"/></w:trPr>${celda(drawingXmlA)}${celda(drawingXmlB)}</w:tr>`;
}

function buildFilaDescripcionRegistroWord(descA, descB) {
  const pid = randParaIdWord();
  const celda = (desc) => `<w:tc><w:tcPr><w:tcW w:w="${REGISTRO_FOTOS_TC_ANCHO}" w:type="dxa"/><w:shd w:val="clear" w:color="auto" w:fill="D9CECE"/></w:tcPr><w:p><w:pPr><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Calibri" w:hAnsi="Century Gothic"/><w:b/><w:bCs/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Calibri" w:hAnsi="Century Gothic"/><w:b/><w:bCs/></w:rPr><w:t>Descripción:</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Calibri" w:hAnsi="Century Gothic"/><w:bCs/></w:rPr></w:pPr>${desc ? `<w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Calibri" w:hAnsi="Century Gothic"/><w:bCs/></w:rPr><w:t xml:space="preserve">${escXmlWord(desc)}</w:t></w:r>` : ''}</w:p></w:tc>`;
  return `<w:tr w14:paraId="${pid}" w14:textId="${pid}"><w:trPr><w:trHeight w:val="1138"/><w:jc w:val="center"/></w:trPr>${celda(descA)}${celda(descB)}</w:tr>`;
}

// La tabla CHICA completa de un par (FECHA + IMAGEN N/N+1 + foto + descripción)
// — clon exacto de tblPr/tblGrid que ya usa la plantilla para esto.
function buildTablaParWord(fechaTexto, numA, numB, drawingXmlA, drawingXmlB, descA, descB) {
  return `<w:tbl><w:tblPr><w:tblStyle w:val="Tablaconcuadrcula"/><w:tblW w:w="10204" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid><w:gridCol w:w="${REGISTRO_FOTOS_TC_ANCHO}"/><w:gridCol w:w="${REGISTRO_FOTOS_TC_ANCHO}"/></w:tblGrid>${buildFilaFechaRegistroWord(fechaTexto)}${buildFilaImagenHeaderWord(numA, numB)}${buildFilaFotoWord(drawingXmlA, drawingXmlB)}${buildFilaDescripcionRegistroWord(descA, descB)}</w:tbl>`;
}

// La fila EXTERNA que envuelve la tabla chica de un par — clon exacto de la
// fila contenedora real: 2 párrafos en blanco (el espacio entre pares) y
// después la tabla chica. Esta fila se agrega como hermana de las que ya
// existen, dentro de la tabla grande que las contiene a todas.
function buildFilaExternaParWord(tablaParXml) {
  const pid = randParaIdWord();
  const blank = () => `<w:p w14:paraId="${randParaIdWord()}" w14:textId="${randParaIdWord()}"><w:pPr><w:rPr><w:u w:val="single"/></w:rPr></w:pPr></w:p>`;
  return `<w:tr w14:paraId="${pid}" w14:textId="${pid}"><w:trPr><w:jc w:val="center"/></w:trPr><w:tc><w:tcPr><w:tcW w:w="10704" w:type="dxa"/><w:gridSpan w:val="2"/></w:tcPr>${blank()}${blank()}${tablaParXml}</w:tc></w:tr>`;
}

// Recibe la lista de fotos ya incrustadas (en orden, cada una con su fecha) y
// arma una fila EXTERNA por cada PAR (cada una con sus 2 párrafos en blanco
// de separación + su propia tabla chica FECHA/IMAGEN/foto/descripción) — la
// fecha se repite en cada par, igual que en la plantilla real; no se agrupan
// varios pares bajo una sola fecha. Si sobra una foto suelta al final de un
// día, esa tabla queda con la segunda celda vacía (igual que en la
// plantilla). No se pairean fotos de fechas distintas en un mismo par.
function buildBloqueRegistroFotosWord(fotosEmbebidas) {
  let out = '';
  let contador = 0;
  let i = 0;
  while (i < fotosEmbebidas.length) {
    const a = fotosEmbebidas[i];
    const siguiente = fotosEmbebidas[i + 1];
    const b = (siguiente && siguiente.fechaTexto === a.fechaTexto) ? siguiente : null;

    const tablaPar = buildTablaParWord(
      a.fechaTexto, contador + 1, b ? contador + 2 : null,
      a.drawingXml, b ? b.drawingXml : null,
      a.descripcion, b ? b.descripcion : null
    );
    out += buildFilaExternaParWord(tablaPar);

    contador += b ? 2 : 1;
    i += b ? 2 : 1;
  }
  return out;
}

// La sección "REGISTRO FOTOGRÁFICO EN PERIODO DE PREPARATIVOS" NO usa la
// misma estructura que la de parada (tabla grande con una fila por par) —
// mapeado de la plantilla real: ahí cada tabla chica de par va SUELTA,
// directo en el cuerpo del documento, separada de la siguiente por 3
// párrafos (uno en blanco, uno con salto de página, otro en blanco), sin
// ninguna tabla ni fila que las envuelva. Por eso necesita su propio
// separador y su propio armador de bloque — reutiliza igual buildTablaParWord.
function buildSeparadorRegistroFotosPreparativosWord() {
  const p1 = randParaIdWord(), p2 = randParaIdWord(), p3 = randParaIdWord();
  const rPr = '<w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic"/></w:rPr>';
  return `<w:p w14:paraId="${p1}" w14:textId="${p1}"><w:pPr>${rPr}</w:pPr></w:p>`
    + `<w:p w14:paraId="${p2}" w14:textId="${p2}"><w:pPr>${rPr}</w:pPr><w:r>${rPr}<w:br w:type="page"/></w:r></w:p>`
    + `<w:p w14:paraId="${p3}" w14:textId="${p3}"><w:pPr>${rPr}</w:pPr></w:p>`;
}

function buildBloqueRegistroFotosPreparativosWord(fotosEmbebidas) {
  let out = '';
  let contador = 0;
  let i = 0;
  while (i < fotosEmbebidas.length) {
    const a = fotosEmbebidas[i];
    const siguiente = fotosEmbebidas[i + 1];
    const b = (siguiente && siguiente.fechaTexto === a.fechaTexto) ? siguiente : null;

    out += buildSeparadorRegistroFotosPreparativosWord();
    out += buildTablaParWord(
      a.fechaTexto, contador + 1, b ? contador + 2 : null,
      a.drawingXml, b ? b.drawingXml : null,
      a.descripcion, b ? b.descripcion : null
    );

    contador += b ? 2 : 1;
    i += b ? 2 : 1;
  }
  return out;
}

// ---- Conclusiones / Recomendaciones: dos tablas de 2 columnas (ÍTEM
// numerado automático + texto), idénticas en estructura — mapeadas de la
// plantilla real, cada una con su propia numeración (numId=2 conclusiones,
// numId=16 recomendaciones). Se arma una fila por actividad. ----
const CONCLUSIONES_INTRO_ANCLA = ' concluye lo siguiente.';
const RECOMENDACIONES_INTRO_ANCLA = 'recomienda';
const CONCLUSIONES_NUM_ID = 2;
const RECOMENDACIONES_NUM_ID = 16;

function buildFilaItemTextoWord(numId, parrafos) {
  const pid = randParaIdWord();
  const itemCell = `<w:tc><w:tcPr><w:tcW w:w="1134" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders><w:shd w:val="clear" w:color="auto" w:fill="92D050"/><w:tcMar><w:top w:w="66" w:type="dxa"/><w:left w:w="115" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="115" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Sinespaciado"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="${numId}"/></w:numPr><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic" w:cs="Times New Roman"/><w:b/><w:bCs/><w:color w:val="000000" w:themeColor="text1"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr></w:p></w:tc>`;
  const bodyParas = parrafos.map((p) =>
    `<w:p><w:pPr><w:pStyle w:val="Sinespaciado"/><w:ind w:right="56"/><w:jc w:val="both"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic" w:cs="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr><w:r><w:rPr>${p.bold ? '<w:b/><w:bCs/>' : ''}<w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic" w:cs="Times New Roman"/><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escXmlWord(p.text)}</w:t></w:r></w:p>`
  ).join('');
  const bodyCell = `<w:tc><w:tcPr><w:tcW w:w="7938" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders><w:tcMar><w:top w:w="66" w:type="dxa"/><w:left w:w="115" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="115" w:type="dxa"/></w:tcMar></w:tcPr>${bodyParas}</w:tc>`;
  return `<w:tr w14:paraId="${pid}" w14:textId="${pid}"><w:trPr><w:trHeight w:val="857"/><w:jc w:val="center"/></w:trPr>${itemCell}${bodyCell}</w:tr>`;
}

// Texto de conclusión por actividad — usa el estado real (cancelada / avance
// %) y, si hay, las viñetas ya cargadas en la bitácora de esa OT (evidencia
// real, no texto inventado). Si no hay ninguna viñeta cargada, cae a una
// frase genérica según el estado.
function generarConclusionTextoOt(ot) {
  const estado = getOtEstado(ot.otNum);
  const cancelada = estado.startsWith('Cancelada');
  if (cancelada) return 'Esta actividad fue cancelada durante la ejecución del servicio.';
  const pct = Math.round(otProgressAt(ot, SEED_DATA.turnoLabels.length - 1) * 100);
  const bullets = state.bitacora.filter((b) => String(b.otNum) === String(ot.otNum)).flatMap((b) => b.bullets || []);
  if (!bullets.length) {
    return pct >= 100
      ? 'Se completó la actividad según lo planificado, cumpliendo con los estándares de calidad y seguridad establecidos.'
      : `La actividad quedó con un avance de ${pct}% al cierre del periodo.`;
  }
  const intro = pct >= 100 ? 'Se completó la actividad realizando lo siguiente: ' : `La actividad avanzó un ${pct}%, realizando lo siguiente: `;
  const bulletsSinPunto = bullets.map((b) => b.trim().replace(/\.+$/, ''));
  return intro + bulletsSinPunto.join('. ') + '.';
}

function buildFilaConclusionWord(ot) {
  const otTexto = ot.tipo === 'Emergente' ? 'EMERGENTE' : ot.otNum;
  return buildFilaItemTextoWord(CONCLUSIONES_NUM_ID, [
    { text: `OT: ${otTexto} | ${tituloSinEquipo(ot.descripcion).toUpperCase()}`, bold: true },
    { text: generarConclusionTextoOt(ot), bold: false },
  ]);
}

function buildFilaRecomendacionWord(ot, texto) {
  const otTexto = ot.tipo === 'Emergente' ? 'EMERGENTE' : ot.otNum;
  return buildFilaItemTextoWord(RECOMENDACIONES_NUM_ID, [
    { text: `OT: ${otTexto} | ${tituloSinEquipo(ot.descripcion).toUpperCase()}`, bold: true },
    { text: texto, bold: false },
  ]);
}

// Reemplaza el <w:t> de la celda hermana (el valor) de una fila tipo
// "ETIQUETA: | valor" — usada en la tabla de Administradores. IMPORTANTE:
// el patrón exige que "w:t" sea el nombre COMPLETO de la etiqueta (con "\s"
// o ">" justo después), porque un patrón más laxo como /<w:t[^>]*>/ también
// matchea por accidente contra "<w:tcPr>" o "<w:tbl>" (por el prefijo "w:t").
function reemplazarValorCeldaWord(xml, labelIdx, texto) {
  const labelTcEnd = xml.indexOf('</w:tc>', labelIdx);
  const valueTcStart = xml.indexOf('<w:tc>', labelTcEnd);
  const valueTcEnd = xml.indexOf('</w:tc>', valueTcStart) + '</w:tc>'.length;
  const celda = xml.slice(valueTcStart, valueTcEnd);
  const m = celda.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/);
  if (!m) return xml;
  const nuevaCelda = celda.slice(0, m.index) + m[0].slice(0, m[0].indexOf('>') + 1) + escXmlWord(texto) + '</w:t>' + celda.slice(m.index + m[0].length);
  return xml.slice(0, valueTcStart) + nuevaCelda + xml.slice(valueTcEnd);
}

// El título general, el área y el código del informe (IT-MCEN-XXX-SUL) NO
// son texto suelto: son content controls (SDT) de Word enlazados a un campo
// de customXml/item1.xml (Nombre0/Nombre1/Nombre14) — por eso el mismo
// título aparece en la portada, en el encabezado de CADA página, en el
// índice y en conclusiones/recomendaciones: todos apuntan al mismo dato.
// Word solo re-sincroniza esos controles con el dato real si el usuario
// fuerza "Actualizar campos", así que hay que dejar ya escrito el texto
// correcto en cada aparición (no alcanza con cambiar solo el dato fuente).
// Recibe el XML de UNA sola parte del documento (document.xml, un header o
// un footer) y reemplaza el texto visible de TODAS las apariciones de ese
// campo en esa parte.
function reemplazarTodosLosSdtDeCampo(xml, nombreCampo, nuevoTexto) {
  const marcador = `ns0:${nombreCampo}[1]`;
  const reemplazos = [];
  let cursor = 0;
  while (true) {
    const idx = xml.indexOf(marcador, cursor);
    if (idx === -1) break;
    cursor = idx + marcador.length;
    const sdtContentStart = xml.indexOf('<w:sdtContent>', idx);
    const sdtContentEnd = xml.indexOf('</w:sdtContent>', sdtContentStart);
    if (sdtContentStart === -1 || sdtContentEnd === -1) continue;
    const bloque = xml.slice(sdtContentStart, sdtContentEnd);
    const m = bloque.match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/);
    if (!m) continue;
    const runStart = sdtContentStart + m.index;
    reemplazos.push({ start: runStart, end: runStart + m[0].length, prefix: m[0].slice(0, m[0].indexOf('>') + 1) });
  }
  reemplazos.sort((a, b) => b.start - a.start);
  let out = xml;
  reemplazos.forEach(({ start, end, prefix }) => {
    out = out.slice(0, start) + prefix + escXmlWord(nuevoTexto) + '</w:t>' + out.slice(end);
  });
  return out;
}

// Aplica reemplazarTodosLosSdtDeCampo a TODAS las partes del documento donde
// aparece cada campo (mapeado de la plantilla real: document.xml,
// header1/3/4.xml, footer1.xml) y además actualiza customXml/item1.xml (el
// dato fuente, por si el usuario alguna vez fuerza "Actualizar campos").
function actualizarTituloInformeEnWord(zip, campos) {
  const partesConTexto = ['word/document.xml', 'word/header1.xml', 'word/header3.xml', 'word/header4.xml', 'word/footer1.xml'];
  partesConTexto.forEach((parte) => {
    const archivo = zip.file(parte);
    if (!archivo) return;
    let contenido = archivo.asText();
    let cambio = false;
    Object.entries(campos).forEach(([nombreCampo, valor]) => {
      if (valor === undefined) return;
      const nuevo = reemplazarTodosLosSdtDeCampo(contenido, nombreCampo, valor);
      if (nuevo !== contenido) { contenido = nuevo; cambio = true; }
    });
    if (cambio) zip.file(parte, contenido);
  });

  const customXmlFile = zip.file('customXml/item1.xml');
  if (customXmlFile) {
    let customXml = customXmlFile.asText();
    let cambio = false;
    Object.entries(campos).forEach(([nombreCampo, valor]) => {
      if (valor === undefined) return;
      const regex = new RegExp(`<${nombreCampo}>[\\s\\S]*?</${nombreCampo}>`);
      if (regex.test(customXml)) {
        customXml = customXml.replace(regex, `<${nombreCampo}>${escXmlWord(valor)}</${nombreCampo}>`);
        cambio = true;
      }
    });
    if (cambio) zip.file('customXml/item1.xml', customXml);
  }
}

// Avanza N celdas <w:tc> desde una posición dada, devolviendo el índice de
// inicio de la N-ésima (n=1 es la primera después de `desde`) — para navegar
// filas de varias columnas sin depender de texto (la fila de Supervisor
// Mecánico tiene su etiqueta "DÍA:"/"NOCHE:" repartida letra por letra en
// muchas celdas/runs por el historial de revisión, así que buscarla como
// texto literal no es confiable).
function avanzarNCeldasWord(xml, desde, n) {
  let idx = desde;
  for (let i = 0; i < n; i++) {
    idx = xml.indexOf('<w:tc>', idx);
    if (idx === -1) return -1;
    if (i < n - 1) idx = xml.indexOf('</w:tc>', idx) + '</w:tc>'.length;
  }
  return idx;
}

// Inserta un run de texto dentro de una celda que viene vacía en la
// plantilla (sin ningún <w:r>, solo un <w:p> con estilo pero sin contenido)
// — el caso de las celdas Día/Noche de Supervisor Mecánico.
function insertarValorCeldaVaciaWord(xml, tcStartIdx, texto) {
  const tcEndIdx = xml.indexOf('</w:tc>', tcStartIdx) + '</w:tc>'.length;
  const celda = xml.slice(tcStartIdx, tcEndIdx);
  const pEndIdx = celda.indexOf('</w:p>');
  if (pEndIdx === -1) return xml;
  const run = `<w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Microsoft New Tai Lue" w:hAnsi="Century Gothic" w:cs="Times New Roman"/><w:color w:val="000000"/></w:rPr><w:t xml:space="preserve">${escXmlWord(texto)}</w:t></w:r>`;
  const nuevaCelda = celda.slice(0, pEndIdx) + run + celda.slice(pEndIdx);
  return xml.slice(0, tcStartIdx) + nuevaCelda + xml.slice(tcEndIdx);
}

// Mismo patrón que insertarValorCeldaVaciaWord, pero para meter un <w:drawing>
// (una imagen) en vez de texto — el caso de la celda de firma, que viene
// vacía en la plantilla (a diferencia de las otras dos, que ya traen una
// firma de ejemplo como imagen).
function insertarDrawingEnCeldaVaciaWord(xml, tcStartIdx, drawingXml) {
  const tcEndIdx = xml.indexOf('</w:tc>', tcStartIdx) + '</w:tc>'.length;
  const celda = xml.slice(tcStartIdx, tcEndIdx);
  const pEndIdx = celda.indexOf('</w:p>');
  if (pEndIdx === -1) return xml;
  const run = `<w:r>${drawingXml}</w:r>`;
  const nuevaCelda = celda.slice(0, pEndIdx) + run + celda.slice(pEndIdx);
  return xml.slice(0, tcStartIdx) + nuevaCelda + xml.slice(tcEndIdx);
}

// El supervisor de un informe no se pide manualmente — se calcula desde los
// supervisores YA asignados por turno a cada actividad (OT) del informe
// (los mismos que se usan para filtrar/agrupar en el resto de la app). Si
// Cuando se borra un tramo de XML (el ejemplo de la plantilla) puede llevarse
// puesto un <w:bookmarkEnd> cuyo <w:bookmarkStart> vive ANTES, en contenido
// que sí se conserva (el encabezado de la tabla) — un bookmark con inicio
// pero sin fin es inválido en OOXML, y Word lo detecta como "contenido no
// legible" al abrir el archivo (esto no lo agarra un chequeo de XML
// bien-formado normal, porque un bookmarkEnd huérfano sigue siendo XML
// válido, solo que semánticamente roto). Se recupera cualquier bookmarkEnd
// del tramo borrado para reinsertarlo — mapeado del documento real: siempre
// vive justo antes del cierre de la tabla, así que ahí se lo vuelve a poner.
function extraerBookmarkEndsHuerfanos(chunkQueSeBorra) {
  return [...chunkQueSeBorra.matchAll(/<w:bookmarkEnd w:id="\d+"\s*\/>/g)].map((m) => m[0]).join('');
}

// las OTs del informe tienen supervisores distintos para el mismo turno, se
// usa el que se repite más.
function calcularSupervisorInforme(ots, tipoTurno) {
  const conteo = new Map();
  ots.forEach((ot) => {
    const nombre = getOtSupervisor(ot.otNum, tipoTurno);
    if (nombre) conteo.set(nombre, (conteo.get(nombre) || 0) + 1);
  });
  let mejor = '', mejorConteo = 0;
  conteo.forEach((c, nombre) => { if (c > mejorConteo) { mejor = nombre; mejorConteo = c; } });
  return mejor;
}

// ---- "CUMPLIMIENTO MECÁNICO SOBRE ACTIVIDADES": tabla TAG/OT/DESCRIPCIÓN/
// % EJECUCIÓN + gráfico de torta debajo, tal como se arma en los informes
// reales — no viene en esta plantilla, así que se inserta entera bajo su
// propio encabezado (que sí existe, con el mismo texto). ----
const CUMPLIMIENTO_ANCLA = 'CUMPLIMIENTO MECÁNICO SOBRE ACTIVIDADES';
const CUMPLIMIENTO_COL_TAG = 1500, CUMPLIMIENTO_COL_OT = 1500, CUMPLIMIENTO_COL_DESC = 5700, CUMPLIMIENTO_COL_PCT = 1506;

function buildCeldaCumplimientoWord(ancho, texto, esHeader) {
  const shd = esHeader ? '<w:shd w:val="clear" w:color="auto" w:fill="92D050"/>' : '';
  const bold = esHeader ? '<w:b/>' : '';
  return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders>${shd}<w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Sinespaciado"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic" w:cs="Times New Roman"/>${bold}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic" w:cs="Times New Roman"/>${bold}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escXmlWord(texto)}</w:t></w:r></w:p></w:tc>`;
}

function buildFilaCumplimientoWord(tag, ot, desc, pct, esHeader) {
  const pid = randParaIdWord();
  return `<w:tr w14:paraId="${pid}" w14:textId="${pid}"><w:trPr><w:jc w:val="center"/></w:trPr>`
    + buildCeldaCumplimientoWord(CUMPLIMIENTO_COL_TAG, tag, esHeader)
    + buildCeldaCumplimientoWord(CUMPLIMIENTO_COL_OT, ot, esHeader)
    + buildCeldaCumplimientoWord(CUMPLIMIENTO_COL_DESC, desc, esHeader)
    + buildCeldaCumplimientoWord(CUMPLIMIENTO_COL_PCT, pct, esHeader)
    + `</w:tr>`;
}

function buildTablaCumplimientoWord(filas) {
  const anchoTotal = CUMPLIMIENTO_COL_TAG + CUMPLIMIENTO_COL_OT + CUMPLIMIENTO_COL_DESC + CUMPLIMIENTO_COL_PCT;
  const header = buildFilaCumplimientoWord('TAG', 'OT', 'DESCRIPCIÓN', '% EJECUCIÓN', true);
  const cuerpo = filas.map((f) => buildFilaCumplimientoWord(f.tag, f.ot, f.desc, f.pct, false)).join('');
  return `<w:tbl><w:tblPr><w:tblStyle w:val="Tablaconcuadrcula"/><w:tblW w:w="${anchoTotal}" w:type="dxa"/><w:jc w:val="center"/><w:tblLayout w:type="fixed"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid><w:gridCol w:w="${CUMPLIMIENTO_COL_TAG}"/><w:gridCol w:w="${CUMPLIMIENTO_COL_OT}"/><w:gridCol w:w="${CUMPLIMIENTO_COL_DESC}"/><w:gridCol w:w="${CUMPLIMIENTO_COL_PCT}"/></w:tblGrid>${header}${cuerpo}</w:tbl>`;
}

// Párrafo vacío simple — para el espacio entre la tabla y el gráfico, y para
// envolver la imagen del gráfico (una imagen inline necesita vivir dentro de
// un <w:p>, no puede ir suelta a nivel de cuerpo).
function buildParrafoVacioWord() {
  const pid = randParaIdWord();
  return `<w:p w14:paraId="${pid}" w14:textId="${pid}"/>`;
}
function buildParrafoImagenCenteredWord(drawingXml) {
  const pid = randParaIdWord();
  return `<w:p w14:paraId="${pid}" w14:textId="${pid}"><w:pPr><w:jc w:val="center"/></w:pPr><w:r>${drawingXml}</w:r></w:p>`;
}

// Gráfico de torta (SVG) — 3 categorías fijas: ejecutadas / no ejecutadas /
// emergentes, con etiquetas afuera (nombre + cantidad + %) y línea guía,
// igual al estilo del gráfico nativo de Excel que se ve en los informes
// reales. Se rasteriza con html2canvas y se incrusta como imagen (mismo
// patrón ya usado para la Curva S).
function buildPieChartCumplimientoSvg(datos, W, H) {
  const total = datos.reduce((s, d) => s + d.count, 0) || 1;
  const cx = W / 2, cy = H / 2, r = Math.min(W, H) * 0.26;
  const rad = (a) => (a * Math.PI) / 180;
  let anguloAcum = -90;
  const slices = [];
  const labels = [];
  // Cuántas categorías tienen datos — si es una sola (100%), un <path> de
  // arco no puede dibujar un círculo completo (el punto de inicio y de fin
  // del arco quedan exactamente encimados, así que el navegador no dibuja
  // nada) — hay que usar un <circle> directamente en ese caso.
  const categoriasConDatos = datos.filter((d) => d.count).length;
  datos.forEach((d) => {
    if (!d.count) return;
    const frac = d.count / total;
    const anguloIni = anguloAcum;
    const anguloFin = anguloAcum + frac * 360;
    anguloAcum = anguloFin;
    if (categoriasConDatos === 1) {
      slices.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${d.color}" stroke="#ffffff" stroke-width="1.5"/>`);
    } else {
      const x1 = cx + r * Math.cos(rad(anguloIni)), y1 = cy + r * Math.sin(rad(anguloIni));
      const x2 = cx + r * Math.cos(rad(anguloFin)), y2 = cy + r * Math.sin(rad(anguloFin));
      const largeArc = anguloFin - anguloIni > 180 ? 1 : 0;
      slices.push(`<path d="M${cx},${cy} L${x1.toFixed(2)},${y1.toFixed(2)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(2)},${y2.toFixed(2)} Z" fill="${d.color}" stroke="#ffffff" stroke-width="1.5"/>`);
    }

    const anguloMedio = (anguloIni + anguloFin) / 2;
    const rLabel = r * 1.42;
    const lx = cx + rLabel * Math.cos(rad(anguloMedio)), ly = cy + rLabel * Math.sin(rad(anguloMedio));
    const rLinea = r * 1.03;
    const lnx = cx + rLinea * Math.cos(rad(anguloMedio)), lny = cy + rLinea * Math.sin(rad(anguloMedio));
    const anchor = Math.cos(rad(anguloMedio)) >= 0.05 ? 'start' : (Math.cos(rad(anguloMedio)) <= -0.05 ? 'end' : 'middle');
    const pct = Math.round(frac * 100);
    labels.push(`<line x1="${lnx.toFixed(2)}" y1="${lny.toFixed(2)}" x2="${lx.toFixed(2)}" y2="${ly.toFixed(2)}" stroke="#9A9A9A" stroke-width="1"/>`);
    labels.push(`<text x="${lx.toFixed(2)}" y="${(ly - 5).toFixed(2)}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="12" font-weight="700" fill="#333333">${escXmlWord(d.label)}</text>`);
    labels.push(`<text x="${lx.toFixed(2)}" y="${(ly + 10).toFixed(2)}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="12" fill="#333333">${d.count}; ${pct}%</text>`);
  });
  // Sin título propio: el documento ya trae el encabezado "CUMPLIMIENTO
  // MECÁNICO SOBRE ACTIVIDADES" justo arriba de esta imagen — repetirlo acá
  // quedaba duplicado.
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    ${slices.join('')}
    ${labels.join('')}
  </svg>`;
}

// ---- Itinerario del servicio: una fila por turno (FECHA | TURNO A/B | HR.
// INGRESO | HR. SALIDA | HRS PROGRAMADAS | HRS EFECTIVAS) — se arma entero
// solo, no depende de nada que el usuario cargue: sale directo de
// SEED_DATA.turnos (siempre bloques de 12h desde las 08:00 o las 20:00). ----
const ITINERARIO_ANCLA = 'ITINERARIO';

function formatoHoraTurnoWord(iso) {
  const hora = new Date(iso).getHours();
  return hora === 8 ? '08:00 AM' : '08:00 PM';
}

function buildFilaItinerarioWord(fechaTexto, turnoTipo, horaIngreso, horaSalida) {
  const pid = randParaIdWord();
  const celdaBase = (ancho, texto, bold, azul) => {
    const colorRPr = azul ? '<w:color w:val="4F81BD" w:themeColor="accent1"/>' : '';
    const boldRPr = bold ? '<w:b/>' : '<w:bCs/>';
    return `<w:tc><w:tcPr><w:tcW w:w="${ancho}" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/><w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/></w:tcBorders><w:shd w:val="clear" w:color="auto" w:fill="FFFFFF" w:themeFill="background1"/><w:vAlign w:val="center"/></w:tcPr><w:p><w:pPr><w:pStyle w:val="Sinespaciado"/><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Century Gothic" w:eastAsia="Cambria" w:hAnsi="Century Gothic" w:cs="Times New Roman"/>${boldRPr}${colorRPr}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Century Gothic" w:hAnsi="Century Gothic" w:cs="Times New Roman"/>${boldRPr}${colorRPr}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr><w:t xml:space="preserve">${escXmlWord(texto)}</w:t></w:r></w:p></w:tc>`;
  };
  return `<w:tr w14:paraId="${pid}" w14:textId="${pid}"><w:trPr><w:trHeight w:val="349"/><w:jc w:val="center"/></w:trPr>`
    + celdaBase(1843, fechaTexto, false, false)
    + celdaBase(992, turnoTipo, true, false)
    + celdaBase(1560, horaIngreso, true, true)
    + celdaBase(1701, horaSalida, true, true)
    + celdaBase(1842, '12 Hrs', true, true)
    + celdaBase(1607, '12 Hrs', true, true)
    + `</w:tr>`;
}

// Arma el .docx y devuelve {blob, nombreArchivo} SIN descargarlo — así lo
// puede reusar tanto el botón de descarga directa como la vista previa (que
// necesita el mismo blob para renderizarlo en pantalla).
async function generateInformeWordBlob(informe) {
  if (typeof PizZip === 'undefined') throw new Error('PizZip no cargó — revisa tu conexión.');
  const resp = await fetch('./assets/plantilla-informe.docx');
  if (!resp.ok) throw new Error('No se pudo descargar la plantilla Word.');
  const buf = await resp.arrayBuffer();
  const zip = new PizZip(buf);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('La plantilla no tiene word/document.xml — ¿es un .docx válido?');
  let xml = docFile.asText();

  // "MCEN" (abreviatura de Minera Centinela) → nombre completo. Solo estas 2
  // ocurrencias puntuales en la plantilla (intro de conclusiones y de
  // recomendaciones) — no toca el código del informe (IT-MCEN-XXX-SUL, que
  // sí debe conservar "MCEN").
  xml = xml.split('<w:t>MCEN</w:t>').join('<w:t>MINERA CENTINELA</w:t>');

  // Título del informe (código IT-MCEN-XXX-SUL + título del trabajo): son
  // content controls repetidos en portada, encabezado de cada página, índice
  // y conclusiones/recomendaciones — se actualizan todas las apariciones a
  // la vez. Si el informe no tiene número/título propio todavía (viejo, o
  // recién creado sin completar), se deja el de la plantilla.
  if (informe.numero || informe.tituloGeneral) {
    actualizarTituloInformeEnWord(zip, {
      Nombre14: informe.numero ? `IT-MCEN-${informe.numero}-SUL` : undefined,
      Nombre0: informe.tituloGeneral ? informe.tituloGeneral.toUpperCase() : undefined,
    });
    // document.xml se acaba de reescribir en el zip por actualizarTituloInformeEnWord
    // (para sus propias apariciones) — hay que releerlo para seguir editando
    // sobre esa versión actualizada, si no el resto de esta función pisaría
    // ese cambio al final con la `xml` vieja.
    xml = zip.file('word/document.xml').asText();
  }

  // Relaciones de imágenes: se usan/comparten entre TODAS las secciones que
  // incrustan fotos (portada, preparativos, parada, Curva S) — una sola
  // numeración de rId y un solo bloque a agregar al final.
  const relsPath = 'word/_rels/document.xml.rels';
  let relsXml = zip.file(relsPath).asText();
  const rIdsUsados = [...relsXml.matchAll(/Id="rId(\d+)"/g)].map((m) => parseInt(m[1], 10));
  let nextRid = (rIdsUsados.length ? Math.max(...rIdsUsados) : 0) + 1;
  let nuevasRelsXml = '';
  let contadorImagen = 0;

  // ---- Foto de portada: opcional. Si el informe tiene una foto propia
  // cargada, reemplaza la foto de ejemplo de la plantilla — se mantiene el
  // mismo tamaño (cx/cy) que trae la plantilla para que encaje igual en el
  // diseño de la portada. Si no hay foto propia o no se encuentra la sección,
  // se sigue sin esto (nunca debe tumbar el resto del informe). ----
  if (informe.portadaFotoUrl) {
    try {
      const portadaAnclaIdx = xml.indexOf(PORTADA_FOTO_ANCLA);
      if (portadaAnclaIdx !== -1) {
        const drawingStartIdx = xml.indexOf('<w:drawing', portadaAnclaIdx);
        if (drawingStartIdx !== -1 && drawingStartIdx - portadaAnclaIdx < 3000) {
          const drawingEndIdx = xml.indexOf('</w:drawing>', drawingStartIdx) + '</w:drawing>'.length;
          const extentMatch = xml.slice(drawingStartIdx, drawingStartIdx + 400).match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
          const cxPortada = extentMatch ? parseInt(extentMatch[1], 10) : Math.round(14.52 * INFORME_EMU_POR_CM);
          const cyPortada = extentMatch ? parseInt(extentMatch[2], 10) : Math.round(12 * INFORME_EMU_POR_CM);
          const preparada = await prepararFotoParaWord(informe.portadaFotoUrl, cxPortada, cyPortada);
          if (preparada) {
            contadorImagen++;
            const nombreArchivo = `portada_${Date.now()}.jpeg`;
            const rId = `rId${nextRid++}`;
            zip.file(`word/media/${nombreArchivo}`, preparada.bytes);
            nuevasRelsXml += `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nombreArchivo}"/>`;
            const drawingPortadaXml = buildDrawingXmlWord(rId, cxPortada, cyPortada, 800000 + contadorImagen);
            xml = xml.slice(0, drawingStartIdx) + drawingPortadaXml + xml.slice(drawingEndIdx);
          }
        }
      }
    } catch (e) {
      console.error('No se pudo reemplazar la foto de portada en el Word:', e);
    }
  }

  // ---- Distribución de población: mismo patrón que la foto de portada —
  // el usuario sube directo la captura del cuadro de dotación (Excel/Workpack)
  // y se reemplaza la imagen de ejemplo, manteniendo el mismo tamaño (cx/cy)
  // que ya trae la plantilla. ----
  if (informe.distribucionPoblacionUrl) {
    try {
      const distribAnclaIdx = xml.indexOf(DISTRIBUCION_POBLACION_ANCLA, xml.indexOf(DISTRIBUCION_POBLACION_ANCLA) + 1);
      if (distribAnclaIdx !== -1) {
        const drawingStartIdx = xml.indexOf('<w:drawing', distribAnclaIdx);
        if (drawingStartIdx !== -1 && drawingStartIdx - distribAnclaIdx < 4000) {
          const drawingEndIdx = xml.indexOf('</w:drawing>', drawingStartIdx) + '</w:drawing>'.length;
          const extentMatch = xml.slice(drawingStartIdx, drawingStartIdx + 400).match(/<wp:extent cx="(\d+)" cy="(\d+)"/);
          const cxDistrib = extentMatch ? parseInt(extentMatch[1], 10) : Math.round(25 * INFORME_EMU_POR_CM);
          const cyDistrib = extentMatch ? parseInt(extentMatch[2], 10) : Math.round(9.17 * INFORME_EMU_POR_CM);
          const preparada = await prepararFotoParaWord(informe.distribucionPoblacionUrl, cxDistrib, cyDistrib);
          if (preparada) {
            contadorImagen++;
            const nombreArchivo = `distribpoblacion_${Date.now()}.jpeg`;
            const rId = `rId${nextRid++}`;
            zip.file(`word/media/${nombreArchivo}`, preparada.bytes);
            nuevasRelsXml += `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nombreArchivo}"/>`;
            const drawingDistribXml = buildDrawingXmlWord(rId, cxDistrib, cyDistrib, 820000 + contadorImagen);
            xml = xml.slice(0, drawingStartIdx) + drawingDistribXml + xml.slice(drawingEndIdx);
          }
        }
      }
    } catch (e) {
      console.error('No se pudo reemplazar la imagen de distribución de población en el Word:', e);
    }
  }

  // ---- ENCARGADO / FIRMA (columna "ELABORADO POR" de la tabla de portada):
  // nombre del supervisor a cargo de este informe + su firma escaneada. Las
  // otras dos columnas (REVISADO/VALIDADO POR) ya traen su nombre y firma
  // fijos en la plantilla — no se tocan. ----
  if (informe.encargadoNombre || informe.encargadoFirmaUrl) {
    try {
      const encargadoIdx = xml.indexOf(ENCARGADO_ANCLA);
      if (encargadoIdx !== -1) {
        if (informe.encargadoNombre && informe.encargadoNombre.trim()) {
          xml = reemplazarValorCeldaWord(xml, encargadoIdx, informe.encargadoNombre.trim());
        }
        if (informe.encargadoFirmaUrl) {
          const firmaLabelIdx = xml.indexOf('FIRMA:', encargadoIdx);
          if (firmaLabelIdx !== -1) {
            const firmaLabelTcEnd = xml.indexOf('</w:tc>', firmaLabelIdx);
            const firmaValueTcStart = xml.indexOf('<w:tc>', firmaLabelTcEnd);
            const preparada = await prepararFirmaParaWord(informe.encargadoFirmaUrl, Math.round(2 * INFORME_EMU_POR_CM));
            if (preparada) {
              contadorImagen++;
              const nombreArchivo = `firma_${Date.now()}.png`;
              const rId = `rId${nextRid++}`;
              zip.file(`word/media/${nombreArchivo}`, preparada.bytes);
              nuevasRelsXml += `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nombreArchivo}"/>`;
              const drawingFirmaXml = buildDrawingXmlWord(rId, preparada.cx, preparada.cy, 830000 + contadorImagen);
              xml = insertarDrawingEnCeldaVaciaWord(xml, firmaValueTcStart, drawingFirmaXml);
            }
          }
        }
      }
    } catch (e) {
      console.error('No se pudo agregar el encargado/firma en el Word:', e);
    }
  }

  // ---- Objetivo principal: reemplaza el párrafo de ejemplo (resaltado en
  // amarillo en la plantilla) por el texto propio del informe, o uno
  // generado automáticamente con sus actividades si no se escribió ninguno. ----
  try {
    const objAnclaIdx = xml.indexOf(OBJETIVO_PRINCIPAL_ANCLA);
    if (objAnclaIdx !== -1) {
      const headingParaEndIdx = xml.indexOf('</w:p>', objAnclaIdx);
      if (headingParaEndIdx !== -1) {
        const contentParaStartIdx = xml.indexOf('<w:p', headingParaEndIdx + '</w:p>'.length);
        if (contentParaStartIdx !== -1 && contentParaStartIdx - headingParaEndIdx < 500) {
          const contentParaEndIdx = xml.indexOf('</w:p>', contentParaStartIdx) + '</w:p>'.length;
          const nuevoParrafo = buildParrafoObjetivoWord(generarObjetivoPrincipalTexto(informe));
          xml = xml.slice(0, contentParaStartIdx) + nuevoParrafo + xml.slice(contentParaEndIdx);
        }
      }
    }
  } catch (e) {
    console.error('No se pudo reemplazar el objetivo principal en el Word:', e);
  }

  // ---- Administrador de Contratos Centinela / SEMIVA: solo si el usuario
  // cargó un valor propio — si no, se deja el que ya trae la plantilla. ----
  try {
    if (informe.adminCentinela && informe.adminCentinela.trim()) {
      const centinelaLabelIdx = xml.indexOf('ADMINISTRADOR DE CONTRATOS ');
      if (centinelaLabelIdx !== -1) xml = reemplazarValorCeldaWord(xml, centinelaLabelIdx, informe.adminCentinela.trim());
    }
    if (informe.adminSemiva && informe.adminSemiva.trim()) {
      const centinelaLabelIdx2 = xml.indexOf('ADMINISTRADOR DE CONTRATOS ');
      const semivaLabelIdx = xml.indexOf('ADMINISTRADOR DE CONTRATOS ', centinelaLabelIdx2 + 1);
      if (semivaLabelIdx !== -1) xml = reemplazarValorCeldaWord(xml, semivaLabelIdx, informe.adminSemiva.trim());
    }
  } catch (e) {
    console.error('No se pudieron reemplazar los administradores de contrato en el Word:', e);
  }

  const ots = (informe.otNums || [])
    .map((n) => allOts().find((o) => String(o.otNum) === String(n)))
    .filter(Boolean);

  // ---- "CUMPLIMIENTO MECÁNICO SOBRE ACTIVIDADES": encabezado (ya trae la
  // plantilla) → párrafo de introducción (ya trae la plantilla) → tabla
  // TAG/OT/DESCRIPCIÓN/% EJECUCIÓN + torta (esto sí se arma nuevo) → recién
  // ahí sigue la tabla de ÁREA/Administradores, que es lo próximo que ya
  // trae la plantilla. Se inserta justo antes de que esa tabla empiece. ----
  try {
    const cumplAnclaIdx = xml.indexOf(CUMPLIMIENTO_ANCLA);
    const cumplAncla2Idx = xml.indexOf(CUMPLIMIENTO_ANCLA, cumplAnclaIdx + 1);
    const cumplHeadingIdx = cumplAncla2Idx !== -1 ? cumplAncla2Idx : cumplAnclaIdx;
    const puntoInsercion = cumplHeadingIdx !== -1 ? xml.indexOf('<w:tbl>', cumplHeadingIdx) : -1;
    if (puntoInsercion !== -1 && ots.length) {
      const tIdxFinal = SEED_DATA.turnoLabels.length - 1;
      // Solo 3 estados posibles en esta tabla: 100% (completada), 0% (no
      // ejecutada) o EMERGENTE — nunca un % intermedio, aunque la actividad
      // tenga avance parcial cargado.
      const filas = ots.map((ot) => {
        if (ot.tipo === 'Emergente') {
          return { tag: '-', ot: '-', desc: tituloSinEquipo(ot.descripcion), pct: 'EMERGENTE', categoria: 'emergentes' };
        }
        const cancelada = getOtEstado(ot.otNum).startsWith('Cancelada');
        const completada = !cancelada && otProgressAt(ot, tIdxFinal) >= 1;
        return { tag: '-', ot: String(ot.otNum), desc: tituloSinEquipo(ot.descripcion), pct: completada ? '100%' : '0%', categoria: completada ? 'ejecutadas' : 'no_ejecutadas' };
      });

      const tablaXml = buildTablaCumplimientoWord(filas);

      const conteoPorCategoria = { ejecutadas: 0, no_ejecutadas: 0, emergentes: 0 };
      filas.forEach((f) => { conteoPorCategoria[f.categoria]++; });
      const datosGrafico = [
        { label: 'OPERACIONES EJECUTADAS', count: conteoPorCategoria.ejecutadas, color: '#4472C4' },
        { label: 'OPERACIONES NO EJECUTADAS', count: conteoPorCategoria.no_ejecutadas, color: '#ED7D31' },
        { label: 'OPERACIONES EMERGENTES', count: conteoPorCategoria.emergentes, color: '#A5A5A5' },
      ];

      const svgTorta = buildPieChartCumplimientoSvg(datosGrafico, 560, 320);
      const wrapTorta = document.createElement('div');
      wrapTorta.style.cssText = 'position:fixed; left:-10000px; top:0; width:560px; height:320px; background:#ffffff;';
      wrapTorta.innerHTML = svgTorta;
      document.body.appendChild(wrapTorta);
      const canvasTorta = await html2canvas(wrapTorta, { scale: 2, backgroundColor: '#ffffff' });
      wrapTorta.remove();
      const outBlobTorta = await new Promise((resolve) => canvasTorta.toBlob(resolve, 'image/png'));

      let bloqueXml = buildParrafoVacioWord() + tablaXml + buildParrafoVacioWord();
      if (outBlobTorta) {
        const bytesTorta = new Uint8Array(await outBlobTorta.arrayBuffer());
        const cxTorta = Math.round(14 * INFORME_EMU_POR_CM);
        const cyTorta = Math.round(cxTorta * (canvasTorta.height / canvasTorta.width));
        contadorImagen++;
        const nombreArchivoTorta = `cumplimiento_${Date.now()}.png`;
        const rIdTorta = `rId${nextRid++}`;
        zip.file(`word/media/${nombreArchivoTorta}`, bytesTorta);
        nuevasRelsXml += `<Relationship Id="${rIdTorta}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nombreArchivoTorta}"/>`;
        const drawingTortaXml = buildDrawingXmlWord(rIdTorta, cxTorta, cyTorta, 700000 + contadorImagen);
        bloqueXml += buildParrafoImagenCenteredWord(drawingTortaXml) + buildParrafoVacioWord();
      }

      xml = xml.slice(0, puntoInsercion) + bloqueXml + xml.slice(puntoInsercion);
    }
  } catch (e) {
    console.error('No se pudo agregar la tabla/gráfico de cumplimiento mecánico en el Word:', e);
  }

  // ---- Itinerario del servicio: una fila por turno de toda la parada. ----
  try {
    const itinAnclaIdx = xml.lastIndexOf(ITINERARIO_ANCLA);
    if (itinAnclaIdx !== -1) {
      const itinTblStart = xml.indexOf('<w:tbl>', itinAnclaIdx);
      const itinHeaderRowEndIdx = itinTblStart !== -1 ? xml.indexOf('</w:tr>', itinTblStart) + '</w:tr>'.length : -1;
      const itinTblEnd = xml.indexOf('</w:tbl>', itinTblStart);
      if (itinHeaderRowEndIdx !== -1 && itinTblEnd !== -1) {
        let filasItin = '';
        SEED_DATA.turnos.forEach((iso, i) => {
          const fechaTexto = fechaDDMMYYYY(iso.slice(0, 10));
          const turnoTipo = turnoTipoDe(i);
          const horaIngreso = formatoHoraTurnoWord(iso);
          const horaSalida = turnoTipo === 'A' ? '08:00 PM' : '08:00 AM';
          filasItin += buildFilaItinerarioWord(fechaTexto, turnoTipo, horaIngreso, horaSalida);
        });
        // El ejemplo real que trae la plantilla (turnos de OTRO informe) se
        // BORRA — solo queda el encabezado + los turnos reales de esta parada.
        const bookmarksHuerfanosItin = extraerBookmarkEndsHuerfanos(xml.slice(itinHeaderRowEndIdx, itinTblEnd));
        xml = xml.slice(0, itinHeaderRowEndIdx) + filasItin + bookmarksHuerfanosItin + xml.slice(itinTblEnd);
      }
    }
  } catch (e) {
    console.error('No se pudo agregar el itinerario del servicio en el Word:', e);
  }

  // ---- Actividades de preparativos: mismo formato que la tabla de
  // "ACTIVIDADES REALIZADAS EN PERIODO DE PARADA", pero con las viñetas y
  // fotos sueltas que se cargaron para preparativos (no vienen por turno/OT
  // como la bitácora, así que se arma como un solo bloque). ----
  try {
    const prepTextoRaw = (informe.preparativosTexto || []).filter((b) => b && b.trim());
    const prepFotos = informe.preparativosFotos || [];

    const prepAnclaIdx = xml.indexOf(PREPARATIVOS_TABLA_ANCLA);
    if (prepAnclaIdx === -1) throw new Error('No se encontró la sección de actividades de preparativos en la plantilla.');
    // El ejemplo real que trae la plantilla se BORRA siempre (haya o no
    // texto/fotos propios de este informe) — solo debe quedar lo que el
    // usuario realmente cargó.
    const prepHeaderRowEndIdx = xml.indexOf('</w:tr>', prepAnclaIdx) + '</w:tr>'.length;
    const prepTblEndIdx = xml.indexOf('</w:tbl>', prepAnclaIdx);
    if (prepTblEndIdx === -1) throw new Error('No se pudo ubicar el cierre de la tabla de actividades de preparativos.');

    let prepRowsXml = '';
    if (prepTextoRaw.length) {
      prepRowsXml += buildFilaFechaWord(fechaDDMMYYYY(new Date().toISOString().slice(0, 10)));
      prepRowsXml += buildFilaTurnoWord('PREPARATIVOS', [{ titulo: 'Actividades de preparativos', bullets: prepTextoRaw }], false);
    }
    const bookmarksHuerfanosPrep = extraerBookmarkEndsHuerfanos(xml.slice(prepHeaderRowEndIdx, prepTblEndIdx));
    xml = xml.slice(0, prepHeaderRowEndIdx) + prepRowsXml + bookmarksHuerfanosPrep + xml.slice(prepTblEndIdx);
    const prepBusquedaFotosDesde = prepHeaderRowEndIdx + prepRowsXml.length;

    // Límite superior: no puede pasarse a la sección de fotos de PARADA,
    // que usa el mismo título de sección más adelante en el documento.
    const limiteSuperior = xml.indexOf(INFORME_TABLA_ANCLA);
    const prepFotosAnclaIdx = xml.indexOf(REGISTRO_FOTOS_ANCLA, prepBusquedaFotosDesde);
    if (prepFotosAnclaIdx !== -1 && (limiteSuperior === -1 || prepFotosAnclaIdx < limiteSuperior)) {
      const primerImagenPrepIdx = xml.indexOf('IMAGEN ', prepFotosAnclaIdx);
      if (primerImagenPrepIdx !== -1 && (limiteSuperior === -1 || primerImagenPrepIdx < limiteSuperior)) {
        const fechaHoy = fechaDDMMYYYY(new Date().toISOString().slice(0, 10));
        const prepFotosEmbebidas = [];
        for (const foto of prepFotos) {
          const preparada = await prepararFotoParaWord(foto.url);
          if (!preparada) continue;
          contadorImagen++;
          const nombreArchivo = `prepFoto${Date.now()}_${contadorImagen}.jpeg`;
          const rId = `rId${nextRid++}`;
          zip.file(`word/media/${nombreArchivo}`, preparada.bytes);
          nuevasRelsXml += `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nombreArchivo}"/>`;
          prepFotosEmbebidas.push({
            fechaTexto: fechaHoy,
            drawingXml: buildDrawingXmlWord(rId, preparada.cx, preparada.cy, 850000 + contadorImagen),
            descripcion: foto.descripcion || '',
          });
        }
        // A diferencia de la sección de parada, acá cada tabla chica de par
        // va SUELTA en el cuerpo (sin fila/tabla que la envuelva) — el
        // primer par arranca en su propio <w:tbl>, sin nada que lo envuelva.
        const primeraTablaParInicio = xml.lastIndexOf('<w:tbl>', primerImagenPrepIdx);
        const ultimoImagenIdx = ultimoIndiceEnRango(xml, 'IMAGEN ', prepFotosAnclaIdx, limiteSuperior);
        const ultimaTablaParEndIdx = xml.indexOf('</w:tbl>', ultimoImagenIdx) + '</w:tbl>'.length;
        if (limiteSuperior !== -1 && ultimaTablaParEndIdx > limiteSuperior) throw new Error('El borrado de fotos de ejemplo de preparativos quedó fuera de su sección — se aborta para no dañar el documento.');
        const nuevoBloqueFotos = prepFotosEmbebidas.length ? buildBloqueRegistroFotosPreparativosWord(prepFotosEmbebidas) : '';
        const bookmarksHuerfanosPrepFotos = extraerBookmarkEndsHuerfanos(xml.slice(primeraTablaParInicio, ultimaTablaParEndIdx));
        xml = xml.slice(0, primeraTablaParInicio) + nuevoBloqueFotos + bookmarksHuerfanosPrepFotos + xml.slice(ultimaTablaParEndIdx);
      }
    }
  } catch (e) {
    console.error('No se pudieron incrustar las actividades de preparativos en el Word:', e);
  }

  // ---- Supervisor Mecánico de Centinela — Día/Noche: no se pide manual, se
  // calcula de los supervisores ya asignados por turno a las actividades de
  // este informe (los mismos que se usan para filtrar/agrupar en el resto de
  // la app). Las celdas vienen vacías en la plantilla (sin ningún <w:r>), así
  // que se les inserta el texto en vez de reemplazarlo. ----
  try {
    const supDia = calcularSupervisorInforme(ots, 'A');
    const supNoche = calcularSupervisorInforme(ots, 'B');
    if (supDia || supNoche) {
      const supAnclaIdx = xml.indexOf('R MECÁNICO DE ');
      if (supAnclaIdx !== -1) {
        // supAnclaIdx cae en medio de la celda de la etiqueta (es texto
        // dentro de ella), así que hay que ubicar el <w:tr> que la envuelve
        // para contar celdas desde el inicio real de la fila.
        // OJO: "<w:tr" (sin más) también matchea "<w:trPr>"/"<w:trHeight>" —
        // por eso siempre con el espacio después, para que sea inequívocamente
        // la apertura real de una fila (todas las filas de este documento
        // traen atributos, nunca "<w:tr>" a secas).
        const filaDiaInicio = xml.lastIndexOf('<w:tr ', supAnclaIdx);
        const filaDiaEndIdx = xml.indexOf('</w:tr>', supAnclaIdx);
        const valorDiaIdx = avanzarNCeldasWord(xml, filaDiaInicio, 3);
        const filaNocheInicio = xml.indexOf('<w:tr ', filaDiaEndIdx);
        const filaNocheEnd = xml.indexOf('</w:tr>', filaNocheInicio);
        const valorNocheIdx = avanzarNCeldasWord(xml, filaNocheInicio, 3);
        // Se inserta en orden inverso (noche primero) para no invalidar los
        // índices de día, ya calculados sobre el xml original.
        if (supNoche && valorNocheIdx !== -1 && valorNocheIdx < filaNocheEnd) {
          xml = insertarValorCeldaVaciaWord(xml, valorNocheIdx, supNoche);
        }
        if (supDia && valorDiaIdx !== -1 && valorDiaIdx < filaDiaEndIdx) {
          xml = insertarValorCeldaVaciaWord(xml, valorDiaIdx, supDia);
        }
      }
    }
  } catch (e) {
    console.error('No se pudo agregar el Supervisor Mecánico Día/Noche en el Word:', e);
  }

  const anclaIdx = xml.indexOf(INFORME_TABLA_ANCLA);
  if (anclaIdx === -1) throw new Error('No se encontró la sección "ACTIVIDADES REALIZADAS EN PERIODO DE PARADA" en la plantilla — puede que la hayan editado.');
  // El ejemplo real que trae la plantilla (fechas/turnos de OTRO informe)
  // se BORRA, no se deja debajo de lo nuevo — solo debe quedar la fila de
  // título (el ancla de arriba) y, después, las filas reales de este informe.
  const headerRowEndIdx = xml.indexOf('</w:tr>', anclaIdx) + '</w:tr>'.length;
  const tblEndIdx = xml.indexOf('</w:tbl>', anclaIdx);
  if (tblEndIdx === -1) throw new Error('No se pudo ubicar el cierre de la tabla de actividades.');

  const entradas = [];
  ots.forEach((ot) => {
    state.bitacora.filter((b) => String(b.otNum) === String(ot.otNum)).forEach((entry) => entradas.push({ ot, entry }));
  });
  entradas.sort((a, b) => (a.entry.turnoIdx ?? 0) - (b.entry.turnoIdx ?? 0) || (a.entry.createdAt || 0) - (b.entry.createdAt || 0));

  // ---- 1) Texto: arma las filas de la tabla "ACTIVIDADES REALIZADAS..." ----
  let rowsXml = '';
  let lastFecha = null, lastTurnoKey = null, buffer = [], bufferEsSegundoTurnoDelDia = false;
  const flush = () => {
    if (!buffer.length) return;
    rowsXml += buildFilaTurnoWord(buffer[0].turnoLabel, buffer, bufferEsSegundoTurnoDelDia);
    buffer = [];
  };
  entradas.forEach(({ ot, entry }) => {
    const fechaTexto = fechaDDMMYYYY(entry.fecha);
    const turnoKey = fechaTexto + '|' + (entry.turnoTipo || '');
    if (turnoKey !== lastTurnoKey) {
      flush();
      const esMismaFechaQueAnterior = fechaTexto && fechaTexto === lastFecha;
      if (fechaTexto && !esMismaFechaQueAnterior) { rowsXml += buildFilaFechaWord(fechaTexto); }
      lastFecha = fechaTexto;
      lastTurnoKey = turnoKey;
      bufferEsSegundoTurnoDelDia = esMismaFechaQueAnterior;
    }
    buffer.push({
      turnoLabel: entry.turnoTipo === 'Día' ? 'TURNO DÍA' : 'TURNO NOCHE',
      titulo: ot.manual ? ot.descripcion : `OT ${ot.otNum} — ${ot.descripcion}`,
      bullets: entry.bullets || [],
    });
  });
  flush();

  if (!rowsXml) throw new Error('Esta actividad todavía no tiene comentarios cargados — agrega al menos uno antes de generar el Word.');

  const bookmarksHuerfanosParada = extraerBookmarkEndsHuerfanos(xml.slice(headerRowEndIdx, tblEndIdx));
  xml = xml.slice(0, headerRowEndIdx) + rowsXml + bookmarksHuerfanosParada + xml.slice(tblEndIdx);
  // Punto a partir del cual buscar "REGISTRO FOTOGRÁFICO" — hay más de una
  // sección con ese mismo título en la plantilla (una antes, de preparativos);
  // la que corresponde a esto es la que viene DESPUÉS de las actividades de parada.
  const busquedaFotosDesde = headerRowEndIdx + rowsXml.length;

  // ---- 2) Fotos: se incrustan en la tabla "REGISTRO FOTOGRÁFICO" (2 columnas,
  // celdas de 9x7cm), NO mezcladas con los comentarios de arriba. ----
  const fotosEmbebidas = [];

  for (const { entry } of entradas) {
    if (!entry.fotos || !entry.fotos.length) continue;
    const fechaTexto = fechaDDMMYYYY(entry.fecha);
    for (const foto of entry.fotos) {
      const preparada = await prepararFotoParaWord(foto.url);
      if (!preparada) continue;
      contadorImagen++;
      const nombreArchivo = `autoFoto${Date.now()}_${contadorImagen}.jpeg`;
      const rId = `rId${nextRid++}`;
      zip.file(`word/media/${nombreArchivo}`, preparada.bytes);
      nuevasRelsXml += `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nombreArchivo}"/>`;
      fotosEmbebidas.push({
        fechaTexto,
        drawingXml: buildDrawingXmlWord(rId, preparada.cx, preparada.cy, 900000 + contadorImagen),
        descripcion: foto.descripcion || '',
      });
    }
  }

  {
    const fotosAnclaIdx = xml.indexOf(REGISTRO_FOTOS_ANCLA, busquedaFotosDesde);
    if (fotosAnclaIdx === -1) throw new Error('No se encontró la sección "REGISTRO FOTOGRÁFICO" (después de las actividades) en la plantilla — puede que la hayan editado.');

    // La estructura real (mapeada del documento): cada par de fotos vive en su
    // propia tabla chica, y esa tabla va dentro de una fila de una tabla más
    // grande que las contiene a todas. El ejemplo real que trae la plantilla
    // (fotos de OTRO informe) se BORRA entero — se ubica el PRIMER "IMAGEN "
    // de esta sección → la fila que lo envuelve (inicio) y el ÚLTIMO "IMAGEN "
    // → el cierre de SU tabla chica → el cierre de la fila que la envuelve
    // (fin), y se reemplaza todo ese tramo por los pares reales de este
    // informe (o por nada, si no hay fotos cargadas).
    const primerImagenIdx = xml.indexOf('IMAGEN ', fotosAnclaIdx);
    if (primerImagenIdx !== -1) {
      // "IMAGEN " cae en la fila del ENCABEZADO de la tabla chica del par
      // (no en la fila externa que la envuelve) — hay que subir un nivel
      // más: primero el <w:tbl> de esa tabla chica, y desde ahí recién el
      // <w:tr> externo real.
      const primeraTablaChicaInicio = xml.lastIndexOf('<w:tbl>', primerImagenIdx);
      // Con espacio después de "tr" para no matchear "<w:trPr>"/"<w:trHeight>".
      const primeraFilaInicio = xml.lastIndexOf('<w:tr ', primeraTablaChicaInicio);
      const ultimoImagenIdx = xml.lastIndexOf('IMAGEN ');
      const ultimaTablaParEndIdx = xml.indexOf('</w:tbl>', ultimoImagenIdx);
      if (ultimaTablaParEndIdx === -1) throw new Error('No se pudo ubicar el cierre de la última tabla de fotos existente.');
      const ultimaFilaExternaEndIdx = xml.indexOf('</w:tr>', ultimaTablaParEndIdx) + '</w:tr>'.length;

      const fotosRowsXml = fotosEmbebidas.length ? buildBloqueRegistroFotosWord(fotosEmbebidas) : '';
      const bookmarksHuerfanosParadaFotos = extraerBookmarkEndsHuerfanos(xml.slice(primeraFilaInicio, ultimaFilaExternaEndIdx));
      xml = xml.slice(0, primeraFilaInicio) + fotosRowsXml + bookmarksHuerfanosParadaFotos + xml.slice(ultimaFilaExternaEndIdx);
    }
  }

  // ---- Curva S: reemplaza el gráfico de ejemplo que trae la plantilla en
  // "CRONOGRAMA DE EJECUCIÓN DEL SERVICIO" por una imagen con los datos
  // reales actuales (mismo diseño que el botón "Imagen" de la Curva S: eje,
  // leyenda con línea punteada/continua real, y sus 3 KPI's). Es un gráfico
  // nativo de Word/Excel en la plantilla — no se edita esa parte (es delicada
  // y no es lo que se pidió), se reemplaza solo el dibujo por una imagen. Si
  // no se encuentra (la editaron o la sección no existe), se sigue sin esto
  // — nunca debe tumbar la generación del resto del informe. ----
  try {
    const cronogramaAnclaIdx = xml.indexOf('En base a la Carta Gantt de');
    if (cronogramaAnclaIdx !== -1) {
      const drawingStartIdx = xml.indexOf('<w:drawing', cronogramaAnclaIdx);
      if (drawingStartIdx !== -1 && drawingStartIdx - cronogramaAnclaIdx < 6000) {
        const drawingEndIdx = xml.indexOf('</w:drawing>', drawingStartIdx) + '</w:drawing>'.length;

        const { svg, leyenda, kpisHtml } = buildCurvaSVisual({ W: 620, H: 360 });
        const wrapCurva = document.createElement('div');
        wrapCurva.style.cssText = 'position:fixed; left:-10000px; top:0; width:900px; background:#ffffff; font-family:Arial,Helvetica,sans-serif; color:#1A1A2E; padding:16px 22px;';
        wrapCurva.innerHTML = `<div style="display:flex; align-items:flex-start; gap:20px;">
          <div style="flex:none;">${svg}</div>
          <div style="width:200px; flex:none; padding-top:8px;">
            ${leyenda}
            <div style="margin-top:14px; padding-top:12px; border-top:1px solid #E2E2DD;">${kpisHtml}</div>
          </div>
        </div>`;
        document.body.appendChild(wrapCurva);
        const canvasCurva = await html2canvas(wrapCurva, { scale: 2, backgroundColor: '#ffffff' });
        wrapCurva.remove();

        const outBlobCurva = await new Promise((resolve) => canvasCurva.toBlob(resolve, 'image/png'));
        if (outBlobCurva) {
          const bytesCurva = new Uint8Array(await outBlobCurva.arrayBuffer());
          // Mismo ancho aproximado que el gráfico nativo que reemplaza (~24cm),
          // para que siga cabiendo en una sola página junto al encabezado y el
          // párrafo de introducción de esta sección.
          const cxCurva = Math.round(24 * INFORME_EMU_POR_CM);
          const cyCurva = Math.round(cxCurva * (canvasCurva.height / canvasCurva.width));

          contadorImagen++;
          const nombreArchivoCurva = `curvaS_${Date.now()}.png`;
          const rIdCurva = `rId${nextRid++}`;
          zip.file(`word/media/${nombreArchivoCurva}`, bytesCurva);
          nuevasRelsXml += `<Relationship Id="${rIdCurva}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${nombreArchivoCurva}"/>`;
          const drawingCurvaXml = buildDrawingXmlWord(rIdCurva, cxCurva, cyCurva, 950000 + contadorImagen);
          xml = xml.slice(0, drawingStartIdx) + drawingCurvaXml + xml.slice(drawingEndIdx);
        }
      }
    }
  } catch (e) {
    console.error('No se pudo incrustar la Curva S en el Word:', e);
  }

  // ---- Conclusiones: una fila por cada actividad del informe (todas, sin
  // importar su estado — cancelada, emergente o completada), con evidencia
  // real (viñetas de bitácora) cuando existe. ----
  try {
    const introIdx = xml.indexOf(CONCLUSIONES_INTRO_ANCLA);
    if (introIdx !== -1) {
      const tblStart = xml.indexOf('<w:tbl>', introIdx);
      const headerRowEndConclusiones = tblStart !== -1 ? xml.indexOf('</w:tr>', tblStart) + '</w:tr>'.length : -1;
      const tblEndConclusiones = xml.indexOf('</w:tbl>', tblStart);
      if (headerRowEndConclusiones !== -1 && tblEndConclusiones !== -1) {
        const filasConclusiones = ots.map((ot) => buildFilaConclusionWord(ot)).join('');
        // El ejemplo real de la plantilla (conclusiones de OTRO informe) se
        // BORRA — solo quedan el encabezado + las actividades de este informe.
        const bookmarksHuerfanosConcl = extraerBookmarkEndsHuerfanos(xml.slice(headerRowEndConclusiones, tblEndConclusiones));
        xml = xml.slice(0, headerRowEndConclusiones) + filasConclusiones + bookmarksHuerfanosConcl + xml.slice(tblEndConclusiones);
      }
    }
  } catch (e) {
    console.error('No se pudieron agregar las conclusiones en el Word:', e);
  }

  // ---- Recomendaciones: opcional, solo las actividades que tengan texto
  // cargado en informe.recomendaciones[otNum]. El ejemplo de la plantilla se
  // borra siempre — si no hay ninguna recomendación cargada, la tabla queda
  // con el encabezado solo, sin filas. ----
  try {
    const recomendaciones = informe.recomendaciones || {};
    const otsConRecomendacion = ots.filter((ot) => (recomendaciones[ot.otNum] || '').trim());
    const introIdx = xml.indexOf(RECOMENDACIONES_INTRO_ANCLA);
    if (introIdx !== -1) {
      const tblStart = xml.indexOf('<w:tbl>', introIdx);
      const headerRowEndRecomendaciones = tblStart !== -1 ? xml.indexOf('</w:tr>', tblStart) + '</w:tr>'.length : -1;
      const tblEndRecomendaciones = xml.indexOf('</w:tbl>', tblStart);
      if (headerRowEndRecomendaciones !== -1 && tblEndRecomendaciones !== -1) {
        const filasRecomendaciones = otsConRecomendacion.map((ot) => buildFilaRecomendacionWord(ot, recomendaciones[ot.otNum].trim())).join('');
        const bookmarksHuerfanosRecom = extraerBookmarkEndsHuerfanos(xml.slice(headerRowEndRecomendaciones, tblEndRecomendaciones));
        xml = xml.slice(0, headerRowEndRecomendaciones) + filasRecomendaciones + bookmarksHuerfanosRecom + xml.slice(tblEndRecomendaciones);
      }
    }
  } catch (e) {
    console.error('No se pudieron agregar las recomendaciones en el Word:', e);
  }

  // Verificación antes de entregar el archivo: si el XML quedó mal formado
  // (una etiqueta sin cerrar, algo así), mejor fallar acá con un error claro
  // que entregar un .docx que Word no pueda abrir. Incluye los encabezados/
  // pie de página y el customXml, que también se tocan (título del informe).
  const partesAVerificar = ['word/header1.xml', 'word/header3.xml', 'word/header4.xml', 'word/footer1.xml', 'customXml/item1.xml'];
  for (const parte of partesAVerificar) {
    const archivo = zip.file(parte);
    if (!archivo) continue;
    const check = new DOMParser().parseFromString(archivo.asText(), 'application/xml');
    if (check.getElementsByTagName('parsererror').length) {
      throw new Error(`El XML de ${parte} quedó mal formado — no se generó el archivo para no entregar un Word roto.`);
    }
  }
  const parseCheck = new DOMParser().parseFromString(xml, 'application/xml');
  if (parseCheck.getElementsByTagName('parsererror').length) {
    throw new Error('El XML generado quedó mal formado — no se generó el archivo para no entregar un Word roto.');
  }

  zip.file('word/document.xml', xml);
  if (nuevasRelsXml) {
    relsXml = relsXml.replace('</Relationships>', nuevasRelsXml + '</Relationships>');
    zip.file(relsPath, relsXml);
    const ctPath = '[Content_Types].xml';
    let ctXml = zip.file(ctPath).asText();
    if (!/Extension="jpeg"/i.test(ctXml)) {
      ctXml = ctXml.replace('</Types>', '<Default Extension="jpeg" ContentType="image/jpeg"/></Types>');
      zip.file(ctPath, ctXml);
    }
  }
  const blob = zip.generate({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const nombreArchivo = `${(informe.nombre || 'informe').replace(/[/\\?%*:|"<>]/g, '-')}.docx`;
  return { blob, nombreArchivo };
}

function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nombreArchivo;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Mismo comportamiento de siempre: arma el Word y lo descarga directo.
async function generateInformeWordReal(informe) {
  const { blob, nombreArchivo } = await generateInformeWordBlob(informe);
  descargarBlob(blob, nombreArchivo);
}

// Arma el Word y lo muestra renderizado (texto/tablas/fotos) dentro de un
// modal, sin descargar nada — para revisar el contenido antes de bajarlo.
// El render no es 100% idéntico al de Word real (usa docx-preview, una
// librería que convierte el .docx a HTML), pero alcanza para revisar que
// los datos/fotos/tablas están donde corresponde.
async function abrirVistaPreviaWord(informe) {
  if (typeof window.docx === 'undefined' || !window.docx.renderAsync) {
    throw new Error('El visor de Word no cargó — revisa tu conexión.');
  }
  const backdrop = document.getElementById('previewWordBackdrop');
  const loading = document.getElementById('previewWordLoading');
  const contenedor = document.getElementById('previewWordContenedor');
  const btnDescargar = document.getElementById('previewWordDescargar');
  contenedor.innerHTML = '';
  btnDescargar.style.display = 'none';
  loading.style.display = 'block';
  backdrop.classList.add('open');

  try {
    const { blob, nombreArchivo } = await generateInformeWordBlob(informe);
    await window.docx.renderAsync(blob, contenedor, contenedor, { className: 'docx-preview', inWrapper: true });
    btnDescargar.style.display = '';
    btnDescargar.onclick = () => descargarBlob(blob, nombreArchivo);
  } finally {
    loading.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  safeInit(() => {
    const backdrop = document.getElementById('previewWordBackdrop');
    document.getElementById('previewWordCerrar').addEventListener('click', () => backdrop.classList.remove('open'));
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.classList.remove('open'); });
  }, 'preview-word-modal');
});

async function generateInformePdf(informe) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, marginX = 16;
  const C_DARK = [26, 26, 46], C_MUTED = [107, 107, 117], C_LINE = [220, 220, 216];
  const C_BRAND = (window.BRANDING && window.BRANDING.colorRGB) || [31, 160, 165];
  let cy = 20, pageNum = 1;

  function drawFooter() {
    doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
    doc.text('Generado automáticamente — ' + ((window.BRANDING && window.BRANDING.empresa) || 'DIMARZA'), marginX, pageH - 8);
    doc.text('Página ' + pageNum, pageW - marginX, pageH - 8, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  function newPage() { doc.addPage(); pageNum++; drawFooter(); cy = 18; }
  function ensureSpace(h) { if (cy + h > pageH - 16) newPage(); }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.setTextColor(...C_DARK);
  doc.text(informe.nombre || 'Informe', marginX, cy);
  cy += 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...C_MUTED);
  doc.text(`${SEED_DATA.paradaNombre} · Generado: ${new Date().toLocaleString('es-CL')}`, marginX, cy);
  doc.setTextColor(0, 0, 0);
  cy += 10;

  const ots = (informe.otNums || [])
    .map((n) => allOts().find((o) => String(o.otNum) === String(n)))
    .filter(Boolean);

  for (const ot of ots) {
    ensureSpace(14);
    doc.setFillColor(...C_BRAND);
    doc.rect(marginX, cy, pageW - marginX * 2, 7, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
    doc.text(ot.manual ? ot.descripcion : `OT ${ot.otNum} — ${ot.descripcion}`, marginX + 3, cy + 5);
    doc.setTextColor(0, 0, 0);
    cy += 11;

    const entries = state.bitacora
      .filter((b) => String(b.otNum) === String(ot.otNum))
      .sort((a, b) => (a.turnoIdx ?? 0) - (b.turnoIdx ?? 0) || (a.createdAt || 0) - (b.createdAt || 0));

    if (!entries.length) {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(...C_MUTED);
      doc.text('Sin comentarios registrados para esta actividad.', marginX + 2, cy + 4);
      doc.setTextColor(0, 0, 0);
      cy += 10;
      continue;
    }

    for (const entry of entries) {
      ensureSpace(12);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...C_BRAND);
      doc.text(`${entry.fecha ? fmtFechaCorta(entry.fecha) : ''} · Turno ${entry.turnoTipo || ''}`, marginX + 2, cy + 4);
      doc.setTextColor(0, 0, 0);
      cy += 6;

      if (entry.bullets && entry.bullets.length) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
        entry.bullets.forEach((b) => {
          const lines = doc.splitTextToSize('• ' + b, pageW - marginX * 2 - 4);
          ensureSpace(lines.length * 4.2 + 2);
          doc.text(lines, marginX + 4, cy + 3.5);
          cy += lines.length * 4.2 + 1;
        });
        cy += 2;
      }

      if (entry.fotos && entry.fotos.length) {
        const maxWmm = 90, maxHmm = 70, gap = 6;
        const colW = (pageW - marginX * 2 - gap) / 2;
        let colX = marginX, rowMaxH = 0, colIdx = 0;
        for (const foto of entry.fotos) {
          let dataUrl, props;
          try {
            dataUrl = await urlToDataURL(foto.url);
            props = doc.getImageProperties(dataUrl);
          } catch (e) { continue; } // si una foto no carga, se sigue con el resto sin romper el informe

          let w = Math.min(colW, maxWmm), h = w * (props.height / props.width);
          if (h > maxHmm) { h = maxHmm; w = h * (props.width / props.height); }

          if (colIdx === 2) { colIdx = 0; colX = marginX; cy += rowMaxH + 5; rowMaxH = 0; }
          ensureSpace(h + 10);

          doc.addImage(dataUrl, props.fileType || 'JPEG', colX, cy, w, h);
          if (foto.descripcion) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C_MUTED);
            doc.text(doc.splitTextToSize(foto.descripcion, w), colX, cy + h + 3.5);
            doc.setTextColor(0, 0, 0);
          }
          rowMaxH = Math.max(rowMaxH, h + 8);
          colX += colW + gap;
          colIdx++;
        }
        cy += rowMaxH + 4;
      }
      cy += 3;
    }
    cy += 4;
  }

  // Firmas — en blanco: se firman a mano o digital una vez revisado el informe.
  ensureSpace(30);
  cy += 8;
  doc.setDrawColor(...C_LINE);
  const firmas = ['ELABORADO', 'REVISADO', 'VALIDADO', 'ENCARGADO'];
  const gapFirma = 6, colWFirma = (pageW - marginX * 2 - gapFirma * (firmas.length - 1)) / firmas.length;
  firmas.forEach((f, i) => {
    const x = marginX + i * (colWFirma + gapFirma);
    doc.line(x, cy + 14, x + colWFirma, cy + 14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(...C_MUTED);
    doc.text(f, x, cy + 18);
    doc.setTextColor(0, 0, 0);
  });

  drawFooter();
  doc.save(`${(informe.nombre || 'informe').replace(/[/\\?%*:|"<>]/g, '-')}.pdf`);
}

function renderPetsBlock(otNum) {
  const block = document.getElementById('petsBlock');
  const list = document.getElementById('petsLinksList');
  const sinLink = document.getElementById('petsSinLink');
  if (!block) return;
  block.style.display = 'block';

  const enlaces = [];
  const raw = (typeof PETS_LINKS !== 'undefined') ? PETS_LINKS[otNum] : null;
  if (raw) enlaces.push({ nombre: 'PETS', url: petsDownloadUrl(raw) });
  state.petsDinamicos.filter((p) => (p.otNums || []).includes(String(otNum))).forEach((p) => {
    enlaces.push({ nombre: p.nombre, url: p.url });
  });

  if (!enlaces.length) {
    list.innerHTML = '';
    sinLink.style.display = 'block';
    return;
  }
  sinLink.style.display = 'none';
  list.innerHTML = enlaces.map((e) =>
    `<a href="${e.url}" target="_blank" rel="noopener" class="btn-pets">📄 ${e.nombre}</a>`
  ).join('');
}

function abrirModalPets() {
  document.getElementById('petsNombre').value = '';
  document.getElementById('petsArchivo').value = '';
  petsPendingOts = [];
  const wrap = document.getElementById('petsOtsList');
  const areas = [...new Set(allOts().map((o) => o.area))];
  wrap.innerHTML = areas.map((area) => `
    <div style="font-size:10.5px; font-weight:700; letter-spacing:.05em; text-transform:uppercase; color:var(--brand); margin:8px 0 4px;">${area}</div>
    ${allOts().filter((o) => o.area === area).map((ot) => `
      <label style="display:flex; align-items:flex-start; gap:8px; padding:6px 2px; border-bottom:1px solid var(--line); cursor:pointer;">
        <input type="checkbox" class="pets-ot-check" data-ot="${ot.otNum}" style="width:18px; height:18px; margin-top:1px; flex:none; accent-color:var(--brand);">
        <span style="font-size:12.5px; color:var(--ink); line-height:1.4;">${ot.manual ? ot.descripcion : `OT ${ot.otNum} — ${ot.descripcion}`}</span>
      </label>`).join('')}
  `).join('');
  wrap.querySelectorAll('.pets-ot-check').forEach((chk) => {
    chk.addEventListener('change', () => {
      const v = chk.dataset.ot;
      if (chk.checked) petsPendingOts.push(v);
      else petsPendingOts = petsPendingOts.filter((x) => x !== v);
    });
  });
  document.getElementById('petsBackdrop').classList.add('open');
}

async function guardarPetsAdmin() {
  const nombre = document.getElementById('petsNombre').value.trim();
  const file = document.getElementById('petsArchivo').files[0];
  if (!nombre) { showToast('Escribe el nombre del PETS'); return; }
  if (!file) { showToast('Elige el archivo PDF'); return; }
  if (!petsPendingOts.length) { showToast('Elige al menos una actividad'); return; }
  const btn = document.getElementById('petsSave');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const storage = firebase.storage();
    const path = `paradas/${PARADA_ID}/pets/${Date.now()}_${file.name}`;
    const ref = storage.ref(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    await petsCollection().add({ nombre, url, otNums: petsPendingOts, createdAt: Date.now() });
    showToast('PETS guardado ✓');
    document.getElementById('petsBackdrop').classList.remove('open');
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar el PETS — revisa tu conexión');
  }
  btn.disabled = false; btn.textContent = 'Guardar PETS';
}

function openSheetDirect(otNum) {
  const isManual = typeof otNum === 'string' && otNum.startsWith('M-');
  const key = isManual ? otNum : parseInt(otNum, 10);
  const ot = allOts().find((o) => o.otNum === key);
  const tIdx = turnoActualIdx();
  activarModoDetalleMovil();
  actualizarOtActualEnBoton(key);
  sheetCtx = { otNum: key, nombre: null, turnoIdx: tIdx, direct: true, manual: isManual };
  ocultarListaSubactividades();
  const volverBtnD = document.getElementById('btnVolverSubs');
  if (volverBtnD) volverBtnD.style.display = 'none';

  // Las emergentes no tienen una OT real — mostrar "OT M-xxxxxx" es un ID interno de Firestore
  // sin sentido para el usuario, así que en ese caso solo se muestra el nombre de la actividad.
  document.getElementById('sheetTitle').textContent = isManual ? ot.descripcion : `OT ${ot.otNum} — ${ot.descripcion}`;
  document.getElementById('sheetMeta').textContent = (ot.pesoPlanHH ? `${ot.pesoPlanHH.toFixed(1)} HH estimadas` : 'Actividad emergente') + (ot.cuadrilla ? ' · Cuadrilla ' + cuadrillaLabel(ot.cuadrilla) : '') + (getOtSupervisor(ot.otNum) ? ' · Sup: ' + getOtSupervisor(ot.otNum) : '');
  document.getElementById('sheetDelete').style.display = isManual ? 'block' : 'none';
  renderPetsBlock(key);
  renderEstadoOtBlock(key);

  const avanceMap = state.liveOtAvance[key];
  const cf = carryForward(avanceMap, tIdx) || 0;
  const raw = (avanceMap && avanceMap[tIdx] !== undefined) ? avanceMap[tIdx] : cf;
  const slider = document.getElementById('pctSlider');
  slider.value = Math.round(raw * 100);
  document.getElementById('pctDisplay').textContent = slider.value + '%';

  populateTurnoOverride(tIdx, avanceMap);
  resetComentarioForm();
  renderComentarioFeed(key);
  renderGanttActividad(key);
  poblarSupervisoresPanel(key);
  document.body.classList.remove('polines-abierto');
  const polinesPanel = document.getElementById('polinesSheetBackdrop');
  if (polinesPanel) polinesPanel.classList.remove('open');
  renderProtocoloPanel(null);
  document.getElementById('sheetBackdrop').classList.add('open');
  document.getElementById('sheetBackdrop').classList.add('tiene-seleccion');
}

// Refleja el estado (Vigente/Cancelada/En pausa) de la OT abierta en el detalle —
// mismo select y motivo que ya existía en la vista de lista, ahora también visible
// desde el detalle (Gantt), que es por donde entra la mayoría en celular.
function renderEstadoOtBlock(otNum) {
  const sel = document.getElementById('estadoOtSelect');
  const motivoRow = document.getElementById('motivoOtRow');
  const motivoTa = document.getElementById('motivoOtTextarea');
  if (!sel) return;
  const estado = getOtEstado(otNum);
  sel.value = [...sel.options].some((o) => o.value === estado) ? estado : 'Vigente';
  motivoTa.value = getOtMotivo(otNum);
  motivoRow.style.display = estado.startsWith('Cancelada') ? 'block' : 'none';
}

function populateTurnoOverride(selectedIdx, avanceMap) {
  const sel = document.getElementById('turnoOverride');
  sel.innerHTML = SEED_DATA.turnoLabels.map((lbl, i) => {
    const raw = avanceMap ? (avanceMap[i] !== undefined ? avanceMap[i] : avanceMap[String(i)]) : undefined;
    const tag = raw !== undefined ? ` — ${Math.round(raw * 100)}% cargado` : '';
    const now = i === turnoActualIdx() ? ' (ahora)' : '';
    return `<option value="${i}" ${i === selectedIdx ? 'selected' : ''}>${lbl}${now}${tag}</option>`;
  }).join('');
}

function closeSheet() { document.getElementById('sheetBackdrop').classList.remove('open'); document.getElementById('sheetBackdrop').classList.remove('tiene-seleccion'); sheetCtx = null; }
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1600);
}

// "11 Ago 20:00 (Noche)" -> {hora:"20:00", diaMes:"11/Ago"} — dos líneas
// horizontales cortas en vez de una sola rotada, más parecido a Excel y más
// legible en celular (nada de texto de costado).
function partirEtiquetaTurno(lbl) {
  const m = String(lbl).match(/^(\d+)\s+(\S+)\s+(\d{2}:\d{2})/);
  if (!m) return { hora: '', diaMes: lbl };
  return { hora: m[3], diaMes: `${m[1]}/${m[2]}` };
}

function renderChart() {
  const curveData = computeCurve();
  state.lastCurveData = curveData; // guardado para el export a imagen
  const { labels, percentPlan, percentReal, alcanceEmerg, percentRealTotal, kpis } = curveData;
  const svgWrap = document.getElementById('chartSvgWrap');
  const W = 640, H = 340, padL = 34, padR = 10, padT = 14, padB = 46;
  const n = labels.length;
  const x = (i) => padL + (i / (n - 1)) * (W - padL - padR);
  const yMax = 1.25;
  const y = (v) => padT + (1 - v / yMax) * (H - padT - padB);
  const vis = state.curveVisible || (state.curveVisible = { plan: true, real: true, alcance: true, total: true });

  const tituloEl = document.getElementById('chartTitulo');
  if (tituloEl) tituloEl.textContent = `Curva S - ${SEED_DATA.paradaNombre} (Planificado vs Real + Emergentes)`;

  function pathFor(arr) {
    let d = ''; let started = false;
    arr.forEach((v, i) => {
      if (v === null || v === undefined) { started = false; return; }
      d += (started ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1) + ' ';
      started = true;
    });
    return d.trim();
  }
  function dotsFor(arr, color) {
    return arr.map((v, i) => v === null || v === undefined ? '' :
      `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${color}"/>`).join('');
  }
  // Estilo "gráfico de Excel": fondo blanco, grilla gris clara, colores sobrios
  // (Plan azul oscuro, Real rojo, Alcance Emergentes celeste punteado, Total naranja).
  const EXCEL_PLAN = '#1F3E8C', EXCEL_REAL = '#D93B3B', EXCEL_ALCANCE = '#8FA7C4', EXCEL_TOTAL = '#E8862C';
  const gridY = [0, 0.25, 0.5, 0.75, 1, 1.25].map((v) => `
    <line x1="${padL}" x2="${W-padR}" y1="${y(v)}" y2="${y(v)}" stroke="#D9D9D9" stroke-width="1"/>
    <text x="${padL-6}" y="${y(v)+3}" font-size="9" fill="#595959" text-anchor="end" font-family="Calibri,Arial,sans-serif">${Math.round(v*100)}%</text>
  `).join('');
  const xAxisLabels = labels.map((lbl, i) => {
    const { hora, diaMes } = partirEtiquetaTurno(lbl);
    return `<text x="${x(i).toFixed(1)}" y="${H-padB+15}" font-size="8" fill="#595959" text-anchor="middle" font-family="Calibri,Arial,sans-serif">${hora}<tspan x="${x(i).toFixed(1)}" dy="10">${diaMes}</tspan></text>`;
  }).join('');
  const xAxisTicks = labels.map((lbl, i) =>
    `<line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${H-padB}" y2="${H-padB+4}" stroke="#BFBFBF" stroke-width="1"/>`
  ).join('');

  svgWrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" style="width:100%; height:auto; display:block; background:#FFFFFF; border-radius:8px;">
      <rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>
      ${gridY}
      <line x1="${padL}" x2="${W-padR}" y1="${H-padB}" y2="${H-padB}" stroke="#BFBFBF" stroke-width="1"/>
      ${xAxisTicks}
      ${xAxisLabels}
      ${vis.alcance ? `<path d="${pathFor(alcanceEmerg)}" fill="none" stroke="${EXCEL_ALCANCE}" stroke-width="1.75" stroke-dasharray="5,4"/>` : ''}
      ${vis.plan ? `<path d="${pathFor(percentPlan)}" fill="none" stroke="${EXCEL_PLAN}" stroke-width="2.25"/>` : ''}
      ${vis.real ? `<path d="${pathFor(percentReal)}" fill="none" stroke="${EXCEL_REAL}" stroke-width="2.25"/>` : ''}
      ${vis.total ? `<path d="${pathFor(percentRealTotal)}" fill="none" stroke="${EXCEL_TOTAL}" stroke-width="2.25"/>` : ''}
      ${vis.alcance ? dotsFor(alcanceEmerg, EXCEL_ALCANCE) : ''}
      ${vis.plan ? dotsFor(percentPlan, EXCEL_PLAN) : ''}
      ${vis.real ? dotsFor(percentReal, EXCEL_REAL) : ''}
      ${vis.total ? dotsFor(percentRealTotal, EXCEL_TOTAL) : ''}
    </svg>`;

  // Leyenda clicable: activa/desactiva cada curva
  document.querySelectorAll('.legend [data-curve]').forEach((el) => {
    const key = el.dataset.curve;
    el.classList.toggle('legend-off', !vis[key]);
    el.onclick = () => { vis[key] = !vis[key]; renderChart(); };
  });

  document.getElementById('kpiCrecimiento').textContent = (kpis.pctCrecimiento*100).toFixed(1) + '%';
  const nTotalOts = kpis.nTotalVigentes + kpis.nCanceladas;
  const pctCanceladoConteo = nTotalOts ? kpis.nCanceladas / nTotalOts : 0;
  document.getElementById('kpiCancelado').textContent = `${kpis.nCanceladas} / ${nTotalOts} (${(pctCanceladoConteo*100).toFixed(0)}%)`;
  document.getElementById('kpiCompletadas').textContent = `${kpis.nCompletadas} / ${kpis.nTotalVigentes} (${(kpis.pctCompletadas*100).toFixed(0)}%)`;
  document.getElementById('kpiNoIniciadas').textContent = `${kpis.nNoIniciadas} / ${kpis.nTotalVigentes} (${(kpis.pctNoIniciadas*100).toFixed(0)}%)`;
  document.getElementById('kpiEnCurso').textContent = `${kpis.nEnCurso} / ${kpis.nTotalVigentes} (${(kpis.pctEnCurso*100).toFixed(0)}%)`;
  const netoEl = document.getElementById('kpiNeto');
  netoEl.textContent = (kpis.netoPct >= 0 ? '+' : '') + (kpis.netoPct*100).toFixed(1) + '%';
  netoEl.className = 'value ' + (kpis.netoPct > 0 ? 'neg' : (kpis.netoPct < 0 ? 'pos' : ''));
  document.getElementById('kpiEmergHH').textContent = `${kpis.nEmergentes} actividad(es) · ${kpis.hhEmergentes.toFixed(1)} HH`;
  document.getElementById('kpiCancelHH').textContent = `${kpis.nCanceladas} OT(s) · ${kpis.hhCanceladas.toFixed(1)} HH no ejecutadas`;

  const idxs = percentReal.map((v,i)=>v!==null?i:-1).filter(i=>i>=0);
  const lastIdx = idxs.length ? idxs[idxs.length-1] : undefined;
  const curTxt = document.getElementById('kpiActual');
  curTxt.textContent = lastIdx !== undefined
    ? `Plan ${fmtPct(percentPlan[lastIdx])} · Real ${fmtPct(percentReal[lastIdx])} · Total ${fmtPct(percentRealTotal[lastIdx])} (${labels[lastIdx]})`
    : 'Aún no hay avance reportado';
}

// Construye el gráfico SVG + leyenda + KPI's de la Curva S — compartido entre
// la imagen descargable y el que se incrusta en el Word, para que ambos se
// vean exactamente igual. La leyenda usa un tramo de línea (punteada o
// continua, según cómo se vea REALMENTE esa curva) con su punto al centro,
// en vez de un simple círculo de color — así no engaña sobre cuál línea es
// cuál. Los 3 KPI's son los más relevantes junto a una Curva S: el índice de
// cumplimiento de programa (equivalente al SPI de control de proyectos),
// cuánto creció el alcance por emergentes, y cuánto se canceló.
function buildCurvaSVisual({ W = 600, H = 380 } = {}) {
  const curveData = state.lastCurveData || computeCurve();
  const { labels, percentPlan, percentReal, alcanceEmerg, percentRealTotal, kpis } = curveData;

  const padL = 48, padR = 16, padT = 20, padB = 52;
  const n = labels.length;
  const x = (i) => padL + (i / (n - 1)) * (W - padL - padR);
  const yMax = 1.25;
  const y = (v) => padT + (1 - v / yMax) * (H - padT - padB);
  const EXCEL_PLAN = '#1F3E8C', EXCEL_REAL = '#D93B3B', EXCEL_ALCANCE = '#8FA7C4', EXCEL_TOTAL = '#E8862C';

  function pathFor(arr) {
    let d = ''; let started = false;
    arr.forEach((v, i) => {
      if (v === null || v === undefined) { started = false; return; }
      d += (started ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(v).toFixed(1) + ' ';
      started = true;
    });
    return d.trim();
  }
  function dotsFor(arr, color) {
    return arr.map((v, i) => v === null || v === undefined ? '' :
      `<circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.5" fill="${color}"/>`).join('');
  }
  const gridY = [0, 0.25, 0.5, 0.75, 1, 1.25].map((v) => `
    <line x1="${padL}" x2="${W-padR}" y1="${y(v)}" y2="${y(v)}" stroke="#D9D9D9" stroke-width="1"/>
    <text x="${padL-8}" y="${y(v)+4}" font-size="11" fill="#595959" text-anchor="end" font-family="Calibri,Arial,sans-serif">${Math.round(v*100)}%</text>
  `).join('');
  const xAxisLabels = labels.map((lbl, i) => {
    const { hora, diaMes } = partirEtiquetaTurno(lbl);
    return `<text x="${x(i).toFixed(1)}" y="${H-padB+20}" font-size="10.5" fill="#595959" text-anchor="middle" font-family="Calibri,Arial,sans-serif">${hora}<tspan x="${x(i).toFixed(1)}" dy="14">${diaMes}</tspan></text>`;
  }).join('');
  const xAxisTicks = labels.map((lbl, i) =>
    `<line x1="${x(i).toFixed(1)}" x2="${x(i).toFixed(1)}" y1="${H-padB}" y2="${H-padB+4}" stroke="#BFBFBF" stroke-width="1"/>`
  ).join('');
  const yMid = (padT + H - padB) / 2;

  const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#FFFFFF"/>
    ${gridY}
    <line x1="${padL}" x2="${W-padR}" y1="${H-padB}" y2="${H-padB}" stroke="#BFBFBF" stroke-width="1"/>
    ${xAxisTicks}
    ${xAxisLabels}
    <text x="${(padL+W-padR)/2}" y="${H-8}" font-size="12.5" font-weight="700" fill="#3A3A3A" text-anchor="middle" font-family="Calibri,Arial,sans-serif">Turno</text>
    <text x="15" y="${yMid}" font-size="12.5" font-weight="700" fill="#3A3A3A" text-anchor="middle" font-family="Calibri,Arial,sans-serif" transform="rotate(-90 15 ${yMid})">% Avance</text>
    <path d="${pathFor(alcanceEmerg)}" fill="none" stroke="${EXCEL_ALCANCE}" stroke-width="2" stroke-dasharray="6,4"/>
    <path d="${pathFor(percentPlan)}" fill="none" stroke="${EXCEL_PLAN}" stroke-width="2.5"/>
    <path d="${pathFor(percentReal)}" fill="none" stroke="${EXCEL_REAL}" stroke-width="2.5"/>
    <path d="${pathFor(percentRealTotal)}" fill="none" stroke="${EXCEL_TOTAL}" stroke-width="2.5"/>
    ${dotsFor(alcanceEmerg, EXCEL_ALCANCE)}
    ${dotsFor(percentPlan, EXCEL_PLAN)}
    ${dotsFor(percentReal, EXCEL_REAL)}
    ${dotsFor(percentRealTotal, EXCEL_TOTAL)}
  </svg>`;

  // Muestra de leyenda: un tramo de línea igual al de la curva real (punteada
  // o continua) con su punto al centro — no solo un círculo de color suelto.
  function muestraLinea(color, punteada) {
    return `<svg width="30" height="14" viewBox="0 0 30 14" style="flex:none;">
      <line x1="1" y1="7" x2="29" y2="7" stroke="${color}" stroke-width="2.5" ${punteada ? 'stroke-dasharray="5,3.5"' : ''}/>
      <circle cx="15" cy="7" r="3" fill="${color}"/>
    </svg>`;
  }
  const leyenda = [
    [EXCEL_PLAN, '% Avance Planificado', false],
    [EXCEL_REAL, '% Avance Real', false],
    [EXCEL_ALCANCE, 'Alcance Emergentes', true],
    [EXCEL_TOTAL, 'Real Total (+ Emergentes)', false],
  ].map(([color, label, punteada]) => `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
      ${muestraLinea(color, punteada)}
      <span style="font-size:12px; color:#3A3A3A;">${escBit(label)}</span>
    </div>`).join('');

  // Índice de cumplimiento de programa (equivalente al SPI = Real / Plan del
  // control de proyectos) — el indicador más estándar para saber, de un
  // vistazo, si la parada va adelantada o atrasada respecto al plan.
  const idxsConDato = percentReal.map((v, i) => (v !== null && v !== undefined ? i : -1)).filter((i) => i >= 0);
  const lastIdx = idxsConDato.length ? idxsConDato[idxsConDato.length - 1] : undefined;
  const realActual = lastIdx !== undefined ? percentReal[lastIdx] : null;
  const planActual = lastIdx !== undefined ? percentPlan[lastIdx] : null;
  const indiceCumplimiento = (realActual !== null && planActual > 0) ? realActual / planActual : null;
  const nTotalOts = kpis.nTotalVigentes + kpis.nCanceladas;
  const pctCanceladoConteo = nTotalOts ? kpis.nCanceladas / nTotalOts : 0;

  const kpisHtml = [
    ['Índice de Cumplimiento', indiceCumplimiento !== null ? `${(indiceCumplimiento * 100).toFixed(0)}%` : '—'],
    ['Crecim. Alcance', `${(kpis.pctCrecimiento * 100).toFixed(1)}%`],
    ['Cancelado', `${kpis.nCanceladas} / ${nTotalOts} (${(pctCanceladoConteo * 100).toFixed(0)}%)`],
  ].map(([label, value]) => `
    <div style="background:#F4F4F2; border:1px solid #E2E2DD; border-radius:8px; padding:9px 11px; margin-bottom:8px;">
      <div style="font-size:9px; color:#8A8A90; text-transform:uppercase; letter-spacing:.03em;">${escBit(label)}</div>
      <div style="font-size:16px; font-weight:800; color:#1A1A2E; margin-top:2px;">${escBit(value)}</div>
    </div>`).join('');

  return { svg, leyenda, kpisHtml };
}

// Genera UNA imagen (PNG, no PDF) con la Curva S estilo Excel + sus KPI's —
// para compartir directo, no para imprimir.
async function generateCurvaSImagen() {
  const { svg, leyenda, kpisHtml } = buildCurvaSVisual({ W: 600, H: 380 });

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed; left:-10000px; top:0; width:860px; background:#ffffff; font-family:Arial,Helvetica,sans-serif; color:#1A1A2E; padding:30px 34px;';
  wrap.innerHTML = `
    <h2 style="text-align:center; font-size:19px; font-weight:800; margin:0 0 20px; line-height:1.35;">Curva S - ${escBit(SEED_DATA.paradaNombre)} (Planificado vs Real + Emergentes)</h2>
    <div style="display:flex; align-items:flex-start; gap:22px;">
      <div style="flex:none;">${svg}</div>
      <div style="width:200px; flex:none; padding-top:20px;">
        ${leyenda}
        <div style="margin-top:16px; padding-top:14px; border-top:1px solid #E2E2DD;">${kpisHtml}</div>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);

  try {
    const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: '#ffffff' });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No se pudo generar la imagen');
    const nombreArchivo = `curva-s-${new Date().toISOString().slice(0, 10)}.png`;
    const file = new File([blob], nombreArchivo, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Curva S' });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombreArchivo;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } finally {
    wrap.remove();
  }
}

function renderAll() { renderList(); renderChart(); renderGanttChart(); }

function initTabs() {
  document.querySelectorAll('nav.tabs button').forEach((btn) => {
    btn.addEventListener('click', () => irAVista(btn.dataset.view));
  });
}


// ============================================================
// v3: Línea de tiempo tipo Gantt (overview + drill-down)
// ============================================================
state.ganttSelectedOt = null;

function paradaRange() {
  const start = new Date(SEED_DATA.turnos[0]);
  const end = new Date(SEED_DATA.turnos[SEED_DATA.turnos.length - 1]);
  return { start, end };
}

function xPct(date, range) {
  const t = new Date(date).getTime();
  const p = (t - range.start.getTime()) / (range.end.getTime() - range.start.getTime());
  return Math.max(0, Math.min(1, p)) * 100;
}

function expectedPctNow(ot, now) {
  const s = new Date(ot.inicio).getTime(), e = new Date(ot.fin).getTime();
  if (now.getTime() <= s) return 0;
  if (now.getTime() >= e) return 1;
  return (now.getTime() - s) / (e - s);
}

function renderGanttAxis(range) {
  const days = [];
  let cur = new Date(range.start);
  cur.setHours(0, 0, 0, 0);
  if (cur < range.start) cur.setDate(cur.getDate());
  const meses = {0:'ene',1:'feb',2:'mar',3:'abr',4:'may',5:'jun',6:'jul',7:'ago',8:'sep',9:'oct',10:'nov',11:'dic'};
  while (cur <= range.end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  const dayRow = `<div class="gantt-axis">${days.map((d) => {
    const pct = xPct(d, range);
    return `<span style="left:${pct}%">${d.getDate()}-${meses[d.getMonth()]}</span>`;
  }).join('')}</div>`;

  // Líneas rojas SOLO en el eje de fechas (para separar "12-ago" de "13-ago" etc.),
  // no en toda la lista de abajo — se dibujan en su propia franja fina sobre el eje.
  const dateLines = days
    .filter((d) => d.getTime() !== days[0].getTime())
    .map((d) => `<span class="gantt-date-line" style="left:${xPct(d, range)}%;"></span>`)
    .join('');
  const dateLineRow = `<div class="gantt-date-lines">${dateLines}</div>`;

  // Fila de turnos A (día) / B (noche) — va también en el header fijo
  const boundaries = SEED_DATA.turnos.map((t) => new Date(t));
  const turnoSpans = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const s = boundaries[i], e = boundaries[i+1];
    if (e < range.start || s > range.end) continue;
    const x0 = xPct(s, range), x1 = xPct(e, range);
    if (x1 - x0 < 2) continue;
    const isDay = s.getHours() === 8;
    turnoSpans.push(`<span style="left:${x0}%; width:${x1-x0}%;" class="${isDay ? 'day' : 'night'}">${isDay ? 'A' : 'B'}</span>`);
  }
  const turnoRow = `<div class="gantt-turno-row">${turnoSpans.join('')}</div>`;

  return `<div class="gantt-axis-lines-wrap">${dayRow}${turnoRow}${dateLineRow}</div>`;
}

function fmtDateHour(iso) {
  const d = new Date(iso);
  const meses = {0:'ene',1:'feb',2:'mar',3:'abr',4:'may',5:'jun',6:'jul',7:'ago',8:'sep',9:'oct',10:'nov',11:'dic'};
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${hh}:${mm} ${d.getDate()}-${meses[d.getMonth()]}`;
}

// Sombreado alterno de fondo (día/noche) + líneas verticales — va en el cuerpo con scroll
function renderTurnoGrid(range) {
  const allTurnos = SEED_DATA.turnos.map((t) => new Date(t)).filter((t) => t >= range.start && t <= range.end);
  const bands = [];
  const lines = [];
  const boundaries = SEED_DATA.turnos.map((t) => new Date(t));
  for (let i = 0; i < boundaries.length - 1; i++) {
    const s = boundaries[i], e = boundaries[i+1];
    if (e < range.start || s > range.end) continue;
    const x0 = xPct(s, range), x1 = xPct(e, range);
    const isDay = s.getHours() === 8;
    bands.push(`<div class="turno-band" style="left:${x0}%; width:${Math.max(x1-x0,0)}%; background:${isDay ? 'rgba(47,123,246,.03)' : 'rgba(0,0,0,.03)'};"></div>`);
  }
  allTurnos.forEach((t) => {
    lines.push(`<div class="turno-gridline" style="left:${xPct(t,range)}%;"></div>`);
  });

  return `<div class="turno-grid-overlay">${bands.join('')}${lines.join('')}</div>`;
}

function renderGanttOverview() {
  const range = paradaRange();
  const now = new Date();
  const nowPct = xPct(now, range);
  const showNow = now >= range.start && now <= range.end;

  document.getElementById('ganttTitle').textContent = 'Línea de tiempo — Work Pack';
  document.getElementById('ganttBack').style.display = 'none';

  const otsFiltradasGantt = otsVisibles();
  const areas = [...new Set(otsFiltradasGantt.map((o) => o.area))];
  let rows = areas.map((area) => {
    const rowsHtml = otsFiltradasGantt.filter((o) => o.area === area).map((ot) => {
      const estado = getOtEstado(ot.otNum);
      if (estado.startsWith('Cancelada')) return '';
      if (!ot.subactividades || ot.subactividades.length === 0) return ''; // emergentes simples sin cronograma no van en la línea de tiempo

      const x0 = xPct(ot.inicio, range), x1 = xPct(ot.fin, range);
      const real = otProgressAt(ot, SEED_DATA.turnoLabels.length - 1);
      const expected = expectedPctNow(ot, now);
      const dentroVentana = showNow && now >= new Date(ot.inicio) && now <= new Date(ot.fin);
      const behind = showNow && now > new Date(ot.inicio) && real < expected - 0.1 && real < 0.999;
      const avanzandoReal = real > 0 && real < 0.999;
      const dimColor = ot.tipo === 'Emergente' ? 'var(--emergente)' : (behind ? 'var(--cancelada)' : 'var(--atiempo)');

      const comps = (SEED_DATA.complementarias || []).filter((c) => c.otRelacionada === ot.otNum && c.tag !== 'INST')
        .map((c) => ({ inicio: c.inicio, fin: c.fin, color: TERCEROS_COLOR }));
      const dimSeg = { inicio: ot.inicio, fin: ot.fin, color: dimColor };
      const allSegs = [...comps, dimSeg].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

      const rowClasses = ['gantt-row-full'];
      if (dentroVentana) rowClasses.push('gantt-row-programada'); // deberia estar avanzando segun el Gantt
      if (avanzandoReal) rowClasses.push('gantt-row-avanzando');  // tiene avance real cargado ahora mismo
      const badges = [
        dentroVentana ? '<span class="gantt-badge gantt-badge-programada">🕐 Debería avanzar ahora</span>' : '',
        avanzandoReal ? '<span class="gantt-badge gantt-badge-real">● Avanzando en tiempo real</span>' : '',
      ].filter(Boolean).join('');

      return `
        <div class="${rowClasses.join(' ')}" data-ot="${ot.otNum}">
          <div class="gantt-row-name">OT ${ot.otNum} — ${ot.descripcion}</div>
          <div class="gantt-row-dates">${fmtDateHour(ot.inicio)} → ${fmtDateHour(ot.fin)}${renderSupervisoresParOt(ot.otNum)}</div>
          ${badges ? `<div class="gantt-badges">${badges}</div>` : ''}
          <div class="gantt-track">
            <div class="gantt-bar-plan" style="left:${x0}%; width:${Math.max(x1-x0,0.5)}%;"></div>
            ${allSegs.map((s) => `<div class="gantt-bar-real" style="left:${xPct(s.inicio,range)}%; width:${Math.max(xPct(s.fin,range)-xPct(s.inicio,range),0.6)}%; background:${s.color};"></div>`).join('')}
            ${showNow ? `<div class="gantt-now-line" style="left:${nowPct}%;"></div>` : ''}
          </div>
        </div>`;
    }).join('');
    if (!rowsHtml.trim()) return '';
    return `<div class="gantt-area-header">${area}</div>${rowsHtml}`;
  }).join('');

  const wrap = document.getElementById('ganttWrap');
  // Eje de días va al header sticky (así siempre visible)
  const axisEl = document.getElementById('ganttAxisSticky');
  if (axisEl) axisEl.innerHTML = renderGanttAxis(range);
  wrap.innerHTML = `<div class="gantt-scroll"><div class="gantt-rows-area">${renderTurnoGrid(range)}<div class="gantt-rows-wrap">${rows}</div></div></div>`;
  wrap.querySelectorAll('.gantt-row-full').forEach((el) => {
    el.addEventListener('click', () => {
      const raw = el.dataset.ot;
      const otNum = raw.startsWith('M-') ? raw : parseInt(raw, 10);
      const ot = allOts().find((o) => String(o.otNum) === String(otNum));
      if (ot && esCampaniaPolines(ot)) {
        openPolinesSheet(otNum);
        return;
      }
      if (ot) {
        state.otSeleccionada = otNum;
        abrirDetalleOt(otNum);
        renderList();
        return;
      }
      state.ganttSelectedOt = otNum;
      renderGanttChart();
    });
  });
}

function renderGanttDetail(otNum) {
  const ot = allOts().find((o) => o.otNum === otNum);
  const range = { start: new Date(ot.inicio), end: new Date(ot.fin) };
  const span = range.end.getTime() - range.start.getTime();
  range.start = new Date(range.start.getTime() - Math.max(span * 0.05, 3600000));
  range.end = new Date(range.end.getTime() + Math.max(span * 0.05, 3600000));

  const now = new Date();
  const showNow = now >= range.start && now <= range.end;
  const nowPct = xPct(now, range);

  document.getElementById('ganttTitle').textContent = `OT ${ot.otNum} — ${ot.descripcion}`;
  document.getElementById('ganttBack').style.display = 'inline-flex';

  const comps = (SEED_DATA.complementarias || []).filter((c) => c.otRelacionada === otNum && c.tag !== 'INST')
    .map((c) => ({ inicio: c.inicio, fin: c.fin, color: TERCEROS_COLOR, label: c.nombre, tag: c.tag }));

  const subs = (ot.subactividades || []).map((s) => {
    const live = getSubLive(otNum, s.nombre);
    const cf = carryForward(live.avance, SEED_DATA.turnoLabels.length - 1) || 0;
    const expected = expectedPctNow({ inicio: s.inicio, fin: s.fin }, now);
    const behind = now > new Date(s.inicio) && cf < expected - 0.15 && cf < 0.999;
    const done = cf >= 0.999;
    const color = done ? 'var(--brand)' : (behind ? 'var(--cancelada)' : 'var(--atiempo)');
    return { inicio: s.inicio, fin: s.fin, color, label: s.nombre, sub: s.nombre };
  });

  const allSegs = [...comps, ...subs].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

  const wrap = document.getElementById('ganttWrap');
  const axisEl = document.getElementById('ganttAxisSticky');
  if (axisEl) axisEl.innerHTML = renderGanttAxis(range);

  // Subactividades + terceros intercalados cronológicamente para el acordeón
  const allItems = [
    ...comps.map((c) => ({ ...c, type: 'comp' })),
    ...subs.map((s) => ({ ...s, type: 'sub' })),
  ].sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

  const tagLabel = { AND: 'Andamios', ASEO: 'Aseo', INST: 'Instrumentación' };

  wrap.innerHTML = `
    <div class="gantt-detail-header">
      <div class="meta">${ot.pesoPlanHH ? ot.pesoPlanHH.toFixed(1) + ' HH SEMIVA · ' : ''}${comps.length ? comps.length + ' de terceros' : 'sin actividades de terceros'}</div>
    </div>
    <div class="gantt-scroll">
      <div class="gantt-rows-area">
        ${renderTurnoGrid(range)}
        <div class="gantt-row" style="height:26px;">
          <div class="gantt-row-label"></div>
          <div class="gantt-track" style="height:20px;">
          ${allSegs.map((s) => {
            const x0 = xPct(s.inicio, range), x1 = xPct(s.fin, range);
            const clickable = s.sub ? `data-sub="${encodeURIComponent(s.sub)}"` : '';
            return `<div class="gantt-bar-real gantt-seg-click" ${clickable} title="${s.label}" style="left:${x0}%; width:${Math.max(x1-x0,0.6)}%; background:${s.color}; cursor:${s.sub ? 'pointer' : 'default'};"></div>`;
          }).join('')}
          ${showNow ? `<div class="gantt-now-line" style="left:${nowPct}%;"></div>` : ''}
        </div>
      </div>
    </div>
    </div>

    <div class="gantt-sub-accordion">
      ${allItems.map((item) => {
        if (item.type === 'comp') {
          return `<div class="gantt-detail-item comp">
            <i style="background:${item.color}"></i>
            <div class="gdi-info">
              <div class="gdi-name">${item.label}</div>
              <div class="gdi-meta">${tagLabel[item.tag] || 'Terceros'} · no cuenta en tu avance</div>
            </div>
          </div>`;
        } else {
          const live = getSubLive(otNum, item.sub);
          const cf = carryForward(live.avance, SEED_DATA.turnoLabels.length - 1) || 0;
          const done = cf >= 0.999;
          return `<div class="gantt-detail-item sub" data-sub="${encodeURIComponent(item.sub)}">
            <div class="sub-check ${done ? 'done' : ''}">${done ? '✓' : ''}</div>
            <div class="gdi-info">
              <div class="gdi-name">${item.label}</div>
              <div class="gdi-meta">${item.fin ? fmtDateHour(item.inicio) + ' → ' + fmtDateHour(item.fin) : ''}</div>
            </div>
            <div class="gdi-pct">${Math.round(cf * 100)}%</div>
          </div>`;
        }
      }).join('')}
    </div>`;
  wrap.querySelectorAll('[data-sub]').forEach((el) => {
    el.addEventListener('click', () => openSheet(otNum, decodeURIComponent(el.dataset.sub)));
  });
}

function renderGanttChart() {
  if (state.ganttSelectedOt) renderGanttDetail(state.ganttSelectedOt);
  else renderGanttOverview();
}


// ============================================================
// v4: Modal para agregar emergente simple (sin subactividades)
// ============================================================

// ============================================================
// v7: Exportar resumen de Curva S a PDF
// ============================================================
async function generatePdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const data = state.lastCurveData || computeCurve();
  const { labels, percentPlan, percentReal, alcanceEmerg, percentRealTotal, kpis } = data;

  const pageW = 210, pageH = 297, marginX = 16;
  let cy = 0;
  let pageNum = 1;

  const C_DARK = [27, 36, 48], C_MUTED = [107, 118, 133], C_LINE = [227, 230, 235];
  const brandRGB = (window.BRANDING && window.BRANDING.colorRGB) || [76, 147, 255];
  const C_BG = [250, 251, 252], C_BLUE = brandRGB, C_RED = [240, 64, 62], C_ORANGE = [255, 159, 69];

  async function cargarLogo(url) {
    if (!url) return null;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) { return null; }
  }
  const logoClienteUrl = (window.BRANDING && window.BRANDING.logoURL) || null;
  const logoDimarzaUrl = (window.BRANDING && window.BRANDING.logoDimarzaURL) || null;
  const [logoClienteData, logoDimarzaData] = await Promise.all([cargarLogo(logoClienteUrl), cargarLogo(logoDimarzaUrl)]);

  function drawFooter() {
    doc.setFontSize(7.5); doc.setTextColor(154, 164, 178);
    doc.text('Generado automáticamente desde la app de control de avance — ' + ((window.BRANDING && window.BRANDING.empresa) || 'DIMARZA'), marginX, pageH - 8);
    doc.text('Página ' + pageNum, pageW - marginX, pageH - 8, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  function newPage() { doc.addPage(); pageNum++; drawFooter(); cy = 20; }
  function ensureSpace(h) { if (cy + h > pageH - 16) newPage(); }
  function sectionHeader(title) {
    ensureSpace(10);
    doc.setFillColor(...C_DARK);
    doc.rect(marginX, cy, 3, 5.5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...C_DARK);
    doc.text(title, marginX + 6, cy + 4.3);
    cy += 9;
  }

  // ---- Encabezado con banda de color ----
  doc.setFillColor(...C_DARK);
  doc.rect(0, 0, pageW, 34, 'F');
  if (logoClienteData) {
    try { doc.addImage(logoClienteData, 'PNG', pageW - 34, 4, 26, 13.9, undefined, 'FAST'); } catch (e) { /* ignorar */ }
  }
  if (logoDimarzaData) {
    try { doc.addImage(logoDimarzaData, 'PNG', pageW - 34, 19.5, 26, 6.5, undefined, 'FAST'); } catch (e) { /* ignorar */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
  doc.text(SEED_DATA.paradaNombre, marginX, 15);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5);
  doc.text(`${SEED_DATA.paradaSubtitulo} · ${SEED_DATA.totalHH} HH base`, marginX, 22);

  const now = new Date();
  const nowIdx = turnoActualIdx();
  const turnoTxt = SEED_DATA.turnoLabels[nowIdx];
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(`Momento del informe: ${now.toLocaleDateString('es-CL')}  ${now.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}  ·  Turno: ${turnoTxt}`, marginX, 29);
  doc.setTextColor(0, 0, 0);
  cy = 42;

  // KPIs en grilla
  const kpiList = [
    ['Crecimiento de Alcance', (kpis.pctCrecimiento*100).toFixed(1) + '%'],
    ['Variación Neta', (kpis.netoPct>=0?'+':'') + (kpis.netoPct*100).toFixed(1) + '%'],
    ['% Plan Cancelado', `${kpis.nCanceladas} / ${kpis.nTotalVigentes + kpis.nCanceladas} OTs (${(kpis.nTotalVigentes + kpis.nCanceladas ? kpis.nCanceladas / (kpis.nTotalVigentes + kpis.nCanceladas) * 100 : 0).toFixed(0)}%)`],
    ['Completadas', `${kpis.nCompletadas} / ${kpis.nTotalVigentes} (${(kpis.pctCompletadas*100).toFixed(0)}%)`],
    ['En curso', `${kpis.nEnCurso} / ${kpis.nTotalVigentes} (${(kpis.pctEnCurso*100).toFixed(0)}%)`],
    ['No iniciadas', `${kpis.nNoIniciadas} / ${kpis.nTotalVigentes} (${(kpis.pctNoIniciadas*100).toFixed(0)}%)`],
    ['Actividades Emergentes', `${kpis.nEmergentes} actividad(es) · ${kpis.hhEmergentes.toFixed(1)} HH`],
    ['HH No Ejecutadas (canceladas)', `${kpis.hhCanceladas.toFixed(1)} HH · ${kpis.nCanceladas} OTs`],
  ];
  const colW = (pageW - marginX*2) / 2;
  kpiList.forEach((k, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const kx = marginX + col * colW, ky = cy + row * 14;
    doc.setDrawColor(227, 230, 235); doc.setFillColor(250, 251, 252);
    doc.roundedRect(kx, ky, colW - 4, 11, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(107, 118, 133);
    doc.text(k[0], kx + 3, ky + 4);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor(27, 36, 48);
    doc.text(String(k[1]), kx + 3, ky + 8.5);
  });
  cy += Math.ceil(kpiList.length / 2) * 14 + 8;

  // Gráfico Curva S dibujado a mano en el PDF
  const chartX = marginX, chartY = cy, chartW = pageW - marginX*2, chartH = 80;
  const n = labels.length;
  const px = (i) => chartX + (i / (n - 1)) * chartW;
  const yMax = 1.25;
  const py = (v) => chartY + (1 - v / yMax) * chartH;

  doc.setDrawColor(227, 230, 235);
  [0, 0.25, 0.5, 0.75, 1, 1.25].forEach((v) => {
    doc.line(chartX, py(v), chartX + chartW, py(v));
    doc.setFontSize(6.5); doc.setTextColor(154, 164, 178);
    doc.text(Math.round(v*100) + '%', chartX - 2, py(v) + 1, { align: 'right' });
  });

  function drawLine(arr, color, dashed) {
    doc.setDrawColor(...color); doc.setLineWidth(0.5);
    if (dashed) doc.setLineDashPattern([1.2, 1], 0); else doc.setLineDashPattern([], 0);
    let prev = null;
    arr.forEach((v, i) => {
      if (v === null || v === undefined) { prev = null; return; }
      if (prev !== null) doc.line(px(i-1), py(prev), px(i), py(v));
      prev = v;
    });
    doc.setLineDashPattern([], 0);
  }
  drawLine(alcanceEmerg, [47, 123, 246], true);
  drawLine(percentPlan, [47, 123, 246], false);
  drawLine(percentReal, [240, 64, 62], false);
  drawLine(percentRealTotal, [255, 159, 69], false);

  // Etiquetas eje X (cada 2 para que no se amontonen)
  doc.setFontSize(5.5); doc.setTextColor(154, 164, 178);
  labels.forEach((lbl, i) => {
    if (i % 2 !== 0) return;
    doc.text(lbl.trim(), px(i), chartY + chartH + 6, { align: 'center', angle: 45 });
  });

  cy = chartY + chartH + 16;

  // Leyenda del gráfico
  const legendItems = [
    ['Plan', [47,123,246]], ['Real', [240,64,62]], ['Alcance Emergentes', [47,123,246]], ['Real Total', [255,159,69]],
  ];
  let lx = marginX;
  legendItems.forEach(([label, color]) => {
    doc.setFillColor(...color); doc.circle(lx + 1, cy - 1, 1, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(107, 118, 133);
    doc.text(label, lx + 4, cy);
    lx += doc.getTextWidth(label) + 12;
  });
  cy += 10;

  // ---- Actividades en progreso (solo las activas ahora mismo) ----
  const { enProgreso, completadas } = buildEstadoActividades();
  const canceladasConMotivo = buildCanceladasConMotivo();

  ensureSpace(14);
  sectionHeader('Actividades en progreso ahora mismo');
  if (enProgreso.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C_MUTED);
    doc.text('No hay actividades activas en este momento.', marginX + 2, cy + 2);
    cy += 10;
  } else {
    enProgreso.forEach((item) => {
      ensureSpace(15);
      const badgeColor = !item.dentroDeVentana ? C_BLUE : (item.behind ? C_RED : [34, 179, 126]);
      const badgeText = !item.dentroDeVentana ? 'EN CURSO' : (item.behind ? 'ATRASADO' : 'A TIEMPO');
      doc.setDrawColor(...C_LINE); doc.setFillColor(...C_BG);
      doc.roundedRect(marginX, cy, pageW - marginX * 2, 13, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C_BLUE);
      doc.text(`OT ${item.ot.otNum}`, marginX + 3, cy + 5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C_DARK);
      doc.text(item.ot.descripcion, marginX + 3, cy + 10, { maxWidth: pageW - marginX * 2 - 60 });
      doc.setFillColor(...badgeColor);
      doc.roundedRect(pageW - marginX - 44, cy + 3, 41, 7, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(255, 255, 255);
      doc.text(`${badgeText} · ${Math.round(item.real * 100)}%`, pageW - marginX - 23.5, cy + 7.3, { align: 'center' });
      cy += 16;
    });
  }
  cy += 4;

  // ---- Actividades completadas al 100% ----
  ensureSpace(14);
  sectionHeader('Actividades completadas (100%)');
  if (completadas.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C_MUTED);
    doc.text('Todavía no hay actividades completadas.', marginX + 2, cy + 2);
    cy += 10;
  } else {
    completadas.forEach((item) => {
      ensureSpace(6);
      doc.setFillColor(34, 179, 126);
      doc.circle(marginX + 1.5, cy - 0.8, 1.4, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...C_BLUE);
      doc.text(`OT ${item.ot.otNum}`, marginX + 6, cy);
      doc.setFont('helvetica', 'normal'); doc.setTextColor(...C_DARK);
      doc.text(`— ${item.ot.descripcion}`, marginX + 6 + doc.getTextWidth(`OT ${item.ot.otNum} `), cy);
      cy += 5.5;
    });
  }
  cy += 4;

  // ---- Actividades canceladas (con motivo pulido) ----
  ensureSpace(14);
  sectionHeader('Actividades canceladas');
  if (canceladasConMotivo.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C_MUTED);
    doc.text('No hay actividades canceladas registradas.', marginX + 2, cy + 2);
    cy += 10;
  } else {
    canceladasConMotivo.forEach((item) => {
      const motivoTxt = item.motivo ? limpiarComentario(item.motivo) : '';
      const motivoLines = motivoTxt ? doc.splitTextToSize(motivoTxt, pageW - marginX * 2 - 8) : [];
      const boxH = 13 + motivoLines.length * 4.2;
      ensureSpace(boxH + 3);
      doc.setDrawColor(...C_LINE); doc.setFillColor(255, 245, 245);
      doc.roundedRect(marginX, cy, pageW - marginX * 2, boxH, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...C_RED);
      doc.text(`OT ${item.ot.otNum} — ${item.estado}`, marginX + 3, cy + 5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C_DARK);
      doc.text(item.ot.descripcion, marginX + 3, cy + 9.5, { maxWidth: pageW - marginX * 2 - 6 });
      if (motivoLines.length) {
        doc.setFont('helvetica', 'italic'); doc.setFontSize(7.8); doc.setTextColor(...C_MUTED);
        doc.text(motivoLines, marginX + 3, cy + 13.5);
      }
      cy += boxH + 4;
    });
  }

  drawFooter();
  const fname = `CurvaS_${PARADA_ID}_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(fname);
}

function buildEstadoActividades() {
  const now = new Date();
  const enProgreso = [];
  const completadas = [];
  allOts().forEach((ot) => {
    const estado = getOtEstado(ot.otNum);
    if (estado.startsWith('Cancelada')) return;
    const real = otProgressAt(ot, SEED_DATA.turnoLabels.length - 1);
    if (real >= 0.999) { completadas.push({ ot, real }); return; }
    if (real > 0) {
      // Si el reloj real cae dentro de la ventana del Gantt, comparamos contra lo
      // esperado a esta hora. Si no (ej. se está probando la app antes o después
      // de la fecha real de la parada), igual mostramos el avance cargado, sin
      // marcar atraso porque no hay una referencia de tiempo valida para comparar.
      const inicio = new Date(ot.inicio), fin = new Date(ot.fin);
      const dentroDeVentana = now >= inicio && now <= fin;
      const expected = dentroDeVentana ? expectedPctNow(ot, now) : null;
      const behind = dentroDeVentana && real < expected - 0.1;
      enProgreso.push({ ot, real, expected, behind, dentroDeVentana });
    }
  });
  return { enProgreso, completadas };
}

function buildCanceladasConMotivo() {
  return allOts()
    .filter((ot) => getOtEstado(ot.otNum).startsWith('Cancelada'))
    .map((ot) => ({ ot, estado: getOtEstado(ot.otNum), motivo: getOtMotivo(ot.otNum) }));
}


// ============================================================
// v5: Componentes por OT (código SAP, descripción, cantidad, foto)
//     + Cuadrillas DIMARZA + Reporte PDF de componentes
// ============================================================

state.componentes = [];
let compFotoFile = null;

function componentesCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('componentes'); }

function listenComponentes() {
  componentesCollection().onSnapshot((snap) => {
    state.componentes = [];
    snap.forEach((doc) => state.componentes.push({ id: doc.id, ...doc.data() }));
    if (sheetCtx) renderComponentesSection();
  });
}

function renderComponentesSection() {
  const list = document.getElementById('componentesList');
  if (!sheetCtx || !list) return;
  const items = state.componentes.filter((c) => c.otNum === sheetCtx.otNum);
  if (items.length === 0) {
    list.innerHTML = '<div class="componentes-empty">Sin componentes registrados para esta OT</div>';
    return;
  }
  list.innerHTML = items.map((c) => `
    <div class="componente-row">
      ${c.fotoURL ? `<img src="${c.fotoURL}" alt="foto">` : ''}
      <div class="c-info">
        <div class="c-sap">${c.codigoSAP || 'S/COD'}</div>
        <div class="c-desc">${c.descripcion}</div>
        <div class="c-cant">Cantidad: ${c.cantidad}</div>
      </div>
      <button class="c-del" data-delcomp="${c.id}" title="Eliminar">✕</button>
    </div>
  `).join('');
  list.querySelectorAll('[data-delcomp]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este componente?')) return;
      try {
        await componentesCollection().doc(btn.dataset.delcomp).delete();
        showToast('Componente eliminado');
      } catch (e) {
        console.error(e);
        showToast('No se pudo eliminar — revisa tu conexión');
      }
    });
  });
}

function cuadrillaLabel(grupo) {
  const c = (SEED_DATA.cuadrillas || []).find((x) => x.grupo === grupo);
  if (!c) return grupo;
  const partes = [`${c.mecanicos} Mec`];
  if (c.soldadores) partes.push(`${c.soldadores} Sol`);
  if (c.rigger) partes.push(`${c.rigger} Rig`);
  return `${grupo} · ${partes.join(', ')}`;
}

function urlToDataURL(url) {
  return fetch(url)
    .then((r) => r.blob())
    .then((blob) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
}

async function generateComponentesReportPdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, marginX = 16;
  let cy = 18;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
  doc.setTextColor(27, 36, 48);
  doc.text('Listado de Componentes a Retirar', marginX, cy);
  cy += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  doc.setTextColor(107, 118, 133);
  doc.text(`${SEED_DATA.paradaNombre} · Generado ${new Date().toLocaleString('es-CL')}`, marginX, cy);
  cy += 10;

  const items = state.componentes.slice().sort((a, b) =>
    (a.area || '').localeCompare(b.area || '') || (a.otNum - b.otNum));

  if (items.length === 0) {
    doc.setFontSize(11); doc.setTextColor(107, 118, 133);
    doc.text('No hay componentes registrados todavía.', marginX, cy + 4);
    doc.save(`Componentes_${PARADA_ID}.pdf`);
    return;
  }

  doc.setDrawColor(227, 230, 235); doc.setFillColor(250, 251, 252);
  doc.roundedRect(marginX, cy, pageW - marginX * 2, 12, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(27, 36, 48);
  const totalUnid = items.reduce((s, c) => s + (parseFloat(c.cantidad) || 0), 0);
  doc.text(`Total: ${items.length} componente(s)  ·  ${totalUnid} unidad(es) a retirar`, marginX + 4, cy + 7.5);
  cy += 20;

  let currentArea = null, currentOt = null;

  for (const c of items) {
    if (cy > pageH - 35) { doc.addPage(); cy = 18; }

    if (c.area !== currentArea) {
      currentArea = c.area; currentOt = null;
      doc.setFillColor(27, 36, 48);
      doc.rect(marginX, cy, pageW - marginX * 2, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(255, 255, 255);
      doc.text(currentArea || 'Sin área', marginX + 3, cy + 5);
      cy += 11;
    }
    if (c.otNum !== currentOt) {
      currentOt = c.otNum;
      if (cy > pageH - 30) { doc.addPage(); cy = 18; }
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(47, 123, 246);
      doc.text(`OT ${c.otNum} — ${c.otDescripcion || ''}`, marginX + 2, cy + 4);
      cy += 8;
    }

    const rowH = 22;
    doc.setDrawColor(227, 230, 235); doc.setFillColor(255, 255, 255);
    doc.roundedRect(marginX, cy, pageW - marginX * 2, rowH, 1.5, 1.5, 'FD');

    let imgW = 0;
    if (c.fotoURL) {
      try {
        const dataUrl = await urlToDataURL(c.fotoURL);
        doc.addImage(dataUrl, 'JPEG', marginX + 2, cy + 2, 18, 18);
        imgW = 22;
      } catch (e) { /* si la foto no carga, seguimos sin ella */ }
    }

    const tx = marginX + 4 + imgW;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(47, 123, 246);
    doc.text(c.codigoSAP || 'S/COD', tx, cy + 7);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(27, 36, 48);
    doc.text(c.descripcion || '', tx, cy + 13, { maxWidth: pageW - marginX * 2 - imgW - 40 });
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(107, 118, 133);
    doc.text(`Cant: ${c.cantidad}`, pageW - marginX - 4, cy + 7, { align: 'right' });

    cy += rowH + 4;
  }

  doc.setFontSize(7.5); doc.setTextColor(154, 164, 178);
  doc.text('Generado automáticamente desde la app de control de avance — ' + ((window.BRANDING && window.BRANDING.empresa) || 'DIMARZA'), marginX, 287);
  doc.save(`Componentes_${PARADA_ID}_${new Date().toISOString().slice(0, 10)}.pdf`);
}


// ============================================================
// v6: Toggle Lista / Línea de tiempo (evita mostrar ambas juntas)
// ============================================================

// ============================================================
// v7: Campanias de polines (listado a cambiar, con historial completo)
// ============================================================

state.polinesEstado = {};    // key "otNum::polinId" -> {estado, turno, supervisor, ts}
state.polinesHistorial = []; // lista completa ordenada cronologicamente
state.polinesEmergentes = []; // polines agregados en terreno, no venian en el listado original

function esCampaniaPolines(ot) { return !!ot.campaniaPolines; }
function polinKey(otNum, polinId) { return otNum + '::' + polinId; }
function polinesEstadoCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('polinesEstado'); }
function polinesHistorialCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('polinesHistorial'); }
function polinesEmergentesCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('polinesEmergentes'); }

function listenPolinesEmergentes() {
  polinesEmergentesCollection().onSnapshot((snap) => {
    state.polinesEmergentes = [];
    snap.forEach((doc) => state.polinesEmergentes.push({ id: doc.id, ...doc.data() }));
    renderAll();
    if (document.getElementById('polinesSheetBackdrop') && document.getElementById('polinesSheetBackdrop').classList.contains('open')) renderPolinesList();
  });
}

async function agregarPolinEmergente(otNum, datos) {
  const correa = (todosLosPolinesDeOt(otNum)[0] || {}).correa || '';
  // fecha/hora de inicio = el turno actual (no se pregunta, se asume que se detecto ahora)
  const fechaDeteccion = SEED_DATA.turnos[turnoActualIdx()] || new Date().toISOString();
  const doc = {
    otNum, correa: datos.correa || correa, estacion: datos.estacion, ubicacion: datos.ubicacion,
    posicion: datos.posicion || '', tipoEstacion: datos.tipoEstacion || '', descripcion: datos.descripcion, cantidad: datos.cantidad || 1,
    pesoPlanHH: datos.pesoPlanHH || 0, fechaDeteccion,
    emergente: true, createdAt: Date.now(),
  };
  if (datos.criticidad) doc.criticidad = datos.criticidad;
  await polinesEmergentesCollection().add(doc);
}

// Borra un polin emergente agregado por error. Tambien limpia su estado (checked/comentario/
// posicion) si quedo alguno guardado, para no dejar basura huerfana en Firestore.
async function eliminarPolinEmergente(otNum, polinId) {
  await polinesEmergentesCollection().doc(polinId).delete();
  try { await polinesEstadoCollection().doc(polinKey(otNum, polinId)).delete(); } catch (e) { /* puede no existir, no pasa nada */ }
}

function listenPolines() {
  polinesEstadoCollection().onSnapshot((snap) => {
    state.polinesEstado = {};
    snap.forEach((doc) => { state.polinesEstado[doc.id] = doc.data(); });
    renderAll();
    if (document.getElementById('polinesSheetBackdrop') && document.getElementById('polinesSheetBackdrop').classList.contains('open')) renderPolinesList();
    if (polinesSheetOtNum) renderProtocoloPanel(polinesSheetOtNum);
  });
  polinesHistorialCollection().onSnapshot((snap) => {
    state.polinesHistorial = [];
    snap.forEach((doc) => state.polinesHistorial.push({ id: doc.id, ...doc.data() }));
    state.polinesHistorial.sort((a, b) => (a.ts || 0) - (b.ts || 0));
  });
}

function polinesPct(otNum) {
  // Los polines EMERGENTES (agregados en terreno) no cuentan aqui — si se sumaran al total
  // de esta OT, cada vez que se descubre un polin emergente el % de la OT bajaria de golpe
  // (mismo cambiado, pero mas polines en el total), aunque en realidad no se atraso nada.
  // Lo emergente se rastrea aparte, como "Alcance Emergentes" en la Curva S.
  const items = todosLosPolinesDeOt(otNum).filter((p) => !p.emergente);
  if (items.length === 0) return 0;
  const cambiados = items.filter((p) => {
    const e = state.polinesEstado[polinKey(otNum, p.id)];
    return e && e.estado === 'Cambiado';
  }).length;
  return cambiados / items.length;
}

async function togglePolinEstado(otNum, polin) {
  const key = polinKey(otNum, polin.id);
  const actual = state.polinesEstado[key];
  const nuevoEstado = (actual && actual.estado === 'Cambiado') ? 'Pendiente' : 'Cambiado';
  const comentario = (actual && actual.comentario) || '';
  await guardarPolinCambio(otNum, polin, nuevoEstado, comentario);
}

async function savePolinComentario(otNum, polin, texto) {
  const key = polinKey(otNum, polin.id);
  const actual = state.polinesEstado[key];
  const estadoActual = (actual && actual.estado) || 'Pendiente';
  const limpio = limpiarComentario(texto);
  await guardarPolinCambio(otNum, polin, estadoActual, limpio);
}

// Guarda/edita la posicion (izquierdo/central/derecho) directamente sobre CUALQUIER polin,
// tanto los que vienen del listado original (que no traen posicion) como los emergentes
// o las filas separadas por cantidad>1. No pisa estado/comentario, solo agrega este campo.
async function savePolinPosicion(otNum, polin, posicion) {
  const key = polinKey(otNum, polin.id);
  try {
    await polinesEstadoCollection().doc(key).set({
      posicionManual: posicion, otNum, polinId: polin.id,
    }, { merge: true });
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar la posición — revisa tu conexión');
  }
}

async function savePolinFoto(otNum, polin, tipo, file) {
  const key = polinKey(otNum, polin.id);
  try {
    const storage = firebase.storage();
    const path = `paradas/${PARADA_ID}/polines/${otNum}_${polin.id}_${tipo}_${Date.now()}_${file.name}`;
    const ref = storage.ref(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    const campo = tipo === 'antes' ? 'fotoAntesURL' : 'fotoDespuesURL';
    await polinesEstadoCollection().doc(key).set({
      [campo]: url, otNum, polinId: polin.id, updatedAt: Date.now(),
    }, { merge: true });
    showToast('Foto guardada ✓');
  } catch (e) {
    console.error(e);
    showToast('No se pudo subir la foto — revisa tu conexión');
  }
}

async function guardarPolinCambio(otNum, polin, nuevoEstado, comentario) {
  const key = polinKey(otNum, polin.id);
  const actual = state.polinesEstado[key];
  const idx = turnoActualIdx();
  const turnoLabel = SEED_DATA.turnoLabels[idx];
  const supervisor = getOtSupervisor(otNum) || 'Sin identificar';
  const anterior = (actual && actual.estado) || 'Pendiente';
  const ts = Date.now();
  try {
    await polinesEstadoCollection().doc(key).set({
      estado: nuevoEstado, comentario: comentario || '', turno: turnoLabel, supervisor, ts, otNum, polinId: polin.id,
    }, { merge: true });
    await polinesHistorialCollection().add({
      otNum, polinId: polin.id, correa: polin.correa || '', estacion: polin.estacion || '',
      ubicacion: polin.ubicacion || '', estadoAnterior: anterior, estadoNuevo: nuevoEstado,
      comentario: comentario || '', turno: turnoLabel, supervisor, ts,
    });
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar — revisa tu conexión');
  }
}

// --- Modal de polines: se inyecta en el DOM la primera vez que se necesita ---
let polinesSheetOtNum = null;

function ensurePolinesModal() {
  if (document.getElementById('polinesSheetBackdrop')) return;
  const div = document.createElement('div');
  div.innerHTML = `
    <div class="sheet-backdrop" id="polinesSheetBackdrop">
      <div class="sheet">
        <div class="handle"></div>
        <button id="btnVerCurvaMovilPolines" title="Ver Curva S">📊 Curva S</button>
        <h2 id="polinesSheetTitle">—</h2>
        <p class="meta" id="polinesSheetMeta">—</p>
        <div class="supervisores-fila">
          <div class="ot-status-row">
            <label>Supervisor Turno A</label>
            <input type="text" class="supervisor-input-panel" id="polinesSupervisorA" data-turnotipo="A" placeholder="Nombre">
          </div>
          <div class="ot-status-row">
            <label>Supervisor Turno B</label>
            <input type="text" class="supervisor-input-panel" id="polinesSupervisorB" data-turnotipo="B" placeholder="Nombre">
          </div>
        </div>
        <p class="rotulo-mini" style="margin-bottom:6px;">Criticidad de los polines</p>
        <div class="criticidad-legend">
          <span class="crit-tag crit-1">✕ Alta (Inaceptable)</span>
          <span class="crit-tag crit-2">❙ Media (Insatisfactorio)</span>
          <span class="crit-tag crit-3">✓ Baja (Satisfactorio)</span>
        </div>
        <div id="polinesResumen" class="polines-resumen"></div>
        <div class="sheet-actions" style="margin-bottom:12px;">
          <button class="btn ghost" id="btnAddPolinEmergente" style="border-color:var(--emergente); color:var(--emergente);">+ Polín emergente</button>
        </div>
        <div id="polinesListWrap"></div>
        <div class="sheet-actions">
          <button class="btn ghost" id="polinesSheetClose">Cerrar</button>
        </div>
      </div>
    </div>
    <div class="sheet-backdrop" id="polinEmergBackdrop">
      <div class="sheet">
        <div class="handle"></div>
        <h2>Nuevo polín emergente</h2>
        <p class="meta">Polín encontrado en terreno, no venía en el listado original</p>
        <label style="display:block; font-size:12px; color:var(--ink-muted); margin:14px 0 6px;">Correa/Feeder</label>
        <input type="text" id="polinEmergCorrea" placeholder="Ej: CV201" style="width:100%; padding:12px; border-radius:10px; background:var(--navy-soft); color:var(--ink); border:1px solid var(--line); font-family:var(--mono); font-size:14px; margin-bottom:14px;">
        <label style="display:block; font-size:12px; color:var(--ink-muted); margin-bottom:6px;">N° de estación</label>
        <input type="text" id="polinEmergEstacion" placeholder="Ej: 52" style="width:100%; padding:12px; border-radius:10px; background:var(--navy-soft); color:var(--ink); border:1px solid var(--line); font-family:var(--mono); font-size:14px; margin-bottom:14px;">
        <label style="display:block; font-size:12px; color:var(--ink-muted); margin-bottom:6px;">Ubicación</label>
        <select id="polinEmergUbicacion" style="width:100%; padding:12px; border-radius:10px; background:var(--navy-soft); color:var(--ink); border:1px solid var(--line); font-family:var(--sans); font-size:14px; margin-bottom:14px;">
          <option value="Carga">Carga</option>
          <option value="Retorno">Retorno</option>
        </select>
        <label style="display:block; font-size:12px; color:var(--ink-muted); margin-bottom:6px;">Posición(es) del polín (déjalo en blanco si aún no sabes cuál — puedes agregar varias si son de la misma estación)</label>
        <div id="polinEmergPosicionesWrap"></div>
        <button type="button" id="btnAgregarPosicionEmerg" style="width:100%; padding:10px; border-radius:10px; background:var(--brand-soft); color:var(--brand); border:1px dashed var(--brand); font-family:var(--sans); font-size:13px; font-weight:700; cursor:pointer; margin-bottom:14px;">+ Agregar otra posición de esta estación</button>
        <label style="display:block; font-size:12px; color:var(--ink-muted); margin-bottom:6px;">Tipo de estación (opcional)</label>
        <input type="text" id="polinEmergTipo" placeholder="Ej: Impacto, Normal, Autoalineante" style="width:100%; padding:12px; border-radius:10px; background:var(--navy-soft); color:var(--ink); border:1px solid var(--line); font-family:var(--sans); font-size:14px; margin-bottom:14px;">
        <label style="display:block; font-size:12px; color:var(--ink-muted); margin-bottom:6px;">Descripción de la falla</label>
        <input type="text" id="polinEmergDesc" placeholder="Ej: Polín trabado con material" style="width:100%; padding:12px; border-radius:10px; background:var(--navy-soft); color:var(--ink); border:1px solid var(--line); font-family:var(--sans); font-size:14px; margin-bottom:14px;">
        <label style="display:block; font-size:12px; color:var(--ink-muted); margin-bottom:6px;">Cantidad</label>
        <input type="number" id="polinEmergCantidad" value="1" min="1" step="1" style="width:100%; padding:12px; border-radius:10px; background:var(--navy-soft); color:var(--ink); border:1px solid var(--line); font-family:var(--mono); font-size:14px; margin-bottom:14px;">
        <label style="display:block; font-size:12px; color:var(--ink-muted); margin-bottom:6px;">HH trabajadas (para que se refleje en la Curva S)</label>
        <input type="number" id="polinEmergHH" value="1" min="0" step="0.5" style="width:100%; padding:12px; border-radius:10px; background:var(--navy-soft); color:var(--ink); border:1px solid var(--line); font-family:var(--mono); font-size:14px; margin-bottom:18px;">
        <div class="sheet-actions">
          <button class="btn ghost" id="polinEmergCancel">Cancelar</button>
          <button class="btn primary" id="polinEmergSave">Agregar</button>
        </div>
      </div>
    </div>`;
  // El panel de polines va dentro de <main> para poder ocupar la columna
  // central del layout de 3 paneles; el modal de "polin emergente" queda
  // en el body porque siempre es una ventana flotante.
  const mainEl = document.querySelector('main') || document.body;
  mainEl.appendChild(div.firstElementChild);
  document.body.appendChild(div.firstElementChild);

  // Las opciones de "Posicion" dependen de si el polin es de Carga (izq/central/der,
  // + la opcion de cama de impacto que agrupa toda la estacion) o de Retorno (izq/der).
  // Puede haber VARIAS filas de posicion (una por cada polin de la misma estacion).
  function opcionesPosicionActuales() {
    const ubic = document.getElementById('polinEmergUbicacion').value;
    const correa = document.getElementById('polinEmergCorrea').value.trim();
    const tipo = document.getElementById('polinEmergTipo').value.trim();
    return opcionesPosicionPolin(ubic, correa, tipo);
  }
  function crearFilaPosicion(valorInicial) {
    const wrap = document.getElementById('polinEmergPosicionesWrap');
    const fila = document.createElement('div');
    fila.style.cssText = 'display:flex; gap:6px; margin-bottom:8px;';
    const sel = document.createElement('select');
    sel.className = 'polin-emerg-posicion-select';
    sel.style.cssText = 'flex:1; padding:12px; border-radius:10px; background:var(--navy-soft); color:var(--ink); border:1px solid var(--line); font-family:var(--sans); font-size:14px;';
    fila.appendChild(sel);
    const btnX = document.createElement('button');
    btnX.type = 'button'; btnX.textContent = '✕';
    btnX.style.cssText = 'padding:0 14px; border-radius:10px; background:none; border:1px solid var(--line); color:var(--ink-muted); cursor:pointer; font-family:var(--sans);';
    btnX.addEventListener('click', () => {
      if (document.querySelectorAll('.polin-emerg-posicion-select').length <= 1) return;
      fila.remove();
    });
    fila.appendChild(btnX);
    wrap.appendChild(fila);
    actualizarOpcionesPosicion();
    if (valorInicial !== undefined) sel.value = valorInicial;
  }
  function actualizarOpcionesPosicion() {
    const opciones = opcionesPosicionActuales();
    document.querySelectorAll('.polin-emerg-posicion-select').forEach((sel) => {
      const valorPrevio = sel.value;
      sel.innerHTML = opciones.map((o) => `<option value="${o}">${o || '— Sin especificar —'}</option>`).join('');
      if (opciones.includes(valorPrevio)) sel.value = valorPrevio;
    });
  }
  document.getElementById('polinEmergUbicacion').addEventListener('change', actualizarOpcionesPosicion);
  document.getElementById('polinEmergCorrea').addEventListener('input', actualizarOpcionesPosicion);
  document.getElementById('polinEmergTipo').addEventListener('input', actualizarOpcionesPosicion);
  document.getElementById('btnAgregarPosicionEmerg').addEventListener('click', () => crearFilaPosicion());

  document.getElementById('btnAddPolinEmergente').addEventListener('click', () => {
    if (!polinesSheetOtNum) return;
    const items = todosLosPolinesDeOt(polinesSheetOtNum);
    document.getElementById('polinEmergCorrea').value = (items[0] && items[0].correa) || '';
    document.getElementById('polinEmergEstacion').value = '';
    document.getElementById('polinEmergUbicacion').value = 'Carga';
    document.getElementById('polinEmergPosicionesWrap').innerHTML = '';
    crearFilaPosicion('');
    document.getElementById('polinEmergTipo').value = '';
    document.getElementById('polinEmergDesc').value = '';
    document.getElementById('polinEmergCantidad').value = '1';
    document.getElementById('polinEmergHH').value = '1';
    document.getElementById('polinEmergBackdrop').classList.add('open');
  });
  document.getElementById('polinEmergCancel').addEventListener('click', () => {
    document.getElementById('polinEmergBackdrop').classList.remove('open');
  });
  document.getElementById('polinEmergBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'polinEmergBackdrop') document.getElementById('polinEmergBackdrop').classList.remove('open');
  });
  document.getElementById('polinEmergSave').addEventListener('click', async () => {
    const desc = document.getElementById('polinEmergDesc').value.trim();
    const estacion = document.getElementById('polinEmergEstacion').value.trim();
    if (!desc || !estacion) { showToast('Falta la estación o la descripción'); return; }
    const btn = document.getElementById('polinEmergSave');
    btn.disabled = true; btn.textContent = 'Guardando…';
    try {
      const posiciones = [...document.querySelectorAll('.polin-emerg-posicion-select')].map((s) => s.value);
      const hhIngresadas = parseFloat(document.getElementById('polinEmergHH').value) || 0;
      const datosBase = {
        correa: document.getElementById('polinEmergCorrea').value.trim(),
        estacion, ubicacion: document.getElementById('polinEmergUbicacion').value,
        tipoEstacion: document.getElementById('polinEmergTipo').value.trim(),
        descripcion: desc,
      };
      // Si hay una sola fila de posicion, respeta el campo Cantidad (para "2 sin especificar").
      // Si hay varias filas, cada una es un polin individual (cantidad 1 cada uno). Las HH
      // ingresadas se reparten entre todas las posiciones para no duplicar el total en la Curva S.
      if (posiciones.length <= 1) {
        await agregarPolinEmergente(polinesSheetOtNum, {
          ...datosBase, posicion: posiciones[0] || '',
          cantidad: parseInt(document.getElementById('polinEmergCantidad').value, 10) || 1,
          pesoPlanHH: hhIngresadas,
        });
      } else {
        const hhPorPosicion = hhIngresadas / posiciones.length;
        await Promise.all(posiciones.map((posicion) =>
          agregarPolinEmergente(polinesSheetOtNum, { ...datosBase, posicion, cantidad: 1, pesoPlanHH: hhPorPosicion })));
      }
      showToast('Polín emergente agregado ✓');
      document.getElementById('polinEmergBackdrop').classList.remove('open');
    } catch (e) {
      console.error(e);
      showToast('No se pudo guardar');
    }
    btn.disabled = false; btn.textContent = 'Agregar';
  });

  document.getElementById('polinesSheetClose').addEventListener('click', closePolinesSheet);

  // BUG corregido: este boton se crea recien la primera vez que se abre una OT de polines
  // (mucho despues del DOMContentLoaded), asi que el listener tiene que engancharse aqui
  // mismo — antes se intentaba enganchar en el arranque de la pagina, cuando el boton
  // todavia no existia, y por eso "Curva S" no hacia nada dentro de una OT de polines.
  const btnVerPol = document.getElementById('btnVerCurvaMovilPolines');
  if (btnVerPol) {
    btnVerPol.addEventListener('click', () => {
      state.polinesOtGuardado = polinesSheetOtNum;
      document.getElementById('polinesSheetBackdrop').classList.remove('open');
      document.body.classList.add('viendo-curva-desde-detalle');
      irAVista('curva');
    });
  }

  document.querySelectorAll('#polinesSupervisorA, #polinesSupervisorB').forEach((inp) => {
    inp.addEventListener('click', (e) => e.stopPropagation());
    inp.addEventListener('blur', async (e) => {
      const otNum = polinesSheetOtNum;
      const tipo = inp.dataset.turnotipo;
      if (!otNum) return;
      try {
        await saveOtSupervisor(otNum, tipo, e.target.value.trim());
        showToast('Supervisor Turno ' + tipo + ' guardado');
      } catch (err) {
        console.error(err);
        showToast('No se pudo guardar el supervisor');
      }
    });
  });
  document.getElementById('polinesSheetBackdrop').addEventListener('click', (e) => {
    if (e.target.id === 'polinesSheetBackdrop') closePolinesSheet();
  });
}

function openPolinesSheet(otNum) {
  activarModoDetalleMovil();
  actualizarOtActualEnBoton(otNum);
  ensurePolinesModal();
  polinesSheetOtNum = otNum;
  const ot = allOts().find((o) => String(o.otNum) === String(otNum));
  if (!ot) return;
  document.getElementById('polinesSheetTitle').textContent = `OT ${ot.otNum} — ${ot.descripcion}`;
  document.getElementById('polinesSheetMeta').textContent = 'Toca cada polín para marcarlo como cambiado';
  document.getElementById('polinesSupervisorA').value = getOtSupervisor(otNum, 'A');
  document.getElementById('polinesSupervisorB').value = getOtSupervisor(otNum, 'B');
  renderPolinesList();
  // Cierra el panel de actividad normal si habia quedado abierto de una visita anterior
  // (bug: al volver a la Linea de tiempo y entrar a una OT de polines, ambos paneles
  // quedaban visibles a la vez porque #sheetBackdrop nunca se cerraba explicitamente)
  const sheetPanel = document.getElementById('sheetBackdrop');
  if (sheetPanel) { sheetPanel.classList.remove('open'); sheetPanel.classList.remove('tiene-seleccion'); }
  sheetCtx = null;
  document.getElementById('polinesSheetBackdrop').classList.add('open');
  document.body.classList.add('polines-abierto');
  renderProtocoloPanel(otNum);
}

function closePolinesSheet() {
  const el = document.getElementById('polinesSheetBackdrop');
  if (el) el.classList.remove('open');
  document.body.classList.remove('polines-abierto');
  renderProtocoloPanel(null);
}

// Genera el HTML de una fila de polin. mostrarEstacion=false se usa cuando varias filas
// comparten el mismo N° de estacion y ya hay un mini-encabezado agrupandolas arriba.
// Opciones de "Posicion" para un polin, segun ubicacion (Carga/Retorno), la correa y si es
// de tipo Impacto. Reglas confirmadas por Bradson:
// - Retorno: Izquierdo, Derecho, o un unico polin (sin lado) cuando la estacion trae solo uno.
// - Carga (o Impacto en correas SIN cama de impacto, ej. CV202): Izquierdo/Central/Derecho.
// - Impacto en correas CON cama de impacto (ej. CV201): las mismas 3 posiciones, mas la opcion
//   de "Cama de impacto" cuando se cambia la bandeja completa como una sola pieza.
function opcionesPosicionPolin(ubicacion, correa, tipoEstacion) {
  if (ubicacion === 'Retorno') return ['', 'Izquierdo', 'Derecho', 'Único (1 polín, sin lado)'];
  const esImpacto = /impacto/i.test(tipoEstacion || '');
  const usaCamaImpacto = esImpacto && ((SEED_DATA.correasConCamaImpacto || []).includes(correa));
  const base = ['', 'Izquierdo', 'Central', 'Derecho'];
  return usaCamaImpacto ? base.concat('Cama de impacto (agrupa la estación)') : base;
}

function polinRowHtml(p, otNum, mostrarEstacion) {
  const e = state.polinesEstado[polinKey(otNum, p.id)];
  const cambiado = e && e.estado === 'Cambiado';
  const comentario = (e && e.comentario) || '';
  const critClass = p.criticidad ? `crit-border-${p.criticidad}` : '';
  const critLabels = { 1: 'Alta', 2: 'Media', 3: 'Baja' };
  const critSymbols = { 1: '✕', 2: '❙', 3: '✓' };
  const critBadge = p.criticidad ? `<span class="crit-tag crit-${p.criticidad}">${critSymbols[p.criticidad]} ${critLabels[p.criticidad]}</span>` : '';
  const emergBadge = p.emergente ? `<span class="crit-tag" style="background:rgba(255,179,92,.2); color:var(--emergente);">EMERGENTE</span>
    <button type="button" class="btn-x-emergente" data-eliminarpolin="${p.idOriginal || p.id}" data-eliminarpolinot="${otNum}" title="Eliminar este polín emergente">✕</button>` : '';
  // La posicion se puede fijar de entrada (polin emergente) o editar despues aqui mismo
  // (polines del listado original / filas separadas por cantidad, que no traen posicion).
  const posicionActual = (e && e.posicionManual) || p.posicion || '';
  const opcionesPos = opcionesPosicionPolin(p.ubicacion, p.correa, p.tipoEstacion);
  const selectorPosicion = `<select class="polin-posicion-select" data-possel="${p.id}">${opcionesPos.map((o) =>
    `<option value="${o}" ${o === posicionActual ? 'selected' : ''}>${o || '— Posición —'}</option>`).join('')}</select>`;
  const posTag = posicionActual ? `<span class="polin-posicion-tag">${posicionActual}</span> ` : '';
  // El N° de estacion ya se muestra siempre en el mini-encabezado de arriba (sea uno solo o
  // varios agrupados) — aqui adentro de la tarjeta no se repite, solo el tipo/posicion.
  const titulo = `${posTag}${p.tipoEstacion ? p.tipoEstacion : 'Cambio'}${p.cantidad ? ' · x' + p.cantidad : ''}`;
  const descEsc = (p.descripcion || '').replace(/"/g, '&quot;');
  return `
    <div class="polin-row ${cambiado ? 'cambiado' : ''} ${critClass}" data-polinid="${p.id}">
      <div class="polin-check">${cambiado ? '✓' : ''}</div>
      <div class="polin-info">
        <div class="polin-titulo">${critBadge}${emergBadge}${titulo}</div>
        <div class="polin-desc">${p.descripcion || ''}</div>
        ${cambiado && e.turno ? `<div class="polin-meta">Cambiado en ${e.turno}${e.supervisor ? ' · ' + e.supervisor : ''}</div>` : ''}
        <label class="polin-posicion-label" onclick="event.stopPropagation()">Posición: ${selectorPosicion}</label>
        <button type="button" class="btn-agregar-posicion-grupo"
          data-otnum="${otNum}" data-correa="${p.correa || ''}" data-estacion="${p.estacion || ''}"
          data-ubicacion="${p.ubicacion || ''}" data-tipo="${p.tipoEstacion || ''}"
          data-desc="${descEsc}" data-crit="${p.criticidad || ''}" data-emerg="${p.emergente ? '1' : ''}">
          + Agregar otra posición de esta estación
        </button>
        <textarea class="polin-comentario" data-comentario="${p.id}" placeholder="Comentario: por qué se cambió o por qué no (opcional)">${comentario}</textarea>
      </div>
    </div>`;
}

// Cuando un polin viene con cantidad > 1 y sin posicion especifica (izquierdo/central/derecho),
// significa que se van a cambiar varios polines de esa estacion sin saber todavia cual es cual.
// En vez de una sola fila con "x2/x3" que esconde que son cambios independientes, se separa en
// N filas individuales (mismo N° de estacion) para que cada una se marque, comente y fotografie
// por separado — y como comparten estacion, el agrupador de renderPolinesList las junta solas
// bajo un mini-encabezado "Estación N — X cambios".
function expandirPolinesConCantidad(items) {
  const resultado = [];
  items.forEach((p) => {
    const cant = parseInt(p.cantidad, 10) || 1;
    if (cant > 1 && !p.posicion) {
      for (let i = 1; i <= cant; i++) {
        resultado.push({ ...p, id: `${p.id}::sub${i}`, cantidad: 1, idOriginal: p.id });
      }
    } else {
      resultado.push(p);
    }
  });
  return resultado;
}

// Cuando varias filas comparten la misma estacion (ej. 3 polines emergentes del mismo
// bastidor de carga), se juntan en UNA sola tarjeta con una fila compacta por posicion
// (checkbox + selector de Posicion) en vez de una tarjeta completa repetida por cada una.
// Sin fotos individuales aqui — el comentario es compartido para todo el grupo.
function polinGrupoHtml(sub, otNum) {
  const primero = sub.items[0];
  const critLabels = { 1: 'Alta', 2: 'Media', 3: 'Baja' };
  const critSymbols = { 1: '✕', 2: '❙', 3: '✓' };
  const critBadge = primero.criticidad ? `<span class="crit-tag crit-${primero.criticidad}">${critSymbols[primero.criticidad]} ${critLabels[primero.criticidad]}</span>` : '';
  const emergBadge = primero.emergente ? `<span class="crit-tag" style="background:rgba(255,179,92,.2); color:var(--emergente);">EMERGENTE</span>` : '';
  const opcionesPos = opcionesPosicionPolin(primero.ubicacion, primero.correa, primero.tipoEstacion);

  const filas = sub.items.map((p) => {
    const e = state.polinesEstado[polinKey(otNum, p.id)];
    const cambiado = e && e.estado === 'Cambiado';
    const posicionActual = (e && e.posicionManual) || p.posicion || '';
    const selector = `<select class="polin-posicion-select" data-possel="${p.id}">${opcionesPos.map((o) =>
      `<option value="${o}" ${o === posicionActual ? 'selected' : ''}>${o || '— Posición —'}</option>`).join('')}</select>`;
    const btnX = p.emergente
      ? `<button type="button" class="btn-x-emergente btn-x-emergente-mini" data-eliminarpolin="${p.idOriginal || p.id}" data-eliminarpolinot="${otNum}" title="Eliminar este polín emergente">✕</button>`
      : '';
    return `
      <div class="polin-pos-fila" data-posfila="${p.id}">
        <div class="polin-check ${cambiado ? 'marcado' : ''}" data-checkpos="${p.id}">${cambiado ? '✓' : ''}</div>
        ${selector}
        ${btnX}
      </div>`;
  }).join('');

  let comentarioComun = '';
  for (const p of sub.items) {
    const e = state.polinesEstado[polinKey(otNum, p.id)];
    if (e && e.comentario) { comentarioComun = e.comentario; break; }
  }
  const idsGrupo = sub.items.map((p) => p.id).join(',');
  const descEsc = (primero.descripcion || '').replace(/"/g, '&quot;');

  return `
    <div class="polin-row polin-grupo">
      <div class="polin-info">
        <div class="polin-titulo">${critBadge}${emergBadge}${primero.tipoEstacion || 'Cambio'} · ${sub.items.length} polines</div>
        <div class="polin-desc">${primero.descripcion || ''}</div>
        <div class="polin-posiciones-grupo">${filas}</div>
        <button type="button" class="btn-agregar-posicion-grupo"
          data-otnum="${otNum}" data-correa="${primero.correa || ''}" data-estacion="${sub.estacion || ''}"
          data-ubicacion="${primero.ubicacion || ''}" data-tipo="${primero.tipoEstacion || ''}"
          data-desc="${descEsc}" data-crit="${primero.criticidad || ''}" data-emerg="${primero.emergente ? '1' : ''}">
          + Agregar otra posición de esta estación
        </button>
        <textarea class="polin-comentario-grupo" data-comentariogrupo="${idsGrupo}" placeholder="Comentario: por qué se cambió o por qué no (opcional)">${comentarioComun}</textarea>
      </div>
    </div>`;
}

function renderPolinesList() {
  const otNum = polinesSheetOtNum;
  const wrap = document.getElementById('polinesListWrap');
  const resumen = document.getElementById('polinesResumen');
  if (!wrap || !otNum) return;
  const items = todosLosPolinesDeOt(otNum);

  if (items.length === 0) {
    wrap.innerHTML = '<div class="componentes-empty">Todavía no se cargó el listado de polines para esta OT.</div>';
    resumen.innerHTML = '';
    return;
  }

  const cambiados = items.filter((p) => {
    const e = state.polinesEstado[polinKey(otNum, p.id)];
    return e && e.estado === 'Cambiado';
  }).length;
  resumen.innerHTML = `<strong>${cambiados} / ${items.length}</strong> polines cambiados`;

  // Orden pedido: primero Carga, despues Retorno (por correa); dentro de cada grupo,
  // de menor a mayor N° de estacion. Si una misma estacion tiene mas de un cambio
  // registrado, se agrupan en una sub-lista bajo un solo encabezado "Estación N".
  const groups = {};
  items.forEach((p) => {
    const gk = (p.correa || '—') + ' · ' + (p.ubicacion || '—');
    if (!groups[gk]) groups[gk] = [];
    groups[gk].push(p);
  });

  const ordenUbicacion = { Carga: 0, Retorno: 1 };
  const groupKeys = Object.keys(groups).sort((a, b) => {
    const [correaA, ubicA] = a.split(' · ');
    const [correaB, ubicB] = b.split(' · ');
    if (correaA !== correaB) return correaA.localeCompare(correaB);
    return (ordenUbicacion[ubicA] ?? 9) - (ordenUbicacion[ubicB] ?? 9);
  });

  function numEstacion(p) {
    const m = String(p.estacion || '').match(/\d+/);
    return m ? parseInt(m[0], 10) : Infinity;
  }

  wrap.innerHTML = groupKeys.map((gk) => {
    const itemsGrupo = groups[gk].slice().sort((a, b) => {
      const na = numEstacion(a), nb = numEstacion(b);
      if (na !== nb) return na - nb;
      return String(a.estacion || '').localeCompare(String(b.estacion || ''));
    });

    // Sub-agrupa los items que comparten exactamente el mismo N° de estacion
    const subgrupos = [];
    itemsGrupo.forEach((p) => {
      const ultimo = subgrupos[subgrupos.length - 1];
      if (ultimo && String(ultimo.estacion || '') === String(p.estacion || '')) ultimo.items.push(p);
      else subgrupos.push({ estacion: p.estacion, items: [p] });
    });

    const rowsHtml = subgrupos.map((sub) => {
      const header = `<div class="polin-subestacion-header">Estación ${sub.estacion || '—'}${sub.items.length > 1 ? ' — ' + sub.items.length + ' cambios' : ''}</div>`;
      if (sub.items.length === 1) return header + polinRowHtml(sub.items[0], otNum, false);
      return header + polinGrupoHtml(sub, otNum);
    }).join('');
    return `<div class="polines-group-header">${gk}</div>${rowsHtml}`;
  }).join('');

  wrap.querySelectorAll('.polin-row:not(.polin-grupo)').forEach((row) => {
    row.addEventListener('click', () => {
      const p = items.find((x) => String(x.id) === row.dataset.polinid);
      if (p) togglePolinEstado(otNum, p);
    });
  });
  wrap.querySelectorAll('.polin-check[data-checkpos]').forEach((chk) => {
    chk.addEventListener('click', (e) => {
      e.stopPropagation();
      const p = items.find((x) => String(x.id) === chk.dataset.checkpos);
      if (p) togglePolinEstado(otNum, p);
    });
  });
  wrap.querySelectorAll('.polin-comentario-grupo').forEach((ta) => {
    ta.addEventListener('click', (e) => e.stopPropagation());
    ta.addEventListener('blur', async (e) => {
      const ids = ta.dataset.comentariogrupo.split(',');
      await Promise.all(ids.map((id) => {
        const p = items.find((x) => String(x.id) === id);
        return p ? savePolinComentario(otNum, p, e.target.value) : Promise.resolve();
      }));
    });
  });
  wrap.querySelectorAll('.btn-agregar-posicion-grupo').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      btn.disabled = true; btn.textContent = 'Agregando…';
      try {
        await agregarPolinEmergente(btn.dataset.otnum, {
          correa: btn.dataset.correa, estacion: btn.dataset.estacion, ubicacion: btn.dataset.ubicacion,
          tipoEstacion: btn.dataset.tipo, descripcion: btn.dataset.desc,
          criticidad: btn.dataset.crit ? parseInt(btn.dataset.crit, 10) : undefined,
          posicion: '', cantidad: 1,
        });
      } catch (err) { console.error(err); showToast('No se pudo agregar la posición'); }
    });
  });
  wrap.querySelectorAll('[data-eliminarpolin]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('¿Estás seguro de eliminar este polín emergente? Se borrará también su avance registrado.')) return;
      btn.disabled = true;
      try {
        await eliminarPolinEmergente(btn.dataset.eliminarpolinot, btn.dataset.eliminarpolin);
        showToast('Polín emergente eliminado');
      } catch (err) {
        console.error(err);
        showToast('No se pudo eliminar — revisa tu conexión');
        btn.disabled = false;
      }
    });
  });
  wrap.querySelectorAll('.polin-comentario').forEach((ta) => {
    ta.addEventListener('click', (e) => e.stopPropagation());
    ta.addEventListener('blur', async (e) => {
      const p = items.find((x) => String(x.id) === ta.dataset.comentario);
      if (!p) return;
      await savePolinComentario(otNum, p, e.target.value);
    });
  });
  wrap.querySelectorAll('.polin-posicion-select').forEach((sel) => {
    sel.addEventListener('click', (e) => e.stopPropagation());
    sel.addEventListener('change', async (e) => {
      const p = items.find((x) => String(x.id) === sel.dataset.possel);
      if (!p) return;
      await savePolinPosicion(otNum, p, e.target.value);
    });
  });
}

// --- Clasificacion auxiliar para el protocolo Centinela ---
const DETALLE_CATEGORIAS = [
  'Falla de rodamientos', 'Incremento de ruido', 'Incremento de vibración',
  'Incremento de temperatura', 'Otro',
];
function detalleCategoriaDe(desc) {
  const d = (desc || '').toLowerCase();
  if (d.indexOf('rodamiento') !== -1) return 1;
  if (d.indexOf('ruido') !== -1) return 2;
  if (d.indexOf('vibrac') !== -1) return 3;
  if (d.indexOf('temperatura') !== -1 || /\d+\s?°c/.test(d)) return 4;
  return 5;
}
function tipoPolinDe(p) {
  const tipo = (p.tipoEstacion || '').toLowerCase();
  if (p.ubicacion === 'Retorno') return 'PR';
  if (tipo.indexOf('impacto') !== -1) return 'PI';
  return 'PC';
}
function posicionDe(desc) {
  const d = (desc || '').toLowerCase();
  const out = [];
  if (d.indexOf('izquierd') !== -1) out.push('I');
  if (d.indexOf('central') !== -1 || d.indexOf('centro') !== -1) out.push('C');
  if (d.indexOf('derech') !== -1) out.push('D');
  return out.join('/') || '—';
}
function todosLosPolinesDeOt(otNum) {
  const base = (SEED_DATA.polinesPorOt && SEED_DATA.polinesPorOt[otNum]) || [];
  const emerg = (state.polinesEmergentes || []).filter((p) => String(p.otNum) === String(otNum));
  return expandirPolinesConCantidad(base.concat(emerg));
}

async function generatePolinesReportPdf(otNumOrList) {
  const otNums = Array.isArray(otNumOrList) ? otNumOrList : [otNumOrList];
  const esGlobal = otNums.length > 1;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, marginX = 12;
  let cy = 0, pageNum = 1;
  const C_DARK = [27, 36, 48], C_MUTED = [90, 98, 110], C_LINE = [60, 60, 60];
  const brandRGB = (window.BRANDING && window.BRANDING.colorRGB) || [76, 147, 255];
  const C_GREEN = [34, 179, 126], C_RED = [220, 50, 50];

  async function cargarLogoPolines(url) {
    if (!url) return null;
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (e) { return null; }
  }
  const [logoDataUrl, logoDimarzaDataUrl] = await Promise.all([
    cargarLogoPolines(window.BRANDING && window.BRANDING.logoURL),
    cargarLogoPolines(window.BRANDING && window.BRANDING.logoDimarzaURL),
  ]);

  function drawFooter() {
    doc.setFontSize(7); doc.setTextColor(140, 140, 140);
    doc.text('Generado automáticamente — ' + ((window.BRANDING && window.BRANDING.empresa) || 'DIMARZA'), marginX, pageH - 7);
    doc.text('Página ' + pageNum, pageW - marginX, pageH - 7, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  function newPage() { doc.addPage(); pageNum++; drawFooter(); cy = 12; }
  function ensureSpace(h) { if (cy + h > pageH - 14) newPage(); }
  function cell(x, y, w, h, txt, opts) {
    opts = opts || {};
    doc.setDrawColor(...C_LINE);
    if (opts.fill) { doc.setFillColor(...opts.fill); doc.rect(x, y, w, h, 'FD'); }
    else doc.rect(x, y, w, h);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(opts.size || 7.5);
    doc.setTextColor(...(opts.color || C_DARK));
    const align = opts.align || 'center';
    const tx = align === 'left' ? x + 1.5 : align === 'right' ? x + w - 1.5 : x + w / 2;
    const lines = doc.splitTextToSize(String(txt == null ? '' : txt), w - 3);
    doc.text(lines, tx, y + h / 2 - (lines.length - 1) * 1.3 + 1, { align, baseline: 'middle' });
    doc.setTextColor(0, 0, 0);
  }

  otNums.forEach((otNum, otIdx) => {
    if (otIdx > 0) newPage(); else cy = 12;
    const ot = allOts().find((o) => String(o.otNum) === String(otNum));
    const items = todosLosPolinesDeOt(otNum);
    const correa = (items[0] && items[0].correa) || (ot ? ot.descripcion.match(/CV\d+|FE\d+/) : null) || '—';
    const correaTxt = Array.isArray(correa) ? correa[0] : correa;

    // ---- Encabezado tipo protocolo ----
    doc.setFillColor(...C_DARK);
    doc.rect(0, 0, pageW, 22, 'F');
    if (logoDataUrl) {
      try { doc.addImage(logoDataUrl, 'PNG', pageW - 27, 2.5, 22, 11.7, undefined, 'FAST'); } catch (e) { /* ignorar */ }
    }
    if (logoDimarzaDataUrl) {
      try { doc.addImage(logoDimarzaDataUrl, 'PNG', pageW - 27, 15, 22, 5.4, undefined, 'FAST'); } catch (e) { /* ignorar */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11);
    doc.text('REGISTRO DE INSPECCIÓN Y/O CAMBIO DE POLINES', pageW / 2, 9, { align: 'center' });
    doc.setFontSize(9.5);
    doc.text(`DE CARGA, RETORNO, IMPACTO EN LA CORREA ${correaTxt}`, pageW / 2, 16, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    cy = 26;

    // ---- 1. IDENTIFICACIÓN ----
    doc.setFillColor(...brandRGB);
    doc.rect(marginX, cy, 4, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text('1. IDENTIFICACIÓN', marginX + 6, cy + 4);
    cy += 8;
    const idColW = pageW - marginX * 2;
    cell(marginX, cy, idColW * 0.18, 6, 'SERVICIO:', { align: 'left', bold: true, fill: [235, 236, 238] });
    cell(marginX + idColW * 0.18, cy, idColW * 0.62, 6, `OT ${otNum} — ${ot ? ot.descripcion : ''}`, { align: 'left' });
    cell(marginX + idColW * 0.80, cy, idColW * 0.12, 6, 'REVISIÓN:', { align: 'left', bold: true, fill: [235, 236, 238] });
    cell(marginX + idColW * 0.92, cy, idColW * 0.08, 6, '0', {});
    cy += 6;
    cell(marginX, cy, idColW * 0.18, 6, 'ÁREA:', { align: 'left', bold: true, fill: [235, 236, 238] });
    cell(marginX + idColW * 0.18, cy, idColW * 0.32, 6, ot ? ot.area : '', { align: 'left' });
    cell(marginX + idColW * 0.50, cy, idColW * 0.15, 6, 'FECHA:', { align: 'left', bold: true, fill: [235, 236, 238] });
    cell(marginX + idColW * 0.65, cy, idColW * 0.15, 6, new Date().toLocaleDateString('es-CL'), {});
    cell(marginX + idColW * 0.80, cy, idColW * 0.12, 6, 'PÁGINA:', { align: 'left', bold: true, fill: [235, 236, 238] });
    cell(marginX + idColW * 0.92, cy, idColW * 0.08, 6, String(pageNum), {});
    cy += 11;

    // ---- 2. DATOS DE POLINES ----
    doc.setFillColor(...brandRGB);
    doc.rect(marginX, cy, 4, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text(`2. DATOS DE POLINES ${correaTxt}`, marginX + 6, cy + 4);
    cy += 8;

    const cols = [
      { w: 8, label: 'ITEM' }, { w: 12, label: 'TIPO' }, { w: 16, label: 'ESTAC.' },
      { w: 12, label: 'POSIC.' }, { w: 14, label: 'INSP.' }, { w: 14, label: 'CAMBIO' },
      { w: 12, label: 'DETALLE' }, { w: 0, label: 'OBSERVACIÓN' }, // el ultimo toma el resto
    ];
    const totalFixed = cols.reduce((s, c) => s + c.w, 0);
    cols[cols.length - 1].w = idColW - totalFixed;

    function drawHeaderRow() {
      let x = marginX;
      cols.forEach((c) => { cell(x, cy, c.w, 7, c.label, { bold: true, fill: [225, 228, 232], size: 6.8 }); x += c.w; });
      cy += 7;
    }
    ensureSpace(10);
    drawHeaderRow();

    items.forEach((p, i) => {
      const rowH = 7;
      if (cy + rowH > pageH - 40) { newPage(); ensureSpace(10); drawHeaderRow(); }
      const est = state.polinesEstado[polinKey(otNum, p.id)];
      const cambiado = est && est.estado === 'Cambiado';
      const detalle = detalleCategoriaDe(p.descripcion);
      let x = marginX;
      const vals = [
        String(i + 1), tipoPolinDe(p), p.estacion || '—', posicionDe(p.descripcion),
        cambiado ? '' : '×', cambiado ? '×' : '', String(detalle),
      ];
      cols.slice(0, -1).forEach((c, ci) => {
        cell(x, cy, c.w, rowH, vals[ci], { size: 7, color: (ci === 5 && cambiado) ? C_GREEN : (ci === 4 && vals[4]) ? C_RED : C_DARK });
        x += c.w;
      });
      const obsTxt = [p.descripcion, est && est.comentario ? ('· ' + est.comentario) : ''].filter(Boolean).join(' ');
      cell(x, cy, cols[cols.length - 1].w, rowH, obsTxt, { align: 'left', size: 6.5 });
      cy += rowH;
    });
    cy += 6;

    // ---- 3. DETALLE (leyenda fija) ----
    ensureSpace(28);
    doc.setFillColor(...brandRGB);
    doc.rect(marginX, cy, 4, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text('3. DETALLE', marginX + 6, cy + 4);
    cy += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C_DARK);
    DETALLE_CATEGORIAS.forEach((c, i) => {
      doc.text(`${i + 1}.  ${c}`, marginX + 2, cy);
      cy += 4.5;
    });
    cy += 4;

    // ---- 5. CAMBIO DE POLINES (resumen) ----
    ensureSpace(30);
    doc.setFillColor(...brandRGB);
    doc.rect(marginX, cy, 4, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text('5. CAMBIO DE POLINES', marginX + 6, cy + 4);
    cy += 8;
    const porPosicion = { Carga: 0, Retorno: 0, Impacto: 0 };
    let totalCambiados = 0;
    items.forEach((p) => {
      const est = state.polinesEstado[polinKey(otNum, p.id)];
      if (est && est.estado === 'Cambiado') {
        totalCambiados++;
        const tipo = tipoPolinDe(p);
        if (tipo === 'PR') porPosicion.Retorno++;
        else if (tipo === 'PI') porPosicion.Impacto++;
        else porPosicion.Carga++;
      }
    });
    const resumenW = idColW / 2;
    ['Carga', 'Retorno', 'Impacto'].forEach((k) => {
      cell(marginX, cy, resumenW, 6, k.toUpperCase(), { align: 'left', bold: true, fill: [235, 236, 238] });
      cell(marginX + resumenW, cy, resumenW, 6, String(porPosicion[k]), {});
      cy += 6;
    });
    cell(marginX, cy, resumenW, 6.5, 'TOTAL', { align: 'left', bold: true, fill: brandRGB, color: [255, 255, 255] });
    cell(marginX + resumenW, cy, resumenW, 6.5, String(totalCambiados) + ' / ' + items.length, { bold: true, fill: brandRGB, color: [255, 255, 255] });
    cy += 12;

    // ---- 6. OBSERVACIONES ----
    ensureSpace(22);
    doc.setFillColor(...brandRGB);
    doc.rect(marginX, cy, 4, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.text('6. OBSERVACIONES', marginX + 6, cy + 4);
    cy += 8;
    const obsComentarios = items
      .map((p) => { const e = state.polinesEstado[polinKey(otNum, p.id)]; return e && e.comentario ? `#${p.estacion}: ${e.comentario}` : null; })
      .filter(Boolean);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C_DARK);
    if (obsComentarios.length === 0) {
      doc.setTextColor(...C_MUTED);
      doc.text('Sin observaciones adicionales.', marginX + 2, cy);
      cy += 10;
    } else {
      obsComentarios.forEach((t) => {
        ensureSpace(5);
        const lines = doc.splitTextToSize('• ' + t, idColW - 4);
        doc.text(lines, marginX + 2, cy);
        cy += lines.length * 4;
      });
      cy += 6;
    }

    // ---- Firmas ----
    ensureSpace(26);
    const half = idColW / 2 - 3;
    const supTipo = turnoTipoActual();
    const supNombre = getOtSupervisor(otNum, supTipo) || '';
    doc.setDrawColor(...C_LINE);
    doc.rect(marginX, cy, half, 22);
    doc.rect(marginX + idColW - half, cy, half, 22);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8);
    doc.text('SUPERVISOR DMZ', marginX + 3, cy + 5);
    doc.text('SUPERVISOR CENTINELA', marginX + idColW - half + 3, cy + 5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
    doc.text(`NOMBRE: ${supNombre}`, marginX + 3, cy + 10);
    doc.text('FIRMA:', marginX + 3, cy + 15);
    doc.text(`FECHA: ${new Date().toLocaleDateString('es-CL')}`, marginX + 3, cy + 20);
    doc.text('NOMBRE:', marginX + idColW - half + 3, cy + 10);
    doc.text('FIRMA:', marginX + idColW - half + 3, cy + 15);
    doc.text('FECHA:', marginX + idColW - half + 3, cy + 20);
    cy += 28;

    // ---- Historial completo (agregado nuestro, no viene en el protocolo original) ----
    newPage();
    doc.setFillColor(...brandRGB);
    doc.rect(marginX, cy, 4, 5, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...C_DARK);
    doc.text('HISTORIAL DE CAMBIOS (todos los turnos) — OT ' + otNum, marginX + 6, cy + 4);
    cy += 10;
    const hist = state.polinesHistorial.filter((h) => String(h.otNum) === String(otNum) && (h.estadoNuevo === 'Cambiado' || h.comentario));

    if (hist.length === 0) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(...C_MUTED);
      doc.text('Todavía no se ha registrado ningún cambio.', marginX, cy + 2);
      doc.setTextColor(0, 0, 0);
    } else {
      const histCols = [
        { w: 24, label: 'TURNO' }, { w: 20, label: 'ESTADO' }, { w: 18, label: 'ESTACIÓN' },
        { w: 20, label: 'CORREA' }, { w: 20, label: 'UBICACIÓN' }, { w: 30, label: 'SUPERVISOR' }, { w: 0, label: 'COMENTARIO' },
      ];
      const totalFixedH = histCols.reduce((s, c) => s + c.w, 0);
      histCols[histCols.length - 1].w = idColW - totalFixedH;

      function drawHistHeader() {
        let x = marginX;
        histCols.forEach((c) => { cell(x, cy, c.w, 7, c.label, { bold: true, fill: [225, 228, 232], size: 6.8 }); x += c.w; });
        cy += 7;
      }
      ensureSpace(10);
      drawHistHeader();

      const porTurno = {};
      hist.forEach((h) => { (porTurno[h.turno] = porTurno[h.turno] || []).push(h); });
      Object.keys(porTurno).forEach((turno) => {
        porTurno[turno].forEach((h) => {
          const rowH = 7;
          if (cy + rowH > pageH - 14) { newPage(); ensureSpace(10); drawHistHeader(); }
          const estadoTxt = h.estadoNuevo === 'Cambiado' ? 'CAMBIADO' : 'PENDIENTE';
          const vals = [h.turno, estadoTxt, h.estacion || '—', h.correa || '—', h.ubicacion || '—', h.supervisor || 'Sin identificar'];
          let x = marginX;
          histCols.slice(0, -1).forEach((c, ci) => {
            cell(x, cy, c.w, rowH, vals[ci], { size: 6.8, color: ci === 1 ? (h.estadoNuevo === 'Cambiado' ? C_GREEN : C_RED) : C_DARK });
            x += c.w;
          });
          cell(x, cy, histCols[histCols.length - 1].w, rowH, h.comentario || '—', { align: 'left', size: 6.5 });
          cy += rowH;
        });
      });
    }
  });

  drawFooter();
  const fname = esGlobal
    ? `Protocolo_Polines_GLOBAL_${new Date().toISOString().slice(0,10)}.pdf`
    : `Protocolo_Polines_OT${otNums[0]}_${new Date().toISOString().slice(0,10)}.pdf`;
  doc.save(fname);
}

function todasLasOtsPolines() {
  return allOts().filter((o) => esCampaniaPolines(o)).map((o) => o.otNum);
}

async function generatePolinesReportGlobalPdf() {
  const otNums = todasLasOtsPolines();
  if (otNums.length === 0) { showToast('No hay OTs de cambio de polines configuradas'); return; }
  await generatePolinesReportPdf(otNums);
}

// ============================================================
// v8: Fotos antes/despues por actividad (OT). NO aplica a
// campanias de polines (esas llevan foto por polin, ver mas abajo)
// ni a chutes/tolvas (pendiente, no implementado a proposito).
// ============================================================

state.fotosActividad = {}; // otNum -> {fotoAntesURL, fotoDespuesURL}

function fotosActividadCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('fotosActividad'); }

function listenFotosActividad() {
  fotosActividadCollection().onSnapshot((snap) => {
    state.fotosActividad = {};
    snap.forEach((doc) => { state.fotosActividad[doc.id] = doc.data(); });
    if (sheetCtx) renderFotosActividadSection(sheetCtx.otNum);
  });
}

function ensureFotosActividadSection() {
  if (document.getElementById('fotosActividadBlock')) return;
  const compBlock = document.querySelector('.componentes-block');
  if (!compBlock) return;
  const div = document.createElement('div');
  div.className = 'componentes-block';
  div.id = 'fotosActividadBlock';
  div.innerHTML = `
    <div class="componentes-block-header"><span>Fotos antes / después</span></div>
    <div class="fotos-actividad-grid">
      <div class="foto-slot" id="fotoSlotAntes">
        <div class="foto-slot-label">Antes</div>
        <div class="foto-slot-preview" id="fotoPreviewAntes"></div>
        <button type="button" class="foto-slot-btn" id="btnFotoAntes">📷 Subir foto</button>
        <input type="file" accept="image/*" capture="environment" id="inputFotoAntes" style="display:none;">
      </div>
      <div class="foto-slot" id="fotoSlotDespues">
        <div class="foto-slot-label">Después</div>
        <div class="foto-slot-preview" id="fotoPreviewDespues"></div>
        <button type="button" class="foto-slot-btn" id="btnFotoDespues">📷 Subir foto</button>
        <input type="file" accept="image/*" capture="environment" id="inputFotoDespues" style="display:none;">
      </div>
    </div>`;
  compBlock.insertAdjacentElement('afterend', div);

  document.getElementById('btnFotoAntes').addEventListener('click', () => document.getElementById('inputFotoAntes').click());
  document.getElementById('btnFotoDespues').addEventListener('click', () => document.getElementById('inputFotoDespues').click());
  document.getElementById('inputFotoAntes').addEventListener('change', (e) => {
    if (e.target.files[0] && sheetCtx) subirFotoActividad(sheetCtx.otNum, 'antes', e.target.files[0]);
  });
  document.getElementById('inputFotoDespues').addEventListener('change', (e) => {
    if (e.target.files[0] && sheetCtx) subirFotoActividad(sheetCtx.otNum, 'despues', e.target.files[0]);
  });
}

async function subirFotoActividad(otNum, tipo, file) {
  const btn = document.getElementById(tipo === 'antes' ? 'btnFotoAntes' : 'btnFotoDespues');
  if (btn) { btn.disabled = true; btn.textContent = 'Subiendo…'; }
  try {
    const storage = firebase.storage();
    const path = `paradas/${PARADA_ID}/fotosActividad/${otNum}_${tipo}_${Date.now()}_${file.name}`;
    const ref = storage.ref(path);
    await ref.put(file);
    const url = await ref.getDownloadURL();
    const campo = tipo === 'antes' ? 'fotoAntesURL' : 'fotoDespuesURL';
    await fotosActividadCollection().doc(String(otNum)).set({
      [campo]: url, updatedAt: Date.now(), supervisor: getOtSupervisor(otNum) || 'Sin identificar',
    }, { merge: true });
    showToast('Foto guardada ✓');
  } catch (e) {
    console.error(e);
    showToast('No se pudo subir la foto — revisa tu conexión');
  }
  if (btn) { btn.disabled = false; btn.textContent = '📷 Subir foto'; }
}

function renderFotosActividadSection(otNum) {
  ensureFotosActividadSection();
  const data = state.fotosActividad[otNum] || {};
  const pa = document.getElementById('fotoPreviewAntes');
  const pd = document.getElementById('fotoPreviewDespues');
  if (pa) pa.innerHTML = data.fotoAntesURL
    ? `<img src="${data.fotoAntesURL}"><button type="button" class="foto-borrar-x" data-ot="${otNum}" data-tipo="antes">✕</button>`
    : '<div class="foto-slot-empty">Sin foto</div>';
  if (pd) pd.innerHTML = data.fotoDespuesURL
    ? `<img src="${data.fotoDespuesURL}"><button type="button" class="foto-borrar-x" data-ot="${otNum}" data-tipo="despues">✕</button>`
    : '<div class="foto-slot-empty">Sin foto</div>';
  document.querySelectorAll('.foto-slot-preview .foto-borrar-x').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const campo = btn.dataset.tipo === 'antes' ? 'fotoAntesURL' : 'fotoDespuesURL';
      try {
        await fotosActividadCollection().doc(String(btn.dataset.ot)).set({ [campo]: firebase.firestore.FieldValue.delete() }, { merge: true });
        showToast('Foto eliminada');
      } catch (err) { console.error(err); showToast('No se pudo eliminar la foto'); }
    });
  });
}

// ============================================================
// v11: Pantalla de Inicio (hero a pantalla completa)
// Es la primera vista al abrir la app. Desde aqui se entra a la
// lista de actividades. Tambien se vuelve tocando los logos.
// ============================================================

function fmtFechaCorta(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' }).replace('.', '');
}

// ============================================================
// Comentario y fotos por actividad — reemplaza "Componentes cambiados"
// y "Fotos antes/después". Se guarda un registro por cada vez que se
// presiona "Guardar avance de esta actividad": comentarios en viñetas
// (una idea por línea) + fotos con su propia descripción (cámara o
// galería, a elección). Queda asociado a la OT igual que componentes.
// ============================================================

function bitacoraCollection() { return state.db.collection('paradas').doc(PARADA_ID).collection('bitacora'); }
state.bitacora = [];
let comentarioFotoRows = [];

function listenBitacora() {
  bitacoraCollection().onSnapshot((snap) => {
    state.bitacora = [];
    snap.forEach((doc) => state.bitacora.push({ id: doc.id, ...doc.data() }));
    if (sheetCtx) renderComentarioFeed(sheetCtx.otNum);
  }, (err) => console.error('bitacora error:', err));
}

function escBit(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function resetComentarioForm() {
  const ta = document.getElementById('comentarioTexto');
  if (ta) ta.value = '';
  comentarioFotoRows = [{ file: null, previewUrl: null, descripcion: '' }];
  renderComentarioFotoRows();
}

function renderComentarioFotoRows() {
  const wrap = document.getElementById('comentarioFotosWrap');
  if (!wrap) return;
  wrap.innerHTML = comentarioFotoRows.map((row, i) => `
    <div class="comentario-foto-row">
      <div class="comentario-foto-actions">
        <label class="foto-slot-btn">📷 Tomar foto<input type="file" accept="image/*" capture="environment" class="comentario-foto-input" data-i="${i}" style="display:none;"></label>
        <label class="foto-slot-btn foto-slot-btn-alt">🖼 Galería<input type="file" accept="image/*" class="comentario-foto-input" data-i="${i}" style="display:none;"></label>
        ${comentarioFotoRows.length > 1 ? `<button type="button" class="comentario-foto-remove" data-i="${i}">✕</button>` : ''}
      </div>
      ${row.previewUrl ? `<img class="comentario-foto-preview" src="${row.previewUrl}">` : ''}
      <input type="text" class="comentario-foto-desc" data-i="${i}" placeholder="Descripción de la foto" value="${escBit(row.descripcion).replace(/"/g, '&quot;')}">
    </div>`).join('');
  wrap.querySelectorAll('.comentario-foto-input').forEach((inp) => {
    inp.addEventListener('change', (e) => {
      const i = Number(inp.dataset.i);
      const file = e.target.files[0];
      if (!file) return;
      comentarioFotoRows[i].file = file;
      const reader = new FileReader();
      reader.onload = () => { comentarioFotoRows[i].previewUrl = reader.result; renderComentarioFotoRows(); };
      reader.readAsDataURL(file);
    });
  });
  wrap.querySelectorAll('.comentario-foto-desc').forEach((inp) => {
    inp.addEventListener('input', () => { comentarioFotoRows[Number(inp.dataset.i)].descripcion = inp.value; });
  });
  wrap.querySelectorAll('.comentario-foto-remove').forEach((btn) => {
    btn.addEventListener('click', () => { comentarioFotoRows.splice(Number(btn.dataset.i), 1); renderComentarioFotoRows(); });
  });
}

function renderComentarioFeed(otNum) {
  const wrap = document.getElementById('comentarioFeed');
  if (!wrap) return;
  const items = state.bitacora.filter((b) => String(b.otNum) === String(otNum))
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  if (!items.length) { wrap.innerHTML = '<div class="componentes-empty">Sin comentarios registrados para esta actividad</div>'; return; }
  wrap.innerHTML = items.map((entry) => `
    <div class="comentario-entry">
      <div class="comentario-entry-head">
        <span>${entry.fecha ? fmtFechaCorta(entry.fecha) : ''} · Turno ${escBit(entry.turnoTipo || '')}</span>
        <button type="button" class="comentario-entry-del" data-id="${entry.id}">🗑</button>
      </div>
      ${entry.bullets && entry.bullets.length ? `<ul class="comentario-entry-bullets">${entry.bullets.map((b) => `<li>${escBit(b)}</li>`).join('')}</ul>` : ''}
      ${entry.fotos && entry.fotos.length ? `<div class="comentario-entry-fotos">${entry.fotos.map((f) => `<div class="comentario-entry-foto"><img src="${f.url}" loading="lazy"><span>${escBit(f.descripcion || '')}</span></div>`).join('')}</div>` : ''}
    </div>`).join('');
  wrap.querySelectorAll('.comentario-entry-del').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('¿Eliminar este comentario?')) return;
      try { await bitacoraCollection().doc(btn.dataset.id).delete(); showToast('Comentario eliminado'); }
      catch (e) { console.error(e); showToast('No se pudo eliminar'); }
    });
  });
}

async function guardarComentarioActividad() {
  if (!sheetCtx) return;
  const ot = allOts().find((o) => o.otNum === sheetCtx.otNum);
  const bullets = (document.getElementById('comentarioTexto').value || '')
    .split('\n').map((s) => s.trim()).filter(Boolean);
  const fotosConFile = comentarioFotoRows.filter((r) => r.file);
  if (!bullets.length && !fotosConFile.length) {
    showToast('Agrega al menos un comentario o una foto antes de guardar');
    return;
  }
  const btn = document.getElementById('btnGuardarComentario');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const storage = firebase.storage();
    const fotos = [];
    for (const row of fotosConFile) {
      const path = `paradas/${PARADA_ID}/bitacora/${sheetCtx.otNum}_${Date.now()}_${row.file.name}`;
      const ref = storage.ref(path);
      await ref.put(row.file);
      const url = await ref.getDownloadURL();
      fotos.push({ url, descripcion: row.descripcion || '' });
    }
    const tIdx = turnoActualIdx();
    const tISO = SEED_DATA.turnos[tIdx] || new Date().toISOString();
    await bitacoraCollection().add({
      otNum: sheetCtx.otNum,
      otDescripcion: ot.descripcion,
      area: ot.area,
      titulo: (typeof sheetCtx.manual !== 'undefined' && sheetCtx.manual) ? ot.descripcion : `OT ${ot.otNum} — ${ot.descripcion}`,
      fecha: tISO.slice(0, 10),
      turnoTipo: turnoTipoDe(tIdx) === 'A' ? 'Día' : 'Noche',
      turnoIdx: tIdx,
      bullets,
      fotos,
      createdAt: Date.now(),
    });
    resetComentarioForm();
    showToast('Avance guardado ✓');
  } catch (e) {
    console.error(e);
    showToast('No se pudo guardar — revisa tu conexión');
  }
  btn.disabled = false; btn.textContent = 'Guardar avance de esta actividad';
}

function generarDescripcionParada() {
  const areas = [...new Set(allOts().filter((o) => o.tipo !== 'Emergente').map((o) => o.area))];
  return `Mantención mecánica de ${areas.join(', ')}.`;
}

function ensureInicioView() {
  if (document.getElementById('view-inicio')) return;
  const main = document.querySelector('main');
  if (!main) return;
  const div = document.createElement('div');
  div.className = 'view';
  div.id = 'view-inicio';
  div.innerHTML = `
    <div class="hero">
      <p class="hero-tag">WORK PACK</p>
      <h1 id="inicioTitulo">—</h1>
      <p class="hero-fechas" id="inicioFechas"></p>
      <p class="hero-desc" id="inicioDesc"></p>
      <button class="btn-entrar" id="btnEntrarLista">Lista de actividades</button>
      <button class="btn-entrar btn-entrar-secundario" id="btnVerInformes" type="button">📁 Informes</button>
      <div class="hero-secundarios">
        <a id="linkDriveCertificados" href="#" target="_blank" rel="noopener" class="btn-entrar btn-entrar-secundario">📁 Certificados aparejos</a>
        <button id="btnAddPetsInicio" type="button" class="btn-entrar btn-entrar-secundario">📄 + PETS</button>
      </div>
      <div class="hero-stats" id="inicioStats"></div>
    </div>`;
  main.appendChild(div);
  document.getElementById('btnEntrarLista').addEventListener('click', () => {
    irAVista('avance');
  });
  document.getElementById('btnAddPetsInicio').addEventListener('click', abrirModalPets);
  document.getElementById('btnVerInformes').addEventListener('click', () => {
    renderVistaInformes();
    irAVista('informes');
  });

  const linkDrive = document.getElementById('linkDriveCertificados');
  if (typeof DRIVE_CERTIFICADOS_URL !== 'undefined' && DRIVE_CERTIFICADOS_URL) {
    linkDrive.href = DRIVE_CERTIFICADOS_URL;
  } else {
    linkDrive.style.opacity = '.5';
    linkDrive.addEventListener('click', (e) => { e.preventDefault(); showToast('Aún no se ha cargado el link de Drive'); });
  }
}

function openInicioView() {
  ensureInicioView();

  const nombreCorto = SEED_DATA.paradaNombre.replace(/^SHUTDOWN\s+/i, '');
  document.getElementById('inicioTitulo').textContent = nombreCorto;

  const t0 = SEED_DATA.turnos[0];
  const t1 = SEED_DATA.turnos[SEED_DATA.turnos.length - 1];
  document.getElementById('inicioFechas').textContent =
    `${fmtFechaCorta(t0)} → ${fmtFechaCorta(t1)} ${new Date(t1).getFullYear()}`;
  document.getElementById('inicioDesc').textContent = generarDescripcionParada();

  const nOts = allOts().filter((o) => o.tipo !== 'Emergente').length;
  const nCuadrillas = (SEED_DATA.cuadrillas || []).length;
  const stats = [
    { label: 'OTs PLANIFICADAS', value: nOts },
    { label: 'HH BASE', value: SEED_DATA.totalHH },
    { label: 'CUADRILLAS', value: nCuadrillas },
    { label: 'TURNOS', value: SEED_DATA.turnos.length },
  ];
  document.getElementById('inicioStats').innerHTML = stats.map((s) => `
    <div class="hero-stat">
      <div class="hero-stat-v">${s.value}</div>
      <div class="hero-stat-l">${s.label}</div>
    </div>`).join('');

  irAVista('inicio');
}

// Cambia de vista y deja la pestaña correcta marcada
function irAVista(nombre) {
  if (nombre === 'inicio') {
    document.querySelectorAll('.sheet-backdrop').forEach((el) => el.classList.remove('open'));
    document.body.classList.remove('polines-abierto');
    document.body.classList.remove('tiene-seleccion');
    document.body.classList.remove('mobile-detalle-activo');
    document.body.classList.remove('viendo-curva-desde-detalle');
    sheetCtx = null;
    polinesSheetOtNum = null;
    state.otSeleccionada = null;
  }
  // Salir del todo del contexto de un informe (portada o lista de informes) —
  // dentro del informe (detalle/actividades/curva) el filtro se mantiene.
  if (nombre === 'inicio' || nombre === 'informes') {
    state.filtroInforme = null;
    state.informeActivo = null;
  }
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  const view = document.getElementById('view-' + nombre);
  if (view) view.classList.add('active');

  document.querySelectorAll('nav.tabs button').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === nombre);
  });

  // "en-inicio" también cubre Informes/detalle de informe: en escritorio esta
  // clase es la que apaga el layout de 3 paneles (Avance/Curva S) — sin esto,
  // esas páginas quedan tapadas por ese layout aunque su propio <div class="view">
  // sí esté activo.
  document.body.classList.toggle('en-inicio', nombre === 'inicio' || nombre === 'informes' || nombre === 'informe-detalle');

  if (nombre === 'curva') renderChart();
  if (nombre === 'avance') { renderGanttChart(); renderList(); }

  actualizarBannerFiltroInforme(nombre);

  const mainEl = document.querySelector('main');
  if (mainEl) mainEl.scrollTop = 0;
}

// Aviso fijo de "estás viendo solo las actividades de este informe", con
// salida rápida — para que no sea confuso por qué la lista/línea de tiempo
// de golpe muestra menos actividades que el total.
function actualizarBannerFiltroInforme(nombreVista) {
  let banner = document.getElementById('bannerFiltroInforme');
  const debeMostrarse = state.filtroInforme && (nombreVista === 'avance' || nombreVista === 'curva');
  if (!debeMostrarse) {
    if (banner) banner.style.display = 'none';
    return;
  }
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'bannerFiltroInforme';
    banner.className = 'banner-filtro-informe';
    document.querySelector('main').prepend(banner);
  }
  banner.style.display = 'flex';
  banner.innerHTML = `<span>📝 Viendo solo: ${escBit(state.informeActivo ? state.informeActivo.nombre : 'este informe')}</span><button type="button" id="btnSalirFiltroInforme">Salir</button>`;
  document.getElementById('btnSalirFiltroInforme').addEventListener('click', () => {
    if (state.informeActivo) { abrirInformeDetalle(state.informeActivo.id); }
    else { state.filtroInforme = null; irAVista('inicio'); }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  safeInit(() => {
    const btnToggle = document.getElementById('btnToggleHeader');
    const header = document.querySelector('header.top');
    btnToggle.addEventListener('click', () => {
      const colapsado = header.classList.toggle('header-collapsed');
      btnToggle.setAttribute('aria-expanded', colapsado ? 'false' : 'true');
      btnToggle.title = colapsado ? 'Expandir' : 'Minimizar';
    });

    // La flecha de volver y el boton de Curva S (moviles) se ubican siempre justo
    // debajo del header real — como el header se puede colapsar/expandir y su alto
    // cambia con el contenido (turno, nombre de parada, etc.), se mide en vivo en vez
    // de asumir un numero fijo.
    const actualizarAltoHeader = () => {
      document.documentElement.style.setProperty('--header-h', header.offsetHeight + 'px');
    };
    actualizarAltoHeader();
    if (window.ResizeObserver) {
      new ResizeObserver(actualizarAltoHeader).observe(header);
    } else {
      window.addEventListener('resize', actualizarAltoHeader);
    }
  }, 'toggle-header');
});


// ============================================================
// INICIALIZACION UNICA — antes eran 7 bloques DOMContentLoaded
// separados (parche sobre parche); ahora es uno solo, ordenado,
// con cada seccion protegida por su cuenta (safeInit) para que
// un error en una seccion nunca bloquee a las demas.
// ============================================================
function safeInit(fn, label) {
  try { fn(); } catch (e) { console.error('Error iniciando [' + label + ']:', e); }
}

// Registra el service worker y, si detecta que una version nueva tomo el
// control (activate + clients.claim en sw.js), recarga la pagina UNA vez
// sola. Sin esto, un usuario podia quedarse viendo una version vieja de la
// app hasta que se le ocurriera hacer un refresco forzado a mano — ahora
// la actualizacion se nota sola, sin pasos manuales.
function iniciarServiceWorkerAutoActualizable() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js')
    .then((reg) => reg.update().catch(() => {}))
    .catch(console.error);
  let yaRecargo = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (yaRecargo) return;
    yaRecargo = true;
    window.location.reload();
  });
}

document.addEventListener('DOMContentLoaded', () => {

  safeInit(() => {
    document.getElementById('paradaTitle').textContent = SEED_DATA.paradaNombre.replace(/^SHUTDOWN\s+/i, '');
    const wpIni = SEED_DATA.turnos[0];
    const wpFin = SEED_DATA.turnos[SEED_DATA.turnos.length - 1];
    document.getElementById('paradaSub').textContent =
      `${fmtFechaCorta(wpIni)} → ${fmtFechaCorta(wpFin)} · ${SEED_DATA.totalHH} HH`;
    document.getElementById('navIconList').innerHTML = ICON_LIST;
    document.getElementById('navIconChart').innerHTML = ICON_CHART;

    const now = turnoActualIdx();
    const nowIcon = SEED_DATA.turnoLabels[now].includes('07:00') ? ICON_SUN : ICON_MOON;
    const finTurnoTxt = SEED_DATA.turnos[now + 1] ? fmtDateHour(SEED_DATA.turnos[now + 1]) : SEED_DATA.turnoLabels[now];
    document.getElementById('turnoActualBadge').innerHTML = `${nowIcon}<span>Turno actual: ${SEED_DATA.turnoLabels[now]} → ${finTurnoTxt}</span>`;

    initTabs();
    renderAll();
    initFirebase();
    openInicioView(); // la app abre siempre en la pantalla de inicio

    window.addEventListener('online', () => setConn(true));
    window.addEventListener('offline', () => setConn(false));
    iniciarServiceWorkerAutoActualizable();
  }, 'principal');

  // Panel "Mantenciones": por ahora esta app solo trabaja con una mantención
  // (los datos de EMPRESA/CLIENTE/ÁREA vienen de window.BRANDING) — el panel
  // la muestra como tarjeta activa, y queda listo para cuando haya más de una.
  safeInit(() => {
    const backdrop = document.getElementById('mantencionesBackdrop');
    const btn = document.getElementById('btnMenuMantenciones');
    btn.addEventListener('click', () => {
      const b = window.BRANDING || {};
      const wpIni = SEED_DATA.turnos[0];
      const wpFin = SEED_DATA.turnos[SEED_DATA.turnos.length - 1];
      document.getElementById('listaMantenciones').innerHTML = `
        <div class="mantencion-card">
          <div class="mantencion-card-top">
            <span class="mantencion-card-nombre">${escBit(SEED_DATA.paradaNombre.replace(/^SHUTDOWN\s+/i, ''))}</span>
            <span class="mantencion-card-badge">ACTIVA</span>
          </div>
          <dl class="mantencion-card-grid">
            <dt>EMPRESA</dt><dd>${escBit(b.empresa || '—')}</dd>
            <dt>CLIENTE</dt><dd>${escBit(b.cliente || '—')}</dd>
            <dt>ÁREA</dt><dd>${escBit(b.area || '—')}</dd>
            <dt>FECHAS</dt><dd>${fmtFechaCorta(wpIni)} → ${fmtFechaCorta(wpFin)}</dd>
          </dl>
        </div>
        <p class="mantenciones-nota">Por ahora esta app trabaja con una sola mantención — cuando haya más, vas a poder elegir entre ellas aquí.</p>
      `;
      backdrop.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    });
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) { backdrop.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    });
  }, 'panel-mantenciones');

  safeInit(() => {
    async function guardarPctActual() {
      if (!sheetCtx) return;
      const pct = parseInt(document.getElementById('pctSlider').value, 10) / 100;
      try {
        if (sheetCtx.direct) {
          await saveOtAvance(sheetCtx.otNum, sheetCtx.turnoIdx, pct);
        } else {
          await saveSubAvance(sheetCtx.otNum, sheetCtx.nombre, sheetCtx.turnoIdx, pct);
        }
        showToast('Guardado ✓');
      } catch (e) {
        console.error(e);
        showToast('No se pudo guardar — revisa tu conexión');
      }
    }
    let debouncePct = null;
    document.getElementById('pctSlider').addEventListener('input', (e) => {
      document.getElementById('pctDisplay').textContent = e.target.value + '%';
      clearTimeout(debouncePct);
      debouncePct = setTimeout(guardarPctActual, 550);
    });
    document.querySelectorAll('.quick-pcts button').forEach((b) => {
      b.addEventListener('click', () => {
        document.getElementById('pctSlider').value = b.dataset.v;
        document.getElementById('pctDisplay').textContent = b.dataset.v + '%';
        clearTimeout(debouncePct);
        guardarPctActual();
      });
    });
    document.getElementById('turnoOverride').addEventListener('change', (e) => {
      if (!sheetCtx) return;
      sheetCtx.turnoIdx = parseInt(e.target.value, 10);
      const avanceMap = sheetCtx.direct ? state.liveOtAvance[sheetCtx.otNum] : getSubLive(sheetCtx.otNum, sheetCtx.nombre).avance;
      const cf = carryForward(avanceMap, sheetCtx.turnoIdx) || 0;
      const raw = (avanceMap && avanceMap[sheetCtx.turnoIdx] !== undefined) ? avanceMap[sheetCtx.turnoIdx] : cf;
      const pct = Math.round(raw * 100);
      if (sheetCtx.esLista && sheetCtx.nombre) {
        const sliderInline = document.querySelector('.pct-slider-inline');
        const displayInline = document.querySelector('.pct-display-inline');
        if (sliderInline) sliderInline.value = pct;
        if (displayInline) displayInline.textContent = pct + '%';
      } else {
        document.getElementById('pctSlider').value = pct;
        document.getElementById('pctDisplay').textContent = pct + '%';
      }
    });
    document.getElementById('estadoOtSelect').addEventListener('click', (e) => e.stopPropagation());
    document.getElementById('estadoOtSelect').addEventListener('change', async (e) => {
      if (!sheetCtx) return;
      const isCancel = e.target.value.startsWith('Cancelada');
      document.getElementById('motivoOtRow').style.display = isCancel ? 'block' : 'none';
      try {
        await saveOtEstado(sheetCtx.otNum, e.target.value);
        showToast('Estado actualizado');
      } catch (err) {
        console.error(err);
        showToast('No se pudo guardar el estado — revisa tu conexión');
      }
    });
    document.getElementById('motivoOtTextarea').addEventListener('blur', async (e) => {
      if (!sheetCtx) return;
      const limpio = limpiarComentario(e.target.value);
      e.target.value = limpio;
      const estadoSel = document.getElementById('estadoOtSelect').value;
      try {
        await saveOtEstado(sheetCtx.otNum, estadoSel, limpio);
        if (limpio) showToast('Motivo guardado');
      } catch (err) {
        console.error(err);
        showToast('No se pudo guardar el motivo — revisa tu conexión');
      }
    });
    document.getElementById('sheetBackdrop').addEventListener('click', (e) => { if (e.target.id === 'sheetBackdrop') closeSheet(); });
    document.getElementById('sheetDelete').addEventListener('click', async () => {
      if (!sheetCtx || !sheetCtx.manual) return;
      if (!confirm('¿Eliminar esta actividad emergente? Se borrará también su avance registrado.')) return;
      try {
        await deleteManualEmergente(sheetCtx.otNum);
        showToast('Emergente eliminada');
        closeSheet();
      } catch (e) {
        console.error(e);
        showToast('No se pudo eliminar — revisa tu conexión');
      }
    });
  }, 'sheet-avance');

  safeInit(() => {
    document.getElementById('ganttBack').addEventListener('click', () => {
      state.ganttSelectedOt = null;
      renderGanttChart();
    });
  }, 'gantt-back');

  safeInit(() => {
    const btn = document.getElementById('btnAddEmerg');
    const backdrop = document.getElementById('emergBackdrop');
    const areaSel = document.getElementById('emergArea');

    btn.addEventListener('click', () => {
      const areas = [...new Set(SEED_DATA.ots.map((o) => o.area))];
      areaSel.innerHTML = areas.map((a) => `<option value="${a}">${a}</option>`).join('')
        + `<option value="Emergentes registrados en terreno">Otra / General</option>`;
      document.getElementById('emergNombre').value = '';
      document.getElementById('emergHH').value = '';
      backdrop.classList.add('open');
    });
    document.getElementById('emergCancel').addEventListener('click', () => backdrop.classList.remove('open'));
    backdrop.addEventListener('click', (e) => { if (e.target.id === 'emergBackdrop') backdrop.classList.remove('open'); });
    document.getElementById('emergSave').addEventListener('click', async () => {
      const nombre = document.getElementById('emergNombre').value.trim();
      if (!nombre) { showToast('Escribe un nombre'); return; }
      const area = areaSel.value;
      const hh = parseFloat(document.getElementById('emergHH').value) || 0;
      try {
        await addManualEmergente(nombre, area, hh);
        showToast('Emergente creada ✓');
        backdrop.classList.remove('open');
      } catch (e) {
        console.error(e);
        showToast('No se pudo crear — revisa tu conexión');
      }
    });
  }, 'emergente-simple');

  safeInit(() => {
    const btn = document.getElementById('btnDownloadImagen');
    if (btn) {
      btn.addEventListener('click', async () => {
        btn.classList.add('loading');
        btn.textContent = 'Generando…';
        try {
          await generateCurvaSImagen();
        } catch (e) {
          console.error(e);
          showToast('No se pudo generar la imagen');
        }
        btn.classList.remove('loading');
        btn.textContent = '⬇ Imagen';
      });
    }
  }, 'imagen-curva-s');

  safeInit(() => {
    const btnReporte = document.getElementById('btnReporteComponentes');
    if (btnReporte) {
      btnReporte.addEventListener('click', async () => {
        btnReporte.disabled = true; btnReporte.textContent = 'Generando…';
        try {
          await generateComponentesReportPdf();
        } catch (e) {
          console.error(e);
          showToast('No se pudo generar el informe');
        }
        btnReporte.disabled = false; btnReporte.textContent = '📋 Reporte de componentes';
      });
    }
  }, 'componentes');

  safeInit(() => {
    document.getElementById('btnAddComentarioFoto').addEventListener('click', () => {
      comentarioFotoRows.push({ file: null, previewUrl: null, descripcion: '' });
      renderComentarioFotoRows();
    });
    document.getElementById('btnGuardarComentario').addEventListener('click', guardarComentarioActividad);
  }, 'comentario-actividad');

  safeInit(() => {
    document.getElementById('petsCancel').addEventListener('click', () => document.getElementById('petsBackdrop').classList.remove('open'));
    document.getElementById('petsBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'petsBackdrop') document.getElementById('petsBackdrop').classList.remove('open');
    });
    document.getElementById('petsSave').addEventListener('click', guardarPetsAdmin);
  }, 'pets-admin');

  safeInit(() => {
    document.getElementById('informeCancel').addEventListener('click', () => document.getElementById('informeBackdrop').classList.remove('open'));
    document.getElementById('informeBackdrop').addEventListener('click', (e) => {
      if (e.target.id === 'informeBackdrop') document.getElementById('informeBackdrop').classList.remove('open');
    });
    document.getElementById('informeSave').addEventListener('click', guardarInformeAdmin);
  }, 'informes-admin');

  safeInit(() => {
    document.querySelectorAll('[data-avview]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('[data-avview]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const showGantt = btn.dataset.avview === 'gantt';
        document.getElementById('ganttCard').style.display = showGantt ? 'block' : 'none';
        document.getElementById('listaWrap').style.display = showGantt ? 'none' : 'block';
        if (showGantt) renderGanttChart();
      });
    });
  }, 'toggle-lista-gantt');

  // Tocar el header/logo lleva a la pantalla de inicio — pero no si el clic fue sobre
  // alguno de los controles que viven dentro del header (informes, badge de turno),
  // porque si no, cualquier boton ahi arriba (incluido "Informe por turno") tambien
  // mandaba a inicio en vez de hacer lo suyo.
  safeInit(() => {
    document.addEventListener('click', (e) => {
      const header = e.target.closest('header.top');
      if (!header) return;
      if (e.target.closest('.turno-actual-badge, .informes-row, .eyebrow, #btnToggleHeader, #btnMenuMantenciones')) return;
      if (typeof openInicioView === 'function') openInicioView();
    });
    const headerEl = document.querySelector('header.top');
    if (headerEl) headerEl.style.cursor = 'pointer';
  }, 'header-inicio');

  // Boton "Volver a Linea de tiempo" del layout de escritorio: cierra lo que este
  // abierto (actividad normal o polines) para que la Linea de tiempo vuelva a mostrarse
  // ancha, ocupando panel izquierdo + central.
  safeInit(() => {
    const btn = document.getElementById('btnVolverLineaTiempoDesktop');
    if (!btn) return;
    btn.addEventListener('click', () => {
      closeSheet();
      const pp = document.getElementById('polinesSheetBackdrop');
      if (pp) pp.classList.remove('open');
      document.body.classList.remove('polines-abierto');
    });
  }, 'volver-linea-tiempo-desktop');

});

// ============================================================
// v12: Linea de tiempo compacta de UNA actividad, para el panel
// central. Muestra el rango planificado del Gantt, la linea de
// AHORA, y que deberia estar pasando en este momento.
// ============================================================

function ensureGanttActividadBlock() {
  if (document.getElementById('ganttActividad')) return;
  const sheet = document.querySelector('#sheetBackdrop .sheet');
  if (!sheet) return;
  const meta = document.getElementById('sheetMeta');
  const div = document.createElement('div');
  div.className = 'gantt-act-block';
  div.id = 'ganttActividad';
  if (meta && meta.parentNode) meta.insertAdjacentElement('afterend', div);
  else sheet.appendChild(div);
}

function renderGanttActividad(otNum) {
  ensureGanttActividadBlock();
  const cont = document.getElementById('ganttActividad');
  if (!cont) return;
  const ot = allOts().find((o) => String(o.otNum) === String(otNum));
  if (!ot || !ot.inicio || !ot.fin) { cont.innerHTML = ''; return; }

  // Rango: toda la parada, para que se vea donde cae esta actividad dentro del work pack
  const range = {
    start: new Date(SEED_DATA.turnos[0]),
    end: new Date(SEED_DATA.turnos[SEED_DATA.turnos.length - 1]),
  };
  const now = new Date();
  const dentro = now >= range.start && now <= range.end;
  const nowPct = xPct(now, range);

  const x0 = xPct(ot.inicio, range);
  const x1 = xPct(ot.fin, range);
  const real = otProgressAt(ot, SEED_DATA.turnoLabels.length - 1);

  // Que deberia estar pasando ahora segun el Gantt
  const ini = new Date(ot.inicio), fin = new Date(ot.fin);
  let mensaje, colorMsg;
  if (now < ini) {
    mensaje = 'Según el Gantt esta actividad aún no debería haber comenzado.';
    colorMsg = 'var(--ink-muted)';
  } else if (now > fin) {
    mensaje = real >= 0.999
      ? 'Según el Gantt esta actividad ya debería estar terminada, y lo está.'
      : `Según el Gantt ya debería estar terminada. Va en ${Math.round(real * 100)}%.`;
    colorMsg = real >= 0.999 ? 'var(--aseo)' : 'var(--cancelada)';
  } else {
    const esperado = expectedPctNow(ot, now);
    const dif = real - esperado;
    if (dif < -0.1) {
      mensaje = `Debería ir en ${Math.round(esperado * 100)}% y va en ${Math.round(real * 100)}%: atrasada.`;
      colorMsg = 'var(--cancelada)';
    } else {
      mensaje = `Debería ir en ${Math.round(esperado * 100)}% y va en ${Math.round(real * 100)}%: a tiempo.`;
      colorMsg = 'var(--aseo)';
    }
  }

  cont.innerHTML = `
    <p class="rotulo-mini">Línea de tiempo de esta actividad</p>
    ${renderGanttAxis(range)}
    <div class="gantt-act-pista">
      <div class="gantt-act-plan" style="left:${x0}%; width:${Math.max(x1 - x0, 0.6)}%;"></div>
      ${dentro ? `<div class="gantt-act-ahora" style="left:${nowPct}%;"><span class="gantt-act-ahora-label">AHORA</span></div>` : ''}
    </div>
    <p class="gantt-act-fechas">${fmtDateHour(ot.inicio)} → ${fmtDateHour(ot.fin)}</p>
    <p class="gantt-act-msg" style="color:${colorMsg}">${dentro ? '▌' : ''} ${mensaje}</p>`;
}

// ============================================================
// v13: Resumen tipo protocolo en el panel derecho (solo escritorio)
// Aparece cuando la OT abierta es una campania de polines.
// ============================================================

function ensureProtocoloPanel() {
  if (document.getElementById('protocoloPanel')) return;
  const viewCurva = document.getElementById('view-curva');
  if (!viewCurva) return;
  const div = document.createElement('div');
  div.id = 'protocoloPanel';
  div.className = 'protocolo-panel';
  div.style.display = 'none';
  viewCurva.insertBefore(div, viewCurva.firstChild);
}

function renderProtocoloPanel(otNum) {
  ensureProtocoloPanel();
  const cont = document.getElementById('protocoloPanel');
  if (!cont) return;

  if (!otNum || !esLayoutEscritorio()) { cont.style.display = 'none'; return; }
  const ot = allOts().find((o) => String(o.otNum) === String(otNum));
  if (!ot || !esCampaniaPolines(ot)) { cont.style.display = 'none'; return; }

  const items = todosLosPolinesDeOt(otNum);
  const conteo = { Carga: 0, Retorno: 0, Impacto: 0 };
  const totales = { Carga: 0, Retorno: 0, Impacto: 0 };
  items.forEach((p) => {
    const tipo = tipoPolinDe(p);
    const k = tipo === 'PR' ? 'Retorno' : (tipo === 'PI' ? 'Impacto' : 'Carga');
    totales[k]++;
    const e = state.polinesEstado[polinKey(otNum, p.id)];
    if (e && e.estado === 'Cambiado') conteo[k]++;
  });
  const cambiados = conteo.Carga + conteo.Retorno + conteo.Impacto;

  cont.style.display = 'block';
  cont.innerHTML = `
    <p class="rotulo-mini">Resumen</p>
    <table class="protocolo-tabla">
      <tr><th>Ubicación</th><th>Cambiados</th></tr>
      <tr><td>Carga</td><td>${conteo.Carga} / ${totales.Carga}</td></tr>
      <tr><td>Retorno</td><td>${conteo.Retorno} / ${totales.Retorno}</td></tr>
      <tr><td>Impacto</td><td>${conteo.Impacto} / ${totales.Impacto}</td></tr>
      <tr class="tot"><td>TOTAL</td><td>${cambiados} / ${items.length}</td></tr>
    </table>
    <button class="btn-protocolo" id="btnProtocoloPdf">Informe de polines (PDF)</button>`;

  const btn = document.getElementById('btnProtocoloPdf');
  if (btn) {
    btn.addEventListener('click', async () => {
      btn.disabled = true; btn.textContent = 'Generando…';
      try { await generatePolinesReportPdf(otNum); }
      catch (e) { console.error(e); showToast('No se pudo generar el informe'); }
      btn.disabled = false; btn.textContent = 'Informe de polines (PDF)';
    });
  }
}

// ============================================================
// v14: Supervisor A/B directo en el panel de detalle (antes solo
// vivia dentro del acordeon, que en escritorio nunca se abre)
// ============================================================

function poblarSupervisoresPanel(otNum) {
  const a = document.getElementById('sheetSupervisorA');
  const b = document.getElementById('sheetSupervisorB');
  if (a) { a.value = getOtSupervisor(otNum, 'A'); a.dataset.otnum = otNum; }
  if (b) { b.value = getOtSupervisor(otNum, 'B'); b.dataset.otnum = otNum; }
}

document.addEventListener('DOMContentLoaded', () => {
  safeInit(() => {
    document.querySelectorAll('.supervisor-input-panel').forEach((inp) => {
      inp.addEventListener('click', (e) => e.stopPropagation());
      inp.addEventListener('blur', async (e) => {
        const otNum = inp.dataset.otnum;
        const tipo = inp.dataset.turnotipo;
        if (!otNum) return;
        try {
          await saveOtSupervisor(otNum, tipo, e.target.value.trim());
          showToast('Supervisor Turno ' + tipo + ' guardado');
        } catch (err) {
          console.error(err);
          showToast('No se pudo guardar el supervisor');
        }
      });
    });
  }, 'supervisor-panel-detalle');

  // ---- Filtro por PAR de supervisores: integrado en el boton "Informe de actividades por supervisor(es)" ----
  safeInit(() => {
    const wrap = document.getElementById('btnInformeActividadesWrap');
    const arrowBtn = document.getElementById('btnSupervisorArrow');
    const dropdown = document.getElementById('supervisorDropdown');
    if (!wrap || !arrowBtn || !dropdown) return;

    function refrescarOpciones() {
      const pares = getSupervisorPares();
      dropdown.innerHTML = `<button type="button" data-idx="-1" class="${!state.filtroSupervisor ? 'activo' : ''}">Todos los supervisores</button>` +
        pares.map((p, i) => {
          const sel = mismoParSupervisor(state.filtroSupervisor, p);
          return `<button type="button" data-idx="${i}" class="${sel ? 'activo' : ''}">${p.a} - ${p.b}</button>`;
        }).join('');
      dropdown.querySelectorAll('button').forEach((b) => {
        b.addEventListener('click', () => {
          const idx = parseInt(b.dataset.idx, 10);
          state.filtroSupervisor = idx === -1 ? null : pares[idx];
          renderList();
          renderGanttChart();
          actualizarEtiquetaInformeActividades();
          dropdown.classList.remove('open');
          arrowBtn.setAttribute('aria-expanded', 'false');
          refrescarOpciones();
        });
      });
    }
    refrescarOpciones();
    actualizarEtiquetaInformeActividades();
    setInterval(refrescarOpciones, 4000); // se refresca solo cuando cambian los datos de Firebase

    arrowBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const abierto = dropdown.classList.toggle('open');
      arrowBtn.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) {
        dropdown.classList.remove('open');
        arrowBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }, 'filtro-supervisor');
});

// ============================================================
// v15: Al abrir una OT desde el panel izquierdo en escritorio,
// si tiene subactividades se muestra la LISTA (no un % unico de
// toda la OT). Si no tiene, va directo al % (comportamiento previo).
// ============================================================

function abrirDetalleOt(otNum) {
  const isManual = typeof otNum === 'string' && otNum.startsWith('M-');
  const key = isManual ? otNum : parseInt(otNum, 10);
  const ot = allOts().find((o) => o.otNum === key);
  if (!ot) return;

  if (!ot.subactividades || ot.subactividades.length === 0) {
    openSheetDirect(otNum);
    return;
  }

  activarModoDetalleMovil();
  actualizarOtActualEnBoton(key);
  sheetCtx = { otNum: key, nombre: null, turnoIdx: turnoActualIdx(), direct: true, manual: isManual, esLista: true };

  document.getElementById('sheetTitle').textContent = `OT ${ot.otNum} — ${ot.descripcion}`;
  document.getElementById('sheetMeta').textContent =
    (ot.pesoPlanHH ? `${ot.pesoPlanHH.toFixed(1)} HH estimadas` : '') +
    (ot.cuadrilla ? ' · Cuadrilla ' + cuadrillaLabel(ot.cuadrilla) : '');
  document.getElementById('sheetDelete').style.display = 'none';
  renderPetsBlock(key);
  renderEstadoOtBlock(key);

  renderGanttActividad(key);
  poblarSupervisoresPanel(key);
  resetComentarioForm();
  renderComentarioFeed(key);

  mostrarListaSubactividades(ot);
  const volverBtnL = document.getElementById('btnVolverSubs');
  if (volverBtnL) volverBtnL.style.display = 'none';

  document.body.classList.remove('polines-abierto');
  const polinesPanel = document.getElementById('polinesSheetBackdrop');
  if (polinesPanel) polinesPanel.classList.remove('open');
  renderProtocoloPanel(null);
  document.getElementById('sheetBackdrop').classList.add('open');
  document.getElementById('sheetBackdrop').classList.add('tiene-seleccion');
}

function mostrarListaSubactividades(ot) {
  document.getElementById('subListPanel').style.display = 'block';
  document.getElementById('pctDisplay').style.display = 'none';
  document.getElementById('pctSlider').style.display = 'none';
  document.querySelector('.quick-pcts').style.display = 'none';
  populateTurnoOverride(turnoActualIdx(), state.liveOtAvance[ot.otNum]);

  const cont = document.getElementById('subListRows');
  cont.innerHTML = ot.subactividades.map((s) => renderSubRow(ot, s)).join('');
  cont.querySelectorAll('.sub-row').forEach((el) => {
    el.addEventListener('click', () => {
      toggleEditorInlineSub(cont, ot, el.dataset.ot, decodeURIComponent(el.dataset.nombre), el);
    });
  });
}

// Abre (o cierra) un editor de % justo debajo de la fila de subactividad
// tocada, sin ocultar el resto de la lista.
function toggleEditorInlineSub(cont, ot, otNum, nombre, filaEl) {
  const existente = cont.querySelector('.sub-editor-inline');
  const yaEraDeEstaFila = existente && existente.dataset.nombre === nombre;
  if (existente) existente.remove();
  cont.querySelectorAll('.sub-row.abierta').forEach((r) => r.classList.remove('abierta'));
  if (yaEraDeEstaFila) {
    // Se cerró la fila: el selector de turno vuelve a reflejar la OT completa.
    sheetCtx = { otNum, nombre: null, turnoIdx: turnoActualIdx(), direct: true, manual: false, esLista: true };
    populateTurnoOverride(turnoActualIdx(), state.liveOtAvance[otNum]);
    return;
  }

  filaEl.classList.add('abierta');

  const s = ot.subactividades.find((x) => x.nombre === nombre);
  const live = getSubLive(otNum, nombre);
  const tIdx = turnoActualIdx();
  const cf = carryForward(live.avance, tIdx) || 0;
  const raw = (live.avance && live.avance[tIdx] !== undefined) ? live.avance[tIdx] : cf;
  const pctInicial = Math.round(raw * 100);

  // El turno se elige con el selector compartido de arriba (#turnoOverride, debajo de
  // Supervisor A/B) — aquí solo queda el % y los botones rápidos de esta subactividad.
  sheetCtx = { otNum, nombre, turnoIdx: tIdx, direct: false, manual: false, esLista: true };
  populateTurnoOverride(tIdx, live.avance);

  const div = document.createElement('div');
  div.className = 'sub-editor-inline';
  div.dataset.nombre = nombre;
  div.innerHTML = `
    <div class="pct-display-inline">${pctInicial}%</div>
    <input type="range" class="pct-slider-inline" min="0" max="100" step="5" value="${pctInicial}">
    <div class="quick-pcts-inline">
      <button data-v="0">0%</button><button data-v="25">25%</button><button data-v="50">50%</button>
      <button data-v="75">75%</button><button data-v="100">100%</button>
    </div>`;
  filaEl.insertAdjacentElement('afterend', div);

  async function guardarInline() {
    try {
      const turnoSel = parseInt(document.getElementById('turnoOverride').value, 10);
      await saveSubAvance(otNum, nombre, turnoSel, parseInt(slider.value, 10) / 100);
      showToast('Guardado ✓');
      const filaPct = filaEl.querySelector('.sub-pct');
      if (filaPct) filaPct.textContent = slider.value + '%';
    } catch (e) {
      console.error(e);
      showToast('No se pudo guardar — revisa tu conexión');
    }
  }

  const slider = div.querySelector('.pct-slider-inline');
  const display = div.querySelector('.pct-display-inline');
  let debounceInline = null;
  slider.addEventListener('input', (e) => {
    display.textContent = e.target.value + '%';
    clearTimeout(debounceInline);
    debounceInline = setTimeout(guardarInline, 550);
  });
  div.querySelectorAll('.quick-pcts-inline button').forEach((b) => {
    b.addEventListener('click', () => {
      slider.value = b.dataset.v; display.textContent = b.dataset.v + '%';
      clearTimeout(debounceInline);
      guardarInline();
    });
  });
}

function ocultarListaSubactividades() {
  const panel = document.getElementById('subListPanel');
  if (panel) panel.style.display = 'none';
  document.getElementById('pctDisplay').style.display = '';
  document.getElementById('pctSlider').style.display = '';
  const qp = document.querySelector('.quick-pcts');
  if (qp) qp.style.display = '';
}

// ============================================================
// v16: En celular, ver Curva S desde dentro del detalle de una
// actividad (el boton hamburguesa), y volver desde ahi al detalle.
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  safeInit(() => {
    const btnVer = document.getElementById('btnVerCurvaMovil');
    const btnVolver = document.getElementById('btnVolverDetalleMovil');
    if (!btnVer || !btnVolver) return;

    btnVer.addEventListener('click', () => {
      state.sheetCtxGuardado = sheetCtx;
      state.polinesOtGuardado = polinesSheetOtNum;
      document.getElementById('sheetBackdrop').classList.remove('open');
      const pp = document.getElementById('polinesSheetBackdrop');
      if (pp) pp.classList.remove('open');
      document.body.classList.add('viendo-curva-desde-detalle');
      irAVista('curva');
    });

    btnVolver.addEventListener('click', () => {
      document.body.classList.remove('viendo-curva-desde-detalle');
      irAVista('avance');
      if (state.polinesOtGuardado) {
        openPolinesSheet(state.polinesOtGuardado);
        state.polinesOtGuardado = null;
        return;
      }
      const ctx = state.sheetCtxGuardado;
      if (ctx) {
        if (ctx.direct) abrirDetalleOt(ctx.otNum);
        else openSheet(ctx.otNum, ctx.nombre);
      }
    });
  }, 'curva-desde-detalle-movil');
});

// ============================================================
// v17: Modo compacto de celular — al elegir una actividad, el
// panel de actividades se reduce a una columna angosta (izquierda)
// y el detalle ocupa el resto (derecha), sin ventana flotante.
// ============================================================

function activarModoDetalleMovil() {
  if (!esLayoutEscritorio()) document.body.classList.add('mobile-detalle-activo');
}

document.addEventListener('DOMContentLoaded', () => {
  safeInit(() => {
    const btn = document.getElementById('btnVolverTimeline');
    if (!btn) return;
    btn.addEventListener('click', () => {
      document.body.classList.remove('mobile-detalle-activo');
      document.getElementById('sheetBackdrop').classList.remove('open');
      const polinesPanel = document.getElementById('polinesSheetBackdrop');
      if (polinesPanel) polinesPanel.classList.remove('open');
      document.body.classList.remove('polines-abierto');
      sheetCtx = null;
      polinesSheetOtNum = null;
      state.otSeleccionada = null;
      renderList();
    });
  }, 'volver-timeline-movil');
});

// ============================================================
// v18: Botones de informes en el header — Informe de actividades
// (respeta el filtro de supervisor activo) e Informe general.
// ============================================================

// Solo el primer nombre de cada supervisor (ej. "Juan Pérez Soto" -> "Juan").
function primerNombre(nombreCompleto) {
  return (nombreCompleto || '').trim().split(/\s+/)[0] || '';
}

function actualizarEtiquetaInformeActividades() {
  const btn = document.getElementById('btnInformeActividades');
  if (!btn) return;
  const par = state.filtroSupervisor;
  btn.textContent = par
    ? `Resumen de actividades por ${primerNombre(par.a)} y ${primerNombre(par.b)}`
    : 'Resumen de actividades por supervisor';
}

document.addEventListener('DOMContentLoaded', () => {
  safeInit(() => {
    const btnAct = document.getElementById('btnInformeActividades');
    if (btnAct) {
      btnAct.addEventListener('click', async () => {
        btnAct.disabled = true; const txt = btnAct.textContent; btnAct.textContent = 'Generando…';
        try { await generateInformeActividadesImagen(state.filtroSupervisor); }
        catch (e) { console.error(e); showToast('No se pudo generar la imagen'); }
        btnAct.disabled = false; btnAct.textContent = txt;
      });
    }
  }, 'botones-informes');
});

// ---- Informe de actividades (respeta filtro de supervisor) ----
// ---- Helper compartido para dibujar UNA fila de OT en la Linea de tiempo (lo usan tanto
//      el informe de actividades como el informe por turno, para que se vean igual). ----

// Nombre de cada subactividad, centrado bajo su propio tramo. Si son varias y alguna es
// muy angosta, se le presta un poco de ancho de sus vecinos (sin invadirlas del todo). Si
// hay una sola subactividad en toda la OT, usa el ancho completo de la barra.
function dibujarNombresPorSegmento(doc, segmentos, trackX, trackW, startY, C_MUTED) {
  if (!segmentos.length) return startY;
  // Antes cada nombre se centraba sobre su propio segmento — con muchos segmentos cortos
  // seguidos, los textos se montaban entre si y quedaban ilegibles. Ahora se listan en orden
  // (numerados, de izquierda a derecha igual que los segmentos) como un solo texto que fluye
  // y se ajusta solo, sin depender de coordenadas por segmento — no puede haber superposicion.
  doc.setFont('helvetica', 'normal'); doc.setFontSize(4.6); doc.setTextColor(...C_MUTED);
  const texto = segmentos.map((seg, i) =>
    `${i + 1}) ${seg.s.nombre} (${fmtDateHour(seg.sIni).split(' ')[0]}–${fmtDateHour(seg.sFin).split(' ')[0]})`
  ).join('     ');
  const lineas = doc.splitTextToSize(texto, trackW);
  doc.text(lineas, trackX, startY + 2.2);
  doc.setTextColor(0, 0, 0);
  return startY + lineas.length * 2.6 + 2.4;
}

// Dibuja la fila completa de una OT: titulo, badge de Gantt, franja de Turno A/B, la barra
// de un solo color partida por subactividad (con el % de CADA subactividad grande adentro
// de su tramo y la hora de cada division), las lineas ROJAS de cambio de turno cruzando todo,
// la linea de AHORA, lo emergente aparte, y los nombres de cada subactividad debajo.
// Devuelve el nuevo cy. o.etiquetasExtra(ot, cy) es opcional (usado por el informe por turno).
function dibujarFilaOtLineaTiempo(doc, ot, o) {
  let cy = o.cy;
  const { trackX, trackW, px, boundaries, now, marginX, pageW, C_DARK, C_MUTED, C_LINE, C_BANDA, C_BANDB, C_ATIEMPO, C_ATRASADO, C_EMERG, badgeMini } = o;
  const ini = new Date(ot.inicio), fin = new Date(ot.fin);
  const subs = (ot.subactividades || []).slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const emergs = (SEED_DATA.complementarias || []).filter((c) => c.otRelacionada === ot.otNum);

  const real = otProgressAt(ot, SEED_DATA.turnoLabels.length - 1);
  const expected = expectedPctNow(ot, now);
  const behind = now > ini && real < expected - 0.1 && real < 0.999;
  const esEmergOt = ot.tipo === 'Emergente';
  const colorOt = esEmergOt ? C_EMERG : (behind ? C_ATRASADO : C_ATIEMPO);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); doc.setTextColor(...C_DARK);
  doc.text(`OT ${ot.otNum} — ${ot.descripcion}`, marginX, cy, { maxWidth: pageW - marginX * 2 });
  cy += 3;

  if (o.etiquetasExtra) cy = o.etiquetasExtra(ot, cy);

  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.2); doc.setTextColor(...C_MUTED);
  doc.text(`${fmtDateHour(ot.inicio)} → ${fmtDateHour(ot.fin)}`, marginX, cy);
  doc.setTextColor(0, 0, 0);
  badgeMini(pageW - marginX, cy, `De acuerdo a Gantt: ${Math.round(expected * 100)}%`, C_BANDA, [12, 68, 124]);
  cy += 6.5;

  // Barra de un solo color para toda la OT — mas alta que antes para que quepan los % adentro
  const barY = cy, barH = 6;
  doc.setFillColor(237, 237, 234); doc.roundedRect(trackX, barY, trackW, barH, 0.6, 0.6, 'F');
  const xIni = px(ini), xFin = px(fin);
  doc.setFillColor(...colorOt);
  doc.roundedRect(xIni, barY, Math.max(xFin - xIni, 0.8), barH, 0.6, 0.6, 'F');

  // Lineas ROJAS de cambio de turno (7am/7pm) — se dibujan ANTES que los textos de % para que
  // el numero quede siempre legible ENCIMA de la linea, nunca tapado por ella (antes la linea
  // se dibujaba al final y quedaba pisando el porcentaje). Ya no se repite la franja/etiqueta
  // "Turno A"/"Turno B" en cada fila — eso vive una sola vez arriba, en el eje compartido.
  boundaries.forEach((b) => {
    if (b <= ini || b >= fin) return;
    const xb = px(b);
    doc.setDrawColor(224, 65, 62); doc.setLineWidth(0.5);
    doc.setLineDashPattern([0.8, 0.6], 0);
    doc.line(xb, barY - 1.6, xb, barY + barH);
    doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(3.3); doc.setTextColor(224, 65, 62);
    doc.text(fmtDateHour(b).split(' ')[0], xb, barY - 2, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  });

  // Segmentos por subactividad: divisor blanco + hora de esa division + % de ESA subactividad
  // (se dibujan DESPUES de las lineas rojas, para quedar siempre por encima y legibles)
  const segmentos = subs.map((s) => {
    const sIni = new Date(s.inicio) < ini ? ini : new Date(s.inicio);
    const sFin = new Date(s.fin) > fin ? fin : new Date(s.fin);
    return { s, sIni, sFin, x0: px(sIni), x1: px(sFin) };
  }).filter((seg) => seg.x1 > seg.x0);

  segmentos.forEach((seg, idx) => {
    if (idx > 0) {
      // Solo la linea divisoria blanca — ya no se le pone la hora encima (con muchos
      // segmentos cortos seguidos esas horas se pisaban entre si y quedaban ilegibles;
      // la hora de cada subactividad ahora sale en la lista numerada de abajo).
      doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.6);
      doc.line(seg.x0, barY, seg.x0, barY + barH);
    }
    // Numerito en la esquina del segmento — conecta este tramo con su fila en la lista de
    // abajo (misma numeracion, de izquierda a derecha) sin tener que escribir el nombre encima.
    const anchoSeg0 = seg.x1 - seg.x0;
    if (anchoSeg0 > 3) {
      doc.setFillColor(255, 255, 255);
      doc.circle(seg.x0 + 1.6, barY + 1.5, 1.3, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(2.9); doc.setTextColor(60, 60, 60);
      doc.text(String(idx + 1), seg.x0 + 1.6, barY + 1.9, { align: 'center' });
      doc.setTextColor(0, 0, 0);
    }
    const live = getSubLive(ot.otNum, seg.s.nombre);
    const avanceSub = Math.round((carryForward(live.avance, SEED_DATA.turnoLabels.length - 1) || 0) * 100);
    const texto = `${avanceSub}%`;
    const anchoSeg = seg.x1 - seg.x0;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(5.2);
    let tw = doc.getTextWidth(texto);
    if (tw + 2 > anchoSeg) { doc.setFontSize(3.4); tw = doc.getTextWidth(texto); }
    // Chip de fondo detras del numero, para que se lea bien pase lo que pase debajo
    // (una linea roja de cambio de turno, un divisor blanco, etc.)
    try {
      if (doc.GState && doc.setGState) {
        doc.setFillColor(0, 0, 0); doc.setGState(new doc.GState({ opacity: 0.18 }));
        doc.roundedRect((seg.x0 + seg.x1) / 2 - tw / 2 - 1, barY + barH / 2 - 2.1, tw + 2, 4.2, 0.8, 0.8, 'F');
        doc.setGState(new doc.GState({ opacity: 1 }));
      }
    } catch (e) { /* si el plugin de opacidad no esta disponible, se omite el chip sin romper el resto */ }
    doc.setTextColor(255, 255, 255);
    doc.text(texto, (seg.x0 + seg.x1) / 2, barY + barH / 2 + 1.2, { align: 'center' });
    doc.setTextColor(0, 0, 0);
  });
  if (!segmentos.length) dibujarPctEnBarra(doc, xIni, xFin, barY, barH, real);

  if (now >= ini && now <= fin) {
    const xNow = px(now);
    doc.setDrawColor(26, 26, 26); doc.setLineWidth(0.5);
    doc.line(xNow, barY - 1, xNow, barY + barH + 1);
  }
  cy += barH + 1.4;

  if (emergs.length) {
    const emY = cy, emH = 1.8;
    emergs.forEach((c) => {
      const cs = new Date(c.inicio), ce = new Date(c.fin);
      if (ce < ini || cs > fin) return;
      const ex0 = px(cs < ini ? ini : cs), ex1 = px(ce > fin ? fin : ce);
      doc.setFillColor(...C_EMERG); doc.rect(ex0, emY, Math.max(ex1 - ex0, 0.8), emH, 'F');
    });
    cy += emH + 1;
  }

  cy = dibujarNombresPorSegmento(doc, segmentos, trackX, trackW, cy, C_MUTED);
  cy += 1.3;
  doc.setDrawColor(...C_LINE); doc.line(marginX, cy - 1.8, pageW - marginX, cy - 1.8);
  return cy;
}

// Escribe un % centrado DENTRO de una barra de color (blanco, negrita). Solo se usa como
// respaldo cuando una OT no tiene subactividades cargadas (caso raro).
// ---- Grafico de torta (pie) para "Cumplimiento mecanico por area" — reemplaza la barra
//      horizontal por un circulo con cunas, como pidio el usuario (imagen de referencia con
//      "OPERACIONES EJECUTADAS/EMERGENTES/NO EJECUTADAS"). Compartido por los 3 informes. ----
function dibujarCunaTorta(doc, cx, cy, r, aIni, aFin, color) {
  const pasos = Math.max(2, Math.ceil(Math.abs(aFin - aIni) / (Math.PI / 60)));
  const pts = [];
  for (let i = 0; i <= pasos; i++) {
    const a = aIni + (aFin - aIni) * (i / pasos);
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  const segs = [[pts[0][0] - cx, pts[0][1] - cy]];
  for (let i = 1; i < pts.length; i++) segs.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
  segs.push([cx - pts[pts.length - 1][0], cy - pts[pts.length - 1][1]]);
  doc.setFillColor(...color);
  doc.lines(segs, cx, cy, [1, 1], 'F', true);
}
function dibujarTortaCumplimiento(doc, cx, cy, r, categorias) {
  // categorias: [{ valor, color }] — arranca arriba (12 en punto) y avanza en sentido horario
  const total = categorias.reduce((s, c) => s + c.valor, 0) || 1;
  let angulo = -Math.PI / 2;
  categorias.forEach((c) => {
    if (c.valor <= 0) return;
    const barrido = (c.valor / total) * Math.PI * 2;
    dibujarCunaTorta(doc, cx, cy, r, angulo, angulo + barrido, c.color);
    angulo += barrido;
  });
  doc.setDrawColor(255, 255, 255); doc.setLineWidth(0.8); doc.circle(cx, cy, r, 'S');
}

function dibujarPctEnBarra(doc, x0, x1, barY, barH, real) {
  const texto = `${Math.round(real * 100)}%`;
  const anchoBarra = x1 - x0;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(5.4);
  let tw = doc.getTextWidth(texto);
  if (tw + 2.5 > anchoBarra) { doc.setFontSize(4); tw = doc.getTextWidth(texto); }
  if (tw + 2 <= anchoBarra) {
    doc.setTextColor(255, 255, 255);
    doc.text(texto, x0 + anchoBarra / 2, barY + barH / 2 + 1.1, { align: 'center' });
  } else {
    doc.setTextColor(70, 70, 70);
    doc.text(texto, x1 + 1.2, barY + barH / 2 + 1.1);
  }
  doc.setTextColor(0, 0, 0);
}

// Genera una imagen PNG nítida (no PDF) del resumen de actividades — pensada para
// compartir directo por WhatsApp/Telegram, no para imprimir. Usa el mismo dato (OTs
// filtradas por el par de supervisores) que el PDF, pero como una tarjeta compacta:
// una fila por actividad con su barra de % y estado.
async function generateInformeActividadesImagen(supervisorFiltro) {
  const ots = supervisorFiltro
    ? allOts().filter((o) => otCoincideConParSupervisor(o, supervisorFiltro))
    : allOts();
  const tIdxFinal = SEED_DATA.turnoLabels.length - 1;
  const parTxt = supervisorFiltro
    ? `${primerNombre(supervisorFiltro.a)} y ${primerNombre(supervisorFiltro.b)}`
    : 'Todos los supervisores';

  const filasHtml = ots.map((ot) => {
    const pct = Math.round(otProgressAt(ot, tIdxFinal) * 100);
    const estado = getOtEstado(ot.otNum);
    const cancelada = estado.startsWith('Cancelada');
    const supA = getOtSupervisor(ot.otNum, 'A');
    const supB = getOtSupervisor(ot.otNum, 'B');
    const supTxt = [supA, supB].filter(Boolean).join(' / ');
    const colorBarra = cancelada ? '#B0B0AA' : (ot.tipo === 'Emergente' ? '#E8862C' : (pct >= 100 ? '#1FA971' : '#1FA0A5'));
    return `
      <div style="display:flex; align-items:center; gap:14px; padding:11px 0; border-bottom:1px solid #ECECE8;">
        <div style="flex:1; min-width:0;">
          <div style="font-size:13.5px; font-weight:700; color:#1A1A2E; ${cancelada ? 'text-decoration:line-through; opacity:.55;' : ''}">OT ${ot.otNum} — ${escBit(ot.descripcion)}</div>
          <div style="font-size:11px; color:#8A8A90; margin-top:3px;">${escBit(ot.area || '')}${supTxt ? ' · ' + escBit(supTxt) : ''}</div>
        </div>
        <div style="width:130px; flex:none;">
          <div style="background:#EDEDEA; border-radius:100px; height:8px; overflow:hidden;">
            <div style="width:${pct}%; height:100%; background:${colorBarra}; border-radius:100px;"></div>
          </div>
        </div>
        <div style="width:44px; flex:none; text-align:right; font-size:13px; font-weight:800; color:#1A1A2E; font-variant-numeric:tabular-nums;">${pct}%</div>
      </div>`;
  }).join('');

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed; left:-10000px; top:0; width:720px; background:#ffffff; font-family:Arial,Helvetica,sans-serif; color:#1A1A2E; padding:30px 32px;';
  wrap.innerHTML = `
    <div style="display:flex; align-items:center; gap:12px; margin-bottom:20px;">
      <div style="width:7px; height:36px; background:#1FA0A5; border-radius:3px; flex:none;"></div>
      <div style="min-width:0;">
        <div style="font-size:10px; letter-spacing:.14em; font-weight:800; color:#1FA0A5; text-transform:uppercase;">Resumen de actividades</div>
        <div style="font-size:19px; font-weight:800; color:#1A1A2E; line-height:1.25;">${escBit(SEED_DATA.paradaNombre)}</div>
      </div>
    </div>
    <div style="font-size:12.5px; color:#4A4A55; margin-bottom:2px;">Supervisores: <b style="color:#1A1A2E;">${escBit(parTxt)}</b></div>
    <div style="font-size:11px; color:#9A9A95; margin-bottom:16px;">${ots.length} actividad(es) · Generado ${new Date().toLocaleString('es-CL')}</div>
    <div>${filasHtml || '<p style="font-size:12.5px; color:#9A9A95;">Sin actividades para este filtro.</p>'}</div>
    <div style="margin-top:20px; padding-top:12px; border-top:1px solid #ECECE8; font-size:9.5px; color:#B0B0AA; text-align:center;">Generado automáticamente — DIMARZA</div>
  `;
  document.body.appendChild(wrap);

  try {
    const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('No se pudo generar la imagen');
    const nombreArchivo = `resumen-actividades-${new Date().toISOString().slice(0, 10)}.png`;
    const file = new File([blob], nombreArchivo, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Resumen de actividades', text: parTxt });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // el usuario cerró el menú de compartir
        // si compartir falla por otra razón, cae al descargar
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nombreArchivo;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } finally {
    wrap.remove();
  }
}

async function generateInformeActividadesPdf(supervisorFiltro) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, marginX = 14;
  let cy = 20, pageNum = 1;
  const brandRGB = (window.BRANDING && window.BRANDING.colorRGB) || [255, 122, 30];
  const C_DARK = [26, 26, 46], C_MUTED = [107, 107, 117], C_LINE = [220, 220, 216];
  const parTxt = supervisorFiltro ? `${supervisorFiltro.a} y ${supervisorFiltro.b}` : '';

  function drawFooter() {
    doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
    doc.text('Generado automáticamente — ' + ((window.BRANDING && window.BRANDING.empresa) || 'DIMARZA'), marginX, pageH - 8);
    doc.text('Página ' + pageNum, pageW - marginX, pageH - 8, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  function newPage() { doc.addPage(); pageNum++; drawFooter(); cy = 18; }
  function ensureSpace(h) { if (cy + h > pageH - 14) newPage(); }

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...C_DARK);
  doc.text(supervisorFiltro ? `Informe de actividades — ${parTxt}` : 'Informe de actividades', marginX, cy);
  cy += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C_MUTED);
  doc.text(`${SEED_DATA.paradaNombre} · Generado: ${new Date().toLocaleString('es-CL')}`, marginX, cy);
  doc.setTextColor(0, 0, 0);
  cy += 10;

  const ots = supervisorFiltro
    ? allOts().filter((o) => otCoincideConParSupervisor(o, supervisorFiltro))
    : allOts();

  // ---- Línea de tiempo: va primero, con particiones de subactividades y turnos A/B.
  //      Todas las OT comparten el MISMO eje de tiempo (el de toda la parada), asi que
  //      cada barra ocupa solo la porcion de ancho que le corresponde a su duracion real
  //      — antes cada barra se estiraba a lo ancho de la hoja sin importar cuanto duraba. ----
  const C_ATIEMPO = [31, 169, 113], C_ATRASADO = [224, 65, 62], C_EMERG = [255, 179, 92];
  const C_BANDA = [230, 241, 251], C_BANDB = [243, 243, 240];
  function badgeMini(x, y, txt, bg, fg) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.2);
    const w = doc.getTextWidth(txt) + 3;
    doc.setFillColor(...bg); doc.roundedRect(x - w, y - 2.1, w, 2.9, 0.8, 0.8, 'F');
    doc.setTextColor(...fg); doc.text(txt, x - w / 2, y - 0.2, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    return w;
  }
  if (ots.length > 0) {
    const range = paradaRange();
    const rangeMs = Math.max(range.end - range.start, 1);
    const trackX = marginX, trackW = pageW - marginX * 2;
    const px = (d) => trackX + (xPct(d, range) / 100) * trackW;
    const now = new Date();
    const boundaries = SEED_DATA.turnos.map((t) => new Date(t));

    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...C_DARK);
    ensureSpace(18); doc.text('Línea de tiempo', marginX, cy);
    cy += 4.2;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.4); doc.setTextColor(...C_MUTED);
    doc.text('Turno A: 07:00–19:00 · Turno B: 19:00–07:00. Un solo color por OT según su estado; lo emergente va aparte.', marginX, cy);
    cy += 3.6;
    let lx = marginX;
    [['A tiempo', C_ATIEMPO], ['Atrasado', C_ATRASADO], ['Emergente', C_EMERG]].forEach(([label, col]) => {
      doc.setFillColor(...col); doc.rect(lx, cy - 1.7, 2, 2, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.4); doc.setTextColor(...C_MUTED);
      doc.text(label, lx + 3, cy);
      lx += doc.getTextWidth(label) + 9;
    });
    doc.setTextColor(0, 0, 0);
    cy += 4;

    // ---- Eje compartido: UNA sola fila de Turno A / Turno B para toda la parada,
    //      con los dias marcados encima — se repite al inicio de cada pagina nueva. ----
    function dibujarEjeCompartido() {
      ensureSpace(12);
      const dias = [];
      let cur = new Date(range.start); cur.setHours(0, 0, 0, 0);
      const meses = { 0: 'ene', 1: 'feb', 2: 'mar', 3: 'abr', 4: 'may', 5: 'jun', 6: 'jul', 7: 'ago', 8: 'sep', 9: 'oct', 10: 'nov', 11: 'dic' };
      while (cur <= range.end) { dias.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(4.4); doc.setTextColor(...C_MUTED);
      dias.forEach((d) => { doc.text(`${d.getDate()}-${meses[d.getMonth()]}`, px(d), cy); });
      doc.setTextColor(0, 0, 0);
      cy += 2.4;
      const bandaY = cy, bandaH = 2.6;
      for (let i = 0; i < boundaries.length - 1; i++) {
        const s = boundaries[i], e = boundaries[i + 1];
        if (e < range.start || s > range.end) continue;
        const x0 = px(s < range.start ? range.start : s), x1 = px(e > range.end ? range.end : e);
        const esDia = s.getHours() === 8;
        doc.setFillColor(...(esDia ? C_BANDA : C_BANDB));
        doc.rect(x0, bandaY, Math.max(x1 - x0, 0.2), bandaH, 'F');
        if (x1 - x0 > 6) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(3.7);
          doc.setTextColor(...(esDia ? [12, 68, 124] : [130, 130, 124]));
          doc.text(esDia ? 'Turno A' : 'Turno B', (x0 + x1) / 2, bandaY + 1.8, { align: 'center' });
        }
      }
      doc.setTextColor(0, 0, 0);
      cy += bandaH + 2;
    }
    dibujarEjeCompartido();

    ots.forEach((ot) => {
      const subs = (ot.subactividades || []).slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
      const emergs = (SEED_DATA.complementarias || []).filter((c) => c.otRelacionada === ot.otNum);
      const alturaEstim = 14 + (subs.length ? 6 : 0) + (emergs.length ? 2.5 : 0);
      if (cy + alturaEstim > pageH - 14) { newPage(); dibujarEjeCompartido(); }
      cy = dibujarFilaOtLineaTiempo(doc, ot, {
        cy, trackX, trackW, px, boundaries, now, marginX, pageW,
        C_DARK, C_MUTED, C_LINE, C_BANDA, C_BANDB, C_ATIEMPO, C_ATRASADO, C_EMERG, badgeMini,
      });
    });
    cy += 4;
  }

  const cols = [
    { w: 22, label: 'OT' }, { w: 66, label: 'Actividad' }, { w: 22, label: 'Área' },
    { w: 34, label: 'Supervisor A/B' }, { w: 15, label: 'HH' }, { w: 15, label: 'Avance' }, { w: 0, label: 'Estado' },
  ];
  const total = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w = (pageW - marginX * 2) - total;

  function cell(x, y, w, h, txt, opts) {
    opts = opts || {};
    doc.setDrawColor(...C_LINE);
    if (opts.fill) { doc.setFillColor(...opts.fill); doc.rect(x, y, w, h, 'FD'); } else doc.rect(x, y, w, h);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(opts.size || 7.5);
    doc.setTextColor(...(opts.color || C_DARK));
    const align = opts.align || 'left';
    const tx = align === 'left' ? x + 1.5 : x + w / 2;
    const lines = doc.splitTextToSize(String(txt == null ? '' : txt), w - 3);
    doc.text(lines, tx, y + h / 2 - (lines.length - 1) * 1.3 + 1, { align, baseline: 'middle' });
    doc.setTextColor(0, 0, 0);
  }
  function header() {
    let x = marginX;
    cols.forEach((c) => { cell(x, cy, c.w, 7, c.label, { bold: true, fill: [230, 230, 226], size: 7, align: 'left' }); x += c.w; });
    cy += 7;
  }
  ensureSpace(10); header();

  if (ots.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C_MUTED);
    doc.text('No hay actividades para este filtro.', marginX, cy + 4);
  }

  ots.forEach((ot) => {
    const rowH = 7;
    if (cy + rowH > pageH - 16) { newPage(); header(); }
    const pct = Math.round(otProgressAt(ot, SEED_DATA.turnoLabels.length - 1) * 100);
    const estado = getOtEstado(ot.otNum);
    const supA = getOtSupervisor(ot.otNum, 'A') || '—';
    const supB = getOtSupervisor(ot.otNum, 'B') || '—';
    let x = marginX;
    const vals = [String(ot.otNum), ot.descripcion, ot.area, `${supA} / ${supB}`, ot.pesoPlanHH ? ot.pesoPlanHH.toFixed(1) : '—', pct + '%', estado];
    cols.forEach((c, i) => { cell(x, cy, c.w, rowH, vals[i], { size: 7 }); x += c.w; });
    cy += rowH;
  });
  cy += 6;

  // ---- Cumplimiento mecanico por area: tabla OT/Descripcion/%Ejecucion + barra de
  //      cumplimiento, una seccion por cada area (CORREA 201, CORREA 202, FEEDER 207, etc.) ----
  ensureSpace(14);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...C_DARK);
  doc.text('Cumplimiento mecánico por área', marginX, cy); cy += 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
  const areasOrdenadas = [...new Set(ots.map((o) => o.area))].sort();
  areasOrdenadas.forEach((area) => {
    const otsArea = ots.filter((o) => o.area === area);
    if (!otsArea.length) return;
    ensureSpace(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...brandRGB);
    doc.text(area, marginX, cy); cy += 5;
    doc.setTextColor(0, 0, 0);

    const colsArea = [{ w: 22, label: 'OT' }, { w: 0, label: 'Descripción' }, { w: 28, label: '% Ejecución' }];
    colsArea[1].w = (pageW - marginX * 2) - colsArea[0].w - colsArea[2].w;
    function headerTablaArea() {
      let x = marginX;
      colsArea.forEach((c) => { cell(x, cy, c.w, 6, c.label, { bold: true, fill: [230, 230, 226], size: 6.5 }); x += c.w; });
      cy += 6;
    }
    ensureSpace(8); headerTablaArea();
    let nEjec = 0, nEmerg = 0, nNoEjec = 0;
    otsArea.forEach((ot) => {
      const rowH = 6;
      if (cy + rowH > pageH - 16) { newPage(); headerTablaArea(); }
      const pct = otProgressAt(ot, SEED_DATA.turnoLabels.length - 1);
      const esEmerg = ot.tipo === 'Emergente';
      let txtPct;
      if (esEmerg) { txtPct = 'EMERGENTE'; nEmerg++; }
      else {
        txtPct = Math.round(pct * 100) + '%';
        if (pct <= 0.001) nNoEjec++; else nEjec++;
      }
      let x = marginX;
      const vals2 = [String(ot.otNum), ot.descripcion, txtPct];
      colsArea.forEach((c, i) => { cell(x, cy, c.w, rowH, vals2[i], { size: 6.5, color: (esEmerg && i === 2) ? [180, 90, 20] : C_DARK }); x += c.w; });
      cy += rowH;
    });
    cy += 3;

    const totalArea = otsArea.length || 1;
    ensureSpace(26);
    const pieR = 11, pieCX = marginX + pieR + 2, pieCY = cy + pieR;
    dibujarTortaCumplimiento(doc, pieCX, pieCY, pieR, [
      { valor: nEjec, color: [47, 123, 246] },
      { valor: nEmerg, color: [150, 150, 150] },
      { valor: nNoEjec, color: [224, 65, 62] },
    ]);
    const legendX = pieCX + pieR + 8;
    let legendY = cy + 3;
    [
      ['Operaciones ejecutadas', nEjec, [47, 123, 246]],
      ['Operaciones emergentes', nEmerg, [150, 150, 150]],
      ['Operaciones no ejecutadas', nNoEjec, [224, 65, 62]],
    ].forEach(([label, val, col]) => {
      doc.setFillColor(...col); doc.rect(legendX, legendY - 2.6, 3, 3, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C_DARK);
      doc.text(`${label}: ${val} (${Math.round(val / totalArea * 100)}%)`, legendX + 5, legendY);
      legendY += 5.5;
    });
    doc.setTextColor(0, 0, 0);
    cy += pieR * 2 + 6;
  });

  drawFooter();
  const nombreArchivo = supervisorFiltro ? `Informe_Actividades_${parTxt.replace(/\s+/g,'_')}` : 'Informe_Actividades_General';
  doc.save(`${nombreArchivo}_${new Date().toISOString().slice(0,10)}.pdf`);
}

// ---- Dibuja el grafico de 4 lineas de la Curva S dentro de un PDF jsPDF ya abierto.
//      Reutilizado por el Informe General (va al inicio) y por el informe de Curva S. ----
function dibujarGraficoCurvaS(doc, data, chartX, chartY, chartW, chartH) {
  const { labels, percentPlan, percentReal, alcanceEmerg, percentRealTotal } = data;
  const n = labels.length;
  const px = (i) => chartX + (i / (n - 1)) * chartW;
  const yMax = 1.25;
  const py = (v) => chartY + (1 - v / yMax) * chartH;

  doc.setDrawColor(227, 230, 235);
  [0, 0.25, 0.5, 0.75, 1, 1.25].forEach((v) => {
    doc.line(chartX, py(v), chartX + chartW, py(v));
    doc.setFontSize(6.5); doc.setTextColor(154, 164, 178);
    doc.text(Math.round(v * 100) + '%', chartX - 2, py(v) + 1, { align: 'right' });
  });

  function drawLine(arr, color, dashed) {
    doc.setDrawColor(...color); doc.setLineWidth(0.5);
    if (dashed) doc.setLineDashPattern([1.2, 1], 0); else doc.setLineDashPattern([], 0);
    let prev = null;
    arr.forEach((v, i) => {
      if (v === null || v === undefined) { prev = null; return; }
      if (prev !== null) doc.line(px(i - 1), py(prev), px(i), py(v));
      prev = v;
    });
    doc.setLineDashPattern([], 0);
  }
  drawLine(alcanceEmerg, [47, 123, 246], true);
  drawLine(percentPlan, [47, 123, 246], false);
  drawLine(percentReal, [240, 64, 62], false);
  drawLine(percentRealTotal, [255, 159, 69], false);

  doc.setFontSize(5.5); doc.setTextColor(154, 164, 178);
  labels.forEach((lbl, i) => {
    if (i % 2 !== 0) return;
    doc.text(lbl.trim(), px(i), chartY + chartH + 6, { align: 'center', angle: 45 });
  });

  let cyOut = chartY + chartH + 16;
  const legendItems = [
    ['Plan', [47, 123, 246]], ['Real', [240, 64, 62]], ['Alcance Emergentes', [47, 123, 246]], ['Real Total', [255, 159, 69]],
  ];
  let lx = chartX;
  legendItems.forEach(([label, color]) => {
    doc.setFillColor(...color); doc.circle(lx + 1, cyOut - 1, 1, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(107, 118, 133);
    doc.text(label, lx + 4, cyOut);
    lx += doc.getTextWidth(label) + 12;
  });
  doc.setTextColor(0, 0, 0);
  return cyOut + 10;
}

// ---- Informe general (portada, curva S, resumen, actividades, componentes, emergentes, canceladas, conclusiones) ----
// ---- Informe por turno: mismo formato visual que la Linea de tiempo del informe de
//      actividades, pero filtrado a lo relevante AHORA MISMO — actividades con avance
//      real cargado (en curso de verdad) o que segun el Gantt deberian estar en curso.
//      Las que ya estan al 100% se muestran, pero siempre al final de la lista. ----
async function generateInformeTurnoPdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, marginX = 14;
  let cy = 20, pageNum = 1;
  const brandRGB = (window.BRANDING && window.BRANDING.colorRGB) || [255, 122, 30];
  const C_DARK = [26, 26, 46], C_MUTED = [107, 107, 117], C_LINE = [220, 220, 216];
  function cell(x, y, w, h, txt, opts) {
    opts = opts || {};
    doc.setDrawColor(...C_LINE);
    if (opts.fill) { doc.setFillColor(...opts.fill); doc.rect(x, y, w, h, 'FD'); } else doc.rect(x, y, w, h);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(opts.size || 7);
    doc.setTextColor(...(opts.color || C_DARK));
    const lines = doc.splitTextToSize(String(txt == null ? '' : txt), w - 3);
    doc.text(lines, x + 1.5, y + h / 2 - (lines.length - 1) * 1.2 + 1, { baseline: 'middle' });
    doc.setTextColor(0, 0, 0);
  }

  function drawFooter() {
    doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
    doc.text('Generado automáticamente — ' + ((window.BRANDING && window.BRANDING.empresa) || 'DIMARZA'), marginX, pageH - 8);
    doc.text('Página ' + pageNum, pageW - marginX, pageH - 8, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  function newPage() { doc.addPage(); pageNum++; drawFooter(); cy = 18; }
  function ensureSpace(h) { if (cy + h > pageH - 14) newPage(); }

  const now = new Date();
  const turnoTxt = SEED_DATA.turnoLabels[turnoActualIdx()];

  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.setTextColor(...C_DARK);
  doc.text('Informe por turno', marginX, cy);
  cy += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...C_MUTED);
  doc.text(`${SEED_DATA.paradaNombre} · Turno actual: ${turnoTxt} · Generado: ${new Date().toLocaleString('es-CL')}`, marginX, cy);
  doc.setTextColor(0, 0, 0);
  cy += 10;

  // Relevante ahora = tiene avance real cargado (0% < real < 100%) O el Gantt dice que
  // deberia estar en curso en este momento. Las que ya llegaron a 100% quedan al final.
  const candidatas = allOts().map((ot) => {
    const ini = new Date(ot.inicio), fin = new Date(ot.fin);
    const real = otProgressAt(ot, SEED_DATA.turnoLabels.length - 1);
    const dentroVentana = now >= ini && now <= fin;
    const enCursoReal = real > 0 && real < 0.999;
    return { ot, real, dentroVentana, enCursoReal };
  }).filter((x) => x.dentroVentana || x.enCursoReal);

  candidatas.sort((a, b) => {
    const aDone = a.real >= 0.999, bDone = b.real >= 0.999;
    if (aDone !== bDone) return aDone ? 1 : -1;
    return new Date(a.ot.inicio) - new Date(b.ot.inicio);
  });
  const ots = candidatas.map((c) => c.ot);
  const flagsPorOt = {}; candidatas.forEach((c) => { flagsPorOt[c.ot.otNum] = c; });

  if (ots.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(...C_MUTED);
    doc.text('No hay actividades en curso ni programadas para este turno en este momento.', marginX, cy);
    doc.setTextColor(0, 0, 0);
  }

  // ---- Línea de tiempo (mismo dibujo que en el informe de actividades) ----
  const C_ATIEMPO = [31, 169, 113], C_ATRASADO = [224, 65, 62], C_EMERG = [255, 179, 92];
  const C_BANDA = [230, 241, 251], C_BANDB = [243, 243, 240];
  function badgeMini(x, y, txt, bg, fg) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.2);
    const w = doc.getTextWidth(txt) + 3;
    doc.setFillColor(...bg); doc.roundedRect(x - w, y - 2.1, w, 2.9, 0.8, 0.8, 'F');
    doc.setTextColor(...fg); doc.text(txt, x - w / 2, y - 0.2, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    return w;
  }
  if (ots.length > 0) {
    const range = paradaRange();
    const trackX = marginX, trackW = pageW - marginX * 2;
    const px = (d) => trackX + (xPct(d, range) / 100) * trackW;
    const boundaries = SEED_DATA.turnos.map((t) => new Date(t));

    let lx = marginX;
    [['A tiempo', C_ATIEMPO], ['Atrasado', C_ATRASADO], ['Emergente', C_EMERG]].forEach(([label, col]) => {
      doc.setFillColor(...col); doc.rect(lx, cy - 1.7, 2, 2, 'F');
      doc.setFont('helvetica', 'normal'); doc.setFontSize(5.4); doc.setTextColor(...C_MUTED);
      doc.text(label, lx + 3, cy);
      lx += doc.getTextWidth(label) + 9;
    });
    doc.setTextColor(0, 0, 0);
    cy += 4;

    function dibujarEjeCompartido() {
      ensureSpace(12);
      const dias = [];
      let cur = new Date(range.start); cur.setHours(0, 0, 0, 0);
      const meses = { 0: 'ene', 1: 'feb', 2: 'mar', 3: 'abr', 4: 'may', 5: 'jun', 6: 'jul', 7: 'ago', 8: 'sep', 9: 'oct', 10: 'nov', 11: 'dic' };
      while (cur <= range.end) { dias.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(4.4); doc.setTextColor(...C_MUTED);
      dias.forEach((d) => { doc.text(`${d.getDate()}-${meses[d.getMonth()]}`, px(d), cy); });
      doc.setTextColor(0, 0, 0);
      cy += 2.4;
      const bandaY = cy, bandaH = 2.6;
      for (let i = 0; i < boundaries.length - 1; i++) {
        const s = boundaries[i], e = boundaries[i + 1];
        if (e < range.start || s > range.end) continue;
        const x0 = px(s < range.start ? range.start : s), x1 = px(e > range.end ? range.end : e);
        const esDia = s.getHours() === 8;
        doc.setFillColor(...(esDia ? C_BANDA : C_BANDB));
        doc.rect(x0, bandaY, Math.max(x1 - x0, 0.2), bandaH, 'F');
        if (x1 - x0 > 6) {
          doc.setFont('helvetica', 'normal'); doc.setFontSize(3.7);
          doc.setTextColor(...(esDia ? [12, 68, 124] : [130, 130, 124]));
          doc.text(esDia ? 'Turno A' : 'Turno B', (x0 + x1) / 2, bandaY + 1.8, { align: 'center' });
        }
      }
      doc.setTextColor(0, 0, 0);
      cy += bandaH + 2;
    }
    dibujarEjeCompartido();

    ots.forEach((ot) => {
      const subs = (ot.subactividades || []).slice().sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
      const emergs = (SEED_DATA.complementarias || []).filter((c) => c.otRelacionada === ot.otNum);
      const alturaEstim = 17 + (subs.length ? 6 : 0) + (emergs.length ? 2.5 : 0);
      if (cy + alturaEstim > pageH - 14) { newPage(); dibujarEjeCompartido(); }
      const f = flagsPorOt[ot.otNum];
      cy = dibujarFilaOtLineaTiempo(doc, ot, {
        cy, trackX, trackW, px, boundaries, now, marginX, pageW,
        C_DARK, C_MUTED, C_LINE, C_BANDA, C_BANDB, C_ATIEMPO, C_ATRASADO, C_EMERG, badgeMini,
        etiquetasExtra: (otx, cyx) => {
          let etx = marginX;
          if (f && f.enCursoReal) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(4.6); doc.setFillColor(234, 243, 222); doc.setTextColor(39, 80, 10);
            const t = '🔧 En curso (real)'; const w = doc.getTextWidth(t) + 3;
            doc.roundedRect(etx, cyx - 1.9, w, 2.6, 0.8, 0.8, 'F'); doc.text(t, etx + 1.5, cyx - 0.1);
            etx += w + 1.5;
          }
          if (f && f.dentroVentana) {
            doc.setFont('helvetica', 'normal'); doc.setFontSize(4.6); doc.setFillColor(230, 241, 251); doc.setTextColor(12, 68, 124);
            const t = '📅 Según Gantt'; const w = doc.getTextWidth(t) + 3;
            doc.roundedRect(etx, cyx - 1.9, w, 2.6, 0.8, 0.8, 'F'); doc.text(t, etx + 1.5, cyx - 0.1);
          }
          doc.setTextColor(0, 0, 0);
          return cyx + 3.2;
        },
      });
    });
  }

  // ---- Cumplimiento mecanico por area (mismas OT que aparecen arriba, agrupadas) ----
  if (ots.length > 0) {
    ensureSpace(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...C_DARK);
    doc.text('Cumplimiento mecánico por área', marginX, cy); cy += 8;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
    const areasOrdenadas = [...new Set(ots.map((o) => o.area))].sort();
    areasOrdenadas.forEach((area) => {
      const otsArea = ots.filter((o) => o.area === area);
      if (!otsArea.length) return;
      ensureSpace(14);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...brandRGB);
      doc.text(area, marginX, cy); cy += 5;
      doc.setTextColor(0, 0, 0);

      const colsArea = [{ w: 22, label: 'OT' }, { w: 0, label: 'Descripción' }, { w: 28, label: '% Ejecución' }];
      colsArea[1].w = (pageW - marginX * 2) - colsArea[0].w - colsArea[2].w;
      function headerTablaArea() {
        let x = marginX;
        colsArea.forEach((c) => { cell(x, cy, c.w, 6, c.label, { bold: true, fill: [230, 230, 226], size: 6.5 }); x += c.w; });
        cy += 6;
      }
      ensureSpace(8); headerTablaArea();
      let nEjec = 0, nEmerg = 0, nNoEjec = 0;
      otsArea.forEach((ot) => {
        const rowH = 6;
        if (cy + rowH > pageH - 16) { newPage(); headerTablaArea(); }
        const pct = otProgressAt(ot, SEED_DATA.turnoLabels.length - 1);
        const esEmerg = ot.tipo === 'Emergente';
        let txtPct;
        if (esEmerg) { txtPct = 'EMERGENTE'; nEmerg++; }
        else {
          txtPct = Math.round(pct * 100) + '%';
          if (pct <= 0.001) nNoEjec++; else nEjec++;
        }
        let x = marginX;
        const vals2 = [String(ot.otNum), ot.descripcion, txtPct];
        colsArea.forEach((c, i) => { cell(x, cy, c.w, rowH, vals2[i], { size: 6.5, color: (esEmerg && i === 2) ? [180, 90, 20] : C_DARK }); x += c.w; });
        cy += rowH;
      });
      cy += 3;

      const totalArea = otsArea.length || 1;
      ensureSpace(26);
      const pieR = 11, pieCX = marginX + pieR + 2, pieCY = cy + pieR;
      dibujarTortaCumplimiento(doc, pieCX, pieCY, pieR, [
        { valor: nEjec, color: [47, 123, 246] },
        { valor: nEmerg, color: [150, 150, 150] },
        { valor: nNoEjec, color: [224, 65, 62] },
      ]);
      const legendX = pieCX + pieR + 8;
      let legendY = cy + 3;
      [
        ['Operaciones ejecutadas', nEjec, [47, 123, 246]],
        ['Operaciones emergentes', nEmerg, [150, 150, 150]],
        ['Operaciones no ejecutadas', nNoEjec, [224, 65, 62]],
      ].forEach(([label, val, col]) => {
        doc.setFillColor(...col); doc.rect(legendX, legendY - 2.6, 3, 3, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C_DARK);
        doc.text(`${label}: ${val} (${Math.round(val / totalArea * 100)}%)`, legendX + 5, legendY);
        legendY += 5.5;
      });
      doc.setTextColor(0, 0, 0);
      cy += pieR * 2 + 6;
    });
  }

  drawFooter();
  doc.save(`Informe_Por_Turno_${new Date().toISOString().slice(0, 10)}_${new Date().toTimeString().slice(0, 5).replace(':', '')}.pdf`);
}

async function generateInformeGeneralPdf() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = 210, pageH = 297, marginX = 14;
  let cy = 0, pageNum = 1;
  const brandRGB = (window.BRANDING && window.BRANDING.colorRGB) || [255, 122, 30];
  const C_DARK = [26, 26, 46], C_MUTED = [107, 107, 117], C_LINE = [220, 220, 216], C_GREEN = [46, 139, 87], C_RED = [217, 48, 37];

  async function cargarLogo(url) {
    if (!url) return null;
    try {
      const resp = await fetch(url); const blob = await resp.blob();
      return await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
    } catch (e) { return null; }
  }
  const [logoCliente, logoDimarza] = await Promise.all([
    cargarLogo(window.BRANDING && window.BRANDING.logoURL),
    cargarLogo(window.BRANDING && window.BRANDING.logoDimarzaURL),
  ]);

  function drawFooter() {
    doc.setFontSize(7.5); doc.setTextColor(150, 150, 150);
    doc.text('Generado automáticamente — ' + ((window.BRANDING && window.BRANDING.empresa) || 'DIMARZA'), marginX, pageH - 8);
    doc.text('Página ' + pageNum, pageW - marginX, pageH - 8, { align: 'right' });
    doc.setTextColor(0, 0, 0);
  }
  function newPage() { doc.addPage(); pageNum++; drawFooter(); cy = 18; }
  function ensureSpace(h) { if (cy + h > pageH - 16) newPage(); }
  function seccion(titulo) {
    ensureSpace(11);
    doc.setFillColor(...brandRGB); doc.rect(marginX, cy, 3.5, 6, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11.5); doc.setTextColor(...C_DARK);
    doc.text(titulo, marginX + 6, cy + 4.6);
    cy += 10;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0, 0, 0);
  }

  // ---- Portada ----
  // Logo Centinela a la izquierda, logo Dimarza a la derecha — ambos mas grandes y legibles
  doc.setFillColor(20, 20, 20); doc.rect(0, 0, pageW, 60, 'F');
  if (logoCliente) { try { doc.addImage(logoCliente, 'PNG', marginX, 9, 34, 18.0, undefined, 'FAST'); } catch (e) {} }
  if (logoDimarza) { try { doc.addImage(logoDimarza, 'PNG', pageW - marginX - 34, 14, 34, 8.4, undefined, 'FAST'); } catch (e) {} }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...brandRGB);
  doc.text('INFORME GENERAL · WORK PACK', pageW / 2, 32, { align: 'center' });
  doc.setFontSize(20); doc.setTextColor(255, 255, 255);
  doc.text(SEED_DATA.paradaNombre.replace(/^SHUTDOWN\s+/i, ''), pageW / 2, 44, { align: 'center' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(200, 200, 200);
  const t0 = SEED_DATA.turnos[0], t1 = SEED_DATA.turnos[SEED_DATA.turnos.length - 1];
  doc.text(`${new Date(t0).toLocaleDateString('es-CL')} → ${new Date(t1).toLocaleDateString('es-CL')}`, pageW / 2, 52, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  cy = 70;

  // ---- Curva S: se muestra primero, apenas termina la portada ----
  const data = state.lastCurveData || computeCurve();
  const kpis = data.kpis;
  seccion('Curva S — Avance del Work Pack');
  ensureSpace(98);
  cy = dibujarGraficoCurvaS(doc, data, marginX, cy, pageW - marginX * 2, 74);

  // ---- Resumen ejecutivo ----
  seccion('Resumen ejecutivo');
  const resumen = [
    ['Avance final', Math.round((data.percentRealTotal[data.percentRealTotal.length - 1] || 0) * 100) + '%'],
    ['Completadas', `${kpis.nCompletadas} / ${kpis.nTotalVigentes}`],
    ['En curso', `${kpis.nEnCurso} / ${kpis.nTotalVigentes}`],
    ['Canceladas', `${kpis.nCanceladas}`],
    ['Emergentes', `${kpis.nEmergentes} act. · ${kpis.hhEmergentes.toFixed(1)} HH`],
    ['Crecimiento de alcance', (kpis.pctCrecimiento * 100).toFixed(1) + '%'],
  ];
  const colW = (pageW - marginX * 2 - 10) / 3;
  resumen.forEach((r, i) => {
    const col = i % 3, fila = Math.floor(i / 3);
    const x = marginX + col * (colW + 5), y = cy + fila * 20;
    doc.setDrawColor(...C_LINE); doc.setFillColor(248, 248, 246);
    doc.roundedRect(x, y, colW, 16, 2, 2, 'FD');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...C_MUTED);
    doc.text(r[0], x + 4, y + 6);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...C_DARK);
    doc.text(r[1], x + 4, y + 12.5);
  });
  cy += Math.ceil(resumen.length / 3) * 20 + 8;
  doc.setTextColor(0, 0, 0);

  // ---- Tabla de todas las actividades ----
  seccion('Todas las actividades');
  const cols = [
    { w: 20, label: 'OT' }, { w: 55, label: 'Actividad' }, { w: 30, label: 'Supervisor A/B' },
    { w: 14, label: 'HH' }, { w: 16, label: 'Avance' }, { w: 0, label: 'Estado' },
  ];
  const totW = cols.reduce((s, c) => s + c.w, 0);
  cols[cols.length - 1].w = (pageW - marginX * 2) - totW;
  function cell(x, y, w, h, txt, opts) {
    opts = opts || {};
    doc.setDrawColor(...C_LINE);
    if (opts.fill) { doc.setFillColor(...opts.fill); doc.rect(x, y, w, h, 'FD'); } else doc.rect(x, y, w, h);
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(opts.size || 7);
    doc.setTextColor(...(opts.color || C_DARK));
    const lines = doc.splitTextToSize(String(txt == null ? '' : txt), w - 3);
    doc.text(lines, x + 1.5, y + h / 2 - (lines.length - 1) * 1.2 + 1, { baseline: 'middle' });
    doc.setTextColor(0, 0, 0);
  }
  function headerTabla() {
    let x = marginX;
    cols.forEach((c) => { cell(x, cy, c.w, 6.5, c.label, { bold: true, fill: [230, 230, 226], size: 6.8 }); x += c.w; });
    cy += 6.5;
  }
  ensureSpace(9); headerTabla();
  allOts().forEach((ot) => {
    const rowH = 6.5;
    if (cy + rowH > pageH - 16) { newPage(); headerTabla(); }
    const pct = Math.round(otProgressAt(ot, SEED_DATA.turnoLabels.length - 1) * 100);
    const estado = getOtEstado(ot.otNum);
    const esCancel = estado.startsWith('Cancelada');
    let x = marginX;
    const vals = [String(ot.otNum), ot.descripcion, `${getOtSupervisor(ot.otNum,'A')||'—'} / ${getOtSupervisor(ot.otNum,'B')||'—'}`, ot.pesoPlanHH ? ot.pesoPlanHH.toFixed(1) : '—', pct + '%', estado];
    cols.forEach((c, i) => { cell(x, cy, c.w, rowH, vals[i], { size: 6.8, color: (i === 5 && esCancel) ? C_RED : C_DARK }); x += c.w; });
    cy += rowH;
  });
  cy += 6;

  // ---- Cumplimiento mecanico por area: tabla OT/Descripcion/%Ejecucion + barra de
  //      cumplimiento, una seccion por cada area (CORREA 201, CORREA 202, FEEDER 207, etc.) ----
  ensureSpace(14); seccion('Cumplimiento mecánico por área');
  const areasOrdenadas = [...new Set(allOts().map((o) => o.area))].sort();
  areasOrdenadas.forEach((area) => {
    const otsArea = allOts().filter((o) => o.area === area);
    if (!otsArea.length) return;
    ensureSpace(14);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(...brandRGB);
    doc.text(area, marginX, cy); cy += 5;
    doc.setTextColor(0, 0, 0);

    const colsArea = [{ w: 22, label: 'OT' }, { w: 0, label: 'Descripción' }, { w: 28, label: '% Ejecución' }];
    colsArea[1].w = (pageW - marginX * 2) - colsArea[0].w - colsArea[2].w;
    function headerTablaArea() {
      let x = marginX;
      colsArea.forEach((c) => { cell(x, cy, c.w, 6, c.label, { bold: true, fill: [230, 230, 226], size: 6.5 }); x += c.w; });
      cy += 6;
    }
    ensureSpace(8); headerTablaArea();
    let nEjec = 0, nEmerg = 0, nNoEjec = 0;
    otsArea.forEach((ot) => {
      const rowH = 6;
      if (cy + rowH > pageH - 16) { newPage(); headerTablaArea(); }
      const pct = otProgressAt(ot, SEED_DATA.turnoLabels.length - 1);
      const esEmerg = ot.tipo === 'Emergente';
      let txtPct;
      if (esEmerg) { txtPct = 'EMERGENTE'; nEmerg++; }
      else {
        txtPct = Math.round(pct * 100) + '%';
        if (pct <= 0.001) nNoEjec++; else nEjec++;
      }
      let x = marginX;
      const vals = [String(ot.otNum), ot.descripcion, txtPct];
      colsArea.forEach((c, i) => { cell(x, cy, c.w, rowH, vals[i], { size: 6.5, color: (esEmerg && i === 2) ? [180, 90, 20] : C_DARK }); x += c.w; });
      cy += rowH;
    });
    cy += 3;

    const totalArea = otsArea.length || 1;
    ensureSpace(26);
    const pieR = 11, pieCX = marginX + pieR + 2, pieCY = cy + pieR;
    dibujarTortaCumplimiento(doc, pieCX, pieCY, pieR, [
      { valor: nEjec, color: [47, 123, 246] },
      { valor: nEmerg, color: [150, 150, 150] },
      { valor: nNoEjec, color: [224, 65, 62] },
    ]);
    const legendX = pieCX + pieR + 8;
    let legendY = cy + 3;
    [
      ['Operaciones ejecutadas', nEjec, [47, 123, 246]],
      ['Operaciones emergentes', nEmerg, [150, 150, 150]],
      ['Operaciones no ejecutadas', nNoEjec, [224, 65, 62]],
    ].forEach(([label, val, col]) => {
      doc.setFillColor(...col); doc.rect(legendX, legendY - 2.6, 3, 3, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...C_DARK);
      doc.text(`${label}: ${val} (${Math.round(val / totalArea * 100)}%)`, legendX + 5, legendY);
      legendY += 5.5;
    });
    doc.setTextColor(0, 0, 0);
    cy += pieR * 2 + 6;
  });
  ensureSpace(14); seccion('Componentes retirados / cambiados por actividad');
  const compItems = state.componentes.slice().sort((a, b) =>
    (a.area || '').localeCompare(b.area || '') || String(a.otNum).localeCompare(String(b.otNum)));
  if (compItems.length === 0) {
    doc.setFontSize(9); doc.setTextColor(...C_MUTED); doc.text('No se registraron componentes retirados o cambiados.', marginX, cy + 2); cy += 8;
  } else {
    let curArea = null, curOt = null;
    for (const c of compItems) {
      if (c.area !== curArea) {
        curArea = c.area; curOt = null;
        ensureSpace(9.5);
        doc.setFillColor(...C_DARK); doc.rect(marginX, cy, pageW - marginX * 2, 6.5, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(255, 255, 255);
        doc.text(curArea || 'Sin área', marginX + 3, cy + 4.6);
        doc.setTextColor(0, 0, 0);
        cy += 9.5;
      }
      if (c.otNum !== curOt) {
        curOt = c.otNum;
        ensureSpace(7);
        doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...brandRGB);
        doc.text(`OT ${c.otNum} — ${c.otDescripcion || ''}`, marginX + 1, cy + 3.5, { maxWidth: pageW - marginX * 2 - 2 });
        doc.setTextColor(0, 0, 0);
        cy += 7;
      }
      const rowH = 16;
      ensureSpace(rowH + 3);
      doc.setDrawColor(...C_LINE); doc.setFillColor(255, 255, 255);
      doc.roundedRect(marginX, cy, pageW - marginX * 2, rowH, 1.5, 1.5, 'FD');
      let imgW = 0;
      if (c.fotoURL) {
        try {
          const dataUrl = await urlToDataURL(c.fotoURL);
          doc.addImage(dataUrl, 'JPEG', marginX + 2, cy + 2, 12, 12);
          imgW = 15;
        } catch (e) { /* si la foto no carga, seguimos sin ella */ }
      }
      const tx = marginX + 4 + imgW;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...brandRGB);
      doc.text(c.codigoSAP || 'S/COD', tx, cy + 5.5);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C_DARK);
      doc.text(c.descripcion || '', tx, cy + 10.5, { maxWidth: pageW - marginX * 2 - imgW - 40 });
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...C_MUTED);
      doc.text(`Cant: ${c.cantidad != null ? c.cantidad : '—'}`, pageW - marginX - 3, cy + 5.5, { align: 'right' });
      cy += rowH + 3;
    }
    cy += 4;
  }

  // ---- Emergentes ----
  ensureSpace(14); seccion('Actividades emergentes');
  const emergentes = allOts().filter((o) => o.tipo === 'Emergente');
  if (emergentes.length === 0) {
    doc.setFontSize(9); doc.setTextColor(...C_MUTED); doc.text('No se registraron actividades emergentes.', marginX, cy + 2); cy += 8;
  } else {
    emergentes.forEach((ot) => {
      ensureSpace(6);
      doc.setFontSize(8.5); doc.setTextColor(...C_DARK);
      doc.text(`• ${ot.descripcion} — ${ot.area} — ${(ot.pesoPlanHH||0).toFixed(1)} HH`, marginX, cy + 2);
      cy += 5.5;
    });
    cy += 4;
  }

  // ---- Canceladas con motivo ----
  ensureSpace(14); seccion('Actividades canceladas');
  const canceladas = allOts().filter((o) => getOtEstado(o.otNum).startsWith('Cancelada'));
  if (canceladas.length === 0) {
    doc.setFontSize(9); doc.setTextColor(...C_MUTED); doc.text('No hay actividades canceladas.', marginX, cy + 2); cy += 8;
  } else {
    canceladas.forEach((ot) => {
      ensureSpace(9);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...C_RED);
      doc.text(`OT ${ot.otNum} — ${ot.descripcion}`, marginX, cy + 2);
      cy += 4.5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...C_MUTED);
      const motivo = getOtMotivo(ot.otNum) || 'Sin motivo registrado';
      const lines = doc.splitTextToSize('Motivo: ' + motivo, pageW - marginX * 2 - 4);
      doc.text(lines, marginX + 3, cy + 2);
      cy += lines.length * 4 + 3;
    });
  }

  // ---- Protocolos de cambio de polines (uno por correa/feeder) ----
  const otsPolines = todasLasOtsPolines();
  if (otsPolines.length > 0) {
    newPage(); seccion('Protocolos de cambio de polines');
    otsPolines.forEach((otNum, idx) => {
      const ot = allOts().find((o) => String(o.otNum) === String(otNum));
      const items = todosLosPolinesDeOt(otNum);
      const correa = (items[0] && items[0].correa) || '—';
      const cambiados = items.filter((p) => {
        const e = state.polinesEstado[polinKey(otNum, p.id)];
        return e && e.estado === 'Cambiado';
      }).length;

      if (idx > 0) ensureSpace(16);
      doc.setFillColor(...brandRGB); doc.rect(marginX, cy, pageW - marginX * 2, 7, 'F');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(255, 255, 255);
      doc.text(`OT ${ot.otNum} — ${ot.descripcion} · Correa ${correa} · ${cambiados}/${items.length} cambiados`, marginX + 3, cy + 5, { maxWidth: pageW - marginX * 2 - 6 });
      doc.setTextColor(0, 0, 0);
      cy += 10;

      const colsP = [
        { w: 16, label: 'Estación' }, { w: 20, label: 'Crit.' }, { w: 20, label: 'Cambiado' }, { w: 0, label: 'Descripción / comentario' },
      ];
      const totP = colsP.reduce((s, c) => s + c.w, 0);
      colsP[colsP.length - 1].w = (pageW - marginX * 2) - totP;
      function cellP(x, y, w, h, txt, opts) {
        opts = opts || {};
        doc.setDrawColor(...C_LINE);
        if (opts.fill) { doc.setFillColor(...opts.fill); doc.rect(x, y, w, h, 'FD'); } else doc.rect(x, y, w, h);
        doc.setFont('helvetica', opts.bold ? 'bold' : 'normal'); doc.setFontSize(opts.size || 6.8);
        doc.setTextColor(...(opts.color || C_DARK));
        const lines = doc.splitTextToSize(String(txt == null ? '' : txt), w - 3);
        doc.text(lines, x + 1.5, y + h / 2 - (lines.length - 1) * 1.2 + 1, { baseline: 'middle' });
        doc.setTextColor(0, 0, 0);
      }
      function headerP() {
        let x = marginX;
        colsP.forEach((c) => { cellP(x, cy, c.w, 6, c.label, { bold: true, fill: [230, 230, 226], size: 6.5 }); x += c.w; });
        cy += 6;
      }
      ensureSpace(9); headerP();
      items.forEach((p) => {
        const rowH = 6;
        if (cy + rowH > pageH - 16) { newPage(); headerP(); }
        const e = state.polinesEstado[polinKey(otNum, p.id)];
        const cambiado = e && e.estado === 'Cambiado';
        const critTxt = p.criticidad === 1 ? 'Alta' : p.criticidad === 2 ? 'Media' : p.criticidad === 3 ? 'Baja' : '—';
        const desc = [p.descripcion, e && e.comentario ? '· ' + e.comentario : ''].filter(Boolean).join(' ');
        let x = marginX;
        const valsP = [p.estacion || '—', critTxt, cambiado ? 'Sí' : 'No', desc];
        colsP.forEach((c, i) => {
          cellP(x, cy, c.w, rowH, valsP[i], { size: 6.5, color: (i === 2) ? (cambiado ? C_GREEN : C_RED) : C_DARK });
          x += c.w;
        });
        cy += rowH;
      });
      cy += 6;
    });
  }

  // ---- Conclusiones automaticas ----
  newPage(); seccion('Conclusiones');
  const pctFinal = Math.round((data.percentRealTotal[data.percentRealTotal.length - 1] || 0) * 100);
  const conclusiones = [
    `Se ejecutaron ${kpis.nCompletadas} de ${kpis.nTotalVigentes} actividades planificadas, alcanzando un avance global del ${pctFinal}%.`,
    `Se registraron ${kpis.nEmergentes} actividad(es) emergente(s), sumando ${kpis.hhEmergentes.toFixed(1)} HH adicionales al plan original.`,
    `${kpis.nCanceladas} actividad(es) fueron canceladas` + (canceladas.length ? ', con motivos registrados en la sección correspondiente.' : '.'),
    `La variación neta de alcance fue de ${(kpis.netoPct >= 0 ? '+' : '')}${(kpis.netoPct * 100).toFixed(1)}%.`,
  ];
  if (otsPolines.length > 0) {
    let totPol = 0, camPol = 0;
    otsPolines.forEach((otN) => {
      const its = todosLosPolinesDeOt(otN);
      totPol += its.length;
      camPol += its.filter((p) => { const e = state.polinesEstado[polinKey(otN, p.id)]; return e && e.estado === 'Cambiado'; }).length;
    });
    conclusiones.push(`Se cambiaron ${camPol} de ${totPol} polines programados en ${otsPolines.length} correa(s)/feeder(s), detallado en la sección de protocolos.`);
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor(...C_DARK);
  conclusiones.forEach((linea) => {
    ensureSpace(10);
    const lines = doc.splitTextToSize('• ' + linea, pageW - marginX * 2 - 4);
    doc.text(lines, marginX, cy + 2);
    cy += lines.length * 5 + 3;
  });

  // ---- Firmas ----
  ensureSpace(28);
  cy += 6;
  const half = (pageW - marginX * 2) / 2 - 4;
  doc.setDrawColor(...C_LINE);
  doc.rect(marginX, cy, half, 24); doc.rect(marginX + half + 8, cy, half, 24);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.setTextColor(...C_DARK);
  doc.text('SUPERVISOR DMZ', marginX + 3, cy + 5);
  doc.text('SUPERVISOR CENTINELA', marginX + half + 11, cy + 5);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  doc.text('NOMBRE:', marginX + 3, cy + 11); doc.text('FIRMA:', marginX + 3, cy + 17); doc.text('FECHA:', marginX + 3, cy + 22);
  doc.text('NOMBRE:', marginX + half + 11, cy + 11); doc.text('FIRMA:', marginX + half + 11, cy + 17); doc.text('FECHA:', marginX + half + 11, cy + 22);

  drawFooter();
  doc.save(`Informe_General_${new Date().toISOString().slice(0,10)}.pdf`);
}

function actualizarOtActualEnBoton(otNum) {
  const el = document.getElementById('otActualEnBoton');
  if (!el) return;
  const ot = allOts().find((o) => String(o.otNum) === String(otNum));
  el.textContent = ot ? `OT ${ot.otNum} — ${ot.descripcion}` : '';
}
