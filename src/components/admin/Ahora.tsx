import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Id } from '../../lib/clasificacion';
import {
  NOMBRE_RONDA,
  ORDEN_ELIM,
  construirSemillas,
  derivarGrupo,
  filasDieciseisavos,
  filasPartidosGrupo,
  filasSiguienteRonda,
  horaCorta,
  mapaSemillas,
  mesaDePartidoGrupo,
  type FaseElim,
} from './acciones';
import ConfirmarCruces, { RetrasarHora } from './ConfirmarCruces';
import { ConfirmButton, ErrorPersistente, Toast, useAviso, type ErrorOp } from './ui';
import { vigilar } from './red';

const sb = supabase!;

// «Ahora»: la puerta de entrada del panel la noche del torneo. Una cabecera
// que dice en qué punto está la noche, UNA tarjeta con la siguiente acción y
// la lista de partidos que se pueden resolver ya. Todo lo demás (hurgar,
// corregir, regenerar) sigue viviendo en sus pestañas.

type TabDestino = 'equipos' | 'grupos' | 'elim' | 'semis';

interface Equipo {
  id: Id;
  nombre_equipo: string;
  estado: 'confirmado' | 'espera' | 'pagado' | 'rechazado';
  grupo_id: number | null;
  pos_grupo: number | null;
}

interface GrupoRow {
  id: number;
  letra: string;
  turno: number;
  estado: 'pendiente' | 'en_curso' | 'completo';
  ganador_id: Id | null;
}

