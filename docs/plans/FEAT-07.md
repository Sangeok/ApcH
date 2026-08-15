# FEAT-07: `/pipeline` 픽셀 사무실 — Gather풍 그림체 전환 + 캐릭터 고정·상태 말풍선 + 전 책상 명령

agent: admin-dev

> template.md의 절 구조를 따르되, **admin-dev 역할 규칙(UI 작업이면 디자인 방향을 절로 남긴다)**에 따라
> 「현재 동작」과 「문제」 사이에 `## 디자인 방향` 절 하나를 추가했다(FEAT-06 계획과 동일 구조).
> 단 이번엔 그림체·팔레트·레이아웃이 **승인 시안으로 이미 확정**됐으므로, 그 절의 임무는 새 방향 제안이
> 아니라 **시안을 코드 체계로 옮기는 규칙**(격자 데이터·팔레트 상수·말풍선/명패 컴포넌트화)의 명세다.
> 계약 원본은 `docs/design/FEAT-07/pixel-office-mock.html`(확정 시안)과 `docs/design/FEAT-07/mockgen.py`
> (격자·팔레트·기하의 원본). 아래 완성 코드는 `mockgen.py`에서 값을 글자 그대로 옮겼다.

## 현재 동작

FEAT-06이 `/pipeline`을 사무실 뷰(플랫 SVG 캐릭터·책상 세로 스택·책상별 명령)로 만들었고, 지금 코드는 그대로다.

- `app/pipeline/page.tsx:17-30`이 `requireAdmin()` → `getPipelineBoard()` → `buildBriefing(sections, new Date())`로 순수 브리핑을 만들어 `<PipelineBriefing>`에 넘긴다. `dynamic = "force-dynamic"`(`:15`).
- `ui/pipeline-page.tsx:23-32` `PipelineBriefing`은 `BriefingHeader`·`InboxZone`·`OfficeZone`·`FeedZone`을 단일 컬럼(`max-w-2xl`)으로 쌓는다.
  - `OfficeZone`/`OfficeDesk`(`:146-192`)가 팀을 **책상 카드 세로 스택**으로 그린다. 각 카드는 `AgentCharacter`(`:164-168`) + 이름/역할 + `TONE_TEXT[member.tone]`로 색칠한 상태 문구(`:177-179`) + `member.heldId` 칩(`:180-184`) + `deskCommandFor` 있으면 `PipelineCommandButton`(`:186`).
  - `InboxZone`(`:83-109`)은 헤더로 `SectionLabel "당신의 책상"` + `DocumentsMark`(`:63-81`, 장식 SVG)를 두고, 아래에 `InboxCard`(`:111-144`, `stamp-soft` 배경·발화·`근거 보기` `<details>`)를 쌓는다. 0건이면 안내 카드(`:90-99`).
  - `FeedZone`(`:194-232`)은 보고를 `<details>` 피드로 접어 `TONE_TEXT`로 색칠해 렌더한다.
- `ui/agent-character.tsx`가 **플랫 기하 SVG 캐릭터**다(`viewBox 0 0 72 72`, `:129`). 외형이 상태에 따라 **바뀐다**: `POSE_FOR_TONE`(`:7-13`)가 tone→팔 각도(`RIGHT_ARM_DEG`/`LEFT_ARM_DEG` `:25-38`)를, `TONE_FILL`(`:16-22`)이 tone→몸통 채움색(`fill-stamp` 등)을 준다. 소품(`RoleProp` `:65-113`)은 역할 실루엣이지만 위치가 포즈별로 움직인다(`PROP_AT` `:40-46`). 팔 그룹에 `transition-transform`(`:148,155`).
- `pipeline/briefing.ts`의 순수 계층:
  - `Tone`은 5종 `"pending" | "active" | "done" | "hold" | "muted"`(`:4`).
  - `TeamMember = { identity, state, heldId, tone }`(`:16-21`). `teamState`(`:156-181`)가 문자열과 `heldId`를 만든다: pm은 `` `${pending}건 결재 요청 중` ``/`"새 선정 없음"`(`:160-164`), 검토대기 `"검토 요청 중"`+heldId(`:169`), 작업 `"작업 중"`+heldId(`:174`), 보류 `"보류"`+heldId(`:176`), 완료 `"최근 완료"`+heldId(`:179`), 없으면 `"대기 중"`/heldId `null`(`:180`).
  - `buildBriefing`(`:187-206`)이 `ROSTER_ORDER`대로 팀을, `pendingCount`(=inbox 길이)를 만든다.
- 원격 명령(admin의 유일한 외부 쓰기):
  - `pipeline/commands.ts`가 화이트리스트다(보안 경계). `PipelineCommandKey` 4종(`:3-7`) + `GATE_GUARD`(`:11-12`) + `PIPELINE_COMMANDS` 맵(`:14-21`) + `resolvePipelineCommand(key): string | null`(`:23-28`, `Object.hasOwn` 멤버십 검사).
  - `pipeline/desk-commands.ts`는 책상(agentId)→`{ key, label }`(`:6-10`). **pm·doc-auditor·feature-scout만 등재, dev는 없음.** `deskCommandFor`(`:12-14`)가 없으면 `null`.
  - `command-action.ts:18-25` `postPipelineCommand(command: PipelineCommandKey)`가 `requireAdmin()` 뒤 `resolvePipelineCommand`로 본문을 해석하고 밖이면 거부, 같은 `ISSUE_COMMENTS_URL`로 POST(`:36-45`).
  - `ui/pipeline-command.tsx:10-35` `PipelineCommandButton`은 `command`+`label`만 받고(`className` prop 없음) `Button`(shadcn) + `useTransition` + 토스트.
- `pipeline/agents.ts`: `ROSTER`(`:9-30`, handle/role/emoji), `identityFor`(`:40-47`), `ROSTER_ORDER`(`:32-38`, pm·admin-dev·web-dev·doc-auditor·feature-scout).
- 색·서체(`styles/globals.css`): `--stamp`/`--active`/`--silence`/`--hold`/`--briefing` 브리핑 토큰(`:85-90`), `--font-briefing-display`(`:11-12`, Gowun Batang 세리프). `@theme inline`(`:36-41`)에 등록돼 `text-*`/`fill-*`가 생성된다.
- 타입: `tsconfig`의 `noUncheckedIndexedAccess: true`(CLAUDE.md:50). 인덱스 시그니처/`Record<string,…>` 접근은 `… | undefined`가 되고, **유한 유니온 키(`Record<Tone,…>`)를 정확한 유니온 값으로 접근하면 `undefined`가 안 붙는다**(속성 접근).
- `AgentCharacter`는 `pipeline-page.tsx:12,164` 한 곳에서만 임포트·사용된다(Grep 확인).

