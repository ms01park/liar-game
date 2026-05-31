"use client";

import clsx from "clsx";
import type { WordPack } from "@/types/game";

type Props = {
  packs: WordPack[];
  selected?: string;
  randomSelected?: boolean;
  votes?: Record<string, number>;
  disabled?: boolean;
  showRandom?: boolean;
  onSelect?: (category: string) => void;
};

export function CategoryGrid({
  packs,
  selected,
  randomSelected,
  votes,
  disabled,
  showRandom = true,
  onSelect,
}: Props) {
  return (
    <div className="grid gap-3">
      <div className="category-grid">
        {packs.slice(0, 20).map((pack, index) => {
          const active = selected === pack.category;
          return (
            <button
              className={clsx(
                "min-h-[54px] rounded-lg border px-2 py-2 text-center text-sm font-black leading-tight",
                active
                  ? "border-[var(--gold)] bg-[rgba(245,196,81,0.18)] text-white"
                  : "border-[var(--line)] bg-[#171a22] text-[var(--text)]",
                disabled && "opacity-60",
              )}
              disabled={disabled}
              key={pack.category}
              onClick={() => onSelect?.(pack.category)}
              type="button"
            >
              <span className="block text-[10px] text-[var(--muted)]">{String(index + 1).padStart(2, "0")}</span>
              <span className="block break-keep">{pack.category}</span>
              {votes?.[pack.category] ? (
                <span className="mt-1 block text-xs text-[var(--gold)]">{votes[pack.category]}표</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {showRandom ? (
        <button
          className={clsx(
            "min-h-[48px] rounded-lg border px-3 py-2 text-center text-sm font-black",
            randomSelected
              ? "border-[var(--cyan)] bg-[rgba(56,189,248,0.16)] text-white"
              : "border-[var(--line)] bg-[#171a22] text-[var(--text)]",
          )}
          disabled={disabled}
          onClick={() => onSelect?.("__random__")}
          type="button"
        >
          랜덤
        </button>
      ) : null}
    </div>
  );
}
