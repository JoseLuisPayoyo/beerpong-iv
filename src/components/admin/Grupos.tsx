import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { clasificar } from '../../lib/clasificacion';
import { ConfirmButton, Toast, useAviso } from './ui';

const sb = supabase!;

type Id = string | number;
type EstadoGrupo = 'pendiente' | 'en_curso' | 'completo';

interface Grupo {
  id: number; // 1-12
  letra: string; // 'A'-'L'
  turno: number; // 1 = A-F, 2 = G-L
  estado: EstadoGrupo;
  ganador_id: Id | null;
}

interface Partido {
  id: Id;
  grupo_id: number;
  orden: number; // 0-5
  equipo_a: Id;
  equipo_b: Id;
  vasos_a: number | null;
  vasos_b: number | null;
  ganador_id: Id | null;
  estado: 'pendiente' | 'jugado';
}

const TURNOS = [
  { n: 1, label: 'Grupos A–F' },
  { n: 2, label: 'Grupos G–L' },
];

export default function Grupos() {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [nombres, setNombres] = useState<Map<Id, string>>(new Map());
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useAviso();

  const [sel, setSel] = useState<number | null>(null); // chip de grupo seleccionado
  const [iniciando, setIniciando] = useState<number | null>(null); // turno en proceso
  const [editando, setEditando] = useState<Id | null>(null); // partido en edición
  const [score, setScore] = useState<{ a: number; b: number }>({ a: 0, b: 0 });
  const [editErr, setEditErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<Id | null>(null);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    const [rGrupos, rPartidos, rEquipos] = await Promise.all([
      sb.from('grupos').select('id,letra,turno,estado,ganador_id').order('id', { ascending: true }),
      sb
        .from('partidos')
        .select('id,grupo_id,orden,equipo_a,equipo_b,vasos_a,vasos_b,ganador_id,estado')
        .eq('fase', 'grupo')
        .order('grupo_id', { ascending: true })
        .order('orden', { ascending: true }),
      sb.from('equipos').select('id,nombre_equipo'),
    ]);
    if (rGrupos.error || rPartidos.error || rEquipos.error) {
      setErrorCarga('No se pudieron cargar los grupos.');
      return;
    }
    setGrupos(rGrupos.data as Grupo[]);
    setPartidos(rPartidos.data as Partido[]);
    setNombres(
      new Map(
        (rEquipos.data as { id: Id; nombre_equipo: string }[]).map((e) => [e.id, e.nombre_equipo]),
      ),
    );
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const nombre = useCallback((id: Id | null) => (id != null && nombres.get(id)) || '—', [nombres]);

  // Estado derivado de un turno a partir de sus 6 grupos.
  const estadoTurno = useCallback(
    (n: number): EstadoGrupo => {
      const gs = (grupos ?? []).filter((g) => g.turno === n);
      if (gs.length === 0) return 'pendiente';
      if (gs.every((g) => g.estado === 'completo')) return 'completo';
      if (gs.every((g) => g.estado === 'pendiente')) return 'pendiente';
      return 'en_curso';
    },
    [grupos],
  );

  // Grupos visibles: solo los de turnos iniciados o completos.
  const visibles = useMemo(
    () =>
      (grupos ?? [])
        .filter((g) => estadoTurno(g.turno) !== 'pendiente')
        .sort((a, b) => a.id - b.id),
    [grupos, estadoTurno],
  );

  const activo =
    sel != null && visibles.some((g) => g.id === sel) ? sel : (visibles[0]?.id ?? null);

  const jugadosDe = useCallback(
    (gid: number) => partidos.filter((p) => p.grupo_id === gid && p.estado === 'jugado').length,
    [partidos],
  );

  async function iniciarTurno(n: number) {
    setIniciando(n);
    // 1) abrir los 6 grupos del turno
    const { error: eg } = await sb.from('grupos').update({ estado: 'en_curso' }).eq('turno', n);
    if (eg) {
      setIniciando(null);
      setAviso({ tipo: 'err', texto: `No se pudo iniciar el turno ${n}. (${eg.message})` });
      return;
    }
    // 2) el Turno 1 cierra además la porra de grupos (irreversible de cara al público)
    if (n === 1) {
      const { error: ef } = await sb
        .from('fases')
        .update({ porra_abierta: false })
        .eq('nombre', 'grupos');
      if (ef) {
        await cargar();
        setIniciando(null);
        setAviso({
          tipo: 'err',
          texto: `Turno 1 iniciado, pero NO se pudo cerrar la porra de grupos. (${ef.message})`,
        });
        return;
      }
    }
    await cargar();
    setIniciando(null);
    setAviso({
      tipo: 'ok',
      texto:
        n === 1
          ? 'Turno 1 iniciado y porra de grupos cerrada.'
          : `Turno ${n} iniciado.`,
    });
  }

  function abrirEdicion(p: Partido) {
    setEditando(p.id);
    setScore({ a: 0, b: 0 });
    setEditErr(null);
  }

  function paso(side: 'a' | 'b', d: number) {
    setScore((s) => ({ ...s, [side]: Math.max(0, Math.min(10, s[side] + d)) }));
    setEditErr(null);
  }

  async function guardar(p: Partido) {
    const { a, b } = score;
    if (a === b) {
      setEditErr('No puede haber empate: el partido lo gana quien llegue a 10.');
      return;
    }
    if (Math.max(a, b) !== 10) {
      setEditErr('El ganador tiene que llegar exactamente a 10 vasos.');
      return;
    }
    const ganador_id = a > b ? p.equipo_a : p.equipo_b;

    setGuardando(p.id);
    const { error } = await sb
      .from('partidos')
      .update({ vasos_a: a, vasos_b: b, ganador_id, estado: 'jugado' })
      .eq('id', p.id);
    if (error) {
      setGuardando(null);
      setAviso({ tipo: 'err', texto: `No se pudo guardar el resultado. (${error.message})` });
      return;
    }

    // Actualiza local solo tras confirmar Supabase
    const nuevosPartidos = partidos.map((x) =>
      x.id === p.id ? { ...x, vasos_a: a, vasos_b: b, ganador_id, estado: 'jugado' as const } : x,
    );

    // ¿El grupo queda completo? (sus 6 partidos jugados)
    const delGrupo = nuevosPartidos.filter((x) => x.grupo_id === p.grupo_id);
    const completo = delGrupo.length === 6 && delGrupo.every((x) => x.estado === 'jugado');
    let avisoOk = 'Resultado guardado.';
    if (completo) {
      // 1º del grupo por clasificación (PTS → DIF → VF): lo necesita la porra.
      const equipoIds = [...new Set(delGrupo.flatMap((x) => [x.equipo_a, x.equipo_b]))];
      const ganadorId = clasificar(equipoIds, delGrupo)[0]?.equipoId ?? null;
      const { error: eg } = await sb
        .from('grupos')
        .update({ estado: 'completo', ganador_id: ganadorId })
        .eq('id', p.grupo_id);
      if (eg) {
        setPartidos(nuevosPartidos);
        setGuardando(null);
        setEditando(null);
        setAviso({
          tipo: 'err',
          texto: `Resultado guardado, pero no se pudo marcar el grupo como completo. (${eg.message})`,
        });
        return;
      }
      setGrupos(
        (prev) =>
          prev &&
          prev.map((g) =>
            g.id === p.grupo_id ? { ...g, estado: 'completo', ganador_id: ganadorId } : g,
          ),
      );
      avisoOk = `Grupo completo: los 6 partidos están jugados.`;
    }

    setPartidos(nuevosPartidos);
    setGuardando(null);
    setEditando(null);
    setAviso({ tipo: 'ok', texto: avisoOk });
  }

  if (errorCarga) {
    return (
      <div className="pc-note">
        {errorCarga}
        <div style={{ marginTop: 10 }}>
          <button
            className="pc-btn ghost"
            onClick={() => {
              setGrupos(null);
              void cargar();
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!grupos) return <p className="pc-loading">Cargando grupos…</p>;

  const grupoActivo = visibles.find((g) => g.id === activo) ?? null;
  const partidosActivo = grupoActivo
    ? partidos
        .filter((p) => p.grupo_id === grupoActivo.id)
        .sort((a, b) => a.orden - b.orden)
    : [];

  return (
    <>
      <p className="pc-note-top">
        Activa un turno para abrir sus 6 grupos. Dentro, mete los resultados en el orden que te dé
        la gana.
      </p>

      {TURNOS.map(({ n, label }) => {
        const estado = estadoTurno(n);
        return (
          <div key={n}>
            <div className="pc-turno">
              <div className="tt">
                <div className="tn">TURNO {n}</div>
                <div className="tg">{label}</div>
              </div>
              {estado === 'completo' && <span className="pc-pill ok">✓ COMPLETO</span>}
              {estado === 'en_curso' && <span className="pc-pill live">● EN CURSO</span>}
              {estado === 'pendiente' && <span className="pc-pill pend">PENDIENTE</span>}
              {estado === 'pendiente' && (
                <ConfirmButton
                  className="pc-btn primary"
                  question={
                    n === 1
                      ? 'Iniciar el Turno 1 abre los grupos A–F y CIERRA la porra de grupos para el público (irreversible). ¿Seguir?'
                      : `Iniciar el Turno ${n} abre los grupos ${label.replace('Grupos ', '')}. ¿Seguir?`
                  }
                  confirmLabel={n === 1 ? 'Sí, iniciar y cerrar porra' : 'Sí, iniciar'}
                  disabled={iniciando !== null}
                  busy={iniciando === n}
                  busyLabel="Iniciando…"
                  onConfirm={() => void iniciarTurno(n)}
                >
                  Iniciar Turno {n}
                </ConfirmButton>
              )}
            </div>
          </div>
        );
      })}

      {visibles.length > 0 && (
        <div className="pc-chips">
          {visibles.map((g) => {
            const done = jugadosDe(g.id);
            return (
              <button
                key={g.id}
                className={`pc-chip${g.id === activo ? ' on' : ''}`}
                onClick={() => setSel(g.id)}
              >
                {g.letra}
                {done === 6 && <span className="bd ok">✓</span>}
                {done > 0 && done < 6 && <span className="bd pend" />}
              </button>
            );
          })}
        </div>
      )}

      {grupoActivo && (
        <div>
          <p className="pc-gtitle">
            Grupo {grupoActivo.letra} ·{' '}
            <b>
              {partidosActivo.filter((p) => p.estado === 'jugado').length}/
              {partidosActivo.length || 6} partidos
            </b>
          </p>

          {partidosActivo.length === 0 && (
            <div className="pc-note">
              Este grupo aún no tiene partidos. Genéralos en la pestaña «Equipos».
            </div>
          )}

          {partidosActivo.map((p) => {
            const a = nombre(p.equipo_a);
            const b = nombre(p.equipo_b);

            if (p.estado === 'jugado') {
              return (
                <div className="pc-row" key={p.id}>
                  <div className="rn">
                    <span className="a">{a}</span>
                    <span className="vs">vs</span>
                    <span className="b">{b}</span>
                  </div>
                  <span className="rs">
                    {p.vasos_a}–{p.vasos_b}
                  </span>
                  <span className="win">{nombre(p.ganador_id)}</span>
                </div>
              );
            }

            if (editando === p.id) {
              const guardandoEste = guardando === p.id;
              return (
                <div className="pc-edit" key={p.id}>
                  <div className="pc-elabel">
                    <span className="dot" />
                    Introduce el resultado
                  </div>
                  <div className={`pc-erow${score.a > score.b ? ' lead' : ''}`}>
                    <span className="en">{a}</span>
                    <div className="pc-step">
                      <button
                        className="pc-sb"
                        disabled={guardandoEste || score.a === 0}
                        onClick={() => paso('a', -1)}
                        aria-label={`Quitar vaso a ${a}`}
                      >
                        −
                      </button>
                      <span className="pc-sv">{score.a}</span>
                      <button
                        className="pc-sb"
                        disabled={guardandoEste || score.a === 10}
                        onClick={() => paso('a', 1)}
                        aria-label={`Sumar vaso a ${a}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <div className={`pc-erow${score.b > score.a ? ' lead' : ''}`}>
                    <span className="en">{b}</span>
                    <div className="pc-step">
                      <button
                        className="pc-sb"
                        disabled={guardandoEste || score.b === 0}
                        onClick={() => paso('b', -1)}
                        aria-label={`Quitar vaso a ${b}`}
                      >
                        −
                      </button>
                      <span className="pc-sv">{score.b}</span>
                      <button
                        className="pc-sb"
                        disabled={guardandoEste || score.b === 10}
                        onClick={() => paso('b', 1)}
                        aria-label={`Sumar vaso a ${b}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <p className="pc-hint">Gana quien llegue a 10. Sin empates.</p>
                  {editErr && <p className="pc-editerr">{editErr}</p>}
                  <button
                    className="pc-save"
                    disabled={guardandoEste}
                    onClick={() => void guardar(p)}
                  >
                    {guardandoEste ? 'Guardando…' : 'Guardar resultado'}
                  </button>
                </div>
              );
            }

            return (
              <div className="pc-row pend" key={p.id}>
                <div className="rn">
                  <span className="a">{a}</span>
                  <span className="vs">vs</span>
                  <span className="b">{b}</span>
                </div>
                <button className="pc-btn ghost" onClick={() => abrirEdicion(p)}>
                  Meter resultado
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Toast aviso={aviso} />
    </>
  );
}
