import { useMemo, useState } from 'react';
import { clasificar, compararStandings, type Standing, type Id } from '../../lib/clasificacion';
import {
  etiquetaMesaGrupo,
  horaDePartidoGrupo,
  horaDeTurno,
  mesaDeGrupo,
  mesaDePartidoGrupo,
} from '../../lib/horarios';
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

  const sellado = grupos.length > 0 && grupos.every((g) => g.estado === 'completo');
  const jugadosTotal = useMemo(
    () => partidosGrupo.filter((p) => p.estado === 'jugado').length,
    [partidosGrupo],
  );

  // Bolsa de mejores terceros: SOLO terceros de grupos de 4 (el 3º de un
  // grupo de 3 juega un partido menos y no es comparable; la condición es por
  // tamaño del grupo, dinámica, nunca por letra) y SOLO entre grupos
  // completos. Mismo criterio que el admin: PTS → DIF → VF. Un 3º de grupo
  // sin completar no es un 3º real todavía; y quedar fuera de las plazas
  // entre completos ya es definitivo, porque los grupos que faltan solo
  // pueden empujarte hacia abajo. Las plazas son las que queden hasta 32
  // (6 con 13 grupos: 32 − 13 − 13). Set de grupo_id que clasifican.
  const plazasTerceros = Math.max(0, 32 - grupos.length * 2);
  const mejoresTerceros = useMemo(() => {
    const pool: { gid: number; st: Standing }[] = [];
    for (const g of grupos) {
      if (g.estado !== 'completo') continue;
      if ((standings.get(g.id)?.length ?? 0) < 4) continue; // grupos de 3, fuera
      const tercero = standings.get(g.id)?.[2];
      if (tercero) pool.push({ gid: g.id, st: tercero });
    }
    pool.sort((a, b) => compararStandings(a.st, b.st));
    return new Set(pool.slice(0, plazasTerceros).map((t) => t.gid));
  }, [grupos, standings, plazasTerceros]);

  const gruposOrden = useMemo(() => [...grupos].sort((a, b) => a.id - b.id), [grupos]);
  const activo =
    (sel != null && gruposOrden.find((g) => g.id === sel)) || gruposOrden[0] || null;

  const enJuego = grupos.filter((g) => g.estado !== 'completo').length;
  const crucesActivo = activo
    ? partidosGrupo.filter((p) => p.grupo_id === activo.id).sort((a, b) => a.orden - b.orden)
    : [];
  // Mesa del grupo activo, derivada de su orden dentro del turno (nunca a mano).
  const mesaActivo = activo ? mesaDeGrupo(activo.id, grupos) : null;

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

      {/* los 13 grupos a la vista (dos filas y pico), sin scroll escondido */}
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
            {subtitulo(
              activo,
              jugadosPorGrupo.get(activo.id) ?? 0,
              // sin partidos generados aún: n·(n−1)/2 según los equipos del grupo
              crucesActivo.length ||
                (((standings.get(activo.id)?.length ?? 4) * ((standings.get(activo.id)?.length ?? 4) - 1)) / 2),
              horaDeTurno(activo.turno, fases),
              etiquetaMesaGrupo(activo.turno, mesaActivo),
            )}
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
              const { cls, label } = filaEstado(
                i,
                activo,
                mejoresTerceros,
                sellado,
                (standings.get(activo.id)?.length ?? 4) < 4,
              );
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
                  mesa={mesaDePartidoGrupo(activo.turno, mesaActivo, p.orden)}
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
// parcial) o pendiente (—). Mismas tarjetas .bm que el cuadro, con la hora y
// la mesa delante mientras el cruce no se haya jugado.
function PartidoGrupo({
  p,
  hora,
  mesa,
  nombre,
  jugadores,
}: {
  p: Partido;
  hora: string | null; // null = jugado: el marcador ya cuenta la historia
  mesa: number | null;
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
      {hora && (
        <span className="bhora">
          {hora}
          {mesa != null && <i className="bmesa">MESA {mesa}</i>}
        </span>
      )}
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

function subtitulo(
  g: Grupo,
  jugados: number,
  total: number,
  hora: string,
  mesa: string | null,
): string {
  const enMesa = mesa ? ` · ${mesa}` : '';
  if (g.estado === 'completo') return `COMPLETADO · ${total}/${total} PARTIDOS`;
  if (g.estado === 'en_curso') return `EN JUEGO · ${jugados}/${total} PARTIDOS${enMesa}`;
  // El grupo M (turno 0) no pertenece a ningún turno: va con su hora, 18:30.
  if (g.turno === 0) return `GRUPO M · ${hora}${enMesa} · POR JUGAR`;
  return `TURNO ${g.turno} · ${hora}${enMesa} · POR JUGAR`;
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
  esDeTres: boolean,
): { cls: string; label: string } {
  if (i === 0) return { cls: 'q', label: '1º · PASA' };
  if (i === 1) return { cls: 'q', label: '2º · PASA' };
  if (i === 2) {
    // El 3º de un grupo de 3 no compite por plaza (juega un partido menos):
    // ni «PASA», ni «EN LA PELEA», ni «FUERA» — solo 3º, apagado.
    if (esDeTres) return { cls: 'mut', label: '3º' };
    // Grupo sin completar: su 3º aún no está decidido → siempre en la pelea.
    if (g.estado !== 'completo') return { cls: 'pv', label: '3º · EN LA PELEA' };
    if (mejoresTerceros.has(g.id)) {
      return sellado
        ? { cls: 'q', label: '3º · PASA' } // definitivo
        : { cls: 'pv', label: '3º · EN LA PELEA' }; // provisional
    }
    // Fuera de las plazas entre los terceros de grupos completos: fuera definitivo.
    return { cls: 'out', label: '3º · FUERA' };
  }
  return { cls: 'out', label: '4º · FUERA' };
}
