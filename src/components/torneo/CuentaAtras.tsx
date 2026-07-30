import { useEffect, useState } from 'react';
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

/** La fase con porra abierta y hora objetivo aún en el futuro (si la hay). */
export function faseConCuenta(fases: FaseRow[], desfase: number): FaseRow | null {
  const ahora = Date.now() + desfase;
  return (
    fases.find(
      (f) => f.porra_abierta && f.hora_inicio != null && new Date(f.hora_inicio).getTime() > ahora,
    ) ?? null
  );
}

export const horaCorta = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** «MM:SS» hasta hora_inicio, contando en local sobre el desfase calculado.
    Devuelve null cuando llega a cero: quien la usa deja de pintarla. */
export function useRestante(horaInicio: string, desfase: number): string | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = new Date(horaInicio).getTime() - (Date.now() + desfase);
  if (ms <= 0) return null;
  const mm = Math.floor(ms / 60000);
  const ss = Math.floor((ms % 60000) / 1000);
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
