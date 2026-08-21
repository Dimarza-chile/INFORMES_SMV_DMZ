// Cronograma base SEMIVA — Mantención Mayor Planta Concentradora FCR&M, Agosto 2026
// (Centinela / Antofagasta Minerals).
//
// FUENTE DE LAS SUBACTIVIDADES (lo que SEMIVA ejecuta): "RESUMEN ACTIVIDADES SEMIVA -
// MANTENCIÓN PLANTA CONCENTRADORA SD AGOSTO 2026" — documento oficial ya filtrado por SEMIVA,
// con Nombre de tarea / TAG / Cuadrilla / Recurso / Start / Time / End / OT por fila. Cada fila de
// ese documento es UNA subactividad aquí. No se agregó, adivinó ni completó ninguna tarea que no
// estuviera explícita en ese documento.
//
// FUENTE DE LAS COMPLEMENTARIAS (contexto de terceros — andamios/aseo/instrumentación): la Carta
// Gantt general del área (que mezcla ~20 empresas). Estas NUNCA son subactividades editables de
// SEMIVA — solo se muestran como referencia en la línea de tiempo, no cuentan en el avance ni
// aceptan % de carga. Se incluyeron solo para las OT donde se pudo leer con confianza directa el
// texto de esa fila en el Gantt original; para el resto se dejó sin complementarias en vez de
// inventar una duración o empresa — si se necesita el contexto completo de terceros para todas las
// OT, hace falta un documento equivalente al de SEMIVA pero de Techint/Steel/Moncon.
//
// Bloqueo/Desbloqueo Mecánico de equipo se excluyen siempre (no tienen OT, no son trabajo
// ejecutado — así el documento oficial de SEMIVA también los muestra sin OT asociada).
//
// CORRECCIÓN IMPORTANTE sobre la versión anterior de este archivo: tenía "Montaje de andamios"
// como subactividad de la OT 4881375 (322ZM301) — error, esa tarea es de Techint, no de SEMIVA, y
// la HH real de esa OT según el documento oficial es 27 HH ("Instalación placas y revestimientos"),
// no 7. Ese y otros errores de mezcla quedan corregidos: cada subactividad de este archivo viene
// 1:1 de una fila del documento oficial de SEMIVA.
//
// Cuando un mismo equipo tiene varias OT reales consecutivas en el documento oficial (ej. Apertura
// con una OT, trabajo con otra, Cierre con una tercera), se agrupan en una sola tarjeta usando la
// OT "contenedora" (la de Apertura/Cierre) como otNum representativo — así se ve como una sola
// intervención de terreno, que es como se vive en la práctica. Excepción: Hammer 415TK001 tiene 3
// intervenciones genuinamente distintas (TK, Válvula KGA, Válvula KGF) con crews y ventanas de
// tiempo separadas, así que quedan como 3 tarjetas.

