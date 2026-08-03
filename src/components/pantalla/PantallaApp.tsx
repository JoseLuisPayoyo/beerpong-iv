import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { clasificar, compararStandings, type Id, type Standing } from '../../lib/clasificacion';
import { formatearRestante, horaDeFase, horaDeTurno } from '../../lib/horarios';

// Pantalla de proyector (/pantalla). Se abre, se pone a pantalla completa y no
// se toca en toda la noche: la vista se deriva del estado del torneo en la BD.
// SOLO lectura (publishable key + RLS). Referencia: reference/beerpong-pantalla.html.
//
// Robustez: wake lock (re-pedido al volver de segundo plano), Realtime con
// reconexión exponencial, refetch de seguridad cada 30 s, recarga + reconexión
// en visibilitychange, y ante cualquier fallo se mantiene lo último bueno.

type FaseNombre = 'grupo' | 'dieciseisavos' | 'octavos' | 'cuartos' | 'semifinal' | 'final';

interface GrupoRow {
  id: number;
  letra: string;
  turno: number;
  estado: 'pendiente' | 'en_curso' | 'completo';
  ganador_id: Id | null;
}
interface PartidoRow {
  id: Id;
  fase: FaseNombre;
  grupo_id: number | null;
  orden: number;
  equipo_a: Id | null;
  equipo_b: Id | null;
  vasos_a: number | null;
  vasos_b: number | null;
  ganador_id: Id | null;
  estado: 'pendiente' | 'en_juego' | 'jugado';
  mesa: number | null;
  tanda: number | null;
}
interface EquipoRow {
  id: Id;
  nombre_equipo: string;
  grupo_id: number | null;
  pos_grupo: number | null;
  participante_1?: string | null; // ausentes si la vista aún no los expone
  participante_2?: string | null;
}
interface FaseRow {
  nombre: string;
  orden: number;
  porra_abierta: boolean;
  hora_inicio: string | null;
}
interface RankingRow {
  id: string;
  mote: string;
  puntos: number;
  creado_en: string;
}

interface Datos {
  grupos: GrupoRow[];
  partidos: PartidoRow[]; // solo publicado=true
  equipos: EquipoRow[];
  fases: FaseRow[];
}

type Vista =
  | { v: 'campeon'; final: PartidoRow }
  | { v: 'marcador'; p: PartidoRow }
  | { v: 'cuenta'; fase: FaseRow }
  | { v: 'cuadro' }
  | { v: 'profeta' }
  | { v: 'clasificacion'; bloque: number }
  | { v: 'bienvenida' };

const RONDAS: { fase: FaseNombre; label: string }[] = [
  { fase: 'dieciseisavos', label: 'Dieciseisavos' },
  { fase: 'octavos', label: 'Octavos' },
  { fase: 'cuartos', label: 'Cuartos' },
  { fase: 'semifinal', label: 'Semifinales' },
  { fase: 'final', label: 'Final' },
];
const FASE_LEGIBLE: Record<string, string> = {
  grupos: 'Fase de grupos',
  dieciseisavos: 'Dieciseisavos',
  octavos: 'Octavos',
  cuartos: 'Cuartos',
  semifinal: 'Semifinales',
  final: 'Final',
};

const horaCorta = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

