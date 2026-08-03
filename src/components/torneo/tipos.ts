// Tipos compartidos por la vista pública del torneo (/torneo).
import type { Id } from '../../lib/clasificacion';

export type { Id };

export type Fase =
  | 'grupo'
  | 'dieciseisavos'
  | 'octavos'
  | 'cuartos'
  | 'semifinal'
  | 'final';

export interface Grupo {
  id: number; // 1-13 (13 = grupo M, de 3 equipos)
  letra: string; // 'A'-'M'
  turno: number; // 0 = grupo M (18:30), 1 = A-F, 2 = G-L
  estado: 'pendiente' | 'en_curso' | 'completo';
  ganador_id: Id | null;
}

export interface Partido {
  id: Id;
  fase: Fase;
  grupo_id: number | null;
  orden: number;
  equipo_a: Id | null;
  equipo_b: Id | null;
  vasos_a: number | null;
  vasos_b: number | null;
  ganador_id: Id | null;
  estado: 'pendiente' | 'en_juego' | 'jugado';
  publicado: boolean; // aquí siempre true: los borradores se filtran al cargar
  mesa: number | null;
  tanda: number | null;
}

// Vista pública equipos_publicos (sin teléfonos): la privada `equipos` no se lee.
export interface EquipoPub {
  id: Id;
  nombre_equipo: string;
  grupo_id: number | null;
  pos_grupo: number | null;
  participante_1: string | null;
  participante_2: string | null;
}

// Nombres de fase de la porra (fases.nombre). Ojo: la fase de porra 'grupos'
// corresponde a partidos.fase = 'grupo' (singular).
export type FasePorra =
  | 'grupos'
  | 'dieciseisavos'
  | 'octavos'
  | 'cuartos'
  | 'semifinal'
  | 'final';

export interface FaseRow {
  nombre: string;
  orden: number;
  porra_abierta: boolean;
  hora_inicio: string | null; // ISO; objetivo de la cuenta atrás (informativa)
  puntos: number | null;
}

// Apuesta tal como la devuelve /api/porra/mis-picks.
export interface PickGuardado {
  fase: string;
  grupo_id: number | null;
  partido_id: Id | null;
  pick_equipo_id: Id;
}

// Fila de la vista pública `ranking_porra` (solo mote y puntos; nunca picks ni
// hashes). Se lee directa con la publishable key y se ordena en el cliente.
export interface RankingRow {
  id: string;
  mote: string;
  puntos: number;
  aciertos: number;
  creado_en: string; // ISO; desempate por antigüedad (asc)
}
