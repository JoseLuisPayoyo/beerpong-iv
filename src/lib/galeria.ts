// Fotos de la pestaña Fotos de /torneo (la línea temporal vive en
// ediciones.ts; aquí solo las imágenes).
//
// El array FOTOS lo GENERA scripts/optimizar-galeria.mjs a partir de los
// archivos de fotos-originales/ (carpeta ignorada en git):
//   2023-01.jpg      → tipo 'foto',    año 2023 (la rejilla de la edición)
//   2023-campeon.jpg → tipo 'campeon', año 2023 (la tarjeta de campeones)
//   cartel-2026.png  → tipo 'cartel',  año 2026 (el cartel del hito actual)
// Ejecuta `node scripts/optimizar-galeria.mjs` tras dejar ahí las originales.
// Los `pie` se retocan A MANO después: el script los conserva (casados por src).
//
// `ancho`/`alto` son de la imagen GRANDE (la mini guarda la proporción); se
// declaran en los <img> para que el layout no salte mientras cargan (CLS).

export interface Foto {
  src: string; // grande (1600px máx), se carga SOLO al abrir el lightbox
  mini: string; // miniatura de la rejilla (~400px de ancho)
  ancho: number;
  alto: number;
  año: number;
  tipo: 'foto' | 'campeon' | 'cartel';
  pie?: string;
}

// ⇣ GENERADO por scripts/optimizar-galeria.mjs — edita solo los `pie`
export const FOTOS: Foto[] = [
  { src: '/galeria/2023-01.webp', mini: '/galeria/mini/2023-01.webp', ancho: 1600, alto: 1067, año: 2023, tipo: 'foto' },
  { src: '/galeria/2023-02.webp', mini: '/galeria/mini/2023-02.webp', ancho: 1600, alto: 1067, año: 2023, tipo: 'foto' },
  { src: '/galeria/2023-03.webp', mini: '/galeria/mini/2023-03.webp', ancho: 1600, alto: 1067, año: 2023, tipo: 'foto' },
  { src: '/galeria/2023-04.webp', mini: '/galeria/mini/2023-04.webp', ancho: 1600, alto: 1067, año: 2023, tipo: 'foto' },
  { src: '/galeria/2023-05.webp', mini: '/galeria/mini/2023-05.webp', ancho: 1600, alto: 1067, año: 2023, tipo: 'foto' },
  { src: '/galeria/2023-06.webp', mini: '/galeria/mini/2023-06.webp', ancho: 1600, alto: 1067, año: 2023, tipo: 'foto' },
  { src: '/galeria/2023-07.webp', mini: '/galeria/mini/2023-07.webp', ancho: 1600, alto: 1067, año: 2023, tipo: 'foto' },
  { src: '/galeria/2023-08.webp', mini: '/galeria/mini/2023-08.webp', ancho: 1600, alto: 1067, año: 2023, tipo: 'foto' },
  { src: '/galeria/2023-09.webp', mini: '/galeria/mini/2023-09.webp', ancho: 1600, alto: 1067, año: 2023, tipo: 'foto' },
  { src: '/galeria/2023-campeon.webp', mini: '/galeria/mini/2023-campeon.webp', ancho: 1600, alto: 1067, año: 2023, tipo: 'campeon' },
  { src: '/galeria/2024-01.webp', mini: '/galeria/mini/2024-01.webp', ancho: 1600, alto: 1200, año: 2024, tipo: 'foto' },
  { src: '/galeria/2024-02.webp', mini: '/galeria/mini/2024-02.webp', ancho: 1600, alto: 1200, año: 2024, tipo: 'foto' },
  { src: '/galeria/2024-03.webp', mini: '/galeria/mini/2024-03.webp', ancho: 1600, alto: 1067, año: 2024, tipo: 'foto' },
  { src: '/galeria/2024-04.webp', mini: '/galeria/mini/2024-04.webp', ancho: 1600, alto: 1067, año: 2024, tipo: 'foto' },
  { src: '/galeria/2024-05.webp', mini: '/galeria/mini/2024-05.webp', ancho: 1600, alto: 1067, año: 2024, tipo: 'foto' },
  { src: '/galeria/2024-06.webp', mini: '/galeria/mini/2024-06.webp', ancho: 1600, alto: 1067, año: 2024, tipo: 'foto' },
  { src: '/galeria/2024-07.webp', mini: '/galeria/mini/2024-07.webp', ancho: 1600, alto: 1067, año: 2024, tipo: 'foto' },
  { src: '/galeria/2024-08.webp', mini: '/galeria/mini/2024-08.webp', ancho: 1600, alto: 1200, año: 2024, tipo: 'foto' },
  { src: '/galeria/2024-09.webp', mini: '/galeria/mini/2024-09.webp', ancho: 1600, alto: 1200, año: 2024, tipo: 'foto' },
  { src: '/galeria/2024-campeon.webp', mini: '/galeria/mini/2024-campeon.webp', ancho: 1600, alto: 1067, año: 2024, tipo: 'campeon' },
  { src: '/galeria/2025-01.webp', mini: '/galeria/mini/2025-01.webp', ancho: 1600, alto: 1067, año: 2025, tipo: 'foto' },
  { src: '/galeria/2025-02.webp', mini: '/galeria/mini/2025-02.webp', ancho: 1600, alto: 1067, año: 2025, tipo: 'foto' },
  { src: '/galeria/2025-03.webp', mini: '/galeria/mini/2025-03.webp', ancho: 1600, alto: 1200, año: 2025, tipo: 'foto' },
  { src: '/galeria/2025-04.webp', mini: '/galeria/mini/2025-04.webp', ancho: 1600, alto: 1200, año: 2025, tipo: 'foto' },
  { src: '/galeria/2025-05.webp', mini: '/galeria/mini/2025-05.webp', ancho: 1600, alto: 1200, año: 2025, tipo: 'foto' },
  { src: '/galeria/2025-06.webp', mini: '/galeria/mini/2025-06.webp', ancho: 1600, alto: 1067, año: 2025, tipo: 'foto' },
  { src: '/galeria/2025-07.webp', mini: '/galeria/mini/2025-07.webp', ancho: 1600, alto: 1067, año: 2025, tipo: 'foto' },
  { src: '/galeria/2025-08.webp', mini: '/galeria/mini/2025-08.webp', ancho: 1600, alto: 1067, año: 2025, tipo: 'foto' },
  { src: '/galeria/2025-09.webp', mini: '/galeria/mini/2025-09.webp', ancho: 1600, alto: 1067, año: 2025, tipo: 'foto' },
  { src: '/galeria/2025-campeon.webp', mini: '/galeria/mini/2025-campeon.webp', ancho: 1600, alto: 1067, año: 2025, tipo: 'campeon' },
  { src: '/galeria/cartel-2026.webp', mini: '/galeria/mini/cartel-2026.webp', ancho: 1054, alto: 1492, año: 2026, tipo: 'cartel' },
];
// ⇡ GENERADO
