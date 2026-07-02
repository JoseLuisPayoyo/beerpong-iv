import type { APIRoute } from 'astro';
import { createClient } from '@supabase/supabase-js';

// On-demand (SSR): necesita ejecutarse en el servidor para usar la secret key.
export const prerender = false;

const TOTAL_PLAZAS = 48;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const lenOk = (s: string) => s.length >= 2 && s.length <= 60;
const telOk = (s: string) => /^[\d\s+]{7,20}$/.test(s);

export const POST: APIRoute = async ({ request }) => {
  // --- body ---
  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'No hemos podido leer los datos. Inténtalo de nuevo.' }, 400);
  }

  // --- honeypot: si viene relleno, es un bot -> OK fingido sin insertar ---
  const honeypot = String(payload.web ?? payload.apodo ?? '').trim();
  if (honeypot) {
    return json({ ok: true, estado: 'confirmado' });
  }

  // --- normalización (trim) ---
  const nombre_equipo = String(payload.nombre_equipo ?? '').trim();
  const participante_1 = String(payload.participante_1 ?? '').trim();
  const participante_2 = String(payload.participante_2 ?? '').trim();
  const telefono = String(payload.telefono ?? '').trim();

  // --- validación de servidor (no nos fiamos del cliente) ---
  if (!lenOk(nombre_equipo)) {
    return json({ error: 'Revisa el nombre del equipo (entre 2 y 60 caracteres).' }, 400);
  }
  if (!lenOk(participante_1)) {
    return json({ error: 'Revisa el nombre del participante 1 (entre 2 y 60 caracteres).' }, 400);
  }
  if (!lenOk(participante_2)) {
    return json({ error: 'Revisa el nombre del participante 2 (entre 2 y 60 caracteres).' }, 400);
  }
  if (!telOk(telefono)) {
    return json({ error: 'Revisa el teléfono de contacto.' }, 400);
  }

  // --- cliente de servidor con la secret key (salta RLS; solo aquí) ---
  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const secret = import.meta.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    return json({ error: 'No hemos podido procesar la inscripción. Inténtalo más tarde.' }, 500);
  }
  const supabase = createClient(url, secret, { auth: { persistSession: false } });

  // --- tope de 48 en el servidor: confirmado vs lista de espera ---
  const { data: stats, error: statsError } = await supabase
    .from('stats')
    .select('equipos_count')
    .eq('id', 1)
    .single();
  if (statsError) {
    return json({ error: 'No hemos podido procesar la inscripción. Inténtalo más tarde.' }, 500);
  }

  const count = Number(stats?.equipos_count ?? 0);
  const estado: 'confirmado' | 'espera' = count < TOTAL_PLAZAS ? 'confirmado' : 'espera';

  // El trigger de la BD actualiza `stats` solo; no lo tocamos.
  const { error: insertError } = await supabase.from('equipos').insert({
    nombre_equipo,
    participante_1,
    participante_2,
    telefono,
    estado,
  });
  if (insertError) {
    return json({ error: 'No hemos podido guardar la inscripción. Inténtalo más tarde.' }, 500);
  }

  if (estado === 'espera') {
    // Posición = total de equipos en espera tras la inserción.
    const { count: esperaCount } = await supabase
      .from('equipos')
      .select('*', { count: 'exact', head: true })
      .eq('estado', 'espera');
    return json({ ok: true, estado: 'espera', posicion: esperaCount ?? null });
  }

  return json({ ok: true, estado: 'confirmado' });
};
