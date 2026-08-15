# FEAT-06: `/pipeline` 사무실 뷰 — 플랫 SVG 캐릭터·책상 공간화 + 책상별 원격 명령

agent: admin-dev

> template.md의 절 구조를 그대로 따르되, **admin-dev 역할 규칙(UI 작업이면 디자인 방향을 절로 남긴다)**에 따라
> 「현재 동작」과 「문제」 사이에 `## 디자인 방향` 절 하나를 추가했다. 그 절은 사용자가 게이트에서 생김새를
> 판단하는 근거이고, SVG 완성 코드는 「구현 스케치」에 둔다(코드는 그 절에 모은다).

## 현재 동작

FEAT-04가 `/pipeline`을 목록형 브리핑으로 만들었고, 지금 코드는 그대로다.

- `app/pipeline/page.tsx:17-30`이 `requireAdmin()` → `getPipelineBoard()` → `buildBriefing(sections, new Date())`로 순수 브리핑을 만들고 `<PipelineBriefing>`에 넘긴다. `dynamic = "force-dynamic"`(`:15`)이라 매 요청 보드를 다시 읽는 투영이다.
- `ui/pipeline-page.tsx:21-30` `PipelineBriefing`은 `BriefingHeader`·`InboxZone`·`TeamZone`·`FeedZone`을 단일 컬럼(`max-w-2xl`)으로 쌓는다.
  - `TeamZone`(`:121-143`)은 팀을 **알약(pill) 칩**으로 나열한다 — `AgentAvatar`(작은 원) + `handle` + `state` 텍스트. 캐릭터도, 책상도, 공간도 없다.
  - `InboxZone`(`:61-119`)은 결재함(`SectionLabel "결재함"`) 아래 `InboxCard`를 쌓는다. 카드는 `stamp-soft` 배경·`stamp/40` 테두리에 `AgentAvatar`+발화+`근거 보기` `<details>`.
  - `FeedZone`(`:145-183`)은 보고를 `<details>` 피드로 접어 렌더한다.
- `ui/agent-avatar.tsx:10-30` `AgentAvatar`는 `identityFor(agentId).emoji`(없으면 `initialOf`)를 회색 원 안에 그린다. 이모지 아바타이고 SVG 캐릭터가 아니다. `agents.ts:6`의 `emoji` 필드가 이 아바타의 소스다("추후 일러스트 교체" 주석).
- `pipeline/briefing.ts`의 순수 계층:
  - `TeamMember` 타입은 `{ identity, state, tone }`뿐이다(`:16`). **들고 있는 항목 ID는 별도 필드가 아니라 `state` 문자열 안에 박혀 있다.**
  - `teamState`(`:151-176`)가 그 문자열을 만든다: 검토대기면 `` `${review.id} 검토 요청 중` ``(`:164`), 작업 중이면 `` `${working.id} 작업 중` ``(`:169`), 보류면 `` `${held.id} 보류` ``(`:171`), 완료면 `` `최근 ${done.id} 완료` ``(`:174`), 없으면 `"대기 중"`(`:175`). pm은 `` `${pending}건 결재 요청 중` `` 또는 `"새 선정 없음"`(`:155-160`).
  - `tone`은 5종: `"pending" | "active" | "done" | "hold" | "muted"`(`:4`). `buildBriefing`(`:190-193`)이 `ROSTER_ORDER`대로 팀을 만든다.
- 원격 명령(쓰기 경로, admin의 유일한 외부 쓰기):
  - `pipeline/command-action.ts`의 `postPipelineCommand()`는 **인자를 받지 않는다**(`:18`). 본문은 파일 상단 `COMMAND_BODY` 상수 하나로 하드코딩돼 있고(`:15-16`), 그 문자열을 그대로 이슈 #87에 POST한다(`:37`).
  - `requireAdmin()`을 `try` 밖에서 먼저 부른다(`:21`, 주석: catch가 `NEXT_REDIRECT`를 삼키지 않게).
  - webhook 계약(`:11-13` 주석): 루틴은 (a) 이슈 #87 (b) 작성자가 소유자 (c) `"[claude]"`로 시작하지 않음 — 세 조건으로 명령을 고른다. 그래서 본문은 `"[claude]"`로 시작하면 안 된다.
  - `ui/pipeline-command.tsx:9-28` `PipelineCommandButton`은 인자 없이 `postPipelineCommand()`를 부르고(`:14`) `useTransition`+토스트로 상태를 낸다. `BriefingHeader`(`pipeline-page.tsx:56`)에 하나만 놓여 있다.
- 색·서체(`styles/globals.css`): `--stamp`(`:85`, 오커) `--stamp-soft`(`:86`) `--active`(`:87`, 청) `--silence`(`:88`, 회) `--hold`(`:89`, 주황) `--briefing`(`:90`, 웜 오프화이트)은 FEAT-04 브리핑 전용 토큰이고, `--font-briefing-display`(`:11-12`, Gowun Batang 계열 세리프)가 디스플레이 서체다. `@theme inline`(`:36-41`)에 `--color-stamp` 등이 등록돼 있어 Tailwind `text-*`가 나온다(`fill-*`도 같은 소스에서 생성됨).
- 타입: `tsconfig.json:12` `noUncheckedIndexedAccess: true`. 인덱스 시그니처/`Record<string, …>` 접근은 `… | undefined`가 된다. **유한 유니온 키(`Record<Tone, …>` 등)를 정확한 유니온 타입 값으로 접근하면 `undefined`가 붙지 않는다**(속성 접근이므로).

