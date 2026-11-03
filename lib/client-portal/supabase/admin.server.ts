import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requiredPortalEnvironment } from "./config.server";

/**
 * RLS-bypassing client for controlled provisioning and login-identity mapping only.
 * Never import this module from a Client Component or reuse it for ordinary Portal reads.
 */
export function createPortalSupabaseAdminClient() {
  return createClient(
    requiredPortalEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requiredPortalEnvironment("SUPABASE_SECRET_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
