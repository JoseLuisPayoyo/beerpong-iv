import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Id } from '../../lib/clasificacion';
import { ConfirmButton, Toast, useAviso } from './ui';

const sb = supabase!;

interface Partido {
  id: Id;
  fase: 'semifinal' | 'final';
  orden: number;
  equipo_a: Id | null;
  equipo_b: Id | null;
  vasos_a: number | null;
  vasos_b: number | null;
  ganador_id: Id | null;
  estado: 'pendiente' | 'en_juego' | 'jugado';
}

export default function SemisFinal() {
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [nombres, setNombres] = useState<Map<Id, string>>(new Map());
  const [listo, setListo] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useAviso();
  const [ocupado, setOcupado] = useState<Id | null>(null); // partido con escritura en curso (iniciar/sellar)
  const [generando, setGenerando] = useState(false);

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    const [rPartidos, rEquipos] = await Promise.all([
      sb
        .from('partidos')
        .select('id,fase,orden,equipo_a,equipo_b,vasos_a,vasos_b,ganador_id,estado')
        .in('fase', ['semifinal', 'final'])
        .order('orden', { ascending: true }),
      sb.from('equipos').select('id,nombre_equipo'),
    ]);
    if (rPartidos.error || rEquipos.error) {
      setErrorCarga('No se pudo cargar semis y final.');
      return;
    }
    setPartidos(rPartidos.data as Partido[]);
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

  const nombre = (id: Id | null) => (id != null && nombres.get(id)) || '—';
  const buscar = (fase: 'semifinal' | 'final', orden: number) =>
    partidos.find((p) => p.fase === fase && p.orden === orden) ?? null;

  function patch(id: Id, cambios: Partial<Partido>) {
    setPartidos((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  }

  async function iniciarDirecto(p: Partido) {
    setOcupado(p.id);
    const { error } = await sb
      .from('partidos')
      .update({ estado: 'en_juego', vasos_a: 0, vasos_b: 0 })
      .eq('id', p.id);
    setOcupado(null);
    if (error) {
      setAviso({ tipo: 'err', texto: `No se pudo iniciar el directo. (${error.message})` });
      return;
    }
    patch(p.id, { estado: 'en_juego', vasos_a: 0, vasos_b: 0 });
  }

  // En directo el público ve cada vaso: se escribe al instante (optimista); si
  // falla la escritura, se resincroniza desde Supabase para no mentir.
  async function paso(p: Partido, side: 'a' | 'b', d: number) {
    const campo = side === 'a' ? 'vasos_a' : 'vasos_b';
    const actual = (side === 'a' ? p.vasos_a : p.vasos_b) ?? 0;
    const nuevo = Math.max(0, Math.min(10, actual + d));
    if (nuevo === actual) return;
    patch(p.id, { [campo]: nuevo });
    const { error } = await sb.from('partidos').update({ [campo]: nuevo }).eq('id', p.id);
    if (error) {
      setAviso({ tipo: 'err', texto: `No se guardó el vaso; recargando marcador. (${error.message})` });
      await cargar();
    }
  }

  async function sellar(p: Partido) {
    const a = p.vasos_a ?? 0;
    const b = p.vasos_b ?? 0;
    if (Math.max(a, b) < 10 || a === b) return; // el botón ya está deshabilitado, doble seguro
    const ganador_id = a > b ? p.equipo_a : p.equipo_b;
    setOcupado(p.id);
    const { error } = await sb
      .from('partidos')
      .update({ ganador_id, estado: 'jugado' })
      .eq('id', p.id);
    setOcupado(null);
    if (error) {
      setAviso({ tipo: 'err', texto: `No se pudo sellar el resultado. (${error.message})` });
      return;
    }
    patch(p.id, { ganador_id, estado: 'jugado' });
    setAviso({ tipo: 'ok', texto: 'Resultado sellado.' });
  }

  async function generarFinal() {
    const s0 = buscar('semifinal', 0);
    const s1 = buscar('semifinal', 1);
    setGenerando(true);
    if (!s0 || !s1 || s0.estado !== 'jugado' || s1.estado !== 'jugado') {
      setGenerando(false);
      setAviso({ tipo: 'err', texto: 'Las dos semifinales deben estar jugadas.' });
      return;
    }
    const { data: ex, error: e0 } = await sb
      .from('partidos')
      .select('id')
      .eq('fase', 'final')
      .limit(1);
    if (e0) {
      setGenerando(false);
      setAviso({ tipo: 'err', texto: `No se pudo comprobar la final. (${e0.message})` });
      return;
    }
    if (ex.length > 0) {
      setGenerando(false);
      setAviso({ tipo: 'err', texto: 'La final ya existe: no se ha creado nada.' });
      return;
    }
    const { error } = await sb.from('partidos').insert({
      fase: 'final',
      grupo_id: null,
      orden: 0,
      equipo_a: s0.ganador_id, // W(semi 0)
      equipo_b: s1.ganador_id, // W(semi 1)
      estado: 'pendiente',
      mesa: 1,
      tanda: 1,
    });
    if (error) {
      setGenerando(false);
      setAviso({ tipo: 'err', texto: `No se pudo crear la final. (${error.message})` });
      return;
    }
    const { error: ep } = await sb
      .from('fases')
      .update({ porra_abierta: true })
      .eq('nombre', 'final');
    await cargar();
    setGenerando(false);
    setAviso(
      ep
        ? { tipo: 'err', texto: `Final creada, pero no se abrió su porra. (${ep.message})` }
        : { tipo: 'ok', texto: 'Final creada y porra abierta.' },
    );
  }

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
  if (!listo) return <p className="pc-loading">Cargando semis y final…</p>;

  const semi0 = buscar('semifinal', 0);
  const semi1 = buscar('semifinal', 1);
  const final = buscar('final', 0);
  const semisJugadas = !!semi0 && !!semi1 && semi0.estado === 'jugado' && semi1.estado === 'jugado';
  const campeon =
    final && final.estado === 'jugado' ? nombre(final.ganador_id) : null;

  return (
    <>
      <p className="pc-note-top">
        Aquí el marcador se manda en directo: cada toque se ve al instante en la web y en la
        pantalla grande.
      </p>

      <Slot
        etiqueta="SEMIFINAL 1"
        partido={semi0}
        notaBloqueo="🔒 SEMIFINAL 1 · se desbloquea al terminar los cuartos."
        nombre={nombre}
        ocupado={ocupado}
        onIniciar={iniciarDirecto}
        onPaso={paso}
        onSellar={sellar}
      />
      <Slot
        etiqueta="SEMIFINAL 2"
        partido={semi1}
        notaBloqueo="🔒 SEMIFINAL 2 · se desbloquea al terminar los cuartos."
        nombre={nombre}
        ocupado={ocupado}
        onIniciar={iniciarDirecto}
        onPaso={paso}
        onSellar={sellar}
      />

      {final ? (
        <Slot
          etiqueta="FINAL"
          partido={final}
          notaBloqueo=""
          nombre={nombre}
          ocupado={ocupado}
          onIniciar={iniciarDirecto}
          onPaso={paso}
          onSellar={sellar}
        />
      ) : semisJugadas ? (
        <div className="eq-block">
          <ConfirmButton
            className="pc-btn primary block"
            question="Crear la final con los ganadores de las dos semifinales y abrir su porra. ¿Seguir?"
            busy={generando}
            busyLabel="Generando…"
            onConfirm={() => void generarFinal()}
          >
            Generar final
          </ConfirmButton>
        </div>
      ) : (
        <div className="pc-note">🔒 FINAL · se desbloquea al terminar las semifinales.</div>
      )}

      {campeon && (
        <div className="pc-champ">
          <div className="cl">CAMPEÓN BEERPONG IV</div>
          <div className="cv">🏆 {campeon}</div>
        </div>
      )}

      <Toast aviso={aviso} />
    </>
  );
}

function Slot({
  etiqueta,
  partido,
  notaBloqueo,
  nombre,
  ocupado,
  onIniciar,
  onPaso,
  onSellar,
}: {
  etiqueta: string;
  partido: Partido | null;
  notaBloqueo: string;
  nombre: (id: Id | null) => string;
  ocupado: Id | null;
  onIniciar: (p: Partido) => void;
  onPaso: (p: Partido, side: 'a' | 'b', d: number) => void;
  onSellar: (p: Partido) => void;
}) {
  if (!partido) {
    return notaBloqueo ? <div className="pc-note">{notaBloqueo}</div> : null;
  }

  const a = nombre(partido.equipo_a);
  const b = nombre(partido.equipo_b);
  const va = partido.vasos_a ?? 0;
  const vb = partido.vasos_b ?? 0;
  const estaOcupado = ocupado === partido.id;

  if (partido.estado === 'jugado') {
    const win = partido.ganador_id;
    return (
      <div className="pc-match-done">
        <div className="rn">
          <div className="ml">{etiqueta}</div>
          <div className="mr">
            {a} {va} – {vb} {b}
          </div>
        </div>
        <span className="win">{nombre(win)}</span>
      </div>
    );
  }

  if (partido.estado === 'en_juego') {
    const puedeSellar = Math.max(va, vb) >= 10 && va !== vb;
    return (
      <div className="pc-live-card">
        <div className="pc-live-badge">
          <span className="dot" />
          EN DIRECTO · {etiqueta}
        </div>
        <div className={`pc-live-team${va > vb ? ' lead' : ''}`}>
          <span className="ln">{a}</span>
          <div className="pc-livestep">
            <button className="pc-lsb" disabled={estaOcupado || va === 0} onClick={() => onPaso(partido, 'a', -1)}>
              −
            </button>
            <span className="pc-lsv">{va}</span>
            <button className="pc-lsb" disabled={estaOcupado || va === 10} onClick={() => onPaso(partido, 'a', 1)}>
              +
            </button>
          </div>
        </div>
        <div className={`pc-live-team${vb > va ? ' lead' : ''}`}>
          <span className="ln">{b}</span>
          <div className="pc-livestep">
            <button className="pc-lsb" disabled={estaOcupado || vb === 0} onClick={() => onPaso(partido, 'b', -1)}>
              −
            </button>
            <span className="pc-lsv">{vb}</span>
            <button className="pc-lsb" disabled={estaOcupado || vb === 10} onClick={() => onPaso(partido, 'b', 1)}>
              +
            </button>
          </div>
        </div>
        <button className="pc-seal" disabled={!puedeSellar || estaOcupado} onClick={() => onSellar(partido)}>
          {estaOcupado ? 'Sellando…' : 'Sellar resultado'}
        </button>
      </div>
    );
  }

  // pendiente
  return (
    <div className="pc-row">
      <div className="rn">
        <span className="a">{etiqueta}</span>
        <span className="vs">·</span>
        <span className="b">
          {a} vs {b}
        </span>
      </div>
      <button className="pc-btn primary" disabled={estaOcupado} onClick={() => onIniciar(partido)}>
        {estaOcupado ? '…' : 'Iniciar en directo'}
      </button>
    </div>
  );
}
