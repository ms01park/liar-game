import { createClient } from "@supabase/supabase-js";
import { isSupabaseClientConfigured } from "@/lib/supabase/isConfigured";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
let browserSupabase: ReturnType<typeof createClient> | null = null;

export function getBrowserSupabase() {
  if (!isSupabaseClientConfigured() || !url || !anonKey) return null;
  browserSupabase ??= createClient(url, anonKey);
  return browserSupabase;
}
