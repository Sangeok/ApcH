# FEAT-20: 게이트 도장·반려 성공 후 카드 버튼을 「반영 대기」로 잠그기 — CDN 잔상 5분 동안의 재클릭 유도 제거

agent: admin-dev

> template.md의 절 구조를 따르되, **admin-dev 역할 규칙(UI 작업이면 「디자인 방향」을 절로 남긴다)**에 따라
> 「현재 동작」과 「문제」 사이에 `## 디자인 방향` 절 하나를 추가했다(FEAT-06/07/08/09/10 계획과 동일 구조).
> 이 항목은 새 화면이 아니라 기존 결재함·서류철 카드에 **처리 완료 후의 잠금(반영 대기) 상태** 하나를
> 더하는 UI 변경이므로, 방향의 임무는 그 잠금 표식(칩)과 잠금 어포던스의 명세다.

## 현재 동작

`/pipeline` 결재함과 `/pipeline/docs/[...slug]` 서류철은 같은 게이트 feature의 두 클라이언트 버튼(`GateTransitionButton`·`RejectActions`)으로 전이를 커밋한다. **두 버튼 모두 커밋 성공 뒤에도 활성 상태로 되돌아온다** — 화면이 읽는 보드 투영이 raw CDN이라 최대 5분 낡아 있는 동안, 같은 카드가 같은 status로 다시 렌더되고 버튼이 다시 눌린다.

- `features/transition-pipeline-gate/ui/gate-transition-button.tsx`의 `GateTransitionButton({id,status,label})`(`:20-28`, `"use client"` `:1`)은 `handleClick`에서 `commitGateTransition(id, status)`(`:34`)를 부른다. 실패면 `toast.error(result.error)`(`:36`) 후 반환, 성공이면 `toast.success(\`${label}로 넘겼습니다. ${gateNextActionHint(label)}\`)`(`:39`) + `router.refresh()`(`:40`). 버튼은 `disabled={isPending}` 하나만(`:47`)이고 라벨은 pending이 풀리면 `label`로 돌아온다(`:51`). **성공 후 `isPending`이 false가 되어 버튼은 같은 라벨로 다시 활성화된다.**
- `features/transition-pipeline-gate/ui/reject-actions.tsx`의 `RejectActions({id,status,actions})`(`:21-29`)은 `run(action)`에서 `commitRejectTransition(action,id,status)`(`:39`)를 부른다. 실패면 `toast.error`(`:40-42`) 후 반환, 성공이면 `toast.success(...)`(`:44-48`) + `router.refresh()`(`:49`). 액션 버튼은 `disabled={isPending}`만(`:82,90,102-108`)이고 폐기는 인라인 확인 흐름(`confirmingDiscard` `:70-99`)이다. **성공 후 패널은 그대로 활성 버튼과 함께 남는다.** 액션별 마커 색은 `ACTION_META`(`:12-19`): bounce=`bg-active`·hold=`bg-hold`·discard=`bg-destructive`, 토스트는 bounce `"계획지시로 되돌렸습니다"`·hold `"보류했습니다"`(`:16-17`)·discard `` `${id}를 폐기했습니다. …` ``(`:45-47`).
- 결재함 소비자 `pages/pipeline/ui/index.tsx`의 `InboxCard`(`:164-218`, **서버 컴포넌트** — 파일에 `"use client"` 없음, 클라 leaf만 조립)는 `gateTo = item.status===null ? null : resolveGateTransition(item.status)`(`:166-167`)와 `rejectActions = … rejectActionsFor(item.status)`(`:168-169`)를 구해, meta flex 행 우측 슬롯에 `GateTransitionButton`(`:190-196`)을, 그 아래에 `RejectActions`(`:198-204`)를 렌더한다. 결재함 항목은 `briefing.ts:267`의 `isGateTransitionSource` 필터 때문에 **승인대기·검토대기뿐**이라 `gateTo`는 항상 non-null이다.
- 서류철 소비자 `pages/doc-viewer/ui/index.tsx`의 `DocViewer`(`:13`)는 `runGate = view.gateLabel!==null && view.itemId!==null`(`:14`)·`runReject = view.rejectActions.length>0 && …`(`:15`)로, 제목 flex-wrap 행 끝(`:54-60`)에 `GateTransitionButton`을, 그 아래(`:63-69`)에 `RejectActions`를 렌더한다. `build-doc-view.ts`는 `canRunGateTwo = itemId!==null && status==="검토대기"`(`:47`)라 **서류철 게이트는 검토대기(게이트②)뿐**이고, `gateLabel`은 `resolveGateTransition(status)`(`:48`), `rejectActions`는 `rejectActionsFor(status)`(`:60`)다.
- 재클릭은 **서버가 이미 막는다**(데이터 안전). 순수 스테일 가드가 화면이 읽은 status와 원격 현재 status를 대조해 거부한다 — `applyGateTransition`(`transitions.ts:120`), `applyBounceTransition`(`:175`), `applyHoldTransition`(`:209`), `applyDiscard`(`:281`) 전부 `if (loc.statusValue !== expectedStatus) return { ok:false, reason:"stale" }`. 서버 액션은 이 사유를 `REASON_MESSAGE.stale`(`commit-gate-transition.ts:27`) = `"보드가 이미 바뀌었습니다. 새로고침 후 다시 시도하세요"`로 번역해 **재클릭에 에러 토스트**를 낸다.
- 투영 지연의 원천: 보드 read owner는 raw CDN(`apps/admin/CLAUDE.md:111`, `getPipelineBoard()`는 `no-store` raw fetch — FEAT-10 「현재 동작」). `router.refresh()`가 다시 읽어도 raw CDN 캐시(FEAT-10 실측 `max-age=300`)라 최대 5분간 같은 옛 status를 준다.
- "보드 반영" 어휘는 이미 이 화면에 있다: `gateNextActionHint(to)`(`transitions.ts:19-26`)가 `"보드에 반영되면 …"`을, FEAT-10 실행 콘솔이 `"방금 찍었다면 보드 반영까지 최대 5분 걸립니다."`(`run-plan.ts` describe)를 쓴다. 잠금 칩은 이 어휘를 잇는다.
- `features/transition-pipeline-gate/index.ts`는 `GateTransitionButton`·`RejectActions`(`:1-2`)와 model의 `rejectActionsFor`·`resolveGateTransition`·`isGateTransitionSource` 등(`:3-14`)을 public API로 내보낸다. `resolveGateTransition`·`rejectActionsFor`는 두 페이지 model/ui가, `GateTransitionButton`·`RejectActions`는 두 페이지 ui가 소비한다(전수: pipeline·doc-viewer뿐).
- production TypeScript는 `noUncheckedIndexedAccess: true`. `.mjs` test는 production tsconfig 대상이 아니다(`test-typing-contract`).

