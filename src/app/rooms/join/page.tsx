"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getLocalMockRoomByCode, isLocalMockRuntime } from "@/lib/localMockRooms";
import { missingSupabaseMessage } from "@/lib/supabase/isConfigured";

export default function JoinLookupPage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const localMock = isLocalMockRuntime();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const normalized = code.trim().toUpperCase();
    setError("");
    if (!normalized) return;

    if (localMock) {
      if (!getLocalMockRoomByCode(normalized)) {
        setError("존재하지 않는 방입니다");
        return;
      }
      router.push(`/rooms/${normalized}/join`);
      return;
    }

    setLoading(true);
    const response = await fetch(`/api/rooms/${normalized}`, { cache: "no-store" });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? missingSupabaseMessage());
      return;
    }
    router.push(`/rooms/${normalized}/join`);
  }

  return (
    <main className="screen grid min-h-[100svh] content-center">
      <form className="panel grid w-full gap-4 rounded-lg p-4 sm:gap-5 sm:p-5" onSubmit={submit}>
        <Link className="btn btn-ghost w-fit" href="/">
          처음으로
        </Link>
        <div>
          <p className="text-sm font-black text-[var(--gold)]">{localMock ? "LOCAL MOCK" : "SUPABASE"}</p>
          <h1 className="text-2xl font-black sm:text-3xl">방 참가하기</h1>
        </div>
        <label className="label">
          방 코드
          <input className="input uppercase" maxLength={6} onChange={(event) => setCode(event.target.value)} value={code} />
        </label>
        {error ? <p className="font-bold text-[var(--red)]">{error}</p> : null}
        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? "확인 중" : "코드 확인"}
        </button>
      </form>
    </main>
  );
}