## 디자인 방향

_(admin-dev 역할의 UI 규칙에 따라 frontend-design 2-pass로 도출. 게이트 판단 근거.)_

**연속성 원칙 — FEAT-04를 리셋하지 않는다.** 이 화면은 FEAT-04 브리핑의 재작성이 아니라 같은 은유(사무실·결재)의 공간화다. 팔레트·서체·시맨틱 토큰을 그대로 물려받는다. 백로그 요구("기존 FEAT-04 토큰과의 연속성")가 이 축을 고정한다.

- **색 토큰 (신규 색 없음, 전부 FEAT-04 재사용).** 지면=`--briefing`(웜 오프화이트, 사무실의 공기), 잉크=`--foreground`(캐릭터 외곽선·본문), 중립=`--muted`/`--border`(책상 표면·유휴 도형). 상태 강조는 브리핑 시맨틱 토큰을 그대로: 결재/검토 대기=`--stamp`(오커), 작업 중=`--active`(청), 완료=`--silence`(침묵 회색), 보류=`--hold`(주황), 유휴=색 없음(`fill-none`, 텅 빈 도형).
  - **시그니처 규칙: 색=상태, 형태=역할.** 이 팔레트는 의도적으로 무채색에 가깝고(유채색은 `destructive`·`picked`·브리핑 4토큰뿐) 그 4개 강조 색은 *상태*가 이미 다 쓴다. 따라서 역할을 색으로 구분할 여지가 없다 — 역할은 **소품 실루엣**(서류철·노트북·돋보기·나침반)이 나르고, 색은 오직 상태를 나른다. 이건 팔레트 제약에서 강제로 도출된 선택이지 템플릿이 아니다.
- **타이포 역할 (신규 서체 없음, FEAT-04 재사용).** 디스플레이=`font-briefing-display`(Gowun Batang 세리프) — 섹션 라벨·"당신의 책상"·날짜. 본문/UI=`font-sans`(Pretendard/시스템) — 상태 문구·항목 ID 칩·버튼. 유틸=`font-sans` `text-sm tracking-widest`(기존 `SectionLabel` 패턴, `pipeline-page.tsx:32-38`). 세리프 디스플레이를 웜 지면에 얹는, 이미 기억에 남는 처리를 확장한다.
  - **기기 현실(구현 밖 전제):** FEAT-04 결과에 기록된 대로 Gowun Batang은 데스크톱(바탕 폴백)에서만 온전하고 폰에선 고딕으로 폴백된다. 이 계획은 그 전제를 바꾸지 않는다.
- **레이아웃 개념 — 사무실을 세로로 쌓은 단일 컬럼(모바일 우선, 가로 스크롤 없음).**
  ```
  ┌──────────────────────────────┐
  │ 파이프라인 브리핑   [파이프라인 실행] │  헤더: 날짜·결정 대기 수·전역 명령
  │ 8월 15일 · 결정 대기 3건          │
  ├──────────────────────────────┤
  │ 당신의 책상                     │  최상단(최고 위계). 결재 서류가 책상 위에.
  │ ┌───[서류 스택 SVG]  결재 3건──┐ │  inbox>0일 때 서류 모티프
  │ │  PM · FEAT-06 …             │ │  각 결재 항목 = 서류 카드(기존 InboxCard)
  │ └────────────────────────────┘ │
  ├──────────────────────────────┤
  │ 사무실                         │  에이전트 책상을 세로로 쌓음
  │ ┌────────────────────────────┐ │  각 책상: 캐릭터 SVG + 이름/역할
  │ │  (◠)   PM · 선정·발주        │ │        + 상태 + 항목 ID 칩 + 명령 버튼
  │ │  ╱▤╲   2건 결재 요청 중       │ │  책상 표면선이 도형 아래를 가름
  │ │ ═════  [FEAT-06] [선정 실행]  │ │
  │ ├────────────────────────────┤ │
  │ │  (◠)   admin-dev · 어드민 개발 │ │  작업 포즈·노트북·버튼 없음
  │ │  ╱▭╲   작업 중   [FEAT-06]    │ │  (dev 책상엔 안전한 명령이 없음)
  │ │ ═════                       │ │
  │ └────────────────────────────┘ │  … web-dev, doc-auditor, feature-scout
  ├──────────────────────────────┤
  │ 보고 (접힘 feed)                │  FEAT-04 피드 유지
  └──────────────────────────────┘
  ```
  - 히어로(thesis)는 **"당신의 책상"**이다 — 파이프라인 전체의 목적은 소유자의 결정이고 에이전트는 그 결정을 기다린다. FEAT-04의 "결정 대기 최우선" 위계를 공간(최상단 + 서류 오브젝트)으로 옮긴다.
  - 구조 장치는 번호(01/02/03)가 **아니다** — 내용은 순서열이 아니다. 구조를 encode하는 것은 *공간 위치 + 자세*다: 당신의 책상이 위(권한), 에이전트가 아래(책상), 자세가 상태. 책상 표면선(도형 아래 수평 규칙)이 "이건 작업 자리"를 뜻하는 유일한 구분자다.
