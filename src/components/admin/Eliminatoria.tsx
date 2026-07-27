import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { clasificar, compararStandings, type Id } from '../../lib/clasificacion';
import { ConfirmButton, Toast, useAviso } from './ui';

const sb = supabase!;

type Fase = 'grupo' | 'dieciseisavos' | 'octavos' | 'cuartos' | 'semifinal' | 'final';

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
  mesa: number | null;
  tanda: number | null;
}

// Rondas que vive esta pestaña (semifinal/final van en Semis·Final).
const RONDAS = [
  { fase: 'dieciseisavos' as const, label: 'DIECISEISAVOS' },
  { fase: 'octavos' as const, label: 'OCTAVOS' },
  { fase: 'cuartos' as const, label: 'CUARTOS' },
];

// Mesa y tanda de un cruce según su fase y orden (encaja con el mockup: 6+6+4, 6+2, 4).
function mesaTanda(fase: Fase, orden: number): { mesa: number; tanda: number } {
  switch (fase) {
    case 'dieciseisavos':
      if (orden <= 5) return { tanda: 1, mesa: orden + 1 };
      if (orden <= 11) return { tanda: 2, mesa: orden - 5 };
      return { tanda: 3, mesa: orden - 11 };
    case 'octavos':
      if (orden <= 5) return { tanda: 1, mesa: orden + 1 };
      return { tanda: 2, mesa: orden - 5 };
    default: // cuartos, semifinal, final: una sola tanda
      return { tanda: 1, mesa: orden + 1 };
  }
}

