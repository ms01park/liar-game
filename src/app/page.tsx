import Link from "next/link";
import { wordPacks } from "@/data/wordPacks";

const actions = [
  {
    href: "/single",
    label: "1기기 모드",
    title: "폰 하나로 바로 시작",
    body: "친구들이 차례로 화면을 넘겨 보며 키워드를 확인합니다.",
    tone: "border-[rgba(239,68,68,0.55)] bg-[rgba(239,68,68,0.12)]",
  },
  {
    href: "/rooms/new",
    label: "방 만들기",
    title: "QR로 초대",
    body: "방 코드, 링크, QR을 만들고 대기실에서 순서를 정합니다.",
    tone: "border-[rgba(245,196,81,0.55)] bg-[rgba(245,196,81,0.10)]",
  },
  {
    href: "/rooms/join",
    label: "방 참가하기",
    title: "코드로 입장",
    body: "방 코드와 비밀번호를 확인한 뒤 대기실에 들어갑니다.",
    tone: "border-[rgba(56,189,248,0.55)] bg-[rgba(56,189,248,0.10)]",
  },
];

export default function Home() {
  const wordCount = wordPacks.reduce((sum, pack) => sum + pack.words.length, 0);

  return (
    <main className="screen grid min-h-[100svh] content-start gap-5 py-4 sm:content-center sm:gap-7">
      <section className="grid gap-4 sm:gap-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-black uppercase tracking-[0.22em] text-[var(--gold)]">
            Liar Game
          </p>
          <span className="rounded-full border border-[var(--line)] px-3 py-1 text-xs font-black text-[var(--muted)]">
            {wordPacks.length} x 100
          </span>
        </div>
        <h1 className="max-w-3xl text-4xl font-black leading-tight sm:text-7xl">
          한 단어를 숨기고, 한 사람을 찾아내세요.
        </h1>
        <p className="max-w-2xl text-base leading-7 text-[var(--muted)] sm:text-lg sm:leading-8">
          엑셀에서 변환한 {wordPacks.length}개 카테고리, {wordCount}개 키워드로 진행하는 모바일 우선 라이어 게임입니다.
        </p>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        {actions.map((action) => (
          <Link
            className={`panel grid min-h-36 content-between rounded-lg border p-4 transition hover:-translate-y-0.5 sm:min-h-44 sm:p-5 ${action.tone}`}
            href={action.href}
            key={action.href}
          >
            <div className="grid gap-2">
              <p className="text-sm font-black text-[var(--gold)]">{action.label}</p>
              <h2 className="text-xl font-black sm:text-2xl">{action.title}</h2>
              <p className="text-sm leading-6 text-[var(--muted)]">{action.body}</p>
            </div>
            <span className="btn btn-secondary mt-4 w-full sm:mt-5">시작</span>
          </Link>
        ))}
      </section>

      <section className="grid grid-cols-3 gap-2 rounded-lg border border-[var(--line)] bg-black/20 p-3 text-center">
        <div>
          <p className="text-xl font-black sm:text-2xl">{wordPacks.length}</p>
          <p className="text-xs font-bold text-[var(--muted)]">카테고리</p>
        </div>
        <div>
          <p className="text-xl font-black sm:text-2xl">{wordCount}</p>
          <p className="text-xs font-bold text-[var(--muted)]">키워드</p>
        </div>
        <div>
          <p className="text-xl font-black sm:text-2xl">2x10</p>
          <p className="text-xs font-bold text-[var(--muted)]">카테고리 배열</p>
        </div>
      </section>
    </main>
  );
}