- **시그니처 요소 — 자세가 상태인 착석 도형(posture-as-status).** 플랫 기하 캐릭터의 **팔 각도와 단일 강조 채움색**이 보드 tone에서 결정적으로 도출된다: 결재 대기면 서류를 들어올리고(요청), 작업 중이면 노트북 쪽으로 기울고, 유휴면 팔을 내리고, 보류면 팔짱. 소품 실루엣이 역할을, 채움색이 상태를 나른다. 이 하나에만 대담함을 쓰고 나머지는 FEAT-04의 절제를 유지한다.
- **모션.** v1은 상시 애니메이션 없음(백로그 제약). 허용: 팔 그룹의 `transition-transform`(재렌더 시 포즈가 부드럽게), 버튼·`<details>` hover/focus. keyframe 루프 없음. 포즈는 렌더 시점에 보드 상태에서 나오므로 사실상 런타임 모션이 없다 — "배치가 정보를 나르고 모션은 이벤트에만"과 일치.
- **접근성 바닥.** 색만으로 상태를 전하지 않는다 — 상태 문구 텍스트가 옆에 있으므로 캐릭터 SVG는 `aria-hidden`(장식). 키보드 포커스는 버튼/`<details>` 기본을 유지, `prefers-reduced-motion`은 transition만이라 무해.

## 문제

백로그 `source`(요구 원천)가 지목한 것: FEAT-04의 목록형 브리핑은 정보는 정확하나 소유자 실사용에서 **직관성이 아쉽다**. 요구는 세 층 — (1) 플랫 SVG 캐릭터(코드 드로잉, 상태별 포즈), (2) 페이지를 사무실 은유로 공간화(당신의 책상 → 에이전트 책상 세로 스택 → 보고 피드), (3) 책상별 원격 명령(서버 화이트리스트 enum, 게이트 전이 금지).

현재 코드에서 그 세 층이 비어 있음을 확인했다:
- 캐릭터: `agent-avatar.tsx:18-29`는 이모지 원뿐. 기하 도형 사람 형태도 역할 소품도 상태별 포즈도 없다.
- 공간: `pipeline-page.tsx:121-143` `TeamZone`은 평평한 알약 칩. 책상도, "당신의 책상 → 사무실" 위계도, 들고 있는 항목의 공간 앵커도 없다.
- 명령: `command-action.ts:15,18`은 전역 본문 하나·인자 없는 액션. 책상별 명령이 없고, 명령을 화이트리스트로 강제하는 구조도 없다(지금은 본문이 단일 상수라 우연히 안전할 뿐, 확장하면 임의 문자열 경로가 생기기 쉽다).