export default function PantallaApp() {
  const [datos, setDatos] = useState<Datos | null>(null);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [ultimaOk, setUltimaOk] = useState(0);
  const [ahora, setAhora] = useState(() => Date.now());
  const wakeRef = useRef<WakeLockSentinel | null>(null);

  // Reloj de 1 s: del que se derivan cuenta atrás, rotaciones y el punto de
  // «sin actualizar». Sin más timers que limpiar por vista.
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // ---- lecturas: si algo falla, se conserva lo último bueno ----
  const cargar = useCallback(async () => {
    if (!supabase) return;
    // Los nombres de los participantes (pantalla de campeón) pueden no existir
    // aún en la vista: si la columna falta, se sigue sin ellos.
    const camposEquipos = conParticipantes
      ? 'id,nombre_equipo,grupo_id,pos_grupo,participante_1,participante_2'
      : 'id,nombre_equipo,grupo_id,pos_grupo';
    const [rG, rP, rE0, rF, rR] = await Promise.all([
      supabase.from('grupos').select('id,letra,turno,estado,ganador_id').order('id'),
      supabase
        .from('partidos')
        .select(
          'id,fase,grupo_id,orden,equipo_a,equipo_b,vasos_a,vasos_b,ganador_id,estado,mesa,tanda',
        )
        .eq('publicado', true),
      supabase.from('equipos_publicos').select(camposEquipos),
      supabase.from('fases').select('nombre,orden,porra_abierta,hora_inicio').order('orden'),
      supabase.from('ranking_porra').select('id,mote,puntos,creado_en'),
    ]);
    let rE = rE0;
    if (rE.error && /participante/i.test(rE.error.message)) {
      conParticipantes = false;
      rE = await supabase.from('equipos_publicos').select('id,nombre_equipo,grupo_id,pos_grupo');
    }
    if (!rG.error && !rP.error && !rE.error && !rF.error) {
      setDatos({
        grupos: rG.data as GrupoRow[],
        partidos: rP.data as PartidoRow[],
        equipos: rE.data as unknown as EquipoRow[],
        fases: rF.data as FaseRow[],
      });
      setUltimaOk(Date.now());
    }
    // El ranking va aparte: si falla, se queda el último bueno sin tirar el resto.
    if (!rR.error && rR.data) {
      setRanking(
        (rR.data as RankingRow[])
          .slice()
          .sort((a, b) => b.puntos - a.puntos || a.creado_en.localeCompare(b.creado_en)),
      );
    }
  }, []);

  // ---- wake lock: que el proyector no se duerma ----
  const pedirWakeLock = useCallback(async () => {
    try {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      wakeRef.current = await navigator.wakeLock.request('screen');
    } catch {
      // sin soporte o denegado: la pantalla funciona igual
    }
  }, []);

  // ---- carga inicial + Realtime con reconexión + refetch de seguridad ----
  useEffect(() => {
    const sb = supabase;
    if (!sb) return;
    let parado = false;
    let canal: RealtimeChannel | null = null;
    let intento = 0;
    let timerReconexion: ReturnType<typeof setTimeout> | undefined;
    let timerDebounce: ReturnType<typeof setTimeout> | undefined;

    const refetch = () => {
      clearTimeout(timerDebounce);
      timerDebounce = setTimeout(() => void cargar(), 250);
    };

    // (Re)crea el canal desde cero. El nombre único evita reutilizar un canal
    // a medio morir; el callback ignora estados de canales ya sustituidos.
    const conectar = () => {
      if (parado) return;
      if (canal) void sb.removeChannel(canal);
      const c = sb
        .channel(`pantalla-${Date.now()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'partidos' }, refetch)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'grupos' }, refetch)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'fases' }, refetch)
        .subscribe((estado) => {
          if (parado || canal !== c) return;
          if (estado === 'SUBSCRIBED') {
            intento = 0;
            void cargar(); // ponerse al día de lo perdido mientras no había canal
            return;
          }
          if (estado === 'CHANNEL_ERROR' || estado === 'TIMED_OUT' || estado === 'CLOSED') {
            // espera creciente: 1s, 2s, 4s… con techo en 30s
            const espera = Math.min(30000, 1000 * 2 ** Math.min(intento++, 5));
            clearTimeout(timerReconexion);
            timerReconexion = setTimeout(conectar, espera);
          }
        });
      canal = c;
    };

    void cargar();
    conectar();
    void pedirWakeLock();

    // Al volver de segundo plano (el portátil estará con la música delante):
    // recargar datos, reconectar el canal sin fiarse y re-pedir el wake lock.
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      intento = 0;
      void cargar();
      conectar();
      void pedirWakeLock();
    };
    document.addEventListener('visibilitychange', alVolver);

    // Refetch de seguridad: mejor pedir de más que congelarse ante 500 personas.
    const timerSeguridad = setInterval(() => void cargar(), 30000);

    return () => {
      parado = true;
      clearTimeout(timerReconexion);
      clearTimeout(timerDebounce);
      clearInterval(timerSeguridad);
      document.removeEventListener('visibilitychange', alVolver);
      if (canal) void sb.removeChannel(canal);
      void wakeRef.current?.release().catch(() => {});
    };
  }, [cargar, pedirWakeLock]);

  // ---- máquina de estados (prioridad de arriba abajo) ----
  const vista: Vista = useMemo(() => {
    if (!datos) return { v: 'bienvenida' };
    const { partidos, fases } = datos;
    const final = partidos.find((p) => p.fase === 'final' && p.orden === 0) ?? null;

    // 1) final jugada → campeón
    if (final && final.estado === 'jugado') return { v: 'campeon', final };

    // 2) semi o final en juego → marcador gigante (la final manda)
    const vivo =
      (final?.estado === 'en_juego' ? final : null) ??
      partidos
        .filter((p) => p.fase === 'semifinal' && p.estado === 'en_juego')
        .sort((a, b) => a.orden - b.orden)[0] ??
      null;
    if (vivo) return { v: 'marcador', p: vivo };

    // 3) porra abierta con hora futura Y fase sin empezar → cuenta atrás.
    //    Si ya rueda un partido de la fase, fuera el reloj aunque no llegara a
    //    cero (nada de contadores zombis de fases jugadas). `fases` viene
    //    ordenada por orden: con varias candidatas gana la más temprana.
    const empezada = (nombre: string) => {
      const f = nombre === 'grupos' ? 'grupo' : nombre;
      return partidos.some((p) => p.fase === f && p.estado !== 'pendiente');
    };
    const conCuenta = fases.find(
      (f) =>
        f.porra_abierta &&
        f.hora_inicio != null &&
        new Date(f.hora_inicio).getTime() > ahora &&
        !empezada(f.nombre),
    );
    if (conCuenta) return { v: 'cuenta', fase: conCuenta };

    // 4) hay eliminatoria publicada → alterna cuadro / profeta cada 20 s
    //    (sin ranking que enseñar, el cuadro se queda fijo)
    if (partidos.some((p) => p.fase !== 'grupo')) {
      const enProfeta = ranking.length > 0 && Math.floor(ahora / 20000) % 2 === 1;
      return enProfeta ? { v: 'profeta' } : { v: 'cuadro' };
    }

    // 5) grupos con algún resultado → clasificación por bloques de 4 (15 s)
    //    (13 grupos → 4 bloques: 4+4+4+1)
    const deGrupo = partidos.filter((p) => p.fase === 'grupo');
    if (deGrupo.length > 0 && deGrupo.some((p) => p.estado === 'jugado')) {
      const bloques = Math.max(1, Math.ceil(datos.grupos.length / 4));
      return { v: 'clasificacion', bloque: Math.floor(ahora / 15000) % bloques };
    }

    // 6) nada aún → bienvenida
    return { v: 'bienvenida' };
  }, [datos, ranking, ahora]);

  const nombres = useMemo(
    () => new Map((datos?.equipos ?? []).map((e) => [e.id, e.nombre_equipo])),
    [datos],
  );
  const nombre = useCallback(
    (id: Id | null) => (id != null ? (nombres.get(id) ?? '—') : null),
    [nombres],
  );

  // Cabecera y pie según la vista (textos del mockup).
  const marco = useMemo(() => {
    switch (vista.v) {
      case 'bienvenida':
        return {
          phase: 'Antes de empezar',
          bt: 'INSCRIPCIÓN CERRADA',
          bc: 'var(--lime)',
          foot: (
            <>
              ENTRA YA A LA PORRA · <b>ELPEREZYESOS.COM</b>
            </>
          ),
        };
      case 'clasificacion':
        return {
          phase: 'Fase de grupos',
          bt: 'EN DIRECTO',
          bc: 'var(--amber)',
          foot: (
            <>
              CLASIFICACIÓN EN VIVO · <b>ELPEREZYESOS.COM</b>
            </>
          ),
        };
      case 'cuenta':
        return {
          phase: FASE_LEGIBLE[vista.fase.nombre] ?? vista.fase.nombre,
          bt: 'PORRA ABIERTA',
          bc: 'var(--lime)',
          foot: (
            <>
              ENTRA A LA PORRA · <b>ELPEREZYESOS.COM</b>
            </>
          ),
        };
      case 'cuadro':
        return {
          phase: 'Eliminatoria',
          bt: 'EN DIRECTO',
          bc: 'var(--amber)',
          foot: (
            <>
              EL CUADRO EN VIVO · <b>ELPEREZYESOS.COM</b>
            </>
          ),
        };
      case 'profeta':
        return {
          phase: 'La porra',
          bt: 'EN VIVO',
          bc: 'var(--lime)',
          foot: (
            <>
              EL PROFETA SE LLEVA <b>UN BONOCOPAS</b>
            </>
          ),
        };
      case 'marcador':
        return {
          phase:
            vista.p.fase === 'final' ? 'Final' : `Semifinal ${vista.p.orden + 1}`,
          bt: 'EN DIRECTO',
          bc: 'var(--magenta)',
          foot: (
            <>
              MARCADOR EN VIVO · <b>ELPEREZYESOS.COM</b>
            </>
          ),
        };
      case 'campeon':
        return {
          phase: 'Torneo terminado',
          bt: 'CAMPEÓN',
          bc: 'var(--cup)',
          foot: (
            <>
              NOS VEMOS EN LA <b>V EDICIÓN</b>
            </>
          ),
        };
    }
  }, [vista]);

  // Clave de la vista: al cambiar, el nodo se remonta y corre el fundido CSS.
  const claveVista =
    vista.v +
    (vista.v === 'clasificacion' ? `-${vista.bloque}` : '') +
    (vista.v === 'marcador' ? `-${String(vista.p.id)}` : '');

  const desactualizado = ultimaOk > 0 ? ahora - ultimaOk > 60000 : ahora - inicio > 60000;
  const brillo = vista.v === 'marcador' || vista.v === 'campeon' ? 1 : 0.6;

  const matchPoint =
    vista.v === 'marcador' &&
    Math.max(vista.p.vasos_a ?? 0, vista.p.vasos_b ?? 0) === 9;

  return (
    <div className="screen">
      <div className="glow1" />
      <div className="glow2" style={{ opacity: brillo }} />
      <div className="grain" />
      {matchPoint && <div className="mp">Match point</div>}

      <div className="wrap">
        <div className="top">
          <div className="brand">
            BEERPONG<b> IV</b>
          </div>
          <div className="phase">{marco.phase}</div>
          <div className="badge" style={{ color: marco.bc }}>
            <span className="d" />
            <span>{marco.bt}</span>
          </div>
        </div>

        <div className="core">
          <div className="view" key={claveVista}>
            {vista.v === 'bienvenida' && <Bienvenida datos={datos} />}
            {vista.v === 'clasificacion' && datos && (
              <Clasificacion datos={datos} bloque={vista.bloque} />
            )}
            {vista.v === 'cuenta' && datos && (
              <CuentaAtras datos={datos} fase={vista.fase} ahora={ahora} nombre={nombre} />
            )}
            {vista.v === 'cuadro' && datos && <Cuadro datos={datos} nombre={nombre} />}
            {vista.v === 'profeta' && <Profeta ranking={ranking} />}
            {vista.v === 'marcador' && <Marcador p={vista.p} nombre={nombre} />}
            {vista.v === 'campeon' && datos && (
              <Campeon datos={datos} final={vista.final} nombre={nombre} />
            )}
          </div>
        </div>

        <div className="foot">
          <span className="l">6 AGO · POLIDEPORTIVO · CABRA DEL SANTO CRISTO</span>
          <span className="c">{marco.foot}</span>
          <span className="l">IV EDICIÓN · 51 EQUIPOS</span>
        </div>
      </div>

      {desactualizado && <div className="stale" title="Sin actualizar desde hace un rato" />}
    </div>
  );
}

// Marca de arranque del módulo: para poder avisar de «sin datos» también
// cuando la primera carga no ha llegado a entrar nunca.
const inicio = Date.now();

// ¿La vista equipos_publicos tiene participante_1/2? Se asume que sí y se
// degrada (una sola vez) si la columna no existe en este entorno.
let conParticipantes = true;

/* ================== vistas ================== */

function Bienvenida({ datos }: { datos: Datos | null }) {
  // Ventana del horario oficial (src/lib/horarios.ts); si el admin fijó
  // fases.hora_inicio para los grupos, esa manda.
  const hora = horaDeFase('grupos', datos?.fases);
  return (
    <div className="wel">
      <div className="big">
        BEERPONG <i>IV</i>
      </div>
      <div className="sub">EMPEZAMOS A LAS {hora}</div>
      <div className="row">
        <div className="st">
          <div className="v">51</div>
          <div className="k">EQUIPOS</div>
        </div>
        <div className="st">
          <div className="v">13</div>
          <div className="k">GRUPOS</div>
        </div>
        <div className="st">
          <div className="v">6</div>
          <div className="k">MESAS</div>
        </div>
        <div className="st">
          <div className="v li">1</div>
          <div className="k">CAMPEÓN</div>
        </div>
      </div>
      <div className="qrrow">
        <div className="qrbox chica">
          <img src="/qr-elperezyesos.svg" alt="QR de elperezyesos.com" />
        </div>
        <div className="qrtxt">
          <div className="url">
            ELPEREZYESOS<b>.COM</b>
          </div>
          <span className="tag">SIN REGISTRO · MOTE Y PIN</span>
        </div>
      </div>
    </div>
  );
}

function Clasificacion({ datos, bloque }: { datos: Datos; bloque: number }) {
  const { grupos, partidos, equipos, fases } = datos;
  const partidosGrupo = partidos.filter((p) => p.fase === 'grupo');

  // Misma clasificación y criterio de mejores terceros que /torneo.
  const standings = new Map<number, Standing[]>();
  for (const g of grupos) {
    const ids = equipos
      .filter((e) => e.grupo_id === g.id)
      .sort((a, b) => (a.pos_grupo ?? 99) - (b.pos_grupo ?? 99))
      .map((e) => e.id);
    standings.set(g.id, clasificar(ids, partidosGrupo.filter((p) => p.grupo_id === g.id)));
  }
  const sellado = grupos.length > 0 && grupos.every((g) => g.estado === 'completo');
  // Bolsa de terceros: solo grupos de 4 (el 3º del grupo M no compite por
  // plaza) y las plazas que queden hasta 32 (6 con 13 grupos, 8 con 12).
  const plazasTerceros = Math.max(0, 32 - grupos.length * 2);
  const pool: { gid: number; st: Standing }[] = [];
  for (const g of grupos) {
    if (g.estado !== 'completo') continue;
    if ((standings.get(g.id)?.length ?? 0) < 4) continue;
    const tercero = standings.get(g.id)?.[2];
    if (tercero) pool.push({ gid: g.id, st: tercero });
  }
  pool.sort((a, b) => compararStandings(a.st, b.st));
  const mejoresTerceros = new Set(pool.slice(0, plazasTerceros).map((t) => t.gid));

  const nombrePor = new Map(equipos.map((e) => [e.id, e.nombre_equipo]));
  const delBloque = [...grupos].sort((a, b) => a.id - b.id).slice(bloque * 4, bloque * 4 + 4);

  const claseFila = (i: number, g: GrupoRow): string => {
    if (i <= 1) return 'q';
    if (i === 2) {
      if (g.turno === 0) return 'mut'; // 3º del grupo M: sin plaza en juego
      if (g.estado !== 'completo') return 'pv';
      if (mejoresTerceros.has(g.id)) return sellado ? 'q' : 'pv';
      return 'out';
    }
    return 'out';
  };

  return (
    <div className="gwrap">
      {delBloque.map((g) => {
        const jugados = partidosGrupo.filter(
          (p) => p.grupo_id === g.id && p.estado === 'jugado',
        ).length;
        const total =
          partidosGrupo.filter((p) => p.grupo_id === g.id).length || (g.turno === 0 ? 3 : 6);
        const sub =
          g.estado === 'completo'
            ? `${total}/${total} · CERRADO`
            : g.estado === 'en_curso'
              ? `${jugados}/${total} · EN JUEGO`
              : g.turno === 0
                ? `${horaDeTurno(0, fases)} · POR JUGAR`
                : `TURNO ${g.turno} · POR JUGAR`;
        return (
          <div className="gcard" key={g.id}>
            <div className="gh">
              <span className="gl">GRUPO {g.letra}</span>
              <span className="gs">{sub}</span>
            </div>
            {(standings.get(g.id) ?? []).map((row, i) => (
              <div className={`tr ${claseFila(i, g)}`} key={String(row.equipoId)}>
                <span className="p">{i + 1}</span>
                <span className="n">{nombrePor.get(row.equipoId) ?? '—'}</span>
                <span className="d">{row.dif > 0 ? `+${row.dif}` : row.dif}</span>
                <span className="pt">{row.pts}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function CuentaAtras({
  datos,
  fase,
  ahora,
  nombre,
}: {
  datos: Datos;
  fase: FaseRow;
  ahora: number;
  nombre: (id: Id | null) => string | null;
}) {
  const ms = Math.max(0, new Date(fase.hora_inicio!).getTime() - ahora);
  const s = Math.floor(ms / 1000);
  // Formato adaptativo (días → horas → minutos → solo segundos, en grande).
  // Los formatos largos bajan de cuerpo para no desbordar el layout.
  const reloj = formatearRestante(ms);
  const tam = reloj.length > 8 ? ' largo' : reloj.length > 5 ? ' medio' : '';
  const clase = (s <= 60 ? 'clock hot' : s <= 120 ? 'clock warn' : 'clock') + tam;

  // Los primeros cruces de esa fase (la porra 'grupos' no tiene cruces que enseñar).
  const fasePartidos = fase.nombre === 'grupos' ? 'grupo' : fase.nombre;
  const cruces =
    fase.nombre === 'grupos'
      ? []
      : datos.partidos
          .filter((p) => p.fase === fasePartidos)
          .sort((a, b) => a.orden - b.orden)
          .slice(0, 6);

  return (
    <div>
      <div className="cdgrid">
        <div className="cd">
          <div className="k">La porra cierra en</div>
          <div className={clase}>{reloj}</div>
          <div className="u">EMPEZAMOS A LAS {horaCorta(fase.hora_inicio!)}</div>
          <div className="url">
            ELPEREZYESOS<b>.COM</b>
          </div>
          <div>
            <span className="tag">SIN REGISTRO · MOTE Y PIN</span>
          </div>
        </div>
        <div className="qrbox grande">
          <img src="/qr-elperezyesos.svg" alt="QR de elperezyesos.com" />
        </div>
      </div>
      {cruces.length > 0 && (
        <div className="cdcruces">
          {cruces.map((p) => (
            <div className="bm" key={String(p.id)}>
              <div className="bl">
                <span className="bn">{nombre(p.equipo_a) ?? 'Por determinar'}</span>
              </div>
              <div className="bl">
                <span className="bn">{nombre(p.equipo_b) ?? 'Por determinar'}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Cuadro({ datos, nombre }: { datos: Datos; nombre: (id: Id | null) => string | null }) {
  const final = datos.partidos.find((p) => p.fase === 'final' && p.orden === 0) ?? null;
  const campeon = final && final.estado === 'jugado' ? nombre(final.ganador_id) : null;
  return (
    <div className="brk">
      {RONDAS.map((r) => {
        const matches = datos.partidos
          .filter((p) => p.fase === r.fase)
          .sort((a, b) => a.orden - b.orden);
        return (
          <div className="bcol" key={r.fase}>
            <div className="bh">{r.label}</div>
            <div className="list">
              {matches.map((m) => (
                <MatchMini key={String(m.id)} p={m} nombre={nombre} />
              ))}
            </div>
            {r.fase === 'final' && (
              <div className="champbox">
                <div className="cl">CAMPEÓN BEERPONG IV</div>
                <div className="cv">{campeon ?? '¿ ? ? ?'}</div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MatchMini({ p, nombre }: { p: PartidoRow; nombre: (id: Id | null) => string | null }) {
  const jugado = p.estado === 'jugado';
  const linea = (equipoId: Id | null, vasos: number | null) => {
    const nom = nombre(equipoId);
    const gana = jugado && p.ganador_id != null && equipoId === p.ganador_id;
    return (
      <div className={`bl${gana ? ' w' : ''}${nom == null ? ' pend' : ''}`}>
        <span className="bn">{nom ?? 'Por determinar'}</span>
        <span className="bs">{jugado || p.estado === 'en_juego' ? (vasos ?? 0) : '—'}</span>
      </div>
    );
  };
  return (
    <div className={`bm${p.estado === 'en_juego' ? ' now' : ''}`}>
      {linea(p.equipo_a, p.vasos_a)}
      {linea(p.equipo_b, p.vasos_b)}
    </div>
  );
}

function Profeta({ ranking }: { ranking: RankingRow[] }) {
  const top = ranking.slice(0, 10);
  if (top.length === 0) {
    return (
      <div className="wel">
        <div className="sub">LA PORRA AÚN NO TIENE PUNTUACIONES</div>
      </div>
    );
  }
  return (
    <div className="prof">
      {top.map((r, i) => (
        <div className={`rk${i < 3 ? ` r${i + 1}` : ''}`} key={r.id}>
          <span className="rp">{i + 1}</span>
          <span className="rn">{r.mote}</span>
          <span className="rs">{r.puntos}</span>
        </div>
      ))}
    </div>
  );
}

function Marcador({ p, nombre }: { p: PartidoRow; nombre: (id: Id | null) => string | null }) {
  const a = nombre(p.equipo_a) ?? '—';
  const b = nombre(p.equipo_b) ?? '—';
  const va = p.vasos_a ?? 0;
  const vb = p.vasos_b ?? 0;

  // El rack de un equipo se vacía según le meten: vasos fuera = puntos del rival.
  const rack = (fuera: number) => (
    <div className="cups">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={`cup${i < fuera ? ' out' : ''}`} />
      ))}
    </div>
  );

  const lado = (nom: string, vasos: number, rival: number) => (
    <div className={`side${vasos > rival ? ' lead' : ''}`}>
      <div className={`tname${nom.length > 16 ? ' small' : ''}`}>{nom}</div>
      <div className="sc">{vasos}</div>
      {rack(rival)}
    </div>
  );

  return (
    <div className="mk">
      {lado(a, va, vb)}
      <div className="mid">
        <div className="bar" />
        <div className="vs">VS</div>
        <div className="mesa">MESA {p.mesa ?? 1}</div>
        <div className="bar" />
      </div>
      {lado(b, vb, va)}
    </div>
  );
}

function Campeon({
  datos,
  final,
  nombre,
}: {
  datos: Datos;
  final: PartidoRow;
  nombre: (id: Id | null) => string | null;
}) {
  const id = final.ganador_id;
  const equipo = datos.equipos.find((e) => e.id === id) ?? null;
  const nom = nombre(id) ?? '—';

  // Cifras del campeón sobre sus partidos jugados (ganados, vasos, diferencia).
  const suyos = datos.partidos.filter(
    (p) => p.estado === 'jugado' && (p.equipo_a === id || p.equipo_b === id),
  );
  let ganados = 0;
  let metidos = 0;
  let encajados = 0;
  for (const p of suyos) {
    if (p.ganador_id === id) ganados++;
    const propios = p.equipo_a === id ? (p.vasos_a ?? 0) : (p.vasos_b ?? 0);
    const rival = p.equipo_a === id ? (p.vasos_b ?? 0) : (p.vasos_a ?? 0);
    metidos += propios;
    encajados += rival;
  }
  const dif = metidos - encajados;

  const quien = [equipo?.participante_1, equipo?.participante_2].filter(Boolean).join(' · ');

  return (
    <div className="win">
      <div className="cl">CAMPEÓN BEERPONG IV</div>
      <div className={`cv${nom.length > 14 ? ' small' : ''}`}>{nom}</div>
      {quien && <div className="who">{quien}</div>}
      <div className="sc2">
        {final.vasos_a} – {final.vasos_b} EN LA FINAL
      </div>
      <div className="row">
        <div className="st">
          <div className="v">{ganados}</div>
          <div className="k">PARTIDOS GANADOS</div>
        </div>
        <div className="st">
          <div className="v">{metidos}</div>
          <div className="k">VASOS METIDOS</div>
        </div>
        <div className="st">
          <div className="v" style={{ color: 'var(--lime)' }}>
            {dif > 0 ? `+${dif}` : dif}
          </div>
          <div className="k">DIFERENCIA</div>
        </div>
      </div>
    </div>
  );
}
