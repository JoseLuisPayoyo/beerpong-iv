import { useEffect, useMemo, useState } from 'react';
import type { Grupo, Partido, EquipoPub, FaseRow, FasePorra, PickGuardado, Id } from './tipos';
import { type Sesion, guardarSesion, borrarSesion } from './sesion';
import { faseEmpezada, horaCorta, useRestante } from './CuentaAtras';
import { horaDeFase } from '../../lib/horarios';

// La porra: alta con mote+PIN y picks por fase. Las escrituras van a
// /api/porra/* (secret key en servidor); aquí solo se pinta y se manda
// mote+PIN en cada petición. Los datos de torneo (grupos, partidos, fases)
// llegan por props y se refrescan solos por Realtime: si el admin marca un
// cruce "en juego" mientras eliges, su tarjeta se bloquea sola.

const CHIPS: { fase: FasePorra; label: string; ronda: string }[] = [
  { fase: 'grupos', label: 'GRUPOS', ronda: 'GRUPOS' },
  { fase: 'dieciseisavos', label: '16avos', ronda: 'DIECISEISAVOS' },
  { fase: 'octavos', label: '8vos', ronda: 'OCTAVOS' },
  { fase: 'cuartos', label: '4tos', ronda: 'CUARTOS' },
  { fase: 'semifinal', label: 'SEMIS', ronda: 'SEMIFINALES' },
  { fase: 'final', label: 'FINAL', ronda: 'FINAL' },
];

type EstadoChip = 'abierta' | 'cerrada' | 'bloqueada';

// Estado del chip derivado de la BD Y de sus partidos (la bandera sola miente
// en fases que ya empezaron):
//   BLOQUEADA → la fase no tiene partidos publicados.
//   ABIERTA   → porra_abierta y queda al menos un cruce en `pendiente`.
//   CERRADA   → lo demás (ya empezó, ya terminó o la bandera está apagada).
// 'grupos' va aparte: se apuesta por ganador de grupo y abre ANTES de que
// existan los 72 partidos, así que está abierta mientras la bandera lo diga
// y no haya arrancado ningún partido de grupos.
function estadoChip(fase: FasePorra, fases: FaseRow[], partidos: Partido[]): EstadoChip {
  const abiertaFlag = fases.find((f) => f.nombre === fase)?.porra_abierta ?? false;
  if (fase === 'grupos') {
    return abiertaFlag && !faseEmpezada('grupos', partidos) ? 'abierta' : 'cerrada';
  }
  const suyos = partidos.filter((p) => p.fase === fase);
  if (suyos.length === 0) return 'bloqueada';
  return abiertaFlag && suyos.some((p) => p.estado === 'pendiente') ? 'abierta' : 'cerrada';
}

interface Aviso {
  tipo: 'ok' | 'err';
  texto: string;
}

