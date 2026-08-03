import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FOTOS, edicionDe, type Foto } from '../../lib/galeria';

// Pestaña Fotos: prueba social con fotos de ediciones anteriores. La rejilla
// carga SOLO miniaturas (lazy); la grande se pide únicamente al abrir el
// lightbox. Este es casero: sin librerías, con teclado (Esc, flechas), cierre
// tocando fuera y swipe lateral en móvil.

export default function VistaFotos() {
  // Orden de la rejilla: ediciones de la más reciente a la más antigua.
  const porAño = useMemo(() => {
    const m = new Map<number, Foto[]>();
    for (const f of FOTOS) m.set(f.año, [...(m.get(f.año) ?? []), f]);
    return [...m.entries()].sort((a, b) => b[0] - a[0]);
  }, []);
  const lista = useMemo(() => porAño.flatMap(([, fotos]) => fotos), [porAño]);

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
      <div className="led" style={{ marginBottom: 14 }}>
        <span className="dot" />
        {FOTOS.length} FOTOS · {porAño.length} EDICIONES
      </div>

      {porAño.map(([año, fotos]) => {
        const desde = indice;
        indice += fotos.length;
        const ed = edicionDe(año);
        return (
          <div key={año}>
            <div className="gname">{ed ? `${ed} · ${año}` : año}</div>
            <div className="gstat">
              {fotos.length} {fotos.length === 1 ? 'FOTO' : 'FOTOS'}
            </div>
            <div className="fgrid">
              {fotos.map((f, j) => (
                <button
                  key={f.mini}
                  className="fbtn"
                  aria-label={`Ver foto: ${f.pie ?? `${año}, foto ${j + 1}`}`}
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
        <Lightbox
          foto={lista[abierta]}
          n={abierta + 1}
          total={lista.length}
          onCerrar={cerrar}
          onMover={mover}
        />
      )}
    </section>
  );
}

function Lightbox({
  foto,
  n,
  total,
  onCerrar,
  onMover,
}: {
  foto: Foto;
  n: number;
  total: number;
  onCerrar: () => void;
  onMover: (d: number) => void;
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

  const ed = edicionDe(foto.año);
  return (
    <div
      className="lb"
      role="dialog"
      aria-modal="true"
      aria-label={`Foto ${n} de ${total}`}
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
        alt={foto.pie ? `${foto.pie} (${foto.año})` : `Beerpong ${foto.año}`}
        width={foto.ancho}
        height={foto.alto}
        decoding="async"
      />
      <div className="lb-pie">
        <span className="ed">{ed ? `${ed} · ${foto.año}` : foto.año}</span>
        {foto.pie && <span className="tx">{foto.pie}</span>}
        <span className="cnt">
          {n} / {total}
        </span>
      </div>
      {total > 1 && (
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