## 디자인 방향

_(새 화면이 아니라 기존 브리핑 세계에 카드의 **종결 상태** 하나를 심는 것이므로 방향은 그 요소에 집중한다. 사용자가 게이트에서 생김새를 판단할 근거.)_

**대상 세계 (기존 세계의 연장).** 결재함 카드는 "도장을 기다리는 공문서"이고 도장 버튼은 관인(官印), 반려는 여백 펜 메모다(FEAT-08·09가 확정). 이 항목이 더하는 것은 **도장을 찍은 뒤의 그 문서** — 결재는 끝났고, 이제 게시대(보드)로 올라가는 중이다. 새 은유를 들이지 않는다. 종결 상태의 핵심 사실은 "이 카드에서 더 할 일이 없다 · 보드 반영을 기다린다"이다.

**팔레트 (신규 토큰 없음).** 브리핑 tone 토큰(`globals.css:31-41` 등록 — muted-foreground `:31`·destructive `:34`·stamp `:36`·active `:38`·silence `:39`·hold `:40`)을 그대로 재사용한다. 잠금 칩은 **낱말은 `text-muted-foreground`**(다른 카드 메타 — 검증칩·예산칩과 같은 급, 12px AA 안전)로, **점 마커는 방금 한 행동의 색을 잇는다**: 도장=`bg-stamp`(오커 관인), 되돌림=`bg-active`(파랑, 계획지시 tone), 보류함=`bg-hold`(주황), 폐기함=`bg-destructive`(빨강). 이 점 색은 `reject-actions.tsx:16-18`의 액션 마커와 **정확히 같은 값**이라, 방금 누른 버튼의 색이 그대로 종결 표식으로 이어진다. `--stamp` 텍스트는 12px AA 미달(`gate-transition-button.tsx:12` 기록)이라 **텍스트로 쓰지 않고 점(비텍스트, 3:1)으로만 쓴다** — reject 메모·진행 pill과 같은 우회.

