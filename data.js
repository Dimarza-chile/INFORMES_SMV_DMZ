// Identidad de ESTE informe (número, título, área, encargado) y los turnos de la parada.
// Las OT que lo componen YA NO se fijan aquí: se eligen desde la propia página
// ("Editar actividades incluidas") y se guardan en Firestore, para poder ajustarlas
// cuando quieras sin tocar código.

const INFORME_DATA = {
  "numero": 3,
  "titulo": "Cambio de Ductos y Válvulas en Área Fallback",
  "area": "Remolienda / Celdas Columnares",
  "encargado": "Eloy",
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
  ]
};

// Selección inicial sugerida (lo que practicamos): editable en cualquier momento desde
// "Editar actividades incluidas" en la propia página. Solo se usa si Firestore todavía
// no tiene una selección guardada para este informe.
const DEFAULT_OT_NUMS = [4895739, 4811513, 4887362, 4892569, 4892570];
