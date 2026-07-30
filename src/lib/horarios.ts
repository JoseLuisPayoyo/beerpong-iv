// Horario previsto de la noche — ÚNICA fuente de verdad de horas escritas.
// Son VENTANAS de fase, no horas por partido: con las mesas moviéndose, una
// hora por cruce mentiría a los 15 minutos.
//
// Si el admin fija `fases.hora_inicio` (al confirmar los cruces de una ronda),
// esa hora MANDA sobre la constante: es la real. Usa siempre `horaDeFase`.

export const HORARIOS = {
  apertura: '18:00',
  turno1: '19:00', // grupos A–F
  turno2: '20:00', // grupos G–L
  cena: '21:00',
  dieciseisavos: '22:00',
  octavos: '22:30',
  cuartos: '22:50',
  semifinal: '23:00',
  final: '23:30',
} as const;

// La noche de después (landing, sección "La noche"): sesión DJ hasta el cierre.
export const HORARIOS_NOCHE = ['20:00', '00:00', '02:00'] as const;

// Ventana prevista por nombre de fase de la porra (fases.nombre).
const VENTANA_FASE: Record<string, string> = {
  grupos: HORARIOS.turno1,
  dieciseisavos: HORARIOS.dieciseisavos,
  octavos: HORARIOS.octavos,
  cuartos: HORARIOS.cuartos,
  semifinal: HORARIOS.semifinal,
  final: HORARIOS.final,
};

export interface FaseConHora {
  nombre: string;
  hora_inicio?: string | null; // ISO
}

export const horaCortaDeIso = (iso: string): string => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Hora que manda para una fase: `fases.hora_inicio` si el admin la fijó;
    si no, la ventana prevista del horario. */
export function horaDeFase(nombre: string, fases?: FaseConHora[]): string | null {
  const real = fases?.find((f) => f.nombre === nombre)?.hora_inicio;
  if (real) return horaCortaDeIso(real);
  return VENTANA_FASE[nombre] ?? null;
}

// Ritmo de la fase de grupos: cada grupo juega sus 6 cruces seguidos en su
// mesa fija, así que la hora por cruce es derivable (solo aquí; en la
// eliminatoria las mesas se cruzan y solo vale la ventana de fase).
export const MINUTOS_POR_CRUCE_GRUPO = 10;
export const MINUTOS_ENTRE_TURNOS = 60;

const aMinutos = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};
const aHora = (min: number): string =>
  `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

/** Inicio del turno: el 1 es la hora real de la fase de grupos si está fijada
    (si no, la ventana prevista); el 2 es siempre turno 1 + 60 min. */
export function horaDeTurno(turno: number, fases?: FaseConHora[]): string {
  const inicioT1 = horaDeFase('grupos', fases) ?? HORARIOS.turno1;
  return turno === 2 ? aHora(aMinutos(inicioT1) + MINUTOS_ENTRE_TURNOS) : inicioT1;
}

/** Hora PREVISTA de un cruce de grupo: inicio de su turno + orden × 10 min.
    (orden 0–5 → 19:00, 19:10, … / 20:00, 20:10, … con las constantes.) */
export function horaDePartidoGrupo(
  turno: number,
  orden: number,
  fases?: FaseConHora[],
): string {
  return aHora(aMinutos(horaDeTurno(turno, fases)) + orden * MINUTOS_POR_CRUCE_GRUPO);
}
