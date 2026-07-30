import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Grupo, Partido, EquipoPub, FaseRow, RankingRow } from './tipos';
import { type Sesion, leerSesion } from './sesion';
import { calcularDesfase, faseConCuenta, horaCorta, useRestante } from './CuentaAtras';
import { HORARIOS } from '../../lib/horarios';
import VistaPorra from './VistaPorra';
import VistaRanking from './VistaRanking';
import VistaGrupos from './VistaGrupos';
import VistaCuadro from './VistaCuadro';

type Tab = 'porra' | 'ranking' | 'grupos' | 'cuadro';
type Estado = 'cargando' | 'listo' | 'error';

const TABS_VALIDAS: readonly Tab[] = ['porra', 'ranking', 'grupos', 'cuadro'];

export default function TorneoApp() {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [equipos, setEquipos] = useState<EquipoPub[]>([]);
  const [fases, setFases] = useState<FaseRow[]>([]);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  // La porra es el gancho: es la pestaña de entrada, salvo que la URL traiga
  // ?tab= (los enlaces de la landing entran directos a su pestaña).
  const [tab, setTab] = useState<Tab>(() => {
    const t = new URLSearchParams(window.location.search).get('tab');
    return (TABS_VALIDAS as readonly string[]).includes(t ?? '') ? (t as Tab) : 'porra';
  });
  const [sesion, setSesion] = useState<Sesion | null>(() => leerSesion());

  // Cambiar de pestaña refleja la URL (History API, sin recargar): los enlaces
  // compartidos llevan a la pestaña que se estaba viendo.
  const cambiarTab = useCallback((t: Tab) => {
    setTab(t);
    const u = new URL(window.location.href);
    u.searchParams.set('tab', t);
    history.replaceState(null, '', u);
  }, []);
  // Desfase reloj servidor − reloj móvil, calculado UNA vez al cargar: la
  // cuenta atrás corre en local sobre él (móviles con la hora mal puesta).
  const [desfase, setDesfase] = useState(0);

  useEffect(() => {
    void calcularDesfase().then(setDesfase);
  }, []);

  // Mantiene fresca la caché del modo evento que usa la landing para redirigir
  // sin parpadeo: si el admin lo apaga, la siguiente visita a / ya no redirige.
  useEffect(() => {
    if (!supabase) return;
    void supabase
      .from('config')
      .select('modo_evento')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) return;
        try {
          localStorage.setItem('bp4-modo-evento', data.modo_evento ? '1' : '0');
        } catch {
          /* almacenamiento bloqueado: da igual */
        }
      });
  }, []);

  const cargar = useCallback(async () => {
    if (!supabase) {
      setEstado('error');
      return;
    }
    const [g, p, e, f] = await Promise.all([
      supabase.from('grupos').select('id,letra,turno,estado,ganador_id').order('id'),
      // Solo partidos publicados: los borradores no existen para el público.
      supabase
        .from('partidos')
        .select(
          'id,fase,grupo_id,orden,equipo_a,equipo_b,vasos_a,vasos_b,ganador_id,estado,publicado,mesa,tanda',
        )
        .eq('publicado', true),
      // vista pública SIN teléfonos; la tabla privada `equipos` no se lee
      supabase
        .from('equipos_publicos')
        .select('id,nombre_equipo,grupo_id,pos_grupo,participante_1,participante_2'),
      supabase.from('fases').select('nombre,orden,porra_abierta,hora_inicio,puntos').order('orden'),
    ]);
    if (g.error || p.error || e.error || f.error) {
      setEstado('error');
      return;
    }
    setGrupos(g.data as Grupo[]);
    setPartidos(p.data as Partido[]);
    setEquipos(e.data as EquipoPub[]);
    setFases(f.data as FaseRow[]);
    setEstado('listo');
  }, []);

  // Ranking: vista pública `ranking_porra` (solo mote+puntos), publishable key.
  // Se ordena en el cliente: puntos desc → creado_en asc (empate: antes gana).
  // Silencioso: si falla, el ranking se queda como esté; no bloquea el torneo.
  const cargarRanking = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('ranking_porra')
      .select('id,mote,puntos,aciertos,creado_en');
    if (error || !data) return;
    const filas = (data as RankingRow[])
      .slice()
      .sort((a, b) => b.puntos - a.puntos || a.creado_en.localeCompare(b.creado_en));
    setRanking(filas);
  }, []);

  useEffect(() => {
    void cargar();
    void cargarRanking();
  }, [cargar, cargarRanking]);

  // Realtime: cualquier cambio del admin se refleja solo. Se recarga con un
  // pequeño debounce para agrupar ráfagas (p. ej. generar 16 partidos de golpe).
  useEffect(() => {
    const sb = supabase;
    if (!sb) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    // Las vistas (ranking_porra) no emiten Realtime por sí solas; se refresca a
    // rebufo de los resultados, que es justo cuando cambian los puntos.
    const refetch = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        void cargar();
        void cargarRanking();
      }, 250);
    };
    const canal = sb
      .channel('torneo-publico')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'partidos' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'grupos' }, refetch)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fases' }, refetch)
      .subscribe();
    return () => {
      clearTimeout(t);
      void sb.removeChannel(canal);
    };
  }, [cargar, cargarRanking]);

  // Poll cada 30s SOLO mientras la pestaña Ranking está visible: para que
  // aparezcan los que se apunten nuevos (altas que no disparan Realtime). Se
  // para al cambiar de pestaña o si la página se oculta (document.hidden).
  useEffect(() => {
    if (tab !== 'ranking') return;
    let id: ReturnType<typeof setInterval> | undefined;
    const parar = () => {
      if (id) {
        clearInterval(id);
        id = undefined;
      }
    };
    const sincronizar = () => {
      if (document.hidden) {
        parar();
      } else if (!id) {
        void cargarRanking(); // refresca al entrar/volver a ser visible
        id = setInterval(() => void cargarRanking(), 30000);
      }
    };
    sincronizar();
    document.addEventListener('visibilitychange', sincronizar);
    return () => {
      parar();
      document.removeEventListener('visibilitychange', sincronizar);
    };
  }, [tab, cargarRanking]);

  // Tus puntos (de tu fila del ranking) y avance del torneo para la cabecera.
  const misPuntos = useMemo(
    () => (sesion ? (ranking.find((r) => r.id === sesion.id)?.puntos ?? 0) : null),
    [sesion, ranking],
  );
  const avance = useMemo(() => {
    if (partidos.length === 0) return 0;
    const jugados = partidos.filter((p) => p.estado === 'jugado').length;
    return (jugados / partidos.length) * 100;
  }, [partidos]);

  // Fase con porra abierta y cuenta atrás en marcha (para la cabecera).
  const faseCuenta = faseConCuenta(fases, desfase);

  return (
    <div className="app">
      {/* Con sesión de porra: TUS PUNTOS (de tu fila del ranking) + barra de
          avance del torneo (partidos jugados / total). Sin sesión, nada. */}
      <div className={sesion ? 'hd' : 'hd sin'}>
        <div className="hd-top">
          <div className="logo">
            BEERPONG<b> IV</b>
          </div>
          {sesion && (
            <div className="pts">
              <span>TUS PUNTOS</span>
              {misPuntos}
            </div>
          )}
        </div>
        {/* contexto para quien aterriza aquí con el modo evento: qué es, cuándo y dónde */}
        <div className="evinfo">
          6 AGO · POLIDEPORTIVO · CABRA DEL SANTO CRISTO · APERTURA {HORARIOS.apertura}
        </div>
        {faseCuenta && faseCuenta.hora_inicio && (
          <LineaCuenta horaInicio={faseCuenta.hora_inicio} desfase={desfase} />
        )}
        {sesion && (
          <div className="prog">
            <i style={{ width: `${avance}%` }} />
          </div>
        )}
      </div>

      <div className="main">
        {estado === 'error' ? (
          <div className="empty">
            <div className="ico">📡</div>
            <div className="et">
              No hemos podido cargar el torneo.
              <br />
              Comprueba tu conexión.
            </div>
            <button className="retry" onClick={() => void cargar()}>
              Reintentar
            </button>
          </div>
        ) : estado === 'cargando' ? (
          <div className="empty">
            <div className="et">Cargando…</div>
          </div>
        ) : (
          <>
            <AvisosTorneo />
            {/* La porra se queda montada (oculta) al cambiar de pestaña: así
                no se pierden las selecciones aún sin confirmar. */}
            <div style={{ display: tab === 'porra' ? undefined : 'none' }}>
              <VistaPorra
                grupos={grupos}
                partidos={partidos}
                equipos={equipos}
                fases={fases}
                desfase={desfase}
                sesion={sesion}
                onSesion={setSesion}
              />
            </div>
            {tab === 'grupos' ? (
              <VistaGrupos grupos={grupos} partidos={partidos} equipos={equipos} fases={fases} />
            ) : tab === 'cuadro' ? (
              <VistaCuadro partidos={partidos} equipos={equipos} fases={fases} />
            ) : tab === 'ranking' ? (
              <VistaRanking ranking={ranking} sesion={sesion} />
            ) : null}
          </>
        )}
      </div>

      <nav className="nav">
        <NavBtn tab="porra" actual={tab} onClick={cambiarTab} label="Porra">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4.5" />
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          </svg>
        </NavBtn>
        <NavBtn tab="ranking" actual={tab} onClick={cambiarTab} label="Ranking">
          <svg viewBox="0 0 24 24">
            <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
            <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
            <path d="M12 13v3M9 20h6M10 16h4" />
          </svg>
        </NavBtn>
        <NavBtn tab="grupos" actual={tab} onClick={cambiarTab} label="Grupos">
          <svg viewBox="0 0 24 24">
            <rect x="4" y="5" width="16" height="3.5" rx="1" />
            <rect x="4" y="10.2" width="16" height="3.5" rx="1" />
            <rect x="4" y="15.5" width="16" height="3.5" rx="1" />
          </svg>
        </NavBtn>
        <NavBtn tab="cuadro" actual={tab} onClick={cambiarTab} label="Cuadro">
          <svg viewBox="0 0 24 24">
            <path d="M5 5v4h6M5 15v4h6M11 7h4v10h-4M15 12h4" />
          </svg>
        </NavBtn>
      </nav>
    </div>
  );
}

