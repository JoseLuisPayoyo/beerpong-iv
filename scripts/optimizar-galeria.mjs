// Optimiza las fotos de la galería de /torneo y GENERA el array de
// src/lib/galeria.ts (el bloque entre los marcadores «GENERADO»).
//
// Uso:
//   1. Deja las fotos originales en fotos-originales/ (ignorada en git).
//      El nombre debe empezar por el año: 2023-01.jpg, 2024-ambiente.png…
//      (del año se deduce la edición: 2023 → I, 2024 → II, 2025 → III)
//   2. node scripts/optimizar-galeria.mjs
//
// Genera, por cada original:
//   public/galeria/<nombre>.webp        → grande, 1600px de ancho máx, q80
//   public/galeria/mini/<nombre>.webp   → miniatura, 400px de ancho, q75
// y reescribe FOTOS en src/lib/galeria.ts con ancho/alto reales, ordenado por
// edición. Los `pie` que ya hubiera escritos se CONSERVAN (se casan por src);
// los nuevos se retocan a mano después en galeria.ts.
//
// Las originales NO se commitean; las .webp generadas y galeria.ts sí.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import sharp from 'sharp';

const ORIGINALES = 'fotos-originales';
const SALIDA = 'public/galeria';
const SALIDA_MINI = 'public/galeria/mini';
const GALERIA_TS = 'src/lib/galeria.ts';
const MARCA_INI = '// ⇣ GENERADO';
const MARCA_FIN = '// ⇡ GENERADO';
const ANCHO_GRANDE = 1600;
const ANCHO_MINI = 400;
const PRIMER_AÑO = 2023; // I edición

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
const sinAño = archivos.filter((a) => !/^20\d\d/.test(slug(a)));
if (sinAño.length > 0) {
  console.error(
    `Estos archivos no empiezan por el año (2023-…, 2024-…) y no sé a qué edición van:\n  ${sinAño.join('\n  ')}\nRenómbralos y repite.`,
  );
  process.exit(1);
}

// pies ya escritos en galeria.ts, por src (para no perderlos al regenerar)
const fuente = await readFile(GALERIA_TS, 'utf8');
const pies = new Map();
for (const m of fuente.matchAll(/src: '([^']+)'.*?pie: '((?:\\'|[^'])*)'/g)) {
  pies.set(m[1], m[2]);
}

await mkdir(SALIDA_MINI, { recursive: true });

const entradas = [];
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

  const año = Number(/^(20\d\d)/.exec(nombre)[1]);
  entradas.push({ nombre, año, edicion: año - PRIMER_AÑO + 1, ancho: grande.width, alto: grande.height });
  console.log(`✓ ${archivo} → ${nombre}.webp (${grande.width}×${grande.height})`);
}

// bloque nuevo de FOTOS, en orden cronológico de edición
entradas.sort((a, b) => a.edicion - b.edicion || a.nombre.localeCompare(b.nombre));
const lineas = entradas.map((e) => {
  const src = `/galeria/${e.nombre}.webp`;
  const pie = pies.get(src);
  const cola = pie != null ? `, pie: '${pie}'` : '';
  return `  { src: '${src}', mini: '/galeria/mini/${e.nombre}.webp', ancho: ${e.ancho}, alto: ${e.alto}, edicion: ${e.edicion}, año: ${e.año}${cola} },`;
});
const bloque = `${MARCA_INI} por scripts/optimizar-galeria.mjs — edita solo los \`pie\`\nexport const FOTOS: Foto[] = [\n${lineas.join('\n')}\n];\n${MARCA_FIN}`;

const ini = fuente.indexOf(MARCA_INI);
const fin = fuente.indexOf(MARCA_FIN);
if (ini === -1 || fin === -1) {
  console.error(`No encuentro los marcadores «${MARCA_INI}» / «${MARCA_FIN}» en ${GALERIA_TS}.`);
  process.exit(1);
}
await writeFile(
  GALERIA_TS,
  fuente.slice(0, ini) + bloque + fuente.slice(fin + MARCA_FIN.length),
  'utf8',
);

const conservados = entradas.filter((e) => pies.has(`/galeria/${e.nombre}.webp`)).length;
console.log(
  `\n${entradas.length} fotos optimizadas y ${GALERIA_TS} regenerado (${conservados} pies conservados).`,
);
console.log('Retoca los `pie` que quieras en galeria.ts; es opcional.');
