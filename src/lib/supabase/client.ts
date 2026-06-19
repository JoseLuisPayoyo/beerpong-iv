import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in the browser (Client Components and Realtime).
 *
 * Uses the publishable key, which is safe to expose to the browser: it only
 * grants the access that Row Level Security policies allow. All privileged
 * writes must go through server route handlers, never this client.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
