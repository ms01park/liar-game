import { NextResponse } from "next/server";
import { mapMessage, mapPlayer, mapRoom } from "@/lib/format";
import { isSupabaseServerConfigured, missingSupabaseMessage } from "@/lib/supabase/isConfigured";
import { getServerSupabase } from "@/lib/supabaseServer";

const DISCONNECT_AFTER_MS = 15000;

async function markStalePlayers(
  supabase: ReturnType<typeof getServerSupabase>,
  rows: Array<{ id: string; last_seen_at: string | null; connection_status: string | null }>,
) {
  const staleIds = rows
    .filter((player) => {
      if (player.connection_status !== "connected" || !player.last_seen_at) return false;
      return Date.now() - new Date(player.last_seen_at).getTime() > DISCONNECT_AFTER_MS;
    })
    .map((player) => player.id);

  if (!staleIds.length) return rows;

  await supabase.from("players").update({ connection_status: "disconnected" }).in("id", staleIds);
  return rows.map((player) =>
    staleIds.includes(player.id) ? { ...player, connection_status: "disconnected" } : player,
  );
}

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    if (!isSupabaseServerConfigured()) {
      return NextResponse.json({ error: missingSupabaseMessage() }, { status: 503 });
    }

    const { code } = await params;
    const supabase = getServerSupabase();
    const roomResult = await supabase.from("rooms").select("*").eq("code", code.toUpperCase()).single();
    if (roomResult.error) return NextResponse.json({ error: "존재하지 않는 방입니다" }, { status: 404 });

    const [playersResult, messagesResult] = await Promise.all([
      supabase.from("players").select("*").eq("room_id", roomResult.data.id).order("sort_order"),
      supabase.from("messages").select("*").eq("room_id", roomResult.data.id).order("created_at"),
    ]);

    if (playersResult.error) throw playersResult.error;
    if (messagesResult.error) throw messagesResult.error;

    const players = await markStalePlayers(supabase, playersResult.data);

    return NextResponse.json({
      room: mapRoom(roomResult.data),
      players: players.map(mapPlayer),
      messages: messagesResult.data.map(mapMessage),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
