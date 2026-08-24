# FEAT-18: 대시보드 로스터를 현행 파이프라인 7인 체제로 동기화

agent: admin-dev

## 현재 동작

대시보드의 행위자 로스터는 **닫힌 5인**(pm·admin-dev·web-dev·doc-auditor·feature-scout)이며, backend-dev·plan-verifier가 세계에 없다.

- `src/fsd/shared/agents/roster.ts:5-11` `ROSTER_AGENT_IDS`가 정확히 5인의 `as const` 배열이다. 이 상수가 앱 전역 로스터 멤버십의 단일 출처다(`:1-4` 주석).
- `roster.ts:15-17` `isRosterAgentId`는 이 5인 집합 멤버십으로 판정한다. `roster.ts:20-22` `agentDefinitionPath`가 `.claude/agents/<id>.md`를 조립하고, `roster.ts:26-28`이 5인의 정의 경로 집합 `AGENT_DEFINITION_PATHS`를 만들며, `roster.ts:31-33` `isAgentDefinitionPath`가 그 집합 멤버십을 돌려준다.
- `roster.ts:24-25`의 주석은 "backend-dev.md는 정의 파일이 있어도 책상이 없어 여기 없다 — 진입점 없는 문서는 못 읽는다"라고 적혀 있다.
- `src/fsd/pages/pipeline/model/known-agents.ts:11-32` `ROSTER` 레코드가 같은 5인의 `AgentIdentity`(handle·role·emoji)를 담는다. `known-agents.ts:34` `ROSTER_ORDER = ROSTER_AGENT_IDS`. `known-agents.ts:36-43` `identityFor`는 `ROSTER`에 없는 id를 받으면 `{ handle: agentId, role: "에이전트", emoji: "" }`의 **폴백 정체성**을 돌려준다(`:40`).
- `src/fsd/pages/pipeline/model/sprites.ts:49-55` `APPEARANCE`가 5인의 픽셀 외형(hair·shirt·prop)을 담고, `sprites.ts:56-63`은 미등록 agentId에 `FALLBACK_APPEARANCE`(hair `#5a3b28`·shirt `#6b7f96`·prop `papers`)를 준다. `sprites.ts:36` `Prop` 유니온은 `"papers" | "laptop" | "glass" | "compass"` 넷이고 `sprites.ts:39-45` `PROP_GRIDS`가 그 넷의 픽셀 격자를 담는다.
- `src/fsd/features/run-pipeline-command/model/commands.ts:3-9` `PipelineCommandKey`는 6키(pipeline-run·pm-select·audit-run·scout-run·admin-work·web-work)다. `commands.ts:16-25` `PIPELINE_COMMANDS`가 각 본문을 담고, `commands.ts:23-24`의 admin-work·web-work는 `"<agent>로서 PROJECT_BOARD.md에서 배정된 항목을 현재 status와 런북 규칙대로 처리해 주세요. ${GATE_GUARD}"` 형태다. `GATE_GUARD`(`commands.ts:13-14`)는 게이트 전이 금지 문구다.
- `src/fsd/pages/pipeline/model/desk-commands.ts:6-12` `DESK_COMMANDS`가 5책상→{key,label}을 매핑한다. backend-work·backend-dev 항목이 없다.
- `src/fsd/pages/pipeline/ui/_component/pixel-office.tsx:250-278` `PixelOffice`가 `team`(=ROSTER_ORDER 파생)을 `.map`으로 책상 렌더한다. `pixel-office.tsx:126-170` `PixelDeskUnit`은 `deskCommandFor`가 null이면 명령 버튼을 안 그리고(`:161-167`), `member.heldId`가 있으면 칩을 그린다(`:156-160`).
- `src/fsd/pages/pipeline/model/briefing.ts:260-263`이 `ROSTER_ORDER.map`으로 team을 만들고 각자 `teamState(id, items)`를 부른다. `briefing.ts:193-218` `teamState`는 **pm만 특별 파생**(승인대기 건수 세기, `:197-202`)이고, 나머지는 `items.filter((it) => it.agent === agentId)`로 자기 항목을 찾아 상태를 낸다(`:203-217`).
- 라우트 가드: `src/app/(protected)/pipeline/agents/[agent]/page.tsx:26`이 `if (!isRosterAgentId(agent)) notFound()`로 roster 밖 프로필을 404 처리한다.
- 문서 fetch 가드: `src/fsd/entities/repo-doc/api/queries.ts:11`이 `if (!isWhitelistedDocPath(path) && !isAgentDefinitionPath(path)) return null`로, roster 밖 정의 파일은 fetch 없이 null을 준다. `src/fsd/entities/repo-doc/api/queries.test.mjs:69-72`가 이를 검증한다 — `.claude/agents/backend-dev.md`가 fetch 없이 null임을 단언.
- 실측: `.claude/agents/` 폴더에 7개 정의 파일이 모두 실재한다(pm·admin-dev·web-dev·backend-dev·doc-auditor·feature-scout·plan-verifier). 즉 backend-dev·plan-verifier의 정의 파일은 있으나 로스터가 못 읽는다.
- 실측: 보드에 `agent: backend-dev` 항목이 승인대기로 실재한다 — 2026-08-23 섹션의 BUG-03(`:53-57`)·BUG-02(`:58-62`). 보드는 상태 전이로 줄이 밀리는 살아 있는 문서라 섹션·ID가 앵커다.

