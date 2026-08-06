// Clasificación de un grupo de beer pong. Compartida por la pestaña Grupos
// (para fijar `grupos.ganador_id`) y por la siembra de dieciseisavos.
//
// Por equipo, a partir de sus partidos de grupo `jugado`:
//   PJ  partidos jugados
//   G   victorias · E  empates (los partidos van a tiempo y pueden empatarse)
//   VF  vasos a favor · VC vasos en contra · DIF = VF − VC
//   PTS = 3 × G + 1 × E
// Orden: PTS desc → DIF desc → VF desc.

export type Id = string | number;

export interface PartidoClasif {
  equipo_a: Id | null;
  equipo_b: Id | null;
  vasos_a: number | null;
  vasos_b: number | null;
  estado: string;
}

export interface Standing {
  equipoId: Id;
  pj: number;
  g: number;
  e: number;
  vf: number;
  vc: number;
  dif: number;
  pts: number;
}

/** Comparador PTS → DIF → VF (descendente). Sirve también para ordenar
    equipos de distintos grupos entre sí (1ºs, 2ºs, mejores 3ºs). */
export function compararStandings(x: Standing, y: Standing): number {
  return y.pts - x.pts || y.dif - x.dif || y.vf - x.vf;
}

export function clasificar(equipoIds: Id[], partidos: PartidoClasif[]): Standing[] {
  const tabla = new Map<Id, Standing>();
  for (const id of equipoIds) {
    tabla.set(id, { equipoId: id, pj: 0, g: 0, e: 0, vf: 0, vc: 0, dif: 0, pts: 0 });
  }
  for (const p of partidos) {
    if (p.estado !== 'jugado' || p.vasos_a == null || p.vasos_b == null) continue;
    if (p.equipo_a == null || p.equipo_b == null) continue;
    const a = tabla.get(p.equipo_a);
    const b = tabla.get(p.equipo_b);
    if (!a || !b) continue;
    a.pj++;
    b.pj++;
    a.vf += p.vasos_a;
    a.vc += p.vasos_b;
    b.vf += p.vasos_b;
    b.vc += p.vasos_a;
    if (p.vasos_a > p.vasos_b) a.g++;
    else if (p.vasos_a < p.vasos_b) b.g++;
    else {
      a.e++;
      b.e++;
    }
  }
  const filas = [...tabla.values()];
  for (const f of filas) {
    f.dif = f.vf - f.vc;
    f.pts = 3 * f.g + f.e;
  }
  filas.sort(compararStandings);
  return filas;
}
