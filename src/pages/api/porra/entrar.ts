import type { APIRoute } from 'astro';
import { json, leerBody, clienteServidor, verificarParticipante } from './_utils';

// On-demand (SSR): necesita la secret key en el servidor.
export const prerender = false;

// Entrar con un mote existente. Cualquier fallo (mote inexistente, PIN mal,
// formato inválido) responde el MISMO 401 genérico: no se filtra si un mote
// existe o no.
export const POST: APIRoute = async ({ request }) => {
  const body = await leerBody(request);
  if (!body) {
    return json({ error: 'No hemos podido leer los datos. Inténtalo de nuevo.' }, 400);
  }

  const mote = String(body.mote ?? '').trim();
  const pin = String(body.pin ?? '').trim();

  const sb = clienteServidor();
  if (!sb) {
    return json({ error: 'No hemos podido procesar la entrada. Inténtalo más tarde.' }, 500);
  }

  const participante = await verificarParticipante(sb, mote, pin);
  if (!participante) {
    return json({ error: 'Mote o PIN incorrectos.' }, 401);
  }

  return json({ ok: true, id: participante.id, mote: participante.mote });
};
