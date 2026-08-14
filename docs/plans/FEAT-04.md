# FEAT-04: `/pipeline` UI/UX 개편 — 결재함·팀·보고 3구역 + 캐릭터 발화 렌더링

agent: admin-dev

## 현재 동작

- `app/pipeline/page.tsx:16-28`: `requireAdmin()` 뒤에 `getPipelineBoard()`로 `BoardSection[]`를 받아 `<PipelineBoard sections={sections} />`에 그대로 넘긴다. `dynamic = "force-dynamic"`(page.tsx:14)이라 매 요청 렌더된다.
- `pipeline/queries.ts:6-13`: dev 브랜치 `PROJECT_BOARD.md`를 `no-store`로 fetch해 `parseBoard`로 파싱한다.
- `pipeline/board.ts:4-13`: `BoardItem = { checked, id, title, agent, area, status, reason(근거), result(결과) }`. 섹션 날짜(`## 2026-08-14` 등)는 `BoardSection.heading`(board.ts:15-18)에만 있고 개별 항목은 자기 섹션 날짜를 모른다.
- `ui/pipeline-page.tsx`가 화면을 만든다. 문제의 근원이 여기다:
  - `pipeline-page.tsx:34-39`: 섹션마다 `<h2>`(섹션 헤딩) + `grid gap-4 md:grid-cols-2` — **모든 항목을 같은 크기의 2열 등간격 카드 그리드**로 편다.
  - `pipeline-page.tsx:55-63`: 카드 본문이 `agent: …`, `area: …`, 그리고 `결과: {result}` 또는 `근거: {reason}`을 **원문 그대로** 출력한다(라벨:값 덤프).
  - `pipeline-page.tsx:13-19`: `STATUS_BADGE_VARIANT`는 `완료→secondary`, `보류→destructive`뿐이고 그 외 status(`승인대기`·`검토대기`·`계획지시`·`구현승인`)는 전부 `default`(같은 검정 배지) — 결정 대기와 진행/완료가 시각적으로 구분되지 않는다.
  - 항목은 섹션 순서대로만 배치된다. 현재 보드에서 `승인대기`인 FEAT-01은 가장 오래된 섹션(`## 2026-08-03`)에 있어 **완료 기록들보다 아래(화면 맨 끝)**에 묻힌다.
- `pipeline/command-action.ts:18-49`: `postPipelineCommand()` 서버 액션 — 이슈 #87에 코멘트 POST. status는 바꾸지 않는다(command-action.ts:9-16). `ui/pipeline-command.tsx`의 "Run pipeline" 버튼이 이걸 호출한다.
- 서체·색: `styles/globals.css`의 팔레트는 사실상 무채색 + `destructive`(빨강) + `--picked`(파랑, 클립 선택 전용 — globals.css:68-73에서 "일반 강조색으로 쓰지 말 것"으로 못 박음)뿐이다. `--font-sans`(globals.css:7-9)는 `var(--font-geist-sans)`를 가리키지만 `layout.tsx`가 그 변수를 세우지 않아 시스템 폰트로 폴백한다. 한글 대응 폰트 지정도, 디스플레이 서체도 없다.

## 문제

백로그 `source`(TASK_BACKLOG.md:30-36)가 지목한 문제는 **"같은 데이터인데 사람이 보고받는 화면이 아니라 데이터 덤프"**다. 코드에서 확인되는 두 결함이 그것이다: (1) `pipeline-page.tsx:55-63`이 `결과`/`근거` 원문을 그대로 부어 읽기 어렵고, (2) `pipeline-page.tsx:34-39`의 등간격 그리드 + `13-19`의 뭉뚱그린 배지 탓에 **사용자 결정 대기(승인대기·검토대기)가 완료 기록과 같은 위계**로 섞이며 실제로 화면 맨 아래로 밀린다.

요구는 같은 보드 투영을 **3구역(결재함·팀 현황·보고 피드)**으로 재구성하고, 모든 정보를 **에이전트 캐릭터의 역할별 발화 한 줄**로 나르되 그 발화를 **보드 상태에서 결정적 템플릿**으로 생성하는 것이다(LLM·자체 상태 저장 금지 — 투영 원칙 유지). 파서(`board.ts`)·명령 액션(`command-action.ts`)·인증은 재사용한다.

백로그와 코드가 어긋나는 지점은 없다. 다만 파생 데이터 하나가 부족하다: **항목은 자기 섹션 날짜를 모른다**(board.ts:4-13에 `sectionDate` 없음). "N일째" 계산에 필요하므로, `board.ts`는 건드리지 않고 상위에서 섹션→항목으로 날짜를 접붙이는 순수 변환 계층을 새로 둔다.