이 계획은 그 세 층을 **보드 상태에서 결정적으로 도출**하는 렌더 계층으로 채운다 — 자체 상태 저장·LLM 생성 없음(투영 원칙). 발화·브리핑의 순수 계층(`briefing.ts`)은 재사용하고, 그 위 렌더 계층에서만 공간 배치를 한다. 단 "들고 있는 항목 ID"는 *공간 배치*가 아니라 *보드에서 파생되는 데이터*이므로 순수 계층(`teamState`)에 `heldId` 필드로 구조화해 노출한다(테스트 가능한 파생으로 남긴다).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/ui/agent-character.tsx` `(신규)` | 플랫 기하 SVG 캐릭터. `agentId`→역할 소품, `tone`→포즈(팔 각도)+상태 채움색. AgentAvatar 계열 교체점(일러스트 교체 대비 단일 컴포넌트) |
| `src/pipeline/commands.ts` `(신규, 순수)` | **명령 화이트리스트(보안 경계).** `PipelineCommandKey` 유니온 + key→본문 맵 + `resolvePipelineCommand(key): string \| null`. 서버가 게시할 수 있는 유일한 본문 집합 |
| `src/pipeline/desk-commands.ts` `(신규, 순수, 클라 안전)` | 책상(agentId)→`{ key, label }` 매핑. `deskCommandFor(agentId)`. 본문 없음(라벨·키만, 클라 노출 안전). 안전한 명령 없는 책상은 `null` |
| `src/pipeline/command-action.ts` `(수정)` | `postPipelineCommand(command: PipelineCommandKey)` — 화이트리스트로 본문 해석, 밖이면 거부. `COMMAND_BODY` 상수 제거 |
| `src/ui/pipeline-command.tsx` `(수정)` | `PipelineCommandButton`이 `command`+`label` prop을 받아 `postPipelineCommand(command)` 호출 |
| `src/pipeline/briefing.ts` `(수정)` | `TeamMember`에 `heldId: string \| null` 추가, `teamState`가 `state`에서 ID를 분리(칩으로 이동) |
| `src/ui/pipeline-page.tsx` `(수정)` | `TeamZone`→`OfficeZone`(책상 세로 스택: 캐릭터+이름+상태+ID 칩+명령 버튼). 당신의 책상 리프레임(서류 모티프). 헤더 전역 버튼에 prop 전달 |
| `src/pipeline/commands.test.mjs` `(신규)` | 화이트리스트 계약 검증 |
| `src/pipeline/desk-commands.test.mjs` `(신규)` | 책상→명령 매핑 검증 |
| `src/pipeline/briefing.test.mjs` `(수정)` | `state` 문자열 변경 + `heldId` 단언 추가 |

여기 없는 파일은 고치지 않는다. `agents.ts`·`board.ts`·`queries.ts`·`github.ts`·`auth/**`·`middleware.ts`는 건드리지 않는다(인가 3중 방어선·보드 파서·계약은 변경 불필요).

## 구현 스케치

### 1) `src/pipeline/commands.ts` (신규) — 명령 화이트리스트

이 파일이 **책상별 명령 보안 설계의 핵심**이다. 클라이언트는 key만 고르고, 게시되는 본문은 오직 여기서 나온다. `resolvePipelineCommand`가 런타임 멤버십을 검사하므로, 변조된 클라이언트가 유니온 밖 문자열을 보내도 `null`로 거부돼 임의 문자열이 코멘트로 나가는 경로가 없다.

```ts
// 순수. board.ts/reporting.ts와 같은 이유로 DB·fetch 없음(commands.test.mjs로 덮인다).
// 여기가 보안 경계다: 서버가 이슈 #87에 게시할 수 있는 본문의 유일한 출처.
export type PipelineCommandKey =
  | "pipeline-run"
  | "pm-select"
  | "audit-run"
  | "scout-run";

// 모든 본문 불변식: (1) "[claude]"로 시작하지 않는다(webhook 계약, command-action 주석).
// (2) 게이트 전이(계획지시·구현승인)를 지시하지 않는다 — 아래 문구를 포함한다.
const GATE_GUARD =
  "게이트 전이(계획지시·구현승인)는 사용자 몫이므로 status를 바꾸지 마세요.";

const PIPELINE_COMMANDS: Record<PipelineCommandKey, string> = {
  // 기존 전역 명령. FEAT-04 command-action.ts:15-16의 COMMAND_BODY를 **그대로** 옮긴다.
  "pipeline-run":
    "파이프라인을 진행해 주세요. PROJECT_BOARD.md의 각 항목을 현재 status와 런북 규칙대로 처리하되, 게이트 전이(계획지시·구현승인)는 사용자 몫이므로 바꾸지 마세요.",
  "pm-select": `pm으로서 TASK_BACKLOG.md에서 오늘 처리할 1~2건을 선정해 PROJECT_BOARD.md에 승인대기로 기록해 주세요. ${GATE_GUARD}`,
  "audit-run": `doc-auditor로서 문서와 코드의 정합성을 감사하고 결과만 보고해 주세요(코드·보드 수정 없음). ${GATE_GUARD}`,
  "scout-run": `feature-scout로서 개선 기회를 조사해 TASK_BACKLOG.md에 제안만 추가해 주세요(보드·계획서 수정 없음). ${GATE_GUARD}`,
};

export function resolvePipelineCommand(key: string): string | null {
  // Object.hasOwn: 프로토타입 오염 키("__proto__" 등)까지 막는 런타임 멤버십 검사.
  return Object.hasOwn(PIPELINE_COMMANDS, key)
    ? PIPELINE_COMMANDS[key as PipelineCommandKey]
    : null;
}
```

- `noUncheckedIndexedAccess`: `PIPELINE_COMMANDS`는 `Record<PipelineCommandKey, string>`(유한 유니온 키)이므로 `[key as PipelineCommandKey]` 접근은 `string`을 돌려준다(`undefined` 안 붙음). `Object.hasOwn` 검사가 런타임 안전을 담당한다.
- 새 본문 3개(`pm-select`·`audit-run`·`scout-run`)는 **새 리터럴**이다 — 사용자가 게이트에서 문구를 판단할 대상. `pipeline-run`은 검증된 기존 본문을 글자 그대로 보존한다.

### 2) `src/pipeline/desk-commands.ts` (신규) — 책상→명령 매핑

```ts
import type { PipelineCommandKey } from "./commands";

export type DeskCommand = { key: PipelineCommandKey; label: string };

// 안전한 명령이 있는 책상만 등재. dev(admin-dev·web-dev)는 없음 — 「대안」 참고.
const DESK_COMMANDS: Record<string, DeskCommand> = {
  pm: { key: "pm-select", label: "선정 실행" },
  "doc-auditor": { key: "audit-run", label: "감사 실행" },
  "feature-scout": { key: "scout-run", label: "조사 실행" },
};

export function deskCommandFor(agentId: string): DeskCommand | null {
  return DESK_COMMANDS[agentId] ?? null; // Record<string,…>는 undefined 가능 → ?? null
}
```

- `import type`로 키 타입만 가져온다 — 런타임 임포트 없음. `command-registry`가 클라이언트 번들로 새지 않고, 본문도 여기 없어 클라이언트에 노출되지 않는다.

### 3) `src/pipeline/command-action.ts` (수정) — 화이트리스트 게이트

바뀌는 줄만(before는 적기 직전 재확인함):

```ts
// before (:6)
import { ISSUE_COMMENTS_URL } from "./github";
// after
import { ISSUE_COMMENTS_URL } from "./github";
import { resolvePipelineCommand, type PipelineCommandKey } from "./commands";
```

```ts
// before (:15-18) — COMMAND_BODY 상수 + 인자 없는 시그니처
const COMMAND_BODY = "파이프라인을 진행해 주세요. …바꾸지 마세요.";

export async function postPipelineCommand(): Promise<ActionResult<void>> {
  await requireAdmin();
// after — 상수 삭제, 인자로 key를 받고 화이트리스트로 본문 해석
export async function postPipelineCommand(
  command: PipelineCommandKey,
): Promise<ActionResult<void>> {
  // 목적지 인가는 그대로 try 밖·최상단(NEXT_REDIRECT를 catch가 삼키지 않게).
  await requireAdmin();

  // 화이트리스트 밖 key는 여기서 거부한다. 클라이언트는 key만 보내고 본문은 서버가 정한다.
  const body = resolvePipelineCommand(command);
  if (body === null) {
    return failure("Unknown command");
  }
```

```ts
// before (:37)
        body: JSON.stringify({ body: COMMAND_BODY }),
// after
        body: JSON.stringify({ body }),
```

나머지(토큰 확인·fetch 헤더·`res.ok` 분기·catch)는 그대로다. `requireAdmin()`이 여전히 최상단이라 미인증 호출은 key와 무관하게 거부된다 — 인가 경로는 건드리지 않는다.

### 4) `src/ui/pipeline-command.tsx` (수정) — prop 받는 버튼

바뀌는 줄:

```tsx
// before (:9-14, :24-27)
export function PipelineCommandButton() {
  const [isPending, startTransition] = useTransition();
  const handleClick = () => {
    startTransition(async () => {
      const result = await postPipelineCommand();
// after
import type { PipelineCommandKey } from "~/pipeline/commands"; // 타입만(런타임 임포트 없음)

export function PipelineCommandButton({
  command,
  label,
}: {
  command: PipelineCommandKey;
  label: string;
}) {
  const [isPending, startTransition] = useTransition();
  const handleClick = () => {
    startTransition(async () => {
      const result = await postPipelineCommand(command);
```

```tsx
// before (:26) — 하드코딩 라벨
      {isPending ? "요청 중..." : "파이프라인 실행"}
// after
      {isPending ? "요청 중..." : label}
```

토스트(`"실행 요청을 보냈습니다 (이슈 #87)"`, `toast.error(result.error)`)는 그대로. 버튼 크기는 책상용으로 작게 쓸 수 있게 `Button`의 `size="sm"`를 옵션으로 넘길 수 있으나, v1은 기본 크기 유지(스코프 최소화).

### 5) `src/pipeline/briefing.ts` (수정) — `heldId` 분리

`TeamMember`에 필드 추가(`:16`):

```ts
// before
export type TeamMember = { identity: AgentIdentity; state: string; tone: Tone };
// after
export type TeamMember = {
  identity: AgentIdentity;
  state: string;
  heldId: string | null; // 책상이 들고 있는 항목 ID(칩 표시용). 없으면 null
  tone: Tone;
};
```

`teamState` 반환 형태를 `{ state, heldId, tone }`로 바꾸고 **ID를 문자열에서 분리**(`:151-176`). 새 문자열은 짧아지고 ID는 `heldId`로 간다:

```ts
function teamState(
  agentId: string,
  items: DatedItem[],
): { state: string; heldId: string | null; tone: Tone } {
  if (agentId === "pm") {
    const pending = items.filter((it) => it.status === "승인대기").length;
    return pending > 0
      ? { state: `${pending}건 결재 요청 중`, heldId: null, tone: "pending" }
      : { state: "새 선정 없음", heldId: null, tone: "muted" };
  }
  const mine = items.filter((it) => it.agent === agentId);
  const review = mine.find((it) => it.status === "검토대기");
  if (review !== undefined)
    return { state: "검토 요청 중", heldId: review.id, tone: "pending" };
  const working = mine.find(
    (it) => it.status === "계획지시" || it.status === "구현승인",
  );
  if (working !== undefined)
    return { state: "작업 중", heldId: working.id, tone: "active" };
  const held = mine.find((it) => it.status === "보류");
  if (held !== undefined) return { state: "보류", heldId: held.id, tone: "hold" };
  const done = mine.find((it) => it.status === "완료");
  if (done !== undefined)
    return { state: "최근 완료", heldId: done.id, tone: "done" };
  return { state: "대기 중", heldId: null, tone: "muted" };
}
```

`buildBriefing`의 team map(`:190-193`)은 `{ identity, state, heldId, tone }`를 넘기게 한다:

```ts
// before
    const { state, tone } = teamState(id, items);
    return { identity: identityFor(id), state, tone };
// after
    const { state, heldId, tone } = teamState(id, items);
    return { identity: identityFor(id), state, heldId, tone };
```

- pm 문자열(`"2건 결재 요청 중"`·`"새 선정 없음"`)은 **그대로 유지**한다(ID를 원래 안 담았으므로). 나머지 4상태는 ID를 뗀다 — 이건 **사용자에게 보이는 문구 변경**이라 B단계에서 `결과:`에 명시 대상.

### 6) `src/ui/agent-character.tsx` (신규) — 자세가 상태인 SVG 캐릭터

**대기(idle) 포즈 기준 완성 코드**(계약). 포즈 변형은 회전각 테이블 + 소품 위치 테이블로 파라미터화한다. `viewBox 0 0 72 72`, 상반신만(다리는 책상 뒤로 생략) — 잉크 외곽선(`stroke=currentColor`=`text-foreground`) + 상태 채움색(`TONE_FILL[tone]`).

```tsx
import { cn } from "~/lib/utils";
import type { Tone } from "~/pipeline/briefing";

type Pose = "idle" | "work" | "request" | "done" | "hold";
type Role = "pm" | "dev" | "auditor" | "scout" | "generic";

const POSE_FOR_TONE: Record<Tone, Pose> = {
  muted: "idle",
  active: "work",
  pending: "request", // 결재/검토 대기 = 서류를 들어올린 "요청" 자세
  done: "done",
  hold: "hold",
};

// 색=상태. 유휴는 채움 없음(텅 빈 도형 = 아무 일 없음).
const TONE_FILL: Record<Tone, string> = {
  pending: "fill-stamp",
  active: "fill-active",
  done: "fill-silence",
  hold: "fill-hold",
  muted: "fill-none",
};

// 팔 각도가 곧 자세다. 오른팔=소품 팔(어깨 46,31), 왼팔(어깨 26,31).
const RIGHT_ARM_DEG: Record<Pose, number> = {
  idle: 10,
  work: -30,
  request: -62,
  done: 16,
  hold: -96, // 팔짱: 가슴 앞 가로
};
const LEFT_ARM_DEG: Record<Pose, number> = {
  idle: -10,
  work: -6,
  request: -8,
  done: -10,
  hold: 96, // 팔짱
};
// 소품은 팔과 분리해 배치(포즈별 손 위치). 회전과 무관하게 항상 정립.
const PROP_AT: Record<Pose, { x: number; y: number }> = {
  idle: { x: 50, y: 50 },
  work: { x: 39, y: 52 }, // 앞으로, 낮게(작업)
  request: { x: 52, y: 27 }, // 들어올림(요청)
  done: { x: 50, y: 54 }, // 책상 위 내려놓음
  hold: { x: 39, y: 50 }, // 옆에 치워둠
};

function roleForAgent(agentId: string): Role {
  switch (agentId) {
    case "pm":
      return "pm";
    case "admin-dev":
    case "web-dev":
      return "dev";
    case "doc-auditor":
      return "auditor";
    case "feature-scout":
      return "scout";
    default:
      return "generic";
  }
}

// 소품(로컬 원점 기준 ~12px). 역할 실루엣이 역할을 나른다.
function RoleProp({ role }: { role: Role }) {
  switch (role) {
    case "pm": // 서류철
      return (
        <>
          <rect
            x={-6}
            y={-5}
            width={12}
            height={10}
            rx={1.5}
            className="fill-card"
          />
          <line x1={-3} y1={-1} x2={3} y2={-1} />
          <line x1={-3} y1={2} x2={2} y2={2} />
        </>
      );
    case "dev": // 노트북
      return (
        <>
          <rect
            x={-6}
            y={-5}
            width={12}
            height={8}
            rx={1}
            className="fill-card"
          />
          <path d="M-7 3 L7 3 L5 5 L-5 5 Z" className="fill-card" />
        </>
      );
    case "auditor": // 돋보기
      return (
        <>
          <circle cx={-1} cy={-1} r={4} className="fill-card" />
          <line x1={2} y1={2} x2={6} y2={6} />
        </>
      );
    case "scout": // 나침반
      return (
        <>
          <circle cx={0} cy={0} r={5} className="fill-card" />
          <path d="M0 -4 L2 0 L0 4 L-2 0 Z" className="fill-foreground" />
        </>
      );
    case "generic":
      return null;
  }
}

export function AgentCharacter({
  agentId,
  tone,
  className,
}: {
  agentId: string;
  tone: Tone;
  className?: string;
}) {
  const role = roleForAgent(agentId);
  const pose = POSE_FOR_TONE[tone];
  const prop = PROP_AT[pose];
  return (
    <svg
      viewBox="0 0 72 72"
      aria-hidden="true"
      className={cn("text-foreground", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* 머리 */}
      <circle cx={36} cy={15} r={8} className="fill-card" />
      {/* 몸통(자세 무관). 채움 = 상태색 */}
      <path
        d="M24 30 Q24 27 27 27 L45 27 Q48 27 48 30 L50 58 L22 58 Z"
        className={cn(TONE_FILL[tone])}
      />
      {/* 왼팔 */}
      <g
        transform={`rotate(${LEFT_ARM_DEG[pose]} 26 31)`}
        className="transition-transform"
      >
        <line x1={26} y1={31} x2={22} y2={50} />
      </g>
      {/* 오른팔(소품 팔) */}
      <g
        transform={`rotate(${RIGHT_ARM_DEG[pose]} 46 31)`}
        className="transition-transform"
      >
        <line x1={46} y1={31} x2={50} y2={50} />
      </g>
      {/* 소품: 팔과 분리, 포즈별 손 위치에 정립 */}
      <g transform={`translate(${prop.x} ${prop.y})`}>
        <RoleProp role={role} />
      </g>
    </svg>
  );
}
```

- **포즈 변형 방식(계약):** 몸통·머리는 고정, `RIGHT_ARM_DEG`/`LEFT_ARM_DEG`가 팔 각도를 tone별로 준다(팔이 자세를 만든다). 소품은 팔 그룹과 분리해 `PROP_AT`의 포즈별 손 위치에 정립 배치 — 회전 소품이 기울어져 읽기 어려워지는 것을 피한다. request에서 오른팔이 위로(-62°) 돌고 소품도 위(52,27)로 가 "서류를 들어올림"이 함께 읽힌다. hold는 양팔이 가슴 앞으로 교차(±96°).
- **교체점:** 이 컴포넌트 하나가 `agentId`→그림 매핑을 담는다. 추후 일러스트 파일 교체 = 이 컴포넌트 본문만 `<img>`로 교체(호출부 불변). `agents.ts`의 `emoji`(작은 아바타용)는 그대로 두고, 책상은 `AgentCharacter`를 쓴다.
- `noUncheckedIndexedAccess`: `POSE_FOR_TONE`·`TONE_FILL`·`RIGHT_ARM_DEG`·`LEFT_ARM_DEG`·`PROP_AT`는 전부 `Record<Tone|Pose, …>`(유한 유니온), 정확한 유니온 키로 접근 → `undefined` 안 붙음. `RoleProp` switch는 5역할 전부 커버(exhaustive).
- **Tailwind `fill-*` 가정:** `--color-stamp`/`active`/`silence`/`hold`/`muted`가 `@theme inline`에 등록돼 `fill-stamp` 등이 생성된다고 본다. 시각 결과(잉크 외곽선 + 상태 채움)는 Node 러너로 못 덮는다 — 배포 후 확인 대상.

### 7) `src/ui/pipeline-page.tsx` (수정) — `OfficeZone` + 당신의 책상

`TeamZone`(`:121-143`)을 `OfficeZone`으로 교체한다. 알약 칩 대신 **책상 카드를 세로로 쌓는다**. 각 카드는 캐릭터(`AgentCharacter`) + 이름/역할 + 상태 문구 + `heldId` 칩(있으면) + 명령 버튼(`deskCommandFor` 있으면). 마크업은 기존 카드 패턴(`InboxCard` `:86-118`의 `rounded-2xl border bg-card`, `TONE_TEXT` 맵 `:13-19`)을 따른다. 구조 요점:

```tsx
import { AgentCharacter } from "~/ui/agent-character";
import { deskCommandFor } from "~/pipeline/desk-commands";

