"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { decideWinner, splitPlayersForVoteRows } from "@/lib/gameRules";
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

function SortablePlayer({
  act,
  host,
  player,
}: {
  act?: (action: string, payload?: Record<string, unknown>) => Promise<void>;
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
      <div className="flex items-center justify-between gap-2">
        <b>{player.nickname}</b>
        <span className="flex items-center gap-2 text-xs font-bold text-[var(--muted)]">
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
              ? { voteTargetId: typeof payload?.targetId === "string" ? payload.targetId : undefined }
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
      if (local) setSnapshot(local);
      return;
    }
    const response = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
    if (response.ok) setSnapshot(await response.json());
  }, [code, localMock]);

  const act = useCallback(
    async (action: string, payload?: Record<string, unknown>) => {
      if (!session) {
        setStatus("이 기기의 참가 세션이 없습니다. 참가 링크로 다시 입장하세요.");
        return;
      }

      if (localMock) {
        try {
          const next = localMockRoomAction({ code, session, action, payload });
          if (next) setSnapshot(next);
          setStatus("");
        } catch (caught) {
          setStatus(caught instanceof Error ? caught.message : "요청에 실패했습니다.");
        }
        return;
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
        return;
      }
      setStatus("");
      setSnapshot((currentSnapshot) => ({
        room: data.room ?? currentSnapshot.room,
        players: data.players ?? currentSnapshot.players,
        messages: data.messages ?? currentSnapshot.messages,
      }));
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
    const leave = () => {
      const body = JSON.stringify({ action: "leave", ...session });
      if (localMock) {
        localMockRoomAction({ code, session, action: "leave" });
        return;
      }
      navigator.sendBeacon?.(`/api/rooms/${code}/action`, new Blob([body], { type: "application/json" }));
    };
    window.addEventListener("beforeunload", leave);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("beforeunload", leave);
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
  const currentSpeaker = orderedPlayers.find((player) => player.id === snapshot.room.currentSpeakerPlayerId);
  const currentSpeakerIndex = currentSpeaker ? orderedPlayers.findIndex((player) => player.id === currentSpeaker.id) : 0;
  const isCurrentSpeaker = Boolean(me && me.id === currentSpeaker?.id);
  const revealText = getKeywordRevealText(me);
  const winner =
    snapshot.room.phase === "result"
      ? decideWinner({
          players: snapshot.players,
          voteTargetIds: snapshot.players.map((player) => player.voteTargetId).filter(Boolean) as string[],
        })
      : null;

  function onDragEnd(event: DragEndEvent) {
    if (!isHost || !event.over || event.active.id === event.over.id) return;
    const oldIndex = orderedPlayers.findIndex((player) => player.id === event.active.id);
    const newIndex = orderedPlayers.findIndex((player) => player.id === event.over?.id);
    const next = arrayMove(orderedPlayers, oldIndex, newIndex);
    void act("order", { order: next.map((player) => player.id) });
  }

  function submitMessage() {
    if (!message.trim()) return;
    void act("message", { body: message });
    setMessage("");
  }

  if (!localMock && (!supabaseAvailable || snapshot.room.id.startsWith("local-")) && !snapshot.players.length) {
    return (
      <main className="screen grid min-h-screen content-center">
        <section className="panel grid gap-4 rounded-lg p-5">
          <Link className="btn btn-ghost w-fit" href="/">
            처음으로
          </Link>
          <h1 className="text-3xl font-black">Supabase 설정이 필요합니다</h1>
          <p className="text-[var(--muted)]">{missingSupabaseMessage()}</p>
        </section>
      </main>
    );
  }

  if (localMock && !snapshot.players.length) {
    return (
      <main className="screen grid min-h-screen content-center">
        <section className="panel grid gap-4 rounded-lg p-5">
          <Link className="btn btn-ghost w-fit" href="/rooms/join">
            방 찾기
          </Link>
          <h1 className="text-3xl font-black">존재하지 않는 방입니다</h1>
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
          <h1 className="text-3xl font-black">카테고리 투표</h1>
          <TimerBar seconds={10} startedAt={snapshot.room.phaseStartedAt} onDone={() => isHost && act("finish_category_vote")} />
          <CategoryGrid
            packs={wordPacks}
            randomSelected={me?.categoryVote === "__random__"}
            selected={me?.categoryVote}
            votes={Object.fromEntries(
              snapshot.players
                .map((player) => player.categoryVote)
                .filter(Boolean)
                .reduce<Map<string, number>>((map, category) => {
                  map.set(category as string, (map.get(category as string) ?? 0) + 1);
                  return map;
                }, new Map()),
            )}
            onSelect={(category) => act("category_vote", { category })}
          />
        </section>
      ) : null}

      {snapshot.room.phase === "category_result" ? (
        <section className="panel grid min-h-[50vh] content-center gap-4 rounded-lg p-5 text-center">
          <p className="font-black text-[var(--gold)]">선택된 카테고리</p>
          <h1 className="text-5xl font-black">{snapshot.room.selectedCategory}</h1>
          <TimerBar seconds={3} startedAt={snapshot.room.phaseStartedAt} onDone={() => isHost && act("finish_reveal", { phase: "keyword_reveal" })} />
        </section>
      ) : null}

      {snapshot.room.phase === "keyword_reveal" ? (
        <section className="panel grid min-h-[55vh] content-center gap-4 rounded-lg p-5 text-center">
          <p className="font-black text-[var(--gold)]">{snapshot.room.selectedCategory}</p>
          <div className="rounded-lg border border-[var(--line)] bg-[#11131a] p-8">
            <p className="text-lg font-black text-[var(--muted)]">{roleLabel(me)}</p>
            <p className="mt-2 text-sm font-bold text-[var(--gold)]">{revealText.label}</p>
            <h1 className="mt-3 text-5xl font-black">{revealText.main}</h1>
            {revealText.sub ? <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{revealText.sub}</p> : null}
          </div>
          <TimerBar seconds={snapshot.room.revealSeconds} startedAt={snapshot.room.phaseStartedAt} onDone={() => isHost && act("finish_reveal", { phase: "speaking" })} />
        </section>
      ) : null}

      {snapshot.room.phase === "speaking" ? (
        <section className="grid gap-4 lg:grid-cols-[1fr_300px]">
          <div className="panel grid min-h-[560px] grid-rows-[auto_1fr_auto] gap-3 rounded-lg p-4">
            <SpeakingHeader
              category={snapshot.room.selectedCategory}
              currentSpeaker={currentSpeaker}
              currentSpeakerIndex={currentSpeakerIndex}
              me={me}
              playerCount={orderedPlayers.length}
              startedAt={snapshot.room.phaseStartedAt}
            />
            <Chat
              disabled={!isCurrentSpeaker}
              messages={snapshot.messages.filter((item) => item.phase === "speaking")}
              message={message}
              players={snapshot.players}
              placeholder={isCurrentSpeaker ? "설명을 입력하세요" : "현재 설명자만 입력할 수 있습니다"}
              setMessage={setMessage}
              submit={submitMessage}
            />
            <div className="grid gap-2 sm:grid-cols-2">
              <button className="btn btn-primary" disabled={!isCurrentSpeaker} onClick={() => act("finish_speaker")} type="button">
                {isCurrentSpeaker ? "설명 완료" : "현재 설명자만 완료 가능"}
              </button>
              <TimerBar seconds={30} startedAt={snapshot.room.phaseStartedAt} onDone={() => isHost && act("finish_speaker")} />
            </div>
          </div>
          <PlayerList compact players={orderedPlayers} />
        </section>
      ) : null}

      {snapshot.room.phase === "discussion" ? (
        <section className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="panel grid min-h-[620px] grid-rows-[auto_1fr_auto] gap-3 rounded-lg p-4">
            <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="text-3xl font-black">토론과 투표</h1>
                <TimerBar seconds={snapshot.room.talkSeconds} startedAt={snapshot.room.phaseStartedAt} onDone={() => isHost && act("finish_discussion")} />
              </div>
              <p className="text-sm text-[var(--muted)]">
                카테고리 {snapshot.room.selectedCategory} / 내 키워드 {getPlayerDisplayWord(me)}
              </p>
            </div>
            <Chat messages={snapshot.messages.filter((item) => item.phase === "discussion")} message={message} players={snapshot.players} setMessage={setMessage} submit={submitMessage} />
            <DiscussionControls act={act} me={me} players={orderedPlayers} />
          </div>
          <PlayerList compact players={orderedPlayers} />
        </section>
      ) : null}

      {snapshot.room.phase === "result" ? (
        <section className="panel grid gap-5 rounded-lg p-5">
          <h1 className="text-4xl font-black">{winner?.winner === "citizen" ? "시민 승리" : "라이어 승리"}</h1>
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
  act: (action: string, payload?: Record<string, unknown>) => Promise<void>;
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
  const [talkSeconds, setTalkSeconds] = useState(room.talkSeconds);

  return (
    <section className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[1fr_180px]">
        <div>
          <h1 className="text-3xl font-black">대기실</h1>
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
        <div className="grid place-items-center rounded-lg bg-white p-3">
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
            토론 초
            <input className="input" min={30} step={15} onChange={(event) => setTalkSeconds(Number(event.target.value))} type="number" value={talkSeconds} />
          </label>
          <button className="btn btn-secondary sm:col-span-3" onClick={() => act("settings", { mode, maxPlayers, liarCount, spyCount, revealSeconds, talkSeconds })} type="button">
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
  startedAt?: string;
}) {
  const { category, currentSpeaker, currentSpeakerIndex, me, playerCount, startedAt } = props;
  return (
    <div className="grid gap-3 rounded-lg border border-[var(--line)] bg-[#11131a] p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black text-[var(--gold)]">카테고리 / 내 키워드 / 남은 시간</p>
          <p className="text-xl font-black">{category} / {getPlayerDisplayWord(me)} / 30초</p>
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
  act: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  me?: Player;
  players: Player[];
}) {
  const { act, me, players } = props;
  const canConfirm = Boolean(me?.voteTargetId && !me?.voteConfirmed);
  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        {splitPlayersForVoteRows(players).map((row, index) => (
          <div className="grid gap-2 sm:grid-flow-col sm:auto-cols-fr" key={index}>
            {row.map((player) => (
              <button
                className="btn btn-secondary"
                disabled={me?.voteConfirmed}
                key={player.id}
                onClick={() => act("vote", { targetId: player.id })}
                type="button"
              >
                {player.nickname}{me?.voteTargetId === player.id ? " 선택" : ""}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <button className="btn btn-ghost" disabled={me?.usedTimeAdjust} onClick={() => act("time_adjust", { deltaSeconds: -15 })} type="button">15초 단축</button>
        <button className="btn btn-ghost" disabled={me?.usedTimeAdjust} onClick={() => act("time_adjust", { deltaSeconds: 15 })} type="button">15초 연장</button>
        <button className="btn btn-primary" disabled={!canConfirm} onClick={() => act("confirm_vote")} type="button">
          {me?.voteConfirmed ? "투표 확정 완료" : "투표 확정"}
        </button>
      </div>
      {!me?.voteTargetId ? <p className="text-sm font-bold text-[var(--muted)]">먼저 투표할 플레이어를 선택하세요.</p> : null}
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
  act?: (action: string, payload?: Record<string, unknown>) => Promise<void>;
  compact?: boolean;
  isHost?: boolean;
  onDragEnd?: (event: DragEndEvent) => void;
  players: Player[];
  sensors?: ReturnType<typeof useSensors>;
  sortable?: boolean;
}) {
  const playerItems = players.map((player) => (
    <li className="rounded-lg border border-[var(--line)] bg-[#12141b] p-3" key={player.id}>
      <div className="flex justify-between gap-2">
        <b>{player.nickname}</b>
        <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
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
  submit: () => void;
}) {
  const { disabled, messages, message, placeholder = "메시지 입력", players, setMessage, submit } = props;
  return (
    <section className="grid min-h-0 grid-rows-[1fr_auto] gap-3">
      <div className="min-h-[280px] overflow-auto rounded-lg border border-[var(--line)] bg-[#11131a] p-3">
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
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <input className="input" disabled={disabled} onChange={(event) => setMessage(event.target.value)} placeholder={placeholder} value={message} />
        <button className="btn btn-secondary" disabled={disabled} type="submit">전송</button>
      </form>
    </section>
  );
}
