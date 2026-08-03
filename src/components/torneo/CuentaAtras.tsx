import { useEffect, useState } from 'react';
import { formatearRestante } from '../../lib/horarios';
import type { FaseRow } from './tipos';

// Cuenta atrás de la porra: informativa (al llegar a cero NO se cierra nada;
// la porra de cada cruce se cierra cuando el admin lo marca en juego).

/** Desfase (ms) entre el reloj del servidor y el del móvil, calculado UNA vez
    al cargar con la cabecera `Date` de una respuesta del propio hosting. */
export async function calcularDesfase(): Promise<number> {
  try {
    const r = await fetch(window.location.href, { method: 'HEAD', cache: 'no-store' });
    const d = r.headers.get('date');
    if (!d) return 0;
    // La cabecera Date trunca a segundos: +500 ms centra el error.
    return new Date(d).getTime() + 500 - Date.now();
  } catch {
    return 0; // sin cabecera o sin red: se cuenta con la hora del móvil
  }
}

/** ¿La fase ya ha empezado? (algún partido suyo fuera de `pendiente`).
    La fase de porra 'grupos' corresponde a partidos.fase='grupo'. */
export function faseEmpezada(
  nombre: string,
  partidos: { fase: string; estado: string }[],
): boolean {
  const f = nombre === 'grupos' ? 'grupo' : nombre;
  return partidos.some((p) => p.fase === f && p.estado !== 'pendiente');
}

/** La fase con cuenta atrás en marcha: porra abierta, hora en el futuro y
    SIN empezar (si ya rueda un partido, el reloj sobra aunque no llegara a
    cero). Con varias candidatas gana la de menor orden (fases viene ordenada). */
export function faseConCuenta(
  fases: FaseRow[],
  partidos: { fase: string; estado: string }[],
  desfase: number,
): FaseRow | null {
  const ahora = Date.now() + desfase;
  return (
    fases.find(
      (f) =>
        f.porra_abierta &&
        f.hora_inicio != null &&
        new Date(f.hora_inicio).getTime() > ahora &&
        !faseEmpezada(f.nombre, partidos),
    ) ?? null
  );
}

export const horaCorta = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Lo que falta hasta hora_inicio en formato adaptativo (formatearRestante),
    contando en local sobre el desfase calculado. Devuelve null cuando llega a
    cero: quien la usa deja de pintarla. */
export function useRestante(horaInicio: string, desfase: number): string | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = new Date(horaInicio).getTime() - (Date.now() + desfase);
  if (ms <= 0) return null;
  return formatearRestante(ms);
}