const SEED_DATA = {
  "paradaNombre": "MANTENIMIENTO MAYOR AGOSTO 2026 — FCR&M",
  "paradaSubtitulo": "SEMIVA · Planta Concentradora Centinela",
  "turnos": [
    "2026-08-11T20:00:00",
    "2026-08-12T08:00:00",
    "2026-08-12T20:00:00",
    "2026-08-13T08:00:00",
    "2026-08-13T20:00:00",
    "2026-08-14T08:00:00",
    "2026-08-14T20:00:00",
    "2026-08-15T08:00:00",
    "2026-08-15T20:00:00",
    "2026-08-16T08:00:00"
  ],
  "turnoLabels": [
    "11 Ago 20:00 (Noche)",
    "12 Ago 08:00 (Día)",
    "12 Ago 20:00 (Noche)",
    "13 Ago 08:00 (Día)",
    "13 Ago 20:00 (Noche)",
    "14 Ago 08:00 (Día)",
    "14 Ago 20:00 (Noche)",
    "15 Ago 08:00 (Día)",
    "15 Ago 20:00 (Noche)",
    "16 Ago 08:00 (Día)"
  ],
  "hhPlanPorTurno": [0, 30, 90, 110, 100, 90, 70, 40, 4, 0],
  "totalHH": 534,
  "cuadrillas": [
    { "grupo": "G1", "mecanicos": 2, "soldadores": 2, "rigger": 0, "total": 4 },
    { "grupo": "G2", "mecanicos": 2, "soldadores": 1, "rigger": 0, "total": 3 },
    { "grupo": "G3", "mecanicos": 2, "soldadores": 1, "rigger": 0, "total": 3 },
    { "grupo": "G4", "mecanicos": 2, "soldadores": 1, "rigger": 0, "total": 3 },
    { "grupo": "G5", "mecanicos": 3, "soldadores": 1, "rigger": 0, "total": 4 },
    { "grupo": "G5A", "mecanicos": 3, "soldadores": 1, "rigger": 0, "total": 4 },
    { "grupo": "G5B", "mecanicos": 3, "soldadores": 1, "rigger": 0, "total": 4 },
    { "grupo": "G6", "mecanicos": 3, "soldadores": 1, "rigger": 0, "total": 4 }
  ],
  "ots": [
    {
      "otNum": 4881375, "cuadrilla": "G1", "area": "Celdas de Flotación",
      "tipo": "Planificado", "descripcion": "Cajón Alimentación 322ZM301 (Equipo 41865)",
      "pesoPlanHH": 27, "inicio": "2026-08-13T03:00:00", "fin": "2026-08-14T06:00:00",
      "subactividades": [
        { "nombre": "Instalación placas y revestimientos", "pesoHH": 27, "inicio": "2026-08-13T03:00:00", "fin": "2026-08-14T06:00:00" }
      ]
    },
    {
      "otNum": 4850445, "cuadrilla": "G1", "area": "Celdas de Flotación",
      "tipo": "Planificado", "descripcion": "Canaleta de Alimentación Celdas de Flotación (Equipo 41866)",
      "pesoPlanHH": 17, "inicio": "2026-08-14T06:00:00", "fin": "2026-08-14T23:00:00",
      "subactividades": [
        { "nombre": "Revisión de Canaleta por Delta de Temperatura", "pesoHH": 17, "inicio": "2026-08-14T06:00:00", "fin": "2026-08-14T23:00:00" }
      ]
    },
    {
      "otNum": 4693231, "cuadrilla": "G1", "area": "Celdas de Flotación",
      "tipo": "Planificado", "descripcion": "Canaleta Concentrado Rougher 322LA001 (Equipo 11416)",
      "pesoPlanHH": 6, "inicio": "2026-08-14T23:00:00", "fin": "2026-08-15T05:00:00",
      "subactividades": [
        { "nombre": "Inspección de Canaleta Rougher 322LA001", "pesoHH": 6, "inicio": "2026-08-14T23:00:00", "fin": "2026-08-15T05:00:00" }
      ]
    },
    {
      "otNum": 4833617, "cuadrilla": "G1", "area": "Celdas de Flotación",
      "tipo": "Planificado", "descripcion": "Canaleta de Concentrado Scavenger 324LA001 (Equipo 11363)",
      "pesoPlanHH": 6, "inicio": "2026-08-15T05:00:00", "fin": "2026-08-15T11:00:00",
      "subactividades": [
        { "nombre": "Inspección de Canaleta Scavenger 324LA001", "pesoHH": 6, "inicio": "2026-08-15T05:00:00", "fin": "2026-08-15T11:00:00" }
      ]
    },
    {
      "otNum": 4833615, "cuadrilla": "G1", "area": "Celdas de Flotación",
      "tipo": "Planificado", "descripcion": "Canaleta Colectora Colas 320LA001 (Equipo 5218)",
      "pesoPlanHH": 5, "inicio": "2026-08-15T11:00:00", "fin": "2026-08-15T16:00:00",
      "subactividades": [
        { "nombre": "Inspección de Canaleta de Relaves 320LA001", "pesoHH": 5, "inicio": "2026-08-15T11:00:00", "fin": "2026-08-15T16:00:00" }
      ]
    },
    {
      "otNum": 4801324, "cuadrilla": "G2", "area": "Celdas de Flotación",
      "tipo": "Planificado", "descripcion": "Cortador Muestra 322CU001 Flotación Primaria Rougher (Equipo 11364)",
      "pesoPlanHH": 10, "inicio": "2026-08-14T01:00:00", "fin": "2026-08-15T17:00:00",
      "subactividades": [
        { "nombre": "Apertura de equipo para su inspección", "pesoHH": 1, "inicio": "2026-08-14T01:00:00", "fin": "2026-08-14T02:00:00" },
        { "nombre": "Inspección de componentes", "pesoHH": 8, "inicio": "2026-08-14T04:00:00", "fin": "2026-08-14T12:00:00" },
        { "nombre": "Cierre de equipo", "pesoHH": 1, "inicio": "2026-08-15T16:00:00", "fin": "2026-08-15T17:00:00" }
      ]
    },
    {
      "otNum": 4801325, "cuadrilla": "G2", "area": "Celdas de Flotación",
      "tipo": "Planificado", "descripcion": "Cortador Muestra 322CU002 Flotación Secundaria Rougher (Equipo 11365)",
      "pesoPlanHH": 11, "inicio": "2026-08-14T12:00:00", "fin": "2026-08-15T17:00:00",
      "subactividades": [
        { "nombre": "Apertura de equipo para su inspección", "pesoHH": 1, "inicio": "2026-08-14T12:00:00", "fin": "2026-08-14T13:00:00" },
        { "nombre": "Inspección de componentes", "pesoHH": 9, "inicio": "2026-08-14T13:00:00", "fin": "2026-08-14T22:00:00" },
        { "nombre": "Cierre de equipo", "pesoHH": 1, "inicio": "2026-08-15T16:00:00", "fin": "2026-08-15T17:00:00" }
      ]
    },
    {
      "otNum": 4872572, "cuadrilla": "G2", "area": "Celdas de Flotación",
      "tipo": "Planificado", "descripcion": "Cortador Muestra 324CU005 Flotación Primaria Scavenger (Equipo 11368)",
      "pesoPlanHH": 11, "inicio": "2026-08-14T22:00:00", "fin": "2026-08-15T17:00:00",
      "subactividades": [
        { "nombre": "Apertura de equipo para su inspección", "pesoHH": 1, "inicio": "2026-08-14T22:00:00", "fin": "2026-08-14T23:00:00" },
        { "nombre": "Inspección de componentes", "pesoHH": 9, "inicio": "2026-08-14T23:00:00", "fin": "2026-08-15T08:00:00" },
        { "nombre": "Cierre de equipo", "pesoHH": 1, "inicio": "2026-08-15T16:00:00", "fin": "2026-08-15T17:00:00" }
      ]
    },
    {
      "otNum": 4872574, "cuadrilla": "G2", "area": "Celdas de Flotación",
      "tipo": "Planificado", "descripcion": "Cortador Muestra 324CU006 Flotación Secundaria Scavenger (Equipo 11369)",
      "pesoPlanHH": 9, "inicio": "2026-08-15T08:00:00", "fin": "2026-08-15T17:00:00",
      "subactividades": [
        { "nombre": "Apertura de equipo para su inspección", "pesoHH": 1, "inicio": "2026-08-15T08:00:00", "fin": "2026-08-15T09:00:00" },
        { "nombre": "Inspección de componentes", "pesoHH": 7, "inicio": "2026-08-15T09:00:00", "fin": "2026-08-15T16:00:00" },
        { "nombre": "Cierre de equipo", "pesoHH": 1, "inicio": "2026-08-15T16:00:00", "fin": "2026-08-15T17:00:00" }
      ]
    },
    {
      "otNum": 4529387, "cuadrilla": "G2", "area": "Celdas de Flotación",
      "tipo": "Planificado", "descripcion": "Cortador Muestra 324CU001 Celda Columnar (Equipo 11373)",
      "pesoPlanHH": 23, "inicio": "2026-08-12T15:00:00", "fin": "2026-08-15T17:00:00",
      "subactividades": [
        { "nombre": "Apertura de equipo para su inspección", "pesoHH": 1, "inicio": "2026-08-12T15:00:00", "fin": "2026-08-12T16:00:00" },
        { "nombre": "Instalación cajón en contador de muestra", "pesoHH": 16, "inicio": "2026-08-12T16:00:00", "fin": "2026-08-13T08:00:00" },
        { "nombre": "Reparación estructural", "pesoHH": 5, "inicio": "2026-08-13T08:00:00", "fin": "2026-08-13T13:00:00" },
        { "nombre": "Cierre de equipo", "pesoHH": 1, "inicio": "2026-08-15T16:00:00", "fin": "2026-08-15T17:00:00" }
      ]
    },
    {
      "otNum": 4801326, "cuadrilla": "G2", "area": "Celdas de Flotación",
      "tipo": "Planificado", "descripcion": "Cortador Muestra 324CU003 Cola Canaleta Concentrado Rougher (Equipo 11372)",
      "pesoPlanHH": 12, "inicio": "2026-08-13T13:00:00", "fin": "2026-08-15T17:00:00",
      "subactividades": [
        { "nombre": "Apertura de equipo para su inspección", "pesoHH": 1, "inicio": "2026-08-13T13:00:00", "fin": "2026-08-13T14:00:00" },
        { "nombre": "Inspección de componentes", "pesoHH": 10, "inicio": "2026-08-13T15:00:00", "fin": "2026-08-14T01:00:00" },
        { "nombre": "Cierre de equipo", "pesoHH": 1, "inicio": "2026-08-15T16:00:00", "fin": "2026-08-15T17:00:00" }
      ]
    },
    {
      "otNum": 4895739, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares",
      "tipo": "Planificado", "descripcion": "Celda Flotación Jameson 324FC801 (Equipo 40285)",
      "pesoPlanHH": 26, "inicio": "2026-08-12T17:00:00", "fin": "2026-08-13T19:00:00",
      "subactividades": [
        { "nombre": "Cambio ductos alimentación sobre parrón", "pesoHH": 8, "inicio": "2026-08-12T17:00:00", "fin": "2026-08-13T01:00:00" },
        { "nombre": "Cambio Ducto Concentrado 037-01/RT", "pesoHH": 4, "inicio": "2026-08-13T01:00:00", "fin": "2026-08-13T05:00:00" },
        { "nombre": "Cambio de Ductos Fallback 18-TA-324-SR3-055-04", "pesoHH": 4, "inicio": "2026-08-13T05:00:00", "fin": "2026-08-13T09:00:00" },
        { "nombre": "Cambio Ducto Descarga 324FC801 SR3-033", "pesoHH": 5, "inicio": "2026-08-13T09:00:00", "fin": "2026-08-13T14:00:00" },
        { "nombre": "Cambio Ductos de Descarga 324FC801 SR3-031/032/33", "pesoHH": 5, "inicio": "2026-08-13T14:00:00", "fin": "2026-08-13T19:00:00" }
      ]
    },
    {
      "otNum": 3296859, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares",
      "tipo": "Planificado", "descripcion": "Celda Flotación Jameson 324FC802 (Equipo 40286)",
      "pesoPlanHH": 8, "inicio": "2026-08-13T19:00:00", "fin": "2026-08-14T03:00:00",
      "subactividades": [
        { "nombre": "Cambio Ducto SR3-33-02", "pesoHH": 4, "inicio": "2026-08-13T19:00:00", "fin": "2026-08-13T23:00:00" },
        { "nombre": "Cambio de Codo SR3-36-03", "pesoHH": 4, "inicio": "2026-08-13T23:00:00", "fin": "2026-08-14T03:00:00" }
      ]
    },
    {
      "otNum": 4923188, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares",
      "tipo": "Planificado", "descripcion": "Cajón Distribuidor 324DI803 (Equipo 40284)",
      "pesoPlanHH": 6, "inicio": "2026-08-14T03:00:00", "fin": "2026-08-14T09:00:00",
      "subactividades": [
        { "nombre": "Cambio ducto descarga cajón DI (orilla playa)", "pesoHH": 6, "inicio": "2026-08-14T03:00:00", "fin": "2026-08-14T09:00:00" }
      ]
    },
    {
      "otNum": 4811513, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares",
      "tipo": "Planificado", "descripcion": "Bomba Descarga Cajón Cola 324PP805 (Equipo 40289)",
      "pesoPlanHH": 13, "inicio": "2026-08-14T09:00:00", "fin": "2026-08-14T22:00:00",
      "subactividades": [
        { "nombre": "Cambio Ducto Tipo Codo Succión", "pesoHH": 8, "inicio": "2026-08-14T09:00:00", "fin": "2026-08-14T17:00:00" },
        { "nombre": "Cambio posición válvulas descarga (invertir posición manual con neumática)", "pesoHH": 5, "inicio": "2026-08-14T17:00:00", "fin": "2026-08-14T22:00:00" }
      ]
    },
    {
      "otNum": 4887362, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares",
      "tipo": "Planificado", "descripcion": "Bomba Descarga Cajón Cola 324PP806 (Equipo 40290)",
      "pesoPlanHH": 6, "inicio": "2026-08-14T22:00:00", "fin": "2026-08-15T04:00:00",
      "subactividades": [
        { "nombre": "Cambio posición válvulas descarga (invertir posición manual con neumática)", "pesoHH": 6, "inicio": "2026-08-14T22:00:00", "fin": "2026-08-15T04:00:00" }
      ]
    },
    {
      "otNum": 4892569, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares",
      "tipo": "Planificado", "descripcion": "Bomba Descarga Cajón Cola 324PP807 (Equipo 40291)",
      "pesoPlanHH": 6, "inicio": "2026-08-15T04:00:00", "fin": "2026-08-15T10:00:00",
      "subactividades": [
        { "nombre": "Cambio posición válvulas descarga (invertir posición manual con neumática)", "pesoHH": 6, "inicio": "2026-08-15T04:00:00", "fin": "2026-08-15T10:00:00" }
      ]
    },
    {
      "otNum": 4892570, "cuadrilla": "G3", "area": "Remolienda / Celdas Columnares",
      "tipo": "Planificado", "descripcion": "Bomba Descarga Cajón Cola 324PP808 (Equipo 40292)",
      "pesoPlanHH": 7, "inicio": "2026-08-15T10:00:00", "fin": "2026-08-15T17:00:00",
      "subactividades": [
        { "nombre": "Cambio posición válvulas descarga (invertir posición manual con neumática)", "pesoHH": 7, "inicio": "2026-08-15T10:00:00", "fin": "2026-08-15T17:00:00" }
      ]
    },
    {
      "otNum": 4436470, "cuadrilla": "G5B", "area": "Remolienda / Celdas Columnares",
      "tipo": "Planificado", "descripcion": "Espesador Concentrado 325TK001 (Equipo 15917)",
      "pesoPlanHH": 4, "inicio": "2026-08-14T01:00:00", "fin": "2026-08-14T05:00:00",
      "subactividades": [
        { "nombre": "Apoyo de ejecución para cambio switch nivel U.H.", "pesoHH": 4, "inicio": "2026-08-14T01:00:00", "fin": "2026-08-14T05:00:00" }
      ]
    },
    {
      "otNum": 3360634, "cuadrilla": "G5B", "area": "Remolienda / Celdas Columnares",
      "tipo": "Planificado", "descripcion": "Estanque Alma. Concentrado 511TK501 (Equipo 20261)",
      "pesoPlanHH": 26, "inicio": "2026-08-12T23:00:00", "fin": "2026-08-14T01:00:00",
      "subactividades": [
        { "nombre": "Válvula manual con falla de transición", "pesoHH": 10, "inicio": "2026-08-12T23:00:00", "fin": "2026-08-13T09:00:00" },
        { "nombre": "Revisión y levantamiento de Dardo FV-7317", "pesoHH": 8, "inicio": "2026-08-13T09:00:00", "fin": "2026-08-13T17:00:00" },
        { "nombre": "521-HV-7398 problema de apertura y cierre de la válvula", "pesoHH": 8, "inicio": "2026-08-13T17:00:00", "fin": "2026-08-14T01:00:00" }
      ]
    },
    {
      "otNum": 4923196, "cuadrilla": "G4", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Muestreador Metalúrgico Colas 411SA002 (Equipo 15950)",
      "pesoPlanHH": 20, "inicio": "2026-08-13T10:00:00", "fin": "2026-08-14T06:00:00",
      "subactividades": [
        { "nombre": "Actividad mecánica", "pesoHH": 20, "inicio": "2026-08-13T10:00:00", "fin": "2026-08-14T06:00:00" }
      ]
    },
    {
      "otNum": 4556158, "cuadrilla": "G4", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Cajón DI Relaves 411DI501 (Equipo 38854)",
      "pesoPlanHH": 12, "inicio": "2026-08-14T06:00:00", "fin": "2026-08-14T18:00:00",
      "subactividades": [
        { "nombre": "Inspección mecánica y estructural del Cajón DI relaves 411DI501", "pesoHH": 12, "inicio": "2026-08-14T06:00:00", "fin": "2026-08-14T18:00:00" }
      ]
    },
    {
      "otNum": 4668762, "cuadrilla": "G4", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Cajón Distribuidor 411DI502 (Equipo 38858)",
      "pesoPlanHH": 7, "inicio": "2026-08-14T18:00:00", "fin": "2026-08-15T01:00:00",
      "subactividades": [
        { "nombre": "Inspección mecánica y estructural del Cajón DI relaves 411DI502", "pesoHH": 7, "inicio": "2026-08-14T18:00:00", "fin": "2026-08-15T01:00:00" }
      ]
    },
    {
      "otNum": 4556156, "cuadrilla": "G4", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Canaleta de Relaves 411ZC005 (Equipo 15957)",
      "pesoPlanHH": 12, "inicio": "2026-08-15T01:00:00", "fin": "2026-08-15T13:00:00",
      "subactividades": [
        { "nombre": "Mantención mecánica al Cajón DI Relave 411DI001", "pesoHH": 12, "inicio": "2026-08-15T01:00:00", "fin": "2026-08-15T13:00:00" }
      ]
    },
    {
      "otNum": 4336063, "cuadrilla": "G4", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Espesador Relaves 411TK002 (Equipo 15952)",
      "pesoPlanHH": 18, "inicio": "2026-08-12T16:00:00", "fin": "2026-08-13T10:00:00",
      "subactividades": [
        { "nombre": "Cambio de dardo 411-FV-7039-B", "pesoHH": 18, "inicio": "2026-08-12T16:00:00", "fin": "2026-08-13T10:00:00" }
      ]
    },
    {
      "otNum": 4922639, "cuadrilla": "G5A", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Hammer 415TK001 — Mantención General y del TK (Equipo 16085)",
      "pesoPlanHH": 69, "inicio": "2026-08-12T21:00:00", "fin": "2026-08-15T15:00:00",
      "subactividades": [
        { "nombre": "Apertura de Manhole del TK Hammer", "pesoHH": 2, "inicio": "2026-08-12T21:00:00", "fin": "2026-08-12T23:00:00" },
        { "nombre": "Reparación de piso Hammer", "pesoHH": 24, "inicio": "2026-08-13T23:00:00", "fin": "2026-08-14T23:00:00" },
        { "nombre": "Reparación de Paredes Hammer", "pesoHH": 26, "inicio": "2026-08-13T23:00:00", "fin": "2026-08-15T01:00:00" },
        { "nombre": "Inspección de Boquillas del Hammer", "pesoHH": 12, "inicio": "2026-08-15T01:00:00", "fin": "2026-08-15T13:00:00" },
        { "nombre": "Verificación de Estado de Correas del Hammer", "pesoHH": 3, "inicio": "2026-08-15T11:00:00", "fin": "2026-08-15T14:00:00" },
        { "nombre": "Cierre de escotilla del TK Hammer", "pesoHH": 2, "inicio": "2026-08-15T13:00:00", "fin": "2026-08-15T15:00:00" }
      ]
    },
    {
      "otNum": 4912071, "cuadrilla": "G5B", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Hammer 415TK001 — Cambio Válvula KGA 20\" Manual, Tren 1 HV7831 (Equipo 16085)",
      "pesoPlanHH": 40, "inicio": "2026-08-14T05:00:00", "fin": "2026-08-15T21:00:00",
      "subactividades": [
        { "nombre": "Válvula Descarga Tren 1 HV7831 - Cambio de Válvula KGA 20\" Manual", "pesoHH": 40, "inicio": "2026-08-14T05:00:00", "fin": "2026-08-15T21:00:00" }
      ]
    },
    {
      "otNum": 4948690, "cuadrilla": "G5B", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Hammer 415TK001 — Cambio Válvula KGF 20\" Hidráulica, Tren 1 HV7831 (Equipo 16085)",
      "pesoPlanHH": 20, "inicio": "2026-08-14T15:00:00", "fin": "2026-08-15T11:00:00",
      "subactividades": [
        { "nombre": "Válvula Descarga Tren 1 HV7831 - Cambio de Válvula KGF 20\" Hidráulica", "pesoHH": 20, "inicio": "2026-08-14T15:00:00", "fin": "2026-08-15T11:00:00" }
      ]
    },
    {
      "otNum": 3181708, "cuadrilla": "G5A", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Espesador de Pastas 411TK501 (Equipo 11684)",
      "pesoPlanHH": 16, "inicio": "2026-08-12T23:00:00", "fin": "2026-08-13T15:00:00",
      "subactividades": [
        { "nombre": "Cambio Válvula 416FV8039", "pesoHH": 8, "inicio": "2026-08-12T23:00:00", "fin": "2026-08-13T07:00:00" },
        { "nombre": "Cambio Válvula 416FV7957 PT501 de Matriz de Agua", "pesoHH": 8, "inicio": "2026-08-13T07:00:00", "fin": "2026-08-13T15:00:00" }
      ]
    },
    {
      "otNum": 4336075, "cuadrilla": "G5A", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Espesador de Pastas 411TK701 (Equipo 27287)",
      "pesoPlanHH": 8, "inicio": "2026-08-13T15:00:00", "fin": "2026-08-13T23:00:00",
      "subactividades": [
        { "nombre": "Cambio Válvula 414HV4408 Espesador de Pasta 411TK701 Impulsión Agua", "pesoHH": 8, "inicio": "2026-08-13T15:00:00", "fin": "2026-08-13T23:00:00" }
      ]
    },
    {
      "otNum": 4796765, "cuadrilla": "G6", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Unidad Hidráulica Cuadro Central (Equipo 16065)",
      "pesoPlanHH": 32, "inicio": "2026-08-13T20:00:00", "fin": "2026-08-15T04:00:00",
      "subactividades": [
        { "nombre": "Cambio Camisa de Ducto Pasa Muro Cuadro Válvulas Central", "pesoHH": 19, "inicio": "2026-08-13T20:00:00", "fin": "2026-08-14T15:00:00" },
        { "nombre": "Cambio de ducto Adición de Agua Cuadro Válvulas Central", "pesoHH": 13, "inicio": "2026-08-14T15:00:00", "fin": "2026-08-15T04:00:00" }
      ]
    },
    {
      "otNum": 4923192, "cuadrilla": "G6", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Cuadro de Válvulas 2 (Equipo 16067)",
      "pesoPlanHH": 13, "inicio": "2026-08-15T04:00:00", "fin": "2026-08-15T17:00:00",
      "subactividades": [
        { "nombre": "Unidad Hidráulica 415HP007 - Reparación de Ducto 24\"-TA-415-7021-17", "pesoHH": 13, "inicio": "2026-08-15T04:00:00", "fin": "2026-08-15T17:00:00" }
      ]
    },
    {
      "otNum": 4992830, "cuadrilla": "G6", "area": "Relaves",
      "tipo": "Planificado", "descripcion": "Cuadro de Válvulas 1 (Equipo 16066)",
      "pesoPlanHH": 28, "inicio": "2026-08-12T16:00:00", "fin": "2026-08-13T20:00:00",
      "subactividades": [
        { "nombre": "Reparación de ducto línea de descarga 24\"-TA-415-7027-01 CV1", "pesoHH": 12, "inicio": "2026-08-12T16:00:00", "fin": "2026-08-13T04:00:00" },
        { "nombre": "Cambio ducto Tee línea de descarga 24\"-TA-415-7027-03 CV1", "pesoHH": 16, "inicio": "2026-08-13T04:00:00", "fin": "2026-08-13T20:00:00" }
      ]
    }
  ],
  "complementarias": [
    { "nombre": "Limpieza interna del cajón", "tag": "ASEO", "otRelacionada": 4881375, "otDescripcion": "Limpieza previa Cajón Alimentación 322ZM301 (Steel)", "area": "Celdas de Flotación", "inicio": "2026-08-12T19:00:00", "fin": "2026-08-13T03:00:00", "pesoHH": 8 },
    { "nombre": "Montaje de andamios (preparativos)", "tag": "AND", "otRelacionada": 4881375, "otDescripcion": "Andamios Cajón Alimentación 322ZM301 (Techint)", "area": "Celdas de Flotación", "inicio": "2026-08-12T23:00:00", "fin": "2026-08-13T03:00:00", "pesoHH": 4 },

    { "nombre": "Montaje de andamios para acceso a canaleta", "tag": "AND", "otRelacionada": 4850445, "otDescripcion": "Andamios Canaleta Alimentación Celdas de Flotación (Techint)", "area": "Celdas de Flotación", "inicio": "2026-08-14T04:00:00", "fin": "2026-08-14T06:00:00", "pesoHH": 2 },
    { "nombre": "Retiro de andamios", "tag": "AND", "otRelacionada": 4850445, "otDescripcion": "Andamios Canaleta Alimentación Celdas de Flotación (Techint)", "area": "Celdas de Flotación", "inicio": "2026-08-14T23:00:00", "fin": "2026-08-15T01:00:00", "pesoHH": 2 },

    { "nombre": "Montaje de andamio para ingreso a canaleta", "tag": "AND", "otRelacionada": 4693231, "otDescripcion": "Andamios Canaleta Concentrado Rougher 322LA001 (Techint)", "area": "Celdas de Flotación", "inicio": "2026-08-12T12:00:00", "fin": "2026-08-12T15:00:00", "pesoHH": 3 },
    { "nombre": "Inspección US Revestimiento interior Canaleta Rougher", "tag": "INST", "otRelacionada": 4693231, "otDescripcion": "4833755 — Inspección US Revestimiento Canaleta Rougher (Moncon)", "area": "Celdas de Flotación", "inicio": "2026-08-15T05:00:00", "fin": "2026-08-15T08:00:00", "pesoHH": 3 },
    { "nombre": "Retiro de andamio para ingreso a canaleta", "tag": "AND", "otRelacionada": 4693231, "otDescripcion": "Andamios Canaleta Concentrado Rougher 322LA001 (Techint)", "area": "Celdas de Flotación", "inicio": "2026-08-15T08:00:00", "fin": "2026-08-15T10:00:00", "pesoHH": 2 }
  ]
};
