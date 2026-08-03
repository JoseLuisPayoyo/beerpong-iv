import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EDICIONES, type Edicion } from '../../lib/ediciones';
import { FOTOS, type Foto } from '../../lib/galeria';

// Pestaña Fotos: la línea temporal de las ediciones (cortijo → patio del
// colegio → polideportivo → esta noche), según reference/beerpong-timeline.html.
// Cada hito lleva su rejilla de 9 miniaturas y la tarjeta de campeones; el
// actual, el cartel. La rejilla carga SOLO miniaturas (lazy); la grande se
// pide únicamente al abrir el lightbox, que es casero: sin librerías, con
// teclado (Esc, flechas), cierre tocando fuera y swipe lateral en móvil.

export default function VistaFotos() {
  const porAño = useMemo(() => {
    const m = new Map<number, { fotos: Foto[]; campeon: Foto | null; cartel: Foto | null }>();
    for (const e of EDICIONES) m.set(e.año, { fotos: [], campeon: null, cartel: null });
    for (const f of FOTOS) {
      const g = m.get(f.año);
      if (!g) continue; // foto de un año sin hito: no se pinta
      if (f.tipo === 'foto') g.fotos.push(f);
      else if (f.tipo === 'campeon') g.campeon = f;
      else g.cartel = f;
    }
    return m;
  }, []);

  // Lista plana para el lightbox: por edición, la rejilla y después el campeón.
  const lista = useMemo(
    () =>
      EDICIONES.flatMap((e) => {
        const g = porAño.get(e.año)!;
        return [...g.fotos, ...(g.campeon ? [g.campeon] : [])];
      }),
    [porAño],
  );

  const [abierta, setAbierta] = useState<number | null>(null); // índice en `lista`
  const cerrar = useCallback(() => setAbierta(null), []);
  const mover = useCallback(
    (d: number) => setAbierta((i) => (i == null ? i : (i + d + lista.length) % lista.length)),
    [lista.length],
  );

  return (
    <section className="view">
      <div className="fhead">
        <p className="feyebrow">Fotos</p>
        <h2 className="fh1">
          CÓMO EMPEZÓ
          <br />
          TODO <i>ESTO</i>
        </h2>
        <p className="fsub">
          Cuatro años, tres sitios distintos y un torneo que no ha parado de crecer.
        </p>
      </div>

      <div className="ftl">
        {EDICIONES.map((ed) => (
          <Hito
            key={ed.año}
            ed={ed}
            grupo={porAño.get(ed.año)!}
            lista={lista}
            onAbrir={setAbierta}
          />
        ))}
      </div>

      {abierta != null && lista[abierta] && (
        <Lightbox
          foto={lista[abierta]}
          onCerrar={cerrar}
          onMover={mover}
          soloUna={lista.length === 1}
        />
      )}
    </section>
  );
}