## 디자인 방향

_(그림체·팔레트·레이아웃은 승인 시안 `pixel-office-mock.html`/`mockgen.py`로 **이미 사용자 확정**. 이 절은 새 방향이 아니라 시안→코드 이관 규칙이다. 게이트 판단 근거.)_

**원칙 — 시안이 계약이다.** 값을 지어내지 않는다. 모든 색·격자·기하는 `mockgen.py`에서 옮긴다. 이관의 세 축:

- **색 = 상수화(신규 CSS 토큰 없음).** 픽셀 세계는 자체 리터럴 팔레트를 가진다 — FEAT-04/06의 oklch 시맨틱 토큰(`--stamp` 등)을 **재사용하지 않는다**(시안이 별도 hex 팔레트를 쓴다). `sprites.ts`에 상수로 고정:
  - **PIXEL_PALETTE**(mockgen `PAL`): `k #2b2420`(외곽선) `s #f2c9a0`(피부) `w #fffdf6`(종이/흰) `d #b08968`(책상 상판) `D #8b5e34`(책상 앞면) `m #6b7f96`(노트북 금속) `g #cfe3d8`(노트북 화면) `f #efe8d8`/`F #e6dcc6`(체커 바닥) `W #f7f3e8`(벽) `B #e0d7c2`(걸레받이) `p #c8b7e0`(화분) `G #7fa66a`(잎/나침반 바늘).
  - **정체성 팔레트(캐릭터 완전 고정)**: 셔츠색 = pm `#4a4080` 인디고 / admin-dev `#5f8a5a` 그린 / web-dev `#8a6b4f` 브라운 / doc-auditor `#7a6296` 퍼플 / feature-scout `#4f7d78` 틸. 머리색도 에이전트별(mockgen `ID.hair`). **상태에 따른 옷색·포즈 변형은 없다** — 외형은 `agentId`에서만 나온다.
  - **말풍선 tone색**(mockgen `TONE`): pending `#976014` / active `#3e5a86` / done `#8b877f`. muted는 색 없음(=말풍선 없음). **hold는 시안 `TONE`에 없는 유일한 값** — briefing이 5 tone을 내므로 채워야 한다. 픽셀 웜 팔레트에 맞춰 `#9a5a2f`(번트 브라운, done의 회색·pending의 금색과 구분)을 제안한다. 이 한 값만 시안 밖 결정이니 게이트에서 조정 가능(게이트 결정: `#9a5a2f` **승인**). 실측 대비(말풍선 바탕 `#fffdf6`, 12px 텍스트, WCAG AA 4.5:1 기준): pending 5.16 · active 6.85 · hold 5.32 통과, **done `#8b877f`는 3.52:1로 미달** — 게이트 결정: 웜 그레이 **`#6f6b64`(5.21:1) 채택**(이탈 목록 (4)).
- **타이포 역할(신규 서체 없음, 시스템 서체).** 픽셀 텍스트(명패·말풍선·버튼 라벨)=`ui-monospace, monospace`(mockgen `font-family` 그대로). 산세리프(역할 라벨·배너 부제)=`ui-sans-serif, system-ui`. 명패 13px 굵게(모바일은 렌더 폭 축소로 자연 축소), **명패는 책상 폭을 넘겨도 허용**(가독성 우선 — 사용자 지적 반영). 모든 `<svg>`에 `shape-rendering="crispEdges"`로 안티에일리어싱을 끈다(픽셀 경계 선명).
- **레이아웃 개념 — 데스크톱 가로 방 / 폰 2열 격자, 가로 스크롤 없음.**
  ```
  데스크톱                                   폰(2열)
  ┌──────────────────────────────────┐      ┌───────────────┐
  │ 파이프라인 브리핑        [파이프라인 실행] │      │ [파이프라인 실행] │
  ├──────────────────────────────────┤      ├───────────────┤
  │ ▓ 당신의 책상  🟧 결재 N건이 도장을… ▓ │      │ ▓ 당신의 책상 ▓ │  픽셀 배너
  │  (기존 결재 카드 본문 유지)             │      │  (결재 카드)    │
  ├──────────────────────────────────┤      ├───────────────┤
  │ 사무실 (벽·걸레받이·체커 바닥·소품)      │      │ ┌────┐ ┌────┐ │
  │  💬       💬       ·       💬    · │      │ │ 💬 │ │ 💬 │ │  말풍선=상태
  │ [😀]     [😀]    [😀]    [😀]  [😀]│      │ │[😀]│ │[😀]│ │  캐릭터 고정
  │ ▬명패▬  ▬명패▬  ▬명패▬  ▬명패▬ ▬명패▬│      │ │▬명패▬│▬명패▬│ │  명패(폭초과허용)
  │ [작업진행][선정][작업진행][감사][조사]  │      │ [작업진행][선정]│ │  전 책상 명령
  ├──────────────────────────────────┤      ├───────────────┤
  │ 보고 (접힘 feed, 기존 유지)            │      │ 보고            │
  └──────────────────────────────────┘      └───────────────┘
  ```
  - 히어로(thesis)는 **"당신의 책상" 픽셀 배너** — 파이프라인의 목적은 소유자의 결재다. 배너 부제가 결재 건수를 말로 전한다(색만 의존 금지).
  - 방(벽·걸레받이·체커 바닥·화분·액자)은 배경 레이어, 책상 유닛은 그 위에 반응형 배치. **가로 스크롤 없음**은 폰 `grid-cols-2` + 데스크톱 `flex-wrap`으로 보장(고정폭 오버플로가 없다). 5명은 폰에서 2·2·1로 감긴다. 데스크톱도 컨테이너가 `max-w-2xl`(≈672px, `pipeline-page.tsx:25`)이라 5유닛(`w-40`)이 한 줄에 다 안 들어가 감긴다(4+1 등) — 위 다이어그램의 한 줄은 인상도이지 강제가 아니다.
