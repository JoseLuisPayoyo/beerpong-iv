// Lógica de generación y derivación compartida entre las pestañas del panel
// (Eliminatoria, Grupos, Semis·Final) y la pantalla «Ahora». Solo cálculo puro:
// las escrituras y su manejo de errores viven en cada componente.
import {
  clasificar,
  compararStandings,
  type Id,
  type PartidoClasif,
  type Standing,
} from '../../lib/clasificacion';

export type FaseElim = 'dieciseisavos' | 'octavos' | 'cuartos' | 'semifinal' | 'final';
export type Fase = 'grupo' | FaseElim;

export const ORDEN_ELIM: FaseElim[] = ['dieciseisavos', 'octavos', 'cuartos', 'semifinal', 'final'];
export const fasesDesde = (f: FaseElim): FaseElim[] => ORDEN_ELIM.slice(ORDEN_ELIM.indexOf(f));

export const NOMBRE_RONDA: Record<string, string> = {
  dieciseisavos: 'los dieciseisavos',
  octavos: 'los octavos',
  cuartos: 'los cuartos',
  semifinal: 'las semifinales',
  final: 'la final',
};

export interface PartidoBase {
  id: Id;
  fase: string;
  grupo_id?: number | null; // no todas las pestañas lo cargan
  orden: number;
  equipo_a: Id | null;
  equipo_b: Id | null;
  vasos_a: number | null;
  vasos_b: number | null;
  ganador_id: Id | null;
  estado: string;
  publicado?: boolean; // false = borrador (el ⇄ de ConfirmarCruces solo sale ahí)
}

/** Fila nueva de un cruce de eliminatoria (siempre nace en borrador). */
export interface FilaElim {
  fase: string;
  grupo_id: null;
  orden: number;
  equipo_a: Id | null;
  equipo_b: Id | null;
  estado: string;
  publicado: boolean;
  mesa: number;
  tanda: number;
}

