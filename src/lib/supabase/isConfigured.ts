export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isSupabaseClientConfigured() {
  return isSupabaseConfigured();
}

export function isSupabaseServerConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function isLocalMockEnabled() {
  return process.env.NEXT_PUBLIC_USE_LOCAL_MOCK === "true";
}

export function shouldUseLocalMock() {
  return isLocalMockEnabled();
}

export function missingSupabaseMessage() {
  return "Supabase 설정이 필요합니다. .env.local에 NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY를 설정한 뒤 dev 서버를 재시작하거나 NEXT_PUBLIC_USE_LOCAL_MOCK=true로 로컬 mock 모드를 사용하세요.";
}
