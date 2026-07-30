import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { registrarRed } from './red';

export type Aviso = { tipo: 'ok' | 'err'; texto: string };

/** Toast flotante que se descarta solo (ver useAviso). */
export function Toast({ aviso }: { aviso: Aviso | null }) {
  if (!aviso) return null;
  return (
    <p className={`pc-toast ${aviso.tipo}`} role={aviso.tipo === 'err' ? 'alert' : 'status'}>
      {aviso.texto}
    </p>
  );
}

/** Estado de aviso con auto-descarte a los 5 s. */
export function useAviso() {
  const [aviso, setAviso] = useState<Aviso | null>(null);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 5000);
    return () => clearTimeout(t);
  }, [aviso]);
  return [aviso, setAviso] as const;
}

/** Botón que, al pulsarse, se transforma en una confirmación en línea (Sí / Cancelar).
    Para acciones irreversibles. Mientras `busy`, muestra el texto de progreso deshabilitado. */
export function ConfirmButton({
  className,
  children,
  question,
  confirmLabel = 'Sí, seguir',
  disabled,
  busy,
  busyLabel,
  onConfirm,
}: {
  className: string;
  children: ReactNode;
  question: string;
  confirmLabel?: string;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);

  if (busy) {
    return (
      <button className={className} disabled>
        {busyLabel ?? children}
      </button>
    );
  }

  if (armed) {
    return (
      <div className="pc-confirm" role="alertdialog" aria-label={question}>
        <p>{question}</p>
        <div className="pc-confirm-row">
          <button
            className="pc-btn primary"
            onClick={() => {
              setArmed(false);
              onConfirm();
            }}
          >
            {confirmLabel}
          </button>
          <button className="pc-btn ghost" onClick={() => setArmed(false)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button className={className} disabled={disabled} onClick={() => setArmed(true)}>
      {children}
    </button>
  );
}

/* ==== red de seguridad: errores persistentes, corrección y regeneración ==== */

/** Escritura fallida pendiente de reintento. `reintentar` repite EXACTAMENTE
    la misma operación (mismos datos), no una versión recalculada. */
export type ErrorOp = { texto: string; reintentar: () => void };

/** Error fijo (no se descarta solo, a diferencia del Toast) con Reintentar.
    Cada pestaña lo pinta junto a su Toast; se limpia al empezar cualquier
    operación nueva o al reintentar con éxito. */
export function ErrorPersistente({
  err,
  onDescartar,
}: {
  err: ErrorOp | null;
  onDescartar: () => void;
}) {
  if (!err) return null;
  return (
    <div className="pc-errop fija" role="alert">
      <p>⚠️ {err.texto}</p>
      <div className="pc-confirm-row">
        <button className="pc-btn primary" onClick={err.reintentar}>
          Reintentar
        </button>
        <button className="pc-btn ghost" onClick={onDescartar}>
          Descartar
        </button>
      </div>
    </div>
  );
}

/** Texto de confirmación de una corrección, en cristiano. */
export function textoCorreccion(opts: {
  antes: [number, number];
  ahora: [number, number];
  ganadorAntes: string;
  ganadorAhora: string;
  avisoRonda?: string | null;
}): string {
  const [va, vb] = opts.antes;
  const [a, b] = opts.ahora;
  const ganador =
    opts.ganadorAntes === opts.ganadorAhora
      ? `El ganador sigue siendo ${opts.ganadorAhora}.`
      : `El ganador pasa de ${opts.ganadorAntes} a ${opts.ganadorAhora}.`;
  return [`Vas a cambiar ${va}–${vb} por ${a}–${b}.`, ganador, opts.avisoRonda ?? '']
    .filter(Boolean)
    .join(' ');
}

/** Tarjeta de corrección de un partido ya jugado: mismos steppers que la
    edición normal, precargada con el marcador actual, y guardado SOLO tras
    una confirmación que dice exactamente qué va a cambiar. */
export function TarjetaCorreccion({
  nombreA,
  nombreB,
  marcadorActual,
  score,
  pregunta,
  puedeGuardar,
  guardando,
  onPaso,
  onConfirmar,
  onSalir,
}: {
  nombreA: string;
  nombreB: string;
  marcadorActual: string;
  score: { a: number; b: number };
  pregunta: string;
  puedeGuardar: boolean;
  guardando: boolean;
  onPaso: (side: 'a' | 'b', d: number) => void;
  onConfirmar: () => void;
  onSalir: () => void;
}) {
  const fila = (nombre: string, side: 'a' | 'b') => {
    const v = score[side];
    const otro = side === 'a' ? score.b : score.a;
    return (
      <div className={`pc-erow${v > otro ? ' lead' : ''}`}>
        <span className="en">{nombre}</span>
        <div className="pc-step">
          <button
            className="pc-sb"
            disabled={guardando || v === 0}
            onClick={() => onPaso(side, -1)}
            aria-label={`Quitar vaso a ${nombre}`}
          >
            −
          </button>
          <span className="pc-sv">{v}</span>
          <button
            className="pc-sb"
            disabled={guardando || v === 10}
            onClick={() => onPaso(side, 1)}
            aria-label={`Sumar vaso a ${nombre}`}
          >
            +
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="pc-edit">
      <div className="pc-elabel">
        <span className="dot" />
        CORREGIR RESULTADO · guardado {marcadorActual}
      </div>
      {fila(nombreA, 'a')}
      {fila(nombreB, 'b')}
      <p className="pc-hint">
        Gana quien llegue a 10, sin empates. No se cambia nada hasta que confirmes.
      </p>
      <ConfirmButton
        className="pc-save"
        question={pregunta}
        confirmLabel="Sí, corregir"
        disabled={!puedeGuardar}
        busy={guardando}
        busyLabel="Corrigiendo…"
        onConfirm={onConfirmar}
      >
        Guardar corrección
      </ConfirmButton>
      <button className="pc-salir" disabled={guardando} onClick={onSalir}>
        Salir sin cambiar nada
      </button>
    </div>
  );
}

/* ---- regenerar rondas ---- */

export interface InfoRegen {
  partidos: Record<string, number>; // fase → nº de partidos que se borrarían
  apuestas: number; // apuestas sobre esos cruces
}

async function llamarRegenerar(
  accion: 'contar' | 'borrar',
  fases: string[],
): Promise<{ ok: true; info: InfoRegen } | { ok: false; texto: string }> {
  let res: Response;
  try {
    const { data } = await supabase!.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, texto: 'La sesión ha caducado: recarga y vuelve a entrar.' };
    res = await fetch('/api/admin/regenerar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ accion, fases }),
    });
  } catch {
    registrarRed({ message: 'failed to fetch' });
    return { ok: false, texto: 'Fallo de red: no ha llegado al servidor.' };
  }
  const body = (await res.json().catch(() => null)) as
    | { error?: string; partidos?: Record<string, number>; apuestas?: number }
    | null;
  if (!res.ok || !body) {
    return { ok: false, texto: body?.error ?? `El servidor respondió ${res.status}.` };
  }
  registrarRed(null);
  return { ok: true, info: { partidos: body.partidos ?? {}, apuestas: body.apuestas ?? 0 } };
}

const NOMBRES_BORRADO: Record<string, string> = {
  grupo: 'de grupos',
  dieciseisavos: 'de dieciseisavos',
  octavos: 'de octavos',
  cuartos: 'de cuartos',
  semifinal: 'de semifinales',
  final: 'de la final',
};

/** «Se borrarán los 16 partidos de dieciseisavos y los 8 de octavos…» */
export function textoBorrado(info: InfoRegen, fases: string[]): string {
  const partes = fases
    .filter((f) => (info.partidos[f] ?? 0) > 0)
    .map((f, i) => {
      const n = info.partidos[f];
      const sustantivo = i === 0 ? (n === 1 ? 'partido ' : 'partidos ') : '';
      return n === 1 ? `el ${sustantivo}${NOMBRES_BORRADO[f]}` : `los ${n} ${sustantivo}${NOMBRES_BORRADO[f]}`;
    });
  if (partes.length === 0) return 'No queda ningún partido que borrar en esas rondas.';
  const lista =
    partes.length === 1
      ? partes[0]
      : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
  const apuestas =
    info.apuestas > 0
      ? info.apuestas === 1
        ? ' Hay 1 apuesta sobre esos cruces; se borrará con ellos.'
        : ` Hay ${info.apuestas} apuestas sobre esos cruces; se borrarán con ellos.`
      : '';
  return `Se borrarán ${lista}. Los resultados metidos en esas rondas se perderán.${apuestas}`;
}

type PasoRegen = 'idle' | 'consultando' | 'armado' | 'borrando' | 'regenerando';

/** Botón «Regenerar»: consulta qué caería (partidos + apuestas), lo enseña en
    la confirmación con cifras reales, borra en el servidor y después llama a
    `onRegenerar` (la lógica de generación actual de la pestaña). */
export function BotonRegenerar({
  etiqueta,
  fases,
  resumen,
  onRegenerar,
  disabled,
}: {
  etiqueta: string;
  fases: string[];
  resumen: (info: InfoRegen) => string;
  onRegenerar: () => Promise<void>;
  disabled?: boolean;
}) {
  const [paso, setPaso] = useState<PasoRegen>('idle');
  const [info, setInfo] = useState<InfoRegen | null>(null);
  const [err, setErr] = useState<ErrorOp | null>(null);

  async function consultar() {
    setErr(null);
    setPaso('consultando');
    const r = await llamarRegenerar('contar', fases);
    if (!r.ok) {
      setPaso('idle');
      setErr({
        texto: `No se pudo consultar qué se borraría; no se ha tocado nada. (${r.texto})`,
        reintentar: () => void consultar(),
      });
      return;
    }
    setInfo(r.info);
    setPaso('armado');
  }

  async function borrar() {
    setErr(null);
    setPaso('borrando');
    const r = await llamarRegenerar('borrar', fases);
    if (!r.ok) {
      setPaso('idle');
      setErr({
        texto: `No se pudo completar el borrado. (${r.texto})`,
        reintentar: () => void borrar(),
      });
      return;
    }
    setPaso('regenerando');
    await onRegenerar();
    setPaso('idle');
  }

  if (err) {
    return (
      <div className="pc-errop" role="alert">
        <p>⚠️ {err.texto}</p>
        <div className="pc-confirm-row">
          <button className="pc-btn primary" onClick={err.reintentar}>
            Reintentar
          </button>
          <button className="pc-btn ghost" onClick={() => setErr(null)}>
            Dejarlo
          </button>
        </div>
      </div>
    );
  }

  if (paso === 'armado' && info) {
    return (
      <div className="pc-confirm" role="alertdialog" aria-label={etiqueta}>
        <p>{resumen(info)}</p>
        <div className="pc-confirm-row">
          <button className="pc-btn primary" onClick={() => void borrar()}>
            Sí, regenerar
          </button>
          <button
            className="pc-btn ghost"
            onClick={() => {
              setPaso('idle');
              setInfo(null);
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    );
  }

  const enCurso: Record<string, string> = {
    consultando: 'Consultando…',
    borrando: 'Borrando rondas…',
    regenerando: 'Generando de nuevo…',
  };
  return (
    <button
      className="pc-btn ghost block"
      disabled={disabled || paso !== 'idle'}
      onClick={() => void consultar()}
    >
      {paso === 'idle' ? etiqueta : enCurso[paso]}
    </button>
  );
}
