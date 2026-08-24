"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { cn } from "~/fsd/shared/lib/utils";
import type { CardLock } from "../model/transitions";

// 카드 단위 잠금(FEAT-20). 도장·반려가 성공하면 그 카드의 남은 버튼을 다 잠근다.
// 도장 버튼과 반려 패널은 서로 다른 하위 트리라 공용 조상이 없으면 상태를 못 나눈다 —
// 카드마다 하나씩 감싸는 컨텍스트로 공유한다. Provider는 DOM을 만들지 않으므로
// (Context.Provider는 래퍼 엘리먼트가 아니다) 두 소비자의 레이아웃이 그대로 유지된다.
type GateCardLockValue = {
  lock: CardLock | null;
  setLock: (lock: CardLock) => void;
};

const GateCardLockContext = createContext<GateCardLockValue | null>(null);

// Provider 밖에서 불릴 일은 없지만(두 소비자 모두 감싼다) no-op 기본값으로 안전하게.
// 표현식 본문(`() => undefined`)인 이유: 빈 블록 `() => {}`는 이 프로젝트 ESLint의
// @typescript-eslint/no-empty-function에 걸린다(검증 조립에서 실측 — lint exit 1).
export function useGateCardLock(): GateCardLockValue {
  return useContext(GateCardLockContext) ?? { lock: null, setLock: () => undefined };
}

export function GateCardLock({ children }: { children: ReactNode }) {
  const [lock, setLock] = useState<CardLock | null>(null);
  return (
    <GateCardLockContext.Provider value={{ lock, setLock }}>
      {children}
    </GateCardLockContext.Provider>
  );
}

// 잠금 칩: 도장·반려 성공 뒤 버튼 자리를 대신하는 비상호작용 상태 표식.
// 색은 점(비텍스트, 3:1 기준)이 나르고 낱말이 함께 말한다(reject-actions 마커·진행 pill과
// 같은 접근) — --stamp 텍스트의 12px AA 미달을 우회한다. 정적이다(카드에서 도는 것이 없다).
export function LockedChip({ lock }: { lock: CardLock }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden="true"
        className={cn("inline-block size-2 rounded-[1px]", lock.marker)}
      />
      {lock.label}
    </span>
  );
}
