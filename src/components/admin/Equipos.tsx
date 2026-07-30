import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  BotonRegenerar,
  ConfirmButton,
  ErrorPersistente,
  Toast,
  textoBorrado,
  useAviso,
  type ErrorOp,
} from './ui';
import { vigilar } from './red';

// AdminPanel comprueba que el cliente existe antes de montar esta pestaña.
const sb = supabase!;

const TOTAL_PLAZAS = 48;
const NUM_GRUPOS = 12;
const POSICIONES = [1, 2, 3, 4] as const;
// Los 6 cruces de un grupo de 4, por posición; el índice del par es el `orden` (0-5).
const PARES: ReadonlyArray<readonly [number, number]> = [
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 3],
  [2, 4],
  [3, 4],
];

type Id = string | number;
type Estado = 'confirmado' | 'espera' | 'pagado' | 'rechazado';

interface Equipo {
  id: Id;
  nombre_equipo: string;
  participante_1: string;
  participante_2: string;
  telefono: string;
  estado: Estado;
  created_at: string;
  grupo_id: number | null;
  pos_grupo: number | null;
}

interface PartidoNuevo {
  fase: 'grupo';
  grupo_id: number;
  orden: number;
  equipo_a: Id;
  equipo_b: Id;
  estado: 'pendiente';
}

const letra = (gid: number) => String.fromCharCode(64 + gid); // 1 → 'A' … 12 → 'L'

