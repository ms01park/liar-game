import type { ChatMessage, Player, RoomState } from "@/types/game";

type RoomRow = Record<string, unknown>;
type PlayerRow = Record<string, unknown>;
type MessageRow = Record<string, unknown>;

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" ? value : fallback;
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function speakingSecondsFromStatus(value: unknown) {
  const status = asString(value);
  const match = status.match(/(?:^|;)speaking_seconds=(\d+)(?:;|$)/);
  return match ? Math.max(5, Number(match[1])) : 30;
}

export function mapRoom(row: RoomRow): RoomState {
  return {
    id: asString(row.id),
    code: asString(row.code),
    name: asString(row.name),
    hostPlayerId: asString(row.host_player_id) || undefined,
    phase: asString(row.phase, "lobby") as RoomState["phase"],
    mode: asString(row.mode, "liar") as RoomState["mode"],
    maxPlayers: asNumber(row.max_players, 8),
    liarCount: asNumber(row.liar_count, 1),
    spyCount: asNumber(row.spy_count, 0),
    revealSeconds: asNumber(row.reveal_seconds, 10),
    speakingSeconds: speakingSecondsFromStatus(row.status),
    talkSeconds: asNumber(row.talk_seconds, 180),
    currentTalkSeconds: typeof row.current_talk_seconds === "number" ? asNumber(row.current_talk_seconds) : undefined,
    selectedCategory: asString(row.selected_category) || undefined,
    citizenWord: asString(row.citizen_word) || undefined,
    liarWord: asString(row.liar_word) || undefined,
    phaseStartedAt: asString(row.phase_started_at) || undefined,
    currentSpeakerPlayerId: asString(row.current_speaker_player_id) || undefined,
  };
}

export function mapPlayer(row: PlayerRow): Player {
  return {
    id: asString(row.id),
    roomId: asString(row.room_id) || undefined,
    nickname: asString(row.nickname),
    isHost: asBoolean(row.is_host),
    ready: asBoolean(row.ready),
    sortOrder: asNumber(row.sort_order),
    role: (asString(row.role) || undefined) as Player["role"],
    visibleRole: (asString(row.visible_role) || undefined) as Player["visibleRole"],
    word: asString(row.word) || undefined,
    categoryVote: asString(row.category_vote) || undefined,
    voteTargetId: asString(row.vote_target_id) || undefined,
    voteConfirmed: asBoolean(row.vote_confirmed),
    voteConfirmedAt: asString(row.vote_confirmed_at) || undefined,
    usedTimeAdjust: asBoolean(row.used_time_adjust),
    speakingDone: asBoolean(row.speaking_done),
    lastSeenAt: asString(row.last_seen_at) || undefined,
    connectionStatus: (asString(row.connection_status) || undefined) as Player["connectionStatus"],
  };
}

export function mapMessage(row: MessageRow): ChatMessage {
  return {
    id: asString(row.id),
    roomId: asString(row.room_id),
    playerId: asString(row.player_id) || undefined,
    phase: asString(row.phase, "lobby") as ChatMessage["phase"],
    body: asString(row.body),
    createdAt: asString(row.created_at),
  };
}

export function toPlayerPatch(player: Partial<Player>) {
  return {
    nickname: player.nickname,
    ready: player.ready,
    sort_order: player.sortOrder,
    role: player.role,
    visible_role: player.visibleRole,
    word: player.word,
    category_vote: player.categoryVote,
    vote_target_id: player.voteTargetId,
    vote_confirmed: player.voteConfirmed,
    vote_confirmed_at: player.voteConfirmedAt,
    used_time_adjust: player.usedTimeAdjust,
    speaking_done: player.speakingDone,
    last_seen_at: player.lastSeenAt,
    connection_status: player.connectionStatus,
  };
}
