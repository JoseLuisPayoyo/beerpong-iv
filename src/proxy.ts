import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

// Next.js 16 renamed the `middleware` file convention to `proxy`. This runs on
// every matched request to refresh the Supabase auth session before rendering.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Only run the auth-session refresh where a session can exist: the
  // operational app (/torneo, incl. admin) and the write API routes (/api).
  // The public landing ("/") is intentionally excluded so it stays static and
  // cacheable — no per-request getUser() round-trip on the highest-traffic page.
  matcher: ["/torneo/:path*", "/api/:path*"],
};
