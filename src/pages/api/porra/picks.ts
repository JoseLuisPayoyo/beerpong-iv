import type { APIRoute } from 'astro';
import type { SupabaseClient } from '@supabase/supabase-js';
import { json, leerBody, clienteServidor, verificarParticipante } from './_utils';

// On-demand (SSR): necesita la secret key en el servidor.
export const prerender = false;

// Guardar/cambiar picks de una fase. El cliente miente: aquí se revalida TODO
// (PIN, fase abierta, pertenencia del equipo al grupo/cruce, cruce pendiente).
// Upsert sobre los unique (participante_id, grupo_id) / (participante_id,
// partido_id): se puede cambiar el pick mientras siga abierto.

const FASES_ELIMINATORIA = ['dieciseisavos', 'octavos', 'cuartos', 'semifinal', 'final'];

interface FilaApuesta {
  participante_id: string;
  fase: string;
  grupo_id: number | null;
  partido_id: string | null;
  pick_equipo_id: string;
}

export const POST: APIRoute = async ({ request }) => {
  const body = await leerBody(request);
  if (!body) {
    return json({ error: 'No hemos podido leer los datos. Inténtalo de nuevo.' }, 400);
  }

  const mote = String(body.mote ?? '').trim();
  const pin = String(body.pin ?? '').trim();
  const fase = String(body.fase ?? '');
  const picks = Array.isArray(body.picks) ? (body.picks as Record<string, unknown>[]) : null;
  if (!picks || picks.length === 0) {
    return json({ error: 'No hay ninguna apuesta que guardar.' }, 400);
  }
  if (picks.length > 32) {
    return json({ error: 'Demasiadas apuestas de golpe.' }, 400);
  }
  // Cada elemento debe ser un objeto de verdad: un [null] colaría hasta los
  // bucles y reventaría con TypeError en vez de responder un 400 en JSON.
  if (!picks.every((p) => p !== null && typeof p === 'object' && !Array.isArray(p))) {
    return json({ error: 'Hay una apuesta mal formada.' }, 400);
  }

  const sb = clienteServidor();
  if (!sb) {
    return json({ error: 'No hemos podido guardar la apuesta. Inténtalo más tarde.' }, 500);
  }

  const participante = await verificarParticipante(sb, mote, pin);
  if (!participante) {
    return json({ error: 'Mote o PIN incorrectos.' }, 401);
  }

  // La fase debe existir y tener la porra abierta.
  const { data: faseRow, error: eFase } = await sb
    .from('fases')
    .select('nombre,porra_abierta')
    .eq('nombre', fase)
    .maybeSingle();
  if (eFase) {
    return json({ error: 'No hemos podido comprobar la fase. Inténtalo más tarde.' }, 500);
  }
  if (!faseRow) {
    return json({ error: 'Esa fase no existe.' }, 400);
  }
  if (!faseRow.porra_abierta) {
    return json({ error: 'Esta fase ya está cerrada.' }, 403);
  }

  const filas =
    fase === 'grupos'
      ? await validarPicksGrupos(sb, participante.id, picks)
      : await validarPicksEliminatoria(sb, participante.id, fase, picks);
  if (filas instanceof Response) return filas;

  const onConflict = fase === 'grupos' ? 'participante_id,grupo_id' : 'participante_id,partido_id';
  const { error: eUpsert } = await sb.from('apuestas').upsert(filas, { onConflict });
  if (eUpsert) {
    return json({ error: 'No hemos podido guardar la apuesta. Inténtalo más tarde.' }, 500);
  }

  return json({ ok: true, guardados: filas.length });
};