**이미 맞는 곳(손대지 않는다):** `src/fsd/entities/repo-doc/model/doc-location.ts:64-76`의 `REPORT_LABEL`·`DOC_LINK_AGENTS`는 이미 backend-dev를 "구현 보고"로 알고 있고, `src/fsd/entities/agent-report/api/queries.ts:37-62` `getAgentReportIndex`는 실재하는 폴더를 **동적 열거**한다 — backend-dev 폴더가 생기면 자동으로 기록이 뜬다.

## 문제

로스터가 현행 파이프라인 7인과 어긋난 닫힌 5인이라, `roster.ts:24-25`의 배제 전제("백엔드 항목은 선정된 적 없음")가 만료됐는데도 backend-dev·plan-verifier가 어드민 세계에 부재하다(백로그 FEAT-18 관측 1). 그 결과 (a) 사무실에 backend-dev 책상이 없어 게이트① 이후 "작업 중" 상태·항목 칩을 보여줄 곳이 없고, (b) 보고 피드에서 폴백 정체성(`known-agents.ts:40` role "에이전트"·이모지 없음)으로 나오며, (c) `/pipeline/agents/backend-dev`·`/pipeline/agents/plan-verifier`가 roster 가드(`agents/[agent]/page.tsx:26`)에서 404라 FEAT-17 역할 정의 열람이 7인 중 2인에게 닫혀 있고, (d) 책상 명령 화이트리스트(`commands.ts:3-9`)에 backend-work가 없다(백로그 관측 2·요구 1·2).