interface Partido {
  id: Id;
  fase: 'grupo' | FaseElim;
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

const LABEL_FASE: Record<string, string> = {
  dieciseisavos: 'DIECISEISAVOS',
  octavos: 'OCTAVOS',
  cuartos: 'CUARTOS',
  semifinal: 'SEMIFINALES',
  final: 'FINAL',
};

type Modo =
  | { t: 'colocar' }
  | { t: 'generar72' }
  | { t: 'iniciarTurno'; n: number }
  | { t: 'turno'; n: number }
  | { t: 'generarElim'; fase: FaseElim }
  | { t: 'revisar'; fase: FaseElim }
  | { t: 'ronda'; fase: FaseElim }
  | { t: 'semisFinal' }
  | { t: 'campeon' };

export default function Ahora({ onIr }: { onIr: (tab: TabDestino) => void }) {
  const [equipos, setEquipos] = useState<Equipo[]>([]);
  const [grupos, setGrupos] = useState<GrupoRow[]>([]);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [fases, setFases] = useState<FaseInfo[]>([]);
  const [modoEvento, setModoEvento] = useState<boolean | null>(null); // null = sin cargar
  const [cambiandoModo, setCambiandoModo] = useState(false);
  const [listo, setListo] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useAviso();
  const [errOp, setErrOp] = useState<ErrorOp | null>(null);

  const [accion, setAccion] = useState(false); // generación / inicio de turno en curso
  const [marcando, setMarcando] = useState<Id | null>(null);
  const [editando, setEditando] = useState<Id | null>(null);
  const [score, setScore] = useState({ a: 0, b: 0 });
  const [editErr, setEditErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [avanzado, setAvanzado] = useState(false);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    const [rEquipos, rGrupos, rPartidos, rFases, rConfig] = await Promise.all([
      sb.from('equipos').select('id,nombre_equipo,estado,grupo_id,pos_grupo'),
      sb.from('grupos').select('id,letra,turno,estado,ganador_id').order('id'),
      sb
        .from('partidos')
        .select(
          'id,fase,grupo_id,orden,equipo_a,equipo_b,vasos_a,vasos_b,ganador_id,estado,publicado,mesa,tanda',
        )
        .order('orden', { ascending: true }),
      sb.from('fases').select('nombre,porra_abierta,hora_inicio'),
      sb.from('config').select('modo_evento').eq('id', 1).maybeSingle(),
    ]);
    vigilar(rEquipos);
    vigilar(rGrupos);
    vigilar(rPartidos);
    vigilar(rFases);
    vigilar(rConfig);
    if (rEquipos.error || rGrupos.error || rPartidos.error || rFases.error) {
      setErrorCarga('No se pudo cargar el estado del torneo.');
      return;
    }
    setEquipos(rEquipos.data as Equipo[]);
    setGrupos(rGrupos.data as GrupoRow[]);
    setPartidos(rPartidos.data as Partido[]);
    setFases(rFases.data as FaseInfo[]);
    // Sin fila de config no hay interruptor, pero el resto del panel funciona.
    if (!rConfig.error && rConfig.data) setModoEvento(Boolean(rConfig.data.modo_evento));
    setListo(true);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // ---- derivados ----
  const nombres = useMemo(
    () => new Map(equipos.map((e) => [e.id, e.nombre_equipo])),
    [equipos],
  );
  const nombre = useCallback((id: Id | null) => (id != null && nombres.get(id)) || '—', [nombres]);

  const activos = useMemo(
    () => equipos.filter((e) => e.estado === 'confirmado' || e.estado === 'pagado'),
    [equipos],
  );
  const asignados = activos.filter((e) => e.grupo_id != null).length;
  const sinGrupo = activos.length - asignados;

  const posPorGrupo = useMemo(() => {
    const m = new Map<number, Map<number, Id>>();
    for (const e of activos) {
      if (e.grupo_id != null && e.pos_grupo != null) {
        const g = m.get(e.grupo_id) ?? new Map<number, Id>();
        g.set(e.pos_grupo, e.id);
        m.set(e.grupo_id, g);
      }
    }
    return m;
  }, [activos]);
  // Un grupo está listo con 3 o 4 equipos en posiciones seguidas (los de 3
  // juegan 3 cruces). Condición por tamaño, dinámica: nada atado a letras.
  const gruposLlenos = useMemo(() => {
    let n = 0;
    for (let gid = 1; gid <= 13; gid++) {
      const posiciones = posPorGrupo.get(gid);
      if (
        posiciones &&
        (posiciones.size === 3 || posiciones.size === 4) &&
        Array.from({ length: posiciones.size }, (_, i) => i + 1).every((x) => posiciones.has(x))
      )
        n++;
    }
    return n;
  }, [posPorGrupo]);
  // Partidos de grupo previstos con las asignaciones actuales (n·(n−1)/2).
  const totalPrevisto = useMemo(() => {
    let n = 0;
    for (const posiciones of posPorGrupo.values()) n += (posiciones.size * (posiciones.size - 1)) / 2;
    return n;
  }, [posPorGrupo]);

  const deFase = useCallback(
    (f: string) => partidos.filter((p) => p.fase === f).sort((a, b) => a.orden - b.orden),
    [partidos],
  );
  const partidosGrupo = useMemo(() => deFase('grupo'), [deFase]);
  const jugadosGrupo = partidosGrupo.filter((p) => p.estado === 'jugado').length;
  const gruposCompletosCnt = grupos.filter((g) => g.estado === 'completo').length;

  const turnoEstado = useCallback(
    (n: number): 'pendiente' | 'en_curso' | 'completo' => {
      const gs = grupos.filter((g) => g.turno === n);
      if (gs.length === 0) return 'pendiente';
      if (gs.every((g) => g.estado === 'completo')) return 'completo';
      if (gs.every((g) => g.estado === 'pendiente')) return 'pendiente';
      return 'en_curso';
    },
    [grupos],
  );

  const faseInfo = useCallback((n: string) => fases.find((f) => f.nombre === n) ?? null, [fases]);

  // ---- la máquina de estados: qué toca AHORA ----
  const modo: Modo = useMemo(() => {
    if (partidosGrupo.length === 0) {
      return gruposLlenos === 13 && sinGrupo === 0 ? { t: 'generar72' } : { t: 'colocar' };
    }
    // El grupo M (turno 0) va primero: juega a las 18:30, antes del turno 1.
    // (Si la fila del grupo M no existe en la BD, el turno 0 no pinta nada.)
    if (grupos.some((g) => g.turno === 0)) {
      const t0 = turnoEstado(0);
      if (t0 === 'pendiente') return { t: 'iniciarTurno', n: 0 };
      if (t0 !== 'completo') return { t: 'turno', n: 0 };
    }
    const t1 = turnoEstado(1);
    if (t1 === 'pendiente') return { t: 'iniciarTurno', n: 1 };
    if (t1 !== 'completo') return { t: 'turno', n: 1 };
    const t2 = turnoEstado(2);
    if (t2 === 'pendiente') return { t: 'iniciarTurno', n: 2 };
    if (t2 !== 'completo') return { t: 'turno', n: 2 };
    for (const f of ORDEN_ELIM) {
      const ps = deFase(f);
      if (ps.length === 0) return { t: 'generarElim', fase: f };
      if (ps.some((p) => !p.publicado)) return { t: 'revisar', fase: f };
      if (!ps.every((p) => p.estado === 'jugado')) {
        return f === 'semifinal' || f === 'final' ? { t: 'semisFinal' } : { t: 'ronda', fase: f };
      }
    }
    return { t: 'campeon' };
  }, [partidosGrupo, gruposLlenos, sinGrupo, turnoEstado, deFase, grupos]);

  const semillas = useMemo(
    () =>
      grupos.length > 0 && gruposCompletosCnt === grupos.length ? mapaSemillas(partidos) : null,
    [grupos.length, gruposCompletosCnt, partidos],
  );

  // ---- acciones directas ----
  async function generar72() {
    setErrOp(null);
    setAccion(true);
    const { data: ex, error: e0 } = vigilar(
      await sb.from('partidos').select('id').eq('fase', 'grupo').limit(1),
    );
    if (e0 || ex.length > 0) {
      setAccion(false);
      if (e0)
        setErrOp({
          texto: `No se pudo comprobar si ya hay partidos. (${e0.message})`,
          reintentar: () => void generar72(),
        });
      else setAviso({ tipo: 'err', texto: 'Ya existen los partidos de grupo.' });
      await cargar();
      return;
    }
    const { error } = vigilar(await sb.from('partidos').insert(filasPartidosGrupo(posPorGrupo)));
    setAccion(false);
    if (error) {
      setErrOp({
        texto: `No se pudieron crear los partidos. (${error.message})`,
        reintentar: () => void generar72(),
      });
      return;
    }
    await cargar();
    setAviso({ tipo: 'ok', texto: 'Creados los partidos de la fase de grupos.' });
  }

  async function iniciarTurno(n: number) {
    setErrOp(null);
    setAccion(true);
    const { error: eg } = vigilar(
      await sb.from('grupos').update({ estado: 'en_curso' }).eq('turno', n),
    );
    if (eg) {
      setAccion(false);
      setErrOp({
        texto: `No se pudo iniciar el turno ${n}. (${eg.message})`,
        reintentar: () => void iniciarTurno(n),
      });
      return;
    }
    if (n === 1) {
      const { error: ef } = vigilar(
        await sb.from('fases').update({ porra_abierta: false }).eq('nombre', 'grupos'),
      );
      if (ef) {
        await cargar();
        setAccion(false);
        setErrOp({
          texto: `Turno 1 iniciado, pero NO se pudo cerrar la porra de grupos. (${ef.message})`,
          reintentar: () => void cerrarPorraGrupos(),
        });
        return;
      }
    }
    await cargar();
    setAccion(false);
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

  // Interruptor global: la landing redirige (o no) a /torneo. Nace apagado;
  // se enciende el 3 de agosto desde aquí, sin desplegar nada.
  async function cambiarModoEvento(nuevo: boolean) {
    setErrOp(null);
    setCambiandoModo(true);
    const { error } = vigilar(
      await sb.from('config').update({ modo_evento: nuevo }).eq('id', 1),
    );
    setCambiandoModo(false);
    if (error) {
      setErrOp({
        texto: `No se pudo ${nuevo ? 'activar' : 'apagar'} el modo evento. (${error.message})`,
        reintentar: () => void cambiarModoEvento(nuevo),
      });
      return;
    }
    setModoEvento(nuevo);
    setAviso({
      tipo: 'ok',
      texto: nuevo
        ? 'Modo evento ACTIVO: la web lleva directa al torneo.'
        : 'Modo evento apagado: la web vuelve a enseñar la landing.',
    });
  }

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

  async function generarElim(f: FaseElim) {
    setErrOp(null);
    setAccion(true);
    const { data: ex, error: e0 } = vigilar(
      await sb.from('partidos').select('id').eq('fase', f).limit(1),
    );
    if (e0 || ex.length > 0) {
      setAccion(false);
      if (e0)
        setErrOp({
          texto: `No se pudo comprobar la ronda; no se ha creado nada. (${e0.message})`,
          reintentar: () => void generarElim(f),
        });
      else setAviso({ tipo: 'err', texto: 'Esa ronda ya existe.' });
      await cargar();
      return;
    }
    const filas =
      f === 'dieciseisavos'
        ? filasDieciseisavos(construirSemillas(partidos))
        : filasSiguienteRonda(f, deFase(ORDEN_ELIM[ORDEN_ELIM.indexOf(f) - 1]));
    const { error } = vigilar(await sb.from('partidos').insert(filas));
    setAccion(false);
    if (error) {
      setErrOp({
        texto: `No se pudo crear la ronda. (${error.message})`,
        reintentar: () => void generarElim(f),
      });
      return;
    }
    await cargar();
    setAviso({
      tipo: 'ok',
      texto: `Creados ${NOMBRE_RONDA[f]} EN BORRADOR: revisa los cruces y confirma.`,
    });
  }

  // Al arrancar el PRIMER cruce de una fase se apaga también la bandera de su
  // porra (la fase ya ha empezado; los contadores/chips no deben mentir).
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
    }
  }

  async function empezarTanda(f: FaseElim, tanda: number) {
    const primeraDeLaFase = deFase(f).every((p) => p.estado === 'pendiente');
    setErrOp(null);
    setAccion(true);
    const { error } = vigilar(
      await sb
        .from('partidos')
        .update({ estado: 'en_juego' })
        .eq('fase', f)
        .eq('tanda', tanda)
        .eq('estado', 'pendiente'),
    );
    setAccion(false);
    if (error) {
      setErrOp({
        texto: `No se pudo poner la tanda ${tanda} en juego. (${error.message})`,
        reintentar: () => void empezarTanda(f, tanda),
      });
      return;
    }
    if (primeraDeLaFase) await cerrarPorraFase(f);
    await cargar();
    setAviso({ tipo: 'ok', texto: `Tanda ${tanda} en juego: su porra queda cerrada.` });
  }

  async function marcarEnJuego(p: Partido) {
    const primeraDeLaFase =
      p.fase !== 'grupo' && deFase(p.fase).every((x) => x.estado === 'pendiente');
    setErrOp(null);
    setMarcando(p.id);
    const { error } = vigilar(
      await sb.from('partidos').update({ estado: 'en_juego' }).eq('id', p.id),
    );
    setMarcando(null);
    if (error) {
      setErrOp({
        texto: `No se pudo marcar en juego. (${error.message})`,
        reintentar: () => void marcarEnJuego(p),
      });
      return;
    }
    if (primeraDeLaFase) await cerrarPorraFase(p.fase);
    await cargar();
  }

  function abrirEditor(p: Partido) {
    setEditando(p.id);
    setScore({ a: 0, b: 0 });
    setEditErr(null);
  }

  async function guardarResultado(p: Partido, a: number, b: number) {
    if (a === b) {
      setEditErr('No puede haber empate: gana quien llegue a 10.');
      return;
    }
    if (Math.max(a, b) !== 10) {
      setEditErr('El ganador tiene que llegar exactamente a 10.');
      return;
    }
    const ganador_id = a > b ? p.equipo_a : p.equipo_b;
    setErrOp(null);
    setGuardando(true);
    const { error } = vigilar(
      await sb
        .from('partidos')
        .update({ vasos_a: a, vasos_b: b, ganador_id, estado: 'jugado' })
        .eq('id', p.id),
    );
    if (error) {
      setGuardando(false);
      setErrOp({
        texto: `No se pudo guardar ${nombre(p.equipo_a)} ${a}–${b} ${nombre(p.equipo_b)}. (${error.message})`,
        reintentar: () => void guardarResultado(p, a, b),
      });
      return;
    }
    // En fase de grupos, el grupo puede quedar completo (o cambiar su 1º).
    if (p.fase === 'grupo' && p.grupo_id != null) {
      const delGrupo = partidosGrupo
        .filter((x) => x.grupo_id === p.grupo_id)
        .map((x) => (x.id === p.id ? { ...x, vasos_a: a, vasos_b: b, estado: 'jugado' } : x));
      const { estado, ganadorId } = derivarGrupo(delGrupo);
      if (estado === 'completo') {
        const { error: eg } = vigilar(
          await sb.from('grupos').update({ estado, ganador_id: ganadorId }).eq('id', p.grupo_id),
        );
        if (eg) {
          setGuardando(false);
          setEditando(null);
          await cargar();
          setErrOp({
            texto: `Resultado guardado, pero no se pudo cerrar el grupo. (${eg.message})`,
            reintentar: () => void reescribirGrupo(p.grupo_id!, ganadorId),
          });
          return;
        }
      }
    }
    setGuardando(false);
    setEditando(null);
    await cargar();
    setAviso({ tipo: 'ok', texto: 'Resultado guardado.' });
  }

  async function reescribirGrupo(gid: number, ganadorId: Id | null) {
    setErrOp(null);
    const { error } = vigilar(
      await sb.from('grupos').update({ estado: 'completo', ganador_id: ganadorId }).eq('id', gid),
    );
    if (error) {
      setErrOp({
        texto: `Sigue sin poder cerrarse el grupo. (${error.message})`,
        reintentar: () => void reescribirGrupo(gid, ganadorId),
      });
      return;
    }
    await cargar();
    setAviso({ tipo: 'ok', texto: 'Grupo cerrado.' });
  }

  // ---- cabecera según el modo ----
  const cab = useMemo(() => {
    switch (modo.t) {
      case 'colocar':
        return {
          fase: 'ANTES DE EMPEZAR',
          titulo: 'Faltan equipos por colocar',
          prog: 0,
          sub: `${asignados} / ${activos.length} ASIGNADOS · ${sinGrupo} SIN GRUPO`,
        };
      case 'generar72':
        return {
          fase: 'ANTES DE EMPEZAR',
          titulo: `${asignados} equipos, 13 grupos`,
          prog: 0,
          sub: 'GRUPOS A–M COMPLETOS · PARTIDOS SIN GENERAR',
        };
      case 'iniciarTurno':
        return {
          fase: 'FASE DE GRUPOS',
          titulo:
            modo.n === 0 ? 'Grupo M listo para empezar' : `Turno ${modo.n} listo para empezar`,
          prog: (jugadosGrupo / (partidosGrupo.length || 1)) * 100,
          sub:
            modo.n === 0
              ? `${jugadosGrupo} / ${partidosGrupo.length} RESULTADOS · GRUPO M A LAS 18:30 · 2 MESAS`
              : `${jugadosGrupo} / ${partidosGrupo.length} RESULTADOS · 6 MESAS LIBRES`,
        };
      case 'turno':
        return {
          fase: modo.n === 0 ? 'FASE DE GRUPOS · GRUPO M' : `FASE DE GRUPOS · TURNO ${modo.n}`,
          titulo: 'Metiendo resultados',
          prog: (jugadosGrupo / (partidosGrupo.length || 1)) * 100,
          sub: `${jugadosGrupo} / ${partidosGrupo.length} RESULTADOS · ${gruposCompletosCnt} GRUPOS COMPLETOS`,
        };
      case 'generarElim':
        return modo.fase === 'dieciseisavos'
          ? {
              fase: 'FASE DE GRUPOS',
              titulo: 'Los 13 grupos, cerrados',
              prog: 100,
              sub: `${partidosGrupo.length} / ${partidosGrupo.length} RESULTADOS · CLASIFICACIÓN SELLADA`,
            }
          : {
              fase: LABEL_FASE[modo.fase],
              titulo: `Toca generar ${NOMBRE_RONDA[modo.fase]}`,
              prog: 0,
              sub: 'RONDA ANTERIOR CERRADA',
            };
      case 'revisar': {
        const n = deFase(modo.fase).length;
        return {
          fase: LABEL_FASE[modo.fase],
          titulo: 'Cuadro en borrador',
          prog: 0,
          sub: `SOLO LO VES TÚ · ${n} CRUCES`,
        };
      }
      case 'ronda': {
        const ps = deFase(modo.fase);
        const jugados = ps.filter((p) => p.estado === 'jugado').length;
        const enJuego = ps.filter((p) => p.estado === 'en_juego').length;
        return {
          fase: LABEL_FASE[modo.fase],
          titulo: enJuego > 0 ? 'Cruces en juego' : 'Porra abierta',
          prog: (jugados / ps.length) * 100,
          sub: `${jugados} / ${ps.length} CRUCES · ${enJuego} EN JUEGO`,
        };
      }
      case 'semisFinal':
        return {
          fase: 'SEMIS · FINAL',
          titulo: 'Se juega en directo',
          prog: 90,
          sub: 'CADA TOQUE SE VE EN 500 MÓVILES',
        };
      case 'campeon':
        return {
          fase: 'TORNEO TERMINADO',
          titulo: '¡Campeón!',
          prog: 100,
          sub: `${partidos.filter((p) => p.estado === 'jugado').length} PARTIDOS JUGADOS`,
        };
    }
  }, [modo, asignados, activos, sinGrupo, jugadosGrupo, partidosGrupo, gruposCompletosCnt, deFase, partidos, grupos]);

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
  if (!listo) return <p className="pc-loading">Leyendo el estado del torneo…</p>;

  return (
    <>
      <div className="pc-nhdr">
        <div className="top">
          <div style={{ minWidth: 0 }}>
            <div className="f">{cab.fase}</div>
            <div className="h">{cab.titulo}</div>
          </div>
          <Reloj />
        </div>
        <div className="prog">
          <i style={{ width: `${cab.prog}%` }} />
        </div>
        <div className="sub">{cab.sub}</div>
      </div>

      {modoEvento != null && (
        <div className="pc-turno">
          <div className="tt">
            <div className="tn">MODO EVENTO</div>
            <div className="tg">La web lleva directa al torneo</div>
          </div>
          {modoEvento ? (
            <span className="pc-pill live">● ACTIVO</span>
          ) : (
            <span className="pc-pill pend">APAGADO</span>
          )}
          <ConfirmButton
            className={modoEvento ? 'pc-btn ghost' : 'pc-btn primary'}
            question={
              modoEvento
                ? 'La web volverá a enseñar la landing de inscripción a todo el mundo. ¿Seguir?'
                : 'elperezyesos.com pasará a llevar DIRECTA al torneo. La landing seguirá viva en /?landing=1. ¿Seguir?'
            }
            confirmLabel={modoEvento ? 'Sí, apagar' : 'Sí, activar'}
            busy={cambiandoModo}
            busyLabel="Cambiando…"
            onConfirm={() => void cambiarModoEvento(!modoEvento)}
          >
            {modoEvento ? 'Apagar' : 'Activar'}
          </ConfirmButton>
        </div>
      )}

      {contenido()}

      <div className="pc-more">
        <button onClick={() => onIr('equipos')}>Equipos</button>
        <button onClick={() => onIr('grupos')}>Grupos</button>
        <button onClick={() => onIr('elim')}>Eliminatoria</button>
        <button onClick={() => onIr('semis')}>Semis · Final</button>
        <button className="danger" onClick={() => setAvanzado((v) => !v)}>
          Avanzado
        </button>
      </div>
      {avanzado && (
        <div className="pc-note" style={{ marginTop: 10, textAlign: 'left' }}>
          Lo destructivo vive en sus pestañas, con sus propias confirmaciones:
          <br />· <b>Regenerar rondas</b> (borra cruces y apuestas) → Eliminatoria / Semis·Final
          <br />· <b>Regenerar los partidos de grupo</b> y <b>vaciar el sorteo</b> → Equipos
        </div>
      )}

      <ErrorPersistente err={errOp} onDescartar={() => setErrOp(null)} />
      <Toast aviso={aviso} />
    </>
  );

  // ---- cuerpo según el modo ----
  function contenido() {
    switch (modo.t) {
      case 'colocar':
        return (
          <div className="pc-act">
            <div className="pc-act-l">
              <span className="d" />
              Siguiente paso
            </div>
            <div className="pc-act-h">Termina de colocar los equipos</div>
            <div className="pc-act-p">
              {sinGrupo > 0
                ? `Hay ${sinGrupo} equipos sin grupo. Colócalos a mano o usa el sorteo.`
                : 'Faltan grupos por completar (4 equipos justos en cada uno).'}
            </div>
            <button className="pc-act-btn" onClick={() => onIr('equipos')}>
              Ir a Equipos
            </button>
          </div>
        );

      case 'generar72':
        return (
          <div className="pc-act">
            <div className="pc-act-l">
              <span className="d" />
              Siguiente paso
            </div>
            <div className="pc-act-h">Generar los partidos de grupo</div>
            <div className="pc-act-p">
              Se crearán los cruces de cada grupo ({totalPrevisto} en total: 6 por grupo de 4 y 3
              por grupo de 3) con las asignaciones actuales.
            </div>
            <ConfirmButton
              className="pc-act-btn"
              question={`Crear los ${totalPrevisto} partidos de la fase de grupos (6 por grupo de 4, 3 por grupo de 3). ¿Seguir?`}
              busy={accion}
              busyLabel="Generando…"
              onConfirm={() => void generar72()}
            >
              Generar {totalPrevisto} partidos
            </ConfirmButton>
          </div>
        );

      case 'iniciarTurno': {
        const letras = modo.n === 0 ? 'M' : modo.n === 1 ? 'A–F' : 'G–L';
        return (
          <div className="pc-act">
            <div className="pc-act-l">
              <span className="d" />
              Siguiente paso
            </div>
            <div className="pc-act-h">
              {modo.n === 0 ? 'Empezar el Grupo M · 18:30' : `Iniciar Turno ${modo.n} · grupos ${letras}`}
            </div>
            <div className="pc-act-p">
              {modo.n === 0 ? (
                'El grupo M juega sus 6 partidos en dos mesas a las 18:30, antes del turno 1. Como todos: pasan su 1º y su 2º, y su 3º pelea el repesque.'
              ) : modo.n === 1 ? (
                <>
                  Se abren las 6 mesas. <b>Esto cierra la porra de grupos</b> y ya nadie podrá
                  apostar los ganadores de grupo.
                </>
              ) : (
                'Los 6 grupos del turno 1 están cerrados. Las 6 mesas quedan libres para el segundo turno.'
              )}
            </div>
            <ConfirmButton
              className="pc-act-btn"
              question={
                modo.n === 0
                  ? 'Abrir el grupo M: sus 6 partidos, en dos mesas a las 18:30. ¿Seguir?'
                  : modo.n === 1
                    ? 'Iniciar el Turno 1 abre los grupos A–F y CIERRA la porra de grupos (irreversible). ¿Seguir?'
                    : 'Iniciar el Turno 2 abre los grupos G–L. ¿Seguir?'
              }
              confirmLabel={modo.n === 1 ? 'Sí, iniciar y cerrar porra' : 'Sí, iniciar'}
              busy={accion}
              busyLabel="Iniciando…"
              onConfirm={() => void iniciarTurno(modo.n)}
            >
              {modo.n === 0 ? 'Iniciar Grupo M' : `Iniciar Turno ${modo.n}`}
            </ConfirmButton>
          </div>
        );
      }

      case 'turno': {
        const delTurno = partidosGrupo.filter((p) => {
          const g = grupos.find((x) => x.id === p.grupo_id);
          return g?.turno === modo.n;
        });
        const pendientes = delTurno.filter((p) => p.estado === 'pendiente');
        return (
          <>
            <div className="pc-calm">
              <div className="l">Ahora mismo</div>
              <div className="h">Mete resultados según acaben</div>
              <div className="p">
                Da igual el orden. La clasificación se recalcula sola con cada resultado. Corregir
                y demás, en la pestaña Grupos.
              </div>
            </div>
            <div className="pc-sec">
              <span>Esperando resultado</span>
              <span className="mono">{pendientes.length}</span>
            </div>
            {pendientes.map((p) => filaTrabajo(p))}
            {pendientes.length === 0 && (
              <div className="pc-note">No queda nada pendiente en este turno.</div>
            )}
          </>
        );
      }

      case 'generarElim': {
        const f = modo.fase;
        return (
          <div className="pc-act">
            <div className="pc-act-l">
              <span className="d" />
              Siguiente paso
            </div>
            <div className="pc-act-h">
              {f === 'dieciseisavos' ? 'Generar dieciseisavos' : `Generar ${NOMBRE_RONDA[f]}`}
            </div>
            <div className="pc-act-p">
              {f === 'dieciseisavos'
                ? 'Se calculan los 32 clasificados (13 primeros, 13 segundos y los 6 mejores terceros, solo de los grupos de 4) y se emparejan por ranking. '
                : `Se cruzan los ganadores de la ronda anterior. `}
              <b>Nadie lo verá hasta que confirmes.</b>
            </div>
            <ConfirmButton
              className="pc-act-btn"
              question={`Crear ${NOMBRE_RONDA[f]} en borrador (el público no lo ve). ¿Seguir?`}
              busy={accion}
              busyLabel="Generando…"
              onConfirm={() => void generarElim(f)}
            >
              {f === 'dieciseisavos' ? 'Generar cuadro' : `Generar ${NOMBRE_RONDA[f]}`}
            </ConfirmButton>
          </div>
        );
      }

      case 'revisar': {
        const f = modo.fase;
        return (
          <ConfirmarCruces
            fase={f}
            fasePorra={f}
            nombreLegible={NOMBRE_RONDA[f]}
            labelEmpieza={
              f === 'dieciseisavos' || f === 'octavos'
                ? 'Empieza la primera tanda'
                : `${f === 'final' ? 'Empieza' : 'Empiezan'} ${NOMBRE_RONDA[f]}`
            }
            partidos={deFase(f)}
            nombre={nombre}
            semillas={semillas}
            onCambiado={cargar}
            onOk={(texto) => setAviso({ tipo: 'ok', texto })}
          />
        );
      }

      case 'ronda': {
        const f = modo.fase;
        const ps = deFase(f);
        const info = faseInfo(f);
        const enJuego = ps.filter((p) => p.estado === 'en_juego');
        const jugados = ps.filter((p) => p.estado === 'jugado');
        const tandas = [...new Set(ps.map((p) => p.tanda ?? 1))].sort((x, y) => x - y);
        // Primera tanda con pendientes cuya anterior ya liberó alguna mesa.
        const tandaLista = tandas.find((t, idx) => {
          const deTanda = ps.filter((p) => (p.tanda ?? 1) === t);
          if (!deTanda.some((p) => p.estado === 'pendiente')) return false;
          if (idx === 0) return true;
          const anterior = ps.filter((p) => (p.tanda ?? 1) === tandas[idx - 1]);
          return anterior.some((p) => p.estado === 'jugado');
        });
        const deTandaLista = tandaLista
          ? ps.filter((p) => (p.tanda ?? 1) === tandaLista && p.estado === 'pendiente')
          : [];
        const tandaSinEmpezar =
          tandaLista != null &&
          !ps.some((p) => (p.tanda ?? 1) === tandaLista && p.estado !== 'pendiente');
        const mesas = deTandaLista.map((p) => p.mesa ?? 0).filter((m) => m > 0);
        const rangoMesas =
          mesas.length > 0 ? `mesas ${Math.min(...mesas)}–${Math.max(...mesas)}` : '';
        return (
          <>
            {info?.porra_abierta && info.hora_inicio && (
              <CuentaAtrasAdmin
                horaInicio={info.hora_inicio}
                fasePorra={f}
                onCambiado={cargar}
                onOk={(texto) => setAviso({ tipo: 'ok', texto })}
              />
            )}

            {enJuego.length > 0 && (
              <>
                <div className="pc-sec">
                  <span>Jugando ahora</span>
                  <span className="mono am">● {enJuego.length} MESAS</span>
                </div>
                {enJuego.map((p) => filaTrabajo(p))}
              </>
            )}

            {tandaSinEmpezar && deTandaLista.length > 1 ? (
              <>
                <div className="pc-sec">
                  <span>Cuando estés listo</span>
                </div>
                <ConfirmButton
                  className="pc-act-btn dark"
                  question={`Marcará los ${deTandaLista.length} cruces de la tanda ${tandaLista} en juego de golpe y cerrará su porra. ¿Seguir?`}
                  confirmLabel="Sí, empezar tanda"
                  busy={accion}
                  busyLabel="Empezando…"
                  onConfirm={() => void empezarTanda(f, tandaLista!)}
                >
                  Empezar tanda {tandaLista} · {rangoMesas}
                </ConfirmButton>
                <p className="pc-hint">
                  Marcará los {deTandaLista.length} cruces en juego de golpe y cerrará su porra.
                  También puedes marcarlos de uno en uno abajo.
                </p>
              </>
            ) : null}

            {deTandaLista.length > 0 && (
              <>
                <div className="pc-sec">
                  <span>Tanda {tandaLista} · esperando mesa</span>
                  <span className="mono">{deTandaLista.length}</span>
                </div>
                {deTandaLista.map((p) => filaTrabajo(p))}
              </>
            )}

            {jugados.length > 0 && (
              <>
                <div className="pc-sec">
                  <span>Ya jugados</span>
                  <span className="mono">{jugados.length}</span>
                </div>
                {jugados.slice(-3).map((p) => (
                  <div className="pc-row" key={String(p.id)}>
                    <span className="pc-mchip">
                      MESA<b>{p.mesa ?? '—'}</b>
                    </span>
                    <div className="rn">
                      <span className="a">{nombre(p.equipo_a)}</span>
                      <span className="vs">vs</span>
                      <span className="b">{nombre(p.equipo_b)}</span>
                    </div>
                    <span className="rs">
                      {p.vasos_a}–{p.vasos_b}
                    </span>
                  </div>
                ))}
                {jugados.length > 3 && (
                  <p className="pc-hint">
                    Y {jugados.length - 3} más. Corregir cualquiera: pestaña Eliminatoria.
                  </p>
                )}
              </>
            )}
          </>
        );
      }

      case 'semisFinal': {
        const semis = deFase('semifinal');
        const final = deFase('final');
        const pendientesSF = [...semis, ...final].filter((p) => p.estado !== 'jugado');
        return (
          <>
            <div className="pc-act">
              <div className="pc-act-l">
                <span className="d" />
                Siguiente paso
              </div>
              <div className="pc-act-h">Marcador en directo</div>
              <div className="pc-act-p">
                {final.length > 0
                  ? 'La final se lleva desde su pestaña: cada toque se ve en todos los móviles.'
                  : 'Las semifinales se llevan desde su pestaña: cada toque se ve en todos los móviles.'}
              </div>
              <button className="pc-act-btn pk" onClick={() => onIr('semis')}>
                Abrir Semis · Final
              </button>
            </div>
            {pendientesSF.map((p) => (
              <div className="pc-row pend" key={String(p.id)}>
                <span className="pc-mchip">
                  {p.fase === 'final' ? 'FIN' : 'SF'}
                  <b>{p.fase === 'final' ? '★' : p.orden + 1}</b>
                </span>
                <div className="rn">
                  <span className="a">{nombre(p.equipo_a)}</span>
                  <span className="vs">vs</span>
                  <span className="b">{nombre(p.equipo_b)}</span>
                </div>
                <span className="pc-pill pend">{p.estado === 'en_juego' ? 'EN JUEGO' : 'EN COLA'}</span>
              </div>
            ))}
          </>
        );
      }

      case 'campeon': {
        const final = deFase('final')[0];
        return (
          <>
            <div className="pc-champ">
              <div className="cl">CAMPEÓN BEERPONG IV</div>
              <div className="cv">🏆 {final ? nombre(final.ganador_id) : '—'}</div>
              {final && (
                <div className="cs">
                  {final.vasos_a}–{final.vasos_b} en la final
                </div>
              )}
            </div>
            <div className="pc-calm" style={{ marginTop: 14 }}>
              <div className="l">Se acabó</div>
              <div className="h">Torneo completo</div>
              <div className="p">Los resultados y la porra quedan guardados. ¡A recoger!</div>
            </div>
          </>
        );
      }
    }
  }

  // Fila de la lista de trabajo (+ editor de steppers cuando toca).
  function filaTrabajo(p: Partido) {
    const a = nombre(p.equipo_a);
    const b = nombre(p.equipo_b);
    const mesa =
      p.fase === 'grupo' ? mesaDePartidoGrupo(p.grupo_id ?? 1, p.orden) : (p.mesa ?? null);
    const letra = p.fase === 'grupo' ? grupos.find((g) => g.id === p.grupo_id)?.letra : null;

    if (editando === p.id) {
      return (
        <div className="pc-edit" key={String(p.id)}>
          <div className="pc-elabel">
            <span className="dot" />
            {letra ? `MESA ${mesa} · GRUPO ${letra}` : `MESA ${mesa ?? '—'}`}
          </div>
          {(['a', 'b'] as const).map((side) => {
            const nom = side === 'a' ? a : b;
            const v = score[side];
            const otro = side === 'a' ? score.b : score.a;
            return (
              <div className={`pc-erow${v > otro ? ' lead' : ''}`} key={side}>
                <span className="en">{nom}</span>
                <div className="pc-step">
                  <button
                    className="pc-sb"
                    disabled={guardando || v === 0}
                    onClick={() => {
                      setScore((s) => ({ ...s, [side]: s[side] - 1 }));
                      setEditErr(null);
                    }}
                    aria-label={`Quitar vaso a ${nom}`}
                  >
                    −
                  </button>
                  <span className="pc-sv">{v}</span>
                  <button
                    className="pc-sb"
                    disabled={guardando || v === 10}
                    onClick={() => {
                      setScore((s) => ({ ...s, [side]: s[side] + 1 }));
                      setEditErr(null);
                    }}
                    aria-label={`Sumar vaso a ${nom}`}
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
          <p className="pc-hint">Gana quien llegue a 10. Sin empates.</p>
          {editErr && <p className="pc-editerr">{editErr}</p>}
          <button
            className="pc-save"
            disabled={guardando}
            onClick={() => void guardarResultado(p, score.a, score.b)}
          >
            {guardando ? 'Guardando…' : 'Guardar resultado'}
          </button>
          <button className="pc-salir" disabled={guardando} onClick={() => setEditando(null)}>
            Cancelar
          </button>
        </div>
      );
    }

    const enJuego = p.estado === 'en_juego';
    return (
      <div className={`pc-row${enJuego ? ' live' : ' pend'}`} key={String(p.id)}>
        <span className="pc-mchip">
          MESA<b>{mesa ?? '—'}</b>
        </span>
        <div className="rn">
          <span className="a">{a}</span>
          <span className="vs">vs</span>
          <span className="b">{b}</span>
        </div>
        {p.fase !== 'grupo' && p.estado === 'pendiente' ? (
          <button
            className="pc-btn ghost"
            disabled={marcando === p.id}
            onClick={() => void marcarEnJuego(p)}
          >
            {marcando === p.id ? '…' : 'En juego'}
          </button>
        ) : (
          <button className="pc-go" onClick={() => abrirEditor(p)}>
            Resultado
          </button>
        )}
      </div>
    );
  }
}

/** Reloj de la cabecera (HH:MM, refresco cada 20 s, aislado del resto). */
function Reloj() {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAhora(new Date()), 20000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="clock">
      <span>HORA</span>
      {horaCorta(ahora)}
    </div>
  );
}

/** Tarjeta rosa de porra abierta: cuenta atrás + retrasar. Solo informa:
    al llegar a cero no se cierra nada. */
function CuentaAtrasAdmin({
  horaInicio,
  fasePorra,
  onCambiado,
  onOk,
}: {
  horaInicio: string;
  fasePorra: string;
  onCambiado: () => Promise<void> | void;
  onOk: (texto: string) => void;
}) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const objetivo = new Date(horaInicio);
  const restante = objetivo.getTime() - Date.now();
  const mm = Math.max(0, Math.floor(restante / 60000));
  const ss = Math.max(0, Math.floor((restante % 60000) / 1000));
  return (
    <div className="pc-act pk">
      <div className="pc-act-l pk">
        <span className="d" />
        La gente está apostando
      </div>
      {restante > 0 ? (
        <div className="pc-count">
          <div className="cv">
            {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
          </div>
          <div className="cl">PARA LAS {horaCorta(objetivo)}</div>
        </div>
      ) : (
        <div className="pc-count">
          <div className="cv">00:00</div>
          <div className="cl">HORA CUMPLIDA · {horaCorta(objetivo)}</div>
        </div>
      )}
      <div className="pc-act-p" style={{ textAlign: 'center' }}>
        El reloj es informativo: la porra de cada cruce se cierra cuando lo marques en juego.
      </div>
      <RetrasarHora
        fasePorra={fasePorra}
        horaInicio={horaInicio}
        onCambiado={onCambiado}
        onOk={onOk}
      />
    </div>
  );
}
