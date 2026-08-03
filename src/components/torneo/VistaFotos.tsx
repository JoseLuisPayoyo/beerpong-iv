import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FOTOS, romanoDe, type Foto } from '../../lib/galeria';

// Pestaña Fotos: prueba social con fotos de ediciones anteriores. La rejilla
// carga SOLO miniaturas (lazy); la grande se pide únicamente al abrir el
// lightbox. Este es casero: sin librerías, con teclado (Esc, flechas), cierre
// tocando fuera y swipe lateral en móvil. Sin contadores de fotos: aquí se
// enseña ambiente, no números.

export default function VistaFotos() {
  // Ediciones en orden cronológico: primero la I, luego la II, luego la III.
  const porEdicion = useMemo(() => {
    const m = new Map<number, Foto[]>();
    for (const f of FOTOS) m.set(f.edicion, [...(m.get(f.edicion) ?? []), f]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, []);
  const lista = useMemo(() => porEdicion.flatMap(([, fotos]) => fotos), [porEdicion]);

  const [abierta, setAbierta] = useState<number | null>(null); // índice en `lista`

  const cerrar = useCallback(() => setAbierta(null), []);
  const mover = useCallback(
    (d: number) =>
      setAbierta((i) => (i == null ? i : (i + d + lista.length) % lista.length)),
    [lista.length],
  );

  if (FOTOS.length === 0) {
    return (
      <section className="view">
        <div className="sh">
          EL <i>AMBIENTE</i>
        </div>
        <div className="empty">
          <div className="ico">📷</div>
          <div className="et">
            Aún no hay fotos subidas.
            <br />
            Las de esta edición, muy pronto.
          </div>
        </div>
      </section>
    );
  }

  let indice = 0; // índice corrido dentro de `lista` para abrir el lightbox
  return (
    <section className="view">
      <div className="sh">
        EL <i>AMBIENTE</i>
      </div>

      {porEdicion.map(([edicion, fotos]) => {
        const desde = indice;
        indice += fotos.length;
        const año = fotos[0].año;
        return (
          <div key={edicion}>
            <div className="gname">
              {romanoDe(edicion)} EDICIÓN · {año}
            </div>
            <div className="fgrid">
              {fotos.map((f, j) => (
                <button
                  key={f.mini}
                  className="fbtn"
                  aria-label={`Ver foto: ${f.pie ?? `Beerpong ${año}`}`}
                  onClick={() => setAbierta(desde + j)}
                >
                  <img
                    src={f.mini}
                    alt={f.pie ? `${f.pie} (${año})` : `Beerpong ${año}`}
                    width={400}
                    height={Math.round((f.alto / f.ancho) * 400)}
                    loading="lazy"
                    decoding="async"
                  />
                </button>
              ))}
            </div>
          </div>
        );
      })}

      {abierta != null && lista[abierta] && (
        <Lightbox foto={lista[abierta]} onCerrar={cerrar} onMover={mover} soloUna={lista.length === 1} />
      )}
    </section>
  );
}

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

  const alt = foto.pie ? `${foto.pie} (${foto.año})` : `Beerpong ${foto.año}`;
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
        <span className="ed">
          {romanoDe(foto.edicion)} EDICIÓN · {foto.año}
        </span>
        {foto.pie && <span className="tx">{foto.pie}</span>}
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
