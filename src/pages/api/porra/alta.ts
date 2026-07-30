import type { APIRoute } from 'astro';
import bcrypt from 'bcryptjs';
import { json, leerBody, clienteServidor, logError, moteValido, pinValido, escaparIlike } from './_utils';

// On-demand (SSR): necesita la secret key en el servidor.
export const prerender = false;

// Alta en la porra: mote (2–20 chars, único case-insensitive) + PIN de 4 dígitos.
// Guarda solo el hash bcrypt del PIN; el PIN nunca se almacena ni se registra.
export const POST: APIRoute = async ({ request }) => {
  const body = await leerBody(request);
  if (!body) {
    return json({ error: 'No hemos podido leer los datos. Inténtalo de nuevo.' }, 400);
  }

  const mote = String(body.mote ?? '').trim();
  const pin = String(body.pin ?? '').trim();
  if (!moteValido(mote)) {
    return json({ error: 'Mote de 2 a 20 caracteres: letras, números y espacios.' }, 400);
  }
  if (!pinValido(pin)) {
    return json({ error: 'El PIN debe ser exactamente 4 dígitos.' }, 400);
  }

  const sb = clienteServidor();
  if (!sb) {
    return json({ error: 'No hemos podido procesar el alta. Inténtalo más tarde.' }, 500);
  }

  // Comprobación amistosa; la garantía real es el índice único sobre
  // lower(trim(mote)), que cubre la carrera entre dos altas a la vez.
  const { data: existente, error: e0 } = await sb
    .from('participantes')
    .select('id')
    .ilike('mote', escaparIlike(mote))
    .maybeSingle();
  if (e0) {
    logError('alta: comprobar mote', e0);
    return json({ error: 'No hemos podido comprobar el mote. Inténtalo más tarde.' }, 500);
  }
  if (existente) {
    return json({ error: 'Ese mote ya está pillado, elige otro.' }, 409);
  }

  const pin_hash = await bcrypt.hash(pin, 10);
  const { data, error } = await sb
    .from('participantes')
    .insert({ mote, pin_hash })
    .select('id,mote')
    .single();
  if (error) {
    if (error.code === '23505') {
      return json({ error: 'Ese mote ya está pillado, elige otro.' }, 409);
    }
    logError('alta: crear participante', error);
    return json({ error: 'No hemos podido crear el mote. Inténtalo más tarde.' }, 500);
  }

  return json({ ok: true, id: data.id, mote: data.mote });
};
