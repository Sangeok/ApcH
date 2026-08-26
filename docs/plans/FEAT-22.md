# FEAT-22: 파이프라인 보드 읽기의 최대 5분 지연 제거 — raw CDN을 contents API로 교체

agent: admin-dev

## 현재 동작

- `getPipelineBoard()`는 `fetch(BOARD_RAW_URL, { cache: "no-store" })`로 보드를 읽고, non-OK면 throw, 아니면 `parseBoard(await res.text())`를 돌려준다 (`src/fsd/entities/pipeline/api/queries.ts:8-12`).
- `BOARD_RAW_URL`은 `https://raw.githubusercontent.com/Sangeok/ApcH/dev/PROJECT_BOARD.md`다 (`src/fsd/entities/pipeline/config/github.ts:7`). 이 파일은 `env`를 import하지 않는다 (`queries.ts:1-4`).
- `cache: "no-store"`는 **Next 데이터 캐시**만 끈다. raw.githubusercontent.com의 **엣지 CDN 캐시(max-age=300)**는 클라이언트 캐시 모드와 무관하게 낡은 본문을 준다 — 이 max-age=300은 FEAT-10 3라운드에서 실측된 외부 사실이다 (`PROJECT_BOARD.md`의 FEAT-10 근거 줄 "raw CDN `max-age=300`(실측)"; 코드 밖 관측이라 `파일:줄` 근거 없음).
- `getPipelineBoard()`는 매 요청 서버 컴포넌트에서 호출된다 — `/pipeline` (`src/app/(protected)/pipeline/page.tsx:20`)과 문서 뷰어 (`src/app/(protected)/pipeline/docs/[...slug]/page.tsx:31`). 시그니처는 `Promise<BoardSection[]>`다 (`queries.ts:6`).
- 보드 status는 실행 콘솔 라벨/설명을 결정한다: `describePipelineRun(items)`가 `briefing.ts:282`에서 불리고 (`run-plan.ts:20`), 실행할 항목이 없고 게이트 대기 항목만 있을 때 설명이 `"결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다. 방금 찍었다면 보드 반영까지 최대 5분 걸립니다."`다 (`run-plan.ts:44`).
- 게이트 도장·반려 성공 시 카드 버튼은 잠금 칩으로 대체된다: `GATE_LOCK_LABEL = "도장 찍음 · 보드 반영 대기"` (`transitions.ts:167`), `rejectLockLabel(action)`는 `"${낱말} · 보드 반영 대기"` (`transitions.ts:176`). 도장 버튼이 `setLock` 후 `router.refresh()`를 부르고 (`gate-transition-button.tsx:42-43`), 반려 패널도 같다 (`reject-actions.tsx:53-56`). 칩은 `lock.label`을 그대로 렌더한다 (`gate-card-lock.tsx:45`).
- 참고로 게이트 커밋 경로(`commitBoardEdit`)는 이미 raw가 아니라 contents API로 dev HEAD를 읽는다: `fetch(\`${BOARD_CONTENTS_URL}?ref=${BOARD_BRANCH}\`, ...)` → `Buffer.from(meta.content, "base64").toString("utf-8")` (`commit-gate-transition.ts:45-60`). 즉 **쓰기 경로는 이미 신선하고, 읽기 경로(투영)만 raw CDN이라 낡는다.**
- 앱 내 read owner 선례 둘이 이미 contents API를 인증과 함께 쓴다: 행위자 보고서 목록 (`agent-report/api/queries.ts:15-22`)과 계획서 목록 (`repo-doc/api/queries.ts:20-27`) — 둘 다 `env.GITHUB_PIPELINE_TOKEN`을 읽어 `token === undefined`면 `Authorization` 헤더를 뺀다.
- `GITHUB_PIPELINE_TOKEN`은 optional이다 (`env.js:45`). 주석은 "없으면 미인증(60/h)으로 시도하되 폴링(240/h)이 한도를 넘으면 pill이 unknown"이라 적는다 (`env.js:41`).
- `queries.ts`는 이미 승인된 fetch owner다 (`scripts/verify-fsd-boundaries.mjs:33`). fetch owner 집합은 6개다 (`verify-fsd-boundaries.mjs:32-39`).
- 지연 전제 문구는 프로덕션 코드에 **세 곳**이다(`반영` 전수 grep, 주석 제외): ① 실행 콘솔 게이트대기 설명 "…최대 5분 걸립니다"(`run-plan.ts:44`) ② 잠금 칩 "· 보드 반영 대기"(`transitions.ts:167`·`:176`) ③ 도장 성공 토스트 힌트 "보드에 반영되면 파이프라인 실행을 눌러 …"(`transitions.ts:24-25`, `gateNextActionHint`). 이 계획은 ①②만 고치고 ③은 유지한다 — 근거는 「대안」의 해당 절.

