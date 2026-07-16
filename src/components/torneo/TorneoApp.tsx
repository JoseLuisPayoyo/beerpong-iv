import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Grupo, Partido, EquipoPub } from './tipos';
import VistaGrupos from './VistaGrupos';
import VistaCuadro from './VistaCuadro';

type Tab = 'porra' | 'ranking' | 'grupos' | 'cuadro';
type Estado = 'cargando' | 'listo' | 'error';

export default function TorneoApp() {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [equipos, setEquipos] = useState<EquipoPub[]>([]);
  // Arranca en Grupos: es la vista con contenido real desde el minuto uno
  // (Porra y Ranking son placeholders en este paso).
  const [tab, setTab] = useState<Tab>('grupos');

  const cargar = useCallback(async () => {
    if (!supabase) {
      setEstado('error');
      return;
    }
    const [g, p, e] = await Promise.all([
      supabase.from('grupos').select('id,letra,turno,estado,ganador_id').order('id'),
      supabase
        .from('partidos')
        .select(
          'id,fase,grupo_id,orden,equipo_a,equipo_b,vasos_a,vasos_b,ganador_id,estado,mesa,tanda',
        ),
      // vista pública SIN teléfonos; la tabla privada `equipos` no se lee
      supabase.from('equipos_publicos').select('id,nombre_equipo,grupo_id,pos_grupo'),
    ]);
    if (g.error || p.error || e.error) {
      setEstado('error');
      return;
    }
    setGrupos(g.data as Grupo[]);
    setPartidos(p.data as Partido[]);
    setEquipos(e.data as EquipoPub[]);
    setEstado('listo');
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Realtime: cualquier cambio del admin se refleja solo. Se recarga con un
  // pequeño debounce para agrupar ráfagas (p. ej. generar 16 partidos de golpe).
  useEffect(() => {
    const sb = supabase;
    if (!sb) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const refetch = () => {
      clearTimeout(t);
      t = setTimeout(() => void cargar(), 250);
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
  }, [cargar]);

  return (
    <div className="app">
      <div className="hd">
        <div className="hd-top">
          <div className="logo">
            BEERPONG<b> IV</b>
          </div>
        </div>
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
        ) : tab === 'grupos' ? (
          <VistaGrupos grupos={grupos} partidos={partidos} equipos={equipos} />
        ) : tab === 'cuadro' ? (
          <VistaCuadro partidos={partidos} equipos={equipos} />
        ) : (
          <Placeholder tab={tab} />
        )}
      </div>

      <nav className="nav">
        <NavBtn tab="porra" actual={tab} onClick={setTab} label="Porra">
          <svg viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="9" />
            <circle cx="12" cy="12" r="4.5" />
            <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
          </svg>
        </NavBtn>
        <NavBtn tab="ranking" actual={tab} onClick={setTab} label="Ranking">
          <svg viewBox="0 0 24 24">
            <path d="M7 4h10v4a5 5 0 0 1-10 0V4z" />
            <path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3" />
            <path d="M12 13v3M9 20h6M10 16h4" />
          </svg>
        </NavBtn>
        <NavBtn tab="grupos" actual={tab} onClick={setTab} label="Grupos">
          <svg viewBox="0 0 24 24">
            <rect x="4" y="5" width="16" height="3.5" rx="1" />
            <rect x="4" y="10.2" width="16" height="3.5" rx="1" />
            <rect x="4" y="15.5" width="16" height="3.5" rx="1" />
          </svg>
        </NavBtn>
        <NavBtn tab="cuadro" actual={tab} onClick={setTab} label="Cuadro">
          <svg viewBox="0 0 24 24">
            <path d="M5 5v4h6M5 15v4h6M11 7h4v10h-4M15 12h4" />
          </svg>
        </NavBtn>
      </nav>
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

function Placeholder({ tab }: { tab: Tab }) {
  const head =
    tab === 'porra' ? (
      <div className="sh li">
        LA <i>PORRA</i>
      </div>
    ) : (
      <div className="sh">
        EL <i>PROFETA</i>
      </div>
    );
  return (
    <section className="view">
      {head}
      <div className="soon">MUY PRONTO</div>
    </section>
  );
}