**타이포 역할 (신규 서체 없음).** 잠금 칩은 도장 버튼의 `font-briefing-display`(세리프, 관인 목소리)를 **의도적으로 버린다.** 더 이상 누를 관인이 아니라 가라앉은 메타 기록이므로, 카드의 다른 메타 텍스트와 같은 `text-xs text-muted-foreground`(산세리프)로 조용해진다. 결정(세리프·의례) → 처리됨(산세리프·기록)의 서체 대비가 상태 변화를 말한다.

**레이아웃 개념 — 자리 이동 없음.** 잠금 칩은 도장 버튼이 비운 **바로 그 슬롯**(결재함: meta 행 우측 / 서류철: 제목 행 끝)에 들어가고, 반려 패널은 사라진다. 카드는 "결정을 제안하던" 모습에서 "처리 결과를 알리는" 모습으로 **무엇도 움직이지 않고** 바뀐다. 잠금 소유자(컨텍스트 Provider)는 DOM을 만들지 않으므로(`Context.Provider`는 래퍼 엘리먼트가 아니다) 두 소비자의 기존 레이아웃이 그대로 유지된다.

```
처리 전 (결재함 카드)                    처리 후
┌───────────────────────────┐        ┌───────────────────────────┐
│ FEAT-20 · 검토대기  [검증 통과] │        │ FEAT-20 · 검토대기  [검증 통과] │
│                    [ 구현승인 ]│  →     │              ● 도장 찍음 ·   │ ← 잠금 칩(점=stamp색, 낱말=muted)
│ ▸ 반려                       │        │                 보드 반영 대기 │
└───────────────────────────┘        └───────────────────────────┘   (반려 토글은 사라짐)
```

**시그니처 요소 — 소진된 도장.** 이 항목이 기억될 한 요소: 도장을 찍으면 토스트만 뜨고 버튼이 계속 눌리는 것이 아니라, **카드가 눈에 보이게 닫힌다** — 관인은 소진되고, 여백 펜 옵션은 접히고, 한 줄이 무엇을 했고 무엇을 기다리는지 말한다(`도장 찍음 · 보드 반영 대기`). 토스트만으로는 못 준 "됐나?"의 대답을 어포던스가 준다. **정적이다** — 진행 pill은 "돌고 있나?"가 임무라 맥박(`animate-pulse`)이 옳지만, 이 카드에서는 아무것도 돌지 않는다(외부 CDN이 뒤집히길 기다릴 뿐). 정적이 정직하다(FEAT-07 "상시 애니메이션 없음"·reduced-motion 존중).

**자기 비평(2-pass).** 초안의 "초록 체크 '완료' 배지"는 AI 기본값이라 버렸다 — 초록도 체크 아이콘도 쓰지 않는다. 대신 (1) 점 색을 **방금 한 행동**에 묶어(도장≠되돌림≠보류≠폐기) 이 브리프 고유의 어휘로 만들고, (2) 문구를 일반적 "완료"가 아니라 이 화면의 실제 상태 `보드 반영 대기`로 적어, CDN 지연이라는 이 프로젝트만의 세계를 표식이 설명하게 했다. Chanel 규칙(액세서리 하나 빼기): 칩에 아이콘·테두리·배경을 넣지 않고 점+낱말만 남겨, 이미 카드에 있는 마커+낱말 패턴(reject·pill)과 한 시스템으로 읽히게 했다.

## 문제

백로그 `source`(요구 원천, `TASK_BACKLOG.md:30-32`)가 지목한 것: 첫 도장 실사용(2026-08-24)에서 **성공 토스트 후에도 카드의 도장·반려 버튼이 활성으로 남아** raw CDN 잔상(최대 5분) 동안 계속 눌린다. 방어는 이미 서버에 있어(스테일 가드 `transitions.ts:120` 등이 재클릭을 거부, 실측 게이트 커밋도 1건뿐) **데이터 결함이 아니라 유도(affordance) 결함**이다 — 활성 버튼이 거짓 어포던스이고, 재클릭은 `"보드가 이미 바뀌었습니다"`(`commit-gate-transition.ts:27`)라는 혼란스러운 에러 토스트만 준다.

방향(제안): 클라이언트가 전이 성공을 기억해 그 카드의 버튼을 비활성 + `"도장 찍음 · 보드 반영 대기"` 표시로 렌더한다. FEAT-10이 실행 콘솔에 넣은 "보드 반영까지 최대 5분" 안내의 **결재함 카드판**이다.

