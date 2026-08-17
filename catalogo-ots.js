// Catálogo COMPLETO de OT de la parada (copia 1:1 de seed-data.js de curva-s-semiva) —
// de aquí se elige, dentro de la propia página, qué OT componen ESTE informe.
// No se hardcodea la lista del informe: se guarda en Firestore (paradas/{PARADA_ID}/informes/{INFORME_ID})
// y puede cambiarse en cualquier momento desde "Editar actividades incluidas".

const CATALOGO_OTS = [
  { "otNum": 4881375, "cuadrilla": "G1", "area": "Celdas de Flotación", "descripcion": "Cajón Alimentación 322ZM301 (Equipo 41865)", "pesoPlanHH": 27, "inicio": "2026-08-13T03:00:00", "fin": "2026-08-14T06:00:00",
    "subactividades": [ { "nombre": "Instalación placas y revestimientos", "pesoHH": 27, "inicio": "2026-08-13T03:00:00", "fin": "2026-08-14T06:00:00" } ] },
  { "otNum": 4850445, "cuadrilla": "G1", "area": "Celdas de Flotación", "descripcion": "Canaleta de Alimentación Celdas de Flotación (Equipo 41866)", "pesoPlanHH": 17, "inicio": "2026-08-14T06:00:00", "fin": "2026-08-14T23:00:00",
    "subactividades": [ { "nombre": "Revisión de Canaleta por Delta de Temperatura", "pesoHH": 17, "inicio": "2026-08-14T06:00:00", "fin": "2026-08-14T23:00:00" } ] },
  { "otNum": 4693231, "cuadrilla": "G1", "area": "Celdas de Flotación", "descripcion": "Canaleta Concentrado Rougher 322LA001 (Equipo 11416)", "pesoPlanHH": 6, "inicio": "2026-08-14T23:00:00", "fin": "2026-08-15T05:00:00",
    "subactividades": [ { "nombre": "Inspección de Canaleta Rougher 322LA001", "pesoHH": 6, "inicio": "2026-08-14T23:00:00", "fin": "2026-08-15T05:00:00" } ] },
  { "otNum": 4833617, "cuadrilla": "G1", "area": "Celdas de Flotación", "descripcion": "Canaleta de Concentrado Scavenger 324LA001 (Equipo 11363)", "pesoPlanHH": 6, "inicio": "2026-08-15T05:00:00", "fin": "2026-08-15T11:00:00",
    "subactividades": [ { "nombre": "Inspección de Canaleta Scavenger 324LA001", "pesoHH": 6, "inicio": "2026-08-15T05:00:00", "fin": "2026-08-15T11:00:00" } ] },
  { "otNum": 4833615, "cuadrilla": "G1", "area": "Celdas de Flotación", "descripcion": "Canaleta Colectora Colas 320LA001 (Equipo 5218)", "pesoPlanHH": 5, "inicio": "2026-08-15T11:00:00", "fin": "2026-08-15T16:00:00",
    "subactividades": [ { "nombre": "Inspección de Canaleta de Relaves 320LA001", "pesoHH": 5, "inicio": "2026-08-15T11:00:00", "fin": "2026-08-15T16:00:00" } ] },
  { "otNum": 4801324, "cuadrilla": "G2", "area": "Celdas de Flotación", "descripcion": "Cortador Muestra 322CU001 Flotación Primaria Rougher (Equipo 11364)", "pesoPlanHH": 10, "inicio": "2026-08-14T01:00:00", "fin": "2026-08-15T17:00:00",
    "subactividades": [
      { "nombre": "Apertura de equipo para su inspección", "pesoHH": 1, "inicio": "2026-08-14T01:00:00", "fin": "2026-08-14T02:00:00" },
      { "nombre": "Inspección de componentes", "pesoHH": 8, "inicio": "2026-08-14T04:00:00", "fin": "2026-08-14T12:00:00" },
      { "nombre": "Cierre de equipo", "pesoHH": 1, "inicio": "2026-08-15T16:00:00", "fin": "2026-08-15T17:00:00" }
    ] },
  { "otNum": 4801325, "cuadrilla": "G2", "area": "Celdas de Flotación", "descripcion": "Cortador Muestra 322CU002 Flotación Secundaria Rougher (Equipo 11365)", "pesoPlanHH": 11, "inicio": "2026-08-14T12:00:00", "fin": "2026-08-15T17:00:00",
    "subactividades": [
      { "nombre": "Apertura de equipo para su inspección", "pesoHH": 1, "inicio": "2026-08-14T12:00:00", "fin": "2026-08-14T13:00:00" },
      { "nombre": "Inspección de componentes", "pesoHH": 9, "inicio": "2026-08-14T13:00:00", "fin": "2026-08-14T22:00:00" },
      { "nombre": "Cierre de equipo", "pesoHH": 1, "inicio": "2026-08-15T16:00:00", "fin": "2026-08-15T17:00:00" }
    ] },
  { "otNum": 4872572, "cuadrilla": "G2", "area": "Celdas de Flotación", "descripcion": "Cortador Muestra 324CU005 Flotación Primaria Scavenger (Equipo 11368)", "pesoPlanHH": 11, "inicio": "2026-08-14T22:00:00", "fin": "2026-08-15T17:00:00",
    "subactividades": [
      { "nombre": "Apertura de equipo para su inspección", "pesoHH": 1, "inicio": "2026-08-14T22:00:00", "fin": "2026-08-14T23:00:00" },
      { "nombre": "Inspección de componentes", "pesoHH": 9, "inicio": "2026-08-14T23:00:00", "fin": "2026-08-15T08:00:00" },
      { "nombre": "Cierre de equipo", "pesoHH": 1, "inicio": "2026-08-15T16:00:00", "fin": "2026-08-15T17:00:00" }
    ] },
  { "otNum": 4872574, "cuadrilla": "G2", "area": "Celdas de Flotación", "descripcion": "Cortador Muestra 324CU006 Flotación Secundaria Scavenger (Equipo 11369)", "pesoPlanHH": 9, "inicio": "2026-08-15T08:00:00", "fin": "2026-08-15T17:00:00",
    "subactividades": [
      { "nombre": "Apertura de equipo para su inspección", "pesoHH": 1, "inicio": "2026-08-15T08:00:00", "fin": "2026-08-15T09:00:00" },
      { "nombre": "Inspección de componentes", "pesoHH": 7, "inicio": "2026-08-15T09:00:00", "fin": "2026-08-15T16:00:00" },
      { "nombre": "Cierre de equipo", "pesoHH": 1, "inicio": "2026-08-15T16:00:00", "fin": "2026-08-15T17:00:00" }
    ] },
  { "otNum": 4529387, "cuadrilla": "G2", "area": "Celdas de Flotación", "descripcion": "Cortador Muestra 324CU001 Celda Columnar (Equipo 11373)", "pesoPlanHH": 23, "inicio": "2026-08-12T15:00:00", "fin": "2026-08-15T17:00:00",
    "subactividades": [
      { "nombre": "Apertura de equipo para su inspección", "pesoHH": 1, "inicio": "2026-08-12T15:00:00", "fin": "2026-08-12T16:00:00" },
      { "nombre": "Instalación cajón en contador de muestra", "pesoHH": 16, "inicio": "2026-08-12T16:00:00", "fin": "2026-08-13T08:00:00" },
      { "nombre": "Reparación estructural", "pesoHH": 5, "inicio": "2026-08-13T08:00:00", "fin": "2026-08-13T13:00:00" },
      { "nombre": "Cierre de equipo", "pesoHH": 1, "inicio": "2026-08-15T16:00:00", "fin": "2026-08-15T17:00:00" }
    ] },
  { "otNum": 4801326, "cuadrilla": "G2", "area": "Celdas de Flotación", "descripcion": "Cortador Muestra 324CU003 Cola Canaleta Concentrado Rougher (Equipo 11372)", "pesoPlanHH": 12, "inicio": "2026-08-13T13:00:00", "fin": "2026-08-15T17:00:00",
    "subactividades": [
      { "nombre": "Apertura de equipo para su inspección", "pesoHH": 1, "inicio": "2026-08-13T13:00:00", "fin": "2026-08-13T14:00:00" },
      { "nombre": "Inspección de componentes", "pesoHH": 10, "inicio": "2026-08-13T15:00:00", "fin": "2026-08-14T01:00:00" },
      { "nombre": "Cierre de equipo", "pesoHH": 1, "inicio": "2026-08-15T16:00:00", "fin": "2026-08-15T17:00:00" }
    ] },
  { "otNum": 4895739, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares", "descripcion": "Celda Flotación Jameson 324FC801 (Equipo 40285)", "pesoPlanHH": 26, "inicio": "2026-08-12T17:00:00", "fin": "2026-08-13T19:00:00",
    "subactividades": [
      { "nombre": "Cambio ductos alimentación sobre parrón", "pesoHH": 8, "inicio": "2026-08-12T17:00:00", "fin": "2026-08-13T01:00:00" },
      { "nombre": "Cambio Ducto Concentrado 037-01/RT", "pesoHH": 4, "inicio": "2026-08-13T01:00:00", "fin": "2026-08-13T05:00:00" },
      { "nombre": "Cambio de Ductos Fallback 18-TA-324-SR3-055-04", "pesoHH": 4, "inicio": "2026-08-13T05:00:00", "fin": "2026-08-13T09:00:00" },
      { "nombre": "Cambio Ducto Descarga 324FC801 SR3-033", "pesoHH": 5, "inicio": "2026-08-13T09:00:00", "fin": "2026-08-13T14:00:00" },
      { "nombre": "Cambio Ductos de Descarga 324FC801 SR3-031/032/33", "pesoHH": 5, "inicio": "2026-08-13T14:00:00", "fin": "2026-08-13T19:00:00" }
    ] },
  { "otNum": 3296859, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares", "descripcion": "Celda Flotación Jameson 324FC802 (Equipo 40286)", "pesoPlanHH": 8, "inicio": "2026-08-13T19:00:00", "fin": "2026-08-14T03:00:00",
    "subactividades": [
      { "nombre": "Cambio Ducto SR3-33-02", "pesoHH": 4, "inicio": "2026-08-13T19:00:00", "fin": "2026-08-13T23:00:00" },
      { "nombre": "Cambio de Codo SR3-36-03", "pesoHH": 4, "inicio": "2026-08-13T23:00:00", "fin": "2026-08-14T03:00:00" }
    ] },
  { "otNum": 4923188, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares", "descripcion": "Cajón Distribuidor 324DI803 (Equipo 40284)", "pesoPlanHH": 6, "inicio": "2026-08-14T03:00:00", "fin": "2026-08-14T09:00:00",
    "subactividades": [ { "nombre": "Cambio ducto descarga cajón DI (orilla playa)", "pesoHH": 6, "inicio": "2026-08-14T03:00:00", "fin": "2026-08-14T09:00:00" } ] },
  { "otNum": 4811513, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares", "descripcion": "Bomba Descarga Cajón Cola 324PP805 (Equipo 40289)", "pesoPlanHH": 13, "inicio": "2026-08-14T09:00:00", "fin": "2026-08-14T22:00:00",
    "subactividades": [
      { "nombre": "Cambio Ducto Tipo Codo Succión", "pesoHH": 8, "inicio": "2026-08-14T09:00:00", "fin": "2026-08-14T17:00:00" },
      { "nombre": "Cambio posición válvulas descarga (invertir posición manual con neumática)", "pesoHH": 5, "inicio": "2026-08-14T17:00:00", "fin": "2026-08-14T22:00:00" }
    ] },
  { "otNum": 4887362, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares", "descripcion": "Bomba Descarga Cajón Cola 324PP806 (Equipo 40290)", "pesoPlanHH": 6, "inicio": "2026-08-14T22:00:00", "fin": "2026-08-15T04:00:00",
    "subactividades": [ { "nombre": "Cambio posición válvulas descarga (invertir posición manual con neumática)", "pesoHH": 6, "inicio": "2026-08-14T22:00:00", "fin": "2026-08-15T04:00:00" } ] },
  { "otNum": 4892569, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares", "descripcion": "Bomba Descarga Cajón Cola 324PP807 (Equipo 40291)", "pesoPlanHH": 6, "inicio": "2026-08-15T04:00:00", "fin": "2026-08-15T10:00:00",
    "subactividades": [ { "nombre": "Cambio posición válvulas descarga (invertir posición manual con neumática)", "pesoHH": 6, "inicio": "2026-08-15T04:00:00", "fin": "2026-08-15T10:00:00" } ] },
  { "otNum": 4892570, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares", "descripcion": "Bomba Descarga Cajón Cola 324PP808 (Equipo 40292)", "pesoPlanHH": 7, "inicio": "2026-08-15T10:00:00", "fin": "2026-08-15T17:00:00",
    "subactividades": [ { "nombre": "Cambio posición válvulas descarga (invertir posición manual con neumática)", "pesoHH": 7, "inicio": "2026-08-15T10:00:00", "fin": "2026-08-15T17:00:00" } ] },
  { "otNum": 4436470, "cuadrilla": "G5B", "area": "Remolienda / Celdas Columnares", "descripcion": "Espesador Concentrado 325TK001 (Equipo 15917)", "pesoPlanHH": 4, "inicio": "2026-08-14T01:00:00", "fin": "2026-08-14T05:00:00",
    "subactividades": [ { "nombre": "Apoyo de ejecución para cambio switch nivel U.H.", "pesoHH": 4, "inicio": "2026-08-14T01:00:00", "fin": "2026-08-14T05:00:00" } ] },
  { "otNum": 3360634, "cuadrilla": "G5B", "area": "Remolienda / Celdas Columnares", "descripcion": "Estanque Alma. Concentrado 511TK501 (Equipo 20261)", "pesoPlanHH": 26, "inicio": "2026-08-12T23:00:00", "fin": "2026-08-14T01:00:00",
    "subactividades": [
      { "nombre": "Válvula manual con falla de transición", "pesoHH": 10, "inicio": "2026-08-12T23:00:00", "fin": "2026-08-13T09:00:00" },
      { "nombre": "Revisión y levantamiento de Dardo FV-7317", "pesoHH": 8, "inicio": "2026-08-13T09:00:00", "fin": "2026-08-13T17:00:00" },
      { "nombre": "521-HV-7398 problema de apertura y cierre de la válvula", "pesoHH": 8, "inicio": "2026-08-13T17:00:00", "fin": "2026-08-14T01:00:00" }
    ] },
  { "otNum": 4923196, "cuadrilla": "G4", "area": "Relaves", "descripcion": "Muestreador Metalúrgico Colas 411SA002 (Equipo 15950)", "pesoPlanHH": 20, "inicio": "2026-08-13T10:00:00", "fin": "2026-08-14T06:00:00",
    "subactividades": [ { "nombre": "Actividad mecánica", "pesoHH": 20, "inicio": "2026-08-13T10:00:00", "fin": "2026-08-14T06:00:00" } ] },
  { "otNum": 4556158, "cuadrilla": "G4", "area": "Relaves", "descripcion": "Cajón DI Relaves 411DI501 (Equipo 38854)", "pesoPlanHH": 12, "inicio": "2026-08-14T06:00:00", "fin": "2026-08-14T18:00:00",
    "subactividades": [ { "nombre": "Inspección mecánica y estructural del Cajón DI relaves 411DI501", "pesoHH": 12, "inicio": "2026-08-14T06:00:00", "fin": "2026-08-14T18:00:00" } ] },
  { "otNum": 4668762, "cuadrilla": "G4", "area": "Relaves", "descripcion": "Cajón Distribuidor 411DI502 (Equipo 38858)", "pesoPlanHH": 7, "inicio": "2026-08-14T18:00:00", "fin": "2026-08-15T01:00:00",
    "subactividades": [ { "nombre": "Inspección mecánica y estructural del Cajón DI relaves 411DI502", "pesoHH": 7, "inicio": "2026-08-14T18:00:00", "fin": "2026-08-15T01:00:00" } ] },
  { "otNum": 4556156, "cuadrilla": "G4", "area": "Relaves", "descripcion": "Canaleta de Relaves 411ZC005 (Equipo 15957)", "pesoPlanHH": 12, "inicio": "2026-08-15T01:00:00", "fin": "2026-08-15T13:00:00",
    "subactividades": [ { "nombre": "Mantención mecánica al Cajón DI Relave 411DI001", "pesoHH": 12, "inicio": "2026-08-15T01:00:00", "fin": "2026-08-15T13:00:00" } ] },
  { "otNum": 4336063, "cuadrilla": "G4", "area": "Relaves", "descripcion": "Espesador Relaves 411TK002 (Equipo 15952)", "pesoPlanHH": 18, "inicio": "2026-08-12T16:00:00", "fin": "2026-08-13T10:00:00",
    "subactividades": [ { "nombre": "Cambio de dardo 411-FV-7039-B", "pesoHH": 18, "inicio": "2026-08-12T16:00:00", "fin": "2026-08-13T10:00:00" } ] },
  { "otNum": 4922639, "cuadrilla": "G5A", "area": "Relaves", "descripcion": "Hammer 415TK001 — Mantención General y del TK (Equipo 16085)", "pesoPlanHH": 69, "inicio": "2026-08-12T21:00:00", "fin": "2026-08-15T15:00:00",
    "subactividades": [
      { "nombre": "Apertura de Manhole del TK Hammer", "pesoHH": 2, "inicio": "2026-08-12T21:00:00", "fin": "2026-08-12T23:00:00" },
      { "nombre": "Reparación de piso Hammer", "pesoHH": 24, "inicio": "2026-08-13T23:00:00", "fin": "2026-08-14T23:00:00" },
      { "nombre": "Reparación de Paredes Hammer", "pesoHH": 26, "inicio": "2026-08-13T23:00:00", "fin": "2026-08-15T01:00:00" },
      { "nombre": "Inspección de Boquillas del Hammer", "pesoHH": 12, "inicio": "2026-08-15T01:00:00", "fin": "2026-08-15T13:00:00" },
      { "nombre": "Verificación de Estado de Correas del Hammer", "pesoHH": 3, "inicio": "2026-08-15T11:00:00", "fin": "2026-08-15T14:00:00" },
      { "nombre": "Cierre de escotilla del TK Hammer", "pesoHH": 2, "inicio": "2026-08-15T13:00:00", "fin": "2026-08-15T15:00:00" }
    ] },
  { "otNum": 4912071, "cuadrilla": "G5B", "area": "Relaves", "descripcion": "Hammer 415TK001 — Cambio Válvula KGA 20\" Manual, Tren 1 HV7831 (Equipo 16085)", "pesoPlanHH": 40, "inicio": "2026-08-14T05:00:00", "fin": "2026-08-15T21:00:00",
    "subactividades": [ { "nombre": "Válvula Descarga Tren 1 HV7831 - Cambio de Válvula KGA 20\" Manual", "pesoHH": 40, "inicio": "2026-08-14T05:00:00", "fin": "2026-08-15T21:00:00" } ] },
  { "otNum": 4948690, "cuadrilla": "G5B", "area": "Relaves", "descripcion": "Hammer 415TK001 — Cambio Válvula KGF 20\" Hidráulica, Tren 1 HV7831 (Equipo 16085)", "pesoPlanHH": 20, "inicio": "2026-08-14T15:00:00", "fin": "2026-08-15T11:00:00",
    "subactividades": [ { "nombre": "Válvula Descarga Tren 1 HV7831 - Cambio de Válvula KGF 20\" Hidráulica", "pesoHH": 20, "inicio": "2026-08-14T15:00:00", "fin": "2026-08-15T11:00:00" } ] },
  { "otNum": 3181708, "cuadrilla": "G5A", "area": "Relaves", "descripcion": "Espesador de Pastas 411TK501 (Equipo 11684)", "pesoPlanHH": 16, "inicio": "2026-08-12T23:00:00", "fin": "2026-08-13T15:00:00",
    "subactividades": [
      { "nombre": "Cambio Válvula 416FV8039", "pesoHH": 8, "inicio": "2026-08-12T23:00:00", "fin": "2026-08-13T07:00:00" },
      { "nombre": "Cambio Válvula 416FV7957 PT501 de Matriz de Agua", "pesoHH": 8, "inicio": "2026-08-13T07:00:00", "fin": "2026-08-13T15:00:00" }
    ] },
  { "otNum": 4336075, "cuadrilla": "G5A", "area": "Relaves", "descripcion": "Espesador de Pastas 411TK701 (Equipo 27287)", "pesoPlanHH": 8, "inicio": "2026-08-13T15:00:00", "fin": "2026-08-13T23:00:00",
    "subactividades": [ { "nombre": "Cambio Válvula 414HV4408 Espesador de Pasta 411TK701 Impulsión Agua", "pesoHH": 8, "inicio": "2026-08-13T15:00:00", "fin": "2026-08-13T23:00:00" } ] },
  { "otNum": 4796765, "cuadrilla": "G6", "area": "Relaves", "descripcion": "Unidad Hidráulica Cuadro Central (Equipo 16065)", "pesoPlanHH": 32, "inicio": "2026-08-13T20:00:00", "fin": "2026-08-15T04:00:00",
    "subactividades": [
      { "nombre": "Cambio Camisa de Ducto Pasa Muro Cuadro Válvulas Central", "pesoHH": 19, "inicio": "2026-08-13T20:00:00", "fin": "2026-08-14T15:00:00" },
      { "nombre": "Cambio de ducto Adición de Agua Cuadro Válvulas Central", "pesoHH": 13, "inicio": "2026-08-14T15:00:00", "fin": "2026-08-15T04:00:00" }
    ] },
  { "otNum": 4923192, "cuadrilla": "G6", "area": "Relaves", "descripcion": "Cuadro de Válvulas 2 (Equipo 16067)", "pesoPlanHH": 13, "inicio": "2026-08-15T04:00:00", "fin": "2026-08-15T17:00:00",
    "subactividades": [ { "nombre": "Unidad Hidráulica 415HP007 - Reparación de Ducto 24\"-TA-415-7021-17", "pesoHH": 13, "inicio": "2026-08-15T04:00:00", "fin": "2026-08-15T17:00:00" } ] },
  { "otNum": 4992830, "cuadrilla": "G6", "area": "Relaves", "descripcion": "Cuadro de Válvulas 1 (Equipo 16066)", "pesoPlanHH": 28, "inicio": "2026-08-12T16:00:00", "fin": "2026-08-13T20:00:00",
    "subactividades": [
      { "nombre": "Reparación de ducto línea de descarga 24\"-TA-415-7027-01 CV1", "pesoHH": 12, "inicio": "2026-08-12T16:00:00", "fin": "2026-08-13T04:00:00" },
      { "nombre": "Cambio ducto Tee línea de descarga 24\"-TA-415-7027-03 CV1", "pesoHH": 16, "inicio": "2026-08-13T04:00:00", "fin": "2026-08-13T20:00:00" }
    ] }
];
