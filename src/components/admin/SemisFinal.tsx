import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Id } from '../../lib/clasificacion';
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
  publicado: boolean;
}

interface FaseInfo {
  nombre: string;
  porra_abierta: boolean;
  hora_inicio: string | null;
}

export default function SemisFinal() {
  const [partidos, setPartidos] = useState<Partido[]>([]);
  const [fases, setFases] = useState<FaseInfo[]>([]);
  const [nombres, setNombres] = useState<Map<Id, string>>(new Map());
  const [listo, setListo] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [aviso, setAviso] = useAviso();
  const [errOp, setErrOp] = useState<ErrorOp | null>(null);
  const [ocupado, setOcupado] = useState<Id | null>(null); // partido con escritura en curso (iniciar/sellar/cancelar)
  const [generando, setGenerando] = useState(false);
  const [corrigiendo, setCorrigiendo] = useState<Id | null>(null);
  const [scoreCorr, setScoreCorr] = useState<{ a: number; b: number }>({ a: 0, b: 0 });

  const cargar = useCallback(async () => {
    setErrorCarga(null);
    const [rPartidos, rEquipos, rFases] = await Promise.all([
      sb
        .from('partidos')
        .select('id,fase,orden,equipo_a,equipo_b,vasos_a,vasos_b,ganador_id,estado,publicado')
        .in('fase', ['semifinal', 'final'])
        .order('orden', { ascending: true }),
      sb.from('equipos').select('id,nombre_equipo'),
      sb.from('fases').select('nombre,porra_abierta,hora_inicio').in('nombre', ['semifinal', 'final']),
    ]);
    vigilar(rPartidos);
    vigilar(rEquipos);
    vigilar(rFases);
    if (rPartidos.error || rEquipos.error || rFases.error) {
      setErrorCarga('No se pudo cargar semis y final.');
      return;
    }
    setPartidos(rPartidos.data as Partido[]);
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

  const nombre = (id: Id | null) => (id != null && nombres.get(id)) || '—';
  const buscar = (fase: 'semifinal' | 'final', orden: number) =>
    partidos.find((p) => p.fase === fase && p.orden === orden) ?? null;

  function patch(id: Id, cambios: Partial<Partido>) {
    setPartidos((prev) => prev.map((p) => (p.id === id ? { ...p, ...cambios } : p)));
  }

  async function iniciarDirecto(p: Partido) {
    setErrOp(null);
    setOcupado(p.id);
    const { error } = vigilar(
      await sb
        .from('partidos')
        .update({ estado: 'en_juego', vasos_a: 0, vasos_b: 0 })
        .eq('id', p.id),
    );
    setOcupado(null);
    if (error) {
      setErrOp({
        texto: `No se pudo iniciar el directo. (${error.message})`,
        reintentar: () => void iniciarDirecto(p),
      });
      return;
    }
    patch(p.id, { estado: 'en_juego', vasos_a: 0, vasos_b: 0 });
  }

  // Deshacer un «Iniciar en directo» que fue un error.
  async function cancelarDirecto(p: Partido) {
    setErrOp(null);
    setOcupado(p.id);
    const { error } = vigilar(
      await sb
        .from('partidos')
        .update({ estado: 'pendiente', vasos_a: null, vasos_b: null })
        .eq('id', p.id),
    );
    setOcupado(null);
    if (error) {
      setErrOp({
        texto: `No se pudo cancelar el directo. (${error.message})`,
        reintentar: () => void cancelarDirecto(p),
      });
      return;
    }
    patch(p.id, { estado: 'pendiente', vasos_a: null, vasos_b: null });
    setAviso({ tipo: 'ok', texto: 'El partido vuelve a pendiente.' });
  }

  // En directo el público ve cada vaso: se escribe al instante (optimista); si
  // falla, se resincroniza desde Supabase para no mentir y el reintento repite
  // EXACTAMENTE la misma escritura (valor absoluto, no el incremento).
  async function escribirVaso(id: Id, campo: 'vasos_a' | 'vasos_b', valor: number) {
    setErrOp(null);
    patch(id, { [campo]: valor });
    const { error } = vigilar(await sb.from('partidos').update({ [campo]: valor }).eq('id', id));
    if (error) {
      setErrOp({
        texto: `No se guardó el vaso (marcador recargado con lo último guardado). (${error.message})`,
        reintentar: () => void escribirVaso(id, campo, valor),
      });
      await cargar();
    }
  }

  async function paso(p: Partido, side: 'a' | 'b', d: number) {
    const campo = side === 'a' ? 'vasos_a' : 'vasos_b';
    const actual = (side === 'a' ? p.vasos_a : p.vasos_b) ?? 0;
    const nuevo = Math.max(0, Math.min(10, actual + d));
    if (nuevo === actual) return;
    await escribirVaso(p.id, campo, nuevo);
  }

  async function sellar(p: Partido) {
    const a = p.vasos_a ?? 0;
    const b = p.vasos_b ?? 0;
    if (Math.max(a, b) < 10 || a === b) return; // el botón ya está deshabilitado, doble seguro
    const ganador_id = a > b ? p.equipo_a : p.equipo_b;
    setErrOp(null);
    setOcupado(p.id);
    const { error } = vigilar(
      await sb.from('partidos').update({ ganador_id, estado: 'jugado' }).eq('id', p.id),
    );
    setOcupado(null);
    if (error) {
      setErrOp({
        texto: `No se pudo sellar el resultado. (${error.message})`,
        reintentar: () => void sellar(p),
      });
      return;
    }
    patch(p.id, { ganador_id, estado: 'jugado' });
    setAviso({ tipo: 'ok', texto: 'Resultado sellado.' });
  }

  function abrirCorreccion(p: Partido) {
    setCorrigiendo(p.id);
    setScoreCorr({ a: p.vasos_a ?? 0, b: p.vasos_b ?? 0 });
  }

  // Corrección de un partido ya sellado: sobrescribe marcador y ganador.
  async function corregir(p: Partido, a: number, b: number) {
    const ganador_id = a > b ? p.equipo_a : p.equipo_b;
    setErrOp(null);
    setOcupado(p.id);
    const { error } = vigilar(
      await sb.from('partidos').update({ vasos_a: a, vasos_b: b, ganador_id }).eq('id', p.id),
    );
    setOcupado(null);
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

  async function generarFinal() {
    const s0 = buscar('semifinal', 0);
    const s1 = buscar('semifinal', 1);
    setErrOp(null);
    setGenerando(true);
    if (!s0 || !s1 || s0.estado !== 'jugado' || s1.estado !== 'jugado') {
      setGenerando(false);
      setAviso({ tipo: 'err', texto: 'Las dos semifinales deben estar jugadas.' });
      return;
    }
    const { data: ex, error: e0 } = vigilar(
      await sb.from('partidos').select('id').eq('fase', 'final').limit(1),
    );
    if (e0) {
      setGenerando(false);
      setErrOp({
        texto: `No se pudo comprobar la final; no se ha creado nada. (${e0.message})`,
        reintentar: () => void generarFinal(),
      });
      return;
    }
    if (ex.length > 0) {
      setGenerando(false);
      setAviso({ tipo: 'err', texto: 'La final ya existe: no se ha creado nada.' });
      return;
    }
    const { error } = vigilar(
      await sb.from('partidos').insert({
        fase: 'final',
        grupo_id: null,
        orden: 0,
        equipo_a: s0.ganador_id, // W(semi 0)
        equipo_b: s1.ganador_id, // W(semi 1)
        estado: 'pendiente',
        publicado: false, // en borrador: el público no la ve hasta confirmar
        mesa: 1,
        tanda: 1,
      }),
    );
    await cargar();
    setGenerando(false);
    if (error) {
      setErrOp({
        texto: `No se pudo crear la final. (${error.message})`,
        reintentar: () => void generarFinal(),
      });
      return;
    }
    setAviso({ tipo: 'ok', texto: 'Final creada EN BORRADOR: revisa y confirma.' });
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
  const semisBorrador = (semi0 != null && !semi0.publicado) || (semi1 != null && !semi1.publicado);
  const finalBorrador = final != null && !final.publicado;
  const semisJugadas = !!semi0 && !!semi1 && semi0.estado === 'jugado' && semi1.estado === 'jugado';
  const campeon =
    final && final.estado === 'jugado' ? nombre(final.ganador_id) : null;
  const faseInfo = (n: string) => fases.find((f) => f.nombre === n) ?? null;

  // Slot normal, o tarjeta de corrección si ese partido se está corrigiendo.
  const renderSlot = (etiqueta: string, partido: Partido | null, notaBloqueo: string) => {
    if (partido && corrigiendo === partido.id && partido.estado === 'jugado') {
      const nuevoGanador = scoreCorr.a > scoreCorr.b ? partido.equipo_a : partido.equipo_b;
      const valido = scoreCorr.a !== scoreCorr.b && Math.max(scoreCorr.a, scoreCorr.b) === 10;
      const cambia = scoreCorr.a !== partido.vasos_a || scoreCorr.b !== partido.vasos_b;
      return (
        <TarjetaCorreccion
          nombreA={nombre(partido.equipo_a)}
          nombreB={nombre(partido.equipo_b)}
          marcadorActual={`${partido.vasos_a}–${partido.vasos_b}`}
          score={scoreCorr}
          pregunta={textoCorreccion({
            antes: [partido.vasos_a ?? 0, partido.vasos_b ?? 0],
            ahora: [scoreCorr.a, scoreCorr.b],
            ganadorAntes: nombre(partido.ganador_id),
            ganadorAhora: nombre(nuevoGanador),
            avisoRonda:
              partido.fase === 'semifinal' && final
                ? 'OJO: la final ya está generada. Si cambias este resultado tendrás que regenerarla.'
                : partido.fase === 'final'
                  ? 'Esto cambia al CAMPEÓN del torneo en la web pública.'
                  : null,
          })}
          puedeGuardar={valido && cambia}
          guardando={ocupado === partido.id}
          onPaso={(side, d) =>
            setScoreCorr((s) => ({
              ...s,
              [side]: Math.max(0, Math.min(10, s[side] + d)),
            }))
          }
          onConfirmar={() => void corregir(partido, scoreCorr.a, scoreCorr.b)}
          onSalir={() => setCorrigiendo(null)}
        />
      );
    }
    return (
      <Slot
        etiqueta={etiqueta}
        partido={partido}
        notaBloqueo={notaBloqueo}
        nombre={nombre}
        ocupado={ocupado}
        onIniciar={iniciarDirecto}
        onCancelar={cancelarDirecto}
        onPaso={paso}
        onSellar={sellar}
        onCorregir={abrirCorreccion}
      />
    );
  };

  return (
    <>
      <p className="pc-note-top">
        Aquí el marcador se manda en directo: cada toque se ve al instante en la web y en la
        pantalla grande. Un resultado sellado se puede corregir con su botón «Corregir».
      </p>

      {semisBorrador ? (
        <div className="pc-note">
          📝 SEMIFINALES EN BORRADOR · el público no las ve. Revisa y confirma los cruces en la
          pestaña «Eliminatoria».
        </div>
      ) : (
        <>
          {(semi0?.estado === 'pendiente' || semi1?.estado === 'pendiente') &&
            faseInfo('semifinal')?.porra_abierta &&
            faseInfo('semifinal')?.hora_inicio && (
              <RetrasarHora
                fasePorra="semifinal"
                horaInicio={faseInfo('semifinal')!.hora_inicio!}
                onCambiado={cargar}
                onOk={(texto) => setAviso({ tipo: 'ok', texto })}
              />
            )}
          {renderSlot('SEMIFINAL 1', semi0, '🔒 SEMIFINAL 1 · se desbloquea al terminar los cuartos.')}
          {renderSlot('SEMIFINAL 2', semi1, '🔒 SEMIFINAL 2 · se desbloquea al terminar los cuartos.')}
        </>
      )}

      {final && finalBorrador ? (
        <div className="eq-block">
          <div className="pc-tt-head">
            <span className="pc-tt-name">FINAL · BORRADOR</span>
          </div>
          <ConfirmarCruces
            fase="final"
            fasePorra="final"
            nombreLegible="la final"
            labelEmpieza="Empieza la final"
            partidos={[final]}
            nombre={nombre}
            semillas={null}
            onCambiado={cargar}
            onOk={(texto) => setAviso({ tipo: 'ok', texto })}
          />
        </div>
      ) : final ? (
        <>
          {final.estado === 'pendiente' &&
            faseInfo('final')?.porra_abierta &&
            faseInfo('final')?.hora_inicio && (
              <RetrasarHora
                fasePorra="final"
                horaInicio={faseInfo('final')!.hora_inicio!}
                onCambiado={cargar}
                onOk={(texto) => setAviso({ tipo: 'ok', texto })}
              />
            )}
          {renderSlot('FINAL', final, '')}
        </>
      ) : semisJugadas ? (
        <div className="eq-block">
          <ConfirmButton
            className="pc-btn primary block"
            question="Crear la final con los ganadores de las dos semifinales, en borrador (el público no la ve hasta que confirmes). ¿Seguir?"
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

      {final && !finalBorrador && (
        <div className="eq-block">
          <BotonRegenerar
            etiqueta="Regenerar la final"
            fases={['final']}
            resumen={(info) =>
              `${textoBorrado(info, ['final'])} Después se volverá a crear la final en borrador con los ganadores actuales de las semifinales, para revisar y confirmar. ¿Seguir?`
            }
            onRegenerar={() => generarFinal()}
            disabled={ocupado !== null || generando}
          />
        </div>
      )}

      <ErrorPersistente err={errOp} onDescartar={() => setErrOp(null)} />
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
  onCancelar,
  onPaso,
  onSellar,
  onCorregir,
}: {
  etiqueta: string;
  partido: Partido | null;
  notaBloqueo: string;
  nombre: (id: Id | null) => string;
  ocupado: Id | null;
  onIniciar: (p: Partido) => void;
  onCancelar: (p: Partido) => void;
  onPaso: (p: Partido, side: 'a' | 'b', d: number) => void;
  onSellar: (p: Partido) => void;
  onCorregir: (p: Partido) => void;
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
        <button className="pc-corr" disabled={estaOcupado} onClick={() => onCorregir(partido)}>
          Corregir
        </button>
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
        <ConfirmButton
          className="pc-salir"
          question="El partido volverá a «pendiente» y el marcador se pondrá a cero (te equivocaste al iniciarlo). Ojo: la porra de este cruce ya se cerró y no se reabre. ¿Seguir?"
          confirmLabel="Sí, cancelar el directo"
          busy={estaOcupado}
          busyLabel="Cancelando…"
          onConfirm={() => onCancelar(partido)}
        >
          Cancelar el directo
        </ConfirmButton>
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
