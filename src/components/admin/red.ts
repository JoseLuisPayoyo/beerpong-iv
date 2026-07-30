// Detector de conexión del panel: cada operación contra Supabase (o contra
// /api/admin/*) pasa su resultado por aquí. Si una petición falla por red se
// enciende el aviso fijo de la cabecera («Sin conexión…») y NO se apaga hasta
// que otra petición vuelva a ir bien — tal cual lo ve el admin en el pabellón.
import { useSyncExternalStore } from 'react';

let sinConexion = false;
const oyentes = new Set<() => void>();

function emitir() {
  for (const f of oyentes) f();
}

// Mensajes típicos de fallo de transporte (fetch/undici/Safari/Firefox).
// Un error de validación o de RLS NO es un fallo de red: no enciende el aviso.
const PATRONES_RED = /failed to fetch|networkerror|load failed|network request failed|fetch failed|timeout|abort/i;

export function esFalloRed(mensaje: string): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  return PATRONES_RED.test(mensaje);
}

/** Registra el desenlace de una petición: error (o null si fue bien). */
export function registrarRed(error: { message: string } | null | undefined) {
  const antes = sinConexion;
  if (!error) sinConexion = false;
  else if (esFalloRed(error.message)) sinConexion = true;
  if (antes !== sinConexion) emitir();
}

/** Pasa una respuesta de supabase-js por el detector y la devuelve tal cual:
    `const { error } = vigilar(await sb.from(...).update(...));` */
export function vigilar<T extends { error: { message: string } | null }>(res: T): T {
  registrarRed(res.error);
  return res;
}

export function useSinConexion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      oyentes.add(cb);
      return () => oyentes.delete(cb);
    },
    () => sinConexion,
    () => false,
  );
}
