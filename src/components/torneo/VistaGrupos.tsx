import { useMemo, useState } from 'react';
import { clasificar, compararStandings, type Standing, type Id } from '../../lib/clasificacion';
import { horaDePartidoGrupo, horaDeTurno } from '../../lib/horarios';
import type { Grupo, Partido, EquipoPub, FaseRow } from './tipos';

export default function VistaGrupos({
  grupos,
  partidos,
  equipos,
  fases,
}: {
  grupos: Grupo[];
  partidos: Partido[];
  equipos: EquipoPub[];
  fases: FaseRow[];
}) {
  const [sel, setSel] = useState<number | null>(null);

  const porId = useMemo(() => {
    const m = new Map<Id, EquipoPub>();
    for (const e of equipos) m.set(e.id, e);
    return m;
  }, [equipos]);
  const nombre = (id: Id | null) => (id != null ? (porId.get(id)?.nombre_equipo ?? '—') : '—');
  // «Nombre1 · Nombre2»: la gente conoce a las personas, no los motes.
  const jugadores = (id: Id | null): string | null => {
    const e = id != null ? porId.get(id) : null;
    const j = [e?.participante_1, e?.participante_2].filter(Boolean).join(' · ');
    return j || null;
  };

  // Partidos de grupo por grupo_id.
  const partidosGrupo = useMemo(() => partidos.filter((p) => p.fase === 'grupo'), [partidos]);

  // Clasificación de cada grupo (misma función que el admin: PTS → DIF → VF).
  // Los ids se pasan en orden de pos_grupo para que, con 0 jugados, el orden sea estable.
  const standings = useMemo(() => {
    const m = new Map<number, Standing[]>();
    for (const g of grupos) {
      const ids = equipos
        .filter((e) => e.grupo_id === g.id)
        .sort((a, b) => (a.pos_grupo ?? 99) - (b.pos_grupo ?? 99))
        .map((e) => e.id);
      const suyos = partidosGrupo.filter((p) => p.grupo_id === g.id);
      m.set(g.id, clasificar(ids, suyos));
    }
    return m;
  }, [grupos, equipos, partidosGrupo]);

  const jugadosPorGrupo = useMemo(() => {
    const m = new Map<number, number>();
    for (const g of grupos) {
      m.set(g.id, partidosGrupo.filter((p) => p.grupo_id === g.id && p.estado === 'jugado').length);
    }
    return m;
  }, [grupos, partidosGrupo]);

  const sellado = grupos.length === 12 && grupos.every((g) => g.estado === 'completo');
  const jugadosTotal = useMemo(
    () => partidosGrupo.filter((p) => p.estado === 'jugado').length,
    [partidosGrupo],
  );

  // Mejores 8 terceros: SOLO entre grupos completos (mismo criterio que el
  // admin: PTS → DIF → VF). Un 3º de grupo sin completar no es un 3º real
  // todavía; y quedar 9º+ entre completos ya es definitivo, porque los grupos
  // que faltan solo pueden empujarte hacia abajo. Set de grupo_id que clasifican.
  const mejoresTerceros = useMemo(() => {
    const pool: { gid: number; st: Standing }[] = [];
    for (const g of grupos) {
      if (g.estado !== 'completo') continue;
      const tercero = standings.get(g.id)?.[2];
      if (tercero) pool.push({ gid: g.id, st: tercero });
    }
    pool.sort((a, b) => compararStandings(a.st, b.st));
    return new Set(pool.slice(0, 8).map((t) => t.gid));
  }, [grupos, standings]);

  const gruposOrden = useMemo(() => [...grupos].sort((a, b) => a.id - b.id), [grupos]);
  const activo =
    (sel != null && gruposOrden.find((g) => g.id === sel)) || gruposOrden[0] || null;

  const enJuego = grupos.filter((g) => g.estado !== 'completo').length;
  const crucesActivo = activo
    ? partidosGrupo.filter((p) => p.grupo_id === activo.id).sort((a, b) => a.orden - b.orden)
    : [];

  return (
    <section className="view">
      <div className="sh li">
        EN <i>DIRECTO</i>
      </div>
      {/* LED según el estado real: por empezar / provisional / definitivo */}
      {sellado ? (
        <div className="led" style={{ marginBottom: 14 }}>
          <span className="dot" />
          DEFINITIVO · CLASIFICACIÓN FINAL
        </div>
      ) : jugadosTotal === 0 ? (
        <div className="led am" style={{ marginBottom: 14 }}>
          <span className="dot" />
          POR EMPEZAR · TURNO 1 A LAS {horaDeTurno(1, fases)}
        </div>
      ) : (
        <div className="led am blink" style={{ marginBottom: 14 }}>
          <span className="dot" />
          PROVISIONAL · {enJuego} {enJuego === 1 ? 'GRUPO' : 'GRUPOS'} EN JUEGO
        </div>
      )}

      {/* dos filas: los 12 grupos a la vista, sin scroll escondido */}
      <div className="chips g2">
        {gruposOrden.map((g) => {
          const badge =
            g.estado === 'completo' ? (
              <span className="bd ok">✓</span>
            ) : g.estado === 'en_curso' ? (
              <span className="bd pl" />
            ) : null;
          return (
            <button
              key={g.id}
              className={`gchip${activo && g.id === activo.id ? ' on' : ''}`}
              onClick={() => setSel(g.id)}
            >
              {g.letra}
              {badge}
            </button>
          );
        })}
      </div>

      {activo && (
        <>
          <div className="gname">GRUPO {activo.letra}</div>
          <div className="gstat">
            {subtitulo(activo, jugadosPorGrupo.get(activo.id) ?? 0, horaDeTurno(activo.turno, fases))}
          </div>
          <div className="thead">
            <span style={{ width: 22 }}>#</span>
            <span style={{ flex: 1 }}>EQUIPO</span>
            <span style={{ width: 24, textAlign: 'center' }}>PJ</span>
            <span style={{ width: 34, textAlign: 'center' }}>DIF</span>
            <span style={{ width: 28, textAlign: 'right' }}>PTS</span>
          </div>
          <div>
            {(standings.get(activo.id) ?? []).map((row, i) => {
              const { cls, label } = filaEstado(i, activo, mejoresTerceros, sellado);
              const quien = jugadores(row.equipoId);
              return (
                <div key={String(row.equipoId)}>
                  <div className={`trow ${cls}`}>
                    <span className="p">{i + 1}</span>
                    <span className="nm">
                      <div className="nn">{nombre(row.equipoId)}</div>
                      {quien && <div className="np">{quien}</div>}
                      <div className="ns">{label}</div>
                    </span>
                    <span className="st">{row.pj}</span>
                    <span className="df">{fmtDif(row.dif)}</span>
                    <span className="pt">{row.pts}</span>
                  </div>
                  {i === 1 && (
                    <div className="cut" style={{ padding: '9px 11px' }}>
                      <span className="l" />
                      LÍNEA DE CLASIFICACIÓN
                      <span className="l" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="legend">
            <span>
              <i className="d" style={{ background: 'var(--li)' }} />
              Pasa (1º y 2º)
            </span>
            <span>
              <i className="d" style={{ background: 'var(--am)' }} />
              Mejor 3º · en la pelea
            </span>
            <span>
              <i className="d" style={{ background: 'var(--pk)' }} />
              Fuera
            </span>
          </div>

          {/* los 6 cruces del grupo, en orden y con su hora prevista */}
          {crucesActivo.length > 0 && (
            <>
              <div className="gpart">PARTIDOS DEL GRUPO {activo.letra}</div>
              <div className="gaviso">HORARIO PREVISTO · PUEDE VARIAR</div>
              {crucesActivo.map((p) => (
                <PartidoGrupo
                  key={String(p.id)}
                  p={p}
                  hora={
                    p.estado === 'jugado'
                      ? null
                      : horaDePartidoGrupo(activo.turno, p.orden, fases)
                  }
                  nombre={nombre}
                  jugadores={jugadores}
                />
              ))}
            </>
          )}
        </>
      )}
    </section>
  );
}

// Fila de un cruce del grupo: jugado (ganador destacado), en juego (ámbar con
// parcial) o pendiente (—). Mismas tarjetas .bm que el cuadro, con la hora
// prevista delante mientras el cruce no se haya jugado.
function PartidoGrupo({
  p,
  hora,
  nombre,
  jugadores,
}: {
  p: Partido;
  hora: string | null; // null = jugado: el marcador ya cuenta la historia
  nombre: (id: Id | null) => string;
  jugadores: (id: Id | null) => string | null;
}) {
  const jugado = p.estado === 'jugado';
  const enJuego = p.estado === 'en_juego';
  const hayParcial = enJuego && (p.vasos_a != null || p.vasos_b != null);

  const linea = (equipoId: Id | null, vasos: number | null) => {
    const gana = jugado && p.ganador_id != null && equipoId === p.ganador_id;
    const quien = jugadores(equipoId);
    return (
      <div className={`bl${gana ? ' w' : ''}${enJuego ? ' live' : ''}`}>
        <span className="bn2">
          <div className="bnn">{nombre(equipoId)}</div>
          {quien && <div className="np">{quien}</div>}
        </span>
        <span className={`bs${enJuego ? ' am' : ''}`}>
          {jugado ? (vasos ?? 0) : hayParcial ? (vasos ?? 0) : '—'}
        </span>
      </div>
    );
  };

  return (
    <div className={`bm${enJuego ? ' now' : ''}${hora ? ' conh' : ''}`}>
      {hora && <span className="bhora">{hora}</span>}
      <div className="bmc">
        {enJuego && (
          <div className="bnow">
            <span className="dot" />
            EN JUEGO
          </div>
        )}
        {linea(p.equipo_a, p.vasos_a)}
        {linea(p.equipo_b, p.vasos_b)}
      </div>
    </div>
  );
}

function subtitulo(g: Grupo, jugados: number, hora: string): string {
  if (g.estado === 'completo') return 'COMPLETADO · 6/6 PARTIDOS';
  if (g.estado === 'en_curso') return `EN JUEGO · ${jugados}/6 PARTIDOS`;
  return `TURNO ${g.turno} · ${hora} · POR JUGAR`;
}

function fmtDif(dif: number): string {
  return dif > 0 ? `+${dif}` : String(dif);
}

// Clase de fila + etiqueta según posición y criterio de mejores terceros.
function filaEstado(
  i: number,
  g: Grupo,
  mejoresTerceros: Set<number>,
  sellado: boolean,
): { cls: string; label: string } {
  if (i === 0) return { cls: 'q', label: '1º · PASA' };
  if (i === 1) return { cls: 'q', label: '2º · PASA' };
  if (i === 2) {
    // Grupo sin completar: su 3º aún no está decidido → siempre en la pelea.
    if (g.estado !== 'completo') return { cls: 'pv', label: '3º · EN LA PELEA' };
    if (mejoresTerceros.has(g.id)) {
      return sellado
        ? { cls: 'q', label: '3º · PASA' } // definitivo
        : { cls: 'pv', label: '3º · EN LA PELEA' }; // provisional
    }
    // 9º o peor entre los terceros de grupos completos: fuera definitivo.
    return { cls: 'out', label: '3º · FUERA' };
  }
  return { cls: 'out', label: '4º · FUERA' };
}
