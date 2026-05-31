import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { createRoomCode, hashPassword } from "@/lib/crypto";
import { mapPlayer, mapRoom } from "@/lib/format";
import { isSupabaseServerConfigured, missingSupabaseMessage } from "@/lib/supabase/isConfigured";
import { getServerSupabase } from "@/lib/supabaseServer";

export async function POST(request: Request) {
  try {
    if (!isSupabaseServerConfigured()) {
      return NextResponse.json({ error: missingSupabaseMessage() }, { status: 503 });
    }

    const body = (await request.json()) as { roomName?: string; password?: string; nickname?: string };
    const roomName = body.roomName?.trim() || "비밀 라운드";
    const password = body.password?.trim();
    const nickname = body.nickname?.trim() || "방장";
    if (!password) return NextResponse.json({ error: "비밀번호가 필요합니다." }, { status: 400 });

    const supabase = getServerSupabase();
    let code = createRoomCode();
    let roomResult = null;

    for (let tries = 0; tries < 5; tries += 1) {
      const result = await supabase
        .from("rooms")
        .insert({
          code,
          name: roomName,
          password_hash: hashPassword(password),
          phase_started_at: new Date().toISOString(),
        })
        .select("*")
        .single();

      if (!result.error) {
        roomResult = result.data;
        break;
      }
      if (result.error.code !== "23505") {
        throw new Error(`Supabase 방 생성 실패: ${result.error.message}`);
      }
      code = createRoomCode();
    }

    if (!roomResult) return NextResponse.json({ error: "방을 만들 수 없습니다." }, { status: 500 });

    const token = nanoid(32);
    const playerResult = await supabase
      .from("players")
      .insert({
        room_id: roomResult.id,
        nickname,
        session_token: token,
        is_host: true,
        ready: true,
        sort_order: 0,
        last_seen_at: new Date().toISOString(),
        connection_status: "connected",
      })
      .select("*")
      .single();

    if (playerResult.error) throw playerResult.error;

    await supabase.from("rooms").update({ host_player_id: playerResult.data.id }).eq("id", roomResult.id);

    return NextResponse.json({
      room: mapRoom({ ...roomResult, host_player_id: playerResult.data.id }),
      player: mapPlayer(playerResult.data),
      session: { playerId: playerResult.data.id, token },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
