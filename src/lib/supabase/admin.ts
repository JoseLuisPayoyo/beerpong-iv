import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Privileged, server-only Supabase client.
 *
 * Uses the SECRET key, which bypasses Row Level Security. It must NEVER reach
 * the browser: the `server-only` import above makes importing this module from
 * client code a build error.
 *
 * Use this exclusively inside API route handlers, after validating the actor
 * (admin session or referee PIN) on the server, to perform privileged writes.
 * Session persistence is disabled because there is no user session here — the
 * client is fully privileged on its own.
 */
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  );
}
