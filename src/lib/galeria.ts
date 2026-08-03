// Galería de la pestaña Fotos de /torneo.
//
// El array FOTOS lo GENERA scripts/optimizar-galeria.mjs a partir de los
// archivos de fotos-originales/ (nombre `2023-01.jpg` → año 2023, edición I):
//   1. deja las originales en fotos-originales/ (carpeta ignorada en git)
//   2. node scripts/optimizar-galeria.mjs
// El script crea la grande (1600px máx, WebP) y la miniatura (400px) y
// reescribe el bloque marcado de abajo. Los `pie` se retocan A MANO después:
// el script los conserva entre ejecuciones (los casa por `src`).
//
// `ancho`/`alto` son de la imagen GRANDE (la mini guarda la proporción); se
// declaran en los <img> para que el layout no salte mientras cargan (CLS).

export interface Foto {
  src: string; // grande, se carga SOLO al abrir el lightbox
  mini: string; // miniatura de la rejilla (~400px de ancho)
  ancho: number;
  alto: number;
  edicion: number; // 1 = I (2023), 2 = II (2024), 3 = III (2025)
  año: number;
  pie?: string;
}

// ⇣ GENERADO por scripts/optimizar-galeria.mjs — edita solo los `pie`
export const FOTOS: Foto[] = [
  { src: '/galeria/2023-01.svg', mini: '/galeria/mini/2023-01.svg', ancho: 1600, alto: 1200, edicion: 1, año: 2023, pie: 'La primera edición' },
  { src: '/galeria/2023-02.svg', mini: '/galeria/mini/2023-02.svg', ancho: 1600, alto: 1200, edicion: 1, año: 2023 },
  { src: '/galeria/2023-03.svg', mini: '/galeria/mini/2023-03.svg', ancho: 1600, alto: 1200, edicion: 1, año: 2023, pie: 'El pabellón lleno' },
  { src: '/galeria/2023-04.svg', mini: '/galeria/mini/2023-04.svg', ancho: 1600, alto: 1200, edicion: 1, año: 2023 },
  { src: '/galeria/2024-01.svg', mini: '/galeria/mini/2024-01.svg', ancho: 1600, alto: 1200, edicion: 2, año: 2024, pie: 'Apertura de puertas' },
  { src: '/galeria/2024-02.svg', mini: '/galeria/mini/2024-02.svg', ancho: 1600, alto: 1200, edicion: 2, año: 2024 },
  { src: '/galeria/2024-03.svg', mini: '/galeria/mini/2024-03.svg', ancho: 1600, alto: 1200, edicion: 2, año: 2024, pie: 'Semifinales' },
  { src: '/galeria/2024-04.svg', mini: '/galeria/mini/2024-04.svg', ancho: 1600, alto: 1200, edicion: 2, año: 2024 },
  { src: '/galeria/2025-01.svg', mini: '/galeria/mini/2025-01.svg', ancho: 1600, alto: 1200, edicion: 3, año: 2025, pie: 'La final' },
  { src: '/galeria/2025-02.svg', mini: '/galeria/mini/2025-02.svg', ancho: 1600, alto: 1200, edicion: 3, año: 2025, pie: 'Ambiente en las mesas' },
  { src: '/galeria/2025-03.svg', mini: '/galeria/mini/2025-03.svg', ancho: 1600, alto: 1200, edicion: 3, año: 2025 },
  { src: '/galeria/2025-04.svg', mini: '/galeria/mini/2025-04.svg', ancho: 1600, alto: 1200, edicion: 3, año: 2025, pie: 'Los campeones' },
];
// ⇡ GENERADO

// Número romano de la edición (1 → I). Fuera de rango: el número tal cual.
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const romanoDe = (edicion: number): string => ROMANOS[edicion - 1] ?? String(edicion);
