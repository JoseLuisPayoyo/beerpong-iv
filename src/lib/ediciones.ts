// Línea temporal de la pestaña Fotos de /torneo: los hitos de cada edición.
// Solo texto y datos, fácil de editar; las fotos viven en galeria.ts.
// Referencia visual: reference/beerpong-timeline.html.

export interface Edicion {
  num: string; // número romano: 'I', 'II'…
  año: number;
  lugar: string; // 'El Charnaque', 'El patio del colegio'…
  historia: string;
  stats: string[]; // chips: '24 equipos', '4 mesas'…
  campeones: string | null; // null = aún sin campeón (la edición actual)
  actual?: boolean; // la de esta noche: punto verde parpadeando y cartel
  pieCartel?: string; // pie del cartel (solo la actual)
}

export const EDICIONES: Edicion[] = [
  {
    num: 'I',
    año: 2023,
    lugar: 'El Charnaque',
    historia:
      'Todo empezó en el Charnaque, un cortijo. 24 equipos y todavía no sabemos cómo nos metimos allí a todos. Sin duda, la edición más especial.',
    stats: ['24 equipos', '4 mesas'],
    campeones: 'Avenida Madrid',
  },
  {
    num: 'II',
    año: 2024,
    lugar: 'El patio del colegio',
    historia:
      'Nos fuimos a un sitio público y doblamos: 48 equipos. Aquí dejó de ser una fiesta entre amigos.',
    stats: ['48 equipos'],
    campeones: 'Carnai',
  },
  {
    num: 'III',
    año: 2025,
    lugar: 'El polideportivo',
    historia: 'Una locura. El polideportivo a reventar, 48 equipos y plazas agotadas.',
    stats: ['48 equipos', 'Sold out'],
    campeones: 'Los Nanos',
  },
  {
    num: 'IV',
    año: 2026,
    lugar: 'Esta noche',
    historia: '52 equipos, 13 grupos y por primera vez todo en directo desde el móvil.',
    stats: ['52 equipos', '13 grupos', '6 mesas', '3 DJs'],
    campeones: null,
    actual: true,
    pieCartel: 'IV EDICIÓN · 6 DE AGOSTO',
  },
];