- **시그니처 요소 — 상태 = 말풍선(침묵 규칙).** 상태 신호는 오직 캐릭터 머리 위 픽셀 말풍선(tone색 테두리·텍스트·꼬리)이 나른다. **muted면 말풍선이 아예 없다** — 말풍선의 존재 자체가 "지금 무슨 일이 있다"는 신호다. 문구는 기존 `teamState.state`를 그대로 재사용. 이 한 곳에만 대담함을 쓰고 방·명패는 조용히.
- **모션 — 상시 애니메이션 없음(백로그 제약).** keyframe 루프·걷기·라이브 포즈 변화 없음. 허용은 버튼 `hover`/`transition`뿐. FEAT-06의 팔 `transition-transform`은 포즈 시스템과 함께 제거된다.
- **접근성 바닥.** 책상 유닛 SVG는 `role="img"`+`aria-label`("핸들 — 상태", OwnerBanner와 같은 패턴)로 이름·상태를 보조기술에 전달한다 — 말풍선·명패 텍스트는 유닛 SVG 안이라 `aria-hidden`이면 AT에서 소실되기 때문(FEAT-06은 상태가 HTML 텍스트였다 — 그 동등성을 지킨다). 순수 장식(배경·소품·스프라이트 픽셀)만 `aria-hidden`. 배너 건수는 부제 텍스트가 전한다(색 단독 전달 아님). 명령 버튼은 실제 HTML `<button>`이라 키보드 포커스·`useTransition` 유지. `crispEdges`·정적 렌더라 `prefers-reduced-motion` 위반 없음.
- **의도적 이탈(게이트 확인 대상):** (1) `heldId` 칩 — 게이트 결정(2026-08-15): **유지**. 말풍선은 시안대로 `state`만 담되, 항목 ID는 유닛 하단의 작은 HTML 칩으로 남긴다(FEAT-06의 정보 보존 — 스케치 반영). (2) 시안의 말풍선은 머리 중심에서 벗어나 있으나(`bubble()`의 좌측 고정 앵커 `x = cx - 20`에서 텍스트 폭만큼 오른쪽으로 부풀기 때문 — mockgen `:74-75`), 유닛 컴포넌트에서는 **머리 중앙 위로 정렬**한다(꼬리는 머리 중심을 가리킴) — 시안 그림체를 보존하는 레이아웃 적응이다. (3) 상단 `BriefingHeader`(파이프라인 브리핑/날짜/전역 실행 버튼)는 시안 재설계 범위 밖이라 **그대로 둔다**(픽셀화는 후속). (4) done 말풍선색 — 게이트 결정(2026-08-15): **`#6f6b64`(5.21:1)로 조정**(시안 `#8b877f`는 12px 대비 3.52:1로 AA 미달). `sprites.ts` 값과 `sprites.test.mjs`의 done 단언 모두 이 값으로 간다.

## 문제

백로그 `source`(요구 원천)가 지목한 것: FEAT-06의 **플랫 기하 SVG 그림체가 사용자 판정에서 기각됐다**("너무 별로") — 의도는 Gather풍 픽셀이었다. 시안 7회 반복(v1~v7)으로 그림체·말풍선·명패·전 책상 명령까지 확정됐고 `docs/design/FEAT-07/`에 계약으로 보존됐다. 요구는 네 층:

1. **그림체 전환**: 플랫 기하 SVG → 픽셀 스프라이트(문자열 격자→`<rect>`, `crispEdges`). 현재 `agent-character.tsx:129-164`는 곡선 `<path>`·회전 팔이라 픽셀이 아니다.
2. **캐릭터 완전 고정 + 상태=말풍선(침묵 규칙)**: 현재 `POSE_FOR_TONE`(`:7`)·`TONE_FILL`(`:16`)이 외형을 상태로 바꾼다 — 요구와 반대다. 외형은 `agentId` 고정, 상태는 말풍선으로 분리하고 muted면 말풍선 없음.
3. **전 책상 명령 + dev 「작업 진행」 추가**: 현재 `desk-commands.ts:6-10`은 dev(admin-dev·web-dev)에 명령이 없다. 화이트리스트에 `admin-work`·`web-work` 키·본문을 더하고 두 dev 책상을 등재한다(FEAT-06 「대안」 1의 채택 전환 — 사용자 결정). "배정 항목을 현재 status대로 처리, 게이트 전이 금지"이므로 안전(status가 곧 사용자의 게이트 결정).
4. **레이아웃**: 데스크톱 가로 방 / 폰 2열 격자, 가로 스크롤 금지. 현재 `OfficeZone`(`:146`)은 세로 스택 단일 컬럼뿐.