## 디자인 방향 (frontend-design 2-pass)

`frontend-design` 스킬을 로드해 2-pass(계획→자기비평→확정)로 도출했다. 이 절은 사용자가 게이트에서 **생김새**를 판단하는 근거다.

**1-pass 초안과 폐기 사유(자기비평).** 첫 발상은 "브로드시트(신문 조판) 보드 — 헤어라인 구분선, 라운드 0, 조밀한 컬럼"이었다. 폐기했다. 이유: 그건 AI 기본값 3종 중 하나이고, 무엇보다 **FEAT-03이 이미 실패시킨 "보드/그리드"의 변주**다. 브리프의 핵심은 "사람이 나에게 보고한다"이므로, 조판이 아니라 **말하는 캐릭터**가 히어로여야 한다. 그래서 신문 조판 대신 **결재 서류를 든 팀원의 말풍선**으로 방향을 틀었다.

**서브젝트 고정.** 이 화면의 주인은 1인 SaaS 소유자(Sangeok) 한 명, 기기는 폰, 단 하나의 임무는 **"내 결정이 필요한 것"을 먼저 보여주고 팀이 각자 목소리로 보고하게 하는 것**이다. 세계관은 "AI 에이전트 = 동료 팀"이며, 한국 사무실의 **결재(도장)·결재함·말풍선** 어휘에서 고유성을 끌어온다.

**색 토큰(6개).** 무채색 기반은 유지하되, "결정 대기 = 강조 / 완료 = 침묵"을 색으로 코드화한다. `--picked`(클립 전용)는 재사용하지 않고 새 토큰을 추가한다.

| 이름 | 역할 | oklch (light) | ≈hex | 쓰임 |
| --- | --- | --- | --- | --- |
| `paper`(`--briefing`) | 결재판 종이 바탕 | `oklch(0.985 0.006 85)` | `#FBF9F4` | 파이프라인 페이지 배경(따뜻한 오프화이트). **전역 `--background`는 건드리지 않고 이 페이지 래퍼에만** |
| `ink` | 본문 먹 | 기존 `--foreground` 재사용 `oklch(0.145 0 0)` | `#242424` | 제목·본문 |
| `stamp`(`--stamp`) | **시그니처 강조** — 결재 도장 인주(호박/마리골드) | `oklch(0.58 0.12 62)` | `#976014` | 결재함 강조, 도장 테두리, pending 발화 |
| `active`(`--active`) | 진행 중(차분한 남색) | `oklch(0.50 0.09 250)` | `#3E5A86` | 계획지시·구현승인 |
| `silence`(`--silence`) | 완료 = 침묵(흑연 회색) | `oklch(0.58 0.008 80)` | `#8B877F` | 완료 발화(저강조) |
| `hold`(`--hold`) | 보류(녹슨 흙색, destructive 빨강과 구별) | `oklch(0.50 0.13 42)` | `#9B4A2A` | 보류 |

보조로 `stamp-soft`(`oklch(0.94 0.035 78)`, 결재함 카드 배경 옅은 호박 틴트) 하나를 더 둔다. 보란함을 쓰는 곳은 **결재함의 호박(stamp) 한 곳**이며 나머지는 조용히 둔다(스킬: "대담함은 한 곳에").

**타이포 역할.** 시스템 서체 페어링으로 personality를 낸다(웹폰트 무설치 = 모바일·빌드 리스크 0; 웹폰트 격상은 「대안」).
- **디스플레이/정체성**(페이지 제목·구역 라벨·캐릭터 핸들): 한글 **명조/바탕 계열 세리프** 스택 `--font-briefing-display`. 이름을 세리프로 둬 "결재 서류·메모" 목소리를 준다.
  **기기 현실**: 한글 세리프가 시스템에 있는 것은 사실상 Windows(바탕)뿐이다 — **폰(iOS·Android)에서 한글 글리프는 고딕으로 폴백**되어, 세리프 정체성은 데스크톱에서 온전하고 폰에서는 라틴 핸들(PM·admin-dev)·숫자(날짜)에만 부분적으로 남는다. 주 기기(폰)에서 한글까지 세리프를 원하면 「대안」의 웹폰트 격상이 필요하다.
- **본문/발화/메타**: 기존 `--font-sans`에 한글 고딕(고딕=말하는 목소리) 폴백을 덧댄다. 발화는 산세리프로 "말하는" 느낌.
- 위계: 라벨(작게·자간 넓게·세리프) › 발화(본문 크기·고딕) › 항목ID·status(작게·muted). 항목ID·제목·발화·메타가 한눈에 갈리게 한다.

