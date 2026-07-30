import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import type { Id } from '../../lib/clasificacion';
import { horaCorta, siguienteCuarto, type PartidoBase } from './acciones';
import { ConfirmButton, ErrorPersistente, type ErrorOp } from './ui';
import { vigilar } from './red';

const sb = supabase!;

// Bloque de «cuadro en borrador» (mockup paso 8): aviso ámbar, lista de cruces
// con semillas e intercambio ⇄, selector de hora y confirmación. Al confirmar,
// publica los partidos de la fase, abre su porra y fija fases.hora_inicio.
// Se usa en Eliminatoria, en Semis·Final (la final) y en «Ahora».

export default function ConfirmarCruces({
  fase,
  fasePorra,
  nombreLegible,
  labelEmpieza,
  partidos,
  nombre,
  semillas,
  onCambiado,
  onOk,
}: {
  fase: string; // partidos.fase
  fasePorra: string; // fases.nombre (coincide en la eliminatoria)
  nombreLegible: string; // «los dieciseisavos»
  labelEmpieza: string; // «Empieza la primera tanda»
  partidos: PartidoBase[]; // los cruces en borrador, orden asc
  nombre: (id: Id | null) => string;
  semillas: Map<Id, number> | null; // null = sin semillas (p. ej. la final)
  onCambiado: () => Promise<void> | void; // recargar datos del padre
  onOk: (texto: string) => void; // aviso de éxito del padre
}) {
  const [sel, setSel] = useState<Id | null>(null); // primer cruce del intercambio
  const [hora, setHora] = useState<Date>(() => siguienteCuarto(new Date()));
  const [ocupado, setOcupado] = useState(false);
  const [errOp, setErrOp] = useState<ErrorOp | null>(null);

  const cruces = [...partidos].sort((a, b) => a.orden - b.orden);

  function moverHora(min: number) {
    setHora((h) => new Date(h.getTime() + min * 60000));
  }

  // Intercambia las parejas de dos cruces (permuta simple: mismos equipos,
  // solo cambian de cruce). Idempotente: el reintento repite ambas escrituras
  // con los valores capturados, así que un fallo a medias se repara solo.
  async function intercambiar(p1: PartidoBase, p2: PartidoBase) {
    setErrOp(null);
    setOcupado(true);
    const r1 = vigilar(
      await sb
        .from('partidos')
        .update({ equipo_a: p2.equipo_a, equipo_b: p2.equipo_b })
        .eq('id', p1.id),
    );
    const r2 = r1.error
      ? null
      : vigilar(
          await sb
            .from('partidos')
            .update({ equipo_a: p1.equipo_a, equipo_b: p1.equipo_b })
            .eq('id', p2.id),
        );
    setOcupado(false);
    const error = r1.error ?? r2?.error;
    if (error) {
      setErrOp({
        texto: `No se pudo completar el intercambio; reintenta para dejarlo bien. (${error.message})`,
        reintentar: () => void intercambiar(p1, p2),
      });
      return;
    }
    setSel(null);
    await onCambiado();
  }

  function tocarIntercambio(p: PartidoBase) {
    if (ocupado) return;
    if (sel == null) {
      setSel(p.id);
      return;
    }
    if (sel === p.id) {
      setSel(null); // des-seleccionar
      return;
    }
    const p1 = cruces.find((x) => x.id === sel);
    if (p1) void intercambiar(p1, p);
  }

  // Publica el cuadro y abre la porra con su hora. Dos escrituras en orden
  // seguro (primero los partidos, luego la porra); reintentos idempotentes.
  async function confirmar() {
    setErrOp(null);
    setOcupado(true);
    const r1 = vigilar(await sb.from('partidos').update({ publicado: true }).eq('fase', fase));
    if (r1.error) {
      setOcupado(false);
      setErrOp({
        texto: `No se pudo publicar el cuadro; el público sigue sin verlo. (${r1.error.message})`,
        reintentar: () => void confirmar(),
      });
      return;
    }
    const r2 = vigilar(
      await sb
        .from('fases')
        .update({ porra_abierta: true, hora_inicio: hora.toISOString() })
        .eq('nombre', fasePorra),
    );
    setOcupado(false);
    if (r2.error) {
      setErrOp({
        texto: `Cuadro publicado, pero NO se abrió la porra. (${r2.error.message})`,
        reintentar: () => void confirmar(), // repetirlo entero es inocuo
      });
      await onCambiado();
      return;
    }
    onOk(`Cuadro publicado y porra abierta hasta las ${horaCorta(hora)}.`);
    await onCambiado();
  }

  const fila = (p: PartidoBase, i: number) => {
    const sa = p.equipo_a != null ? semillas?.get(p.equipo_a) : null;
    const sbm = p.equipo_b != null ? semillas?.get(p.equipo_b) : null;
    return (
      <div className={`pc-cross${sel === p.id ? ' sel' : ''}`} key={String(p.id)}>
        <span className="n">{i + 1}</span>
        <span className="t">
          <b>{nombre(p.equipo_a)}</b> {sa != null && <span className="seed">({sa})</span>}
          <span className="vs">vs</span>
          <b>{nombre(p.equipo_b)}</b> {sbm != null && <span className="seed">({sbm})</span>}
        </span>
        <button
          className="sw"
          disabled={ocupado}
          aria-label={sel === p.id ? 'Quitar selección' : 'Intercambiar este cruce'}
          onClick={() => tocarIntercambio(p)}
        >
          ⇄
        </button>
      </div>
    );
  };

  return (
    <div>
      <div className="pc-calm ambar">
        <div className="l">Borrador · el público no lo ve</div>
        <div className="h">Revisa y cambia lo que quieras</div>
        <div className="p">
          Toca ⇄ en dos cruces para intercambiar sus parejas. Cuando confirmes, el cuadro se hace
          público y se abre la porra.
        </div>
      </div>

      <div className="pc-sec">
        <span>Cruces</span>
        {semillas && <span className="seed">SEMILLA · RANKING</span>}
      </div>
      {cruces.map(fila)}
      {sel != null && (
        <p className="pc-hint">Cruce marcado. Toca ⇄ en otro para intercambiarlos, o en el mismo para soltarlo.</p>
      )}

      <div className="pc-act">
        <div className="pc-act-l">Al confirmar</div>
        <div className="pc-act-h">Abrir la porra hasta…</div>
        <div className="pc-hour">
          <span className="lb">{labelEmpieza}</span>
          <button className="hb" disabled={ocupado} onClick={() => moverHora(-5)} aria-label="5 minutos antes">
            −
          </button>
          <span className="hv">{horaCorta(hora)}</span>
          <button className="hb" disabled={ocupado} onClick={() => moverHora(5)} aria-label="5 minutos después">
            +
          </button>
        </div>
        <ConfirmButton
          className="pc-act-btn"
          question={`El cuadro de ${nombreLegible} se hará público y se abrirá la porra hasta las ${horaCorta(hora)}. ¿Seguir?`}
          confirmLabel="Sí, publicar"
          busy={ocupado}
          busyLabel="Publicando…"
          onConfirm={() => void confirmar()}
        >
          Confirmar cruces y abrir porra
        </ConfirmButton>
      </div>

      <ErrorPersistente err={errOp} onDescartar={() => setErrOp(null)} />
    </div>
  );
}

