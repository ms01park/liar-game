import { createClient } from "@supabase/supabase-js";
import { isSupabaseServerConfigured, missingSupabaseMessage } from "@/lib/supabase/isConfigured";

export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!isSupabaseServerConfigured() || !url || !serviceRoleKey) {
    throw new Error(missingSupabaseMessage());
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