function Hito({
  ed,
  grupo,
  lista,
  onAbrir,
}: {
  ed: Edicion;
  grupo: { fotos: Foto[]; campeon: Foto | null; cartel: Foto | null };
  lista: Foto[];
  onAbrir: (i: number) => void;
}) {
  const indiceDe = (f: Foto) => lista.indexOf(f);
  return (
    <div className={`fmil${ed.actual ? ' now' : ''}`}>
      <span className="fdot" aria-hidden="true">
        <i />
      </span>
      <div className="fed">
        <span className="num">{ed.num}</span>
        <span className="yr">{ed.año}</span>
      </div>
      <div className="fplace">{ed.lugar}</div>
      <p className="fstory">{ed.historia}</p>
      <div className="fstats">
        {ed.stats.map((s) => (
          <span className="fstat" key={s}>
            {s}
          </span>
        ))}
      </div>

      {grupo.fotos.length > 0 && (
        <div className="fgrid">
          {grupo.fotos.map((f, j) => (
            <button
              key={f.mini}
              className="fbtn"
              aria-label={`Ver foto: ${f.pie ?? `${ed.lugar}, ${ed.año}`}`}
              onClick={() => onAbrir(indiceDe(f))}
            >
              <img
                src={f.mini}
                alt={f.pie ? `${f.pie} (${ed.año})` : `Beerpong ${ed.año}, foto ${j + 1}`}
                width={400}
                height={Math.round((f.alto / f.ancho) * 400)}
                loading="lazy"
                decoding="async"
              />
            </button>
          ))}
        </div>
      )}

      {ed.campeones &&
        (grupo.campeon ? (
          <button
            className="fchamp"
            aria-label={`Ver foto de los campeones de la ${ed.num} edición: ${ed.campeones}`}
            onClick={() => onAbrir(indiceDe(grupo.campeon!))}
          >
            <img
              src={grupo.campeon.mini}
              alt={`${ed.campeones}, campeones de la ${ed.num} edición (${ed.año})`}
              width={400}
              height={Math.round((grupo.campeon.alto / grupo.campeon.ancho) * 400)}
              loading="lazy"
              decoding="async"
            />
            <span className="cap">
              <span className="k">Campeones {ed.num} edición</span>
              <span className="v">{ed.campeones}</span>
            </span>
          </button>
        ) : (
          <div className="fchamp">
            <span className="cap">
              <span className="k">Campeones {ed.num} edición</span>
              <span className="v">{ed.campeones}</span>
            </span>
          </div>
        ))}

      {ed.actual &&
        (grupo.cartel ? (
          <figure className="fcartel">
            <img
              src={grupo.cartel.src}
              alt={`Cartel de la ${ed.num} edición`}
              width={grupo.cartel.ancho}
              height={grupo.cartel.alto}
              loading="lazy"
              decoding="async"
            />
            {ed.pieCartel && <figcaption>{ed.pieCartel}</figcaption>}
          </figure>
        ) : (
          // respaldo del mockup si el cartel no existe: no se rompe nada
          <div className="fnow">
            <div className="t">
              Las fotos
              <br />
              se escriben hoy
            </div>
            <div className="d">Esta edición todavía se está jugando.</div>
            <div className="led2">● EN DIRECTO</div>
          </div>
        ))}
    </div>
  );
}

// «I EDICIÓN · 2023» para el pie del lightbox.
const edicionDe = (año: number): string => {
  const e = EDICIONES.find((x) => x.año === año);
  return e ? `${e.num} EDICIÓN · ${e.año}` : String(año);
};

function Lightbox({
  foto,
  onCerrar,
  onMover,
  soloUna,
}: {
  foto: Foto;
  onCerrar: () => void;
  onMover: (d: number) => void;
  soloUna: boolean;
}) {
  const cerrarRef = useRef<HTMLButtonElement>(null);
  const toqueX = useRef<number | null>(null);

  // Teclado global mientras está abierto: Esc cierra, flechas navegan.
  useEffect(() => {
    const onTecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCerrar();
      else if (e.key === 'ArrowLeft') onMover(-1);
      else if (e.key === 'ArrowRight') onMover(1);
    };
    window.addEventListener('keydown', onTecla);
    return () => window.removeEventListener('keydown', onTecla);
  }, [onCerrar, onMover]);

  // Foco al abrir (navegable con teclado) y scroll de fondo bloqueado.
  useEffect(() => {
    cerrarRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const ed = EDICIONES.find((x) => x.año === foto.año);
  const pie =
    foto.pie ?? (foto.tipo === 'campeon' && ed?.campeones ? `Campeones: ${ed.campeones}` : null);
  const alt = pie ? `${pie} (${foto.año})` : `Beerpong ${foto.año}`;
  return (
    <div
      className="lb"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={(e) => {
        // tocar fuera de la foto/controles cierra
        if (e.target === e.currentTarget) onCerrar();
      }}
      onTouchStart={(e) => {
        toqueX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const x0 = toqueX.current;
        toqueX.current = null;
        const x1 = e.changedTouches[0]?.clientX;
        if (x0 == null || x1 == null) return;
        const d = x1 - x0;
        if (Math.abs(d) > 45) onMover(d < 0 ? 1 : -1); // swipe lateral
      }}
    >
      <button ref={cerrarRef} className="lb-x" aria-label="Cerrar" onClick={onCerrar}>
        ✕
      </button>
      <img
        key={foto.src} // remonta al navegar: no se queda la foto anterior debajo
        src={foto.src}
        alt={alt}
        width={foto.ancho}
        height={foto.alto}
        decoding="async"
      />
      <div className="lb-pie">
        <span className="ed">{edicionDe(foto.año)}</span>
        {pie && <span className="tx">{pie}</span>}
      </div>
      {!soloUna && (
        <>
          <button className="lb-nav ant" aria-label="Foto anterior" onClick={() => onMover(-1)}>
            ‹
          </button>
          <button className="lb-nav sig" aria-label="Foto siguiente" onClick={() => onMover(1)}>
            ›
          </button>
        </>
      )}
    </div>
  );
}