/** Retrasa fases.hora_inicio (+5/+10) mientras la porra siga abierta.
    El reloj es informativo: no toca nada más. */
export function RetrasarHora({
  fasePorra,
  horaInicio,
  onCambiado,
  onOk,
}: {
  fasePorra: string;
  horaInicio: string; // ISO actual en la BD
  onCambiado: () => Promise<void> | void;
  onOk: (texto: string) => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [errOp, setErrOp] = useState<ErrorOp | null>(null);

  async function retrasar(min: number) {
    const nueva = new Date(new Date(horaInicio).getTime() + min * 60000);
    setErrOp(null);
    setOcupado(true);
    const { error } = vigilar(
      await sb.from('fases').update({ hora_inicio: nueva.toISOString() }).eq('nombre', fasePorra),
    );
    setOcupado(false);
    if (error) {
      setErrOp({
        texto: `No se pudo retrasar la hora. (${error.message})`,
        reintentar: () => void retrasar(min),
      });
      return;
    }
    onOk(`Hora movida a las ${horaCorta(nueva)}.`);
    await onCambiado();
  }

  return (
    <div>
      <div className="pc-hour">
        <span className="lb">
          La porra corre hasta las <b>{horaCorta(new Date(horaInicio))}</b>
        </span>
        <button className="hb ancho" disabled={ocupado} onClick={() => void retrasar(5)}>
          +5
        </button>
        <button className="hb ancho" disabled={ocupado} onClick={() => void retrasar(10)}>
          +10
        </button>
      </div>
      <ErrorPersistente err={errOp} onDescartar={() => setErrOp(null)} />
    </div>
  );
}
