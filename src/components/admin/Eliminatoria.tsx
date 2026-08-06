import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Id } from '../../lib/clasificacion';
import {
  NOMBRE_RONDA,
  construirSemillas,
  fasesDesde,
  filasDieciseisavos,
  filasSiguienteRonda,
  mapaSemillas,
  type FaseElim,
} from './acciones';
import ConfirmarCruces, { RetrasarHora } from './ConfirmarCruces';
import {
  BotonRegenerar,
  ConfirmButton,
  ErrorPersistente,
  TarjetaCorreccion,
  Toast,
  textoBorrado,
  textoCorreccion,
  useAviso,
  type ErrorOp,
} from './ui';
import { vigilar } from './red';

const sb = supabase!;

type Fase = 'grupo' | FaseElim;

interface Partido {
  id: Id;
  fase: Fase;
  grupo_id: number | null;
  orden: number;
  equipo_a: Id | null;
  equipo_b: Id | null;
  vasos_a: number | null;
  vasos_b: number | null;
  ganador_id: Id | null;
  estado: 'pendiente' | 'en_juego' | 'jugado';
  publicado: boolean;
  mesa: number | null;
  tanda: number | null;
}

interface FaseInfo {
  nombre: string;
  porra_abierta: boolean;
  hora_inicio: string | null;
}

// Rondas que vive esta pestaña (semifinal/final van en Semis·Final).
const RONDAS = [
  { fase: 'dieciseisavos' as const, label: 'DIECISEISAVOS' },
  { fase: 'octavos' as const, label: 'OCTAVOS' },
  { fase: 'cuartos' as const, label: 'CUARTOS' },
];

// Aviso al corregir un cruce cuya ronda siguiente ya existe (punto crítico:
// se permite corregir, pero el humano decide si regenera).
const SIGUIENTE: Partial<Record<Fase, Fase>> = {
  dieciseisavos: 'octavos',
  octavos: 'cuartos',
  cuartos: 'semifinal',
};
const AVISO_SIGUIENTE: Partial<Record<Fase, string>> = {
  octavos: 'OJO: los octavos ya están generados. Si cambias este resultado tendrás que regenerarlos.',
  cuartos: 'OJO: los cuartos ya están generados. Si cambias este resultado tendrás que regenerarlos.',
  semifinal:
    'OJO: las semifinales ya están generadas. Si cambias este resultado tendrás que regenerarlas.',
};

const LABEL_EMPIEZA: Record<string, string> = {
  dieciseisavos: 'Empieza la primera tanda',
  octavos: 'Empieza la primera tanda',
  cuartos: 'Empiezan los cuartos',
  semifinal: 'Empiezan las semifinales',
};