**코드 실측이 백로그 방향에 더한 사실:** 같은 버튼을 **두 화면**(결재함 `pages/pipeline` + 서류철 `pages/doc-viewer`)이 쓴다(현재 동작의 전수 확인). 그래서 잠금은 어느 한 페이지가 아니라 **feature 레벨**에 두어야 두 소비자가 함께 덮인다 — 백로그 `area`(`transition-pipeline-gate`)가 feature를 가리키는 것과 정합한다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/features/transition-pipeline-gate/ui/gate-card-lock.tsx` `(신규, "use client")` | 카드 단위 잠금 컨텍스트 `GateCardLock`(Provider·DOM 없음) + `useGateCardLock` 훅 + 비상호작용 `LockedChip` |
| `src/fsd/features/transition-pipeline-gate/ui/gate-transition-button.tsx` `(수정)` | 잠금 컨텍스트를 읽어 잠겼으면 `LockedChip` 렌더, 도장 성공 시 `setLock({label:GATE_LOCK_LABEL, marker:"bg-stamp"})` |
| `src/fsd/features/transition-pipeline-gate/ui/reject-actions.tsx` `(수정)` | 잠금 컨텍스트를 읽어 잠겼으면 `null`, 반려 성공 시 `setLock({label:rejectLockLabel(action), marker:ACTION_META[action].marker})` |
| `src/fsd/features/transition-pipeline-gate/model/transitions.ts` `(수정)` | 순수 추가: `type CardLock`, `GATE_LOCK_LABEL` 상수, `rejectLockLabel(action)` 함수 |
| `src/fsd/features/transition-pipeline-gate/model/transitions.test.mjs` `(수정)` | `GATE_LOCK_LABEL` 리터럴 + `rejectLockLabel` 3분기 단언 추가 |
| `src/fsd/features/transition-pipeline-gate/index.ts` `(수정)` | `GateCardLock`를 public export에 추가(다른 export 불변) |
| `src/fsd/pages/pipeline/ui/index.tsx` `(수정)` | `InboxCard`의 도장 버튼 행 + 반려 패널을 `<GateCardLock>`으로 감싸고 import 추가 |
| `src/fsd/pages/doc-viewer/ui/index.tsx` `(수정)` | `DocViewer`의 제목 행 + 반려 패널을 `<GateCardLock>`으로 감싸고 import 추가 |

여기 없는 파일은 고치지 않는다. 특히 **`scripts/verify-fsd-boundaries.mjs`는 고치지 않는다** — 새 DB/network/Sentry owner도 fetch 경로도 없고(잠금은 순수 클라 상태), public boundary 변경은 `GateCardLock` 컴포넌트 export 하나뿐(fetch/DB owner 아님)이다. 서버 액션(`commit-gate-transition.ts`)·스테일 가드·커밋 로직·투영 경로(raw CDN)는 바꾸지 않는다 — 서버 방어는 이미 옳고, 이 항목은 어포던스만 고친다. `apps/admin/CLAUDE.md`는 읽기 전용이므로 직접 고치지 않고 최종 runner count와 test 설명 갱신을 `비고`에 보고한다.

## 구현 스케치

### 1) `src/fsd/features/transition-pipeline-gate/ui/gate-card-lock.tsx` (신규) — 카드 단위 잠금

도장 버튼과 반려 패널은 카드 안에서 **서로 다른 하위 트리**에 있다(도장은 meta 행, 반려는 그 아래). 공용 조상이 없으면 "한쪽이 성공하면 둘 다 잠근다"를 못 만든다. 그래서 카드마다 하나씩 감싸는 컨텍스트로 잠금 상태를 공유한다. `Context.Provider`는 DOM을 만들지 않아 두 소비자의 레이아웃이 그대로 유지된다. 서버 컴포넌트(`InboxCard`)가 자식으로 넘긴 클라 버튼도 children-as-props 합성이라 React 트리상 Provider의 하위로 들어가 컨텍스트를 받는다.

```tsx
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
```

### 2) `src/fsd/features/transition-pipeline-gate/model/transitions.ts` (수정) — 잠금 문구(순수)

`rejectActionsFor`(`:156-160`) 아래에 더한다. 문구는 이 항목이 소유하는 사용자 노출 리터럴이고, 순수라 `transitions.test.mjs`가 덮는다.

```ts
// 카드 잠금 표식(FEAT-20): 도장·반려 성공 뒤 버튼 자리를 대신하는 비상호작용 칩의 재료.
// label=낱말+"보드 반영 대기", marker=점 색 Tailwind class(비텍스트 — 색 단독 전달 아님).
export type CardLock = { label: string; marker: string };

