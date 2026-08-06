import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { mesaDeGrupo } from '../../lib/horarios';
import { derivarGrupo } from './acciones';
import {
  ConfirmButton,
  ErrorPersistente,
  TarjetaCorreccion,
  Toast,
  textoCorreccion,
  useAviso,
  type ErrorOp,
} from './ui';
import { vigilar } from './red';

const sb = supabase!;

type Id = string | number;
type EstadoGrupo = 'pendiente' | 'en_curso' | 'completo';

interface Grupo {
  id: number; // 1-13
  letra: string; // 'A'-'M'
  turno: number; // 0 = M (18:30), 1 = A-F, 2 = G-L
  estado: EstadoGrupo;
  ganador_id: Id | null;
}

interface Partido {
  id: Id;
  grupo_id: number;
  orden: number; // 0-5 (0-2 en el grupo M)
  equipo_a: Id;
  equipo_b: Id;
  vasos_a: number | null;
  vasos_b: number | null;
  ganador_id: Id | null;
  estado: 'pendiente' | 'jugado';
}

// El turno 0 es el grupo M solo: juega a las 18:30, antes del turno 1.
const TURNOS = [
  { n: 0, label: 'Grupo M · 18:30' },
  { n: 1, label: 'Grupos A–F' },
  { n: 2, label: 'Grupos G–L' },
];

