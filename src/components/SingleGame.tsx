"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CategoryGrid } from "@/components/CategoryGrid";
import { assignRoles, pickTwoWords, shuffle } from "@/lib/gameRules";
import type { GameMode, Player } from "@/types/game";
import { wordPacks } from "@/data/wordPacks";

type Step = "setup" | "handoff" | "card" | "category";

const RANDOM_CATEGORY = "__random__";

function roleLabel(player?: Player) {
  if (player?.visibleRole === "liar") return "라이어";
  if (player?.visibleRole === "spy") return "스파이";
  return "시민";
}

function revealMain(player?: Player) {
  if (player?.visibleRole === "liar") return "라이어";
  return player?.word ?? "-";
}

function revealSub(player?: Player) {
  if (player?.visibleRole === "liar") return "시민들이 말하는 내용을 듣고 정답 키워드를 추리하세요.";
  if (player?.visibleRole === "spy") return "당신은 스파이입니다. 라이어가 정답을 맞히도록 도울 수 있습니다.";
  return "";
}

function resolveCategory(selection: string) {
  if (selection !== RANDOM_CATEGORY) {
    return wordPacks.find((pack) => pack.category === selection) ?? wordPacks[0];
  }
  return wordPacks[Math.floor(Math.random() * wordPacks.length)];
}

export function SingleGame() {
  const [step, setStep] = useState<Step>("setup");
  const [playerCount, setPlayerCount] = useState(5);
  const [mode, setMode] = useState<GameMode>("liar");
  const [liarCount, setLiarCount] = useState(1);
  const [spyCount, setSpyCount] = useState(1);
  const [categorySelection, setCategorySelection] = useState(wordPacks[0]?.category ?? "");
  const [roundCategory, setRoundCategory] = useState(wordPacks[0]?.category ?? "");
  const [players, setPlayers] = useState<Player[]>([]);
  const [current, setCurrent] = useState(0);
  const currentPlayer = players[current];

  const setupError = useMemo(() => {
    const special = liarCount + (mode === "spy" ? spyCount : 0);
    if (playerCount < 3) return "최소 3명이 필요합니다.";
    if (liarCount < 1) return "라이어는 1명 이상이어야 합니다.";
    if (special >= playerCount) return "라이어와 스파이 수는 참가자 수보다 작아야 합니다.";
    return "";
  }, [liarCount, mode, playerCount, spyCount]);

  function startRound(selection = categorySelection) {
    const pack = resolveCategory(selection);
    const { citizenWord, liarWord } = pickTwoWords(pack.words);
    const basePlayers = Array.from({ length: playerCount }, (_, index) => ({
      id: `single-${index + 1}`,
      nickname: `${index + 1}번 참가자`,
      isHost: index === 0,
      ready: true,
      sortOrder: index,
    }));

    setPlayers(
      assignRoles({
        players: shuffle(basePlayers),
        mode,
        liarCount,
        spyCount: mode === "spy" ? spyCount : 0,
        citizenWord,
        liarWord,
      }).sort((a, b) => a.sortOrder - b.sortOrder),
    );
    setRoundCategory(pack.category);
    setCurrent(0);
    setStep("handoff");
  }

  function nextPlayer() {
    if (current + 1 >= players.length) {
      setStep("category");
      return;
    }
    setCurrent((value) => value + 1);
    setStep("handoff");
  }

  return (
    <main className="screen grid gap-5">
      <header className="flex items-center justify-between gap-3">
        <Link className="btn btn-ghost" href="/">
          처음으로
        </Link>
        <p className="text-sm font-black text-[var(--gold)]">1기기 모드</p>
      </header>

      {step === "setup" ? (
        <section className="panel grid gap-5 rounded-lg p-5">
          <h1 className="text-3xl font-black">라운드 설정</h1>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="label">
              참가자 수
              <input
                className="input"
                max={16}
                min={3}
                onChange={(event) => setPlayerCount(Number(event.target.value))}
                type="number"
                value={playerCount}
              />
            </label>
            <label className="label">
              게임 모드
              <select className="input" onChange={(event) => setMode(event.target.value as GameMode)} value={mode}>
                <option value="liar">라이어</option>
                <option value="fool">바보</option>
                <option value="spy">스파이</option>
              </select>
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
          </div>
          <section className="grid gap-3">
            <h2 className="text-xl font-black">카테고리</h2>
            <CategoryGrid
              packs={wordPacks}
              randomSelected={categorySelection === RANDOM_CATEGORY}
              selected={categorySelection}
              onSelect={setCategorySelection}
            />
          </section>
          {setupError ? <p className="font-bold text-[var(--red)]">{setupError}</p> : null}
          <button className="btn btn-primary" disabled={Boolean(setupError)} onClick={() => startRound()} type="button">
            카드 만들기
          </button>
        </section>
      ) : null}

      {step === "handoff" && currentPlayer ? (
        <section className="panel grid min-h-[70vh] content-center gap-5 rounded-lg p-6 text-center">
          <p className="text-sm font-black text-[var(--gold)]">{roundCategory}</p>
          <h1 className="text-4xl font-black">{currentPlayer.nickname} 차례입니다</h1>
          <p className="text-[var(--muted)]">다른 사람이 화면을 보지 않게 한 뒤 확인하세요.</p>
          <button className="btn btn-primary" onClick={() => setStep("card")} type="button">
            내 카드 보기
          </button>
        </section>
      ) : null}

      {step === "card" && currentPlayer ? (
        <section className="panel grid min-h-[70vh] content-center gap-5 rounded-lg p-6 text-center">
          <p className="text-sm font-black text-[var(--muted)]">{currentPlayer.nickname}</p>
          <div className="rounded-lg border border-[var(--line)] bg-[#11131a] p-7">
            <p className="text-lg font-black text-[var(--gold)]">
              {roleLabel(currentPlayer)}
            </p>
            <h1 className="mt-3 text-5xl font-black">{revealMain(currentPlayer)}</h1>
            {revealSub(currentPlayer) ? <p className="mt-4 text-sm leading-6 text-[var(--muted)]">{revealSub(currentPlayer)}</p> : null}
          </div>
          <button className="btn btn-secondary" onClick={nextPlayer} type="button">
            확인 완료
          </button>
        </section>
      ) : null}

      {step === "category" ? (
        <section className="panel grid gap-5 rounded-lg p-5">
          <h1 className="text-3xl font-black">다음 라운드 카테고리</h1>
          <p className="text-[var(--muted)]">결과 공개 없이 바로 다음 라운드 카테고리를 고릅니다.</p>
          <CategoryGrid
            packs={wordPacks}
            randomSelected={categorySelection === RANDOM_CATEGORY}
            selected={categorySelection}
            onSelect={setCategorySelection}
          />
          <button className="btn btn-primary" onClick={() => startRound(categorySelection)} type="button">
            같은 설정으로 다시 시작
          </button>
        </section>
      ) : null}
    </main>
  );
}
