// Enlaces a los PETS (Procedimiento Escrito de Trabajo Seguro) de cada actividad.
// Los PDF viven en tu Google Drive — este archivo NO sube ningún documento a GitHub ni a
// Firebase, solo guarda la URL de cada uno para que el botón "Descargar PETS" sepa a dónde
// apuntar. Nada de esto pasa por Firestore/Storage: es un mapa estático que se carga junto al
// resto de la app.
//
// Cómo agregar un PETS:
// 1. En Google Drive, click derecho al PDF → Compartir → "Cualquier persona con el enlace"
//    (si queda restringido, el botón de descarga no va a funcionar para quien abra la app).
// 2. Copia el enlace de compartir tal cual te lo da Drive (algo como
//    https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view?usp=sharing).
// 3. Pégalo abajo con el número de OT como llave (el mismo número que aparece en el título de
//    la actividad dentro de la app, ej. "OT 4881375 — ..."). La app convierte sola ese link a uno
//    de descarga directa — no hace falta que edites la URL.
// 4. Si un mismo PETS aplica a varias OT (ej. un procedimiento genérico de cambio de válvulas),
//    repite la misma URL en cada número de OT que corresponda.
const PETS_LINKS = {
  // Ejemplo (borra el "//" de la izquierda y reemplaza por tu link real):
  // 4881375: "https://drive.google.com/file/d/TU_ID_DE_ARCHIVO/view?usp=sharing",
};
