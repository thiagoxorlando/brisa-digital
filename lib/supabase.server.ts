/**
 * Server-only Supabase client that reads the user's session from cookies.
 * Only import this in Server Components and Route Handlers — never in client components.
 */
import { createServerClient as createSSRClient } from "@supabase/ssr";

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function createSessionClient() {
  const { cookies } = await import("next/headers");
  const cookieStore  = await cookies();

  return createSSRClient(supabaseUrl, supabaseAnon, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(cookiesToSet) {
        // Route Handlers can write cookies; Server Components cannot.
        // The try/catch handles both: Route Handlers succeed, Server Components
        // throw which we swallow. Without this, an expired access token cannot
        // be refreshed (setAll never fires → getUser() returns null → 401).
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Component context — cookie writes not allowed, ignore.
        }
      },
    },
  });
}