// Fase 'grupos': cada pick lleva grupo_id y el equipo debe ser de ese grupo.
async function validarPicksGrupos(
  sb: SupabaseClient,
  participanteId: string,
  picks: Record<string, unknown>[],
): Promise<FilaApuesta[] | Response> {
  // Solo id y grupo_id: los teléfonos de `equipos` no salen del servidor.
  const { data: equipos, error } = await sb.from('equipos').select('id,grupo_id');
  if (error || !equipos) {
    return json({ error: 'No hemos podido validar la apuesta. Inténtalo más tarde.' }, 500);
  }
  const grupoDelEquipo = new Map(equipos.map((e) => [String(e.id), e.grupo_id as number | null]));

  // Dedupe por grupo (el último pick del body gana): un upsert con la misma
  // fila dos veces fallaría en Postgres.
  const porGrupo = new Map<number, FilaApuesta>();
  for (const p of picks) {
    const grupoId = Number(p.grupo_id);
    const equipoId = String(p.pick_equipo_id ?? '');
    if (!Number.isInteger(grupoId) || p.partido_id != null || !equipoId) {
      return json({ error: 'Hay una apuesta mal formada.' }, 400);
    }
    if (grupoDelEquipo.get(equipoId) !== grupoId) {
      return json({ error: 'Hay una apuesta por un equipo que no es de ese grupo.' }, 400);
    }
    porGrupo.set(grupoId, {
      participante_id: participanteId,
      fase: 'grupos',
      grupo_id: grupoId,
      partido_id: null,
      pick_equipo_id: equipoId,
    });
  }
  return [...porGrupo.values()];
}

// Fase de eliminatoria: cada pick lleva partido_id; el cruce debe ser de esa
// fase, seguir 'pendiente' (si está en juego o jugado, su porra está cerrada)
// y el equipo elegido debe jugar ese cruce.
async function validarPicksEliminatoria(
  sb: SupabaseClient,
  participanteId: string,
  fase: string,
  picks: Record<string, unknown>[],
): Promise<FilaApuesta[] | Response> {
  if (!FASES_ELIMINATORIA.includes(fase)) {
    return json({ error: 'Esa fase no admite apuestas.' }, 400);
  }
  const { data: partidos, error } = await sb
    .from('partidos')
    .select('id,estado,equipo_a,equipo_b')
    .eq('fase', fase);
  if (error || !partidos) {
    return json({ error: 'No hemos podido validar la apuesta. Inténtalo más tarde.' }, 500);
  }
  const porId = new Map(partidos.map((x) => [String(x.id), x]));

  const porPartido = new Map<string, FilaApuesta>();
  for (const p of picks) {
    const partidoId = String(p.partido_id ?? '');
    const equipoId = String(p.pick_equipo_id ?? '');
    if (!partidoId || p.grupo_id != null || !equipoId) {
      return json({ error: 'Hay una apuesta mal formada.' }, 400);
    }
    const partido = porId.get(partidoId);
    if (!partido) {
      return json({ error: 'Hay una apuesta de un cruce que no es de esta fase.' }, 400);
    }
    if (partido.estado !== 'pendiente') {
      const cruce = await nombresCruce(sb, partido.equipo_a, partido.equipo_b);
      const motivo = partido.estado === 'jugado' ? 'ya se ha jugado' : 'ya está en juego';
      return json({ error: `El cruce ${cruce} ${motivo}: su porra está cerrada.` }, 403);
    }
    if (String(partido.equipo_a) !== equipoId && String(partido.equipo_b) !== equipoId) {
      return json({ error: 'Hay una apuesta por un equipo que no juega ese cruce.' }, 400);
    }
    porPartido.set(partidoId, {
      participante_id: participanteId,
      fase,
      grupo_id: null,
      partido_id: partidoId,
      pick_equipo_id: equipoId,
    });
  }
  return [...porPartido.values()];
}

// "Equipo A vs Equipo B" para el mensaje de cruce cerrado (vista sin teléfonos).
async function nombresCruce(
  sb: SupabaseClient,
  equipoA: unknown,
  equipoB: unknown,
): Promise<string> {
  const ids = [equipoA, equipoB].filter((x) => x != null);
  const { data } = await sb.from('equipos_publicos').select('id,nombre_equipo').in('id', ids);
  const nombre = (id: unknown) =>
    data?.find((e) => String(e.id) === String(id))?.nombre_equipo ?? '¿?';
  return `${nombre(equipoA)} vs ${nombre(equipoB)}`;
}
