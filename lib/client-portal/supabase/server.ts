import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { requiredPortalEnvironment } from "./config.server";

/** Authenticated SSR client. Cookie writes work in Server Actions and Route Handlers. */
export async function createPortalSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    requiredPortalEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredPortalEnvironment("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Server Components cannot write cookies. Next.js 16 proxy.ts will own refresh writes in the login phase.
          }
        },
      },
    },
  );
}