function OfficeZone({ team }: { team: TeamMember[] }) {
  return (
    <section className="flex flex-col gap-3">
      <SectionLabel>사무실</SectionLabel>
      <div className="flex flex-col gap-3">
        {team.map((member) => (
          <OfficeDesk key={member.identity.id} member={member} />
        ))}
      </div>
    </section>
  );
}

function OfficeDesk({ member }: { member: TeamMember }) {
  const cmd = deskCommandFor(member.identity.id);
  return (
    <article className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <AgentCharacter
          agentId={member.identity.id}
          tone={member.tone}
          className="size-14 shrink-0"
        />
        <div className="flex-1">
          <p className="text-sm">
            <span className="font-briefing-display text-foreground">
              {member.identity.handle}
            </span>{" "}
            · <span className="text-muted-foreground">{member.identity.role}</span>
          </p>
          <p className={cn("mt-1 text-sm", TONE_TEXT[member.tone])}>
            {member.state}
          </p>
          {member.heldId && (
            <span className="mt-2 inline-block rounded border border-border px-1.5 text-xs text-muted-foreground">
              {member.heldId}
            </span>
          )}
        </div>
        {cmd && (
          <PipelineCommandButton command={cmd.key} label={cmd.label} />
        )}
      </div>
      {/* 책상 표면선: 도형 아래를 가르는 유일한 구분자 */}
      <div className="mt-3 h-px bg-border" />
    </article>
  );
}
```

당신의 책상(`InboxZone` `:61-83`)은 라벨을 `"당신의 책상"`으로 바꾸고 서류 모티프를 얹는다(기존 `InboxCard` 재사용, 배경/색 토큰 유지). 서류 스택은 작은 인라인 SVG(겹친 사각형 2~3장, `stroke=currentColor`, `fill-card`)로 섹션 헤더 옆에 둔다 — 상세 마크업은 `InboxZone` 헤더에 `<DocumentsMark />`를 추가하는 정도(장식, `aria-hidden`). 결재 카드 본문은 FEAT-04 그대로 유지(검증된 것). 헤더 전역 버튼(`:56`)은:

```tsx
// before
        <PipelineCommandButton />
