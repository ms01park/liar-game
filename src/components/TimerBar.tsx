"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Props = {
  startedAt?: string;
  seconds: number;
  onDone?: () => void;
};

export function TimerBar({ startedAt, seconds, onDone }: Props) {
  const [now, setNow] = useState(() => Date.now());
  const doneKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const remaining = useMemo(() => {
    const start = startedAt ? new Date(startedAt).getTime() : now;
    return Math.max(0, seconds - Math.floor((now - start) / 1000));
  }, [now, seconds, startedAt]);

  useEffect(() => {
    const doneKey = `${startedAt ?? "local"}:${seconds}`;
    if (remaining > 0 && doneKeyRef.current === doneKey) {
      doneKeyRef.current = null;
    }
    if (remaining === 0 && doneKeyRef.current !== doneKey) {
      doneKeyRef.current = doneKey;
      onDone?.();
    }
  }, [onDone, remaining, seconds, startedAt]);

  const ratio = seconds > 0 ? remaining / seconds : 0;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between text-sm font-bold text-[var(--muted)]">
        <span>남은 시간</span>
        <span>{remaining}초</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-black/30">
        <div className="h-full bg-[var(--gold)] transition-all" style={{ width: `${ratio * 100}%` }} />
      </div>
    </div>
  );
}