// 도장(게이트 전진) 성공 뒤 칩 문구. FEAT-10의 "보드 반영" 어휘를 잇는다.
export const GATE_LOCK_LABEL = "도장 찍음 · 보드 반영 대기";

// 반려 성공 뒤 칩 문구. 낱말은 반려 액션 동사를 잇는다(reject-actions 토스트 어휘와 대칭).
const REJECT_LOCK_WORD: Record<RejectAction, string> = {
  bounce: "되돌림",
  hold: "보류함",
  discard: "폐기함",
};
export function rejectLockLabel(action: RejectAction): string {
  return `${REJECT_LOCK_WORD[action]} · 보드 반영 대기`;
}
```

`marker` 값은 model이 정하지 않는다 — 각 UI가 자기 마커(`"bg-stamp"` / `ACTION_META[action].marker`)를 실어 보내, 마커 색의 단일 출처(도장=`gate-transition-button`, 반려=`reject-actions.tsx:16-18`)를 유지한다.

### 3) `src/fsd/features/transition-pipeline-gate/ui/gate-transition-button.tsx` (수정) — 도장 성공 시 잠금

```tsx
// before (:7-9) 임포트
import { Button } from "~/fsd/shared/ui/atoms/button";
import { commitGateTransition } from "../api/commit-gate-transition";
import { gateNextActionHint } from "../model/transitions";
// after — 잠금 라벨·컨텍스트·칩 추가
import { Button } from "~/fsd/shared/ui/atoms/button";
import { commitGateTransition } from "../api/commit-gate-transition";
import { GATE_LOCK_LABEL, gateNextActionHint } from "../model/transitions";
import { LockedChip, useGateCardLock } from "./gate-card-lock";
```

```tsx
// before (:29-30) 훅 블록
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
// after — 잠금 컨텍스트 추가(훅은 조건부 반환 앞에서 전부 호출)
  const router = useRouter();
  const { lock, setLock } = useGateCardLock();
  const [isPending, startTransition] = useTransition();
```

```tsx
// before (:39-40) 성공 분기
      toast.success(`${label}로 넘겼습니다. ${gateNextActionHint(label)}`);
      router.refresh();
// after — 도장은 소진, 이 카드를 반영 대기로 잠근다(성공에서만)
      toast.success(`${label}로 넘겼습니다. ${gateNextActionHint(label)}`);
      setLock({ label: GATE_LOCK_LABEL, marker: "bg-stamp" });
      router.refresh();
