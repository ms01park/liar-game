"use client";

import { assignRoles, decideCategoryVote, getActivePlayers, pickTwoWords } from "@/lib/gameRules";
import type { ChatMessage, ClientSession, GameMode, Player, RoomPhase, RoomSnapshot, RoomState } from "@/types/game";
import { wordPacks } from "@/data/wordPacks";

type StoredRoom = RoomSnapshot & {
  password: string;
};

const ROOMS_KEY = "liar-local-mock-rooms";
const SESSION_PREFIX = "liar-session-";
const RANDOM_ID = "__random__";
const DISCONNECT_AFTER_MS = 15_000;

function now() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

function makeCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function readRooms(): Record<string, StoredRoom> {
  if (typeof window === "undefined") return {};
  const raw = window.localStorage.getItem(ROOMS_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, StoredRoom>;
  } catch {
    return {};
  }
}

function writeRooms(rooms: Record<string, StoredRoom>) {
  window.localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
  window.dispatchEvent(new StorageEvent("storage", { key: ROOMS_KEY }));
}

function normalizeRoom(stored: StoredRoom) {
  const nowMs = Date.now();
  stored.players = stored.players.map((player) => {
    if (player.connectionStatus === "left") return player;
    const lastSeen = player.lastSeenAt ? new Date(player.lastSeenAt).getTime() : 0;
    return {
      ...player,
      connectionStatus: nowMs - lastSeen > DISCONNECT_AFTER_MS ? "disconnected" : "connected",
    };
  });
  return stored;
}

function saveRoom(room: StoredRoom) {
  const rooms = readRooms();
  rooms[room.room.code] = normalizeRoom(room);
  writeRooms(rooms);
}

function activePlayers(players: Player[]) {
  return getActivePlayers(players);
}

function connectedPlayers(players: Player[]) {
  return activePlayers(players).filter((player) => player.connectionStatus !== "disconnected");
}

function orderedActivePlayers(players: Player[]) {
  return activePlayers(players).sort((a, b) => a.sortOrder - b.sortOrder);
}

function publicSnapshot(stored: StoredRoom): RoomSnapshot {
  const normalized = normalizeRoom(stored);
  return {
    room: normalized.room,
    players: normalized.players,
    messages: normalized.messages,
  };
}

export function isLocalMockRuntime() {
  return process.env.NEXT_PUBLIC_USE_LOCAL_MOCK === "true";
}

export function getLocalMockRoomByCode(code: string): RoomSnapshot | null {
  const stored = readRooms()[code.toUpperCase()];
  if (!stored) return null;
  return publicSnapshot(stored);
}

export function validateLocalMockRoomPassword(code: string, password: string) {
  const stored = readRooms()[code.toUpperCase()];
  return Boolean(stored && stored.password === password);
}

export function saveLocalMockSession(code: string, session: ClientSession) {
  window.localStorage.setItem(`${SESSION_PREFIX}${code.toUpperCase()}`, JSON.stringify(session));
}

export function getLocalMockSession(code: string) {
  const raw = window.localStorage.getItem(`${SESSION_PREFIX}${code.toUpperCase()}`);
  return raw ? (JSON.parse(raw) as ClientSession) : null;
}

export function createLocalMockRoom(params: { roomName: string; password: string; nickname: string }) {
  const rooms = readRooms();
  let code = makeCode();
  while (rooms[code]) code = makeCode();

  const playerId = makeId("player");
  const token = makeId("token");
  const timestamp = now();
  const room: RoomState = {
    id: makeId("room"),
    code,
    name: params.roomName.trim() || "로컬 라이어 방",
    hostPlayerId: playerId,
    phase: "lobby",
    mode: "liar",
    maxPlayers: 8,
    liarCount: 1,
    spyCount: 0,
    revealSeconds: 10,
    talkSeconds: 180,
    phaseStartedAt: timestamp,
  };
  const host: Player = {
    id: playerId,
    roomId: room.id,
    nickname: params.nickname.trim() || "방장",
    isHost: true,
    ready: true,
    sortOrder: 0,
    lastSeenAt: timestamp,
    connectionStatus: "connected",
  };
  const stored: StoredRoom = { room, players: [host], messages: [], password: params.password };
  saveRoom(stored);
  const session = { playerId, token };
  saveLocalMockSession(code, session);
  return { room, player: host, session };
}

