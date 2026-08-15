# FEAT-08: `/pipeline` 결재함 게이트 버튼 — 원격 게이트 개방 (승인대기→계획지시, 검토대기→구현승인)

agent: admin-dev

> template.md의 절 구조를 따르되, **admin-dev 역할 규칙(UI 작업이면 디자인 방향을 절로 남긴다)**에 따라
> 「현재 동작」과 「문제」 사이에 `## 디자인 방향` 절 하나를 추가했다(FEAT-06/07 계획과 동일 구조).
> 이번 UI 변경은 **결재함 카드에 게이트 전이 버튼 하나를 얹는 것**이라 방향의 임무는 새 화면 제안이 아니라
> "결재 칩(현 stamp 카드)을 실제 도장 액션으로 승격하는 규칙"의 명세다.

## 현재 동작

`/pipeline`은 dev 브랜치 `PROJECT_BOARD.md`를 투영해 결재함·사무실·보고를 렌더하고, 원격 명령(이슈 #87 코멘트)만 낼 수 있다. **게이트 전이(status 변경) 수단은 없다.**

- `app/pipeline/page.tsx:17-21`이 `requireAdmin()` → `getPipelineBoard()` → `buildBriefing(sections, new Date())`로 브리핑을 만들어 `<PipelineBriefing>`에 넘긴다. `dynamic = "force-dynamic"`(`:15`)이라 매 요청 재투영한다.
- `pipeline/queries.ts:6-13` `getPipelineBoard()`는 `BOARD_RAW_URL`(`github.ts:7`, `raw.githubusercontent.com`의 dev 브랜치)을 `cache: "no-store"`로 fetch해 `parseBoard`로 파싱한다. **읽기 전용 · 토큰 불필요 · CDN 경유.**
- `pipeline/board.ts:24-95` `parseBoard`는 순수 파서다. 항목 헤더 `ITEM_RE = /^- \[([ xX])\] ([A-Z]+-\d+): (.+)$/`(`:21`), 필드 `FIELD_RE = /^\s+(agent|area|status|근거|결과):\s*(.+)$/`(`:22`). `status`는 `:84-86`(`case "status"`)에서 `currentItem.status`로 잡힌다. 상단 `>` 안내 블록·항목 없는 섹션(`## 파이프라인 구조`)은 버린다(`:31, :94`).
- `pipeline/briefing.ts`: `SpeechItem`이 `id`·`status`·`key`를 싣는다(`:6-15`). `GATE_STATUSES = new Set(["승인대기", "검토대기"])`(`:30`). `buildBriefing`의 결재함은 이 두 status만 담는다 — `items.filter((it) => it.status !== null && GATE_STATUSES.has(it.status)).map((it) => inboxSpeech(it, today))`(`:189-191`). `inboxSpeech`(`:84-110`)가 `status`를 그대로 `SpeechItem.status`로 넘긴다(승인대기면 `:87-97`, 아니면 검토대기 `:99-109`). 즉 **결재함 카드는 화면이 읽은 시점의 `id`와 `status`를 이미 손에 쥐고 있다.**
- `ui/pipeline-page.tsx:88-121` `InboxCard`가 stamp 카드다: `rounded-2xl border-stamp/40 bg-stamp-soft`(`:90`), 발화(`text-lg text-stamp`, `:100`), 하단 메타 행(`:101-108`)에 `{item.id} · {item.status}`(`:102-104`)와 **정적 "결재" 칩**(`<span className="rounded border border-stamp px-1.5 text-xs text-stamp">결재</span>`, `:105-107`), 근거 `<details>`(`:109-118`). 이 칩은 라벨일 뿐 액션이 아니다.
- 원격 쓰기는 하나뿐이다. `pipeline/command-action.ts:18-56` `postPipelineCommand(command)`가 `requireAdmin()`(`:20`, try 밖 최상단 — `NEXT_REDIRECT`를 catch가 삼키지 않게) 뒤 `resolvePipelineCommand`로 본문 해석(`:25-28`, 밖이면 `failure("Unknown command")`), 토큰 확인(`:30-33`), `ISSUE_COMMENTS_URL`(`github.ts:8`)로 코멘트 POST(`:36-45`). 성공/실패는 `~/lib/result`의 `ActionResult`(`result.ts:5-7`, `success()`/`failure(msg)`).
- `pipeline/commands.ts:27-32` `resolvePipelineCommand`는 화이트리스트를 `Object.hasOwn`으로 검사하는 보안 경계다 — 밖이면 `null`. 임의 문자열이 이슈로 나갈 경로가 없다.
- `ui/pipeline-command.tsx:10-42` `PipelineCommandButton`은 `"use client"`로 `useTransition`(`:19`) + `postPipelineCommand` 호출 + 토스트(`:24-29`) + `Button`(shadcn). FEAT-07에서 선택적 `className`(`:14,38`)이 붙었다.
- 인가 3중 방어선: `auth/config.ts` signIn · `config.edge.ts` authorized · `guard.ts:7-27` `requireAdmin()`. 셋 다 `ADMIN_EMAILS` 화이트리스트로 "로그인 세션 = 소유자"를 보장한다(CLAUDE.md:71-83).
- `env.js:41` `GITHUB_PIPELINE_TOKEN: z.string().optional()`. 주석(`:37-40`)은 이 토큰을 "이슈 #87에 코멘트를 게시할 때 쓰는" 것으로만 설명한다.
- 타입: `tsconfig`의 `noUncheckedIndexedAccess: true`(CLAUDE.md:51). 인덱스/`Record<string,…>` 접근은 `… | undefined`가 되고, `RegExpExecArray`의 캡처 그룹도 `string | undefined`다 — FEAT-03 파서가 여기서 `check`에 걸렸다.

## 디자인 방향

_(게이트 판단 근거. 이 항목은 새 화면이 아니라 기존 stamp 결재함 카드에 액션 버튼 하나를 더하는 것이므로, 방향은 그 한 요소에 집중한다.)_

**대상 세계.** FEAT-07이 이미 이 화면의 은유를 도장(stamp)으로 확정했다 — 사무실 배너가 `당신의 책상 — 결재 N건이 도장을 기다립니다`(pixel-office.tsx `OwnerBanner`)라고 말하고, 결재함 카드는 승인 잉크색(`--stamp`, 황토 오커) 위의 양피지(`--stamp-soft`)다. 지금 카드의 "결재" 칩은 **도장을 기다리는 서류에 찍힌 대기 표식**이다. FEAT-08의 액션은 곧 그 도장을 내리찍는 순간이다 — 새 은유를 들일 필요 없이 **정적 표식을 능동 도장으로 승격**한다.

**팔레트 (신규 토큰 없음).** 브리핑 전용 토큰을 재사용한다 — `--stamp`(`globals.css:85`, `oklch(0.58 0.12 62)`, 도장 잉크) · `--stamp-soft`(`:86`, 양피지) · `--muted-foreground`(메타). 픽셀 세계의 리터럴 hex 팔레트(사무실 전용)는 결재함으로 가져오지 않는다 — 결재함은 pixel 레이어가 아니라 양피지 레이어다. 새 CSS 토큰을 만들지 않는다.

**타이포 역할 (신규 서체 없음).** 도장 임프린트 라벨은 카드 발화·핸들이 이미 쓰는 `font-briefing-display`(`globals.css:11-12`, Gowun Batang 세리프)를 쓴다 — 세리프 임프린트가 관인(官印) 느낌을 준다. 데스크톱은 바탕 세리프, 폰은 고딕 폴백(FEAT-04 기기 현실). 나머지 메타 텍스트는 그대로.

**레이아웃 개념.** 카드 하단 메타 행(`:101-108`)의 구조를 유지한다 — 왼쪽 `{id} · {status}`(정체·상태), 오른쪽에 **"결재" 칩이 있던 자리에 도장 버튼**을 둔다. 사용자의 눈이 이미 "결재"를 찾도록 훈련된 그 지점에 실행 가능한 도장이 놓인다. 배치 변화 최소, 인지 연속성 최대.

```
결재함 카드(변경 후)                       도장 버튼(rest → hover → active)
┌───────────────────────────────────┐    ┌─────────┐   양피지 위 오커 잉크 임프린트
│ 🧑 PM · 선정·발주                    │    │ 계획지시 │▟  hard 그림자(도장 오프셋)
│ FEAT-08, 1일째 계획 지시를 기다립니다.  │    └─────────┘
│ FEAT-08 · 승인대기          [ 계획지시 ]│    hover: 살짝 들림(집어올린 도장)
│ ▸ 근거 보기                          │    active: 눌러 찍힘(그림자 사라짐)
└───────────────────────────────────┘
```

**시그니처 요소 — 도장 임프린트 버튼.** 이 카드가 기억될 한 요소. 버튼은 **채워진 색면이 아니라 도장이 남긴 임프린트**다: 양피지 바탕(`bg-stamp-soft`) 위에 오커 잉크(`text-stamp`) 글자와 2px 도장 테두리(`border-stamp`), 오른쪽·아래로 `1px` hard 그림자(`shadow-[1px_1px_0_0_var(--stamp)]`)가 도장 오프셋을 만든다. 라벨은 **찍힐 status 낱말 그대로**(`계획지시` / `구현승인`) — 도장이 보드에 남길 글자를 그대로 버튼에 담아, 클릭이 곧 그 글자를 찍는 행위가 되게 한다. **어휘 일관성**: 버튼 `계획지시` → 커밋 후 보드 status `계획지시` → 토스트 `계획지시로 넘겼습니다`(frontend-design: 동작이 흐름 내내 같은 이름을 유지한다).

- **대비 — 검증된 짝만 쓴다.** rest 상태는 이 카드가 이미 배포해 온 짝을 그대로 재사용한다: `text-stamp` 잉크 on `bg-stamp-soft` 양피지(발화 `:100`·기존 칩 `:105-107`와 동일). `--stamp`(L 0.58)는 흰 글자와 AA를 맞추기 어려워(추정 ~3:1) **채운 버튼(흰 글자)을 쓰지 않는다** — 임프린트 방식이 대비·은유 둘 다 이긴다. rest에서 클릭 가능함을 알리는 신호는 색 반전이 아니라 2px 테두리 + hard 그림자 + hover 들림 + `focus-visible` 링(shadcn `Button` 기본, button.tsx:8)이 맡는다.
- **모션 — 도장 한 동작뿐.** `hover:-translate-y-px`(집어올림) · `active:translate-y-0 active:shadow-none`(눌러 찍힘). 상시 애니메이션 없음. `prefers-reduced-motion`은 transform-only라 위반 없음.
- **접근성 바닥.** 실제 HTML `<button>`(키보드 포커스·`useTransition`). pending 라벨 `찍는 중...`로 상태를 텍스트로 전한다(색 단독 아님). 실패는 토스트로 사유를 말한다(조용한 실패 금지).
- **말(카피).** 실패 문구는 인터페이스 목소리로 "무엇이 어긋났고 어떻게 하라"를 적는다: 스테일이면 `보드가 이미 바뀌었습니다. 새로고침 후 다시 시도하세요`. 성공은 `${label}로 넘겼습니다`.

**의도적 이탈(게이트 확인 대상):** (1) 정적 "결재" 칩은 **제거**하고 도장 버튼으로 대체한다 — 칩(라벨)과 버튼(액션)을 둘 다 두면 중복이다(결재함 존/배너가 이미 "결재 대기"를 프레이밍한다). 칩을 유지할지 게이트에서 뒤집을 수 있다. (2) 흰 글자 채운 버튼 대신 임프린트 방식을 택한 이유는 `--stamp`의 대비 한계다 — 새 잉크 토큰(더 어두운 stamp)을 도입할지는 게이트 결정 대상(기본은 신규 토큰 없음).

## 문제

백로그 `source`(요구 원천, TASK_BACKLOG.md:66-77)가 지목한 것: **결재함은 승인대기·검토대기 항목을 "결재" 라벨로 보여주지만 결재 수단이 없다.** 게이트 전이는 대시보드 밖(Claude 세션 지시 또는 보드 파일 직접 수정)에서만 가능하다. 코드에서 확인: `InboxCard`(`pipeline-page.tsx:105-107`)의 "결재" 칩은 정적 `<span>`이고, 원격 쓰기 경로는 `command-action.ts`의 이슈 코멘트 하나뿐이며 그 본문은 전부 `GATE_GUARD`로 **게이트 전이를 금지**한다(`commands.ts:13-14`). 즉 화면에서 status를 바꿀 방법이 코드상 존재하지 않는다. FEAT-03의 의도된 잠금이었으나, 소유자가 실사용에서 마찰을 확인하고 개방을 결정했다.

**불변식 논거(백로그 그대로).** "게이트는 사용자만 연다"는 **누가**의 제약이지 **어디서**의 제약이 아니다. admin의 3중 인가가 "로그인 세션 = 소유자"를 보장하므로, `requireAdmin()` 뒤의 대시보드 버튼은 불변식을 깨지 않는다. 이슈 #87 코멘트 채널의 게이트 거절(`GATE_GUARD`)은 **그대로 둔다** — 새 경로는 이슈 경유가 아니라 GitHub **contents API**로 dev 브랜치 `PROJECT_BOARD.md`의 해당 항목 status 줄만 고쳐 커밋하는 별도 서버 액션이다.

요구는 다섯 층(백로그 「요구」·「성격 변경 명시」):

1. **결재함 카드에 전이 버튼** — 승인대기 → `계획지시`, 검토대기 → `구현승인`. `requireAdmin()` 뒤 서버 액션.
2. **전이 화이트리스트** — 위 두 전이만(순수 함수 + 테스트). 임의 status·임의 텍스트가 커밋될 구조 금지(`commands.ts` 화이트리스트와 같은 원칙).
3. **스테일 가드** — 화면이 읽은 status와 커밋 직전 원격 status가 다르면 거부 + 실패 토스트. 항목 못 찾음·형식 불일치도 거부. 조용한 실패 금지. **contents API의 sha 낙관적 잠금**을 TOCTOU 방지에 함께 쓴다.
4. **파서 왕복** — `board.ts` 파서가 읽는 형식 그대로 status 줄만 바꾼다. 전이 후 재파싱 시 **그 항목 status만** 달라져야 함을 테스트로 못박는다.
5. **성격 변경** — admin의 **두 번째 외부 쓰기 경로**(저장소 콘텐츠 쓰기)가 생긴다. `CLAUDE.md`의 "외부 쓰기는 하나뿐" 주장 갱신 필요(읽기 전용이라 「비고」로 보고), PAT에 **Contents RW 추가** 필요(사용자 재발급 — 런타임 전제).

이 계획은 순수 계층(`board.ts`·`briefing.ts`)과 명령 보안 경계(`commands.ts` 화이트리스트 원칙, DB 무접근)를 **재사용**하고, 전이 화이트리스트·스테일 가드·파서 왕복을 새 순수 모듈(`transitions.ts`)로 뽑아 테스트 가능하게 둔 뒤, contents API 왕복만 새 서버 액션(`commit-transition.ts`)에 담고, UI는 stamp 카드에 도장 버튼 하나를 더한다. **DB 쓰기는 추가하지 않는다**(읽기 전용 유지) — 새 쓰기는 GitHub 콘텐츠뿐이고, `requireAdmin()` 뒤·되돌릴 수 있음·커밋 기록이 남음이라는 성격은 기존 `command-action.ts`와 같다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/pipeline/transitions.ts` `(신규, 순수)` | 전이 화이트리스트(`GATE_TRANSITIONS`/`resolveGateTransition`) + 보드 markdown에 status 줄만 교체하는 스테일 가드 순수 함수(`applyGateTransition`) + 커밋 메시지 빌더(`gateCommitMessage`). 임포트 없음(board.ts/commands.ts와 같은 이유). `transitions.test.mjs`로 덮인다 |
| `src/pipeline/transitions.test.mjs` `(신규)` | 화이트리스트 + 스테일/미발견/형식/미허용 거부 + **파서 왕복(그 항목 status만 변경)** + 다중 등장 시 최신 행만 + 커밋 메시지 검증 |
| `src/pipeline/commit-transition.ts` `(신규, "use server")` | contents API GET(콘텐츠+sha) → `applyGateTransition` → PUT(sha 낙관적 잠금). `requireAdmin()` 게이트, `ActionResult` 반환, 사유별 실패 문구 |
| `src/pipeline/github.ts` `(수정)` | `BOARD_PATH`·`BOARD_CONTENTS_URL` 상수 추가(기존 상수 유지) |
| `src/ui/pipeline-gate.tsx` `(신규, "use client")` | `GateTransitionButton` — `commit-transition` 호출 + `useTransition` + 토스트 + `router.refresh()`. 도장 임프린트 스타일 |
| `src/ui/pipeline-page.tsx` `(수정)` | `InboxCard` 하단 메타 행의 정적 "결재" 칩(`:105-107`)을 `GateTransitionButton`으로 교체. `resolveGateTransition`로 라벨 도출(비게이트면 버튼 없음) |
| `src/env.js` `(수정, 주석만)` | `GITHUB_PIPELINE_TOKEN` 주석(`:37-40`)에 "보드 콘텐츠 커밋"과 Contents RW 권한 필요를 명기. **스키마는 그대로 optional** |

여기 없는 파일은 고치지 않는다. `board.ts`·`briefing.ts`·`queries.ts`·`commands.ts`·`command-action.ts`·`agents.ts`·`pipeline-command.tsx`·`pixel-office.tsx`·`auth/**`·`middleware.ts`·`globals.css`는 건드리지 않는다(순수 파서·브리핑·기존 명령 경로·인가 3중 방어선·CSS 토큰은 변경 불필요). `apps/admin/CLAUDE.md`는 읽기 전용이라 「비고」로 갱신 행을 보고한다.

## 구현 스케치

### 1) `src/pipeline/transitions.ts` (신규) — 화이트리스트 + 스테일 가드 순수 함수

`commands.ts`와 같은 원칙: 여기 없는 (from) status는 커밋되지 않는다. status 줄 교체는 **원본 문자열을 인덱스로 잘라 붙여** 줄바꿈·다른 줄을 바이트 보존한다(split/join 재조합이 CRLF를 LF로 뭉개는 것 방지).

```ts
// 순수. board.ts/commands.ts와 같은 이유로 임포트 없음(transitions.test.mjs로 덮인다).
// 여기가 보안 경계다: 여기 없는 (from) status는 대시보드에서 커밋되지 않는다.
export const GATE_TRANSITIONS = {
  승인대기: "계획지시",
  검토대기: "구현승인",
} as const;

export type GateFromStatus = keyof typeof GATE_TRANSITIONS;
export type GateToStatus = (typeof GATE_TRANSITIONS)[GateFromStatus];

export function resolveGateTransition(fromStatus: string): GateToStatus | null {
  // Object.hasOwn: 프로토타입 오염 키("__proto__" 등)까지 막는 멤버십 검사(commands.ts와 동일).
  return Object.hasOwn(GATE_TRANSITIONS, fromStatus)
    ? GATE_TRANSITIONS[fromStatus as GateFromStatus]
    : null;
}

export type GateTransitionResult =
  | { ok: true; markdown: string; to: GateToStatus }
  | { ok: false; reason: "not-whitelisted" | "not-found" | "format" | "stale" };

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// board.ts와 같은 형식으로 이 항목 블록 안의 첫 status 줄을 잡는다(FIELD_RE 호환).
const STATUS_LINE_RE = /^([ \t]+status:[ \t]*)(.+?)[ \t]*$/m;
// 이 항목 블록의 끝: 다음 항목/헤딩/안내 블록 직전.
const BLOCK_END_RE = /\n(?=- \[|#|>)/;

export function applyGateTransition(
  markdown: string,
  id: string,
  expectedStatus: string,
): GateTransitionResult {
  const to = resolveGateTransition(expectedStatus);
  if (to === null) return { ok: false, reason: "not-whitelisted" };

  // 항목 헤더의 첫 등장 = 가장 위(최신) 행. 아래 이력 행은 건드리지 않는다
  // (briefing.flatten의 "첫 등장만 유효"와 같은 규칙).
  const headerRe = new RegExp(`^- \\[[ xX]\\] ${escapeRegExp(id)}: .+$`, "m");
  const header = headerRe.exec(markdown);
  if (header === null) return { ok: false, reason: "not-found" };
  const headerLine = header[0];
  if (headerLine === undefined) return { ok: false, reason: "not-found" };

  const afterHeader = header.index + headerLine.length;
  const rest = markdown.slice(afterHeader);
  const endMatch = BLOCK_END_RE.exec(rest);
  const blockEnd =
    endMatch === null ? markdown.length : afterHeader + endMatch.index;

  const block = markdown.slice(afterHeader, blockEnd);
  const status = STATUS_LINE_RE.exec(block);
  if (status === null) return { ok: false, reason: "format" };
  const prefix = status[1];
  const value = status[2];
  if (prefix === undefined || value === undefined) {
    return { ok: false, reason: "format" };
  }
  // 스테일 가드: 화면이 읽은 status와 원격 현재 status가 다르면 거부(잃어버린 갱신 방지).
  if (value.trim() !== expectedStatus) return { ok: false, reason: "stale" };

  // status 줄의 값만 교체. prefix·to 모두 `$` 미포함이라 문자열 치환이 안전하다.
  const newBlock = block.replace(STATUS_LINE_RE, `${prefix}${to}`);
  const newMarkdown =
    markdown.slice(0, afterHeader) + newBlock + markdown.slice(blockEnd);
  return { ok: true, markdown: newMarkdown, to };
}

// 커밋 메시지 — 대시보드 경유임을 남긴다(백로그 요구). to별 어구.
const COMMIT_PHRASE: Record<GateToStatus, string> = {
  계획지시: "open {id} for planning",
  구현승인: "approve {id} for implementation",
};
export function gateCommitMessage(id: string, to: GateToStatus): string {
  return `docs(board): ${COMMIT_PHRASE[to].replace("{id}", id)} via dashboard gate`;
}
```

- `noUncheckedIndexedAccess`: `header[0]`·`status[1]`·`status[2]`는 `string | undefined`라 전부 가드한다(FEAT-03 파서 교훈). `GATE_TRANSITIONS[… as GateFromStatus]`·`COMMIT_PHRASE[to]`는 유한 유니온 키라 `undefined`가 안 붙는다.
- `applyGateTransition`은 **화이트리스트(1차) → 항목 최신 행 탐색 → 형식 → 스테일(값 대조)** 순으로만 진행하며, 어느 관문이든 못 넘으면 사유를 담아 거부한다. 통과해야만 status 값 한 곳만 교체한 markdown을 낸다.

### 2) `src/pipeline/commit-transition.ts` (신규, `"use server"`) — contents API 왕복

`command-action.ts`의 패턴을 따른다: `requireAdmin()`은 try 밖 최상단, 결과는 `ActionResult`, 순수 사유는 여기서 사용자 문구로 번역(조용한 실패 금지). 투영(raw·CDN 캐시)이 아니라 **contents API로 HEAD를 읽어** 스테일 가드를 최신 기준으로 판정하고, 같은 API의 PUT에 sha를 실어 TOCTOU를 막는다.

```ts
"use server";

import { env } from "~/env";
import { requireAdmin } from "~/auth/guard";
import { type ActionResult, failure, success } from "~/lib/result";
import { BOARD_BRANCH, BOARD_CONTENTS_URL } from "./github";
import { applyGateTransition, gateCommitMessage } from "./transitions";

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

// 순수 전이 거부 사유 → 사용자 문구.
const REASON_MESSAGE: Record<string, string> = {
  "not-whitelisted": "허용되지 않은 게이트 전이입니다",
  "not-found": "보드에서 항목을 찾지 못했습니다",
  format: "보드 형식을 해석하지 못했습니다",
  stale: "보드가 이미 바뀌었습니다. 새로고침 후 다시 시도하세요",
};

export async function commitGateTransition(
  id: string,
  expectedStatus: string,
): Promise<ActionResult<void>> {
  // 인가는 try 밖 최상단(NEXT_REDIRECT를 catch가 삼키지 않게, command-action.ts와 동일).
  await requireAdmin();

  const token = env.GITHUB_PIPELINE_TOKEN;
  if (!token) {
    return failure("GitHub 토큰이 설정되지 않았습니다");
  }
  const auth = { ...GITHUB_HEADERS, Authorization: `Bearer ${token}` };

  // 1) 현재 dev 보드 콘텐츠 + sha. raw(CDN 캐시)가 아니라 contents API로 HEAD를 읽는다.
  let getRes: Response;
  try {
    getRes = await fetch(`${BOARD_CONTENTS_URL}?ref=${BOARD_BRANCH}`, {
      headers: auth,
      cache: "no-store",
    });
  } catch (error) {
    console.error("Failed to load board", error);
    return failure("보드를 불러오지 못했습니다");
  }
  if (!getRes.ok) {
    return failure(`GitHub API가 ${getRes.status}로 응답했습니다`);
  }
  const meta = (await getRes.json()) as { content?: string; sha?: string };
  if (typeof meta.content !== "string" || typeof meta.sha !== "string") {
    return failure("보드 콘텐츠를 읽지 못했습니다");
  }
  const markdown = Buffer.from(meta.content, "base64").toString("utf-8");

  // 2) 순수 전이(화이트리스트 + 스테일 가드 + status 줄만 교체).
  const edit = applyGateTransition(markdown, id, expectedStatus);
  if (!edit.ok) {
    return failure(REASON_MESSAGE[edit.reason] ?? "전이를 적용하지 못했습니다");
  }

  // 3) 커밋(PUT). sha 낙관적 잠금 — GET 이후 원격이 바뀌면 409.
  let putRes: Response;
  try {
    putRes = await fetch(BOARD_CONTENTS_URL, {
      method: "PUT",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        message: gateCommitMessage(id, edit.to),
        content: Buffer.from(edit.markdown, "utf-8").toString("base64"),
        sha: meta.sha,
        branch: BOARD_BRANCH,
      }),
    });
  } catch (error) {
    console.error("Failed to commit board transition", error);
    return failure("보드 커밋에 실패했습니다");
  }
  if (putRes.status === 409) {
    return failure("보드가 방금 바뀌었습니다. 새로고침 후 다시 시도하세요");
  }
  if (!putRes.ok) {
    return failure(`GitHub API가 ${putRes.status}로 응답했습니다`);
  }
  return success();
}
```

- `Buffer`는 Node 런타임에서 쓴다 — 서버 액션은 edge가 아니라 Node에서 돈다(이 앱은 Prisma·Node 런타임). base64에 섞인 개행(contents API는 60자마다 줄바꿈)도 `Buffer.from(x, "base64")`가 무시한다.
- `REASON_MESSAGE[edit.reason]`는 `Record<string,…>` 접근이라 `… | undefined` → `?? "…"`.
- **성격**: 이 액션은 admin의 **두 번째 외부 쓰기**다. DB는 건드리지 않는다(읽기 전용 유지). `requireAdmin()` 뒤·되돌릴 수 있음(커밋 revert)·기록이 남음(커밋 메시지)이라는 성격은 `command-action.ts`와 같다.

### 3) `src/pipeline/github.ts` (수정) — contents API 상수

```ts
// after — 기존 상수(BOARD_RAW_URL·ISSUE_COMMENTS_URL) 아래에 추가
export const BOARD_PATH = "PROJECT_BOARD.md";
export const BOARD_CONTENTS_URL = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${BOARD_PATH}`;
```

기존 `GITHUB_OWNER`·`GITHUB_REPO`·`BOARD_BRANCH`·`BOARD_RAW_URL`·`ISSUE_COMMENTS_URL`(`:2-8`)은 그대로. raw URL은 투영(읽기)에 계속 쓰고, contents URL은 sha 읽기·커밋에 쓴다.

### 4) `src/ui/pipeline-gate.tsx` (신규, `"use client"`) — 도장 버튼

`PipelineCommandButton`(`pipeline-command.tsx:10-42`)과 같은 뼈대(`useTransition` + 토스트 + `Button`)에, 성공 시 `router.refresh()`로 투영을 다시 읽어 찍은 항목이 결재함에서 보고 피드로 넘어가게 한다. 라벨/상태는 서버 컴포넌트(InboxCard)가 넘긴다 — 이 컴포넌트는 순수 모듈을 임포트하지 않는다.

```tsx
"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { commitGateTransition } from "~/pipeline/commit-transition";
import { Button } from "~/ui/atoms/button";

// 도장 임프린트: 양피지 위 오커 잉크 글자 + 2px 도장 테두리 + hard 오프셋 그림자.
// active에서 그림자를 지우고 눌러 찍는다. 검증된 짝(text-stamp on bg-stamp-soft) 유지.
const STAMP_BUTTON_CLASS =
  "h-auto rounded-sm border-2 border-stamp bg-stamp-soft px-2.5 py-1 " +
  "font-briefing-display text-xs font-medium tracking-wide text-stamp " +
  "shadow-[1px_1px_0_0_var(--stamp)] transition-transform " +
  "hover:-translate-y-px active:translate-y-0 active:shadow-none disabled:opacity-60";

export function GateTransitionButton({
  id,
  status,
  label,
}: {
  id: string;
  status: string;
  label: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const result = await commitGateTransition(id, status);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(`${label}로 넘겼습니다`);
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      disabled={isPending}
      onClick={handleClick}
      className={STAMP_BUTTON_CLASS}
    >
      {isPending ? "찍는 중..." : label}
    </Button>
  );
}
```

- 서버는 `id`+`status`만 받아 화이트리스트를 다시 검사한다(권위는 서버). 클라가 넘기는 `label`은 표시용 힌트일 뿐이다.

### 5) `src/ui/pipeline-page.tsx` (수정) — 도장 버튼 장착

`InboxCard`(`:88-121`) 하단 메타 행(`:101-108`)의 정적 "결재" 칩(`:105-107`)만 도장 버튼으로 교체한다. 나머지(발화·근거 `<details>`·아바타)는 그대로. `resolveGateTransition`으로 라벨을 얻고, 비게이트 status면 버튼을 렌더하지 않는다(결재함 항목은 항상 게이트 status지만 방어).

```tsx
// 임포트 추가(파일 상단)
import { resolveGateTransition } from "~/pipeline/transitions";
import { GateTransitionButton } from "~/ui/pipeline-gate";
```

```tsx
// before (:101-108)
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {item.id} · {item.status}
        </p>
        <span className="rounded border border-stamp px-1.5 text-xs text-stamp">
          결재
        </span>
      </div>
// after — 정적 칩 → 도장 버튼(라벨=찍힐 status). 비게이트면 버튼 없음
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          {item.id} · {item.status}
        </p>
        {gateTo !== null && (
          <GateTransitionButton
            id={item.id}
            status={item.status ?? ""}
            label={gateTo}
          />
        )}
      </div>
```

```tsx
// InboxCard 본문 상단(item.line 렌더 전)에서 라벨 도출:
// item.status는 string | null → null이면 버튼 없음.
  const gateTo =
    item.status === null ? null : resolveGateTransition(item.status);
```

- `pipeline-page.tsx`는 `"use client"`가 없는 **서버 컴포넌트**(app/pipeline/page.tsx가 서버에서 렌더)라 순수 `resolveGateTransition`을 렌더 시점에 호출해도 된다. `GateTransitionButton`(client)은 서버 컴포넌트가 조립한다(기존 `PipelineCommandButton`과 같은 방식).
- `status={item.status ?? ""}`: `gateTo !== null`인 분기 안이라 `item.status`는 이미 non-null이지만, 타입상 `string | null`이라 `?? ""`로 좁힌다(빈 문자열이 서버로 가도 화이트리스트가 `null`로 거부).

### 6) `src/env.js` (수정, 주석만) — 토큰 역할·권한 명기

```js
// before (:37-40)
    // 파이프라인 대시보드가 이슈 #87에 코멘트를 게시할 때 쓰는 GitHub 토큰.
    // optional 이유: 기능을 먼저 배포하고 값은 이후 사용자가 주입한다(백로그 명시).
    // 없으면 명령 버튼이 실패 결과("GitHub token is not configured")를 낸다.
    // ADMIN_EMAILS와 달리 optional인 이유가 이것 — 누락이 빌드를 죽이면 안 된다.
// after — 두 번째 외부 쓰기(보드 커밋)와 Contents RW 권한을 명기
    // 파이프라인 대시보드의 GitHub 토큰. 두 곳에서 쓴다:
    //  (1) 이슈 #87 코멘트 게시(command-action.ts) — Issues RW,
    //  (2) dev 브랜치 PROJECT_BOARD.md status 줄 커밋(commit-transition.ts) — Contents RW.
    // 따라서 PAT은 ApcH 저장소에 Contents RW + Issues RW가 있어야 한다(사용자 재발급).
    // optional 이유: 기능을 먼저 배포하고 값은 이후 사용자가 주입한다(백로그 명시).
    // 없으면 명령·전이 버튼이 실패 결과를 낸다. 누락이 빌드를 죽이면 안 되므로 optional.
```

`GITHUB_PIPELINE_TOKEN: z.string().optional()`(`:41`)과 `runtimeEnv`(`:58`)는 **그대로**. 스키마 변경 없음 — 값·권한만 사용자 몫(런타임 전제).

## 테스트

- **덮는 것 (순수 함수, `transitions.test.mjs` 신규):**
  - `resolveGateTransition`: `"승인대기"`→`"계획지시"`, `"검토대기"`→`"구현승인"`. `"완료"`·`"보류"`·`"계획지시"`·`"구현승인"`(이미 전이된 것)·`"arbitrary"`·`"__proto__"`·`"toString"`→`null`(commands.ts 화이트리스트와 같은 프로토타입 오염 방어).
  - `applyGateTransition` 해피패스 + **파서 왕복**(요구 4): 대표 보드에서 `("FEAT-01","승인대기")`·검토대기 항목 각각 전이 후, 원본과 결과를 **둘 다 `parseBoard`로 재파싱**해 (a) 그 항목 status만 목표값으로 바뀌고 (b) 다른 모든 항목의 `status`/`agent`/`area`/`근거`/`결과`/`title`/`checked`가 동일함을 단언. 형식 그대로 유지됨을 못박는다.
  - **최소 diff**: 결과 markdown이 원본과 **정확히 한 줄**만 다름을 단언(`split("\n")` 비교) — status 줄 외에는 아무것도 안 바뀜.
  - **다중 등장**: 같은 ID가 두 섹션(최신 승인대기 / 이력 완료)에 있을 때, 전이가 **최신(위) 행의 status만** 바꾸고 이력 행은 그대로임을 원본 문자열 대조로 단언(briefing dedupe와 같은 규칙).
  - 거부 사유(요구 3, 조용한 실패 금지): 스테일(`("FEAT-01","검토대기")`처럼 화이트리스트엔 있으나 원격 현재값과 불일치)→`stale`; 미허용(`("BUG-06","완료")`)→`not-whitelisted`; 미발견(`("NOPE-99","승인대기")`)→`not-found`; 형식 불일치(항목 헤더는 있으나 status 줄 없음)→`format`. 각각 `ok:false` + 정확한 사유.
  - `gateCommitMessage`: `("FEAT-08","계획지시")`→`"docs(board): open FEAT-08 for planning via dashboard gate"`, `("FEAT-08","구현승인")`→`"docs(board): approve FEAT-08 for implementation via dashboard gate"`.
- **못 덮는 범위 (Node 러너·DOM/외부 I/O 없음 — 배포 후 데스크톱+폰 수동 확인):**
  - `commit-transition.ts`의 contents API GET/PUT·base64 인코딩·sha 409 분기·`requireAdmin()` 게이트·토큰 미설정 분기(실제 GitHub 왕복).
  - `GateTransitionButton`의 `useTransition`·`toast`·`router.refresh()`·클릭·pending 라벨, 도장 임프린트 시각(테두리·hard 그림자·hover 들림·active 눌림)·`text-stamp` on `bg-stamp-soft` 실측 대비·세리프 폴백(폰).
  - **투영 지연(설계상 한계, 반드시 확인)**: 투영 읽기는 `raw.githubusercontent.com`(CDN 캐시 ~수분)인데 커밋은 contents API(HEAD)로 나간다. 커밋 성공 후 `router.refresh()`가 raw를 다시 읽어도 CDN 지연으로 **찍은 항목이 잠시 결재함에 남을 수 있다**. 정합성 문제는 아니다(커밋은 성공했고, 다음 시도의 스테일 가드는 raw가 아니라 contents API의 최신값으로 판정한다) — UX 잔상이다. 성공 토스트가 결과를 확정해 준다. 투영을 contents API로 바꾸는 것은 이번 최소 범위 밖(투영은 현재 토큰 없이 공개 raw로 도는데, 바꾸면 읽기에 토큰·base64가 필요해진다). 「대안」 참조.
- **CLAUDE.md 테스트 표(읽기 전용 — 직접 수정 금지):** `transitions.test.mjs` 행 추가 + 파일·테스트 수 갱신(7→8파일)이 필요하다. B단계 `비고:`로 보고한다(추가 행: `pipeline/transitions.test.mjs | 게이트 전이 화이트리스트(승인대기→계획지시·검토대기→구현승인만) + status 줄 교체의 파서 왕복·스테일/미발견/형식 거부·다중 등장 시 최신 행만·커밋 메시지`).

## 범위 밖 의존

**코드는 없음** — 전부 `apps/admin/src/**` 안이다. `@repo/db`·다른 워크스페이스·DB 스키마·`packages/db`를 건드리지 않는다. **DB 쓰기 경로는 추가하지 않는다**(읽기 전용 유지). 새 외부 쓰기는 GitHub contents API뿐이고, 서버 측 호출이라 CSP `connect-src`(브라우저 호출만 대상, CLAUDE.md:126)와 무관하다.

**코드 밖 전제 두 가지(막힘이 아니라 사용자 몫):**

1. **PAT 권한 확대(런타임 전제).** `GITHUB_PIPELINE_TOKEN`이 현재 Issues RW만 가진다면 보드 커밋(PUT)이 실패한다. ApcH 저장소에 **Contents RW**를 더해 사용자가 재발급해야 한다. 코드 스키마 변경은 없다(값·권한은 배포 환경 주입) — 그래서 「범위 밖 의존(코드)」은 없음이고, 이건 FEAT-03의 "토큰은 소유자 계정이어야 한다"와 같은 런타임 전제다.
2. **`apps/admin/CLAUDE.md` 주장 갱신(읽기 전용 문서).** "외부 쓰기는 하나뿐" 주장이 거짓이 된다 — Project Overview(`:13` "유일한 쓰기는 … GitHub 이슈 코멘트")와 Common Gotchas(`:128` "외부 쓰기는 하나뿐이다")를 "두 경로(이슈 코멘트 + 보드 콘텐츠 커밋)"로 고쳐야 한다. DB 무접근 주장(`:127`)은 그대로 참(이 작업이 DB 쓰기를 넣지 않는다). 이 파일은 내 쓰기 범위 밖이라 직접 고치지 않고 B단계 `비고:`로 갱신 문구를 보고한다(FEAT-03/07 선례).

## 대안

- **전이 화이트리스트를 `commands.ts`에 합친다** — 명령과 전이가 한 파일이면 화이트리스트가 한 곳에 모인다. 하지만 명령은 "status를 바꾸지 마라"(이슈 코멘트)이고 전이는 "status만 바꿔라"(보드 커밋)로 **정반대 계약**이라 섞으면 `GATE_GUARD` 불변식 테스트가 혼란스러워진다. **채택 안 함** — 별 모듈(`transitions.ts`)로 갈라 각 계약을 독립 테스트한다.
- **투영도 contents API로 바꿔 CDN 잔상 제거** — 커밋 직후 `router.refresh()`가 즉시 최신을 반영한다. 하지만 투영(읽기)이 지금은 토큰 없는 공개 raw로 도는데, 바꾸면 모든 페이지 로드가 인증 토큰·base64 디코드를 타고 rate limit(인증 5000/h)에 묶인다. **채택 안 함(이번 범위 밖)** — 잔상은 성공 토스트로 덮고, 필요하면 후속 항목으로 투영 경로를 옮긴다.
- **스테일 가드를 sha만으로** — contents API의 sha 낙관적 잠금만 쓰고 항목값 대조를 생략. 하지만 sha는 "내 GET 이후 파일이 바뀌었나"만 잡지, "화면이 읽은 시점 이후 바뀌었나"(사용자가 낡은 화면에서 눌렀나)는 못 잡는다 — 내 GET은 늘 최신 sha를 얻으므로 커밋이 그냥 성공해 **잃어버린 갱신**이 난다. **채택 안 함** — 화면이 보낸 `expectedStatus` 대조(스테일)와 sha 잠금(TOCTOU)을 **둘 다** 쓴다.
- **status 줄 교체를 split/join 재조합으로** — 줄 배열로 다뤄 인덱스로 갈아끼우면 코드가 단순하다. 하지만 `\r?\n`으로 split 후 `\n`으로 join하면 CRLF 원본을 통째로 LF로 뭉개 커밋 diff가 파일 전체가 된다(대시보드 커밋은 최소여야 한다). **채택 안 함** — 원본 문자열 인덱스 슬라이스로 status 값 한 곳만 교체해 다른 바이트를 보존한다.
- **선택 확장: 전이 성공 직후 `pipeline-run` 코멘트 자동 게시**(백로그 「선택 확장」) — 결재 탭 한 번으로 원격 세션 실행까지 이어진다. 두 방식이 있다: (a) `commitGateTransition` 성공 후 클라에서 `postPipelineCommand("pipeline-run")` 연쇄 호출, (b) 서버 액션 안에서 커밋 성공 뒤 코멘트 POST. 트레이드오프: 두 외부 쓰기가 한 클릭에 묶여, 커밋은 성공했는데 코멘트가 실패하면 부분 성공 상태 처리가 필요하고, 자동 실행이 "전이는 결정, 실행은 별개"라는 현재 분리를 흐린다. **기본 스케치에는 넣지 않았다** — 게이트②에서 사용자가 켤지 결정한다. 켜면 (a)를 권한다(두 액션의 실패를 각각 토스트로 분리 보고할 수 있어 조용한 실패가 안 난다).