export default function Eliminatoria() {
  const [grupos, setGrupos] = useState<{ id: number; estado: string }[]>([]);
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [nombres, setNombres] = useState<Map<Id, string>>(new Map());
  const [listo, setListo] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useAviso();

  const [ronda, setRonda] = useState<Fase | null>(null);
  const [accion, setAccion] = useState(false); // generando una ronda
  const [marcando, setMarcando] = useState<Id | null>(null);
  const [guardando, setGuardando] = useState<Id | null>(null);
  const [scores, setScores] = useState<Record<string, { a: number; b: number }>>({});
  const [errs, setErrs] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    const [rPartidos, rGrupos, rEquipos] = await Promise.all([
      sb
        .from('partidos')
        .select('id,fase,grupo_id,orden,equipo_a,equipo_b,vasos_a,vasos_b,ganador_id,estado,mesa,tanda')
        .order('orden', { ascending: true }),
      sb.from('grupos').select('id,estado'),
      sb.from('equipos').select('id,nombre_equipo'),
    ]);
    if (rPartidos.error || rGrupos.error || rEquipos.error) {
      setErrorCarga('No se pudo cargar la eliminatoria.');
      return;
    }
    setPartidos(rPartidos.data as Partido[]);
    setGrupos(rGrupos.data as { id: number; estado: string }[]);
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
  const todosJugados = useCallback(
    (f: Fase) => {
      const ps = deFase(f);
      return ps.length > 0 && ps.every((p) => p.estado === 'jugado');
    },
    [deFase],
  );

  const gruposCompletos = grupos.filter((g) => g.estado === 'completo').length;

  function patch(id: Id, cambios: Partial<Partido>) {
    setPartidos((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  }

  // ---- siembra de dieciseisavos ----
  function construirSemillas(): Id[] {
    const primeros = [];
    const segundos = [];
    const terceros = [];
    for (let gid = 1; gid <= 12; gid++) {
      const gPart = partidos.filter((p) => p.fase === 'grupo' && p.grupo_id === gid);
      const equipoIds = [
        ...new Set(gPart.flatMap((p) => [p.equipo_a, p.equipo_b].filter((x): x is Id => x != null))),
      ];
      const tabla = clasificar(equipoIds, gPart);
      primeros.push(tabla[0]);
      segundos.push(tabla[1]);
      terceros.push(tabla[2]);
    }
    primeros.sort(compararStandings);
    segundos.sort(compararStandings);
    terceros.sort(compararStandings);
    const mejores8Terceros = terceros.slice(0, 8);
    // 1–12 primeros · 13–24 segundos · 25–32 mejores terceros
    return [...primeros, ...segundos, ...mejores8Terceros].map((s) => s.equipoId);
  }

  async function abrirPorra(nombreFase: string) {
    const { error } = await sb
      .from('fases')
      .update({ porra_abierta: true })
      .eq('nombre', nombreFase);
    return error;
  }

  async function generarDieciseisavos() {
    setAccion(true);
    if (gruposCompletos !== 12) {
      setAccion(false);
      setAviso({ tipo: 'err', texto: 'Los 12 grupos deben estar completos.' });
      return;
    }
    const { data: ex, error: e0 } = await sb
      .from('partidos')
      .select('id')
      .eq('fase', 'dieciseisavos')
      .limit(1);
    if (e0) {
      setAccion(false);
      setAviso({ tipo: 'err', texto: `No se pudo comprobar la ronda. (${e0.message})` });
      return;
    }
    if (ex.length > 0) {
      setAccion(false);
      setAviso({ tipo: 'err', texto: 'Ya existen los dieciseisavos: no se ha creado nada.' });
      return;
    }

    const semillas = construirSemillas(); // 32
    const filas = Array.from({ length: 16 }, (_, i) => {
      const { mesa, tanda } = mesaTanda('dieciseisavos', i);
      return {
        fase: 'dieciseisavos',
        grupo_id: null,
        orden: i,
        equipo_a: semillas[i], // semilla i+1
        equipo_b: semillas[31 - i], // semilla 32−i
        estado: 'pendiente',
        mesa,
        tanda,
      };
    });

    const { error } = await sb.from('partidos').insert(filas);
    if (error) {
      setAccion(false);
      setAviso({ tipo: 'err', texto: `No se pudieron crear los dieciseisavos. (${error.message})` });
      return;
    }
    const ep = await abrirPorra('dieciseisavos');
    await cargar();
    setRonda('dieciseisavos');
    setAccion(false);
    setAviso(
      ep
        ? { tipo: 'err', texto: `Dieciseisavos creados, pero no se abrió su porra. (${ep.message})` }
        : { tipo: 'ok', texto: 'Dieciseisavos sembrados y porra abierta.' },
    );
  }

  // ---- plegado de la ronda anterior ----
  async function generarRonda(anterior: Fase, nueva: Fase, okMsg: string) {
    setAccion(true);
    const prev = deFase(anterior).sort((a, b) => a.orden - b.orden);
    if (prev.length === 0 || !prev.every((p) => p.estado === 'jugado')) {
      setAccion(false);
      setAviso({ tipo: 'err', texto: 'La ronda anterior aún no está terminada.' });
      return;
    }
    const { data: ex, error: e0 } = await sb.from('partidos').select('id').eq('fase', nueva).limit(1);
    if (e0) {
      setAccion(false);
      setAviso({ tipo: 'err', texto: `No se pudo comprobar la ronda. (${e0.message})` });
      return;
    }
    if (ex.length > 0) {
      setAccion(false);
      setAviso({ tipo: 'err', texto: 'Esa ronda ya existe: no se ha creado nada.' });
      return;
    }

    const N = prev.length;
    const filas = Array.from({ length: N / 2 }, (_, i) => {
      const { mesa, tanda } = mesaTanda(nueva, i);
      return {
        fase: nueva,
        grupo_id: null,
        orden: i,
        equipo_a: prev[i].ganador_id, // W(orden i)
        equipo_b: prev[N - 1 - i].ganador_id, // W(orden N−1−i)
        estado: 'pendiente',
        mesa,
        tanda,
      };
    });

    const { error } = await sb.from('partidos').insert(filas);
    if (error) {
      setAccion(false);
      setAviso({ tipo: 'err', texto: `No se pudo crear la ronda. (${error.message})` });
      return;
    }
    const ep = await abrirPorra(nueva);
    await cargar();
    if (nueva === 'octavos' || nueva === 'cuartos') setRonda(nueva);
    setAccion(false);
    setAviso(
      ep
        ? { tipo: 'err', texto: `Ronda creada, pero no se abrió su porra. (${ep.message})` }
        : { tipo: 'ok', texto: okMsg },
    );
  }

  // ---- partidos ----
  async function marcarEnJuego(p: Partido) {
    setMarcando(p.id);
    const { error } = await sb.from('partidos').update({ estado: 'en_juego' }).eq('id', p.id);
    setMarcando(null);
    if (error) {
      setAviso({ tipo: 'err', texto: `No se pudo marcar en juego. (${error.message})` });
      return;
    }
    patch(p.id, { estado: 'en_juego' });
    setScores((s) => ({ ...s, [String(p.id)]: { a: 0, b: 0 } }));
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
      setErrs((e) => ({ ...e, [String(p.id)]: 'No puede haber empate: gana quien llegue a 10.' }));
      return;
    }
    if (Math.max(a, b) !== 10) {
      setErrs((e) => ({ ...e, [String(p.id)]: 'El ganador tiene que llegar exactamente a 10.' }));
      return;
    }
    const ganador_id = a > b ? p.equipo_a : p.equipo_b;
    setGuardando(p.id);
    const { error } = await sb
      .from('partidos')
      .update({ vasos_a: a, vasos_b: b, ganador_id, estado: 'jugado' })
      .eq('id', p.id);
    setGuardando(null);
    if (error) {
      setAviso({ tipo: 'err', texto: `No se pudo guardar el resultado. (${error.message})` });
      return;
    }
    patch(p.id, { vasos_a: a, vasos_b: b, ganador_id, estado: 'jugado' });
    setAviso({ tipo: 'ok', texto: 'Resultado guardado.' });
  }

  // ---- acción de generación contextual (la "siguiente ronda") ----
  const siguiente = useMemo(() => {
    if (!existe('dieciseisavos'))
      return {
        label: 'Generar dieciseisavos',
        puede: gruposCompletos === 12,
        hint: 'Se activa cuando los 12 grupos estén completos.',
        pregunta:
          'Sembrar los 32 clasificados en 16 cruces de dieciseisavos y abrir su porra. ¿Seguir?',
        run: generarDieciseisavos,
        nota: null as string | null,
      };
    if (!existe('octavos'))
      return {
        label: 'Generar octavos',
        puede: todosJugados('dieciseisavos'),
        hint: 'Se activa cuando los 16 dieciseisavos estén jugados.',
        pregunta: 'Crear los 8 octavos con los ganadores de dieciseisavos y abrir su porra. ¿Seguir?',
        run: () => generarRonda('dieciseisavos', 'octavos', 'Octavos generados y porra abierta.'),
        nota: null,
      };
    if (!existe('cuartos'))
      return {
        label: 'Generar cuartos',
        puede: todosJugados('octavos'),
        hint: 'Se activa cuando los 8 octavos estén jugados.',
        pregunta: 'Crear los 4 cuartos con los ganadores de octavos y abrir su porra. ¿Seguir?',
        run: () => generarRonda('octavos', 'cuartos', 'Cuartos generados y porra abierta.'),
        nota: null,
      };
    if (!existe('semifinal'))
      return {
        label: 'Generar semifinales',
        puede: todosJugados('cuartos'),
        hint: 'Se activa cuando los 4 cuartos estén jugados.',
        pregunta: 'Crear las 2 semifinales con los ganadores de cuartos y abrir su porra. ¿Seguir?',
        run: () => generarRonda('cuartos', 'semifinal', 'Semifinales generadas y porra abierta.'),
        nota: 'Las semifinales y la final se juegan en la pestaña «Semis · Final».',
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
  const rondaActiva: Fase | null =
    ronda && existe(ronda)
      ? ronda
      : rondasExistentes.length
        ? rondasExistentes[rondasExistentes.length - 1].fase
        : null;

  const partidosRonda = rondaActiva
    ? deFase(rondaActiva).sort((a, b) => a.orden - b.orden)
    : [];
  // Agrupa por tanda (orden asc dentro de cada una)
  const tandas = [...new Set(partidosRonda.map((p) => p.tanda ?? 1))].sort((x, y) => x - y);

  return (
    <>
      <p className="pc-note-top">
        Marca un cruce «en juego» en cuanto arranque en su mesa — eso cierra su porra al momento.
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

      {rondaActiva && (
        <div className="pc-tandas">
          {tandas.map((t, idx) => {
          const deTanda = partidosRonda.filter((p) => (p.tanda ?? 1) === t);
          const anterior = idx > 0 ? partidosRonda.filter((p) => (p.tanda ?? 1) === tandas[idx - 1]) : [];
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
                deTanda.map((p) => (
                  <ElimRow
                    key={p.id}
                    p={p}
                    a={nombre(p.equipo_a)}
                    b={nombre(p.equipo_b)}
                    ganador={nombre(p.ganador_id)}
                    score={scores[String(p.id)] ?? { a: 0, b: 0 }}
                    err={errs[String(p.id)] || null}
                    marcando={marcando === p.id}
                    guardando={guardando === p.id}
                    onMarcar={() => void marcarEnJuego(p)}
                    onPaso={(side, d) => paso(p, side, d)}
                    onGuardar={() => void guardar(p)}
                  />
                ))
              )}
            </div>
          );
          })}
        </div>
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
  guardando,
  onMarcar,
  onPaso,
  onGuardar,
}: {
  p: Partido;
  a: string;
  b: string;
  ganador: string;
  score: { a: number; b: number };
  err: string | null;
  marcando: boolean;
  guardando: boolean;
  onMarcar: () => void;
  onPaso: (side: 'a' | 'b', d: number) => void;
  onGuardar: () => void;
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
        <button className="pc-save" disabled={guardando} onClick={onGuardar}>
          {guardando ? 'Guardando…' : 'Guardar resultado'}
        </button>
      </div>
    );
  }

  return (
    <div className="pc-row pend">
      <div className="rn">
        <span className="a">{a}</span>
        <span className="vs">vs</span>
        <span className="b">{b}</span>
      </div>
      <button className="pc-btn ghost" disabled={marcando} onClick={onMarcar}>
        {marcando ? '…' : 'Marcar en juego'}
      </button>
    </div>
  );
}