```

```tsx
// before (:44) 렌더 시작 — 잠겼으면 도장 자리를 칩으로 대체(실패 시엔 잠기지 않아 버튼 유지)
  return (
// after
  if (lock !== null) return <LockedChip lock={lock} />;
  return (
```

`STAMP_BUTTON_CLASS`·`<Button>` 본문은 불변이다. 잠금은 성공 분기에서만 걸리므로 실패(스테일 등)는 버튼을 그대로 두어 새로고침 후 재시도가 가능하다.

### 4) `src/fsd/features/transition-pipeline-gate/ui/reject-actions.tsx` (수정) — 반려 성공 시 잠금

```tsx
// before (:7-8) 임포트
import { commitRejectTransition } from "../api/commit-gate-transition";
import type { RejectAction } from "../model/transitions";
// after — 잠금 라벨·컨텍스트 추가
import { commitRejectTransition } from "../api/commit-gate-transition";
import { rejectLockLabel, type RejectAction } from "../model/transitions";
import { useGateCardLock } from "./gate-card-lock";
```

```tsx
// before (:30-35) 훅 + 이른 반환
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (actions.length === 0) return null;
// after — 잠금 컨텍스트 + 잠기면 패널 전체 숨김(훅은 전부 먼저 호출)
  const router = useRouter();
  const { lock, setLock } = useGateCardLock();
  const [open, setOpen] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (lock !== null) return null;
  if (actions.length === 0) return null;
```

```tsx
// before (:44-49) 성공 분기
      toast.success(
        action === "discard"
          ? `${id}를 폐기했습니다. TASK_BACKLOG.md 항목은 직접 정리하세요.`
          : ACTION_META[action].toast,
      );
      router.refresh();
// after — 반려 성공도 카드를 반영 대기로 잠근다(점 색은 방금 누른 액션 마커를 잇는다)
      toast.success(
        action === "discard"
          ? `${id}를 폐기했습니다. TASK_BACKLOG.md 항목은 직접 정리하세요.`
          : ACTION_META[action].toast,
      );
      setLock({
        label: rejectLockLabel(action),
        marker: ACTION_META[action].marker,
      });
      router.refresh();
```

### 5) `src/fsd/features/transition-pipeline-gate/index.ts` (수정) — public API에 Provider 추가

```ts
// before (:1-2)
export { GateTransitionButton } from "./ui/gate-transition-button";
export { RejectActions } from "./ui/reject-actions";
// after — GateCardLock 추가(두 페이지가 소비). LockedChip·CardLock·잠금 문구는 feature 내부라 미노출.
export { GateTransitionButton } from "./ui/gate-transition-button";
export { RejectActions } from "./ui/reject-actions";
export { GateCardLock } from "./ui/gate-card-lock";
```

### 6) `src/fsd/pages/pipeline/ui/index.tsx` (수정) — 결재함 카드 잠금 소유자 장착

`gateTo`·`rejectActions` 계산(`:166-169`)과 meta 내용은 그대로 두고, 도장 버튼 행(`:182-197`)과 반려 패널(`:198-204`)을 `<GateCardLock>`으로 감싼다. import 블록(`:8-13`)에 `GateCardLock`을 추가한다.

```tsx
// before (:181-204) — item.line 뒤 두 블록
      <p className="mt-3 text-lg text-stamp">{item.line}</p>
      <div className="mt-3 flex items-center justify-between gap-2">
        …meta <p> + {gateTo !== null && <GateTransitionButton .../>}…
      </div>
      {rejectActions.length > 0 && (
        <RejectActions … />
      )}
// after — 두 블록을 한 카드 잠금으로 감싼다(내부 내용·클래스는 그대로)
      <p className="mt-3 text-lg text-stamp">{item.line}</p>
      <GateCardLock>
        <div className="mt-3 flex items-center justify-between gap-2">
          …meta <p> + {gateTo !== null && <GateTransitionButton .../>}…
        </div>
        {rejectActions.length > 0 && (
          <RejectActions … />
        )}
      </GateCardLock>
```

### 7) `src/fsd/pages/doc-viewer/ui/index.tsx` (수정) — 서류철 잠금 소유자 장착

제목 flex-wrap 행(`:36-61`)과 반려 패널(`:63-69`)을 `<GateCardLock>`으로 감싼다. import 블록(`:3-6`)에 `GateCardLock`을 추가한다. 내부 마크업은 불변(Provider는 DOM을 만들지 않아 헤더 레이아웃 그대로).

```tsx
// after 골격 — 기존 두 블록을 감싸기만 한다
        <GateCardLock>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            …배지 + <h1> + status + {runGate && <GateTransitionButton .../>}…
          </div>
          {runReject && (
            <RejectActions … />
          )}
        </GateCardLock>
```

## 테스트

- **덮는 것** (`transitions.test.mjs`에 추가, 순수 함수):
  - `GATE_LOCK_LABEL === "도장 찍음 · 보드 반영 대기"` (리터럴 고정 — 문구 드리프트 방지).
  - `rejectLockLabel("bounce") === "되돌림 · 보드 반영 대기"`, `("hold") === "보류함 · 보드 반영 대기"`, `("discard") === "폐기함 · 보드 반영 대기"`.
  - import 블록에 `GATE_LOCK_LABEL`·`rejectLockLabel` 추가. 기존 단언은 불변.
  - (기존이 이미 덮음) `resolveGateTransition`·`rejectActionsFor`의 화이트리스트 — 어떤 status에서 잠금 대상 버튼이 렌더되는지의 게이팅.

- **못 덮는 범위** (Node 러너에 DOM·React 테스트 도구 없음 → 수동 smoke, 배포 후 데스크톱+폰):
  - 잠금 컨텍스트 공유: 카드 안 두 버튼이 한 성공에 함께 잠기는지(도장→반려 패널도 사라짐, 반려→도장 버튼도 칩으로).
  - `LockedChip`이 도장 버튼 슬롯에 나타나고 반려 패널이 사라지는 시각 결과, 점 마커 색 4종(stamp/active/hold/destructive) 3:1·`text-xs` muted AA.
  - **실패는 잠그지 않음**: 스테일 등 실패 시 버튼이 활성으로 남아 재시도 가능한지.
  - `router.refresh()` 후에도 클라 잠금 상태가 유지되고(컨텍스트 useState 보존), 보드가 뒤집혀 카드가 결재함/서류철에서 빠질 때 Provider가 언마운트되며 잠금이 자연히 사라지는지.
  - 하드 리로드·이탈/재방문 시 CDN 창(≤5분) 동안 버튼 재노출(클라 메모리 한계 — 아래 결정).
  - 서류철(doc-viewer) 게이트②(검토대기)에서 결재함과 같은 잠금이 도는지(feature 공유의 두 번째 소비자).

**잠금 문구·수명의 명시적 결정(발주 계약이 계획에 위임한 지점):**
- **반려 세 갈래에 같은 잠금:** 도장·되돌리기·보류·폐기 **넷 모두**가 카드를 잠근다. 한쪽만 잠그면(예: 도장만) 성공 후 반려 패널이 활성으로 남아 서버가 스테일로 거부하는 같은 어포던스 결함이 반려 쪽에 재발하므로, 카드 단위 공유 잠금이 필요하다.
- **성공/실패 토스트와의 상호작용:** 토스트는 **불변**(성공·실패 문구 그대로). 잠금은 성공 분기에서만 걸리는 시각 어포던스 계층이다. 실패(스테일 등)는 잠그지 않아 새로고침 후 재시도가 열려 있다.
- **잠금 상태 수명:** 성공 순간부터 Provider 언마운트까지. 자동 `router.refresh()`는 넘어서지만(클라 상태 보존), **하드 리로드·페이지 이탈은 넘어서지 못한다**(클라 메모리 한계). CDN 창 동안 리로드하면 버튼이 다시 활성으로 보이나, 서버 스테일 가드가 여전히 잘못된 커밋을 막는다(교정이 아니라 어포던스 수정 — 백로그 "데이터 결함 아님" 프레이밍과 일치).
- **표시 문구:** 도장 `도장 찍음 · 보드 반영 대기` / 되돌리기 `되돌림 · 보드 반영 대기` / 보류 `보류함 · 보드 반영 대기` / 폐기 `폐기함 · 보드 반영 대기`.

## 범위 밖 의존

없음. 모든 변경이 `apps/admin/src/fsd/**`(feature UI/model + 두 page ui) 안이며, `packages/db`·다른 워크스페이스·DB 쓰기 경로·새 fetch owner가 필요 없다. 잠금은 순수 클라이언트 상태이고 서버 방어(스테일 가드)는 이미 존재한다. `scripts/verify-fsd-boundaries.mjs`도 건드리지 않는다(owner·boundary 규칙 변경 없음).

## 대안

- **버튼별 개별 잠금(카드 공유 없이):** 각 버튼이 자기만 잠근다. 기각 — 도장 성공 후 반려 패널이 활성으로 남아 서버가 거부하는 같은 결함이 반려 쪽에 재발한다. 카드 단위 공유 잠금이라야 "이 카드는 처리됐다"가 한 단위로 성립한다.
- **`sessionStorage`로 하드 리로드까지 잠금 유지(`${id}:${status}` 키):** CDN 창 동안의 리로드도 덮고 status가 바뀌면 자동 만료된다. 기각 — 저장소 의존·정리 로직이 붙고, 서버가 이미 잘못된 커밋을 막으며, 백로그가 어포던스 결함으로 한정했다. 리로드 케이스가 실사용에서 거슬리면 후속 항목으로 남긴다.
- **투영을 contents API로 옮겨 CDN 잔상 자체를 제거:** 잠금이 필요 없어진다. 기각 — FEAT-10 결정 6(`docs/plans/FEAT-10.md:131`)이 이미 유보한 큰 변경(모든 페이지 로드에 토큰·base64·rate limit)이고, 백로그가 요청한 어포던스 수정 범위를 넘는다. 잔상 제거는 별도 항목.
- **`InboxCard`/`DocViewer`를 클라 컴포넌트로 만들어 페이지가 잠금 소유:** 기각 — 두 페이지에 잠금 로직이 중복되고 프레젠테이션 하위 트리가 클라로 끌려가며, feature 관심사가 page로 샌다. feature 레벨 컨텍스트가 DRY하게 두 소비자를 함께 덮는다.
