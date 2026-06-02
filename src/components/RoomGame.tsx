"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CategoryGrid } from "@/components/CategoryGrid";
import { TimerBar } from "@/components/TimerBar";
import { decideWinner, parseVoteTargetIds, requiredVoteCount, splitPlayersForVoteRows } from "@/lib/gameRules";
import {
  getLocalMockRoomByCode,
  getLocalMockSession,
  isLocalMockRuntime,
  localMockRoomAction,
} from "@/lib/localMockRooms";
import { missingSupabaseMessage } from "@/lib/supabase/isConfigured";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { ChatMessage, ClientSession, GameMode, Player, RoomSnapshot } from "@/types/game";
import { wordPacks } from "@/data/wordPacks";

function statusText(player: Player) {
  if (player.connectionStatus === "left") return "나감";
  if (player.connectionStatus === "disconnected") return "연결 끊김";
  return player.ready ? "준비 완료" : "준비 중";
}

function roleLabel(player?: Player) {
  if (player?.visibleRole === "liar") return "라이어";
  if (player?.visibleRole === "spy") return "스파이";
  return "시민";
}

function getPlayerDisplayWord(player?: Player) {
  if (!player) return "-";
  if (player.visibleRole === "liar") return "라이어";
  return player.word || "-";
}

function getKeywordRevealText(player?: Player) {
  if (player?.visibleRole === "liar") {
    return {
      label: "당신의 역할",
      main: "라이어",
      sub: "시민들이 말하는 내용을 듣고 정답 키워드를 추리하세요.",
    };
  }

  if (player?.visibleRole === "spy") {
    return {
      label: "당신의 키워드",
      main: player.word || "-",
      sub: "당신은 스파이입니다. 라이어가 정답을 맞히도록 도울 수 있습니다.",
    };
  }

  return {
    label: "당신의 키워드",
    main: player?.word || "-",
    sub: "",
  };
}

function getInviteBaseUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  const baseUrl =
    configuredUrl || (typeof window !== "undefined" ? window.location.origin : "http://localhost:3000");
  return baseUrl.replace(/\/$/, "");
}

const phaseRanks = {
  lobby: 0,
  category_vote: 1,
  category_result: 2,
  keyword_reveal: 3,
  speaking: 4,
  discussion: 5,
  result: 6,
};

function isStalePhaseSnapshot(current: RoomSnapshot, next: RoomSnapshot) {
  if (current.room.phase === "lobby" || current.room.phase === "result") return false;
  if (phaseRanks[next.room.phase] >= phaseRanks[current.room.phase]) return false;
  const currentStarted = current.room.phaseStartedAt ? new Date(current.room.phaseStartedAt).getTime() : 0;
  const nextStarted = next.room.phaseStartedAt ? new Date(next.room.phaseStartedAt).getTime() : 0;
  return nextStarted <= currentStarted;
}

function mergeSnapshot(current: RoomSnapshot, next: RoomSnapshot) {
  return isStalePhaseSnapshot(current, next) ? current : next;
}

function joinedByPhaseStart(player?: Player, phaseStartedAt?: string) {
  if (!player) return false;
  if (!phaseStartedAt || !player.joinedAt) return true;
  return new Date(player.joinedAt).getTime() <= new Date(phaseStartedAt).getTime();
}

function isRoundPlayer(player?: Player) {
  return Boolean(player?.role);
}

function SortablePlayer({
  act,
  host,
  player,
}: {
  act?: (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
  host: boolean;
  player: Player;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: player.id });
  return (
    <li
      className="rounded-lg border border-[var(--line)] bg-[#12141b] p-3"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <b className="min-w-0 break-words">{player.nickname}</b>
        <span className="flex flex-wrap items-center justify-end gap-2 text-xs font-bold text-[var(--muted)]">
          {player.isHost ? "방장" : null}
          {statusText(player)}
          {host && !player.isHost ? (
            <button
              className="rounded border border-[var(--line)] px-2 py-1 font-bold text-white"
              onClick={() => act?.("remove_player", { playerId: player.id })}
              type="button"
            >
              제거
            </button>
          ) : null}
          {host ? (
            <button className="cursor-grab rounded border border-[var(--line)] px-2 py-1" type="button" {...attributes} {...listeners}>
              ::
            </button>
          ) : null}
        </span>
      </div>
    </li>
  );
}