**레이아웃 개념.** 대시보드 6xl 그리드가 아니라 **폰에서 읽는 단일 컬럼(max-w 640px)**. 위→아래로 결재함(크게) → 팀 현황(칩, 조밀) → 보고 피드(아주 조밀). 등간격 카드 그리드 금지.

```
┌───────────────────────────┐
│  파이프라인 브리핑    8월15일 │  eyebrow(serif) + 날짜(serif) + [파이프라인 실행]
│  결정 대기 1건              │  정보 요약(인사말 아님)
├───────────────────────────┤
│  결재함                    │  구역 라벨(serif)
│ ╭───────────────────────╮ │  ← 말풍선 카드(stamp-soft 배경, stamp 테두리)
│ │ 📋 PM · 선정·발주        │ │
│ │ "FEAT-01, 13일째 계획    │ │  ← 발화 한 줄(stamp)
│ │  지시를 기다립니다."     │ │
│ │ FEAT-01 · 승인대기 [결재]│ │  ← 메타 + 결재 도장 마크(시그니처)
│ ╰───────────────────────╯ │
├───────────────────────────┤
│  팀 현황                   │
│ [📋 PM 1건 요청][🛠️admin 작업]│  ← 칩 wrap
│ [🧩web 완료][🔍auditor 대기]…│
├───────────────────────────┤
│  보고                      │
│ 🛠️ "FEAT-04 계획을 작성…" ▸│  ← <details> 접힘, active/silence 톤
│ 🛠️ "/pipeline 라우트를 …" ▸│  ← 완료=침묵(silence)
│ 🧩 "pricingFaq 두 답변을…" ▸│
└───────────────────────────┘
```

**시그니처 요소.** **결재 도장(빈 인장) + 말풍선.** 결재함 항목은 캐릭터의 말풍선으로 뜨고, 옆에 호박색 "결재" 인장 마크가 붙어 "당신의 도장을 기다린다"를 표현한다 — 페이지에서 유일하게 대담한 요소. 결재함이 비면 인장 자리에 **"결재함이 비었습니다"** 라는 정돈된 빈 상태(휴식의 초대)로 바꾼다.

