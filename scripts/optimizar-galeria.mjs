// Optimiza las fotos de la galería de /torneo y GENERA el array de
// src/lib/galeria.ts (el bloque entre los marcadores «GENERADO»).
//
// Uso:
//   1. Deja las fotos originales en fotos-originales/ (ignorada en git):
//        2023-01.jpg      → foto de la rejilla de esa edición
//        2023-campeon.jpg → la de la tarjeta de campeones
//        cartel-2026.png  → el cartel del hito actual
//      Valen jpg, png, webp, avif, tiff y CR2 (RAW de Canon: se usa el JPEG
//      de previsualización a resolución completa que lleva embebido).
//   2. node scripts/optimizar-galeria.mjs
//
// Genera, por cada original:
//   public/galeria/<nombre>.webp        → grande, 1600px de ancho máx, q80
//   public/galeria/mini/<nombre>.webp   → miniatura, 400px de ancho, q75
// y reescribe FOTOS en src/lib/galeria.ts con ancho/alto reales, deduciendo
// año y tipo del nombre. Los `pie` que ya hubiera escritos se CONSERVAN.
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

const esImagen = (f) => /\.(jpe?g|png|webp|avif|tiff?|cr2)$/i.test(f);
// nombre de archivo → slug seguro para URL
const slug = (f) =>
  basename(f, extname(f))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');

// año y tipo a partir del nombre ya slugificado
function clasificar(nombre) {
  let m = /^(20\d\d)-campeon$/.exec(nombre);
  if (m) return { año: Number(m[1]), tipo: 'campeon' };
  m = /^cartel-(20\d\d)$/.exec(nombre);
  if (m) return { año: Number(m[1]), tipo: 'cartel' };
  m = /^(20\d\d)-\d+$/.exec(nombre);
  if (m) return { año: Number(m[1]), tipo: 'foto' };
  return null;
}

// JPEG de previsualización embebido en un CR2 (IFD0 del TIFF: StripOffsets y
// StripByteCounts apuntan a un JPEG a resolución completa). libvips no trae
// el códec del RAW, pero este preview es un JPEG normal.
function jpegDeCr2(buf) {
  const le = buf.toString('ascii', 0, 2) === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const ifd0 = u32(4);
  const n = u16(ifd0);
  let off = null;
  let len = null;
  for (let i = 0; i < n; i++) {
    const e = ifd0 + 2 + i * 12;
    const tag = u16(e);
    if (tag === 0x0111) off = u32(e + 8);
    if (tag === 0x0117) len = u32(e + 8);
  }
  if (off == null || len == null) throw new Error('CR2 sin preview en IFD0');
  const jpeg = buf.subarray(off, off + len);
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('el preview del CR2 no es un JPEG');
  return jpeg;
}

let archivos;
try {
  archivos = (await readdir(ORIGINALES)).filter(esImagen).sort();
} catch {
  console.error(`No existe la carpeta ${ORIGINALES}/. Créala y deja dentro las fotos originales.`);
  process.exit(1);
}
if (archivos.length === 0) {
  console.error(`No hay imágenes en ${ORIGINALES}/ (valen jpg, png, webp, avif, tiff, cr2).`);
  process.exit(1);
}
const malos = archivos.filter((a) => clasificar(slug(a)) == null);
if (malos.length > 0) {
  console.error(
    `Estos nombres no siguen el patrón (2023-01, 2023-campeon, cartel-2026):\n  ${malos.join('\n  ')}\nRenómbralos y repite.`,
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
  const { año, tipo } = clasificar(nombre);
  const origen = join(ORIGINALES, archivo);
  const esCr2 = /\.cr2$/i.test(archivo);
  const entrada = esCr2 ? jpegDeCr2(await readFile(origen)) : origen;

  // grande: 1600px de ancho máximo (no se agranda si la original es menor)
  const grande = await sharp(entrada)
    .rotate() // respeta la orientación EXIF
    .resize({ width: ANCHO_GRANDE, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toFile(join(SALIDA, `${nombre}.webp`));

  await sharp(entrada)
    .rotate()
    .resize({ width: ANCHO_MINI, withoutEnlargement: true })
    .webp({ quality: 75 })
    .toFile(join(SALIDA_MINI, `${nombre}.webp`));

  entradas.push({ nombre, año, tipo, ancho: grande.width, alto: grande.height });
  console.log(`✓ ${archivo} → ${nombre}.webp (${grande.width}×${grande.height}${esCr2 ? ', desde CR2' : ''})`);
}

// bloque nuevo de FOTOS: por año, primero la rejilla, luego campeón y cartel
const rango = { foto: 0, campeon: 1, cartel: 2 };
entradas.sort(
  (a, b) => a.año - b.año || rango[a.tipo] - rango[b.tipo] || a.nombre.localeCompare(b.nombre),
);
const lineas = entradas.map((e) => {
  const src = `/galeria/${e.nombre}.webp`;
  const pie = pies.get(src);
  const cola = pie != null ? `, pie: '${pie}'` : '';
  return `  { src: '${src}', mini: '/galeria/mini/${e.nombre}.webp', ancho: ${e.ancho}, alto: ${e.alto}, año: ${e.año}, tipo: '${e.tipo}'${cola} },`;
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
  `\n${entradas.length} imágenes optimizadas y ${GALERIA_TS} regenerado (${conservados} pies conservados).`,
);
console.log('Retoca los `pie` que quieras en galeria.ts; es opcional.');
