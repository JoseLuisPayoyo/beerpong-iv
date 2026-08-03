import { useMemo } from 'react';
import type { Id } from '../../lib/clasificacion';
import { horaDeFase } from '../../lib/horarios';
import type { Fase, Partido, EquipoPub, FaseRow } from './tipos';

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
  })).filter((r) => r.matches.length > 0);

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

      <div className="champ">
        <div className="ct">CAMPEÓN BEERPONG IV</div>
        <div className="cv">{campeon ?? '¿ ? ? ?'}</div>
      </div>
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

  return (
    <div className={`bm${enJuego ? ' now' : ''}`}>
      {enJuego && (
        <div className="bnow">
          <span className="dot" />
          EN JUEGO · MESA {p.mesa ?? '—'}
        </div>
      )}
      {linea(p.equipo_a, p.vasos_a)}
      {linea(p.equipo_b, p.vasos_b)}
    </div>
  );
}