function barajar<T>(lista: T[]): T[] {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Equipos() {
  const [equipos, setEquipos] = useState<Equipo[] | null>(null);
  const [hayPartidos, setHayPartidos] = useState(false); // ya existen los 72 de grupos
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useAviso();
  const [errOp, setErrOp] = useState<ErrorOp | null>(null);
  const [escribiendo, setEscribiendo] = useState<Set<Id>>(new Set());
  const [accion, setAccion] = useState<'sorteo' | 'vaciar' | 'partidos' | null>(null);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    const [rEquipos, rPartidos] = await Promise.all([
      sb.from('equipos').select('*').order('created_at', { ascending: true }),
      sb.from('partidos').select('id').eq('fase', 'grupo').limit(1),
    ]);
    vigilar(rEquipos);
    vigilar(rPartidos);
    if (rEquipos.error || rPartidos.error) {
      setErrorCarga('No se pudo cargar la lista de equipos.');
      return;
    }
    setEquipos(rEquipos.data as Equipo[]);
    setHayPartidos(rPartidos.data.length > 0);
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const activos = useMemo(
    () => (equipos ?? []).filter((e) => e.estado === 'confirmado' || e.estado === 'pagado'),
    [equipos],
  );
  const enEspera = useMemo(() => (equipos ?? []).filter((e) => e.estado === 'espera'), [equipos]);
  const rechazados = useMemo(
    () => (equipos ?? []).filter((e) => e.estado === 'rechazado'),
    [equipos],
  );

  const pagados = activos.filter((e) => e.estado === 'pagado').length;
  const asignados = activos.filter((e) => e.grupo_id != null).length;
  const sinGrupo = activos.length - asignados;

  // grupo → (posición → id de equipo), solo con equipos que ocupan plaza
  const posicionesPorGrupo = useMemo(() => {
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

  const gruposCompletos = useMemo(() => {
    let n = 0;
    for (let gid = 1; gid <= NUM_GRUPOS; gid++) {
      const posiciones = posicionesPorGrupo.get(gid);
      if (posiciones && POSICIONES.every((p) => posiciones.has(p))) n++;
    }
    return n;
  }, [posicionesPorGrupo]);

  const ocupado = (id: Id) => escribiendo.has(id) || accion !== null;

  // Escritura de un equipo: la UI solo cambia cuando Supabase confirma.
  // Si falla, error persistente con Reintentar que repite exactamente lo mismo.
  async function actualizar(
    id: Id,
    cambios: Partial<Pick<Equipo, 'estado' | 'grupo_id' | 'pos_grupo'>>,
    textoError: string,
  ): Promise<boolean> {
    setErrOp(null);
    setEscribiendo((prev) => new Set(prev).add(id));
    const { error } = vigilar(await sb.from('equipos').update(cambios).eq('id', id));
    setEscribiendo((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
    if (error) {
      setErrOp({
        texto: `${textoError} (${error.message})`,
        reintentar: () => void actualizar(id, cambios, textoError),
      });
      return false;
    }
    setEquipos((prev) => prev && prev.map((e) => (e.id === id ? { ...e, ...cambios } : e)));
    return true;
  }

  function alternarPago(eq: Equipo) {
    const nuevo: Estado = eq.estado === 'pagado' ? 'confirmado' : 'pagado';
    void actualizar(eq.id, { estado: nuevo }, `No se pudo actualizar «${eq.nombre_equipo}».`);
  }

  function darPlaza(eq: Equipo) {
    void actualizar(eq.id, { estado: 'confirmado' }, `No se pudo confirmar «${eq.nombre_equipo}».`);
  }

  function cambiarGrupo(eq: Equipo, valor: string) {
    if (valor === '') {
      void actualizar(
        eq.id,
        { grupo_id: null, pos_grupo: null },
        `No se pudo quitar el grupo a «${eq.nombre_equipo}».`,
      );
      return;
    }
    const gid = Number(valor);
    if (eq.grupo_id === gid) return;
    const ocupadas = posicionesPorGrupo.get(gid);
    const libre = POSICIONES.find((p) => !ocupadas?.has(p));
    if (!libre) {
      setAviso({ tipo: 'err', texto: `El grupo ${letra(gid)} ya tiene 4 equipos.` });
      return;
    }
    void actualizar(
      eq.id,
      { grupo_id: gid, pos_grupo: libre },
      `No se pudo asignar el grupo a «${eq.nombre_equipo}».`,
    );
  }

  async function sortear() {
    const pendientes = barajar(activos.filter((e) => e.grupo_id == null));
    if (pendientes.length === 0) return;

    // Huecos libres, recorriendo primero todas las posiciones 1, luego las 2… → reparto equilibrado
    const huecos: Array<{ gid: number; pos: number }> = [];
    for (const pos of POSICIONES) {
      for (let gid = 1; gid <= NUM_GRUPOS; gid++) {
        if (!posicionesPorGrupo.get(gid)?.has(pos)) huecos.push({ gid, pos });
      }
    }

    const n = Math.min(pendientes.length, huecos.length);
    setErrOp(null);
    setAccion('sorteo');
    const resultados = await Promise.all(
      pendientes.slice(0, n).map((e, i) =>
        sb
          .from('equipos')
          .update({ grupo_id: huecos[i].gid, pos_grupo: huecos[i].pos })
          .eq('id', e.id),
      ),
    );
    resultados.forEach(vigilar);
    const fallos = resultados.filter((r) => r.error).length;
    await cargar(); // la BD manda: resincroniza la lista entera
    setAccion(null);
    if (fallos > 0) {
      // El reintento sortea SOLO los que quedaron sin grupo, con la lista ya
      // resincronizada (vía ref: la de este cierre está obsoleta).
      setErrOp({
        texto: `Sorteo incompleto: ${fallos} equipos se quedaron sin asignar.`,
        reintentar: () => refSortear.current(),
      });
    } else if (pendientes.length > n) {
      setAviso({
        tipo: 'err',
        texto: `Sorteados ${n} equipos; ${pendientes.length - n} se quedan fuera (no hay huecos).`,
      });
    } else {
      setAviso({ tipo: 'ok', texto: `Sorteo hecho: ${n} equipos repartidos.` });
    }
  }

  // Siempre la versión más reciente de sortear (para reintentos tras resincronizar).
  const refSortear = useRef<() => void>(() => {});
  refSortear.current = () => void sortear();

  async function vaciar() {
    setErrOp(null);
    setAccion('vaciar');
    const { error } = vigilar(
      await sb.from('equipos').update({ grupo_id: null, pos_grupo: null }).not('grupo_id', 'is', null),
    );
    if (error) {
      setAccion(null);
      setErrOp({
        texto: `No se pudo vaciar el sorteo. (${error.message})`,
        reintentar: () => void vaciar(),
      });
      return;
    }
    await cargar();
    setAccion(null);
    setAviso({ tipo: 'ok', texto: 'Sorteo vaciado: todos los equipos quedan sin grupo.' });
  }

  async function generarPartidos() {
    setErrOp(null);
    setAccion('partidos');

    // Cada grupo debe tener exactamente 4 equipos (las 4 posiciones cubiertas)
    for (let gid = 1; gid <= NUM_GRUPOS; gid++) {
      const delGrupo = activos.filter((e) => e.grupo_id === gid);
      if (delGrupo.length !== 4) {
        setAccion(null);
        setAviso({
          tipo: 'err',
          texto: `El grupo ${letra(gid)} tiene ${delGrupo.length} equipos; deben ser 4 justos.`,
        });
        return;
      }
    }

    // Idempotencia: si ya hay partidos de grupo, avisa y no toques nada
    const { data: existentes, error: errorConsulta } = vigilar(
      await sb.from('partidos').select('id').eq('fase', 'grupo').limit(1),
    );
    if (errorConsulta) {
      setAccion(null);
      setErrOp({
        texto: `No se pudo comprobar si ya hay partidos; no se ha creado nada. (${errorConsulta.message})`,
        reintentar: () => void generarPartidos(),
      });
      return;
    }
    if (existentes.length > 0) {
      setAccion(null);
      setAviso({
        tipo: 'err',
        texto: 'Ya existen partidos de la fase de grupos: no se ha creado nada.',
      });
      return;
    }

    const filas: PartidoNuevo[] = [];
    for (let gid = 1; gid <= NUM_GRUPOS; gid++) {
      const posiciones = posicionesPorGrupo.get(gid)!;
      PARES.forEach(([a, b], orden) => {
        filas.push({
          fase: 'grupo',
          grupo_id: gid,
          orden,
          equipo_a: posiciones.get(a)!,
          equipo_b: posiciones.get(b)!,
          estado: 'pendiente',
        });
      });
    }

    const { error } = vigilar(await sb.from('partidos').insert(filas));
    setAccion(null);
    if (error) {
      if (error.code === '23505') {
        setHayPartidos(true);
        setAviso({ tipo: 'err', texto: 'Ya existían partidos de grupo: no se ha duplicado nada.' });
      } else {
        setErrOp({
          texto: `No se pudieron crear los partidos. (${error.message})`,
          reintentar: () => void generarPartidos(),
        });
      }
      return;
    }
    setHayPartidos(true);
    setAviso({ tipo: 'ok', texto: `Creados los ${filas.length} partidos de la fase de grupos.` });
  }

  if (errorCarga) {
    return (
      <div className="pc-note">
        {errorCarga}
        <div style={{ marginTop: 10 }}>
          <button
            className="pc-btn ghost"
            onClick={() => {
              setEquipos(null);
              void cargar();
            }}
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  if (!equipos) return <p className="pc-loading">Cargando equipos…</p>;

  return (
    <>
      <p className="eq-resumen">
        <b>
          {activos.length}/{TOTAL_PLAZAS}
        </b>{' '}
        inscritos · <b>{pagados}</b> pagados · <b>{enEspera.length}</b> en lista de espera
      </p>

      <div className="eq-block">
        <p className="pc-gtitle">
          Equipos · <b>{activos.length} en juego</b>
        </p>
        {activos.length === 0 && <div className="pc-note">Aún no hay equipos inscritos.</div>}
        {activos.map((eq) => (
          <div className="pc-row" key={eq.id}>
            <div className="rn">
              <div className="a">{eq.nombre_equipo}</div>
              <div className="eq-meta">
                {eq.participante_1} + {eq.participante_2} · {eq.telefono}
              </div>
            </div>
            <button
              className={`pc-pill ${eq.estado === 'pagado' ? 'ok' : 'pend'}`}
              disabled={ocupado(eq.id)}
              onClick={() => alternarPago(eq)}
            >
              {eq.estado === 'pagado' ? 'PAGADO' : 'CONFIRMADO'}
            </button>
            <select
              className="eq-gsel"
              aria-label={`Grupo de ${eq.nombre_equipo}`}
              value={eq.grupo_id ?? ''}
              disabled={ocupado(eq.id)}
              onChange={(ev) => cambiarGrupo(eq, ev.target.value)}
            >
              <option value="">—</option>
              {Array.from({ length: NUM_GRUPOS }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {letra(i + 1)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {enEspera.length > 0 && (
        <div className="eq-block">
          <p className="pc-gtitle">
            Lista de espera · <b>{enEspera.length}</b>
          </p>
          {enEspera.map((eq, i) => (
            <div className="pc-row pend" key={eq.id}>
              <div className="rn">
                <div className="a">
                  <span style={{ color: 'var(--tx3)', fontFamily: 'var(--mo)', fontSize: 11 }}>
                    #{i + 1}
                  </span>{' '}
                  {eq.nombre_equipo}
                </div>
                <div className="eq-meta">
                  {eq.participante_1} + {eq.participante_2} · {eq.telefono}
                </div>
              </div>
              <PillArmada
                clase="live"
                etiqueta="EN ESPERA"
                etiquetaArmada="¿DAR PLAZA?"
                deshabilitada={ocupado(eq.id)}
                onConfirmar={() => darPlaza(eq)}
              />
            </div>
          ))}
        </div>
      )}

      {rechazados.length > 0 && (
        <div className="eq-block">
          <p className="pc-gtitle">
            Rechazados · <b>{rechazados.length}</b>
          </p>
          {rechazados.map((eq) => (
            <div className="pc-row pend" key={eq.id}>
              <div className="rn">
                <div className="a">{eq.nombre_equipo}</div>
                <div className="eq-meta">
                  {eq.participante_1} + {eq.participante_2} · {eq.telefono}
                </div>
              </div>
              <PillArmada
                clase="bad"
                etiqueta="RECHAZADO"
                etiquetaArmada="¿RECUPERAR?"
                deshabilitada={ocupado(eq.id)}
                onConfirmar={() => darPlaza(eq)}
              />
            </div>
          ))}
        </div>
      )}

      <div className="eq-block">
        <p className="pc-gtitle">Sorteo</p>
        <p className="eq-count">
          <b>
            {asignados}/{TOTAL_PLAZAS}
          </b>{' '}
          asignados a grupo
        </p>
        <ConfirmButton
          className="pc-btn primary block"
          question={`Repartir al azar ${sinGrupo} equipos sin grupo entre los 12 grupos. Los ya asignados a mano no se tocan.`}
          disabled={sinGrupo === 0}
          busy={accion === 'sorteo'}
          busyLabel="Sorteando…"
          onConfirm={() => void sortear()}
        >
          Sortear equipos
        </ConfirmButton>
        <ConfirmButton
          className="pc-btn ghost block"
          question="Quitar el grupo y la posición a TODOS los equipos."
          disabled={asignados === 0 || accion !== null}
          busy={accion === 'vaciar'}
          busyLabel="Vaciando…"
          onConfirm={() => void vaciar()}
        >
          Vaciar sorteo
        </ConfirmButton>
      </div>

      <div className="eq-block">
        <p className="pc-gtitle">Partidos de grupo</p>
        <p className="eq-count">
          <b>{gruposCompletos}/12</b> grupos completos
        </p>
        {!hayPartidos ? (
          <ConfirmButton
            className="pc-btn primary block"
            question="Crear los 72 partidos de la fase de grupos (6 por grupo)."
            disabled={gruposCompletos !== NUM_GRUPOS || accion !== null}
            busy={accion === 'partidos'}
            busyLabel="Creando…"
            onConfirm={() => void generarPartidos()}
          >
            Generar partidos de grupo
          </ConfirmButton>
        ) : (
          <>
            {/* Para cuando se cambia a alguien de grupo DESPUÉS de generar:
                borra los 72 (y la eliminatoria si existiera) y los recrea
                con las asignaciones actuales. */}
            <BotonRegenerar
              etiqueta="Regenerar partidos de grupo"
              fases={['grupo', 'dieciseisavos', 'octavos', 'cuartos', 'semifinal', 'final']}
              resumen={(info) =>
                `${textoBorrado(info, ['grupo', 'dieciseisavos', 'octavos', 'cuartos', 'semifinal', 'final'])} Después se volverán a crear los 72 partidos de grupos con las asignaciones actuales. ¿Seguir?`
              }
              onRegenerar={async () => {
                await generarPartidos();
                await cargar();
              }}
              disabled={gruposCompletos !== NUM_GRUPOS || accion !== null}
            />
            <p className="pc-hint">
              Los 72 partidos ya existen. Regenerar sirve si has cambiado a alguien de grupo
              después de generarlos.
            </p>
          </>
        )}
        {gruposCompletos !== NUM_GRUPOS && (
          <p className="pc-hint">Se activa cuando los 12 grupos tengan sus 4 equipos.</p>
        )}
      </div>

      <ErrorPersistente err={errOp} onDescartar={() => setErrOp(null)} />
      <Toast aviso={aviso} />
    </>
  );
}

/* Píldora en dos toques: el primero arma («¿…?»), el segundo ejecuta; se desarma sola. */
function PillArmada({
  clase,
  etiqueta,
  etiquetaArmada,
  deshabilitada,
  onConfirmar,
}: {
  clase: string;
  etiqueta: string;
  etiquetaArmada: string;
  deshabilitada?: boolean;
  onConfirmar: () => void;
}) {
  const [armada, setArmada] = useState(false);

  useEffect(() => {
    if (!armada) return;
    const t = setTimeout(() => setArmada(false), 4000);
    return () => clearTimeout(t);
  }, [armada]);

  return (
    <button
      className={`pc-pill ${armada ? 'live' : clase}`}
      disabled={deshabilitada}
      onClick={() => {
        if (armada) {
          setArmada(false);
          onConfirmar();
        } else {
          setArmada(true);
        }
      }}
    >
      {armada ? etiquetaArmada : etiqueta}
    </button>
  );
}