## 문제

백로그(`TASK_BACKLOG.md`의 FEAT-22 `source`)가 지목한 문제: 게이트 도장 직후에도 대시보드가 낡은 보드를 **최대 5분** 보여준다 — 전역 「파이프라인 실행」 버튼이 "진행할 작업 없음"으로 잠기고, 실제로는 아직 반영 전인데 "계획 지시 전인데 책상 버튼이 전부 활성"처럼 보인다. 진단은 코드로 확정된다: `queries.ts:8`이 raw CDN을 읽고, raw CDN 엣지 캐시(max-age=300)가 `cache: "no-store"`와 무관하게 낡은 본문을 준다. 쓰기 경로(`commit-gate-transition.ts:45`)는 이미 contents API로 신선하므로, **읽기 경로만 contents API로 바꾸면** 도장→반영 지연이 사라진다. 백로그가 지목한 문제와 코드에서 확인한 것이 일치한다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/entities/pipeline/api/queries.ts` | 토큰 있으면 contents API GET(base64 디코드), 없으면 raw CDN 폴백. shape/디코드 실패는 fail-closed(throw) |
| `src/fsd/entities/pipeline/api/queries.test.mjs` | `~/env` 모의 추가 후 두 분기(토큰 있음=contents API·토큰 없음=raw 폴백)와 shape fail-closed·non-OK를 덮도록 재작성 |
| `src/fsd/features/run-pipeline-command/model/run-plan.ts` | 게이트 대기 설명에서 "방금 찍었다면 보드 반영까지 최대 5분 걸립니다." 문장 제거(지연이 사라졌으므로) |
| `src/fsd/features/run-pipeline-command/model/run-plan.test.mjs` | `GATE_WAITING_DESC` 상수와 옛 문구를 인용하는 `it()` 제목을 새 문구로 갱신 |
| `src/fsd/features/transition-pipeline-gate/model/transitions.ts` | 잠금 칩 문구에서 "· 보드 반영 대기" 지연 전제 절 제거(칩 자체·재클릭 방지는 유지) |
| `src/fsd/features/transition-pipeline-gate/model/transitions.test.mjs` | `GATE_LOCK_LABEL`·`rejectLockLabel` 리터럴 단언과 옛 문구를 인용하는 `it()` 제목 둘을 새 문구로 갱신 |

`scripts/verify-fsd-boundaries.mjs`는 **고치지 않는다** — `queries.ts`는 이미 fetch owner라 owner 집합(6개)이 바뀌지 않는다(판단 지점 3, 아래 「대안」·「테스트」에 확인 근거).

## 구현 스케치

### 1) `src/fsd/entities/pipeline/api/queries.ts` — 전면 교체(현재 13줄)

before (`queries.ts:1-13`, 현재 전체):

```ts
import "server-only";

import { BOARD_RAW_URL } from "../config/github";
import { parseBoard, type BoardSection } from "../model/board";

