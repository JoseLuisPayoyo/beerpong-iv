// "Sesión" de la porra: sin login real ni tokens. Tras alta/entrar se guarda
// { id, mote, pin } en localStorage y cada escritura manda mote+PIN; el
// servidor verifica el hash con bcrypt antes de tocar nada. Comunidad pequeña,
// sin dinero: no hay estado de servidor que mantener.
export interface Sesion {
  id: string;
  mote: string;
  pin: string;
}

const CLAVE = 'porra_sesion';

export function leerSesion(): Sesion | null {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const s = JSON.parse(crudo) as Partial<Sesion>;
    if (typeof s.id === 'string' && typeof s.mote === 'string' && typeof s.pin === 'string') {
      return { id: s.id, mote: s.mote, pin: s.pin };
    }
  } catch {
    // localStorage bloqueado o JSON corrupto: sin sesión.
  }
  return null;
}

export function guardarSesion(s: Sesion): void {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(s));
  } catch {
    // Modo privado sin almacenamiento: la sesión vivirá solo en memoria.
  }
}

export function borrarSesion(): void {
  try {
    localStorage.removeItem(CLAVE);
  } catch {
    // Nada que borrar.
  }
}
