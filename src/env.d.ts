/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_PUBLISHABLE_KEY: string;
  // Solo servidor (sin prefijo PUBLIC_): jamás se inyecta en el bundle de cliente.
  readonly SUPABASE_SECRET_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