plan-verifier는 특별하다: 보드 `agent:` 필드에 **등장하지 않는다**(런북 4단계에서 메인 루프가 디스패치하는 독립 검증자다). 그래서 `teamState`의 `agent === agentId` 필터로는 상태가 늘 "대기 중"으로 죽는다 — pm처럼 보드에서 파생하는 특별 분기가 필요하다. 그리고 책상 명령은 두지 않는다(백로그 요구 3 — 검증은 별도 트리거 대상이 아니다).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/shared/agents/roster.ts` | `ROSTER_AGENT_IDS`에 `backend-dev`·`plan-verifier` 추가(7인); 만료된 배제 주석(`:24-25`) 갱신 |
| `src/fsd/pages/pipeline/model/known-agents.ts` | `ROSTER` 레코드에 backend-dev·plan-verifier 정체성(handle·role·emoji) 추가 |
| `src/fsd/pages/pipeline/model/sprites.ts` | `APPEARANCE`에 backend-dev·plan-verifier 외형 추가; `Prop` 유니온·`PROP_GRIDS`에 신규 prop `ledger` 신설(plan-verifier 전용) |
| `src/fsd/features/run-pipeline-command/model/commands.ts` | `PipelineCommandKey`·`PIPELINE_COMMANDS`에 `backend-work` 추가(admin-work·web-work와 동형) |
| `src/fsd/pages/pipeline/model/desk-commands.ts` | `DESK_COMMANDS`에 backend-dev 추가. **plan-verifier는 추가하지 않는다**(요구 3) |
| `src/fsd/pages/pipeline/model/briefing.ts` | `teamState`에 plan-verifier 파생 분기 추가(검토대기 존재→"검증 중"·없으면 "대기 중") |
| `src/fsd/shared/agents/roster.test.mjs` | 7인 수용·거부 목록 갱신, 정의 경로 화이트리스트 7건 |
| `src/fsd/pages/pipeline/model/briefing.test.mjs` | team 순서 7인, backend-dev·plan-verifier 상태 단언, `identityFor` 신규 2인 |
| `src/fsd/pages/pipeline/model/sprites.test.mjs` | `appearanceFor` 신규 2인, `PROP_GRIDS`에 ledger |
| `src/fsd/features/run-pipeline-command/model/commands.test.mjs` | `KEYS`에 backend-work, dev 작업 진행 단언에 backend-work |
| `src/fsd/pages/pipeline/model/desk-commands.test.mjs` | backend-dev 매핑, plan-verifier는 null 단언 |
| `src/fsd/entities/repo-doc/api/queries.test.mjs` | 비-roster 정의 파일 음성 케이스를 backend-dev.md → main-loop.md로 교체 |

신규 파일 없음. 새 fetch/DB/Sentry owner·새 public export 없음 → `scripts/verify-fsd-boundaries.mjs`는 고치지 않는다. `doc-location.ts`·`agent-report/api/queries.ts`도 고치지 않는다(위 「이미 맞는 곳」).

## 디자인 방향

이 항목은 새 화면을 만들지 않는다 — FEAT-07에서 확립한 **Gather풍 픽셀 사무실** 정체성 시스템에 두 캐릭터를 편입한다. 브리프 준수 = 새 시각 언어를 발명하지 않고 기존 체계의 규칙을 그대로 잇는 것이다. 픽셀 외형은 `agentId`에서만 결정론적으로 나오고 상태는 말풍선이 나른다(`sprites.ts:47` 주석·`pixel-sprite.tsx:8`).

**기존 체계의 규칙(관측):** 이 세계에서 **소품이 역할 signature**다 — pm=papers, doc-auditor=glass(돋보기), feature-scout=compass, 그리고 **두 개발자(admin-dev·web-dev)는 laptop을 공유**한다(`sprites.ts:50-54`). 즉 "같은 종류의 노동자는 같은 소품, 새 종류의 노동자는 새 소품"이 확립된 패턴이다.

- **팔레트(신규 리터럴 hex — 기존 5인과 비충돌):** 이 픽셀 세계는 oklch 토큰이 아니라 리터럴 hex를 쓴다(`sprites.ts:3` `PIXEL_PALETTE`).
  - **backend-dev** = hair `#52504b`(차가운 흑연 회색), shirt `#37617a`(스틸 블루), prop `laptop`. 근거: 개발자이므로 두 dev와 같은 laptop 소품을 공유(체계 규칙 준수). 색은 서버·신뢰성 엔지니어의 "인프라" 정체성 — 스틸 블루 셔츠 + 흑연 머리. 기존 셔츠(indigo `#4a4080`·green `#5f8a5a`·tan `#8a6b4f`·violet `#7a6296`·teal `#4f7d78`)와 색상이 겹치지 않는다(스틸 블루는 teal보다 파랗고 indigo보다 덜 보라).
  - **plan-verifier** = hair `#443a4a`(자두빛 슬레이트), shirt `#8a4a52`(버건디), prop `ledger`(신규). 근거: 적대적 독립 검토자의 "빨간 펜" 은유 → 버건디 셔츠(기존 셔츠 중 붉은 계열 전무). 흑연 회색(backend-dev)과 구분되는 자두빛 어두운 중성 머리.
  - 두 머리색·두 셔츠색 모두 기존 5인의 어느 값과도 hex가 다르며 색상(hue)도 구분된다. `FALLBACK_APPEARANCE`(`sprites.ts:56-60`)는 그대로 둔다.
