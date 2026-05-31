import { NextResponse } from "next/server";
import {
  isLocalMockEnabled,
  isSupabaseClientConfigured,
  isSupabaseServerConfigured,
} from "@/lib/supabase/isConfigured";

export async function GET() {
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const hasSupabaseAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const hasServiceRoleKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return NextResponse.json({
    useLocalMock: isLocalMockEnabled(),
    hasSupabaseUrl,
    hasSupabaseAnonKey,
    hasServiceRoleKey,
    clientReady: isSupabaseClientConfigured(),
    serverReady: isSupabaseServerConfigured(),
  });
}
