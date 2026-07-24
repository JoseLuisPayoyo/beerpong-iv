import type { APIRoute } from 'astro';
import { json, leerBody, clienteServidor, verificarParticipante } from './_utils';

// On-demand (SSR): necesita la secret key en el servidor.
export const prerender = false;

// Recuperar tus apuestas (p. ej. desde otro móvil). Verifica mote+PIN y
// devuelve solo las apuestas de ese participante.
// POST y no GET a propósito: el PIN en la query string de un GET acabaría en
// los access logs del hosting (registran path+query), y los PINs no se
// registran en ningún log.
export const POST: APIRoute = async ({ request }) => {
  const body = await leerBody(request);
  if (!body) {
    return json({ error: 'No hemos podido leer los datos. Inténtalo de nuevo.' }, 400);
  }

  const mote = String(body.mote ?? '').trim();
  const pin = String(body.pin ?? '').trim();

  const sb = clienteServidor();
  if (!sb) {
    return json({ error: 'No hemos podido cargar tus apuestas. Inténtalo más tarde.' }, 500);
  }

  const participante = await verificarParticipante(sb, mote, pin);
  if (!participante) {
    return json({ error: 'Mote o PIN incorrectos.' }, 401);
  }

  const { data, error } = await sb
    .from('apuestas')
    .select('fase,grupo_id,partido_id,pick_equipo_id')
    .eq('participante_id', participante.id);
  if (error) {
    return json({ error: 'No hemos podido cargar tus apuestas. Inténtalo más tarde.' }, 500);
  }

  return json({ ok: true, id: participante.id, mote: participante.mote, picks: data });
};