이 계획은 순수 계층(`briefing.ts`·`board.ts`)과 명령 보안 경계(`commands.ts` 화이트리스트, DB 무접근·외부 쓰기 하나)를 **재사용**하고, 격자·팔레트·말풍선 규칙을 새 순수 모듈(`sprites.ts`)로 뽑아 테스트 가능하게 둔 뒤, 렌더 계층만 픽셀로 교체한다. `briefing.ts`는 **수정하지 않는다**(침묵 규칙은 렌더 계층의 `tone==="muted"` 분기로 처리).

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/pipeline/sprites.ts` `(신규, 순수)` | 픽셀 팔레트·스프라이트 격자·소품 격자·정체성 외형·tone→말풍선색 상수 + `gridToRects`/`resolveCell`/`appearanceFor`/`bubbleColorFor`/`spriteExtra` 순수 함수. `mockgen.py`에서 값 이관. `sprites.test.mjs`로 덮인다 |
| `src/pipeline/sprites.test.mjs` `(신규)` | 격자 파서·팔레트 매핑·정체성·말풍선색(침묵 규칙) 계약 검증 |
| `src/ui/agent-character.tsx` `(수정, 재작성)` | 포즈/tone-채움 시스템 제거 → `PixelSprite`(12×12 격자를 `<g>` of `<rect>`로, `agentId`로만 결정). 부모 `<svg>` 안에 놓는 `<g>` |
| `src/ui/pixel-office.tsx` `(신규)` | `SpeechBubble`·`PixelDesk`(책상+소품+명패)·`PixelDeskUnit`·`PixelRoomBackdrop`(벽·걸레받이·체커·소품)·`PixelOffice`(반응형)·`OwnerBanner`(당신의 책상 픽셀 헤더). `mockgen.py`의 `seat`/`desk`/`bubble`/`owner_banner` 기하 이관 |
| `src/pipeline/commands.ts` `(수정)` | `PipelineCommandKey`에 `"admin-work" | "web-work"` 추가 + 두 본문(GATE_GUARD 포함). **기존 4키 본문은 글자 그대로 보존** |
| `src/pipeline/commands.test.mjs` `(수정)` | `KEYS`에 두 키 추가(불변식 루프가 커버). pipeline-run 바이트 동일 테스트 유지 + 두 신규 본문 단언 |
| `src/pipeline/desk-commands.ts` `(수정)` | `admin-dev`→`{admin-work, "작업 진행"}`, `web-dev`→`{web-work, "작업 진행"}` 등재 |
| `src/pipeline/desk-commands.test.mjs` `(수정)` | dev 책상이 이제 명령을 낸다(기존 null 단언 뒤집기) + 교차 검증에 5책상 포함 |
| `src/ui/pipeline-command.tsx` `(수정)` | 픽셀 스타일을 위해 선택적 `className?: string` prop 추가, `Button`에 전달 |
| `src/ui/pipeline-page.tsx` `(수정)` | `OfficeZone`/`OfficeDesk`/`DocumentsMark` 제거 → `PixelOffice`(from pixel-office) 사용, `InboxZone` 헤더를 `OwnerBanner`로 교체. 결재 카드 본문·피드·BriefingHeader는 유지 |

여기 없는 파일은 고치지 않는다. `agents.ts`·`board.ts`·`queries.ts`·`github.ts`·`briefing.ts`·`command-action.ts`·`auth/**`·`middleware.ts`·`globals.css`는 건드리지 않는다(순수 계층·인가 3중 방어선·외부 쓰기 경로·CSS 토큰은 변경 불필요 — 픽셀 팔레트는 리터럴 hex로 자족한다).

## 구현 스케치

### 1) `src/pipeline/sprites.ts` (신규) — 픽셀 데이터·순수 함수

`mockgen.py`의 `PAL`·`ID`·`TONE`·`sprite`·`prop_grid`·`render_grid`를 옮긴다. 격자는 순수 데이터, 렌더는 `<rect>` 스펙 배열을 내는 순수 함수. `Tone`은 `briefing`에서 **타입만** 가져온다(런타임 임포트 없음).

```ts
import type { Tone } from "./briefing";

// mockgen.py PAL — 픽셀 세계의 리터럴 팔레트(oklch 토큰 재사용 안 함).
export const PIXEL_PALETTE: Record<string, string> = {
  k: "#2b2420", s: "#f2c9a0", w: "#fffdf6",
  d: "#b08968", D: "#8b5e34", m: "#6b7f96", g: "#cfe3d8",
  f: "#efe8d8", F: "#e6dcc6", W: "#f7f3e8", B: "#e0d7c2",
  p: "#c8b7e0", G: "#7fa66a",
};

// mockgen.py sprite() rows — 12행 × 12열. H=머리, T=셔츠는 extra로 주입.
export const SPRITE_ROWS: readonly string[] = [
  "...kkkkkk...",
  "..kHHHHHHk..",
  ".kHHHHHHHHk.",
  ".kHssssssHk.",
  ".kskssssksk.", // 눈 2개(col 3,8) + 좌우 윤곽
  ".kssssssssk.",
  "..kssssssk..",
  "...kssssk...",
  "..kTTTTTTk..",
  ".kTTTTTTTTk.",
  ".kTkTTTTkTk.",
  ".ks.TTTT.sk.",
];

export type Prop = "papers" | "laptop" | "glass" | "compass";

// mockgen.py prop_grid() — 격자 + dy(책상 상판 기준 세로 셀 오프셋).
export const PROP_GRIDS: Record<Prop, { rows: readonly string[]; dy: number }> = {
  laptop: { rows: ["..mmmm..", ".mggggm.", "mmmmmmmm"], dy: -3 },
  papers: { rows: ["wwww.", "wwwww", "wwwww"], dy: -3 },
  glass: { rows: ["..kk.", ".kwwk", ".kwwk", "k.kk."], dy: -4 },
  compass: { rows: [".kkk.", "kwGwk", "kwwwk", ".kkk."], dy: -4 },
};

// mockgen.py ID — 정체성 외형(캐릭터 완전 고정). id는 앱의 full agentId.
export type Appearance = { hair: string; shirt: string; prop: Prop };
const APPEARANCE: Record<string, Appearance> = {
  pm: { hair: "#2b2420", shirt: "#4a4080", prop: "papers" },
  "admin-dev": { hair: "#5a3b28", shirt: "#5f8a5a", prop: "laptop" },
  "web-dev": { hair: "#7a5230", shirt: "#8a6b4f", prop: "laptop" },
  "doc-auditor": { hair: "#8f8a80", shirt: "#7a6296", prop: "glass" },
  "feature-scout": { hair: "#3c4a3a", shirt: "#4f7d78", prop: "compass" },
};
const FALLBACK_APPEARANCE: Appearance = {
  hair: "#5a3b28", shirt: "#6b7f96", prop: "papers",
};
export function appearanceFor(agentId: string): Appearance {
  return APPEARANCE[agentId] ?? FALLBACK_APPEARANCE; // Record<string,…> → undefined 가능
}
export function spriteExtra(app: Appearance): Record<string, string> {
  return { H: app.hair, T: app.shirt };
}

// mockgen.py TONE + 침묵 규칙. hold는 시안에 없어 새로 정한 값(디자인 방향 참조).
export const BUBBLE_TONE_COLOR: Record<Tone, string | null> = {
  pending: "#976014",
  active: "#3e5a86",
  done: "#6f6b64", // 게이트 결정(4): 시안 #8b877f는 12px 대비 3.52:1(AA 미달) → 5.21:1로 조정
  hold: "#9a5a2f", // 시안 밖 유일 결정
  muted: null, // 침묵 규칙: 말풍선 없음
};
export function bubbleColorFor(tone: Tone): string | null {
  return BUBBLE_TONE_COLOR[tone]; // 유한 유니온 키 → undefined 안 붙음
}

// mockgen.py render_grid — "."=투명, extra 우선 후 팔레트. 미지 문자는 스킵.
export function resolveCell(
  ch: string,
  extra: Record<string, string>,
): string | null {
  if (ch === ".") return null;
  return extra[ch] ?? PIXEL_PALETTE[ch] ?? null;
}

export type PixelRect = { x: number; y: number; size: number; color: string };
export function gridToRects(
  rows: readonly string[],
  extra: Record<string, string>,
  cell: number,
  originX = 0,
  originY = 0,
): PixelRect[] {
  const out: PixelRect[] = [];
  rows.forEach((row, j) => {
    Array.from(row).forEach((ch, i) => {
      const color = resolveCell(ch, extra);
      if (color === null) return;
      out.push({
        x: originX + i * cell,
        y: originY + j * cell,
        size: cell,
        color,
      });
    });
  });
  return out;
}
```

- `noUncheckedIndexedAccess`: `PIXEL_PALETTE`/`APPEARANCE`는 `Record<string,…>`라 인덱스가 `… | undefined` — `?? null`/`?? FALLBACK`로 좁힌다. `PROP_GRIDS`/`BUBBLE_TONE_COLOR`는 유한 유니온 키(`Prop`/`Tone`)라 정확한 값 접근 시 `undefined`가 안 붙는다. `gridToRects`는 `forEach`로 `ch`를 `string`으로 받아 배열 인덱스 접근을 피한다.
- 시안 밖 값은 `hold` 말풍선색 하나뿐. 나머지는 전부 `mockgen.py`에서 옮긴 리터럴.

### 2) `src/ui/agent-character.tsx` (재작성) — `PixelSprite`

포즈/tone-채움 시스템을 통째로 제거하고 격자 렌더만 남긴다. 부모 `<svg>` 안에 놓이도록 `<g>`를 낸다(배치는 부모가 `transform`으로).

```tsx
import {
  SPRITE_ROWS,
  appearanceFor,
  gridToRects,
  spriteExtra,
} from "~/pipeline/sprites";

// 12×12 픽셀 캐릭터. 외형은 agentId에서만 나온다(상태는 말풍선이 나른다).
export function PixelSprite({
  agentId,
  cell = 6,
}: {
  agentId: string;
  cell?: number;
}) {
  const rects = gridToRects(SPRITE_ROWS, spriteExtra(appearanceFor(agentId)), cell);
  return (
    <g shapeRendering="crispEdges">
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.size} height={r.size} fill={r.color} />
      ))}
    </g>
  );
}
```

### 3) `src/ui/pixel-office.tsx` (신규) — 방·책상·말풍선·배너

`mockgen.py`의 `seat`/`desk`/`bubble`/`owner_banner`/`scene` 기하를 옮긴다. 각 책상 유닛은 하나의 `<svg>`(말풍선+캐릭터+책상+소품+명패)로 그리고, **명령 버튼만 HTML `<button>`**으로 SVG 아래에 둔다(클릭·포커스·`useTransition`가 필요하므로). 유닛 내부 좌표는 `cell=6` 고정, 좌석 원점 x=0·`yChar=48`로 통일(그래서 5책상이 정렬된다). SVG는 CSS 폭으로 데스크톱/폰 크기를 낸다(격자는 스케일해도 `crispEdges`로 선명).

**말풍선**(mockgen `bubble()` 이식, 단 머리 중앙 정렬로 적응 — 디자인 방향 (2)):

```tsx
function SpeechBubble({ cx, text, color }: { cx: number; text: string; color: string }) {
  const w = Math.max(64, Math.min(13 * text.length + 24, 190));
  const x = cx - w / 2;
  const y = 8; // yChar(48) - 40
  return (
    <g shapeRendering="crispEdges">
      <rect x={x} y={y} width={w} height={26} fill="#fffdf6" stroke={color} strokeWidth={2} />
      <rect x={cx - 4} y={y + 26} width={8} height={5} fill="#fffdf6" stroke={color} strokeWidth={2} />
      <rect x={cx - 2} y={y + 31} width={4} height={4} fill={color} />
      <text x={cx} y={y + 17} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={12} fill={color}>
        {text}
      </text>
    </g>
  );
}
```

**책상+소품+명패**(mockgen `desk()` 이식). 책상 16셀, 상판 1셀(`d`)·앞면 2셀(`D`). 소품은 `x0+9*cell`, `y0+dy*cell`. 명패는 `pw = 9*len(name)+22`(책상 폭 초과 허용):

```tsx
function PixelDesk({ agentId, name }: { agentId: string; name: string }) {
  const cell = 6;
  const y0 = 104; // yChar(48) + 9*cell + 2
  const app = appearanceFor(agentId);
  const propSpec = PROP_GRIDS[app.prop];
  const propRects = gridToRects(propSpec.rows, {}, cell, 9 * cell, y0 + propSpec.dy * cell);
  const cx = 8 * cell; // 48
  const pw = 9 * name.length + 22;
  const px = cx - pw / 2;
  return (
    <g shapeRendering="crispEdges">
      {Array.from({ length: 16 }, (_, i) => (
        <g key={i}>
          <rect x={i * cell} y={y0} width={cell} height={cell} fill="#b08968" />
          <rect x={i * cell} y={y0 + cell} width={cell} height={cell * 2} fill="#8b5e34" />
        </g>
      ))}
      {propRects.map((r, i) => (
        <rect key={`p${i}`} x={r.x} y={r.y} width={r.size} height={r.size} fill={r.color} />
      ))}
      <rect x={px - 2} y={y0 + cell - 2} width={pw + 4} height={18} fill="#2b2420" />
      <rect x={px} y={y0 + cell} width={pw} height={14} fill="#3d342c" />
      <text x={cx} y={y0 + cell + 11} textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize={13} fontWeight={700} fill="#fffdf6">
        {name}
      </text>
    </g>
  );
}
```

**책상 유닛**(mockgen `seat()` 순서: 말풍선 → 캐릭터 → 책상, 그래서 책상이 캐릭터 다리를 덮는다). muted면 말풍선 생략(침묵 규칙, `bubbleColorFor(tone) === null` 분기). 명령 버튼은 `deskCommandFor` 있으면 픽셀 스타일 HTML 버튼:

```tsx
import type { TeamMember } from "~/pipeline/briefing";
import { appearanceFor, bubbleColorFor, PROP_GRIDS } from "~/pipeline/sprites";
import { deskCommandFor } from "~/pipeline/desk-commands";
import { PixelSprite } from "~/ui/agent-character";
import { PipelineCommandButton } from "~/ui/pipeline-command";

const PIXEL_BUTTON_CLASS =
  "h-auto rounded-none border-2 border-[#2b2420] bg-[#fffdf6] px-2 py-0.5 font-mono text-[11px] font-bold text-[#2b2420] shadow-[2px_2px_0_0_#3d342c] hover:bg-[#f2ecdc]";

function PixelDeskUnit({ member }: { member: TeamMember }) {
  const cmd = deskCommandFor(member.identity.id);
  const bubbleColor = bubbleColorFor(member.tone);
  return (
    <div className="flex w-40 flex-col items-center gap-1.5">
      <svg viewBox="-32 0 160 132" role="img" aria-label={`${member.identity.handle} — ${member.state}`} shapeRendering="crispEdges" className="w-full">
        {bubbleColor !== null && (
          <SpeechBubble cx={48} text={member.state} color={bubbleColor} />
        )}
        {/* 캐릭터: 좌석 x+12, yChar 48. 책상이 뒤에 그려져 다리를 덮는다 */}
        <g transform="translate(12 48)">
          <PixelSprite agentId={member.identity.id} cell={6} />
        </g>
        <PixelDesk agentId={member.identity.id} name={member.identity.handle} />
      </svg>
      <p className="font-sans text-xs text-[#5c5348]">{member.identity.role}</p>
      {member.heldId && (
        <span className="border border-[#e0d7c2] bg-[#fffdf6] px-1 font-mono text-[10px] text-[#5c5348]">
          {member.heldId}
        </span>
      )}
      {cmd && (
        <PipelineCommandButton command={cmd.key} label={cmd.label} className={PIXEL_BUTTON_CLASS} />
      )}
    </div>
  );
}
```

**방 배경**(mockgen `scene()`의 벽·걸레받이·체커 바닥 + 소품). 배경은 `pointer-events-none absolute inset-0` 레이어, 체커는 SVG `<pattern>`(12px 셀, `f`/`F`). 화분·액자는 mockgen 격자(`:118-119`)를 작은 모서리 SVG로(장식, `aria-hidden`) — 두 격자의 문자(`k w g` / `G p`)는 전부 `PIXEL_PALETTE`에 있어 extra 없이 해석된다. 밴드·소품 픽셀 위치는 시각 튜닝 대상:

```tsx
const FRAME_GRID: readonly string[] = ["kkkkk", "kwgwk", "kwwwk", "kkkkk"];
const PLANT_GRID: readonly string[] = [".GGG.", "GGGGG", ".GGG.", ".ppp.", ".ppp."];

