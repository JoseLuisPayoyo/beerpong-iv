import type { APIRoute } from 'astro';
import { json, leerBody, clienteServidor } from '../porra/_utils';

// On-demand (SSR): necesita la secret key en el servidor.
export const prerender = false;

// Borrado de rondas para el panel de administración. El navegador del admin no
// puede borrar `apuestas` (RLS sin políticas), así que el borrado en cascada de
// una ronda vive aquí, con la secret key, tras verificar el JWT del admin.
//
//   accion 'contar' → cuántos partidos por fase y cuántas apuestas caerían.
//   accion 'borrar' → borra apuestas de esos cruces, luego los partidos, y
//                     cierra la porra de las fases eliminatorias borradas.
//
// Las apuestas se borran EXPLÍCITAMENTE antes que los partidos: mismo resultado
// que el ON DELETE CASCADE pero sin depender de que la FK lo tenga configurado.
// Las apuestas de la porra de grupos (por grupo_id, no por partido_id) no se
// tocan: sobreviven a regenerar los partidos de grupo.

const FASES_VALIDAS = ['grupo', 'dieciseisavos', 'octavos', 'cuartos', 'semifinal', 'final'];

export const POST: APIRoute = async ({ request }) => {
  const sb = clienteServidor();
  if (!sb) {
    return json({ error: 'Falta la configuración del servidor (secret key).' }, 500);
  }

  // Solo el admin con sesión de Supabase Auth: su JWT se verifica contra Auth.
  const token = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Sin autorización.' }, 401);
  const { data: quien, error: eAuth } = await sb.auth.getUser(token);
  if (eAuth || !quien?.user) return json({ error: 'Sin autorización.' }, 401);

  const body = await leerBody(request);
  const accion = String(body?.accion ?? '');
  const fases = Array.isArray(body?.fases) ? (body.fases as unknown[]).map(String) : [];
  if (
    (accion !== 'contar' && accion !== 'borrar') ||
    fases.length === 0 ||
    !fases.every((f) => FASES_VALIDAS.includes(f))
  ) {
    return json({ error: 'Petición mal formada.' }, 400);
  }

  const { data: partidos, error: eP } = await sb.from('partidos').select('id,fase').in('fase', fases);
  if (eP) {
    return json({ error: `No se pudieron consultar los partidos. (${eP.message})` }, 500);
  }

  const ids = (partidos ?? []).map((p) => String(p.id));
  const porFase: Record<string, number> = {};
  for (const f of fases) porFase[f] = 0;
  for (const p of partidos ?? []) porFase[String(p.fase)] = (porFase[String(p.fase)] ?? 0) + 1;

  let apuestas = 0;
  if (ids.length > 0) {
    const { count, error: eA } = await sb
      .from('apuestas')
      .select('id', { count: 'exact', head: true })
      .in('partido_id', ids);
    if (eA) {
      return json({ error: `No se pudieron consultar las apuestas. (${eA.message})` }, 500);
    }
    apuestas = count ?? 0;
  }

  if (accion === 'contar') {
    return json({ ok: true, partidos: porFase, apuestas });
  }

  // ---- accion 'borrar' (el orden importa) ----
  // 1) las apuestas de esos cruces
  if (ids.length > 0) {
    const { error } = await sb.from('apuestas').delete().in('partido_id', ids);
    if (error) {
      return json({ error: `No se pudieron borrar las apuestas. (${error.message})` }, 500);
    }
  }
  // 2) los partidos de esas fases
  const { error: eBorra } = await sb.from('partidos').delete().in('fase', fases);
  if (eBorra) {
    return json(
      { error: `Apuestas borradas, pero no se pudieron borrar los partidos. (${eBorra.message})` },
      500,
    );
  }
  // 3) cerrar la porra de las fases eliminatorias borradas (quien regenere una
  //    ronda vuelve a abrirla al crearla). La porra 'grupos' no se toca.
  const fasesElim = fases.filter((f) => f !== 'grupo');
  if (fasesElim.length > 0) {
    const { error } = await sb.from('fases').update({ porra_abierta: false }).in('nombre', fasesElim);
    if (error) {
      return json(
        { error: `Partidos borrados, pero no se pudo cerrar su porra. (${error.message})` },
        500,
      );
    }
  }
  // 4) si cae la fase de grupos, ningún grupo puede seguir «completo» ni tener 1º
  if (fases.includes('grupo')) {
    const { error: e1 } = await sb
      .from('grupos')
      .update({ ganador_id: null })
      .not('ganador_id', 'is', null);
    if (e1) {
      return json(
        { error: `Partidos borrados, pero no se pudo limpiar el 1º de los grupos. (${e1.message})` },
        500,
      );
    }
    const { error: e2 } = await sb.from('grupos').update({ estado: 'en_curso' }).eq('estado', 'completo');
    if (e2) {
      return json(
        { error: `Partidos borrados, pero no se pudo reabrir los grupos completos. (${e2.message})` },
        500,
      );
    }
  }

  return json({ ok: true, partidos: porFase, apuestas });
};
