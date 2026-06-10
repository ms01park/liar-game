import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { hashPassword } from "@/lib/crypto";
import { mapPlayer, mapRoom } from "@/lib/format";
import { isSupabaseServerConfigured, missingSupabaseMessage } from "@/lib/supabase/isConfigured";
import { getServerSupabase } from "@/lib/supabaseServer";

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    if (!isSupabaseServerConfigured()) {
      return NextResponse.json({ error: missingSupabaseMessage() }, { status: 503 });
    }

    const { code } = await params;
    const body = (await request.json()) as { password?: string; nickname?: string };
    const password = body.password?.trim();
    const nickname = body.nickname?.trim();
    if (!password || !nickname) {
      return NextResponse.json({ error: "닉네임과 비밀번호가 필요합니다." }, { status: 400 });
    }

    const supabase = getServerSupabase();
    const roomResult = await supabase.from("rooms").select("*").eq("code", code.toUpperCase()).single();
    if (roomResult.error) return NextResponse.json({ error: "존재하지 않는 방입니다" }, { status: 404 });
    if (roomResult.data.password_hash !== hashPassword(password)) {
      return NextResponse.json({ error: "비밀번호가 올바르지 않습니다" }, { status: 403 });
    }

    const countResult = await supabase
      .from("players")
      .select("id", { count: "exact", head: true })
      .eq("room_id", roomResult.data.id)
      .neq("connection_status", "left");
    if ((countResult.count ?? 0) >= roomResult.data.max_players) {
      return NextResponse.json({ error: "방이 가득 찼습니다." }, { status: 409 });
    }

    const token = nanoid(32);
    const playerResult = await supabase
      .from("players")
      .insert({
        room_id: roomResult.data.id,
        nickname,
        session_token: token,
        sort_order: countResult.count ?? 0,
        last_seen_at: new Date().toISOString(),
        connection_status: "connected",
      })
      .select("*")
      .single();
    if (playerResult.error) throw playerResult.error;

    if (roomResult.data.phase === "lobby") {
      await supabase.from("messages").insert({
        room_id: roomResult.data.id,
        player_id: null,
        phase: "lobby",
        body: `${nickname}님이 들어왔습니다.`,
      });
    }

    return NextResponse.json({
      room: mapRoom(roomResult.data),
      player: mapPlayer(playerResult.data),
      session: { playerId: playerResult.data.id, token },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
