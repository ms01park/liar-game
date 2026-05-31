"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isLocalMockRuntime, joinLocalMockRoom } from "@/lib/localMockRooms";

export default function JoinRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const normalizedCode = code.toUpperCase();
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const localMock = isLocalMockRuntime();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    if (localMock) {
      try {
        joinLocalMockRoom({ code: normalizedCode, nickname, password });
        router.push(`/rooms/${normalizedCode}`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "입장에 실패했습니다.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const response = await fetch(`/api/rooms/${normalizedCode}/join`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nickname, password }),
    });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) {
      setError(data.error ?? "입장에 실패했습니다.");
      return;
    }
    window.localStorage.setItem(`liar-session-${data.room.code}`, JSON.stringify(data.session));
    router.push(`/rooms/${data.room.code}`);
  }

  return (
    <main className="screen grid min-h-screen content-center">
      <form className="panel grid gap-5 rounded-lg p-5" onSubmit={submit}>
        <Link className="btn btn-ghost w-fit" href="/rooms/join">
          코드 다시 입력
        </Link>
        <p className="font-black text-[var(--gold)]">{normalizedCode}</p>
        <h1 className="text-3xl font-black">방 참가</h1>
        <label className="label">
          닉네임
          <input className="input" onChange={(event) => setNickname(event.target.value)} value={nickname} />
        </label>
        <label className="label">
          비밀번호
          <input className="input" onChange={(event) => setPassword(event.target.value)} type="password" value={password} />
        </label>
        {error ? <p className="font-bold text-[var(--red)]">{error}</p> : null}
        <button className="btn btn-primary" disabled={loading} type="submit">
          {loading ? "입장 중" : "입장"}
        </button>
      </form>
    </main>
  );
}
