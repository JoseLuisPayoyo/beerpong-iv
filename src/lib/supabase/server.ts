import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Supabase client for use on the server (Server Components and route handlers)
 * acting on behalf of the logged-in user, e.g. the admin session.
 *
 * Uses the publishable key and reads/writes the auth session from the request
 * cookies, so RLS still applies. It does NOT bypass RLS — use the admin client
 * (`./admin`) for privileged writes.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component. This can
            // be ignored if there is middleware refreshing user sessions.
          }
        },
      },
    },
  );
}
