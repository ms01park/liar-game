import { notFound } from "next/navigation";
import { RoomGame } from "@/components/RoomGame";
import { mapMessage, mapPlayer, mapRoom } from "@/lib/format";
import { isLocalMockEnabled, isSupabaseServerConfigured } from "@/lib/supabase/isConfigured";
import { getServerSupabase } from "@/lib/supabaseServer";
import type { RoomSnapshot } from "@/types/game";

function placeholderSnapshot(code: string): RoomSnapshot {
  return {
    room: {
      id: `local-${code}`,
      code,
      name: "로컬 mock 방",
      phase: "lobby",
      mode: "liar",
      maxPlayers: 8,
      liarCount: 1,
      spyCount: 0,
      revealSeconds: 10,
      speakingSeconds: 30,
      talkSeconds: 180,
      phaseStartedAt: new Date().toISOString(),
    },
    players: [],
    messages: [],
  };
}

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalizedCode = code.toUpperCase();

  if (isLocalMockEnabled() || !isSupabaseServerConfigured()) {
    return <RoomGame code={normalizedCode} initial={placeholderSnapshot(normalizedCode)} />;
  }

  let snapshot: RoomSnapshot;

  try {
    const supabase = getServerSupabase();
    const roomResult = await supabase.from("rooms").select("*").eq("code", normalizedCode).single();
    if (roomResult.error) notFound();
    const [playersResult, messagesResult] = await Promise.all([
      supabase.from("players").select("*").eq("room_id", roomResult.data.id).order("sort_order"),
      supabase.from("messages").select("*").eq("room_id", roomResult.data.id).order("created_at"),
    ]);
    if (playersResult.error || messagesResult.error) notFound();
    snapshot = {
      room: mapRoom(roomResult.data),
      players: playersResult.data.map(mapPlayer),
      messages: messagesResult.data.map(mapMessage),
    };
  } catch {
    notFound();
  }

  return <RoomGame code={normalizedCode} initial={snapshot} />;
}