- **타이포·레이아웃(변경 없음):** 사무실 레이아웃은 이미 N개 책상을 처리한다 — 폰 2열 격자 → 데스크톱 `flex-wrap`(`pixel-office.tsx:264`, 가로 스크롤 없음). 5→7 책상이 이 레이아웃을 깨지 않는다. 명패는 `handle`을 픽셀 모노로 렌더(`pixel-office.tsx:106-116`)하고 "backend-dev"·"plan-verifier"는 기존 "feature-scout"(12자)와 같은 길이대라 명패 폭 처리(초과 허용, `:64` 주석)가 그대로 적용된다. 말풍선 색은 기존 tone 5색(`sprites.ts:69-75`)을 재사용한다 — 새 tone 없음.
- **시그니처 요소(이 항목의 유일한 신규 시각물):** plan-verifier 전용 **ledger 소품** — 어두운 표지 안에 초록 체크 획을 둔 4행×5열 격자 `["kkkkk", "kwGwk", "kGwwk", "kkkkk"]`, `dy: -4`(glass·compass와 같은 착지 높이). `G`는 채도 초록 `#7fa66a`(`PIXEL_PALETTE.G`)로, 벽 장식 액자 `FRAME_GRID`(`pixel-office.tsx:172`, 4행 — 검은 테두리 안에 옅은 `g` `#cfe3d8` 창과 흰 `w` 내부)와 격자 내용이 달라 혼동되지 않는다. "체크한 장부"는 체계적 검증의 signature이고, doc-auditor의 돋보기(glass)와 다른 독립 검증자 정체성을 준다. backend-dev에게는 새 소품을 주지 않는다(개발자는 laptop 공유가 체계 규칙).

**셀프 비평(생성형 기본값 대조):** 크림+세리프+테라코타 / 다크+애시드 / 브로드시트 hairline 세 클러스터 어디에도 해당 없음 — 저장소에 이미 확립된 픽셀 정체성을 확장한다. 자유 축에서 택한 유일한 특색(=정당화한 리스크)은 적대적 검토자의 버건디 "빨간 펜" 셔츠와 전용 ledger 소품이며, 둘 다 그 역할의 실제 성격(붉은 교정·체계적 검증)에서 도출했다. 소품을 재사용(예: plan-verifier에 glass)하면 두 검토자 정체성이 뭉개지므로, "새 역할=새 소품" 체계 규칙을 따라 하나만 추가한다(개발자는 laptop 공유로 절제).

## 구현 스케치

### 1. `roster.ts` — 로스터 7인 + 주석 갱신

`ROSTER_AGENT_IDS` before(`:5-11`):

```ts
export const ROSTER_AGENT_IDS = [
  "pm",
  "admin-dev",
  "web-dev",
  "doc-auditor",
  "feature-scout",
] as const;
```

after:

```ts
export const ROSTER_AGENT_IDS = [
  "pm",
  "admin-dev",
  "web-dev",
  "backend-dev",
  "plan-verifier",
  "doc-auditor",
  "feature-scout",
] as const;
```

정의 경로 화이트리스트 주석 before(`:24-25`):

```ts
// 접두사/정규식이 아니라 roster에서 조립한 정확 경로의 닫힌 집합(요구 2).
// backend-dev.md는 정의 파일이 있어도 책상이 없어 여기 없다 — 진입점 없는 문서는 못 읽는다.
```

after:

```ts
// 접두사/정규식이 아니라 roster에서 조립한 정확 경로의 닫힌 집합(요구 2).
// roster 7인의 정의 파일만 통과한다. main-loop는 오케스트레이터라 책상도 정의 파일도
// 없어 여기에도 없다 — 진입점 없는 경로는 못 읽는다.
```

`AGENT_DEFINITION_PATHS`(`:26-28`)·`isAgentDefinitionPath`·`isRosterAgentId`·`agentProfileHref`는 로직 변경 없음 — 상수에서 7인을 자동으로 조립한다. 이로써 라우트 가드(`agents/[agent]/page.tsx:26`)와 문서 fetch 가드(`repo-doc/api/queries.ts:11`)가 backend-dev·plan-verifier를 함께 연다(요구 1의 프로필 라우트 개방).