function DecorSprite({ rows, cell, className }: { rows: readonly string[]; cell: number; className: string }) {
  const w = (rows[0]?.length ?? 0) * cell; // noUncheckedIndexedAccess: rows[0]은 string | undefined
  const h = rows.length * cell;
  return (
    <svg aria-hidden="true" width={w} height={h} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" className={className}>
      {gridToRects(rows, {}, cell).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.size} height={r.size} fill={r.color} />
      ))}
    </svg>
  );
}

function PixelRoomBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <svg className="h-full w-full" shapeRendering="crispEdges">
        <defs>
          <pattern id="pixel-floor" width={24} height={24} patternUnits="userSpaceOnUse">
            <rect width={24} height={24} fill="#efe8d8" />
            <rect width={12} height={12} fill="#e6dcc6" />
            <rect x={12} y={12} width={12} height={12} fill="#e6dcc6" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="#f7f3e8" />
        <rect y={64} width="100%" height={8} fill="#e0d7c2" />
        <rect y={72} width="100%" height="100%" fill="url(#pixel-floor)" />
      </svg>
      <DecorSprite rows={FRAME_GRID} cell={5} className="absolute left-6 top-3" />
      <DecorSprite rows={PLANT_GRID} cell={6} className="absolute right-4 top-8" />
    </div>
  );
}
```

**사무실**(반응형: 폰 2열 격자 → 데스크톱 가로 flex-wrap, 가로 스크롤 없음):

```tsx
export function PixelOffice({ team }: { team: TeamMember[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-briefing-display text-sm tracking-widest text-muted-foreground">사무실</h2>
      <div className="relative overflow-hidden rounded-2xl border border-border">
        <PixelRoomBackdrop />
        <div className="relative grid grid-cols-2 justify-items-center gap-x-2 gap-y-6 p-4 sm:flex sm:flex-row sm:flex-wrap sm:justify-center sm:gap-4">
          {team.map((member) => (
            <PixelDeskUnit key={member.identity.id} member={member} />
          ))}
        </div>
      </div>
    </section>
  );
}
```

**소유자 배너**(mockgen `owner_banner()` 이식). 부제는 `pendingCount`로 동적. `role="img"`+`aria-label`로 건수를 텍스트 전달:

```tsx
import { gridToRects } from "~/pipeline/sprites";

export function OwnerBanner({ pendingCount }: { pendingCount: number }) {
  const subtitle =
    pendingCount > 0
      ? `결재 ${pendingCount}건이 도장을 기다립니다`
      : "지금 도장을 기다리는 결재가 없습니다";
  const docRects = gridToRects(
    ["..wwwww..", ".wwwwwww.", ".wwwwwww.", "wwwwwwwww", "wwwwwwwww"],
    {},
    6, 60, 26,
  );
  const stampRects = gridToRects([".oo.", "oooo", "oooo", ".oo."], { o: "#976014" }, 6, 150, 30);
  return (
    <svg viewBox="0 0 660 96" role="img" aria-label={`당신의 책상 — ${subtitle}`} shapeRendering="crispEdges" className="w-full">
      <rect width={660} height={96} fill="#f5efdf" />
      {Array.from({ length: 44 }, (_, i) => (
        <g key={i}>
          <rect x={i * 15} y={56} width={15} height={8} fill="#b08968" />
          <rect x={i * 15} y={64} width={15} height={26} fill="#8b5e34" />
        </g>
      ))}
      {docRects.map((r, i) => (
        <rect key={`d${i}`} x={r.x} y={r.y} width={r.size} height={r.size} fill={r.color} />
      ))}
      <rect x={57} y={23} width={60} height={36} fill="none" stroke="#2b2420" strokeWidth={2} />
      {stampRects.map((r, i) => (
        <rect key={`s${i}`} x={r.x} y={r.y} width={r.size} height={r.size} fill={r.color} />
      ))}
      <text x={200} y={38} fontFamily="ui-monospace, monospace" fontSize={15} fontWeight={700} fill="#2b2420">당신의 책상</text>
      <text x={200} y={54} fontFamily="ui-sans-serif, system-ui" fontSize={12} fill="#976014">{subtitle}</text>
    </svg>
  );
}
```

- 소품 격자(`docs`·`stamp`)는 `gridToRects`로 렌더 — `stamp`은 `extra={o:"#976014"}`로 매핑(팔레트 밖 문자를 extra가 해결하는 계약). 명패·책상·말풍선·배너의 리터럴 기하(좌표·폭 공식)는 전부 `mockgen.py`에서 옮겼다.
- `noUncheckedIndexedAccess`: `PROP_GRIDS[app.prop]`는 유한 유니온 키라 안전, `Array.from({length:16})`·`.map`은 인덱스 접근이 없다.

### 4) `src/pipeline/commands.ts` (수정) — 화이트리스트 확장

바뀌는 줄만(before는 적기 직전 재확인함). **기존 4키 본문은 손대지 않는다**:

```ts
// before (:3-7)
export type PipelineCommandKey =
  | "pipeline-run"
  | "pm-select"
  | "audit-run"
  | "scout-run";
// after — dev 「작업 진행」 두 키 추가
export type PipelineCommandKey =
  | "pipeline-run"
  | "pm-select"
  | "audit-run"
  | "scout-run"
  | "admin-work"
  | "web-work";
```

```ts
// PIPELINE_COMMANDS 맵(:14-21) 끝에 두 항목 추가(기존 4개는 글자 그대로 유지):
  "admin-work": `admin-dev로서 PROJECT_BOARD.md에서 배정된 항목을 현재 status와 런북 규칙대로 처리해 주세요. ${GATE_GUARD}`,
  "web-work": `web-dev로서 PROJECT_BOARD.md에서 배정된 항목을 현재 status와 런북 규칙대로 처리해 주세요. ${GATE_GUARD}`,
```

- 두 본문 다 `GATE_GUARD`("게이트 전이(계획지시·구현승인)는 사용자 몫이므로 status를 바꾸지 마세요.")를 포함하고 `"[claude]"`로 시작하지 않는다 — 기존 불변식·테스트를 그대로 통과한다. `resolvePipelineCommand`는 변경 없음(`Record<PipelineCommandKey,string>`이 새 키를 자동 포함). `command-action.ts`도 변경 불필요(같은 시그니처).
- 두 본문은 **새 리터럴**이라 사용자가 게이트에서 문구를 판단할 대상이다.

### 5) `src/pipeline/desk-commands.ts` (수정) — dev 책상 등재

```ts
// before (:6-10)
const DESK_COMMANDS: Record<string, DeskCommand> = {
  pm: { key: "pm-select", label: "선정 실행" },
  "doc-auditor": { key: "audit-run", label: "감사 실행" },
  "feature-scout": { key: "scout-run", label: "조사 실행" },
};
// after — dev 두 책상 추가(FEAT-06 「대안」1 채택)
const DESK_COMMANDS: Record<string, DeskCommand> = {
  pm: { key: "pm-select", label: "선정 실행" },
  "admin-dev": { key: "admin-work", label: "작업 진행" },
  "web-dev": { key: "web-work", label: "작업 진행" },
  "doc-auditor": { key: "audit-run", label: "감사 실행" },
  "feature-scout": { key: "scout-run", label: "조사 실행" },
};
```

`deskCommandFor`는 변경 없음(`?? null` 유지). 이제 5책상 전부 버튼을 가진다. 파일 상단 주석(`:5` "안전한 명령이 있는 책상만 등재. dev(admin-dev·web-dev)는 없음 — 「대안」 참고.")은 이 변경으로 거짓이 되므로 `// 5책상 전부 등재 — dev 「작업 진행」은 FEAT-07에서 추가(FEAT-06 「대안」1 채택).`로 교체한다.

### 6) `src/ui/pipeline-command.tsx` (수정) — `className` prop

```tsx
// before (:10-16)
export function PipelineCommandButton({
  command,
  label,
}: {
  command: PipelineCommandKey;
  label: string;
}) {
// after — 픽셀 스타일 주입용 선택적 className
export function PipelineCommandButton({
  command,
  label,
  className,
}: {
  command: PipelineCommandKey;
  label: string;
  className?: string;
}) {
```

```tsx
// before (:31)
    <Button type="button" disabled={isPending} onClick={handleClick}>
// after — className 전달(cn=twMerge라 픽셀 클래스가 기본 variant를 덮는다)
    <Button type="button" disabled={isPending} onClick={handleClick} className={className}>
```

토스트·`useTransition`·라벨 로직은 그대로. `className` 미전달 시 기존 shadcn 기본 스타일(BriefingHeader 전역 버튼)이 유지된다.

### 7) `src/ui/pipeline-page.tsx` (수정) — `PixelOffice` + `OwnerBanner`

`OfficeZone`/`OfficeDesk`/`DocumentsMark`를 제거하고, `AgentCharacter`/`deskCommandFor` 임포트를 뗀다. `PixelOffice`·`OwnerBanner`를 `~/ui/pixel-office`에서 가져온다.

```tsx
// 임포트 교체(:11-13 부근)
// - import { AgentCharacter } from "~/ui/agent-character";
// - import { deskCommandFor } from "~/pipeline/desk-commands";
import { OwnerBanner, PixelOffice } from "~/ui/pixel-office";
```

type 임포트 블록(`:5-10`)에서 **`TeamMember`도 제거한다** — 유일한 사용처(`OfficeZone`)가
`pixel-office.tsx`로 이동하므로, 남기면 `no-unused-vars` 경고가 나 "경고 0" 기준을 깬다
(`Briefing`·`SpeechItem`·`Tone`은 계속 쓰이므로 유지).

`PipelineBriefing`(`:23-32`)에서 `OfficeZone`을 `PixelOffice`로, `InboxZone`에 `pendingCount` 전달:

```tsx
// before
      <InboxZone items={briefing.inbox} />
      <OfficeZone team={briefing.team} />
// after
      <InboxZone items={briefing.inbox} pendingCount={briefing.pendingCount} />
      <PixelOffice team={briefing.team} />
```

`InboxZone` 헤더(`SectionLabel "당신의 책상"` + `DocumentsMark`, `:85-89`)를 `OwnerBanner`로 교체. 카드·0건 안내 본문은 유지(혼합안 — 정보 밀도 보존):

```tsx
// before
function InboxZone({ items }: { items: SpeechItem[] }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SectionLabel>당신의 책상</SectionLabel>
        <DocumentsMark />
      </div>
// after
function InboxZone({ items, pendingCount }: { items: SpeechItem[]; pendingCount: number }) {
  return (
    <section className="flex flex-col gap-3">
      <OwnerBanner pendingCount={pendingCount} />
```

`OfficeZone`·`OfficeDesk`·`DocumentsMark` 함수(`:63-81,146-192`)를 삭제한다. `SectionLabel`·`TONE_TEXT`는 `FeedZone`이 계속 쓰므로 유지, `AgentAvatar`도 `InboxCard`/`FeedZone`이 계속 쓰므로 유지. `BriefingHeader`(전역 `pipeline-run` 버튼 포함)는 그대로.

## 테스트

- **덮는 것 (순수 함수, `*.test.mjs`):**
  - `sprites.test.mjs` (신규):
    - `resolveCell`: `"."`→`null`; `"k"`→`"#2b2420"`, `"s"`→`"#f2c9a0"`(팔레트); `"H"`/`"T"`는 `extra`에서 해결(머리/셔츠); 미지 문자(`"z"`)→`null`; `extra`가 팔레트보다 우선.
    - `SPRITE_ROWS`: 12행, 각 12열; 눈 행(index 4 `.kskssssksk.`)의 `"k"`가 col 3·8에 위치.
    - `gridToRects`: `"."` 스킵; 알려진 격자의 rect 개수·origin+cell 좌표; 전부 투명한 행은 0개 기여.
    - `PROP_GRIDS`: laptop/papers/glass/compass 존재, `dy`가 각 `-3/-3/-4/-4`.
    - `appearanceFor`: 5에이전트가 각 정체성으로(pm `#4a4080`/papers, admin-dev `#5f8a5a`/laptop, web-dev `#8a6b4f`/laptop, doc-auditor `#7a6296`/glass, feature-scout `#4f7d78`/compass); 미지 id→`FALLBACK_APPEARANCE`.
    - `bubbleColorFor`: **muted→`null`(침묵 규칙)**; pending `#976014`, active `#3e5a86`, done `#6f6b64`(게이트 조정값), hold non-null.
  - `commands.test.mjs` (수정): `KEYS`에 `"admin-work"`·`"web-work"` 추가(비어있지 않음·`[claude]` 미시작·게이트 가드 포함 루프가 자동 커버). `pipeline-run` 바이트 동일 테스트는 그대로. 신규 두 본문이 각각 `"배정된 항목을 현재 status와 런북 규칙대로"` + 게이트 가드를 포함함을 단언.
  - `desk-commands.test.mjs` (수정):
    - `deskCommandFor("admin-dev")`=`{key:"admin-work", label:"작업 진행"}`, `"web-dev"`=`{key:"web-work", label:"작업 진행"}`로 **기존 null 단언을 뒤집는다**. pm/doc-auditor/feature-scout는 그대로.
    - "returns null" 테스트는 미지 id(`"unknown"`)만 남긴다.
    - 교차 검증 루프에 5책상 전부 포함 — 모든 `key`가 `resolvePipelineCommand`로 non-null(두 모듈 드리프트 방지).
- **못 덮는 범위 (Node 러너·DOM/외부 I/O 없음 — 배포 후 데스크톱+폰 수동 확인):**
  - `PixelSprite`/`SpeechBubble`/`PixelDesk`/`PixelDeskUnit`/`OwnerBanner`/`PixelRoomBackdrop`의 SVG 렌더·`crispEdges` 선명도·격자 시각 결과·명패 폭 초과·말풍선 꼬리 기하.
  - 반응형 레이아웃(폰 2열 격자 / 데스크톱 가로 flex-wrap)·가로 스크롤 없음·방 배경(벽·걸레받이·체커·소품)·명령 버튼 픽셀 스타일(`shadow`·hover).
  - `PipelineCommandButton`의 `useTransition`·토스트·클릭, `postPipelineCommand`의 `requireAdmin()` 게이트·GitHub POST(신규 `admin-work`/`web-work` 본문이 이슈 #87로 나가는 경로).
- **CLAUDE.md 테스트 표(읽기 전용 — 직접 수정 금지):** `sprites.test.mjs` 행 추가가 필요하다. B단계 `비고:`로 보고한다(추가할 행: `pipeline/sprites.test.mjs | 픽셀 격자 파서·팔레트 매핑·정체성 외형·tone→말풍선색(muted=말풍선 없음) 계약`).

## 범위 밖 의존

없음. 전부 `apps/admin/src/**` 안이다. `@repo/db`·다른 워크스페이스·DB 스키마를 건드리지 않는다. DB 접근은 추가되지 않는다(읽기 전용 유지). 외부 쓰기도 **늘리지 않는다** — dev 「작업 진행」도 기존 `command-action.ts`의 같은 `ISSUE_COMMENTS_URL` 하나로 가고 본문만 화이트리스트에서 달라진다(`requireAdmin()` 뒤·되돌릴 수 있음·기록 남음이라는 성격 불변). GitHub 호출은 서버 측이라 CSP `connect-src`와 무관하다. `analytics/reporting.ts` 순수성·`@repo/db` analytics 계약도 이 작업과 무관(건드리지 않음).

## 대안

- **하나의 큰 SVG로 방 전체를 그리고 명령 버튼을 SVG 위에 절대배치** — mockgen `scene()`에 가장 충실하나, 스케일되는 SVG 위에 HTML 버튼을 정확히 겹치는 것이 취약하고 SVG `<text>` 버튼은 키보드 포커스가 나쁘다. **채택 안 함** — 책상 유닛별 SVG(시각) + HTML 버튼(상호작용)으로 나눠 접근성·정렬을 지킨다.
- **픽셀 색을 CSS oklch 토큰(`--stamp` 등)으로 재사용** — 토큰 일원화 이점이 있으나 시안은 **자체 리터럴 hex 팔레트**를 쓰고(값이 oklch 토큰과 다르다) 픽셀 세계는 라이트 전용 자족 시스템이다. **채택 안 함** — `sprites.ts` 상수로 고정(시안과 값 일치 보장). `globals.css`도 안 건드린다.
- **`heldId` 칩을 사무실에 유지** — FEAT-06이 더한 항목 ID 앵커를 보존하면 정보가 는다. 하지만 승인 시안 말풍선은 `state`만 담는다. 게이트 결정: **유지 채택**(유닛 하단 작은 칩 — 구현 스케치 반영).
- **상단 `BriefingHeader`도 픽셀화** — 세리프 헤더와 픽셀 방이 미세하게 충돌한다. 하지만 시안은 헤더를 재설계 범위에 넣지 않았고 전역 실행 버튼이 거기 있다. **이번 범위 밖**(후속 항목). 지금은 그대로 둔다.
- **`hold` 말풍선색을 시안에서 못 옮기므로 muted처럼 말풍선 없음으로 처리** — 스코프가 작아지나 보류 상태(든 항목 있음)가 사무실에서 무신호가 돼 "쉬는 중"과 구분되지 않는다. **채택 안 함** — `#9a5a2f` 한 값을 새로 정해 신호를 남긴다(게이트에서 색 조정 가능).
