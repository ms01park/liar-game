import { NextResponse } from "next/server";
import { assignRoles, decideCategoryVote, decideWinner, getActivePlayers, pickTwoWords } from "@/lib/gameRules";
import { mapPlayer, mapRoom } from "@/lib/format";
import { isSupabaseServerConfigured, missingSupabaseMessage } from "@/lib/supabase/isConfigured";
import { getServerSupabase } from "@/lib/supabaseServer";
import type { GameMode, Player, RoomPhase } from "@/types/game";
import { wordPacks } from "@/data/wordPacks";

type ActionBody = {
  action:
    | "ready"
    | "settings"
    | "order"
    | "start_category_vote"
    | "category_vote"
    | "finish_category_vote"
    | "finish_reveal"
    | "finish_speaker"
    | "finish_speaking"
    | "message"
    | "time_adjust"
    | "vote"
    | "confirm_vote"
    | "heartbeat"
    | "leave"
    | "remove_player"
    | "finish_discussion"
    | "restart";
  playerId: string;
  token: string;
  payload?: Record<string, unknown>;
};

const DISCONNECT_AFTER_MS = 15000;

function now() {
  return new Date().toISOString();
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

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

async function loadRoomBundle(supabase: ReturnType<typeof getServerSupabase>, code: string) {
  const roomResult = await supabase.from("rooms").select("*").eq("code", code.toUpperCase()).single();
  if (roomResult.error) throw new Error("방을 찾을 수 없습니다.");
  const playersResult = await supabase.from("players").select("*").eq("room_id", roomResult.data.id).order("sort_order");
  if (playersResult.error) throw playersResult.error;
  const players = await markStalePlayers(supabase, playersResult.data);
  return { roomRow: roomResult.data, room: mapRoom(roomResult.data), players: players.map(mapPlayer) };
}

function activePlayers(players: Player[]) {
  return getActivePlayers(players);
}

function orderedActivePlayers(players: Player[]) {
  return activePlayers(players).sort((a, b) => a.sortOrder - b.sortOrder);
}

function validateStart(room: Awaited<ReturnType<typeof loadRoomBundle>>["room"], players: Player[]) {
  const active = activePlayers(players);
  if (active.length < 3) throw new Error("최소 3명이 필요합니다.");
  if (active.some((player) => player.connectionStatus === "disconnected")) {
    throw new Error("연결이 끊긴 플레이어가 있어 시작할 수 없습니다.");
  }
  if (active.some((player) => !player.ready)) {
    throw new Error("아직 준비하지 않은 플레이어가 있습니다. 모든 플레이어가 준비 완료해야 시작할 수 있습니다.");
  }
  const specialCount = room.liarCount + (room.mode === "spy" ? room.spyCount : 0);
  if (specialCount >= active.length) throw new Error("라이어와 스파이 수는 현재 참가자 수보다 작아야 합니다.");
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    const { code } = await params;
    const body = (await request.json()) as ActionBody;
    if (!isSupabaseServerConfigured()) {
      return NextResponse.json({ error: missingSupabaseMessage() }, { status: 503 });
    }
    const supabase = getServerSupabase();
    const { roomRow, room, players } = await loadRoomBundle(supabase, code);
    const actorResult = await supabase
      .from("players")
      .select("*")
      .eq("id", body.playerId)
      .eq("room_id", room.id)
      .eq("session_token", body.token)
      .single();

    if (actorResult.error) return NextResponse.json({ error: "세션을 확인할 수 없습니다." }, { status: 401 });
    const actor = mapPlayer(actorResult.data);
    const hostOnly = ["settings", "order", "start_category_vote", "finish_category_vote", "finish_reveal", "finish_discussion", "restart", "remove_player"];
    if (hostOnly.includes(body.action) && !actor.isHost) {
      return NextResponse.json({ error: "방장만 실행할 수 있습니다." }, { status: 403 });
    }

    if (body.action === "ready") {
      await supabase.from("players").update({ ready: Boolean(body.payload?.ready) }).eq("id", actor.id);
    }

    if (body.action === "heartbeat") {
      await supabase.from("players").update({ last_seen_at: now(), connection_status: "connected" }).eq("id", actor.id);
    }

    if (body.action === "leave") {
      await supabase.from("players").update({ ready: false, last_seen_at: now(), connection_status: "left" }).eq("id", actor.id);
    }

    if (body.action === "remove_player") {
      const playerId = stringValue(body.payload?.playerId);
      const target = players.find((player) => player.id === playerId);
      if (!target) return NextResponse.json({ error: "제거할 플레이어를 찾을 수 없습니다." }, { status: 404 });
      if (target.isHost) return NextResponse.json({ error: "방장은 제거할 수 없습니다." }, { status: 400 });
      await supabase.from("players").delete().eq("room_id", room.id).eq("id", playerId);
      const remaining = players.filter((player) => player.id !== playerId).sort((a, b) => a.sortOrder - b.sortOrder);
      await Promise.all(
        remaining.map((player, index) =>
          supabase.from("players").update({ sort_order: index }).eq("room_id", room.id).eq("id", player.id),
        ),
      );
    }

    if (body.action === "settings") {
      await supabase
        .from("rooms")
        .update({
          mode: stringValue(body.payload?.mode, room.mode) as GameMode,
          max_players: numberValue(body.payload?.maxPlayers, room.maxPlayers),
          liar_count: numberValue(body.payload?.liarCount, room.liarCount),
          spy_count: numberValue(body.payload?.spyCount, room.spyCount),
          reveal_seconds: numberValue(body.payload?.revealSeconds, room.revealSeconds),
          talk_seconds: numberValue(body.payload?.talkSeconds, room.talkSeconds),
        })
        .eq("id", room.id);
    }

    if (body.action === "order") {
      const order = Array.isArray(body.payload?.order) ? body.payload.order : [];
      await Promise.all(
        order.map((id, index) =>
          supabase
            .from("players")
            .update({ sort_order: index })
            .eq("room_id", room.id)
            .eq("id", String(id)),
        ),
      );
    }

    if (body.action === "start_category_vote") {
      validateStart(room, players);
      await supabase
        .from("players")
        .update({ category_vote: null, vote_target_id: null, vote_confirmed: false, vote_confirmed_at: null, role: null, visible_role: null, word: null, speaking_done: false, used_time_adjust: false })
        .eq("room_id", room.id);
      await supabase.from("rooms").update({ phase: "category_vote", phase_started_at: now(), selected_category: null }).eq("id", room.id);
    }

    if (body.action === "category_vote") {
      await supabase.from("players").update({ category_vote: stringValue(body.payload?.category) }).eq("id", actor.id);
    }

    if (body.action === "finish_category_vote") {
      const categoryIds = wordPacks.map((pack) => pack.category);
      const voters = activePlayers(players);
      const { selected } = decideCategoryVote({ players: voters, categoryIds, randomId: "__random__" });
      const chosen = selected === "__random__" ? categoryIds[Math.floor(Math.random() * categoryIds.length)] : selected;
      const pack = wordPacks.find((item) => item.category === chosen) ?? wordPacks[0];
      const { citizenWord, liarWord } = pickTwoWords(pack.words);
      const assigned = assignRoles({
        players: voters,
        mode: room.mode,
        liarCount: room.liarCount,
        spyCount: room.mode === "spy" ? room.spyCount : 0,
        citizenWord,
        liarWord,
      });

      await Promise.all(
        assigned.map((player) =>
          supabase
            .from("players")
            .update({ role: player.role, visible_role: player.visibleRole, word: player.word })
            .eq("id", player.id),
        ),
      );
      await supabase
        .from("rooms")
        .update({
          phase: "category_result",
          phase_started_at: now(),
          selected_category: pack.category,
          citizen_word: citizenWord,
          liar_word: liarWord,
          current_speaker_player_id: null,
        })
        .eq("id", room.id);
    }

    if (body.action === "finish_reveal") {
      const phase = stringValue(body.payload?.phase, "keyword_reveal") as RoomPhase;
      const firstSpeakerId = phase === "speaking" ? orderedActivePlayers(players)[0]?.id : null;
      await supabase.from("rooms").update({ phase, phase_started_at: now(), current_speaker_player_id: firstSpeakerId }).eq("id", room.id);
    }

    if (body.action === "finish_speaker" || body.action === "finish_speaking") {
      if (actor.id !== room.currentSpeakerPlayerId && !actor.isHost) {
        return NextResponse.json({ error: "현재 설명자만 완료할 수 있습니다." }, { status: 403 });
      }
      const ordered = orderedActivePlayers(players);
      const currentIndex = ordered.findIndex((player) => player.id === room.currentSpeakerPlayerId);
      const nextSpeaker = ordered[currentIndex + 1];
      await supabase.from("players").update({ speaking_done: true }).eq("id", room.currentSpeakerPlayerId);
      await supabase
        .from("rooms")
        .update({ phase: nextSpeaker ? "speaking" : "discussion", phase_started_at: now(), current_speaker_player_id: nextSpeaker?.id ?? null })
        .eq("id", room.id);
    }

    if (body.action === "message") {
      const bodyText = stringValue(body.payload?.body).trim();
      if (room.phase === "speaking" && actor.id !== room.currentSpeakerPlayerId) {
        return NextResponse.json({ error: "현재 설명자만 입력할 수 있습니다." }, { status: 403 });
      }
      if (bodyText) {
        await supabase.from("messages").insert({ room_id: room.id, player_id: actor.id, phase: room.phase, body: bodyText });
      }
    }

    if (body.action === "time_adjust") {
      const delta = numberValue(body.payload?.deltaSeconds, 0);
      await supabase.from("time_adjustments").insert({ room_id: room.id, player_id: actor.id, delta_seconds: delta });
      await supabase.from("rooms").update({ talk_seconds: Math.max(15, room.talkSeconds + delta) }).eq("id", room.id);
      await supabase.from("players").update({ used_time_adjust: true }).eq("id", actor.id);
    }

    if (body.action === "vote") {
      if (actor.voteConfirmed) return NextResponse.json({ error: "이미 투표를 확정했습니다." }, { status: 400 });
      await supabase.from("players").update({ vote_target_id: stringValue(body.payload?.targetId) }).eq("id", actor.id);
    }

    if (body.action === "confirm_vote") {
      if (!actor.voteTargetId) return NextResponse.json({ error: "먼저 투표할 플레이어를 선택하세요." }, { status: 400 });
      await supabase.from("players").update({ vote_confirmed: true, vote_confirmed_at: now() }).eq("id", actor.id);
      const latestPlayers = (await supabase.from("players").select("*").eq("room_id", room.id)).data?.map(mapPlayer) ?? players;
      if (activePlayers(latestPlayers).every((player) => player.id === actor.id || player.voteConfirmed)) {
        await supabase.from("rooms").update({ phase: "result", phase_started_at: now() }).eq("id", room.id);
      }
    }

    if (body.action === "finish_discussion") {
      const latestPlayers = (await supabase.from("players").select("*").eq("room_id", room.id)).data?.map(mapPlayer) ?? players;
      const voteTargetIds = latestPlayers.map((player: Player) => player.voteTargetId).filter(Boolean) as string[];
      decideWinner({ players: latestPlayers, voteTargetIds });
      await supabase.from("rooms").update({ phase: "result", phase_started_at: now() }).eq("id", room.id);
    }

    if (body.action === "restart") {
      await supabase.from("players").delete().eq("room_id", room.id).eq("connection_status", "left");
      await supabase
        .from("players")
        .update({ ready: false, category_vote: null, vote_target_id: null, vote_confirmed: false, vote_confirmed_at: null, role: null, visible_role: null, word: null, speaking_done: false, used_time_adjust: false })
        .eq("room_id", room.id);
      await supabase.from("players").update({ ready: true }).eq("id", roomRow.host_player_id);
      await supabase
        .from("rooms")
        .update({
          phase: "lobby",
          phase_started_at: now(),
          selected_category: null,
          citizen_word: null,
          liar_word: null,
          current_speaker_player_id: null,
        })
        .eq("id", room.id);
    }

    const snapshot = await loadRoomBundle(supabase, code);
    return NextResponse.json({ room: snapshot.room, players: snapshot.players });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