export default function VistaPorra({
  grupos,
  partidos,
  equipos,
  fases,
  desfase,
  sesion,
  onSesion,
}: {
  grupos: Grupo[];
  partidos: Partido[];
  equipos: EquipoPub[];
  fases: FaseRow[];
  desfase: number; // reloj servidor − reloj móvil (ms), para la cuenta atrás
  sesion: Sesion | null;
  onSesion: (s: Sesion | null) => void;
}) {
  const [faseSel, setFaseSel] = useState<FasePorra | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<Aviso | null>(null);
  // Picks confirmados en el servidor y selecciones locales sin confirmar,
  // con clave 'g:<grupo_id>' o 'p:<partido_id>'. Lo local pisa a lo guardado.
  const [guardados, setGuardados] = useState<Map<string, Id>>(new Map());
  const [locales, setLocales] = useState<Map<string, Id>>(new Map());

  // El aviso se esfuma solo a los 6s.
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  // Con sesión, recupera los picks guardados (p. ej. desde otro móvil).
  useEffect(() => {
    if (!sesion) {
      setGuardados(new Map());
      setLocales(new Map());
      return;
    }
    let cancelado = false;
    (async () => {
      try {
        // POST y no GET: el PIN en la query string acabaría en los access
        // logs del hosting.
        const r = await fetch('/api/porra/mis-picks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mote: sesion.mote, pin: sesion.pin }),
        });
        const cuerpo = (await r.json().catch(() => ({}))) as {
          picks?: PickGuardado[];
          error?: string;
        };
        if (cancelado) return;
        if (!r.ok) {
          if (r.status === 401) {
            borrarSesion();
            onSesion(null);
            setMsg({ tipo: 'err', texto: 'Tu sesión ya no es válida. Entra otra vez.' });
          } else {
            setMsg({ tipo: 'err', texto: 'No hemos podido cargar tus apuestas.' });
          }
          return;
        }
        const m = new Map<string, Id>();
        for (const p of cuerpo.picks ?? []) {
          if (p.grupo_id != null) m.set(`g:${p.grupo_id}`, p.pick_equipo_id);
          else if (p.partido_id != null) m.set(`p:${p.partido_id}`, p.pick_equipo_id);
        }
        setGuardados(m);
      } catch {
        if (!cancelado) setMsg({ tipo: 'err', texto: 'No hemos podido cargar tus apuestas.' });
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [sesion, onSesion]);

  const nombre = useMemo(() => {
    const m = new Map<Id, string>();
    for (const e of equipos) m.set(e.id, e.nombre_equipo);
    return (id: Id | null) => (id != null ? (m.get(id) ?? null) : null);
  }, [equipos]);

  const estados = useMemo(
    () => new Map(CHIPS.map((c) => [c.fase, estadoChip(c.fase, fases, partidos)])),
    [fases, partidos],
  );

  // Fase visible: la elegida por el usuario; si no, la abierta, y si no hay
  // ninguna abierta, la última cerrada (la más avanzada del torneo).
  const fase: FasePorra = useMemo(() => {
    if (faseSel && estados.get(faseSel) !== 'bloqueada') return faseSel;
    const abierta = CHIPS.find((c) => estados.get(c.fase) === 'abierta');
    if (abierta) return abierta.fase;
    for (let i = CHIPS.length - 1; i >= 0; i--) {
      if (estados.get(CHIPS[i].fase) === 'cerrada') return CHIPS[i].fase;
    }
    return 'grupos';
  }, [faseSel, estados]);

  const faseAbierta = estados.get(fase) === 'abierta';
  const faseRow = fases.find((f) => f.nombre === fase) ?? null;
  const puntos = faseRow?.puntos ?? null;
  const chipActivo = CHIPS.find((c) => c.fase === fase) ?? CHIPS[0];

  const gruposOrden = useMemo(() => [...grupos].sort((a, b) => a.id - b.id), [grupos]);
  const equiposPorGrupo = useMemo(() => {
    const m = new Map<number, EquipoPub[]>();
    for (const g of grupos) {
      m.set(
        g.id,
        equipos
          .filter((e) => e.grupo_id === g.id)
          .sort((a, b) => (a.pos_grupo ?? 99) - (b.pos_grupo ?? 99)),
      );
    }
    return m;
  }, [grupos, equipos]);
  const cruces = useMemo(
    () => partidos.filter((p) => p.fase === fase).sort((a, b) => a.orden - b.orden),
    [partidos, fase],
  );

  // pickDe (lo local pisa a lo guardado) solo donde aún se puede elegir; en
  // tarjetas bloqueadas o fases cerradas se pinta SOLO lo guardado: un pick
  // local sin confirmar nunca debe parecer una apuesta que cuenta.
  const pickDe = (clave: string): Id | undefined => locales.get(clave) ?? guardados.get(clave);
  const pickGuardado = (clave: string): Id | undefined => guardados.get(clave);
  const elegir = (clave: string, equipoId: Id) => {
    setLocales((prev) => new Map(prev).set(clave, equipoId));
  };

  const total = fase === 'grupos' ? gruposOrden.length : cruces.length;
  // n del CTA: solo picks que de verdad se enviarían (en eliminatoria, los
  // cruces que ya no están pendientes quedan fuera, igual que en confirmar()).
  const n =
    fase === 'grupos'
      ? gruposOrden.filter((g) => pickDe(`g:${g.id}`) != null).length
      : cruces.filter((c) => c.estado === 'pendiente' && pickDe(`p:${c.id}`) != null).length;
  // Con la fase cerrada solo cuentan las apuestas confirmadas en el servidor.
  const nGuardados =
    fase === 'grupos'
      ? gruposOrden.filter((g) => pickGuardado(`g:${g.id}`) != null).length
      : cruces.filter((c) => pickGuardado(`p:${c.id}`) != null).length;

  async function confirmar() {
    if (!sesion || enviando) return;
    // Solo se mandan picks válidos ahora mismo: en eliminatoria, los cruces
    // que ya no están pendientes se quedan fuera (su porra está cerrada).
    const lista: (
      | { grupo_id: number; pick_equipo_id: Id }
      | { partido_id: Id; pick_equipo_id: Id }
    )[] =
      fase === 'grupos'
        ? gruposOrden.flatMap((g) => {
            const pick = pickDe(`g:${g.id}`);
            return pick != null ? [{ grupo_id: g.id, pick_equipo_id: pick }] : [];
          })
        : cruces
            .filter((c) => c.estado === 'pendiente')
            .flatMap((c) => {
              const pick = pickDe(`p:${c.id}`);
              return pick != null ? [{ partido_id: c.id, pick_equipo_id: pick }] : [];
            });
    if (lista.length === 0) {
      // Carrera: los cruces elegidos se cerraron entre el render y el clic.
      setMsg({ tipo: 'err', texto: 'Esos cruces acaban de cerrarse.' });
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch('/api/porra/picks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mote: sesion.mote, pin: sesion.pin, fase, picks: lista }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) {
        if (r.status === 401) {
          borrarSesion();
          onSesion(null);
        }
        setMsg({
          tipo: 'err',
          texto: String(cuerpo.error ?? 'No hemos podido guardar la apuesta. Inténtalo de nuevo.'),
        });
        return;
      }
      // Los picks enviados pasan de locales a guardados.
      const claves = lista.map((x) =>
        'grupo_id' in x ? `g:${x.grupo_id}` : `p:${String(x.partido_id)}`,
      );
      setGuardados((prev) => {
        const m = new Map(prev);
        for (const clave of claves) {
          const local = locales.get(clave);
          if (local != null) m.set(clave, local);
        }
        return m;
      });
      setLocales((prev) => {
        const m = new Map(prev);
        for (const clave of claves) {
          // Solo se limpia si no cambió con la petición en vuelo: una
          // elección nueva hecha durante el envío no se pierde.
          if (m.get(clave) === locales.get(clave)) m.delete(clave);
        }
        return m;
      });
      setMsg({ tipo: 'ok', texto: `Apuesta guardada (${lista.length}/${total}).` });
    } catch {
      setMsg({ tipo: 'err', texto: 'Sin conexión. Inténtalo de nuevo.' });
    } finally {
      setEnviando(false);
    }
  }

  function salir() {
    borrarSesion();
    onSesion(null);
    setFaseSel(null);
    setMsg(null);
  }

  const aviso = (
    <div className={`msg${msg ? ` ${msg.tipo}` : ''}`} role="status" aria-live="polite">
      {msg?.texto}
    </div>
  );

  // Sin sesión: pantalla de alta/entrar antes de poder apostar.
  if (!sesion) {
    return (
      <section className="view">
        <div className="sh li">
          LA <i>PORRA</i>
        </div>
        <div className="led blink">
          <span className="dot" />
          ADIVINA GANADORES · GANA EL PROFETA
        </div>
        <FormIdentidad enviando={enviando} setEnviando={setEnviando} setMsg={setMsg} onSesion={onSesion} aviso={aviso} />
      </section>
    );
  }

  return (
    <section className="view">
      <div className="sh li">
        LA <i>PORRA</i>
      </div>
      <div className="who">
        <span>
          MOTE: <b>{sesion.mote}</b>
        </span>
        <button onClick={salir}>SALIR</button>
      </div>

      <div className="chips">
        {CHIPS.map((c) => {
          const st = estados.get(c.fase) ?? 'bloqueada';
          const cls =
            st === 'abierta' ? 'chip on' : st === 'cerrada' ? 'chip done' : 'chip lock';
          return (
            <button
              key={c.fase}
              className={`${cls}${c.fase === fase ? ' sel' : ''}`}
              disabled={st === 'bloqueada'}
              onClick={() => setFaseSel(c.fase)}
            >
              <div className="cn">{c.label}</div>
              <span className="cs">
                {st === 'abierta' ? '● ABIERTA' : st === 'cerrada' ? '✓ CERRADA' : 'BLOQUEADA'}
              </span>
            </button>
          );
        })}
      </div>

      {faseAbierta && faseRow?.hora_inicio && !faseEmpezada(fase, partidos) && (
        <TarjetaCuenta horaInicio={faseRow.hora_inicio} desfase={desfase} />
      )}

      {faseAbierta ? (
        <div className="led blink">
          <span className="dot" />
          {fase === 'grupos'
            ? `ABIERTA · LOS GRUPOS EMPIEZAN A LAS ${horaDeFase('grupos', fases)}`
            : `ABIERTA · A LAS ${horaDeFase(fase, fases)} · CIERRA POR CRUCE`}
        </div>
      ) : (
        <div className="led am">
          <span className="dot" />
          {nGuardados > 0 ? 'PORRA CERRADA · ASÍ APOSTASTE' : 'PORRA CERRADA'}
        </div>
      )}

      {fase === 'grupos' ? (
        gruposOrden.map((g) => (
          <div className="match" key={g.id}>
            <div className="match-top">
              <span className="mtag">GRUPO {g.letra}</span>
              {puntos != null && <span className="mpts">+{puntos} PTS</span>}
            </div>
            {(equiposPorGrupo.get(g.id) ?? []).map((e) => (
              <EquipoOpcion
                key={String(e.id)}
                nombre={e.nombre_equipo}
                sel={(faseAbierta ? pickDe(`g:${g.id}`) : pickGuardado(`g:${g.id}`)) === e.id}
                interactivo={faseAbierta}
                onPick={() => elegir(`g:${g.id}`, e.id)}
              />
            ))}
          </div>
        ))
      ) : cruces.length === 0 ? (
        <div className="more">AÚN NO HAY CRUCES EN ESTA FASE</div>
      ) : (
        cruces.map((c, i) => {
          // Cruce que ya no está pendiente con la fase abierta: su porra
          // está cerrada aunque la fase siga abierta para el resto.
          const cruceCerrado = faseAbierta && c.estado !== 'pendiente';
          const interactivo = faseAbierta && c.estado === 'pendiente';
          return (
            <div className={`match${cruceCerrado ? ' off' : ''}`} key={String(c.id)}>
              <div className="match-top">
                <span className="mtag">
                  {chipActivo.ronda} · {i + 1}/{total}
                </span>
                {cruceCerrado ? (
                  <span className="mtag cerr">CERRADA</span>
                ) : (
                  puntos != null && <span className="mpts">+{puntos} PTS</span>
                )}
              </div>
              {([
                [c.equipo_a, c.id],
                [c.equipo_b, c.id],
              ] as const).map(([equipoId], j) => (
                <EquipoOpcion
                  key={j}
                  nombre={nombre(equipoId) ?? 'Por determinar'}
                  sel={
                    equipoId != null &&
                    (interactivo ? pickDe(`p:${c.id}`) : pickGuardado(`p:${c.id}`)) === equipoId
                  }
                  interactivo={interactivo && equipoId != null}
                  onPick={() => equipoId != null && elegir(`p:${c.id}`, equipoId)}
                />
              ))}
            </div>
          );
        })
      )}

      {aviso}
      {faseAbierta && (
        <button className="cta" disabled={n === 0 || enviando} onClick={() => void confirmar()}>
          {enviando
            ? 'Guardando…'
            : n === 0
              ? 'Elige tus ganadores'
              : `Confirmar apuesta (${n}/${total})`}
        </button>
      )}
    </section>
  );
}

// Tarjeta de cuenta atrás sobre las apuestas. El reloj es informativo: cada
// cruce cierra cuando el admin lo marca en juego, no al llegar a cero.
function TarjetaCuenta({ horaInicio, desfase }: { horaInicio: string; desfase: number }) {
  const restante = useRestante(horaInicio, desfase);
  if (!restante) return null;
  return (
    <div className="cdcard">
      <div className="cv">{restante}</div>
      <div className="cl">LA PORRA CIERRA · EMPEZAMOS A LAS {horaCorta(horaInicio)}</div>
    </div>
  );
}

function EquipoOpcion({
  nombre,
  sel,
  interactivo,
  onPick,
}: {
  nombre: string;
  sel: boolean;
  interactivo: boolean;
  onPick: () => void;
}) {
  if (!interactivo) {
    return (
      <div className={`team ro${sel ? ' sel' : ''}`}>
        <span className="rd" />
        <span className="tn">{nombre}</span>
      </div>
    );
  }
  return (
    <button className={`team${sel ? ' sel' : ''}`} aria-pressed={sel} onClick={onPick}>
      <span className="rd" />
      <span className="tn">{nombre}</span>
    </button>
  );
}

// Alta ("Soy nuevo") o entrar ("Ya tengo mote"): dos campos y listo. El PIN
// solo sirve para recuperar tu porra desde otro móvil.
function FormIdentidad({
  enviando,
  setEnviando,
  setMsg,
  onSesion,
  aviso,
}: {
  enviando: boolean;
  setEnviando: (v: boolean) => void;
  setMsg: (m: Aviso | null) => void;
  onSesion: (s: Sesion) => void;
  aviso: React.ReactNode;
}) {
  const [modo, setModo] = useState<'alta' | 'entrar'>('alta');
  const [mote, setMote] = useState('');
  const [pin, setPin] = useState('');

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (enviando) return;
    const m = mote.trim();
    // Mismo criterio que el servidor (moteValido): charset cerrado, sin
    // comodines posibles de ilike.
    if (!/^[\p{L}\p{M}\p{N} _.'-]{2,20}$/u.test(m)) {
      setMsg({ tipo: 'err', texto: 'Mote de 2 a 20 caracteres: letras, números y espacios.' });
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setMsg({ tipo: 'err', texto: 'El PIN debe ser exactamente 4 dígitos.' });
      return;
    }
    setEnviando(true);
    try {
      const r = await fetch(`/api/porra/${modo === 'alta' ? 'alta' : 'entrar'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mote: m, pin }),
      });
      const cuerpo = (await r.json().catch(() => ({}))) as {
        id?: string;
        mote?: string;
        error?: string;
      };
      if (!r.ok || !cuerpo.id) {
        setMsg({
          tipo: 'err',
          texto: String(cuerpo.error ?? 'No ha podido ser. Inténtalo de nuevo.'),
        });
        return;
      }
      const s: Sesion = { id: String(cuerpo.id), mote: String(cuerpo.mote ?? m), pin };
      guardarSesion(s);
      onSesion(s);
      setMsg({
        tipo: 'ok',
        texto: modo === 'alta' ? '¡Dentro! Ya puedes apostar.' : `Hola de nuevo, ${s.mote}.`,
      });
    } catch {
      setMsg({ tipo: 'err', texto: 'Sin conexión. Inténtalo de nuevo.' });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="pf" onSubmit={(e) => void enviar(e)}>
      <div className="pft">{modo === 'alta' ? 'APÚNTATE A LA PORRA' : 'RECUPERA TU PORRA'}</div>
      <label htmlFor="pf-mote">TU MOTE</label>
      <input
        id="pf-mote"
        value={mote}
        onChange={(e) => setMote(e.target.value)}
        maxLength={20}
        autoComplete="username"
        placeholder="El Profeta del Pong"
      />
      <label htmlFor="pf-pin">PIN · 4 DÍGITOS</label>
      <input
        id="pf-pin"
        className="num"
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={4}
        autoComplete="off"
        placeholder="····"
      />
      <div className="hint">
        El PIN es para recuperar tu porra desde otro móvil. (No uses el de tu tarjeta.)
      </div>
      {aviso}
      <button className="cta" type="submit" disabled={enviando}>
        {enviando ? 'Un momento…' : modo === 'alta' ? 'Crear mi mote' : 'Entrar'}
      </button>
      <button
        type="button"
        className="alt"
        onClick={() => {
          setModo(modo === 'alta' ? 'entrar' : 'alta');
          setMsg(null);
        }}
      >
        {modo === 'alta' ? 'Ya tengo mote →' : '← Soy nuevo, quiero apuntarme'}
      </button>
    </form>
  );
}