export function RoomGame({ initial, code }: { initial: RoomSnapshot; code: string }) {
  const [snapshot, setSnapshot] = useState(initial);
  const [session, setSession] = useState<ClientSession | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const localMock = isLocalMockRuntime();
  const supabaseAvailable = Boolean(getBrowserSupabase());
  const sensors = useSensors(useSensor(PointerSensor));

  const applyOptimisticAction = useCallback((action: string, payload?: Record<string, unknown>) => {
    if (!session) return;
    setSnapshot((currentSnapshot) => {
      if (action === "settings") {
        return {
          ...currentSnapshot,
          room: {
            ...currentSnapshot.room,
            mode: (payload?.mode as GameMode) ?? currentSnapshot.room.mode,
            maxPlayers: typeof payload?.maxPlayers === "number" ? payload.maxPlayers : currentSnapshot.room.maxPlayers,
            liarCount: typeof payload?.liarCount === "number" ? payload.liarCount : currentSnapshot.room.liarCount,
            spyCount: typeof payload?.spyCount === "number" ? payload.spyCount : currentSnapshot.room.spyCount,
            revealSeconds: typeof payload?.revealSeconds === "number" ? payload.revealSeconds : currentSnapshot.room.revealSeconds,
            speakingSeconds: typeof payload?.speakingSeconds === "number" ? payload.speakingSeconds : currentSnapshot.room.speakingSeconds,
            talkSeconds: typeof payload?.talkSeconds === "number" ? payload.talkSeconds : currentSnapshot.room.talkSeconds,
          },
        };
      }

      if (action === "order" && Array.isArray(payload?.order)) {
        const order = payload.order.map(String);
        return {
          ...currentSnapshot,
          players: currentSnapshot.players.map((player) => {
            const sortOrder = order.indexOf(player.id);
            return sortOrder >= 0 ? { ...player, sortOrder } : player;
          }),
        };
      }

      if (action === "start_category_vote") {
        return {
          ...currentSnapshot,
          room: {
            ...currentSnapshot.room,
            phase: "category_vote",
            phaseStartedAt: new Date().toISOString(),
            selectedCategory: undefined,
          },
          players: currentSnapshot.players.map((player) => ({
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
          })),
        };
      }

      if (action === "restart") {
        return {
          ...currentSnapshot,
          room: {
            ...currentSnapshot.room,
            phase: "lobby",
            phaseStartedAt: new Date().toISOString(),
            selectedCategory: undefined,
            citizenWord: undefined,
            liarWord: undefined,
            currentSpeakerPlayerId: undefined,
          },
          players: currentSnapshot.players
            .filter((player) => player.connectionStatus !== "left")
            .map((player) => ({
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
            })),
          messages: [],
        };
      }

      if (action === "time_adjust") {
        const deltaSeconds = typeof payload?.deltaSeconds === "number" ? payload.deltaSeconds : 0;
        return {
          ...currentSnapshot,
          room: {
            ...currentSnapshot.room,
            talkSeconds: Math.max(15, currentSnapshot.room.talkSeconds + deltaSeconds),
          },
          players: currentSnapshot.players.map((player) =>
            player.id === session.playerId ? { ...player, usedTimeAdjust: true } : player,
          ),
        };
      }

      if (action === "message") {
        const body = typeof payload?.body === "string" ? payload.body.trim() : "";
        if (!body) return currentSnapshot;
        return {
          ...currentSnapshot,
          messages: [
            ...currentSnapshot.messages,
            {
              id: `optimistic-${Date.now()}`,
              roomId: currentSnapshot.room.id,
              playerId: session.playerId,
              phase: currentSnapshot.room.phase,
              body,
              createdAt: new Date().toISOString(),
            },
          ],
        };
      }

      const playerPatch =
        action === "ready"
          ? { ready: Boolean(payload?.ready) }
          : action === "category_vote"
            ? { categoryVote: typeof payload?.category === "string" ? payload.category : undefined }
            : action === "vote"
              ? {
                  voteTargetId: Array.isArray(payload?.targetIds) ? payload.targetIds.map(String)[0] : typeof payload?.targetId === "string" ? payload.targetId : undefined,
                  categoryVote: Array.isArray(payload?.targetIds) ? `vote_targets:${JSON.stringify(payload.targetIds.map(String))}` : undefined,
                }
              : action === "confirm_vote"
                ? { voteConfirmed: true, voteConfirmedAt: new Date().toISOString() }
                : null;

      if (!playerPatch) return currentSnapshot;
      return {
        ...currentSnapshot,
        players: currentSnapshot.players.map((player) =>
          player.id === session.playerId ? { ...player, ...playerPatch } : player,
        ),
      };
    });
  }, [session]);

  const refresh = useCallback(async () => {
    if (localMock) {
      const local = getLocalMockRoomByCode(code);
      if (local) setSnapshot((currentSnapshot) => mergeSnapshot(currentSnapshot, local));
      return;
    }
    const response = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
    if (response.ok) {
      const next = (await response.json()) as RoomSnapshot;
      setSnapshot((currentSnapshot) => mergeSnapshot(currentSnapshot, next));
    }
  }, [code, localMock]);

  const act = useCallback(
    async (action: string, payload?: Record<string, unknown>) => {
      if (!session) {
        setStatus("이 기기의 참가 세션이 없습니다. 참가 링크로 다시 입장하세요.");
        return false;
      }

      if (localMock) {
        try {
          const next = localMockRoomAction({ code, session, action, payload });
          if (next) setSnapshot((currentSnapshot) => mergeSnapshot(currentSnapshot, next));
          setStatus("");
          return true;
        } catch (caught) {
          setStatus(caught instanceof Error ? caught.message : "요청에 실패했습니다.");
          return false;
        }
      }

      const previousSnapshot = snapshot;
      applyOptimisticAction(action, payload);
      const response = await fetch(`/api/rooms/${code}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, payload, ...session }),
      });
      const data = await response.json();
      if (!response.ok) {
        setSnapshot(previousSnapshot);
        setStatus(data.error ?? "요청에 실패했습니다.");
        return false;
      }
      setStatus("");
      setSnapshot((currentSnapshot) =>
        mergeSnapshot(currentSnapshot, {
          room: data.room ?? currentSnapshot.room,
          players: data.players ?? currentSnapshot.players,
          messages: data.messages ?? currentSnapshot.messages,
        }),
      );
      return true;
    },
    [applyOptimisticAction, code, localMock, session, snapshot],
  );

  useEffect(() => {
    const stored = localMock ? getLocalMockSession(code) : JSON.parse(window.localStorage.getItem(`liar-session-${code}`) ?? "null");
    if (stored) setSession(stored);
    void refresh();
  }, [code, localMock, refresh]);

  useEffect(() => {
    if (!session) return;
    const heartbeat = async () => {
      if (localMock) {
        localMockRoomAction({ code, session, action: "heartbeat" });
        return;
      }
      await fetch(`/api/rooms/${code}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "heartbeat", ...session }),
      });
    };
    heartbeat();
    const id = window.setInterval(() => {
      void heartbeat();
      void refresh();
    }, 5000);
    return () => {
      window.clearInterval(id);
    };
  }, [code, localMock, refresh, session]);

  useEffect(() => {
    if (localMock) {
      const onStorage = () => void refresh();
      const interval = window.setInterval(refresh, 1000);
      window.addEventListener("storage", onStorage);
      return () => {
        window.clearInterval(interval);
        window.removeEventListener("storage", onStorage);
      };
    }

    const supabase = getBrowserSupabase();
    if (!supabase) return;
    const roomId = initial.room.id;
    const channel = supabase
      .channel(`room-${roomId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "players", filter: `room_id=eq.${roomId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `room_id=eq.${roomId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "time_adjustments", filter: `room_id=eq.${roomId}` }, refresh)
      .subscribe();
    const fallback = window.setInterval(refresh, 3000);
    return () => {
      window.clearInterval(fallback);
      supabase.removeChannel(channel);
    };
  }, [initial.room.id, localMock, refresh]);

  const me = useMemo(
    () => snapshot.players.find((player) => player.id === session?.playerId),
    [session?.playerId, snapshot.players],
  );
  const orderedPlayers = useMemo(
    () => [...snapshot.players].filter((player) => player.connectionStatus !== "left").sort((a, b) => a.sortOrder - b.sortOrder),
    [snapshot.players],
  );
  const isHost = Boolean(me?.isHost);
  const inviteUrl = useMemo(() => `${getInviteBaseUrl()}/rooms/${code}/join`, [code]);
  const roundPlayers = useMemo(
    () => orderedPlayers.filter((player) => isRoundPlayer(player)),
    [orderedPlayers],
  );
  const canCategoryVote = joinedByPhaseStart(me, snapshot.room.phaseStartedAt);
  const canPlayRound = isRoundPlayer(me);
  const currentSpeaker = roundPlayers.find((player) => player.id === snapshot.room.currentSpeakerPlayerId);
  const currentSpeakerIndex = currentSpeaker ? roundPlayers.findIndex((player) => player.id === currentSpeaker.id) : 0;
  const isCurrentSpeaker = Boolean(me && me.id === currentSpeaker?.id);
  const speakingMessages = useMemo(
    () => snapshot.messages.filter((item) => item.phase === "speaking"),
    [snapshot.messages],
  );
  const revealText = getKeywordRevealText(me);
  const winner =
    snapshot.room.phase === "result"
      ? decideWinner({
          players: roundPlayers,
          voteTargetIds: roundPlayers.flatMap((player) => parseVoteTargetIds(player)),
        })
      : null;

  function onDragEnd(event: DragEndEvent) {
    if (!isHost || !event.over || event.active.id === event.over.id) return;
    const oldIndex = orderedPlayers.findIndex((player) => player.id === event.active.id);
    const newIndex = orderedPlayers.findIndex((player) => player.id === event.over?.id);
    const next = arrayMove(orderedPlayers, oldIndex, newIndex);
    void act("order", { order: next.map((player) => player.id) });
  }

  async function submitMessage() {
    if (!message.trim()) return;
    const sent = await act("message", { body: message });
    if (sent) setMessage("");
  }

  function finishCurrentSpeaker() {
    return act("finish_speaker", {
      speakerId: snapshot.room.currentSpeakerPlayerId,
      phaseStartedAt: snapshot.room.phaseStartedAt,
    });
  }

  const discussionMessages = useMemo(
    () => snapshot.messages.filter((item) => item.phase === "speaking" || item.phase === "discussion"),
    [snapshot.messages],
  );

  if (!localMock && (!supabaseAvailable || snapshot.room.id.startsWith("local-")) && !snapshot.players.length) {
    return (
      <main className="screen grid min-h-[100svh] content-center">
        <section className="panel grid gap-4 rounded-lg p-4 sm:p-5">
          <Link className="btn btn-ghost w-fit" href="/">
            처음으로
          </Link>
          <h1 className="text-2xl font-black sm:text-3xl">Supabase 설정이 필요합니다</h1>
          <p className="text-[var(--muted)]">{missingSupabaseMessage()}</p>
        </section>
      </main>
    );
  }

  if (localMock && !snapshot.players.length) {
    return (
      <main className="screen grid min-h-[100svh] content-center">
        <section className="panel grid gap-4 rounded-lg p-4 sm:p-5">
          <Link className="btn btn-ghost w-fit" href="/rooms/join">
            방 찾기
          </Link>
          <h1 className="text-2xl font-black sm:text-3xl">존재하지 않는 방입니다</h1>
          <p className="text-[var(--muted)]">로컬 mock 모드에서는 이 브라우저의 localStorage에 저장된 방만 열 수 있습니다.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="screen grid gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link className="btn btn-ghost" href="/">
          처음으로
        </Link>
        <div className="text-right">
          <p className="text-sm font-black text-[var(--gold)]">{snapshot.room.name}</p>
          <p className="font-mono text-2xl font-black">{snapshot.room.code}</p>
        </div>
      </header>

      {status ? <p className="rounded-lg border border-[var(--red)] p-3 font-bold text-[var(--red)]">{status}</p> : null}

      {snapshot.room.phase === "lobby" ? (
        <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
          <div className="panel rounded-lg p-4">
            <Lobby
              act={act}
              isHost={isHost}
              inviteUrl={inviteUrl}
              room={snapshot.room}
            />
            <div className="mt-4 border-t border-[var(--line)] pt-4">
              <h2 className="mb-3 text-lg font-black">대기실 채팅</h2>
              <Chat
                messages={snapshot.messages.filter((item) => item.phase === "lobby")}
                message={message}
                players={snapshot.players}
                placeholder="대기실 메시지 입력"
                setMessage={setMessage}
                submit={submitMessage}
              />
            </div>
          </div>
          <PlayerList act={act} isHost={isHost} onDragEnd={onDragEnd} players={orderedPlayers} sensors={sensors} sortable />
        </section>
      ) : null}

      {snapshot.room.phase === "category_vote" ? (
        <section className="panel grid gap-4 rounded-lg p-4">
          <h1 className="text-2xl font-black sm:text-3xl">카테고리 투표</h1>
          <TimerBar seconds={10} startedAt={snapshot.room.phaseStartedAt} onDone={() => isHost && act("finish_category_vote")} />
          <CategoryGrid
            disabled={!canCategoryVote}
            packs={wordPacks}
            randomSelected={me?.categoryVote === "__random__"}
            selected={me?.categoryVote}
            votes={Object.fromEntries(
              snapshot.players
                .filter((player) => joinedByPhaseStart(player, snapshot.room.phaseStartedAt))
                .map((player) => player.categoryVote)
                .filter(Boolean)
                .reduce<Map<string, number>>((map, category) => {
                  map.set(category as string, (map.get(category as string) ?? 0) + 1);
                  return map;
                }, new Map()),
            )}
            onSelect={(category) => act("category_vote", { category })}
          />
          {!canCategoryVote ? <p className="text-sm font-bold text-[var(--muted)]">이미 진행 중인 라운드입니다. 다음 라운드부터 참여할 수 있습니다.</p> : null}
        </section>
      ) : null}

      {snapshot.room.phase === "category_result" ? (
        <section className="panel grid min-h-[calc(100svh-120px)] content-center gap-4 rounded-lg p-4 text-center sm:min-h-[50vh] sm:p-5">
          <p className="font-black text-[var(--gold)]">선택된 카테고리</p>
          <h1 className="break-keep text-4xl font-black sm:text-5xl">{snapshot.room.selectedCategory}</h1>
          <TimerBar seconds={3} startedAt={snapshot.room.phaseStartedAt} onDone={() => isHost && act("finish_reveal", { phase: "keyword_reveal" })} />
        </section>
      ) : null}

      {snapshot.room.phase === "keyword_reveal" ? (
        <section className="panel grid min-h-[calc(100svh-120px)] content-center gap-4 rounded-lg p-4 text-center sm:min-h-[55vh] sm:p-5">
          <p className="font-black text-[var(--gold)]">{snapshot.room.selectedCategory}</p>
          <div className="rounded-lg border border-[var(--line)] bg-[#11131a] p-5 sm:p-8">
            {canPlayRound ? (
              <>
                <p className="text-lg font-black text-[var(--muted)]">{roleLabel(me)}</p>
                <p className="mt-2 text-sm font-bold text-[var(--gold)]">{revealText.label}</p>
                <h1 className="mt-3 break-keep text-4xl font-black sm:text-5xl">{revealText.main}</h1>
                {revealText.sub ? <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{revealText.sub}</p> : null}
              </>
            ) : (
              <>
                <p className="text-lg font-black text-[var(--muted)]">대기 중</p>
                <h1 className="mt-3 break-keep text-3xl font-black sm:text-4xl">다음 라운드부터 참여할 수 있습니다</h1>
              </>
            )}
          </div>
          <TimerBar seconds={snapshot.room.revealSeconds} startedAt={snapshot.room.phaseStartedAt} onDone={() => isHost && act("finish_reveal", { phase: "speaking" })} />
        </section>
      ) : null}

      {snapshot.room.phase === "speaking" ? (
        <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="panel grid min-h-[calc(100svh-120px)] grid-rows-[auto_1fr_auto] gap-3 rounded-lg p-3 sm:p-4 lg:min-h-[560px]">
            <SpeakingHeader
              category={snapshot.room.selectedCategory}
              currentSpeaker={currentSpeaker}
              currentSpeakerIndex={currentSpeakerIndex}
              me={me}
              playerCount={roundPlayers.length}
              seconds={snapshot.room.speakingSeconds}
              startedAt={snapshot.room.phaseStartedAt}
            />
            <Chat
              disabled={!isCurrentSpeaker}
              messages={speakingMessages}
              message={message}
              players={snapshot.players}
              placeholder={isCurrentSpeaker ? "설명을 입력하세요" : "현재 설명자만 입력할 수 있습니다"}
              setMessage={setMessage}
              submit={submitMessage}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn btn-primary" disabled={!isCurrentSpeaker} onClick={() => finishCurrentSpeaker()} type="button">
                {isCurrentSpeaker ? "설명 완료" : "현재 설명자만 완료 가능"}
              </button>
              <TimerBar
                seconds={snapshot.room.speakingSeconds}
                startedAt={snapshot.room.phaseStartedAt}
                onDone={isHost ? () => finishCurrentSpeaker() : undefined}
              />
            </div>
          </div>
          <PlayerList compact players={roundPlayers} />
        </section>
      ) : null}

      {snapshot.room.phase === "discussion" ? (
        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="panel grid min-h-[calc(100svh-120px)] grid-rows-[auto_1fr_auto] gap-3 rounded-lg p-3 sm:p-4 lg:min-h-[620px]">
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-2xl font-black sm:text-3xl">토론과 투표</h1>
                <TimerBar seconds={snapshot.room.talkSeconds} startedAt={snapshot.room.phaseStartedAt} onDone={() => isHost && act("finish_discussion")} />
              </div>
              <p className="text-sm text-[var(--muted)]">
                카테고리 {snapshot.room.selectedCategory} / 내 키워드 {getPlayerDisplayWord(me)}
              </p>
            </div>
            <Chat messages={discussionMessages} message={message} players={snapshot.players} setMessage={setMessage} submit={submitMessage} />
            <DiscussionControls act={act} me={me} players={roundPlayers} requiredVotes={requiredVoteCount(snapshot.room.liarCount, roundPlayers.length)} />
          </div>
          <PlayerList compact players={roundPlayers} />
        </section>
      ) : null}

      {snapshot.room.phase === "result" ? (
        <section className="panel grid gap-4 rounded-lg p-4 sm:gap-5 sm:p-5">
          <h1 className="text-3xl font-black sm:text-4xl">{winner?.winner === "citizen" ? "시민 승리" : "라이어 승리"}</h1>
          <div className="grid gap-2 rounded-lg border border-[var(--line)] bg-[#11131a] p-4">
            <p>카테고리: <b>{snapshot.room.selectedCategory}</b></p>
            <p>시민 키워드: <b>{snapshot.room.citizenWord}</b></p>
            <p>라이어: <b>{snapshot.players.filter((player) => player.role === "liar").map((player) => player.nickname).join(", ")}</b></p>
            {snapshot.room.mode === "spy" ? <p>스파이: <b>{snapshot.players.filter((player) => player.role === "spy").map((player) => player.nickname).join(", ")}</b></p> : null}
            {snapshot.room.mode === "fool" ? (
              <>
                <p>바보: <b>{snapshot.players.filter((player) => player.role === "fool").map((player) => player.nickname).join(", ")}</b></p>
                <p>바보 키워드: <b>{snapshot.room.liarWord}</b></p>
              </>
            ) : null}
          </div>
          {isHost ? <button className="btn btn-primary" onClick={() => act("restart")} type="button">다시 시작하기</button> : null}
        </section>
      ) : null}
    </main>
  );
}

function Lobby(props: {
  act: (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
  isHost: boolean;
  inviteUrl: string;
  room: RoomSnapshot["room"];
}) {
  const { act, isHost, inviteUrl, room } = props;
  const [mode, setMode] = useState<GameMode>(room.mode);
  const [liarCount, setLiarCount] = useState(room.liarCount);
  const [spyCount, setSpyCount] = useState(room.spyCount);
  const [maxPlayers, setMaxPlayers] = useState(room.maxPlayers);
  const [revealSeconds, setRevealSeconds] = useState(room.revealSeconds);
  const [speakingSeconds, setSpeakingSeconds] = useState(room.speakingSeconds);
  const [talkSeconds, setTalkSeconds] = useState(room.talkSeconds);

  useEffect(() => {
    if (mode === "spy" && spyCount < 1) setSpyCount(1);
  }, [mode, spyCount]);

  return (
    <section className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[1fr_180px]">
        <div>
          <h1 className="text-2xl font-black sm:text-3xl">대기실</h1>
          <p className="text-[var(--muted)]">링크나 QR로 참가자를 초대하세요.</p>
          <p className="mt-3 break-all rounded-lg border border-[var(--line)] bg-[#11131a] p-3 text-sm font-bold text-[var(--muted)]">{inviteUrl}</p>
          <button className="btn btn-secondary mt-3" onClick={() => navigator.clipboard?.writeText(inviteUrl)} type="button">
            참가 링크 복사
          </button>
          <button
            className="btn btn-ghost mt-2"
            onClick={() =>
              navigator.share
                ? navigator.share({ title: room.name, url: inviteUrl })
                : navigator.clipboard?.writeText(inviteUrl)
            }
            type="button"
          >
            공유
          </button>
        </div>
        <div className="mx-auto grid w-full max-w-[180px] place-items-center rounded-lg bg-white p-3 md:mx-0">
          {inviteUrl ? <QRCodeSVG value={inviteUrl} size={150} /> : null}
        </div>
      </div>

      {isHost ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="label">
            모드
            <select className="input" onChange={(event) => setMode(event.target.value as GameMode)} value={mode}>
              <option value="liar">라이어</option>
              <option value="fool">바보</option>
              <option value="spy">스파이</option>
            </select>
          </label>
          <label className="label">
            최대 인원
            <input className="input" min={3} onChange={(event) => setMaxPlayers(Number(event.target.value))} type="number" value={maxPlayers} />
          </label>
          <label className="label">
            라이어 수
            <input className="input" min={1} onChange={(event) => setLiarCount(Number(event.target.value))} type="number" value={liarCount} />
          </label>
          {mode === "spy" ? (
            <label className="label">
              스파이 수
              <input className="input" min={1} onChange={(event) => setSpyCount(Number(event.target.value))} type="number" value={spyCount} />
            </label>
          ) : null}
          <label className="label">
            카드 확인 초
            <input className="input" max={60} min={5} step={5} onChange={(event) => setRevealSeconds(Number(event.target.value))} type="number" value={revealSeconds} />
          </label>
          <label className="label">
            설명 초
            <input className="input" min={5} step={5} onChange={(event) => setSpeakingSeconds(Number(event.target.value))} type="number" value={speakingSeconds} />
          </label>
          <label className="label">
            토론 초
            <input className="input" min={30} step={15} onChange={(event) => setTalkSeconds(Number(event.target.value))} type="number" value={talkSeconds} />
          </label>
          <button className="btn btn-secondary sm:col-span-3" onClick={() => act("settings", { mode, maxPlayers, liarCount, spyCount: mode === "spy" ? Math.max(1, spyCount) : 0, revealSeconds, speakingSeconds, talkSeconds })} type="button">
            설정 적용
          </button>
        </div>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2">
        <button className="btn btn-secondary" onClick={() => act("ready", { ready: true })} type="button">준비 완료</button>
        {isHost ? <button className="btn btn-primary" onClick={() => act("start_category_vote")} type="button">카테고리 투표 시작</button> : null}
      </div>
    </section>
  );
}

function SpeakingHeader(props: {
  category?: string;
  currentSpeaker?: Player;
  currentSpeakerIndex: number;
  me?: Player;
  playerCount: number;
  seconds: number;
  startedAt?: string;
}) {
  const { category, currentSpeaker, currentSpeakerIndex, me, playerCount, seconds, startedAt } = props;
  return (
    <div className="grid gap-3 rounded-lg border border-[var(--line)] bg-[#11131a] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-[var(--gold)]">카테고리 / 내 키워드 / 남은 시간</p>
          <p className="text-xl font-black">{category} / {getPlayerDisplayWord(me)} / {seconds}초</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-bold text-[var(--muted)]">현재 설명</p>
          <p className="text-2xl font-black">{currentSpeaker?.nickname ?? "-"}</p>
        </div>
      </div>
      <p className="text-sm text-[var(--muted)]">
        순서 {currentSpeakerIndex + 1} / {playerCount} {startedAt ? "" : ""}
      </p>
    </div>
  );
}

function DiscussionControls(props: {
  act: (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
  me?: Player;
  players: Player[];
  requiredVotes: number;
}) {
  const { act, me, players, requiredVotes } = props;
  const selectedTargetIds = me ? parseVoteTargetIds(me) : [];
  const canVote = isRoundPlayer(me);
  const canConfirm = Boolean(canVote && selectedTargetIds.length >= requiredVotes && !me?.voteConfirmed);

  function toggleVoteTarget(targetId: string) {
    if (!canVote || !me || me.voteConfirmed) return;
    const selected = new Set(selectedTargetIds);
    if (selected.has(targetId)) {
      selected.delete(targetId);
    } else if (selected.size < requiredVotes) {
      selected.add(targetId);
    }
    void act("vote", { targetIds: [...selected] });
  }

  return (
    <div className="grid gap-3">
      <p className="text-sm font-bold text-[var(--muted)]">
        {requiredVotes}명까지 투표하세요. 현재 {Math.min(selectedTargetIds.length, requiredVotes)} / {requiredVotes}
      </p>
      <div className="grid gap-2">
        {splitPlayersForVoteRows(players).map((row, index) => (
          <div className="grid gap-2 sm:grid-flow-col sm:auto-cols-fr" key={index}>
            {row.map((player) => (
              <button
                className="btn btn-secondary"
                disabled={!canVote || me?.voteConfirmed}
                key={player.id}
                onClick={() => toggleVoteTarget(player.id)}
                type="button"
              >
                {player.nickname}{selectedTargetIds.includes(player.id) ? " 선택" : ""}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <button className="btn btn-ghost" disabled={!canVote || me?.usedTimeAdjust} onClick={() => act("time_adjust", { deltaSeconds: -15 })} type="button">15초 단축</button>
        <button className="btn btn-ghost" disabled={!canVote || me?.usedTimeAdjust} onClick={() => act("time_adjust", { deltaSeconds: 15 })} type="button">15초 연장</button>
        <button className="btn btn-primary" disabled={!canConfirm} onClick={() => act("confirm_vote")} type="button">
          {me?.voteConfirmed ? "투표 확정 완료" : "투표 확정"}
        </button>
      </div>
      {!canVote ? (
        <p className="text-sm font-bold text-[var(--muted)]">이미 진행 중인 라운드입니다. 다음 라운드부터 투표할 수 있습니다.</p>
      ) : selectedTargetIds.length < requiredVotes ? (
        <p className="text-sm font-bold text-[var(--muted)]">먼저 투표할 플레이어를 선택하세요.</p>
      ) : null}
    </div>
  );
}

function PlayerList({
  act,
  compact,
  isHost,
  onDragEnd,
  players,
  sensors,
  sortable,
}: {
  act?: (action: string, payload?: Record<string, unknown>) => Promise<boolean>;
  compact?: boolean;
  isHost?: boolean;
  onDragEnd?: (event: DragEndEvent) => void;
  players: Player[];
  sensors?: ReturnType<typeof useSensors>;
  sortable?: boolean;
}) {
  const playerItems = players.map((player) => (
    <li className="rounded-lg border border-[var(--line)] bg-[#12141b] p-3" key={player.id}>
      <div className="flex flex-wrap justify-between gap-2">
        <b className="min-w-0 break-words">{player.nickname}</b>
        <span className="flex flex-wrap items-center justify-end gap-2 text-xs text-[var(--muted)]">
          {player.isHost ? "방장" : null}
          {statusText(player)}
          {isHost && !player.isHost ? (
            <button
              className="rounded border border-[var(--line)] px-2 py-1 font-bold text-white"
              onClick={() => act?.("remove_player", { playerId: player.id })}
              type="button"
            >
              제거
            </button>
          ) : null}
        </span>
      </div>
      {!compact ? (
        <p className="mt-1 text-xs text-[var(--muted)]">
          {player.voteConfirmed ? "투표 확정" : player.voteTargetId ? "투표 선택" : ""} {player.speakingDone ? "설명 완료" : ""}
        </p>
      ) : null}
    </li>
  ));

  return (
    <section className="panel rounded-lg p-4">
      <h2 className="mb-3 text-lg font-black">{sortable ? "참가자 대기열" : "참가자"}</h2>
      {sortable && sensors && onDragEnd ? (
        <DndContext collisionDetection={closestCenter} onDragEnd={onDragEnd} sensors={sensors}>
          <SortableContext items={players.map((player) => player.id)} strategy={verticalListSortingStrategy}>
            <ol className="grid gap-2">
              {players.map((player) => (
                <SortablePlayer act={act} host={Boolean(isHost)} key={player.id} player={player} />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <ol className="grid gap-2">{playerItems}</ol>
      )}
    </section>
  );
}

function Chat(props: {
  disabled?: boolean;
  messages: ChatMessage[];
  message: string;
  placeholder?: string;
  players: Player[];
  setMessage: (value: string) => void;
  submit: () => Promise<void>;
}) {
  const { disabled, messages, message, placeholder = "메시지 입력", players, setMessage, submit } = props;
  const [isComposing, setIsComposing] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages.length]);

  return (
    <section className="grid min-h-0 grid-rows-[1fr_auto] gap-3">
      <div className="h-[min(42svh,420px)] min-h-[180px] overflow-y-auto rounded-lg border border-[var(--line)] bg-[#11131a] p-3 sm:min-h-[220px]" ref={scrollRef}>
        {messages.length ? (
          messages.map((item) => (
            <p className="mb-2 text-sm" key={item.id}>
              <b>{players.find((player) => player.id === item.playerId)?.nickname ?? "시스템"}</b>{" "}
              <span className="text-[var(--muted)]">{item.body}</span>
            </p>
          ))
        ) : (
          <p className="text-sm text-[var(--muted)]">아직 메시지가 없습니다.</p>
        )}
      </div>
      <form
        className="grid grid-cols-[minmax(0,1fr)_auto] gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!isComposing) void submit();
        }}
      >
        <input
          className="input"
          disabled={disabled}
          onChange={(event) => setMessage(event.target.value)}
          onCompositionEnd={() => setIsComposing(false)}
          onCompositionStart={() => setIsComposing(true)}
          placeholder={placeholder}
          value={message}
        />
        <button className="btn btn-secondary" disabled={disabled || !message.trim()} type="submit">전송</button>
      </form>
    </section>
  );
}