export function joinLocalMockRoom(params: { code: string; nickname: string; password: string }) {
  const rooms = readRooms();
  const stored = rooms[params.code.toUpperCase()];
  if (!stored) throw new Error("존재하지 않는 방입니다");
  if (stored.password !== params.password) throw new Error("비밀번호가 올바르지 않습니다");
  if (!params.nickname.trim()) throw new Error("닉네임을 입력하세요");
  if (activePlayers(stored.players).length >= stored.room.maxPlayers) throw new Error("방이 가득 찼습니다");

  const player: Player = {
    id: makeId("player"),
    roomId: stored.room.id,
    nickname: params.nickname.trim(),
    isHost: false,
    ready: false,
    sortOrder: activePlayers(stored.players).length,
    lastSeenAt: now(),
    connectionStatus: "connected",
  };
  const session = { playerId: player.id, token: makeId("token") };
  stored.players.push(player);
  saveRoom(stored);
  saveLocalMockSession(stored.room.code, session);
  return { room: stored.room, player, session };
}

function requireStoredRoom(code: string) {
  const stored = readRooms()[code.toUpperCase()];
  if (!stored) throw new Error("존재하지 않는 방입니다");
  return normalizeRoom(stored);
}

function requireActor(stored: StoredRoom, session: ClientSession) {
  const actor = stored.players.find((player) => player.id === session.playerId);
  if (!actor || actor.connectionStatus === "left") throw new Error("이 기기의 참가 세션이 없습니다");
  return actor;
}

function requireHost(actor: Player) {
  if (!actor.isHost) throw new Error("방장만 실행할 수 있습니다");
}

