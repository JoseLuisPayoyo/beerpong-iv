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
  // Primer equipo del intercambio: el cruce y su lado (a o b).
  const [sel, setSel] = useState<{ id: Id; lado: 'a' | 'b' } | null>(null);
  const [hora, setHora] = useState<Date>(() => siguienteCuarto(new Date()));
  const [ocupado, setOcupado] = useState(false);
  const [errOp, setErrOp] = useState<ErrorOp | null>(null);

  const cruces = [...partidos].sort((a, b) => a.orden - b.orden);

  function moverHora(min: number) {
    setHora((h) => new Date(h.getTime() + min * 60000));
  }

  const equipoDe = (p: PartidoBase, lado: 'a' | 'b') =>
    lado === 'a' ? p.equipo_a : p.equipo_b;

  // Permuta UN equipo de un cruce con UN equipo de otro cruce (cambia los
  // emparejamientos; p. ej. separar a dos amigos que cayeron en la misma semi).
  // Los valores nuevos se capturan antes de escribir, así que el reintento
  // repite ambas escrituras tal cual: un fallo a medias se repara solo, sin
  // duplicar ni perder equipos.
  async function intercambiar(
    p1: PartidoBase,
    lado1: 'a' | 'b',
    p2: PartidoBase,
    lado2: 'a' | 'b',
  ) {
    const eq1 = equipoDe(p1, lado1);
    const eq2 = equipoDe(p2, lado2);
    if (eq1 == null || eq2 == null) return;

    // Antes de escribir: simular la permuta y comprobar que el cuadro sigue
    // siendo válido (mismos equipos, ninguno repetido ni ausente). Si el
    // estado local estuviera desfasado, mejor resincronizar que corromper.
    const despues = cruces.flatMap((c) => {
      let a = c.equipo_a;
      let b = c.equipo_b;
      if (c.id === p1.id) {
        if (lado1 === 'a') a = eq2;
        else b = eq2;
      }
      if (c.id === p2.id) {
        if (lado2 === 'a') a = eq1;
        else b = eq1;
      }
      return [a, b];
    });
    const antes = cruces.flatMap((c) => [c.equipo_a, c.equipo_b]);
    const clave = (xs: (Id | null)[]) =>
      xs.filter((x) => x != null).map(String).sort().join('|');
    const noNulos = despues.filter((x) => x != null).map(String);
    if (clave(antes) !== clave(despues) || new Set(noNulos).size !== noNulos.length) {
      setSel(null);
      setErrOp({
        texto: 'El intercambio dejaría el cuadro con equipos repetidos o perdidos; no se ha tocado nada. Recarga y vuelve a intentarlo.',
        reintentar: () => void onCambiado(),
      });
      return;
    }

    setErrOp(null);
    setOcupado(true);
    const r1 = vigilar(
      await sb
        .from('partidos')
        .update(lado1 === 'a' ? { equipo_a: eq2 } : { equipo_b: eq2 })
        .eq('id', p1.id),
    );
    const r2 = r1.error
      ? null
      : vigilar(
          await sb
            .from('partidos')
            .update(lado2 === 'a' ? { equipo_a: eq1 } : { equipo_b: eq1 })
            .eq('id', p2.id),
        );
    setOcupado(false);
    const error = r1.error ?? r2?.error;
    if (error) {
      setErrOp({
        texto: `No se pudo completar el intercambio; reintenta para dejarlo bien. (${error.message})`,
        reintentar: () => void intercambiar(p1, lado1, p2, lado2),
      });
      return;
    }
    setSel(null);
    await onCambiado();
  }

  function tocarIntercambio(p: PartidoBase, lado: 'a' | 'b') {
    if (ocupado || equipoDe(p, lado) == null) return;
    if (sel == null) {
      setSel({ id: p.id, lado });
      return;
    }
    if (sel.id === p.id) {
      // Mismo equipo: soltar. Otro equipo del MISMO cruce: mover la selección
      // ahí (intercambiarlos entre sí no cambiaría nada).
      setSel(sel.lado === lado ? null : { id: p.id, lado });
      return;
    }
    const p1 = cruces.find((x) => x.id === sel.id);
    if (p1) void intercambiar(p1, sel.lado, p, lado);
    else setSel(null); // el cruce marcado ya no existe: resincronizado por el padre
  }

  // Nombre del equipo marcado, para el aviso de «elige con quién intercambiarlo».
  function nombreSel(): string {
    if (sel == null) return '';
    const p = cruces.find((x) => x.id === sel.id);
    return p ? nombre(equipoDe(p, sel.lado)) : '';
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

  // Cada equipo lleva su propio ⇄: el intercambio es de equipos entre cruces,
  // no de cruces enteros. Solo mientras el cruce siga en borrador.
  const lado = (p: PartidoBase, l: 'a' | 'b') => {
    const equipo = equipoDe(p, l);
    const semilla = equipo != null ? semillas?.get(equipo) : null;
    const marcado = sel != null && sel.id === p.id && sel.lado === l;
    return (
      <div className={`pc-lado${marcado ? ' sel' : ''}`}>
        <span className="tn">
          <b>{nombre(equipo)}</b> {semilla != null && <span className="seed">({semilla})</span>}
        </span>
        {p.publicado !== true && (
          <button
            className="sw"
            disabled={ocupado || equipo == null}
            aria-label={
              marcado ? `Soltar a ${nombre(equipo)}` : `Intercambiar a ${nombre(equipo)} de cruce`
            }
            onClick={() => tocarIntercambio(p, l)}
          >
            ⇄
          </button>
        )}
      </div>
    );
  };

  const fila = (p: PartidoBase, i: number) => (
    <div className={`pc-cross${sel != null && sel.id === p.id ? ' sel' : ''}`} key={String(p.id)}>
      <span className="n">{i + 1}</span>
      <div className="tcol">
        {lado(p, 'a')}
        {lado(p, 'b')}
      </div>
    </div>
  );

  return (
    <div>
      <div className="pc-calm ambar">
        <div className="l">Borrador · el público no lo ve</div>
        <div className="h">Revisa y cambia lo que quieras</div>
        <div className="p">
          Toca ⇄ en un equipo y luego en un equipo de otro cruce para permutarlos (p. ej. separar
          a dos que hayan caído juntos). Cuando confirmes, el cuadro se hace público y se abre la
          porra.
        </div>
      </div>

      <div className="pc-sec">
        <span>Cruces</span>
        {semillas && <span className="seed">SEMILLA · RANKING</span>}
      </div>
      {cruces.map(fila)}
      {sel != null && (
        <p className="pc-hint">
          <b>{nombreSel()}</b> marcado. Elige con quién intercambiarlo: toca ⇄ en un equipo de
          otro cruce, o en el mismo para soltarlo.
        </p>
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