### 2. `known-agents.ts` — 정체성 2인 추가

`ROSTER` 레코드의 feature-scout 항목(`:26-31`) 뒤, 닫는 `}`(`:32`) 앞에 삽입:

```ts
  "backend-dev": {
    id: "backend-dev",
    handle: "backend-dev",
    role: "백엔드 개발",
    emoji: "⚙️",
  },
  "plan-verifier": {
    id: "plan-verifier",
    handle: "plan-verifier",
    role: "계획 검증",
    emoji: "🔬",
  },
```

이로써 `identityFor("backend-dev")`가 폴백(`:40` role "에이전트")이 아니라 실제 정체성을 돌려준다(관측 2b 해소). 이모지 `⚙️`·`🔬`는 기존 5인(📋🛠️🧩🔍🧭)과 겹치지 않는다. `ROSTER_ORDER`(`:34`)는 `ROSTER_AGENT_IDS`를 그대로 참조하므로 자동으로 7인 순서가 된다.

### 3. `sprites.ts` — 외형 2인 + ledger 소품

`Prop` 유니온 before(`:36`):

```ts
export type Prop = "papers" | "laptop" | "glass" | "compass";
```

after:

```ts
export type Prop = "papers" | "laptop" | "glass" | "compass" | "ledger";
```

`PROP_GRIDS`의 compass 항목(`:44`) 뒤에 추가:

```ts
    ledger: { rows: ["kkkkk", "kwGwk", "kGwwk", "kkkkk"], dy: -4 },
```

`APPEARANCE`의 feature-scout 항목(`:54`) 뒤에 추가:

```ts
  "backend-dev": { hair: "#52504b", shirt: "#37617a", prop: "laptop" },
  "plan-verifier": { hair: "#443a4a", shirt: "#8a4a52", prop: "ledger" },
```

`appearanceFor`(`:61-63`)·`gridToRects`·`resolveCell`은 변경 없음 — `PROP_GRIDS[app.prop]`(`pixel-office.tsx:69`)가 `Prop` 유니온으로 타입되므로 ledger가 컴파일에 자동 포함된다.

### 4. `commands.ts` — backend-work 추가

`PipelineCommandKey` 유니온(`:3-9`)에 `| "backend-work"`를 추가하고, `PIPELINE_COMMANDS`의 web-work 항목(`:24`) 뒤에 추가:

```ts
  "backend-work": `backend-dev로서 PROJECT_BOARD.md에서 배정된 항목을 현재 status와 런북 규칙대로 처리해 주세요. ${GATE_GUARD}`,
```

본문 불변식 준수: (1) "[claude]"로 시작하지 않는다("backend-dev로서"로 시작), (2) `GATE_GUARD`를 포함한다. `resolvePipelineCommand`(`:27-32`)는 변경 없음 — `Object.hasOwn` 멤버십으로 새 키를 자동 통과한다.

### 5. `desk-commands.ts` — backend-dev 책상 명령

`DESK_COMMANDS`의 web-dev 항목(`:9`) 뒤에 추가:

```ts
  "backend-dev": { key: "backend-work", label: "작업 진행" },
```

**plan-verifier는 추가하지 않는다**(요구 3). `deskCommandFor("plan-verifier")`는 `?? null`(`:15`)로 null을 돌려주고, `PixelDeskUnit`(`pixel-office.tsx:161-167`)이 null이면 명령 버튼을 그리지 않는다 — plan-verifier 책상은 명령 없이 상태만 표시된다.

### 6. `briefing.ts` — plan-verifier 책상 상태 파생

`teamState`(`:193-218`)의 pm 특별 분기(`:197-202`) 바로 뒤, `const mine = ...`(`:203`) 앞에 삽입:

```ts
  if (agentId === "plan-verifier") {
    // plan-verifier는 보드 `agent:` 필드에 등장하지 않는다(런북 4단계에서 메인 루프가
    // 디스패치하는 독립 검증자). 그래서 pm처럼 보드에서 파생하는 특별 분기가 필요하다.
    // 파생 규칙(백로그 요구 3): 검토대기 항목 = 검증 대상 계획서. 하나라도 있으면
    // "검증 중"(그 계획서가 heldId), 없으면 "대기 중". items는 이미 dedupe된 최신 행이며
    // find는 보드 순서(최신 섹션 우선) 첫 검토대기를 준다 — 미결 2건 제한상 보통 ≤1건이라
    // admin/web-dev 책상의 heldId(.find) 패턴과 동형이다.
    const review = items.find((it) => it.status === "검토대기");
    return review !== undefined
      ? { state: "검증 중", heldId: review.id, tone: "active" }
      : { state: "대기 중", heldId: null, tone: "muted" };
  }
```

tone "active"는 `bubbleColorFor("active")` = `#3e5a86`(파랑, `sprites.ts:71`)와 `TONE_TEXT.active` = `text-active`(`ui/index.tsx:22`)로 이어져 "진행 중 작업"으로 읽힌다 — feed의 계획지시·구현승인과 같은 tone이다. FEED_TONE·teamState 나머지 분기는 변경 없음. `team = ROSTER_ORDER.map`(`:260-263`)이 이제 backend-dev(자기 항목 필터로 파생: 없으면 "대기 중")와 plan-verifier(위 분기)를 포함한다.

## 테스트

- **덮는 것** (모두 기존 러너·구현 모듈과 같은 segment의 `*.test.mjs`, 상대 임포트):
  - `roster.test.mjs`:
    - 수용 목록을 7인으로 갱신(`ROSTER_AGENT_IDS` deepEqual = 위 §1 after 순서), 반복 수용 단언.
    - 거부 목록에서 `"backend-dev"`를 빼고 `"main-loop"`·`""`·`"PM"`·`"admin"`·`"../pm"`은 유지(plan-verifier는 이제 수용). 관련 주석 갱신.
    - `isAgentDefinitionPath` 수용은 `ROSTER_AGENT_IDS` 반복이라 7건 자동 포함. 거부 목록에서 `.claude/agents/backend-dev.md`를 빼고(이제 수용) `.claude/agents/main-loop.md`·`.claude/agents/pm`(확장자 없는 접두형)·`.claude/agents/pm.mdx`·`.claude/agents/../secret.md`·`docs/plans/FEAT-15.md`는 **다섯 건 전부 유지**. 주석("backend-dev has a definition file but no desk")을 main-loop 기준으로 교체.
    - `agentDefinitionPath`에 backend-dev·plan-verifier 정확 경로 단언 추가.
  - `briefing.test.mjs`:
    - team 순서 deepEqual을 7인으로 갱신(`["pm","admin-dev","web-dev","backend-dev","plan-verifier","doc-auditor","feature-scout"]`).
    - 기존 BOARD 픽스처(FEAT-04=검토대기·admin-dev)로 plan-verifier 상태 단언: state "검증 중", heldId "FEAT-04", tone "active".
    - backend-dev 상태 단언: 픽스처에 backend 항목 없음 → state "대기 중", heldId null, tone "muted".
    - 검토대기 없는 소형 보드로 plan-verifier "대기 중"·muted 단언(파생 여집합).
    - `identityFor` 단언 추가: backend-dev → `{id,handle:"backend-dev",role:"백엔드 개발",emoji:"⚙️"}`, plan-verifier → role "계획 검증"·emoji "🔬".
  - `sprites.test.mjs`:
    - `appearanceFor` 신규 단언: backend-dev `{hair:"#52504b",shirt:"#37617a",prop:"laptop"}`, plan-verifier `{hair:"#443a4a",shirt:"#8a4a52",prop:"ledger"}`.
    - `PROP_GRIDS` 소품 개수 5로 갱신 + `PROP_GRIDS.ledger.dy === -4` 단언.
  - `commands.test.mjs`:
    - `KEYS` 배열에 `"backend-work"` 추가(비어있지 않음·[claude] 비시작·GATE_GUARD 포함 3단언이 자동 확장).
    - dev "작업 진행" 단언에 backend-work 포함 + `resolvePipelineCommand("backend-work").startsWith("backend-dev로서")` 단언.
  - `desk-commands.test.mjs`:
    - backend-dev 매핑 단언 `{key:"backend-work",label:"작업 진행"}`.
    - "every desk command key resolves" 반복에 backend-dev 추가(plan-verifier는 제외).
    - `deskCommandFor("plan-verifier") === null` 단언(요구 3 고정).
  - `repo-doc/api/queries.test.mjs`:
    - 비-roster 정의 파일 음성 케이스(`:69-72`)를 `.claude/agents/backend-dev.md` → `.claude/agents/main-loop.md`로 교체(backend-dev는 이제 roster라 fetch 없이 null이 아니다; main-loop는 여전히 roster 밖). **backend-dev.md 양성 fetch 케이스를 추가한다(필수)** — 정의 파일 열람 개방(관측 2c 해소)의 직접 증거이고, 로스터에서 backend-dev를 빼면 이 케이스가 실패해 화이트리스트 실개방을 잡는 검출기가 된다(검증 라운드 음성 시험 실측).
