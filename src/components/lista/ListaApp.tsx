import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

// Lista de participantes para el control de entrada (/lista). Solo lectura:
// vista pública equipos_publicos (sin teléfonos) + grupos para la letra.
// La tabla privada `equipos` no se lee.

type Estado = 'cargando' | 'listo' | 'error';

interface EquipoPub {
  id: number | string;
  nombre_equipo: string;
  grupo_id: number | null;
  participante_1: string | null;
  participante_2: string | null;
}

interface Persona {
  nombre: string;
  equipo: string;
  letra: string | null; // letra del grupo, o null si aún sin sorteo
}

// Búsqueda sin mayúsculas ni tildes: "jose" encuentra "José".
const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export default function ListaApp() {
  const [estado, setEstado] = useState<Estado>('cargando');
  const [equipos, setEquipos] = useState<EquipoPub[]>([]);
  const [letras, setLetras] = useState<Map<number, string>>(new Map());
  const [q, setQ] = useState('');

  const cargar = useCallback(async () => {
    if (!supabase) {
      setEstado('error');
      return;
    }
    setEstado('cargando');
    const [g, e] = await Promise.all([
      supabase.from('grupos').select('id,letra'),
      supabase
        .from('equipos_publicos')
        .select('id,nombre_equipo,grupo_id,participante_1,participante_2'),
    ]);
    if (g.error || e.error) {
      setEstado('error');
      return;
    }
    setLetras(new Map((g.data as { id: number; letra: string }[]).map((r) => [r.id, r.letra])));
    setEquipos(e.data as EquipoPub[]);
    setEstado('listo');
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Una fila por PERSONA (no por equipo), ordenadas alfabéticamente.
  const personas = useMemo<Persona[]>(() => {
    const filas: Persona[] = [];
    for (const eq of equipos) {
      for (const nombre of [eq.participante_1, eq.participante_2]) {
        const limpio = nombre?.trim();
        if (!limpio) continue;
        filas.push({
          nombre: limpio,
          equipo: eq.nombre_equipo,
          letra: eq.grupo_id != null ? (letras.get(eq.grupo_id) ?? null) : null,
        });
      }
    }
    filas.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }));
    return filas;
  }, [equipos, letras]);

  const consulta = normalizar(q.trim());
  const visibles = useMemo(() => {
    if (!consulta) return personas;
    return personas.filter(
      (p) => normalizar(p.nombre).includes(consulta) || normalizar(p.equipo).includes(consulta),
    );
  }, [personas, consulta]);

  if (estado === 'error') {
    return (
      <div className="ls">
        <Cabecera />
        <div className="ls-vacio">
          <div className="ico">📡</div>
          <div className="et">
            No hemos podido cargar la lista.
            <br />
            Comprueba tu conexión.
          </div>
          <button className="ls-retry" onClick={() => void cargar()}>
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="ls">
      <Cabecera />
      <div className="ls-busca">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Nombre o equipo…"
          autoFocus
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Buscar participante o equipo"
        />
        {q !== '' && (
          <button className="ls-x" onClick={() => setQ('')} aria-label="Borrar búsqueda">
            ✕
          </button>
        )}
      </div>

      {estado === 'cargando' ? (
        <div className="ls-vacio">
          <div className="et">Cargando…</div>
        </div>
      ) : (
        <>
          <div className="ls-total">
            {consulta
              ? `${visibles.length} ${visibles.length === 1 ? 'RESULTADO' : 'RESULTADOS'}`
              : `${personas.length} PARTICIPANTES`}
          </div>
          {visibles.length === 0 ? (
            <div className="ls-vacio">
              <div className="ico">🔍</div>
              <div className="et">No está en la lista</div>
            </div>
          ) : (
            <ul className="ls-lista">
              {visibles.map((p, i) => (
                <li key={`${p.equipo}-${p.nombre}-${i}`}>
                  <div className="nom">{p.nombre}</div>
                  <div className="sub">
                    {p.equipo}
                    {p.letra && ` · Grupo ${p.letra}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function Cabecera() {
  return (
    <div className="ls-hd">
      <span className="marca">
        BEERPONG <b>IV</b>
      </span>
      <span className="que">LISTA DE PARTICIPANTES</span>
    </div>
  );
}