export async function getPipelineBoard(): Promise<BoardSection[]> {
  // no-store: 투영은 매 요청 dev 브랜치 보드를 다시 읽는다(빌드 시점 고정 금지).
  const res = await fetch(BOARD_RAW_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch PROJECT_BOARD.md: ${res.status}`);
  }
  return parseBoard(await res.text());
}
```

after:

```ts
import "server-only";

import { env } from "~/env";
import {
  BOARD_BRANCH,
  BOARD_CONTENTS_URL,
  BOARD_RAW_URL,
} from "../config/github";
import { parseBoard, type BoardSection } from "../model/board";

// 투영(읽기)은 매 요청 dev HEAD를 다시 읽는다. no-store는 Next 데이터 캐시만 끈다 —
// raw CDN 엣지 캐시(max-age=300)는 그와 무관하게 낡은 본문을 줘서 도장 직후 최대 5분
// 지연이 생긴다(FEAT-22). 토큰이 있으면 contents API로 dev HEAD를 직접 읽어(쓰기 경로
// commit-gate-transition.ts:45와 동일 방식) 잔상을 없앤다. 토큰이 없으면 미인증 contents
// API(60/h)가 Vercel 공유 IP에서 남의 트래픽에 막힐 수 있어 raw CDN으로 폴백한다 —
// 폴백 시엔 다시 max-age=300 잔상이 생기지만, 프로덕션은 토큰이 설정돼 있어(env.js:37-45,
// 게이트 커밋에 필수) 이 폴백은 토큰 없는 배포(dev/preview)에서만 탄다.
export async function getPipelineBoard(): Promise<BoardSection[]> {
  const token = env.GITHUB_PIPELINE_TOKEN;

  if (token === undefined) {
    const res = await fetch(BOARD_RAW_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Failed to fetch PROJECT_BOARD.md: ${res.status}`);
    }
    return parseBoard(await res.text());
  }

  const res = await fetch(`${BOARD_CONTENTS_URL}?ref=${BOARD_BRANCH}`, {
    cache: "no-store",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch PROJECT_BOARD.md: ${res.status}`);
  }
  const meta = (await res.json()) as { content?: string };
  if (typeof meta.content !== "string") {
    throw new Error("Failed to read PROJECT_BOARD.md content");
  }
  const markdown = Buffer.from(meta.content, "base64").toString("utf-8");
  return parseBoard(markdown);
}
```

설계 근거(판단 지점 대응):

1. **토큰 부재 → raw CDN 폴백**(백로그 지시·판단 1). 미인증 contents API는 IP당 60/h인데 `getPipelineBoard`는 매 요청 no-store 읽기라 공유 IP에서 한도에 막힐 위험이 크다. 폴백은 CDN 캐시라 한도가 없다(대신 최대 5분 낡음). 프로덕션은 토큰이 필수라(게이트 커밋용, `env.js:37-45`) 실사용 경로는 항상 contents API다.
2. **shape/디코드 실패 → fail-closed(throw)**(판단 2). 현재 owner의 non-OK throw와 일관되며, 여기서 raw CDN으로 런타임 폴백하면 조용히 낡은 보드를 주게 되어 **이 항목이 없애려는 바로 그 버그를 되살린다.** contents API 200이지만 `content`가 없는 경우도 throw로 표면화한다. `encoding` 필드는 검사하지 않는다 — 쓰기 owner(`commit-gate-transition.ts:56-60`)도 검사하지 않고 보드는 1MB(contents `content` 상한) 훨씬 아래라 base64 표현이 항상 온다.
3. **contents-API 분기는 토큰이 확정 존재**(`token === undefined` 조기 반환 뒤 `string`으로 좁혀짐)라 agent-report/repo-doc와 달리 `Authorization`을 조건부가 아니라 무조건 붙인다. `Accept: application/vnd.github+json`만 두는 것은 read owner 선례(agent-report·repo-doc)를 따른 것이다(`X-GitHub-Api-Version`은 쓰기 owner만 붙이며 읽기에 불필요).
4. URL `${BOARD_CONTENTS_URL}?ref=${BOARD_BRANCH}`는 `commit-gate-transition.ts:45`와 동일 형태다. `entities`가 `~/env`를 import하는 것은 FSD 위반이 아니다(agent-report·repo-doc 두 owner가 이미 그렇게 하고 경계 검사를 통과한다).

### 2) `src/fsd/features/run-pipeline-command/model/run-plan.ts:44` — 지연 문장 제거(판단 4)

before (`run-plan.ts:43-44`):

```ts
      description: hasGateWaiting
        ? "결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다. 방금 찍었다면 보드 반영까지 최대 5분 걸립니다."
```

after:

```ts
      description: hasGateWaiting
        ? "결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다."
```

근거: 도장 버튼이 성공 후 `router.refresh()`를 부르고(`gate-transition-button.tsx:43`) 읽기가 신선해지면 헤더 실행 콘솔이 즉시 새 status를 반영한다 — "최대 5분" 지연 주장은 이 항목 뒤 사실이 아니다. 남는 첫 문장이 버튼이 왜 비활성인지·무엇을 하면 되는지를 그대로 설명한다.

### 3) `src/fsd/features/transition-pipeline-gate/model/transitions.ts` — 잠금 칩 지연 전제 제거(판단 4)

before (`transitions.ts:162-167`):

```ts
// 카드 잠금 표식(FEAT-20): 도장·반려 성공 뒤 버튼 자리를 대신하는 비상호작용 칩의 재료.
// label=낱말+"보드 반영 대기", marker=점 색 Tailwind class(비텍스트 — 색 단독 전달 아님).
export type CardLock = { label: string; marker: string };

// 도장(게이트 전진) 성공 뒤 칩 문구. FEAT-10의 "보드 반영" 어휘를 잇는다.
export const GATE_LOCK_LABEL = "도장 찍음 · 보드 반영 대기";
```

after:

```ts
// 카드 잠금 표식(FEAT-20): 도장·반려 성공 뒤 버튼 자리를 대신하는 비상호작용 칩의 재료.
// label=완료 낱말, marker=점 색 Tailwind class(비텍스트 — 색 단독 전달 아님).
export type CardLock = { label: string; marker: string };

// 도장(게이트 전진) 성공 뒤 칩 문구. 재클릭 방지용 종결 표식이다. "보드 반영 대기"
// 절은 FEAT-22가 읽기 지연(raw CDN 잔상)을 없애 더는 참이 아니므로 뺀다.
export const GATE_LOCK_LABEL = "도장 찍음";
```

before (`transitions.ts:169-177`):

```ts
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

after:

```ts
// 반려 성공 뒤 칩 문구. 낱말은 반려 액션 동사를 잇는다(reject-actions 토스트 어휘와 대칭).
const REJECT_LOCK_WORD: Record<RejectAction, string> = {
  bounce: "되돌림",
  hold: "보류함",
  discard: "폐기함",
};
export function rejectLockLabel(action: RejectAction): string {
  return REJECT_LOCK_WORD[action];
}
```

근거: 잠금 칩 **자체는 유지한다**(도장·반려 성공 뒤 재클릭 방지 — 화면이 하드 리로드 전까지 클라이언트 상태로 잠긴 채 남는다). 잠금은 **카드 단위**다 — 카드마다 `GateCardLock` Provider 하나가 감싸고 그 카드의 도장 버튼·반려 패널이 상태를 나눈다(`gate-card-lock.tsx:8-11` "카드 단위 잠금", `:26-27` 카드별 `useState`). 낡는 것은 "보드 반영 대기"라는 지연 전제뿐이다: 도장 후 raw CDN 잔상 창(최대 5분) 동안 투영이 낡을 수 있음을 알리는 문구였는데, 이 항목이 그 창을 없앤다. "도장 찍음"·완료 동사만으로 종결을 전달하며(점 색은 비텍스트로 함께 전달, `gate-card-lock.tsx:41-45`), 새 지연 전제를 새로 만들지 않는다.

## 테스트

- **덮는 것** (`queries.test.mjs` 재작성 — `mock.module("server-only")`와 `mock.module("~/env", { env: { get GITHUB_PIPELINE_TOKEN() {...} } })`를 subject `import("./queries.ts")` 전에 등록, repo-doc `queries.test.mjs:8-24` 패턴):
  - 토큰 있음(기본): `fetch`가 `\`${BOARD_CONTENTS_URL}?ref=${BOARD_BRANCH}\``로 정확히 1회, `cache: "no-store"`·`Accept: application/vnd.github+json`·`Authorization: "Bearer <token>"`. 응답 `{ ok, status, json: () => ({ content: Buffer.from(markdown,"utf-8").toString("base64") }) }`를 base64 디코드해 `parseBoard` 결과 반환(섹션·항목 파싱 확인).
  - 토큰 있음·non-OK(503) → throw, fetch 1회.
  - 토큰 있음·`content` 누락(빈 객체 JSON) → throw(shape fail-closed), raw CDN으로 폴백하지 않음(fetch 1회, raw URL 미호출).
  - 토큰 없음(`state.token = undefined`): `fetch`가 `[BOARD_RAW_URL, { cache: "no-store" }]`로 정확히 1회(헤더 없음), `text()` 본문을 `parseBoard`. 현재 동작 보존.
  - 토큰 없음·non-OK(503) → throw.
  - `run-plan.test.mjs`: `GATE_WAITING_DESC` 상수(`:12-13`)를 새 문구 `"결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다."`로 갱신 — 승인대기만·검토대기만 두 단언(`:37-51`)이 이를 참조하므로 함께 통과. `it()` 제목(`:37`) `"승인대기만 → 비활성 + 도장 안내(반영 지연 포함)"`에서 `(반영 지연 포함)`을 제거한다 — 제목이 지워진 문구를 계속 인용하면 라벨이 거짓이 된다(pass/fail 무관한 문서 위생).
  - `transitions.test.mjs`: `GATE_LOCK_LABEL` 단언(`:589-590`)을 `"도장 찍음"`으로, `rejectLockLabel` 3분기 단언(`:593-596`)을 `"되돌림"`·`"보류함"`·`"폐기함"`으로 갱신. 옛 값을 인용하는 `it()` 제목 둘(`:589` `"도장 잠금 문구는 '도장 찍음 · 보드 반영 대기'로 고정"`·`:593` `"반려 잠금 문구는 액션별 낱말 + '· 보드 반영 대기'(3분기)"`)도 새 값 기준으로 갱신한다(`"도장 잠금 문구는 '도장 찍음'으로 고정"`·`"반려 잠금 문구는 액션별 낱말(3분기)"`).
- **못 덮는 범위** (Node 러너·DOM/외부 I/O 없음):
  - 실제 GitHub contents API 응답의 base64 라인 wrapping·`encoding: "none"`(>1MB 파일) 경로 — 보드가 1MB 훨씬 아래라 실사용에서 발생하지 않지만 라이브 응답 자체는 모의로만 검증.
  - 토큰 부재 폴백이 **다시 최대 5분 잔상**을 낸다는 성질(판단 5) — 프로덕션은 토큰이 있어 이 경로를 타지 않음. 실물 확인은 배포 후 수동(토큰 설정 배포에서 도장→즉시 반영, 데스크톱).
  - 잠금 칩·실행 콘솔 설명의 시각/렌더(칩 문구 렌더·`router.refresh` 후 카드 이탈)는 수동 smoke.

## 범위 밖 의존

이 항목을 막는 범위 밖 의존은 **없다**(`packages/db`·타 워크스페이스·DB 쓰기 경로 불필요 — 읽기 owner 한 파일의 fetch 대상만 바꾼다).

승계용 후속(판단 6, 이 항목을 막지는 않음): **dev 책상 「작업 진행」 버튼의 보드 상태 게이팅.** 백로그 FEAT-22 `source`가 명시하듯, 책상 버튼을 보드 status로 게이팅하는 것은 읽기가 신선해진 뒤에만 정당하다(낡은 보드로 게이팅하면 도장 직후 잘못 잠긴다). 이 항목이 읽기 신선도를 확보하므로 후속으로 다룰 수 있다. `apps/admin` 범위 안이지만 별도 요구·설계라 이 항목에 넣지 않는다 — 메인 루프 인수 시 백로그 후보로 제시.

## 대안

- **런타임 폴백(contents API 실패 → raw CDN)**: 기각. contents API가 200이지만 shape 이상이거나 non-OK일 때 raw로 내려가면 조용히 낡은 보드를 주게 되어 이 항목이 없애려는 버그를 되살린다. fail-closed(throw)로 anomaly를 표면화한다.
- **토큰 없이도 항상 contents API(미인증 60/h)**: 기각. 매 요청 no-store 읽기라 Vercel 공유 IP에서 남의 트래픽과 합쳐 60/h를 넘길 수 있다. 백로그도 "토큰 부재 시 raw CDN 폴백 유지"를 지시.
- **raw URL에 캐시 무력화 쿼리(`?t=<now>`) 추가**: 기각. raw.githubusercontent.com 엣지 캐시의 max-age는 응답 헤더로 정해지며 임의 쿼리로 우회되지 않는다(그리고 새 URL마다 캐시 미스를 유발해도 신선도 보장이 없다). contents API가 정공법.
- **도장 토스트 힌트(`transitions.ts:24-25` "보드에 반영되면 …")도 함께 수정**: 기각 — 유지한다. "보드 반영 대기"(칩)는 화면에 남는 **지속 상태 표식**이라 지연이 사라지면 거짓이 되지만, "보드에 반영되면 … 누르세요"(토스트)는 **조건 서술**이고 이 항목 뒤에도 참이다 — 반영은 이제 `router.refresh()` 왕복(수 초)으로 일어나며, 그 왕복이 끝나기 전 실행 버튼은 여전히 옛 상태다. 조건절을 지우면 사용자가 refresh 착지 전에 실행을 눌러 "진행할 작업 없음"을 보는 새 혼란을 만든다. 최대 5분 지연을 단정하지 않으므로 시효 문구가 아니다.
- **잠금 칩 문구 수정을 후속으로 분리**: 기각. "보드 반영 대기"는 이 항목이 없애는 페이지 전역 지연 전제라, 두면 "반영 지연을 없앴는데 칩은 반영 대기라 말한다"는 모순이 배포된다(FEAT-10 3라운드가 잡은 "도장 직후 안내와 동적 라벨의 모순"과 같은 부류). 지시도 칩 메커니즘은 유지·문구만 시효라 명시하므로 메커니즘 재설계 없이 문구만 이 항목에서 정정한다.
- **`scripts/verify-fsd-boundaries.mjs` 수정**: 불필요. `queries.ts`는 이미 fetch owner(`:33`)라 owner 집합(6개)이 그대로다. 검증에서 fetch가 같은 owner 파일 안에 남는지, owner 수가 6으로 유지되는지, `~/env` import가 경계를 깨지 않는지(선례 owner 둘이 이미 통과)를 `verify:fsd:final`로 확인한다.
