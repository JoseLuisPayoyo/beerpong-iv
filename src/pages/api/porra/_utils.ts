// Utilidades compartidas por los endpoints de la porra (/api/porra/*).
// El prefijo _ excluye este archivo del router de Astro: no es una ruta.
//
// `participantes` y `apuestas` tienen RLS sin políticas: el navegador no puede
// tocarlas. Todo pasa por aquí con la SUPABASE_SECRET_KEY (solo servidor).
// La "sesión" es mote+PIN en cada petición: se verifica el hash con bcrypt
// antes de tocar nada. Nunca nos fiamos de un participante_id del cliente.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    // no-store: respuestas personales de la porra, que nadie las cachee
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export async function leerBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Cliente de SERVIDOR con la secret key (salta RLS; solo en /api/porra/*).
export function clienteServidor(): SupabaseClient | null {
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const secret = import.meta.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) return null;
  return createClient(url, secret, { auth: { persistSession: false } });
}

// Mote: 2–20 chars con charset cerrado (letras/números unicode, espacio y
// . _ ' -). Sin * ni % ni \: PostgREST traduce * a % en los patrones de
// ilike y NO hay forma fiable de escaparlo, así que el charset es lo que
// garantiza que la búsqueda del mote sea igualdad literal (sin comodines).
export const moteValido = (m: string) => /^[\p{L}\p{M}\p{N} _.'-]{2,20}$/u.test(m);
export const pinValido = (p: string) => /^\d{4}$/.test(p);

// Escapa los comodines clásicos de ILIKE (% y _; el * lo bloquea moteValido)
// para que el patrón sea igualdad case-insensitive.
export const escaparIlike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// Hash válido de relleno: cuando el mote no existe se compara igualmente
// contra él para que el tiempo de respuesta no delate si el mote existe.
const HASH_RELLENO = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export interface ParticipanteOk {
  id: string;
  mote: string;
}

// Busca el mote (case-insensitive) y verifica el PIN contra el hash.
// Devuelve null tanto si el mote no existe como si el PIN no cuadra:
// el llamante responde 401 genérico sin distinguir los casos.
export async function verificarParticipante(
  sb: SupabaseClient,
  mote: string,
  pin: string,
): Promise<ParticipanteOk | null> {
  if (!moteValido(mote) || !pinValido(pin)) return null;
  const { data, error } = await sb
    .from('participantes')
    .select('id,mote,pin_hash')
    .ilike('mote', escaparIlike(mote))
    .maybeSingle();
  if (error || !data) {
    await bcrypt.compare(pin, HASH_RELLENO);
    return null;
  }
  const ok = await bcrypt.compare(pin, String(data.pin_hash));
  return ok ? { id: String(data.id), mote: String(data.mote) } : null;
}