- **못 덮는 범위** (Node 러너·DOM/외부 I/O 없음): 새 두 책상의 픽셀 SVG 실제 렌더(스프라이트·ledger 소품 격자·명패 폭), 말풍선 색·"검증 중"/"작업 중" 문구의 시각 결과, 폰 2열/데스크톱 flex-wrap에서 7책상의 줄바꿈, backend-work 명령 버튼의 useTransition·토스트·GitHub POST, 프로필 라우트가 실제로 열리는지(`getDocContent`의 라이브 fetch), 새 hex 색의 픽셀 대비 — 배포 후 데스크톱+폰 수동 smoke.
- 참고(읽기 전용 `apps/admin/CLAUDE.md` 동기화 대상): 신규 테스트 파일이 없어 「테스트 인벤토리」 표의 행(27파일)은 그대로이나, 여러 파일에 `it` 케이스가 늘어 총 test 수(현재 273)가 증가한다 — 신규 describe가 없어 suite 수(58)는 불변이다. 구현 후 실측 수치를 메인 루프에 비고로 보고한다.

## 범위 밖 의존

없음. `packages/db`·다른 워크스페이스·DB 쓰기 경로 변경이 모두 불필요하다. 새 import·public export·fetch/DB/Sentry owner 추가가 없어 `scripts/verify-fsd-boundaries.mjs`도 고치지 않는다(backend-dev·plan-verifier의 정의 파일 fetch는 기존 owner `repo-doc/api/queries.ts`가 기존 `isAgentDefinitionPath` 경로로 처리 — 새 owner 아님). `.claude/agents/*.md` 정의 파일 자체도 건드리지 않는다(읽기 전용 소비만).

## 대안

- **plan-verifier에도 책상 명령을 두기**: 기각 — 백로그 요구 3이 명시적으로 금지한다. 검증은 런북 4단계에서 메인 루프가 수행하는 일이라 별도 트리거 대상이 아니다. `desk-commands.ts`에 넣지 않으면 버튼이 자동으로 렌더되지 않는다(`pixel-office.tsx:161`).
- **plan-verifier 소품으로 glass(돋보기) 재사용**: 기각 — doc-auditor의 signature와 뭉개져 두 검토자 정체성이 구분되지 않는다. "새 역할=새 소품" 체계 규칙(디자인 방향)에 따라 전용 ledger를 추가한다.
- **backend-dev에 전용 신규 소품**: 기각 — backend-dev는 개발자이고, admin-dev·web-dev가 이미 laptop을 공유한다(`sprites.ts:51-52`). 같은 종류 노동자는 같은 소품이 확립된 패턴이라 laptop 재사용이 체계 준수이며 색으로 구분한다.
- **plan-verifier 상태를 "N건 검증 중" 카운트(pm식)로**: 기각 — 미결 2건 제한상 검토대기는 보통 ≤1건이고, heldId 칩(admin/web-dev 패턴)이 어느 계획서를 검증하는지 화면에서 더 명확하다. 카운트는 칩 없이 숫자만 남아 다른 dev 책상과 형태가 어긋난다.