**품질 바닥.** 모바일 단일 컬럼, 키보드 포커스 보이게(`<details>` 네이티브 접기 → JS 없이 접근성·키보드 확보), status 색은 텍스트 대비 AA를 넘게 잡음.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/pipeline/agents.ts` `(신규)` | 에이전트 정체성 맵(핸들·역할·이모지) + `identityFor`(미지 agent 폴백)·`initialOf`. 순수 |
| `src/pipeline/briefing.ts` `(신규)` | `BoardSection[]`+`today`→`Briefing` 순수 변환. `daysOnBoard`·`nthDay`·`firstSentence`·발화 템플릿·팀 상태 도출 |
| `src/pipeline/briefing.test.mjs` `(신규)` | 위 순수 함수 분기 테스트 |
| `src/ui/agent-avatar.tsx` `(신규)` | `<AgentAvatar>` — 이모지/이니셜. **추후 일러스트 교체용으로 분리** |
| `src/ui/pipeline-page.tsx` | 3구역 브리핑 렌더로 **재작성**(props를 `Briefing`으로) |
| `src/app/pipeline/page.tsx` | `buildBriefing(sections, new Date())` 후 결과 전달 |
| `src/ui/pipeline-command.tsx` | "Run pipeline" 버튼 문구를 한국어로(페이지 톤 일치) |
| `src/styles/globals.css` | stamp/stamp-soft/active/silence/hold/briefing 토큰 + `--font-briefing-display` + `--font-sans` 한글 폴백 |

여기 없는 파일(`board.ts`·`queries.ts`·`command-action.ts`·`github.ts`·`auth/**`·`middleware.ts`·`env.js`·`next.config.js`·`layout.tsx`)은 고치지 않는다.

## 구현 스케치

### 발화 템플릿 — 상태→문장 결정적 매핑

`today`는 순수 함수 인자로 주입(테스트 결정성). `N일째` = `daysOnBoard(섹션날짜, today) + 1`(보드에 오른 날을 1일째). 날짜를 못 구하면 "N일째"를 **생략**한다.

**결재함**(status ∈ {승인대기, 검토대기}, 보드 순서 유지):

| status | 발화 주체 | 발화 한 줄(리터럴, `{N}`·`{ID}` 치환) | detail(펼침) | tone |
| --- | --- | --- | --- | --- |
| 승인대기 | `pm` | `{ID}, {N}일째 계획 지시를 기다립니다.` | `근거` | pending |
| 검토대기 | 항목의 `agent` | `{ID} 계획서를 올렸습니다 — {N}일째 검토 대기 중입니다.` | `결과`?? `근거` | pending |

**보고 피드**(status ∉ {승인대기, 검토대기}, 보드 순서=최신순 유지):

| status | 발화 주체 | 발화 한 줄 | detail | tone |
| --- | --- | --- | --- | --- |
| 계획지시 | `agent` | `{ID} 계획을 작성하고 있습니다.` | `근거` | active |
| 구현승인 | `agent` | `{ID} 구현에 착수했습니다.` | `근거` | active |
| 완료 | `agent` | `firstSentence(결과)` (없으면 `{ID} 완료했습니다.`) | `결과`?? `근거` | done |
| 보류 | `agent` | `firstSentence(결과 ?? 근거)` (없으면 `{ID} 보류했습니다.`) | `결과`?? `근거` | hold |
| (null/기타) | `agent` | `firstSentence(근거)` (없으면 `{ID}`) | `결과`?? `근거` | muted |

**팀 현황**(고정 로스터 순서 pm→admin-dev→web-dev→doc-auditor→feature-scout, 상태 한 줄):

| 조건(우선순위 순) | 상태 문구 | tone |
| --- | --- | --- |
| `pm`: 승인대기 k건(>0) | `{k}건 결재 요청 중` | pending |
| `pm`: 승인대기 0건 | `새 선정 없음` | muted |
| dev: 자기 검토대기 항목 있음 | `{ID} 검토 요청 중` | pending |
| dev: 자기 계획지시/구현승인 있음 | `{ID} 작업 중` | active |
| dev: 자기 보류 있음 | `{ID} 보류` | hold |
| dev: 자기 완료 있음 | `최근 {ID} 완료` | done |
| 그 외(감사·스카우트 등 항목 없음) | `대기 중` | muted |

### `src/pipeline/agents.ts` (신규)

```ts
// 순수. 발화 주체의 정체성. board.ts/reporting.ts와 같은 이유로 DB·fetch를 들이지 않는다.
export type AgentIdentity = {
  id: string;
  handle: string; // 화면 이름(보드 agent 필드와 연결)
  role: string;
  emoji: string; // 초기 아바타(추후 일러스트 교체)
};

const ROSTER: Record<string, AgentIdentity> = {
  pm: { id: "pm", handle: "PM", role: "선정·발주", emoji: "📋" },
  "admin-dev": { id: "admin-dev", handle: "admin-dev", role: "어드민 개발", emoji: "🛠️" },
  "web-dev": { id: "web-dev", handle: "web-dev", role: "웹 개발", emoji: "🧩" },
  "doc-auditor": { id: "doc-auditor", handle: "doc-auditor", role: "문서 감사", emoji: "🔍" },
  "feature-scout": { id: "feature-scout", handle: "feature-scout", role: "기능 조사", emoji: "🧭" },
};

export const ROSTER_ORDER: readonly string[] = [
  "pm", "admin-dev", "web-dev", "doc-auditor", "feature-scout",
];

export function identityFor(agentId: string | null): AgentIdentity {
  if (agentId !== null) {
    const known = ROSTER[agentId]; // noUncheckedIndexedAccess: AgentIdentity | undefined
    if (known !== undefined) return known;
    return { id: agentId, handle: agentId, role: "에이전트", emoji: "" };
  }
  return { id: "system", handle: "시스템", role: "미지정", emoji: "•" };
}

export function initialOf(identity: AgentIdentity): string {
  const ch = identity.handle.trim().charAt(0); // charAt은 없으면 "" 반환
  return ch === "" ? "?" : ch.toUpperCase();
}
```

### `src/pipeline/briefing.ts` (신규)

```ts
import type { BoardItem, BoardSection } from "./board";
import { identityFor, ROSTER_ORDER, type AgentIdentity } from "./agents";

export type Tone = "pending" | "active" | "done" | "hold" | "muted";

export type SpeechItem = {
  key: string; id: string; title: string; status: string | null;
  speaker: AgentIdentity; line: string; detail: string | null; tone: Tone;
};
export type TeamMember = { identity: AgentIdentity; state: string; tone: Tone };
export type Briefing = {
  today: string; pendingCount: number;
  inbox: SpeechItem[]; team: TeamMember[]; feed: SpeechItem[];
};

const GATE_STATUSES = new Set(["승인대기", "검토대기"]);
type DatedItem = BoardItem & { sectionDate: string };

function flatten(sections: BoardSection[]): DatedItem[] {
  // 보드는 최신 섹션이 위다. 같은 ID가 여러 섹션에 있으면 **가장 위(최신) 행만
  // 유효**하고 아래 행은 이력이다(보드·pm 공유 규칙). 이력 행이 계산에 끼면
  // 끝난 항목의 옛 승인대기 행이 결재함에 유령으로 되살아나므로 첫 등장만 남긴다.
  const seen = new Set<string>();
  const out: DatedItem[] = [];
  for (const s of sections) {
    for (const it of s.items) {
      if (seen.has(it.id)) continue;
      seen.add(it.id);
      out.push({ ...it, sectionDate: s.heading });
    }
  }
  return out;
}

export function daysOnBoard(sectionDate: string, today: Date): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(sectionDate);
  if (!m) return null;
  const y = m[1], mo = m[2], d = m[3]; // 각각 string | undefined
  if (y === undefined || mo === undefined || d === undefined) return null;
  const start = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const diff = Math.floor((now - start) / 86_400_000);
  return diff < 0 ? 0 : diff;
}

function nthDay(sectionDate: string, today: Date): number | null {
  const days = daysOnBoard(sectionDate, today);
  return days === null ? null : days + 1;
}

export function firstSentence(text: string): string {
  const trimmed = text.trim();
  // 종결부호(. ! ?) 뒤에 공백/문자열끝이 오는 첫 지점까지.
  // "board.ts"처럼 토큰 내부 마침표는 뒤가 공백이 아니라 걸리지 않는다.
  const m = /^([\s\S]*?[.!?])(\s|$)/.exec(trimmed);
  return m?.[1] ?? trimmed; // m[1]은 string | undefined → ?? 로 보정
}

function summarize(item: BoardItem): string | null {
  const src = item.result ?? item.reason;
  return src === null ? null : firstSentence(src);
}

function inboxSpeech(item: DatedItem, today: Date): SpeechItem {
  const n = nthDay(item.sectionDate, today);
  const dayTag = n === null ? "" : `${n}일째 `;
  if (item.status === "승인대기") {
    return {
      key: item.id, id: item.id, title: item.title, status: item.status,
      speaker: identityFor("pm"),
      line: `${item.id}, ${dayTag}계획 지시를 기다립니다.`,
      detail: item.reason, tone: "pending",
    };
  }
  return { // 검토대기
    key: item.id, id: item.id, title: item.title, status: item.status,
    speaker: identityFor(item.agent),
    line: `${item.id} 계획서를 올렸습니다 — ${dayTag}검토 대기 중입니다.`,
    detail: item.result ?? item.reason, tone: "pending",
  };
}

const FEED_TONE: Record<string, Tone> = {
  계획지시: "active", 구현승인: "active", 완료: "done", 보류: "hold",
};

function feedSpeech(item: DatedItem): SpeechItem {
  const speaker = identityFor(item.agent);
  const tone: Tone = item.status === null ? "muted" : (FEED_TONE[item.status] ?? "muted");
  let line: string;
  switch (item.status) {
    case "계획지시": line = `${item.id} 계획을 작성하고 있습니다.`; break;
    case "구현승인": line = `${item.id} 구현에 착수했습니다.`; break;
    case "완료": line = summarize(item) ?? `${item.id} 완료했습니다.`; break;
    case "보류": line = summarize(item) ?? `${item.id} 보류했습니다.`; break;
    default: line = summarize(item) ?? item.id;
  }
  const detail = (item.status === "계획지시" || item.status === "구현승인")
    ? item.reason
    : (item.result ?? item.reason);
  return { key: item.id, id: item.id, title: item.title, status: item.status, speaker, line, detail, tone };
}

function teamState(agentId: string, items: DatedItem[]): { state: string; tone: Tone } {
  if (agentId === "pm") {
    const pending = items.filter((it) => it.status === "승인대기").length;
    return pending > 0
      ? { state: `${pending}건 결재 요청 중`, tone: "pending" }
      : { state: "새 선정 없음", tone: "muted" };
  }
  const mine = items.filter((it) => it.agent === agentId);
  const review = mine.find((it) => it.status === "검토대기");
  if (review !== undefined) return { state: `${review.id} 검토 요청 중`, tone: "pending" };
  const working = mine.find((it) => it.status === "계획지시" || it.status === "구현승인");
  if (working !== undefined) return { state: `${working.id} 작업 중`, tone: "active" };
  const held = mine.find((it) => it.status === "보류");
  if (held !== undefined) return { state: `${held.id} 보류`, tone: "hold" };
  const done = mine.find((it) => it.status === "완료");
  if (done !== undefined) return { state: `최근 ${done.id} 완료`, tone: "done" };
  return { state: "대기 중", tone: "muted" };
}

function formatToday(today: Date): string {
  return `${today.getUTCMonth() + 1}월 ${today.getUTCDate()}일`;
}

export function buildBriefing(sections: BoardSection[], today: Date): Briefing {
  const items = flatten(sections);
  const inbox = items
    .filter((it) => it.status !== null && GATE_STATUSES.has(it.status))
    .map((it) => inboxSpeech(it, today));
  const feed = items
    .filter((it) => it.status === null || !GATE_STATUSES.has(it.status))
    .map((it) => feedSpeech(it));
  const team = ROSTER_ORDER.map((id) => {
    const { state, tone } = teamState(id, items);
    return { identity: identityFor(id), state, tone };
  });
  return { today: formatToday(today), pendingCount: inbox.length, inbox, team, feed };
}
```

> `noUncheckedIndexedAccess` 준수 요지: 인덱스 시그니처 Record(`ROSTER`, `FEED_TONE`)는 `undefined` 가능이라 `!== undefined`/`?? "muted"`로 보정하고, 정규식 캡처(`m[1]`)와 `firstSentence`도 `?? 폴백`으로 처리한다. 배열은 원시 인덱스 접근 없이 `map/filter/find/flatMap`만 쓴다. `TONE_TEXT: Record<Tone, string>`(아래 UI)는 **유한 union 키**라 접근이 `string`(undefined 없음)이다.

### `src/ui/agent-avatar.tsx` (신규)

```tsx
import { identityFor, initialOf } from "~/pipeline/agents";
import { cn } from "~/lib/utils";

const DIM = { sm: "size-8 text-sm", md: "size-9 text-base", lg: "size-10 text-lg" } as const;

export function AgentAvatar({
  agentId, size = "md",
}: { agentId: string | null; size?: "sm" | "md" | "lg" }) {
  const identity = identityFor(agentId);
  return (
    <span
      role="img"
      aria-label={identity.handle}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-muted", DIM[size])}
    >
      {identity.emoji || initialOf(identity)}
    </span>
  );
}
```

### `src/app/pipeline/page.tsx` — 변경 줄만

before(page.tsx:5-6, 17-26):
```tsx
import { AdminHeader } from "~/ui/admin-header";
import { PipelineBoard } from "~/ui/pipeline-page";
...
  const admin = await requireAdmin();
  const sections = await getPipelineBoard();
  return (
    <>
      <AdminHeader email={admin.email} />
      <main>
        <PipelineBoard sections={sections} />
      </main>
    </>
  );
```
after:
```tsx
import { buildBriefing } from "~/pipeline/briefing";
import { AdminHeader } from "~/ui/admin-header";
import { PipelineBriefing } from "~/ui/pipeline-page";
...
  const admin = await requireAdmin();
  const sections = await getPipelineBoard();
  const briefing = buildBriefing(sections, new Date());
  return (
    <>
      <AdminHeader email={admin.email} />
      <main className="bg-briefing min-h-screen">
        <PipelineBriefing briefing={briefing} />
      </main>
    </>
  );
```

### `src/ui/pipeline-page.tsx` — 재작성(구조·리터럴 요점)

서버 컴포넌트. `Briefing`을 받아 단일 컬럼(`mx-auto max-w-2xl px-4 py-8`)으로 3구역을 렌더. 톤→클래스와 구역별 마크업만 새로 짜고, 배지/버튼은 기존 atoms(`~/ui/atoms/*`)를 따른다.

```tsx
const TONE_TEXT: Record<Tone, string> = {
  pending: "text-stamp", active: "text-active",
  done: "text-silence", hold: "text-hold", muted: "text-muted-foreground",
};
```

- **헤더**: eyebrow `<p className="font-briefing-display text-sm tracking-widest text-muted-foreground">파이프라인 브리핑</p>`, 날짜 `<h1 className="font-briefing-display text-3xl">{briefing.today}</h1>`, 요약 `<p>{briefing.pendingCount > 0 ? \`결정 대기 ${briefing.pendingCount}건\` : "결정 대기 없음"}</p>`, 우측에 기존 `<PipelineCommandButton />`(재사용).
- **결재함**(구역 라벨 `<h2 className="font-briefing-display …">결재함</h2>`):
  - 비었으면 빈 상태 카드 — 제목 `결재함이 비었습니다.` / 본문 `지금 당신의 결정을 기다리는 항목이 없습니다. 팀 현황과 최근 보고는 아래에 있습니다.`
  - 있으면 항목마다 말풍선 카드: `border-stamp/40 bg-stamp-soft rounded-2xl p-4`. 상단 `AgentAvatar size="md"` + `{speaker.handle} · {speaker.role}`(handle은 `font-briefing-display`). 발화 `<p className="text-lg text-stamp">{item.line}</p>`. 하단 메타 `{item.id} · {item.status}` + 호박 인장 마크(시그니처: `<span className="rounded border border-stamp px-1.5 text-xs text-stamp">결재</span>`). detail이 있으면 `<details>`로 근거 펼침.
- **팀 현황**: 칩 `flex flex-wrap gap-2`. 칩마다 `AgentAvatar size="sm"` + `{handle}` + `{state}`(색 `TONE_TEXT[tone]`).
- **보고 피드**: 항목마다 네이티브 접기(JS 없이 접근성 확보) —
```tsx
<details className="group border-b border-border/60 py-3">
  <summary className="flex cursor-pointer list-none items-start gap-3">
    <AgentAvatar agentId={item.speaker.id} size="sm" />
    <span className={cn("flex-1 text-sm line-clamp-1 group-open:line-clamp-none", TONE_TEXT[item.tone])}>
      {item.line}
    </span>
    <span className="shrink-0 text-xs text-muted-foreground">{item.status}</span>
  </summary>
  {item.detail && (
    <p className="mt-2 pl-11 text-sm whitespace-pre-wrap text-muted-foreground">{item.detail}</p>
  )}
</details>
```
피드가 비면 `<p className="text-sm text-muted-foreground">아직 보고가 없습니다.</p>`.

### `src/ui/pipeline-command.tsx` — 문구만(동작 불변)

before(pipeline-command.tsx:19, 24-26):
```tsx
      toast.success("Command posted to issue #87");
...
    <Button type="button" disabled={isPending} onClick={handleClick}>
      {isPending ? "Posting..." : "Run pipeline"}
    </Button>
```
after:
```tsx
      toast.success("실행 요청을 보냈습니다 (이슈 #87)");
...
    <Button type="button" disabled={isPending} onClick={handleClick}>
      {isPending ? "요청 중..." : "파이프라인 실행"}
    </Button>
```

### `src/styles/globals.css` — 추가만(기존 토큰 불변, `--font-sans`는 한글 폴백 덧댐)

`@theme {}`(globals.css:6-10) — `--font-sans` 값에 한글 고딕 폴백을 끼우고 디스플레이 세리프 변수를 추가:
```css
  --font-sans:
    var(--font-geist-sans), "Pretendard", "Apple SD Gothic Neo",
    "Noto Sans KR", ui-sans-serif, system-ui, sans-serif,
    "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji";
  --font-briefing-display:
    "Gowun Batang", "Nanum Myeongjo", "바탕", Batang, ui-serif, Georgia, serif;
```
`@theme inline {}`(`--color-picked` 다음, globals.css:32) 뒤에 매핑 추가:
```css
  --color-stamp: var(--stamp);
  --color-stamp-soft: var(--stamp-soft);
  --color-active: var(--active);
  --color-silence: var(--silence);
  --color-hold: var(--hold);
  --color-briefing: var(--briefing);
```
`:root {}`(globals.css:73 `--picked` 부근)에 값 추가:
```css
  --stamp: oklch(0.58 0.12 62);
  --stamp-soft: oklch(0.94 0.035 78);
  --active: oklch(0.5 0.09 250);
  --silence: oklch(0.58 0.008 80);
  --hold: oklch(0.5 0.13 42);
  --briefing: oklch(0.985 0.006 85);
```
`.dark {}`(globals.css:109 `--picked` 부근)에 다크 대응 추가(현재 앱은 라이트만 렌더하지만 `--picked` 관례대로 짝을 둔다):
```css
  --stamp: oklch(0.78 0.12 75);
  --stamp-soft: oklch(0.32 0.05 78);
  --active: oklch(0.72 0.1 250);
  --silence: oklch(0.62 0.006 80);
  --hold: oklch(0.68 0.13 42);
  --briefing: oklch(0.185 0.004 85);
```

## 테스트

`briefing.ts`·`agents.ts`가 순수 계층이라 `briefing.test.mjs` 하나로 발화 계약을 덮는다(board.test.mjs와 같은 방식, `tsx --test`).

- **덮는 것** (`src/pipeline/briefing.test.mjs`):
  - `daysOnBoard`: 같은 날→0, +1일→1, 여러 날, 미래 날짜→0(음수 클램프), 비-날짜 헤딩(예: "파이프라인 구조")→null.
  - `firstSentence`: 종결부호+공백 첫 지점까지 자름 / `board.ts` 같은 토큰 내부 마침표 무시 / 종결부호 없는 문자열→통째 / 빈 문자열→"".
  - `buildBriefing` — 대표 보드 문자열(현 board.test.mjs의 `BOARD` 형태 재사용)을 `parseBoard`→`buildBriefing`으로:
    - `inbox`가 승인대기·검토대기만, 보드 순서로 담긴다. `feed`는 그 여집합, 순서 유지.
    - **같은 ID가 두 섹션에 있으면(최신=완료, 옛=승인대기) 최신 행만 반영된다** — 결재함에 옛 행이 뜨지 않고, 피드에 완료 한 건만 남으며, pm 결재 요청 건수에도 안 센다(이력 행 유령 방지).
    - 결재함 발화 주체: 승인대기→pm, 검토대기→항목 agent. 발화에 `{N}일째`가 섹션 날짜+today로 들어간다(today 주입).
    - 피드 발화: 완료→`firstSentence(결과)`, 계획지시→`"… 계획을 작성하고 있습니다."`, 보류→`firstSentence`, tone 매핑(완료=done, 계획지시=active, 보류=hold).
    - 팀: 로스터 5명 전원·순서, pm=승인대기 건수 문구, dev=자기 항목에서 도출, 항목 없는 감사/스카우트=`대기 중`.
    - `pendingCount === inbox.length`, `today` 포맷("M월 D일").
  - `identityFor`: 알려진 id→해당 정체성, 미지 id→핸들=그 문자열·이모지="", null→시스템. `initialOf`: 첫 글자 대문자, 빈 핸들→"?".
- **못 덮는 범위**(현재 러너=Node·DOM 없음): `pipeline-page.tsx`/`agent-avatar.tsx` React 렌더, `<details>` 펼침·`line-clamp`·`group-open`, 새 색 토큰·서체의 시각 결과와 모바일 레이아웃, `bg-briefing` 적용, `requireAdmin()` 게이트(page.tsx:17), `getPipelineBoard()` fetch(queries.ts), `postPipelineCommand` 액션·토스트 — 전부 배포 후 폰 수동 확인 대상. `formatToday`/`daysOnBoard`의 UTC 기준은 KST 자정 부근 하루 오차 가능(서버가 UTC라 today·섹션날짜를 UTC로 통일; 실사용 영향 미미).

## 범위 밖 의존

없음. 전 변경이 `apps/admin/src/**` 안이다. `board.ts`·`queries.ts`·`command-action.ts`·`github.ts`·인증·`env.js`·`schema.prisma`는 손대지 않고, `@repo/db`도 analytics 계약도 건드리지 않으며, DB 읽기/쓰기 경로를 추가하지 않는다(외부 쓰기는 기존 이슈 #87 코멘트 하나 그대로 재사용). 웹폰트 파일 vendoring도 하지 않는다(시스템 서체).

## 대안

- **웹폰트 격상(디스플레이+본문 2벌)**: `layout.tsx`에 `next/font/google`로 `Gowun_Batang`(디스플레이)+`IBM_Plex_Sans_KR`(본문)을 얹어 발화까지 개성 있는 서체로. 채택 안 함 — 한글 웹폰트 2벌은 모바일 로딩 비용이 크고, `next/font/google`의 한글 서브셋 처리가 불확실해(필요 시 `next/font/local`로 폰트 바이너리 vendoring) 빌드 리스크를 진다. 1인 내부 도구엔 과하다. 단, 위 「타이포 역할」의 기기 현실대로 **폰에서 한글 세리프 정체성을 원하면 이 격상이 유일한 길이다** — v1을 시스템 서체로 배포해 폰에서 보고, 부족하면 이 경로로 격상한다.
- **피드 접기를 React `useState` 클라이언트 컴포넌트로**: 채택 안 함 — 네이티브 `<details>`가 JS 없이 접근성·키보드·저비용을 다 준다.
- **`board.ts`에 `sectionDate`를 넣어 항목이 날짜를 갖게**: 채택 안 함 — `board.ts`는 재사용 대상(제약)이자 15개 테스트가 걸린 순수 파서다. 날짜 접붙임은 상위 `briefing.ts`에서 `flatten`으로 해 파서를 건드리지 않는다.
- **결재함에 항목별 "승인" 버튼**: 채택 안 함 — 게이트 전이(계획지시·구현승인)는 사용자가 보드를 직접 편집하는 수동 행위이고 `postPipelineCommand`는 status를 바꾸지 않는다(command-action.ts:9-16). 존재하지 않는 동작의 버튼은 "컨트롤은 하는 일을 그대로 말한다" 원칙에 어긋난다. 결재함은 "보고"로 두고 실행 버튼은 헤더의 전역 하나만 둔다.
