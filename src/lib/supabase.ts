import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Cliente de CLIENTE (navegador): solo lectura del contador + Realtime.
// Usa la publishable key (nunca la secret). Si faltan las env, exporta null
// para que la página siga funcionando con los valores por defecto del marcador.
const url = import.meta.env.PUBLIC_SUPABASE_URL;
const publishableKey = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  url && publishableKey ? createClient(url, publishableKey) : null;
