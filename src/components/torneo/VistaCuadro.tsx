import { useMemo } from 'react';
import type { Id } from '../../lib/clasificacion';
import { horaDeFase } from '../../lib/horarios';
import type { Fase, Partido, EquipoPub, FaseRow } from './tipos';

// Orden cronológico; en pantalla se pinta INVERTIDO (la ronda más avanzada
// que ya tenga partidos, arriba): al abrir el Cuadro se ve lo que está
// pasando ahora, no los 16 cruces de dieciseisavos de hace dos horas.
const RONDAS: { fase: Fase; label: string }[] = [
  { fase: 'dieciseisavos', label: 'DIECISEISAVOS' },
  { fase: 'octavos', label: 'OCTAVOS' },
  { fase: 'cuartos', label: 'CUARTOS' },
  { fase: 'semifinal', label: 'SEMIFINALES' },
  { fase: 'final', label: 'FINAL' },
];

export default function VistaCuadro({
  partidos,
  equipos,
  fases,
}: {
  partidos: Partido[];
  equipos: EquipoPub[];
  fases: FaseRow[];
}) {
  const nombre = useMemo(() => {
    const m = new Map<Id, string>();
    for (const e of equipos) m.set(e.id, e.nombre_equipo);
    return (id: Id | null) => (id != null ? (m.get(id) ?? null) : null);
  }, [equipos]);

  const rondasConPartidos = RONDAS.map((r) => ({
    ...r,
    matches: partidos.filter((p) => p.fase === r.fase).sort((a, b) => a.orden - b.orden),
  }))
    .filter((r) => r.matches.length > 0)
    .reverse();

  const hayCuadro = rondasConPartidos.length > 0;
  const finalP = partidos.find((p) => p.fase === 'final' && p.orden === 0) ?? null;
  const campeon = finalP && finalP.estado === 'jugado' ? nombre(finalP.ganador_id) : null;
  const algunoEnJuego = rondasConPartidos.some((r) => r.matches.some((m) => m.estado === 'en_juego'));

  if (!hayCuadro) {
    return (
      <section className="view">
        <div className="sh">
          EL <i>CUADRO</i>
        </div>
        <div className="empty">
          <div className="ico">🏆</div>
          <div className="et">
            El cuadro se abre cuando
            <br />
            terminen los 13 grupos.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="view">
      <div className="sh">
        EL <i>CUADRO</i>
      </div>
      {algunoEnJuego ? (
        <div className="led am blink" style={{ marginBottom: 14 }}>
          <span className="dot" />
          EN JUEGO · SE ACTUALIZA SOLO
        </div>
      ) : (
        <div className="led blink" style={{ marginBottom: 14 }}>
          <span className="dot" />
          EN DIRECTO · SE ACTUALIZA SOLO
        </div>
      )}

      {/* con las rondas invertidas, el campeón corona el cuadro */}
      <div className="champ" style={{ marginTop: 0, marginBottom: 14 }}>
        <div className="ct">CAMPEÓN BEERPONG IV</div>
        <div className="cv">{campeon ?? '¿ ? ? ?'}</div>
      </div>

      {rondasConPartidos.map((r) => {
        const completa = r.matches.every((m) => m.estado === 'jugado');
        // Ventana de la fase (hora real del admin si está fijada); las rondas
        // ya cerradas no necesitan hora.
        const hora = completa ? null : horaDeFase(r.fase, fases);
        return (
          <div key={r.fase}>
            <div className="rnd">
              {r.label}
              {hora && <span className="rh">· {hora}</span>}
              {completa && <span className="ck">✓</span>}
              <span className="l" />
            </div>
            {r.matches.map((m) => (
              <MatchCard key={String(m.id)} p={m} nombre={nombre} />
            ))}
          </div>
        );
      })}
    </section>
  );
}

function MatchCard({ p, nombre }: { p: Partido; nombre: (id: Id | null) => string | null }) {
  const jugado = p.estado === 'jugado';
  const enJuego = p.estado === 'en_juego';

  const linea = (equipoId: Id | null, vasos: number | null) => {
    const nom = nombre(equipoId);
    const gana = jugado && p.ganador_id != null && equipoId === p.ganador_id;
    const clase = gana ? 'bl w' : enJuego ? 'bl live' : 'bl';
    const marcador = jugado || enJuego ? String(vasos ?? 0) : '—';
    return (
      <div className={clase}>
        <span className={`bn${nom == null ? ' tbd' : ''}`}>{nom ?? 'Por determinar'}</span>
        <span className="bs">{marcador}</span>
      </div>
    );
  };

  // Mesa y tanda vienen asignadas en la BD; se enseñan mientras el cruce no
  // se haya jugado (después ya no le importan a nadie).
  const meta = [
    p.mesa != null ? `MESA ${p.mesa}` : null,
    p.tanda != null ? `TANDA ${p.tanda}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={`bm${enJuego ? ' now' : ''}`}>
      {enJuego ? (
        <div className="bnow">
          <span className="dot" />
          EN JUEGO{meta && ` · ${meta}`}
        </div>
      ) : (
        !jugado && meta && <div className="bmeta">{meta}</div>
      )}
      {linea(p.equipo_a, p.vasos_a)}
      {linea(p.equipo_b, p.vasos_b)}
    </div>
  );
}
