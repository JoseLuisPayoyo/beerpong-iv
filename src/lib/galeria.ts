// Galería de la pestaña Fotos de /torneo. Añadir una foto = añadir una línea
// a FOTOS (y sus dos archivos en public/galeria/ y public/galeria/mini/).
//
// Para generar los archivos a partir de las fotos originales:
//   1. deja las originales en fotos-originales/ (carpeta ignorada en git)
//   2. node scripts/optimizar-galeria.mjs
// El script crea la grande (1600px máx, WebP) y la miniatura (400px) y ESCRIBE
// las líneas listas para pegar aquí, con ancho y alto reales.
//
// `ancho`/`alto` son de la imagen GRANDE (la mini guarda la proporción); se
// declaran en los <img> para que el layout no salte mientras cargan (CLS).
// `pie` es opcional.

export interface Foto {
  src: string; // grande, se carga SOLO al abrir el lightbox
  mini: string; // miniatura de la rejilla (~400px de ancho)
  ancho: number;
  alto: number;
  año: number;
  pie?: string;
}

// PLACEHOLDERS: sustituir por las fotos reales cuando estén (mismo formato).
export const FOTOS: Foto[] = [
  { src: '/galeria/2025-01.svg', mini: '/galeria/mini/2025-01.svg', ancho: 1600, alto: 1200, año: 2025, pie: 'La final' },
  { src: '/galeria/2025-02.svg', mini: '/galeria/mini/2025-02.svg', ancho: 1600, alto: 1200, año: 2025, pie: 'Ambiente en las mesas' },
  { src: '/galeria/2025-03.svg', mini: '/galeria/mini/2025-03.svg', ancho: 1600, alto: 1200, año: 2025 },
  { src: '/galeria/2025-04.svg', mini: '/galeria/mini/2025-04.svg', ancho: 1600, alto: 1200, año: 2025, pie: 'Los campeones' },
  { src: '/galeria/2024-01.svg', mini: '/galeria/mini/2024-01.svg', ancho: 1600, alto: 1200, año: 2024, pie: 'Apertura de puertas' },
  { src: '/galeria/2024-02.svg', mini: '/galeria/mini/2024-02.svg', ancho: 1600, alto: 1200, año: 2024 },
  { src: '/galeria/2024-03.svg', mini: '/galeria/mini/2024-03.svg', ancho: 1600, alto: 1200, año: 2024, pie: 'Semifinales' },
  { src: '/galeria/2024-04.svg', mini: '/galeria/mini/2024-04.svg', ancho: 1600, alto: 1200, año: 2024 },
  { src: '/galeria/2023-01.svg', mini: '/galeria/mini/2023-01.svg', ancho: 1600, alto: 1200, año: 2023, pie: 'La primera edición' },
  { src: '/galeria/2023-02.svg', mini: '/galeria/mini/2023-02.svg', ancho: 1600, alto: 1200, año: 2023 },
  { src: '/galeria/2023-03.svg', mini: '/galeria/mini/2023-03.svg', ancho: 1600, alto: 1200, año: 2023, pie: 'El pabellón lleno' },
  { src: '/galeria/2023-04.svg', mini: '/galeria/mini/2023-04.svg', ancho: 1600, alto: 1200, año: 2023 },
];

// Número romano de la edición (I = 2023). Fuera de rango: se enseña el año solo.
const ROMANOS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
export const edicionDe = (año: number): string | null => ROMANOS[año - 2023] ?? null;