// Mesa y tanda de un cruce según su fase y orden (mockup: 6+6+4, 6+2, 4).
export function mesaTanda(fase: Fase, orden: number): { mesa: number; tanda: number } {
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

/** Los 32 clasificados en orden de semilla (1–13 primeros, 14–26 segundos y
    después los mejores terceros hasta 32), a partir de los partidos de grupo
    jugados. El 3º de un grupo de 3 NO entra en la bolsa de terceros: juega un
    partido menos y no es comparable. La condición es por número de equipos
    del grupo (dinámica), nunca por letra ni id: si un grupo de 3 pasa a 4,
    su tercero entra solo. */
export function construirSemillas(partidos: PartidoBase[]): Id[] {
  const deGrupo = partidos.filter((p) => p.fase === 'grupo');
  const gids = [...new Set(deGrupo.map((p) => p.grupo_id).filter((g): g is number => g != null))]
    .sort((a, b) => a - b);
  const primeros: Standing[] = [];
  const segundos: Standing[] = [];
  const terceros: Standing[] = [];
  for (const gid of gids) {
    const gPart = deGrupo.filter((p) => p.grupo_id === gid);
    const equipoIds = [
      ...new Set(gPart.flatMap((p) => [p.equipo_a, p.equipo_b].filter((x): x is Id => x != null))),
    ];
    const tabla = clasificar(equipoIds, gPart);
    primeros.push(tabla[0]);
    segundos.push(tabla[1]);
    if (tabla.length >= 4 && tabla[2]) terceros.push(tabla[2]); // solo grupos de 4
  }
  primeros.sort(compararStandings);
  segundos.sort(compararStandings);
  terceros.sort(compararStandings);
  // Plazas de terceros: lo que quede hasta 32 (6 con 13 grupos, 8 con 12).
  const plazasTerceros = 32 - primeros.length - segundos.length;
  return [...primeros, ...segundos, ...terceros.slice(0, plazasTerceros)].map((s) => s.equipoId);
}

/** Mapa equipo → semilla (1-32), para pintar «(n)» junto a cada nombre. */
export function mapaSemillas(partidos: PartidoBase[]): Map<Id, number> {
  const m = new Map<Id, number>();
  construirSemillas(partidos).forEach((id, i) => m.set(id, i + 1));
  return m;
}

/** Filas de los 16 dieciseisavos por siembra (semilla i+1 vs 32−i), EN BORRADOR. */
export function filasDieciseisavos(semillas: Id[]): FilaElim[] {
  return Array.from({ length: 16 }, (_, i) => {
    const { mesa, tanda } = mesaTanda('dieciseisavos', i);
    return {
      fase: 'dieciseisavos',
      grupo_id: null,
      orden: i,
      equipo_a: semillas[i],
      equipo_b: semillas[31 - i],
      estado: 'pendiente',
      publicado: false,
      mesa,
      tanda,
    };
  });
}

/** Filas de una ronda por plegado de la anterior (W(i) vs W(N−1−i)), EN BORRADOR.
    `prev` debe venir ordenada por orden y completamente jugada. */
export function filasSiguienteRonda(nueva: FaseElim, prev: PartidoBase[]): FilaElim[] {
  const N = prev.length;
  return Array.from({ length: N / 2 }, (_, i) => {
    const { mesa, tanda } = mesaTanda(nueva, i);
    return {
      fase: nueva,
      grupo_id: null,
      orden: i,
      equipo_a: prev[i].ganador_id,
      equipo_b: prev[N - 1 - i].ganador_id,
      estado: 'pendiente',
      publicado: false,
      mesa,
      tanda,
    };
  });
}

/** Los cruces de un grupo por posición, según su número de equipos; el índice
    del par es el `orden`. Para 4 equipos, en orden round-robin por rondas de
    parejas disjuntas ([1,2],[3,4] · [1,3],[2,4] · [1,4],[2,3]): el grupo M
    juega 2 cruces a la vez en 2 mesas (franjas 18:30/18:40/18:50) y ese orden
    lo permite; en A–L (secuencial) da además mejores descansos. Otros tamaños
    (por si acaso): todas las parejas i<j en orden. */
export function paresDeGrupo(nEquipos: number): Array<[number, number]> {
  if (nEquipos === 4) {
    return [
      [1, 2],
      [3, 4],
      [1, 3],
      [2, 4],
      [1, 4],
      [2, 3],
    ];
  }
  const pares: Array<[number, number]> = [];
  for (let a = 1; a <= nEquipos; a++) {
    for (let b = a + 1; b <= nEquipos; b++) pares.push([a, b]);
  }
  return pares;
}

/** Las filas de la fase de grupos (78: 6 por cada uno de los 13 grupos) a
    partir de grupo → (posición → equipo). Nacen publicadas: la fase de grupos
    no tiene borrador. */
export function filasPartidosGrupo(posicionesPorGrupo: Map<number, Map<number, Id>>) {
  const filas = [];
  const gids = [...posicionesPorGrupo.keys()].sort((a, b) => a - b);
  for (const gid of gids) {
    const posiciones = posicionesPorGrupo.get(gid)!;
    const pares = paresDeGrupo(posiciones.size);
    for (let orden = 0; orden < pares.length; orden++) {
      const [a, b] = pares[orden];
      filas.push({
        fase: 'grupo',
        grupo_id: gid,
        orden,
        equipo_a: posiciones.get(a)!,
        equipo_b: posiciones.get(b)!,
        estado: 'pendiente',
      });
    }
  }
  return filas;
}

/** Estado y 1º que corresponden a un grupo según sus partidos (6 con 4
    equipos: n·(n−1)/2 para n equipos). */
export function derivarGrupo(delGrupo: PartidoClasif[]): {
  estado: 'en_curso' | 'completo';
  ganadorId: Id | null;
} {
  const equipoIds = [
    ...new Set(delGrupo.flatMap((x) => [x.equipo_a, x.equipo_b].filter((v): v is Id => v != null))),
  ];
  const esperados = (equipoIds.length * (equipoIds.length - 1)) / 2;
  const completo =
    delGrupo.length > 0 &&
    delGrupo.length === esperados &&
    delGrupo.every((x) => x.estado === 'jugado');
  if (!completo) return { estado: 'en_curso', ganadorId: null };
  return { estado: 'completo', ganadorId: clasificar(equipoIds, delGrupo)[0]?.equipoId ?? null };
}

/** Mesa «física» de un partido de grupo: A–F y G–L reparten las mesas 1–6.
    El grupo M (13) juega a las 18:30 en DOS mesas (las 1 y 2, libres a esa
    hora): sus cruces alternan mesa por orden (0→1, 1→2, 2→1…). */
export const mesaDeGrupo = (grupoId: number) => ((grupoId - 1) % 6) + 1;
export const mesaDePartidoGrupo = (grupoId: number, orden: number) =>
  grupoId === 13 ? (orden % 2) + 1 : mesaDeGrupo(grupoId);

/** Redondea al siguiente cuarto de hora (para el valor inicial del selector). */
export function siguienteCuarto(desde: Date): Date {
  const d = new Date(desde.getTime());
  d.setSeconds(0, 0);
  const resto = d.getMinutes() % 15;
  d.setMinutes(d.getMinutes() + (15 - resto));
  return d;
}

export const horaCorta = (d: Date) =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