// after
        <PipelineCommandButton command="pipeline-run" label="파이프라인 실행" />
```

- 시그니처(캐릭터)에 대담함을 쓰고 당신의 책상·피드는 조용히 유지(절제). 모바일 단일 컬럼·가로 스크롤 없음은 `max-w-2xl` 단일 컬럼 유지로 보장.

## 테스트

- **덮는 것 (순수 함수, `*.test.mjs`):**
  - `commands.test.mjs` (신규):
    - `resolvePipelineCommand("pipeline-run")`가 기존 COMMAND_BODY와 **글자 그대로** 같다(검증된 전역 명령이 드리프트하지 않음).
    - 4개 key 전부 비어 있지 않은 문자열을 돌려준다.
    - 알 수 없는 key(`"arbitrary"`, `"__proto__"`, `"toString"`)는 `null`(프로토타입 오염 포함 화이트리스트 밖 거부).
    - 모든 본문이 `"[claude]"`로 시작하지 **않는다**(webhook 계약).
    - 모든 본문이 `"게이트 전이(계획지시·구현승인)는 사용자 몫"`을 포함한다(게이트 전이 금지 불변식).
  - `desk-commands.test.mjs` (신규):
    - `deskCommandFor("pm")` = `{ key:"pm-select", label:"선정 실행" }`, `"doc-auditor"`→audit-run/감사 실행, `"feature-scout"`→scout-run/조사 실행.
    - `deskCommandFor("admin-dev")`·`deskCommandFor("web-dev")`·`deskCommandFor("unknown")` = `null`(dev·미지 책상 버튼 없음).
    - 교차 검증: 모든 `DESK_COMMANDS`의 `key`가 `resolvePipelineCommand`로 non-null(라벨이 실제 화이트리스트 키에 붙어 있음 — 두 모듈 드리프트 방지).
  - `briefing.test.mjs` (수정): `state` 문자열 변경 + `heldId` 단언.
    - `:198` `admin-dev` `state` `"FEAT-04 검토 요청 중"`→`"검토 요청 중"`, `heldId` `"FEAT-04"` 추가.
    - `:201` `web-dev` `state` `"FEAT-07 작업 중"`→`"작업 중"`, `heldId` `"FEAT-07"`.
    - `:204-206` `doc-auditor`·`feature-scout` `state` `"대기 중"` 유지 + `heldId` `null`.
    - `:143`·`:195` pm `state` `"2건 결재 요청 중"` 유지 + `heldId` `null`.
    - 기존 inbox/feed/dedupe/roster-order 단언은 그대로 통과(TeamMember 필드 추가는 비파괴).
- **못 덮는 범위 (Node 러너·DOM/외부 I/O 없음):**
  - `AgentCharacter` SVG 렌더·포즈 기하(팔 각도·소품 위치)·`fill-*`/`stroke=currentColor` 시각 결과·상태별 채움색.
  - `OfficeZone`/`OfficeDesk` 레이아웃, 당신의 책상 서류 모티프, 모바일 단일 컬럼·가로 스크롤 없음, `transition-transform`.
  - `PipelineCommandButton`의 `useTransition`·토스트·클릭.
  - `postPipelineCommand`의 `requireAdmin()` 게이트, GitHub POST, `res.ok` 분기(서버 액션·외부 I/O).
  - 배포 후 데스크톱+폰 수동 확인 대상.

## 범위 밖 의존

없음. 전부 `apps/admin/src/**` 안이다. `@repo/db`·다른 워크스페이스·DB 스키마를 건드리지 않는다. DB 접근은 추가되지 않는다(읽기 전용 유지). 외부 쓰기는 기존 이슈 #87 코멘트 경로 하나를 재사용할 뿐 **늘리지 않는다** — 책상별 명령도 같은 `ISSUE_COMMENTS_URL`로 가고, 본문만 화이트리스트에서 달라진다. `requireAdmin()` 뒤·되돌릴 수 있음·기록 남음이라는 기존 성격을 유지한다(CLAUDE.md의 "외부 쓰기는 하나뿐" 성격 불변). CSP도 무관하다 — GitHub 호출은 서버 측(서버 액션)이라 브라우저 `connect-src`에 걸리지 않는다.

## 대안

- **dev 책상에도 명령 버튼을 둔다** — `"작업 실행"`(admin-dev·web-dev로서 배정 항목을 현재 status대로 처리, 게이트 불변). 논리상 안전하지만(작업은 사용자 게이트 뒤에 일어나므로 전이가 아님) 전역 `"파이프라인 실행"`과 의미가 겹치고, "시작"처럼 읽혀 사용자가 게이트 결정 전인 항목을 착수시킨다고 오해할 여지가 있다. **채택 안 함** — dev 책상은 버튼 없음(백로그 "안전한 명령이 없는 책상은 버튼 없음"). 원하면 게이트에서 이 대안으로 전환 가능(키·라벨·본문 추가 + `DESK_COMMANDS`에 두 dev 등재).
- **`heldId`를 추가하지 않고 기존 `state`의 박힌 ID를 그대로 쓴다** — briefing.ts·테스트 변경이 없어 스코프가 작다. 하지만 책상의 ID 앵커가 상태 문구에 섞여 스캔성이 떨어지고, 백로그가 명시한 "들고 있는 항목ID 표시"를 별도 데이터로 구조화하지 못한다. **채택 안 함** — 파생을 순수 계층에 두는 편이 테스트 가능성·재사용에서 낫다. 스코프를 줄이려면 게이트에서 이 대안 선택 가능.
- **`AgentAvatar`를 확장해 SVG를 넣는다**(신규 컴포넌트 대신) — 교체점을 한 곳에 모을 수 있으나, 작은 이모지 아바타(inbox/feed 행)와 큰 착석 캐릭터(책상)는 크기·역할이 달라 한 컴포넌트에 넣으면 분기가 복잡해진다. **채택 안 함** — `AgentAvatar`(컴팩트 행)는 그대로, `AgentCharacter`(책상)를 별도로. 둘 다 `agentId` 단일 진입점이라 교체점은 유지된다.