export default function Eliminatoria() {
  const [grupos, setGrupos] = useState<{ id: number; estado: string }[]>([]);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [fases, setFases] = useState<FaseInfo[]>([]);
  const [nombres, setNombres] = useState<Map<Id, string>>(new Map());
  const [listo, setListo] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useAviso();
  const [errOp, setErrOp] = useState<ErrorOp | null>(null);

  const [ronda, setRonda] = useState<Fase | null>(null);
  const [accion, setAccion] = useState(false); // generando una ronda
  const [marcando, setMarcando] = useState<Id | null>(null);
  const [cancelando, setCancelando] = useState<Id | null>(null);
  const [guardando, setGuardando] = useState<Id | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<Id | null>(null);
  const [scores, setScores] = useState<Record<string, { a: number; b: number }>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    const [rPartidos, rGrupos, rEquipos, rFases] = await Promise.all([
      sb
        .from('partidos')
        .select(
          'id,fase,grupo_id,orden,equipo_a,equipo_b,vasos_a,vasos_b,ganador_id,estado,publicado,mesa,tanda',
        )
        .order('orden', { ascending: true }),
      sb.from('grupos').select('id,estado'),
      sb.from('equipos').select('id,nombre_equipo'),
      sb.from('fases').select('nombre,porra_abierta,hora_inicio'),
    ]);
    vigilar(rPartidos);
    vigilar(rGrupos);
    vigilar(rEquipos);
    vigilar(rFases);
    if (rPartidos.error || rGrupos.error || rEquipos.error || rFases.error) {
      setErrorCarga('No se pudo cargar la eliminatoria.');
      return;
    }
    setPartidos(rPartidos.data as Partido[]);
    setGrupos(rGrupos.data as { id: number; estado: string }[]);
    setFases(rFases.data as FaseInfo[]);
    setNombres(
      new Map(
        (rEquipos.data as { id: Id; nombre_equipo: string }[]).map((e) => [e.id, e.nombre_equipo]),
      ),
    );
    setListo(true);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const nombre = useCallback((id: Id | null) => (id != null && nombres.get(id)) || '—', [nombres]);

  const deFase = useCallback((f: Fase) => partidos.filter((p) => p.fase === f), [partidos]);
  const existe = useCallback((f: Fase) => partidos.some((p) => p.fase === f), [partidos]);
  const esBorrador = useCallback(
    (f: Fase) => {
      const ps = deFase(f);
      return ps.length > 0 && ps.some((p) => !p.publicado);
    },
    [deFase],
  );
  const todosJugados = useCallback(
    (f: Fase) => {
      const ps = deFase(f);
      return ps.length > 0 && ps.every((p) => p.estado === 'jugado');
    },
    [deFase],
  );
  const faseInfo = useCallback((f: string) => fases.find((x) => x.nombre === f) ?? null, [fases]);

  const gruposCompletos = grupos.filter((g) => g.estado === 'completo').length;
  const todosLosGrupos = grupos.length > 0 && gruposCompletos === grupos.length;

  // Semillas 1–32 para pintar el borrador (solo calculables con los grupos cerrados).
  const semillas = useMemo(
    () => (todosLosGrupos ? mapaSemillas(partidos) : null),
    [todosLosGrupos, partidos],
  );

  function patch(id: Id, cambios: Partial<Partido>) {
    setPartidos((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  }

  // ---- generación (SIEMPRE en borrador: publicado=false y porra cerrada) ----
  async function generarDieciseisavos() {
    setErrOp(null);
    setAccion(true);
    if (!todosLosGrupos) {
      setAccion(false);
      setAviso({ tipo: 'err', texto: `Los ${grupos.length || 13} grupos deben estar completos.` });
      return;
    }
    const { data: ex, error: e0 } = vigilar(
      await sb.from('partidos').select('id').eq('fase', 'dieciseisavos').limit(1),
    );
    if (e0) {
      setAccion(false);
      setErrOp({
        texto: `No se pudo comprobar la ronda; no se ha creado nada. (${e0.message})`,
        reintentar: () => void generarDieciseisavos(),
      });
      return;
    }
    if (ex.length > 0) {
      setAccion(false);
      setAviso({ tipo: 'err', texto: 'Ya existen los dieciseisavos: no se ha creado nada.' });
      return;
    }

    const filas = filasDieciseisavos(construirSemillas(partidos));
    const { error } = vigilar(await sb.from('partidos').insert(filas));
    if (error) {
      setAccion(false);
      setErrOp({
        texto: `No se pudieron crear los dieciseisavos. (${error.message})`,
        reintentar: () => void generarDieciseisavos(),
      });
      return;
    }
    await cargar();
    setRonda('dieciseisavos');
    setAccion(false);
    setAviso({
      tipo: 'ok',
      texto: 'Dieciseisavos sembrados EN BORRADOR: revisa los cruces y confirma.',
    });
  }

  async function generarRonda(anterior: FaseElim, nueva: FaseElim, okMsg: string) {
    setErrOp(null);
    setAccion(true);
    const prev = deFase(anterior).sort((a, b) => a.orden - b.orden);
    if (prev.length === 0 || !prev.every((p) => p.estado === 'jugado')) {
      setAccion(false);
      setAviso({ tipo: 'err', texto: 'La ronda anterior aún no está terminada.' });
      return;
    }
    const { data: ex, error: e0 } = vigilar(
      await sb.from('partidos').select('id').eq('fase', nueva).limit(1),
    );
    if (e0) {
      setAccion(false);
      setErrOp({
        texto: `No se pudo comprobar la ronda; no se ha creado nada. (${e0.message})`,
        reintentar: () => void generarRonda(anterior, nueva, okMsg),
      });
      return;
    }
    if (ex.length > 0) {
      setAccion(false);
      setAviso({ tipo: 'err', texto: 'Esa ronda ya existe: no se ha creado nada.' });
      return;
    }

    const { error } = vigilar(await sb.from('partidos').insert(filasSiguienteRonda(nueva, prev)));
    if (error) {
      setAccion(false);
      setErrOp({
        texto: `No se pudo crear la ronda. (${error.message})`,
        reintentar: () => void generarRonda(anterior, nueva, okMsg),
      });
      return;
    }
    await cargar();
    if (nueva === 'octavos' || nueva === 'cuartos') setRonda(nueva);
    setAccion(false);
    setAviso({ tipo: 'ok', texto: okMsg });
  }

  // Volver a generar una fase tras el borrado del BotonRegenerar.
  async function regenerarFase(f: Fase) {
    if (f === 'dieciseisavos') return generarDieciseisavos();
    if (f === 'octavos')
      return generarRonda('dieciseisavos', 'octavos', 'Octavos regenerados en borrador.');
    if (f === 'cuartos') return generarRonda('octavos', 'cuartos', 'Cuartos regenerados en borrador.');
    return generarRonda('cuartos', 'semifinal', 'Semifinales regeneradas en borrador.');
  }

  // Al arrancar el PRIMER cruce de una fase se apaga también la bandera de su
  // porra: la fase ya ha empezado y los contadores/chips no deben mentir.
  // (El cierre por cruce sigue igual: esto solo apaga la bandera.)
  async function cerrarPorraFase(nombreFase: string) {
    setErrOp(null);
    const { error } = vigilar(
      await sb.from('fases').update({ porra_abierta: false }).eq('nombre', nombreFase),
    );
    if (error) {
      setErrOp({
        texto: `El cruce está en juego, pero NO se pudo cerrar la porra de la fase. (${error.message})`,
        reintentar: () => void cerrarPorraFase(nombreFase),
      });
      return;
    }
    setFases((prev) =>
      prev.map((f) => (f.nombre === nombreFase ? { ...f, porra_abierta: false } : f)),
    );
  }

  // ---- partidos ----
  async function marcarEnJuego(p: Partido) {
    const primeraDeLaFase = deFase(p.fase).every((x) => x.estado === 'pendiente');
    setErrOp(null);
    setMarcando(p.id);
    const { error } = vigilar(
      await sb.from('partidos').update({ estado: 'en_juego' }).eq('id', p.id),
    );
    setMarcando(null);
    if (error) {
      setErrOp({
        texto: `No se pudo marcar en juego ${nombre(p.equipo_a)} vs ${nombre(p.equipo_b)}. (${error.message})`,
        reintentar: () => void marcarEnJuego(p),
      });
      return;
    }
    patch(p.id, { estado: 'en_juego' });
    setScores((s) => ({ ...s, [String(p.id)]: { a: 0, b: 0 } }));
    if (primeraDeLaFase) await cerrarPorraFase(p.fase);
  }

  // Deshacer un «Marcar en juego» que fue un error (mesa o cruce equivocado).
  async function cancelarEnJuego(p: Partido) {
    setErrOp(null);
    setCancelando(p.id);
    const { error } = vigilar(
      await sb.from('partidos').update({ estado: 'pendiente' }).eq('id', p.id),
    );
    setCancelando(null);
    if (error) {
      setErrOp({
        texto: `No se pudo devolver el cruce a pendiente. (${error.message})`,
        reintentar: () => void cancelarEnJuego(p),
      });
      return;
    }
    patch(p.id, { estado: 'pendiente' });
    setAviso({ tipo: 'ok', texto: 'El cruce vuelve a pendiente.' });
  }

  function paso(p: Partido, side: 'a' | 'b', d: number) {
    setScores((s) => {
      const cur = s[String(p.id)] ?? { a: 0, b: 0 };
      return { ...s, [String(p.id)]: { ...cur, [side]: Math.max(0, Math.min(10, cur[side] + d)) } };
    });
    setErrs((e) => ({ ...e, [String(p.id)]: '' }));
  }

  async function guardar(p: Partido) {
    const { a, b } = scores[String(p.id)] ?? { a: 0, b: 0 };
    if (a === b) {
      setErrs((e) => ({ ...e, [String(p.id)]: 'No puede haber empate: tiene que haber un ganador.' }));
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
    setGuardando(null);
    if (error) {
      setErrOp({
        texto: `No se pudo guardar ${nombre(p.equipo_a)} ${a}–${b} ${nombre(p.equipo_b)}. (${error.message})`,
        reintentar: () => void guardar(p),
      });
      return;
    }
    patch(p.id, { vasos_a: a, vasos_b: b, ganador_id, estado: 'jugado' });
    setAviso({ tipo: 'ok', texto: 'Resultado guardado.' });
  }

  function abrirCorreccion(p: Partido) {
    setCorrigiendo(p.id);
    setScores((s) => ({ ...s, [String(p.id)]: { a: p.vasos_a ?? 0, b: p.vasos_b ?? 0 } }));
  }

  // Corrección de un cruce ya jugado: sobrescribe marcador y ganador.
  async function corregir(p: Partido, a: number, b: number) {
    const ganador_id = a > b ? p.equipo_a : p.equipo_b;
    setErrOp(null);
    setGuardando(p.id);
    const { error } = vigilar(
      await sb.from('partidos').update({ vasos_a: a, vasos_b: b, ganador_id }).eq('id', p.id),
    );
    setGuardando(null);
    if (error) {
      setErrOp({
        texto: `No se pudo corregir el resultado; sigue guardado ${p.vasos_a}–${p.vasos_b}. (${error.message})`,
        reintentar: () => void corregir(p, a, b),
      });
      return;
    }
    patch(p.id, { vasos_a: a, vasos_b: b, ganador_id });
    setCorrigiendo(null);
    setAviso({ tipo: 'ok', texto: 'Resultado corregido.' });
  }

  // ---- acción de generación contextual (la "siguiente ronda") ----
  const siguiente = useMemo(() => {
    const nota =
      'Se crea EN BORRADOR: el público no lo ve hasta que revises y confirmes los cruces.';
    if (!existe('dieciseisavos'))
      return {
        label: 'Generar dieciseisavos',
        puede: todosLosGrupos,
        hint: 'Se activa cuando los 13 grupos estén completos.',
        pregunta:
          'Sembrar los 32 clasificados en 16 cruces de dieciseisavos, en borrador (el público no lo ve). ¿Seguir?',
        run: generarDieciseisavos,
        nota,
      };
    if (!existe('octavos'))
      return {
        label: 'Generar octavos',
        puede: todosJugados('dieciseisavos'),
        hint: 'Se activa cuando los 16 dieciseisavos estén jugados.',
        pregunta:
          'Crear los 8 octavos con los ganadores de dieciseisavos, en borrador (el público no lo ve). ¿Seguir?',
        run: () => generarRonda('dieciseisavos', 'octavos', 'Octavos creados EN BORRADOR: revisa y confirma.'),
        nota,
      };
    if (!existe('cuartos'))
      return {
        label: 'Generar cuartos',
        puede: todosJugados('octavos'),
        hint: 'Se activa cuando los 8 octavos estén jugados.',
        pregunta:
          'Crear los 4 cuartos con los ganadores de octavos, en borrador (el público no lo ve). ¿Seguir?',
        run: () => generarRonda('octavos', 'cuartos', 'Cuartos creados EN BORRADOR: revisa y confirma.'),
        nota,
      };
    if (!existe('semifinal'))
      return {
        label: 'Generar semifinales',
        puede: todosJugados('cuartos'),
        hint: 'Se activa cuando los 4 cuartos estén jugados.',
        pregunta:
          'Crear las 2 semifinales con los ganadores de cuartos, en borrador (el público no lo ve). ¿Seguir?',
        run: () =>
          generarRonda('cuartos', 'semifinal', 'Semifinales creadas EN BORRADOR: revisa y confirma.'),
        nota: 'Se revisan aquí; se juegan en la pestaña «Semis · Final».',
      };
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partidos, grupos, gruposCompletos]);

  if (errorCarga) {
    return (
      <div className="pc-note">
        {errorCarga}
        <div style={{ marginTop: 10 }}>
          <button
            className="pc-btn ghost"
            onClick={() => {
              setListo(false);
              void cargar();
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }
  if (!listo) return <p className="pc-loading">Cargando eliminatoria…</p>;

  const rondasExistentes = RONDAS.filter((r) => existe(r.fase));
  const rondaActiva: FaseElim | null =
    ronda && ronda !== 'grupo' && existe(ronda)
      ? (ronda as FaseElim)
      : rondasExistentes.length
        ? rondasExistentes[rondasExistentes.length - 1].fase
        : null;

  const partidosRonda = rondaActiva
    ? deFase(rondaActiva).sort((a, b) => a.orden - b.orden)
    : [];
  // Agrupa por tanda (orden asc dentro de cada una)
  const tandas = [...new Set(partidosRonda.map((p) => p.tanda ?? 1))].sort((x, y) => x - y);
  const infoRondaActiva = rondaActiva ? faseInfo(rondaActiva) : null;

  return (
    <>
      <p className="pc-note-top">
        Las rondas nacen en borrador: revisa los cruces, pon la hora y confirma para hacerlas
        públicas. Marcar un cruce «en juego» cierra su porra al momento.
      </p>

      {existe('dieciseisavos') && (
        <div className="pc-rounds">
          {RONDAS.map((r) => {
            const bloqueada = !existe(r.fase);
            return (
              <button
                key={r.fase}
                className={`pc-round${r.fase === rondaActiva ? ' on' : ''}${bloqueada ? ' lock' : ''}`}
                disabled={bloqueada}
                onClick={() => setRonda(r.fase)}
              >
                {r.label}
                {bloqueada ? ' 🔒' : ''}
              </button>
            );
          })}
        </div>
      )}

      {/* Ronda en borrador: bloque de revisión + confirmación (sin tandas aún) */}
      {rondaActiva && esBorrador(rondaActiva) && (
        <ConfirmarCruces
          fase={rondaActiva}
          fasePorra={rondaActiva}
          nombreLegible={NOMBRE_RONDA[rondaActiva]}
          labelEmpieza={LABEL_EMPIEZA[rondaActiva]}
          partidos={partidosRonda}
          nombre={nombre}
          semillas={semillas}
          onCambiado={cargar}
          onOk={(texto) => setAviso({ tipo: 'ok', texto })}
        />
      )}

      {rondaActiva && !esBorrador(rondaActiva) && (
        <>
          {infoRondaActiva?.porra_abierta && infoRondaActiva.hora_inicio && (
            <RetrasarHora
              fasePorra={rondaActiva}
              horaInicio={infoRondaActiva.hora_inicio}
              onCambiado={cargar}
              onOk={(texto) => setAviso({ tipo: 'ok', texto })}
            />
          )}
          <div className="pc-tandas">
            {tandas.map((t, idx) => {
              const deTanda = partidosRonda.filter((p) => (p.tanda ?? 1) === t);
              const anterior =
                idx > 0 ? partidosRonda.filter((p) => (p.tanda ?? 1) === tandas[idx - 1]) : [];
              const bloqueada = idx > 0 && !anterior.some((p) => p.estado === 'jugado');
              const mesas = deTanda.map((p) => p.mesa ?? 0).filter((m) => m > 0);
              const sub =
                mesas.length > 0 ? `Mesas ${Math.min(...mesas)}–${Math.max(...mesas)}` : '';
              return (
                <div key={t} className={`pc-tanda${bloqueada ? ' locked' : ''}`}>
                  <div className="pc-tt-head">
                    <span className="pc-tt-name">TANDA {t}</span>
                    <span className="pc-tt-sub">{sub}</span>
                  </div>
                  {bloqueada ? (
                    <div className="pc-note">
                      🔒 Se activa cuando se libere una mesa de la Tanda {tandas[idx - 1]}.
                    </div>
                  ) : (
                    deTanda.map((p) => {
                      if (corrigiendo === p.id && p.estado === 'jugado') {
                        const score = scores[String(p.id)] ?? { a: 0, b: 0 };
                        const nuevoGanador = score.a > score.b ? p.equipo_a : p.equipo_b;
                        const valido = score.a !== score.b;
                        const cambia = score.a !== p.vasos_a || score.b !== p.vasos_b;
                        const rondaSiguiente = SIGUIENTE[p.fase];
                        return (
                          <TarjetaCorreccion
                            key={p.id}
                            nombreA={nombre(p.equipo_a)}
                            nombreB={nombre(p.equipo_b)}
                            marcadorActual={`${p.vasos_a}–${p.vasos_b}`}
                            score={score}
                            pregunta={textoCorreccion({
                              antes: [p.vasos_a ?? 0, p.vasos_b ?? 0],
                              ahora: [score.a, score.b],
                              ganadorAntes: nombre(p.ganador_id),
                              ganadorAhora: nombre(nuevoGanador),
                              avisoRonda:
                                rondaSiguiente && existe(rondaSiguiente)
                                  ? AVISO_SIGUIENTE[rondaSiguiente]
                                  : null,
                            })}
                            puedeGuardar={valido && cambia}
                            guardando={guardando === p.id}
                            onPaso={(side, d) => paso(p, side, d)}
                            onConfirmar={() => void corregir(p, score.a, score.b)}
                            onSalir={() => setCorrigiendo(null)}
                          />
                        );
                      }
                      return (
                        <ElimRow
                          key={p.id}
                          p={p}
                          a={nombre(p.equipo_a)}
                          b={nombre(p.equipo_b)}
                          ganador={nombre(p.ganador_id)}
                          score={scores[String(p.id)] ?? { a: 0, b: 0 }}
                          err={errs[String(p.id)] || null}
                          marcando={marcando === p.id}
                          cancelando={cancelando === p.id}
                          guardando={guardando === p.id}
                          onMarcar={() => void marcarEnJuego(p)}
                          onCancelar={() => void cancelarEnJuego(p)}
                          onPaso={(side, d) => paso(p, side, d)}
                          onGuardar={() => void guardar(p)}
                          onCorregir={() => abrirCorreccion(p)}
                        />
                      );
                    })
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Semifinales: se revisan y confirman aquí; se juegan en Semis·Final */}
      {existe('semifinal') && esBorrador('semifinal') && (
        <div className="eq-block">
          <div className="pc-tt-head">
            <span className="pc-tt-name">SEMIFINALES · BORRADOR</span>
          </div>
          <ConfirmarCruces
            fase="semifinal"
            fasePorra="semifinal"
            nombreLegible={NOMBRE_RONDA.semifinal}
            labelEmpieza={LABEL_EMPIEZA.semifinal}
            partidos={deFase('semifinal').sort((a, b) => a.orden - b.orden)}
            nombre={nombre}
            semillas={semillas}
            onCambiado={cargar}
            onOk={(texto) => setAviso({ tipo: 'ok', texto })}
          />
        </div>
      )}
      {existe('semifinal') &&
        !esBorrador('semifinal') &&
        faseInfo('semifinal')?.porra_abierta &&
        faseInfo('semifinal')?.hora_inicio && (
          <div className="eq-block">
            <div className="pc-tt-head">
              <span className="pc-tt-name">SEMIFINALES</span>
            </div>
            <RetrasarHora
              fasePorra="semifinal"
              horaInicio={faseInfo('semifinal')!.hora_inicio!}
              onCambiado={cargar}
              onOk={(texto) => setAviso({ tipo: 'ok', texto })}
            />
          </div>
        )}

      {rondaActiva && !esBorrador(rondaActiva) && (
        <div className="eq-block">
          <BotonRegenerar
            etiqueta={`Regenerar ${NOMBRE_RONDA[rondaActiva]}`}
            fases={fasesDesde(rondaActiva)}
            resumen={(info) =>
              `${textoBorrado(info, fasesDesde(rondaActiva))} Después se volverán a crear ${NOMBRE_RONDA[rondaActiva]} en borrador con ${
                rondaActiva === 'dieciseisavos'
                  ? 'la clasificación actual de los grupos'
                  : 'los ganadores actuales de la ronda anterior'
              }, para revisar y confirmar. ¿Seguir?`
            }
            onRegenerar={() => regenerarFase(rondaActiva)}
            disabled={accion}
          />
        </div>
      )}

      {existe('semifinal') && !esBorrador('semifinal') && (
        <BotonRegenerar
          etiqueta="Regenerar las semifinales"
          fases={fasesDesde('semifinal')}
          resumen={(info) =>
            `${textoBorrado(info, fasesDesde('semifinal'))} Después se volverán a crear las semifinales en borrador con los ganadores actuales de los cuartos, para revisar y confirmar. ¿Seguir?`
          }
          onRegenerar={() => regenerarFase('semifinal')}
          disabled={accion}
        />
      )}

      {siguiente && (
        <div className="eq-block">
          <ConfirmButton
            className="pc-btn primary block"
            question={siguiente.pregunta}
            disabled={!siguiente.puede || accion}
            busy={accion}
            busyLabel="Generando…"
            onConfirm={() => void siguiente.run()}
          >
            {siguiente.label}
          </ConfirmButton>
          {!siguiente.puede && <p className="pc-hint">{siguiente.hint}</p>}
          {siguiente.nota && <p className="pc-hint">{siguiente.nota}</p>}
        </div>
      )}

      <ErrorPersistente err={errOp} onDescartar={() => setErrOp(null)} />
      <Toast aviso={aviso} />
    </>
  );
}

function ElimRow({
  p,
  a,
  b,
  ganador,
  score,
  err,
  marcando,
  cancelando,
  guardando,
  onMarcar,
  onCancelar,
  onPaso,
  onGuardar,
  onCorregir,
}: {
  p: Partido;
  a: string;
  b: string;
  ganador: string;
  score: { a: number; b: number };
  err: string | null;
  marcando: boolean;
  cancelando: boolean;
  guardando: boolean;
  onMarcar: () => void;
  onCancelar: () => void;
  onPaso: (side: 'a' | 'b', d: number) => void;
  onGuardar: () => void;
  onCorregir: () => void;
}) {
  if (p.estado === 'jugado') {
    return (
      <div className="pc-row">
        <div className="rn">
          <span className="a">{a}</span>
          <span className="vs">vs</span>
          <span className="b">{b}</span>
        </div>
        <span className="rs">
          {p.vasos_a}–{p.vasos_b}
        </span>
        <span className="win">{ganador}</span>
        <button className="pc-corr" disabled={guardando} onClick={onCorregir}>
          Corregir
        </button>
      </div>
    );
  }

  if (p.estado === 'en_juego') {
    return (
      <div className="pc-edit">
        <div className="pc-elabel">
          <span className="dot" />
          EN JUEGO
          <span className="pc-mesa">MESA {p.mesa}</span>
        </div>
        <div className={`pc-erow${score.a > score.b ? ' lead' : ''}`}>
          <span className="en">{a}</span>
          <div className="pc-step">
            <button className="pc-sb" disabled={guardando || score.a === 0} onClick={() => onPaso('a', -1)}>
              −
            </button>
            <span className="pc-sv">{score.a}</span>
            <button className="pc-sb" disabled={guardando || score.a === 10} onClick={() => onPaso('a', 1)}>
              +
            </button>
          </div>
        </div>
        <div className={`pc-erow${score.b > score.a ? ' lead' : ''}`}>
          <span className="en">{b}</span>
          <div className="pc-step">
            <button className="pc-sb" disabled={guardando || score.b === 0} onClick={() => onPaso('b', -1)}>
              −
            </button>
            <span className="pc-sv">{score.b}</span>
            <button className="pc-sb" disabled={guardando || score.b === 10} onClick={() => onPaso('b', 1)}>
              +
            </button>
          </div>
        </div>
        <p className="pc-hint">Al marcar en juego se cerró la porra de este cruce.</p>
        {err && <p className="pc-editerr">{err}</p>}
        <button className="pc-save" disabled={guardando || cancelando} onClick={onGuardar}>
          {guardando ? 'Guardando…' : 'Guardar resultado'}
        </button>
        <ConfirmButton
          className="pc-salir"
          question="El cruce volverá a «pendiente» (te equivocaste de mesa o de cruce). Ojo: la porra de este cruce ya se cerró y no se reabre. ¿Seguir?"
          confirmLabel="Sí, volver a pendiente"
          disabled={guardando}
          busy={cancelando}
          busyLabel="Cancelando…"
          onConfirm={onCancelar}
        >
          Cancelar «en juego»
        </ConfirmButton>
      </div>
    );
  }

  return (
    <div className="pc-row pend">
      <div className="rn">
        <span className="a">{a}</span>
        <span className="vs">{'vs'}</span>
        <span className="b">{b}</span>
      </div>
      <button className="pc-btn ghost" disabled={marcando} onClick={onMarcar}>
        {marcando ? '…' : 'Marcar en juego'}
      </button>
    </div>
  );
}