function numberValue(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringValue(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function updatePlayers(stored: StoredRoom, updater: (player: Player) => Player) {
  stored.players = stored.players.map(updater);
}

function validateStart(stored: StoredRoom) {
  const players = activePlayers(stored.players);
  const disconnected = players.filter((player) => player.connectionStatus === "disconnected");
  if (players.length < 3) throw new Error("최소 3명이 필요합니다.");
  if (disconnected.length) throw new Error("연결이 끊긴 플레이어가 있어 시작할 수 없습니다.");
  if (players.some((player) => !player.ready)) {
    throw new Error("아직 준비하지 않은 플레이어가 있습니다. 모든 플레이어가 준비 완료해야 시작할 수 있습니다.");
  }
  const specialCount = stored.room.liarCount + (stored.room.mode === "spy" ? stored.room.spyCount : 0);
  if (specialCount >= players.length) throw new Error("라이어와 스파이 수는 현재 참가자 수보다 작아야 합니다.");
}

function firstSpeaker(stored: StoredRoom) {
  return orderedActivePlayers(stored.players)[0];
}

function advanceSpeaker(stored: StoredRoom) {
  const ordered = orderedActivePlayers(stored.players);
  const currentIndex = ordered.findIndex((player) => player.id === stored.room.currentSpeakerPlayerId);
  const next = ordered[currentIndex + 1];
  if (!next) {
    stored.room = { ...stored.room, phase: "discussion", phaseStartedAt: now(), currentSpeakerPlayerId: undefined };
    return;
  }
  stored.room = { ...stored.room, currentSpeakerPlayerId: next.id, phaseStartedAt: now() };
}

function assignCategoryAndWords(stored: StoredRoom) {
  const categoryIds = wordPacks.map((pack) => pack.category);
  const { selected } = decideCategoryVote({ players: activePlayers(stored.players), categoryIds, randomId: RANDOM_ID });
  const chosen = selected === RANDOM_ID ? categoryIds[Math.floor(Math.random() * categoryIds.length)] : selected;
  const pack = wordPacks.find((item) => item.category === chosen) ?? wordPacks[0];
  const { citizenWord, liarWord } = pickTwoWords(pack.words);
  const assigned = assignRoles({
    players: activePlayers(stored.players),
    mode: stored.room.mode,
    liarCount: stored.room.liarCount,
    spyCount: stored.room.mode === "spy" ? stored.room.spyCount : 0,
    citizenWord,
    liarWord,
  });
  const assignedById = new Map(assigned.map((player) => [player.id, player]));
  stored.players = stored.players.map((player) => assignedById.get(player.id) ?? player).sort((a, b) => a.sortOrder - b.sortOrder);
  stored.room = {
    ...stored.room,
    phase: "category_result",
    phaseStartedAt: now(),
    selectedCategory: pack.category,
    citizenWord,
    liarWord,
    currentSpeakerPlayerId: undefined,
  };
}

function allVotesConfirmed(stored: StoredRoom) {
  return connectedPlayers(stored.players).every((player) => player.voteConfirmed);
}

export function localMockRoomAction(params: {
  code: string;
  session: ClientSession;
  action: string;
  payload?: Record<string, unknown>;
}) {
  const stored = requireStoredRoom(params.code);
  const actor = requireActor(stored, params.session);
  const hostOnly = ["settings", "order", "start_category_vote", "finish_category_vote", "finish_reveal", "finish_discussion", "restart"];
  if (params.action === "remove_player") requireHost(actor);
  if (hostOnly.includes(params.action)) requireHost(actor);

  if (params.action === "heartbeat") {
    updatePlayers(stored, (player) =>
      player.id === actor.id ? { ...player, lastSeenAt: now(), connectionStatus: "connected" } : player,
    );
  }

  if (params.action === "leave") {
    updatePlayers(stored, (player) =>
      player.id === actor.id ? { ...player, connectionStatus: "left", ready: false, lastSeenAt: now() } : player,
    );
  }

  if (params.action === "remove_player") {
    const playerId = stringValue(params.payload?.playerId);
    const target = stored.players.find((player) => player.id === playerId);
    if (!target) throw new Error("제거할 플레이어를 찾을 수 없습니다.");
    if (target.isHost) throw new Error("방장은 제거할 수 없습니다.");
    stored.players = stored.players
      .filter((player) => player.id !== playerId)
      .map((player, index) => ({ ...player, sortOrder: index }));
  }

  if (params.action === "ready") {
    updatePlayers(stored, (player) => (player.id === actor.id ? { ...player, ready: Boolean(params.payload?.ready) } : player));
  }

  if (params.action === "settings") {
    stored.room = {
      ...stored.room,
      mode: stringValue(params.payload?.mode, stored.room.mode) as GameMode,
      maxPlayers: numberValue(params.payload?.maxPlayers, stored.room.maxPlayers),
      liarCount: numberValue(params.payload?.liarCount, stored.room.liarCount),
      spyCount: numberValue(params.payload?.spyCount, stored.room.spyCount),
      revealSeconds: numberValue(params.payload?.revealSeconds, stored.room.revealSeconds),
      talkSeconds: numberValue(params.payload?.talkSeconds, stored.room.talkSeconds),
    };
  }

  if (params.action === "order") {
    const order = Array.isArray(params.payload?.order) ? params.payload.order.map(String) : [];
    const orderMap = new Map(order.map((id, index) => [id, index]));
    updatePlayers(stored, (player) => ({ ...player, sortOrder: orderMap.get(player.id) ?? player.sortOrder }));
    stored.players.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  if (params.action === "start_category_vote") {
    validateStart(stored);
    updatePlayers(stored, (player) => ({
      ...player,
      categoryVote: undefined,
      voteTargetId: undefined,
      voteConfirmed: false,
      voteConfirmedAt: undefined,
      role: undefined,
      visibleRole: undefined,
      word: undefined,
      speakingDone: false,
      usedTimeAdjust: false,
    }));
    stored.messages = [];
    stored.room = { ...stored.room, phase: "category_vote", phaseStartedAt: now(), selectedCategory: undefined };
  }

  if (params.action === "category_vote") {
    const category = stringValue(params.payload?.category);
    updatePlayers(stored, (player) => (player.id === actor.id ? { ...player, categoryVote: category } : player));
  }

  if (params.action === "finish_category_vote") assignCategoryAndWords(stored);

  if (params.action === "finish_reveal") {
    const phase = stringValue(params.payload?.phase, "keyword_reveal") as RoomPhase;
    if (phase === "speaking") {
      stored.room = { ...stored.room, phase, phaseStartedAt: now(), currentSpeakerPlayerId: firstSpeaker(stored)?.id };
    } else {
      stored.room = { ...stored.room, phase, phaseStartedAt: now() };
    }
  }

  if (params.action === "finish_speaker") {
    if (actor.id !== stored.room.currentSpeakerPlayerId && !actor.isHost) {
      throw new Error("현재 설명자만 완료할 수 있습니다.");
    }
    updatePlayers(stored, (player) => (player.id === stored.room.currentSpeakerPlayerId ? { ...player, speakingDone: true } : player));
    advanceSpeaker(stored);
  }

  if (params.action === "message") {
    const body = stringValue(params.payload?.body).trim();
    if (stored.room.phase === "speaking" && actor.id !== stored.room.currentSpeakerPlayerId) {
      throw new Error("현재 설명자만 입력할 수 있습니다.");
    }
    if (body) {
      stored.messages.push({
        id: makeId("message"),
        roomId: stored.room.id,
        playerId: actor.id,
        phase: stored.room.phase,
        body,
        createdAt: now(),
      } satisfies ChatMessage);
    }
  }

  if (params.action === "time_adjust") {
    const delta = numberValue(params.payload?.deltaSeconds, 0);
    stored.room = { ...stored.room, talkSeconds: Math.max(15, stored.room.talkSeconds + delta) };
    updatePlayers(stored, (player) => (player.id === actor.id ? { ...player, usedTimeAdjust: true } : player));
  }

  if (params.action === "vote") {
    if (actor.voteConfirmed) throw new Error("이미 투표를 확정했습니다.");
    const targetId = stringValue(params.payload?.targetId);
    updatePlayers(stored, (player) => (player.id === actor.id ? { ...player, voteTargetId: targetId } : player));
  }

  if (params.action === "confirm_vote") {
    if (!actor.voteTargetId) throw new Error("먼저 투표할 플레이어를 선택하세요.");
    updatePlayers(stored, (player) =>
      player.id === actor.id ? { ...player, voteConfirmed: true, voteConfirmedAt: now() } : player,
    );
    if (allVotesConfirmed(stored)) {
      stored.room = { ...stored.room, phase: "result", phaseStartedAt: now() };
    }
  }

  if (params.action === "finish_discussion") {
    stored.room = { ...stored.room, phase: "result", phaseStartedAt: now() };
  }

  if (params.action === "restart") {
    stored.players = stored.players.filter((player) => player.connectionStatus !== "left");
    updatePlayers(stored, (player) => ({
      ...player,
      ready: player.isHost,
      categoryVote: undefined,
      voteTargetId: undefined,
      voteConfirmed: false,
      voteConfirmedAt: undefined,
      role: undefined,
      visibleRole: undefined,
      word: undefined,
      speakingDone: false,
      usedTimeAdjust: false,
    }));
    stored.room = {
      ...stored.room,
      phase: "lobby",
      phaseStartedAt: now(),
      selectedCategory: undefined,
      citizenWord: undefined,
      liarWord: undefined,
      currentSpeakerPlayerId: undefined,
    };
    stored.messages = [];
  }

  saveRoom(stored);
  return getLocalMockRoomByCode(params.code);
}
