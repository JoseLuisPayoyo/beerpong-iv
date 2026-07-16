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
  id: number; // 1-12
  letra: string; // 'A'-'L'
  turno: number;
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
  mesa: number | null;
  tanda: number | null;
}

// Vista pública equipos_publicos (sin teléfonos): la privada `equipos` no se lee.
export interface EquipoPub {
  id: Id;
  nombre_equipo: string;
  grupo_id: number | null;
  pos_grupo: number | null;
}
