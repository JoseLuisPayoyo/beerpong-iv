// Optimiza las fotos de la galería de /torneo.
//
// Uso:
//   1. Deja las fotos originales en fotos-originales/ (ignorada en git).
//      Nómbralas empezando por el año: 2025-final.jpg, 2024-ambiente.png…
//   2. node scripts/optimizar-galeria.mjs
//
// Genera, por cada original:
//   public/galeria/<nombre>.webp        → grande, 1600px de ancho máx, q80
//   public/galeria/mini/<nombre>.webp   → miniatura, 400px de ancho, q75
// y escribe por consola las líneas listas para pegar en src/lib/galeria.ts
// (con ancho/alto reales; el pie se rellena a mano).
//
// Las originales NO se commitean; las .webp generadas sí.

import { mkdir, readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const ORIGINALES = 'fotos-originales';
const SALIDA = 'public/galeria';
const SALIDA_MINI = 'public/galeria/mini';
const ANCHO_GRANDE = 1600;
const ANCHO_MINI = 400;

const esImagen = (f) => /\.(jpe?g|png|webp|avif|tiff?)$/i.test(f);
// nombre de archivo → slug seguro para URL
const slug = (f) =>
  basename(f, extname(f))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

let archivos;
try {
  archivos = (await readdir(ORIGINALES)).filter(esImagen).sort();
} catch {
  console.error(`No existe la carpeta ${ORIGINALES}/. Créala y deja dentro las fotos originales.`);
  process.exit(1);
}
if (archivos.length === 0) {
  console.error(`No hay imágenes en ${ORIGINALES}/ (valen jpg, png, webp, avif, tiff).`);
  process.exit(1);
}

await mkdir(SALIDA_MINI, { recursive: true });

const lineas = [];
for (const archivo of archivos) {
  const nombre = slug(archivo);
  const origen = join(ORIGINALES, archivo);

  // grande: 1600px de ancho máximo (no se agranda si la original es menor)
  const grande = await sharp(origen)
    .rotate() // respeta la orientación EXIF del móvil
    .resize({ width: ANCHO_GRANDE, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(join(SALIDA, `${nombre}.webp`));

  await sharp(origen)
    .rotate()
    .resize({ width: ANCHO_MINI, withoutEnlargement: true })
    .webp({ quality: 75 })
    .toFile(join(SALIDA_MINI, `${nombre}.webp`));

  // año del nombre de archivo (2025-final.jpg → 2025); 0 si no lo lleva
  const año = Number(/^(20\d\d)/.exec(nombre)?.[1] ?? 0);
  lineas.push(
    `  { src: '/galeria/${nombre}.webp', mini: '/galeria/mini/${nombre}.webp', ancho: ${grande.width}, alto: ${grande.height}, año: ${año || '¿AÑO?'} },`,
  );
  console.log(`✓ ${archivo} → ${nombre}.webp (${grande.width}×${grande.height})`);
}

console.log(`\n${archivos.length} fotos optimizadas. Pega esto en FOTOS (src/lib/galeria.ts):\n`);
console.log(lineas.join('\n'));
console.log('\n(rellena `pie` a mano en las que quieras; es opcional)');