// Avisos públicos: bloque plegable, cerrado por defecto. Contexto, no protagonista.
function AvisosTorneo() {
  return (
    <details className="avisos">
      <summary>INFO DEL TORNEO · NORMAS</summary>
      <div className="av">
        <div className="avt">PLAZAS COMPLETAS</div>
        <p>
          Las 48 plazas están cubiertas. Puedes apuntarte a la{' '}
          <a href="/?landing=1#inscripcion">lista de espera</a>: si se cae algún equipo, avisamos
          por orden.
        </p>
      </div>
      <div className="av">
        <div className="avt">EQUIPOS DE MENORES</div>
        <p>
          Beerpong IV es un torneo con alcohol. Si hay equipos en lista de espera con los dos
          miembros mayores de edad, estos tienen preferencia sobre los equipos con algún miembro
          menor: se sortearán tantos equipos de menores como plazas hagan falta para dar entrada a
          los adultos que esperan. El sorteo se hará antes del sorteo de grupos, el 3 de agosto.
        </p>
      </div>
    </details>
  );
}

// Línea de cuenta atrás de la cabecera. Informativa: al llegar a cero se
// esconde sola; nada se cierra automáticamente.
function LineaCuenta({ horaInicio, desfase }: { horaInicio: string; desfase: number }) {
  const restante = useRestante(horaInicio, desfase);
  if (!restante) return null;
  return (
    <div className="hd-cd">
      <span className="dot" />
      LA PORRA CIERRA EN {restante} · EMPEZAMOS A LAS {horaCorta(horaInicio)}
    </div>
  );
}

function NavBtn({
  tab,
  actual,
  onClick,
  label,
  children,
}: {
  tab: Tab;
  actual: Tab;
  onClick: (t: Tab) => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button className={tab === actual ? 'on' : ''} onClick={() => onClick(tab)}>
      {children}
      {label}
    </button>
  );
}
