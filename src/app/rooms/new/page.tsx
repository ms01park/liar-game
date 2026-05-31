"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createLocalMockRoom, isLocalMockRuntime } from "@/lib/localMockRooms";
import { missingSupabaseMessage } from "@/lib/supabase/isConfigured";

export default function NewRoomPage() {
  const router = useRouter();
  const [roomName, setRoomName] = useState("오늘의 라이어");
  const [nickname, setNickname] = useState("방장");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const localMock = isLocalMockRuntime();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    if (!password.trim()) {
      setLoading(false);
      setError("비밀번호를 입력하세요.");
      return;
    }

    if (localMock) {
      const data = createLocalMockRoom({ roomName, nickname, password });
      setLoading(false);
      router.push(`/rooms/${data.room.code}`);
      return;
    }

    const response = await fetch("/api/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomName, nickname, password }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.error ?? missingSupabaseMessage());
      return;
    }
    window.localStorage.setItem(`liar-session-${data.room.code}`, JSON.stringify(data.session));
    router.push(`/rooms/${data.room.code}`);
  }

  return (
    <main className="screen grid min-h-screen content-center">
      <form className="panel grid gap-5 rounded-lg p-5" onSubmit={submit}>
        <Link className="btn btn-ghost w-fit" href="/">
          처음으로
        </Link>
        <div>
          <p className="text-sm font-black text-[var(--gold)]">{localMock ? "LOCAL MOCK" : "SUPABASE"}</p>
          <h1 className="text-3xl font-black">방 만들기</h1>
        </div>
        <label className="label">
          방 이름
          <input className="input" onChange={(event) => setRoomName(event.target.value)} value={roomName} />
        </label>
        <label className="label">
          방장 닉네임
          <input className="input" onChange={(event) => setNickname(event.target.value)} value={nickname} />
        </label>
        <label className="label">
          비밀번호
          <input className="input" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        </label>
        {error ? <p className="font-bold text-[var(--red)]">{error}</p> : null}
        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? "생성 중" : "방 생성"}
        </button>
      </form>
    </main>
  );
}