export default function Grupos() {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [nombres, setNombres] = useState<Map<Id, string>>(new Map());
  const [hayEliminatoria, setHayEliminatoria] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useAviso();
  const [errOp, setErrOp] = useState<ErrorOp | null>(null);

  const [sel, setSel] = useState<number | null>(null); // chip de grupo seleccionado
  const [iniciando, setIniciando] = useState<number | null>(null); // turno en proceso
  const [editando, setEditando] = useState<Id | null>(null); // partido en edición (nuevo o corrección)
  const [score, setScore] = useState<{ a: number; b: number }>({ a: 0, b: 0 });
  const [editErr, setEditErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState<Id | null>(null);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    const [rGrupos, rPartidos, rEquipos, rElim] = await Promise.all([
      sb.from('grupos').select('id,letra,turno,estado,ganador_id').order('id', { ascending: true }),
      sb
        .from('partidos')
        .select('id,grupo_id,orden,equipo_a,equipo_b,vasos_a,vasos_b,ganador_id,estado')
        .eq('fase', 'grupo')
        .order('grupo_id', { ascending: true })
        .order('orden', { ascending: true }),
      sb.from('equipos').select('id,nombre_equipo'),
      sb.from('partidos').select('id').eq('fase', 'dieciseisavos').limit(1),
    ]);
    vigilar(rGrupos);
    vigilar(rPartidos);
    vigilar(rEquipos);
    vigilar(rElim);
    if (rGrupos.error || rPartidos.error || rEquipos.error || rElim.error) {
      setErrorCarga('No se pudieron cargar los grupos.');
      return;
    }
    setGrupos(rGrupos.data as Grupo[]);
    setPartidos(rPartidos.data as Partido[]);
    setHayEliminatoria(rElim.data.length > 0);
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
  // Partidos totales del grupo (6 en los de 4, 3 en el grupo M); 0 = sin generar.
  const totalDe = useCallback(
    (gid: number) => partidos.filter((p) => p.grupo_id === gid).length,
    [partidos],
  );

  async function iniciarTurno(n: number) {
    setErrOp(null);
    setIniciando(n);
    // 1) abrir los 6 grupos del turno
    const { error: eg } = vigilar(
      await sb.from('grupos').update({ estado: 'en_curso' }).eq('turno', n),
    );
    if (eg) {
      setIniciando(null);
      setErrOp({
        texto: `No se pudo iniciar el turno ${n}. (${eg.message})`,
        reintentar: () => void iniciarTurno(n),
      });
      return;
    }
    // 2) el Turno 1 cierra además la porra de grupos (irreversible de cara al público)
    if (n === 1) {
      const { error: ef } = vigilar(
        await sb.from('fases').update({ porra_abierta: false }).eq('nombre', 'grupos'),
      );
      if (ef) {
        await cargar();
        setIniciando(null);
        setErrOp({
          texto: `Turno 1 iniciado, pero NO se pudo cerrar la porra de grupos. (${ef.message})`,
          reintentar: () => void cerrarPorraGrupos(),
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
          : n === 0
            ? 'Grupo M iniciado.'
            : `Turno ${n} iniciado.`,
    });
  }

  // Reintento aislado del cierre de porra (el turno ya quedó iniciado).
  async function cerrarPorraGrupos() {
    setErrOp(null);
    const { error } = vigilar(
      await sb.from('fases').update({ porra_abierta: false }).eq('nombre', 'grupos'),
    );
    if (error) {
      setErrOp({
        texto: `Sigue sin poder cerrarse la porra de grupos. (${error.message})`,
        reintentar: () => void cerrarPorraGrupos(),
      });
      return;
    }
    setAviso({ tipo: 'ok', texto: 'Porra de grupos cerrada.' });
  }

  function abrirEdicion(p: Partido) {
    setEditando(p.id);
    // Corrección: precarga el marcador guardado; partido nuevo: 0–0.
    setScore(
      p.estado === 'jugado' ? { a: p.vasos_a ?? 0, b: p.vasos_b ?? 0 } : { a: 0, b: 0 },
    );
    setEditErr(null);
  }

  function paso(side: 'a' | 'b', d: number) {
    setScore((s) => ({ ...s, [side]: Math.max(0, Math.min(10, s[side] + d)) }));
    setEditErr(null);
  }

  // Reescribe estado y 1º de un grupo. Con reintento propio: si falla, el
  // resultado del partido YA está guardado y solo hay que repetir esta parte.
  async function reescribirGrupo(
    gid: number,
    estado: EstadoGrupo,
    ganadorId: Id | null,
    avisoOk: string,
  ) {
    setErrOp(null);
    const { error } = vigilar(
      await sb.from('grupos').update({ estado, ganador_id: ganadorId }).eq('id', gid),
    );
    if (error) {
      setErrOp({
        texto: `El resultado está guardado, pero no se pudo actualizar el grupo (estado y 1º). (${error.message})`,
        reintentar: () => void reescribirGrupo(gid, estado, ganadorId, avisoOk),
      });
      return;
    }
    setGrupos(
      (prev) =>
        prev && prev.map((g) => (g.id === gid ? { ...g, estado, ganador_id: ganadorId } : g)),
    );
    setAviso({ tipo: 'ok', texto: avisoOk });
  }

  async function guardar(p: Partido) {
    const { a, b } = score;
    if (a === b) {
      setEditErr('No puede haber empate: tiene que haber un ganador.');
      return;
    }
    const ganador_id = a > b ? p.equipo_a : p.equipo_b;

    setErrOp(null);
    setGuardando(p.id);
    const { error } = vigilar(
      await sb
        .from('partidos')
        .update({ vasos_a: a, vasos_b: b, ganador_id, estado: 'jugado' })
        .eq('id', p.id),
    );
    if (error) {
      setGuardando(null);
      setErrOp({
        texto: `No se pudo guardar ${nombre(p.equipo_a)} ${a}–${b} ${nombre(p.equipo_b)}. (${error.message})`,
        reintentar: () => void guardar(p),
      });
      return;
    }

    // Actualiza local solo tras confirmar Supabase
    const nuevosPartidos = partidos.map((x) =>
      x.id === p.id ? { ...x, vasos_a: a, vasos_b: b, ganador_id, estado: 'jugado' as const } : x,
    );
    setPartidos(nuevosPartidos);
    setGuardando(null);
    setEditando(null);

    // ¿El grupo queda completo? (sus 6 partidos jugados)
    const delGrupo = nuevosPartidos.filter((x) => x.grupo_id === p.grupo_id);
    const { estado, ganadorId } = derivarGrupo(delGrupo);
    if (estado === 'completo') {
      await reescribirGrupo(
        p.grupo_id,
        estado,
        ganadorId,
        `Grupo completo: los ${delGrupo.length} partidos están jugados.`,
      );
    } else {
      setAviso({ tipo: 'ok', texto: 'Resultado guardado.' });
    }
  }

  // Corrección de un partido ya jugado: sobrescribe el marcador y recalcula
  // SIEMPRE el estado y el 1º del grupo (pueden cambiar con la corrección).
  async function corregir(p: Partido, a: number, b: number) {
    const ganador_id = a > b ? p.equipo_a : p.equipo_b;
    setErrOp(null);
    setGuardando(p.id);
    const { error } = vigilar(
      await sb.from('partidos').update({ vasos_a: a, vasos_b: b, ganador_id }).eq('id', p.id),
    );
    if (error) {
      setGuardando(null);
      setErrOp({
        texto: `No se pudo corregir el resultado; sigue guardado ${p.vasos_a}–${p.vasos_b}. (${error.message})`,
        reintentar: () => void corregir(p, a, b),
      });
      return;
    }
    const nuevosPartidos = partidos.map((x) =>
      x.id === p.id ? { ...x, vasos_a: a, vasos_b: b, ganador_id } : x,
    );
    setPartidos(nuevosPartidos);
    setGuardando(null);
    setEditando(null);

    const delGrupo = nuevosPartidos.filter((x) => x.grupo_id === p.grupo_id);
    const { estado, ganadorId } = derivarGrupo(delGrupo);
    await reescribirGrupo(p.grupo_id, estado, ganadorId, 'Resultado corregido.');
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
  // Mesa del grupo, derivada de su orden dentro del turno (el M usa la 1 y la 2).
  const mesaActivo = grupoActivo
    ? grupoActivo.turno === 0
      ? 'Mesas 1–2'
      : `Mesa ${mesaDeGrupo(grupoActivo.id, grupos)}`
    : null;

  return (
    <>
      <p className="pc-note-top">
        Activa un turno para abrir sus grupos (el grupo M va solo, a las 18:30). Dentro, mete los
        resultados en el orden que te dé la gana. Un resultado guardado se puede corregir con su
        botón «Corregir».
      </p>

      {TURNOS.filter(
        // El turno 0 solo se pinta si la fila del grupo M existe en la BD.
        ({ n }) => n !== 0 || (grupos ?? []).some((g) => g.turno === 0),
      ).map(({ n, label }) => {
        const estado = estadoTurno(n);
        return (
          <div key={n}>
            <div className="pc-turno">
              <div className="tt">
                <div className="tn">{n === 0 ? 'GRUPO M' : `TURNO ${n}`}</div>
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
                      : n === 0
                        ? 'Abrir el grupo M: sus 6 partidos se juegan en dos mesas a las 18:30, antes del turno 1. ¿Seguir?'
                        : `Iniciar el Turno ${n} abre los grupos ${label.replace('Grupos ', '')}. ¿Seguir?`
                  }
                  confirmLabel={n === 1 ? 'Sí, iniciar y cerrar porra' : 'Sí, iniciar'}
                  disabled={iniciando !== null}
                  busy={iniciando === n}
                  busyLabel="Iniciando…"
                  onConfirm={() => void iniciarTurno(n)}
                >
                  {n === 0 ? 'Iniciar Grupo M' : `Iniciar Turno ${n}`}
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
            const total = totalDe(g.id);
            return (
              <button
                key={g.id}
                className={`pc-chip${g.id === activo ? ' on' : ''}`}
                onClick={() => setSel(g.id)}
              >
                {g.letra}
                {total > 0 && done === total && <span className="bd ok">✓</span>}
                {done > 0 && done < total && <span className="bd pend" />}
              </button>
            );
          })}
        </div>
      )}

      {grupoActivo && (
        <div>
          <p className="pc-gtitle">
            Grupo {grupoActivo.letra} · {mesaActivo} ·{' '}
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

            // Corrección de un partido ya jugado
            if (editando === p.id && p.estado === 'jugado') {
              const nuevoGanador = score.a > score.b ? p.equipo_a : p.equipo_b;
              const valido = score.a !== score.b;
              const cambia = score.a !== p.vasos_a || score.b !== p.vasos_b;
              return (
                <TarjetaCorreccion
                  key={p.id}
                  nombreA={a}
                  nombreB={b}
                  marcadorActual={`${p.vasos_a}–${p.vasos_b}`}
                  score={score}
                  pregunta={textoCorreccion({
                    antes: [p.vasos_a ?? 0, p.vasos_b ?? 0],
                    ahora: [score.a, score.b],
                    ganadorAntes: nombre(p.ganador_id),
                    ganadorAhora: nombre(nuevoGanador),
                    avisoRonda: hayEliminatoria
                      ? 'OJO: los dieciseisavos ya están generados. Si cambias este resultado tendrás que regenerarlos en la pestaña Eliminatoria.'
                      : null,
                  })}
                  puedeGuardar={valido && cambia}
                  guardando={guardando === p.id}
                  onPaso={paso}
                  onConfirmar={() => void corregir(p, score.a, score.b)}
                  onSalir={() => setEditando(null)}
                />
              );
            }

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
                  <button
                    className="pc-corr"
                    disabled={guardando !== null}
                    onClick={() => abrirEdicion(p)}
                  >
                    Corregir
                  </button>
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

      <ErrorPersistente err={errOp} onDescartar={() => setErrOp(null)} />
      <Toast aviso={aviso} />
    </>
  );
}
