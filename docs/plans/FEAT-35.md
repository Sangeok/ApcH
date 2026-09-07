# FEAT-35: 클립 경계 편집 루프를 닫는다 — 경계 프리뷰 + 넛지 스냅 방향 + 시계 표기 입력

agent: web-dev

> 인용한 `파일:줄`은 계획 작성 시점(2026-09-07)에 다시 읽어 확인했다. 백로그가
> 인용한 줄 중 한 곳만 밀려 있었다: `ClipDraftCard.tsx:123 const adjustStart`은
> 실제 `:124`다(`:123`은 빈 줄). 내용은 일치한다. 나머지 인용은 전부 정확했다.

## 현재 동작

편집 카드는 슬라이스 `widgets/clip-draft-review`의 `ui/_component/ClipDraftCard.tsx`이고,
플레이어와 프리뷰 재생기는 슬라이스 루트 `ui/index.tsx`에 있다.

**프리뷰 (요구 ①이 겨냥)**

- 카드마다 프리뷰 버튼이 **하나**다: `ClipDraftCard.tsx:323-330`의 `<Button … variant="outline">Preview</Button>`,
  `:327` `onClick={() => onPreview({ startSeconds, endSeconds })}`.
- `onPreview`는 `ui/index.tsx:440` `onPreview={(range) => handlePreview(draft.id, range)}`로
  위젯의 `handlePreview`에 잇는다. `handlePreview`는 `ui/index.tsx:204` `const handlePreview = (draftId: string, range: ClipRange) => {`이고
  **임의 구간 재생기**다: `:208` `previewEndRef.current = range.endSeconds;`, `:209` `video.currentTime = range.startSeconds;`, `:210` `void video.play();`.
- 종료는 `ui/index.tsx:219-224`의 `handleTimeUpdate`가 `previewEndRef.current`(=`range.endSeconds`)에서 `video.pause()`한다.
- 즉 재생 구간은 항상 카드가 넘긴 `{startSeconds, endSeconds}` 전체다. 길이 하한·상한은
  `shared/config/constants.ts:37-40` `MIN_SECONDS: 30,` / `MAX_SECONDS: 90,`이라 이 재생은 30~90초다.
  경계만 짧게 듣는 경로가 없다.

**넛지 (요구 ②가 겨냥)**

- `ClipDraftCard.tsx:22` `const STEP_SECONDS = 0.5;`.
- `:62-79` `function nearestBoundary(value: number, boundaries: number[]): number {`가 **가장 가까운** 경계를 고른다.
- `:124-130` `const adjustStart = (delta: number) => {`는 `nearestBoundary(roundTenth(startSeconds + delta), transcriptWords.map((word) => word.start))`를
  구해 `setStartSeconds(Math.max(0, roundTenth(next)))` 한다. `:132-138` `adjustEnd`는 `word.end` 경계로 대칭이다.
- 버튼: `:353` `onClick={() => adjustStart(-STEP_SECONDS)}`, `:379` `adjustStart(STEP_SECONDS)`,
  `:395` `adjustEnd(-STEP_SECONDS)`, `:415` `adjustEnd(STEP_SECONDS)`.
- 결함 재현(백로그 관측 4): 현재 start가 어떤 단어 시작에 스냅돼 있고 이전 단어까지 간격이 넓으면,
  `start − 0.5` 지점에서 **가장 가까운** 경계가 원래 자리라 `−`가 no-op이 된다.
- `roundTenth`는 `:58-60` `function roundTenth(value: number): number { return Math.round(value * 10) / 10; }`.
  단어 경계(`transcriptWords[i].start`)는 원시 소수(예: 167.893)이고, 스냅 뒤 저장값은 `roundTenth`로 0.1초 격자에 올라간다(167.9).

**입력 표기 (요구 ③이 겨냥)**

- Start 입력은 `ClipDraftCard.tsx:359-374`: `type="number"`, `value={startSeconds}`(원시 초),
  `:367-369` `onChange={(event) => setStartSeconds(Math.max(0, Number(event.target.value)))}`,
  `:372` `onBlur={() => setStartSeconds(roundTenth(startSeconds))}`. End 입력은 `:399-410`으로 대칭.
- 라벨은 `:341` `Start (s)`, `:388` `End (s)`. 필드 위 주석(`:336-339`)이 "배지는 m:ss, 이 필드는 초 단위"라고
  두 좌표계를 명시한다.
- 반면 식별 줄 배지는 이미 시계 표기다: `:285-286` `{formatSecondsAsClock(startSeconds, { decimals: 1 })}–{formatSecondsAsClock(endSeconds, { decimals: 1 })}`.
- `formatSecondsAsClock`은 `shared/lib/format-duration.ts:10-26`에 있다(초→`m:ss` / `decimals` 옵션 시 `m:ss.s`). **역방향 파서는 없다.**
- 상태 관리: `:96-97` `startSeconds`/`endSeconds`는 숫자 state, `:360-361`/`:401-402`의 `step={0.1}`이 UI 정밀도다.
  길이 판정은 `constants.ts:71-80` `isClipDurationWithinLimits(startSeconds, endSeconds)`가 초 기반으로 하고,
  카드의 `:109-112`가 이를 호출한다.

**프리뷰 구간이 임의라는 사실이 요구 ①의 핵심 전제다** — `handlePreview`는 이미 임의
`{startSeconds, endSeconds}`를 받으므로, 카드가 다른 구간을 계산해 넘기면 위젯·저장 경로·서버는 무변경이다.
`onPreview` prop 시그니처(`ClipRange` = `{ startSeconds, endSeconds }`, `use-clip-draft-review.ts:39-42`)도 그대로다.

## 문제

이 화면의 실제 과제는 구간 중앙 감상이 아니라 "경계가 말 중간을 자르는지 판정하고 고치기"인데,
그 루프에 필요한 도구 둘이 코드에 없다. ① 프리뷰가 언제나 구간 전체 재생(`ui/index.tsx:208-224` + `constants.ts:37-40`)이라
경계만 듣는 경로가 없다 — start부터 재생하면 무엇을 잘랐든 깔끔하게 들려 잘림을 판정할 수 없다.
② 넛지가 `nearestBoundary`(`ClipDraftCard.tsx:62-79`) 때문에 특정 조건(이전 경계까지 간격 ≥1.0초)에서 조용히
no-op이 된다 — 그때가 문장 첫 단어에 경계가 걸린, 넛지를 가장 많이 쓸 순간이다. ③ 편집 입력이 초 표기(`:341` `Start (s)`,
`:359-374`)라 시계 표기 배지(`:285-286`)·플레이어 m:ss와 좌표계가 어긋나고, `step=0.1`/원시 소수가 표기 노이즈를 낳는다.
관측 1(발주 계기)의 "2:52 ↔ 252.493 오독"은 이 표기 불일치가 기능 부재를 드러낸 결과다.

요구 ①②③은 각각 프리뷰 삼분할·넛지 방향 스냅·입력 시계 표기이며, 셋 다 `apps/web` 안에서 닫힌다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/shared/lib/format-duration.ts` | 시계 표기 → 초 파서 `parseClockToSeconds` 추가(③) |
| `src/fsd/shared/lib/format-duration.test.mjs` `(신규)` | `parseClockToSeconds`와 기존 미검증 `formatSecondsAsClock` 커버 |
| `src/fsd/widgets/clip-draft-review/model/preview-range.ts` `(신규)` | 프리뷰 구간 계산 `getPreviewRange` + `PreviewKind`(①) |
| `src/fsd/widgets/clip-draft-review/model/preview-range.test.mjs` `(신규)` | `getPreviewRange` 커버 |
| `src/fsd/widgets/clip-draft-review/model/boundary-snap.ts` `(신규)` | 방향 스냅 `snapToAdjacentBoundary`(②) |
| `src/fsd/widgets/clip-draft-review/model/boundary-snap.test.mjs` `(신규)` | 방향 스냅 + no-op 회귀 커버 |
| `src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx` | 프리뷰 버튼 1→3, 넛지를 방향 스냅으로 교체, 입력을 m:ss.s 텍스트로 교체, 라벨·주석 갱신 |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다. `ui/index.tsx`(`handlePreview`)·저장 경로·서버 액션은
①의 무변경 전제이므로 손대지 않는다 — 닿게 되면 `보류`.

## 구현 스케치

### ① 프리뷰 구간 계산 — `model/preview-range.ts` (신규, 전문)

```ts
import type { ClipRange } from "./use-clip-draft-review";

export type PreviewKind = "start" | "full" | "end";

// 경계를 짧게 듣기 위한 프리뷰 창. pre/post-roll이 요점이다 — start부터 재생하면
// 무엇을 잘랐든 깔끔하게 들려 잘림을 판정할 수 없다. 경계 앞 1.5초(잘린 앞말)와
// 경계 뒤 3.5초(클립 내용)를 함께 들려 "말 중간이 잘렸는가"를 귀로 판정하게 한다.
const PRE_ROLL_SECONDS = 1.5;
const POST_ROLL_SECONDS = 3.5;

// handlePreview가 이미 임의 구간 재생기이므로(ui/index.tsx:204) 카드는 구간만 계산해 넘긴다.
// currentTime 음수는 브라우저가 0으로 클램프하지만, 순수 계산에서도 0으로 막아 판정을 코드에 남긴다.
export function getPreviewRange(
  kind: PreviewKind,
  startSeconds: number,
  endSeconds: number,
): ClipRange {
  if (kind === "start") {
    return {
      startSeconds: Math.max(0, startSeconds - PRE_ROLL_SECONDS),
      endSeconds: startSeconds + POST_ROLL_SECONDS,
    };
  }
  if (kind === "end") {
    return {
      startSeconds: Math.max(0, endSeconds - POST_ROLL_SECONDS),
      endSeconds: endSeconds + PRE_ROLL_SECONDS,
    };
  }
  return { startSeconds, endSeconds };
}
```

`import type`는 tsx가 런타임 require로 방출하지 않으므로, `.test.mjs`가 `"use client"` 훅
`use-clip-draft-review.ts`(react-query 의존)를 끌어오지 않는다. 반환 형상이 `ClipRange`와 구조적으로 같아
`onPreview(...)` 호출부에 그대로 대입된다.

### ② 방향 스냅 — `model/boundary-snap.ts` (신규, 전문)

```ts
function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

// "가장 가까운 경계"(nearestBoundary)를 "진행 방향의 인접 경계"로 바꾼다.
// - "back": 현재값보다 작은 경계 중 최대 - "forward": 현재값보다 큰 경계 중 최소.
//
// 경계는 원시 소수(예: 167.893)지만 저장값은 0.1초 격자(167.9)다. 격자에서 비교하지 않으면
// 현재값이 앉은 그 경계(167.893<167.9)로 다시 스냅해 roundTenth 후 167.9로 돌아오는 no-op이 생긴다
// (백로그 관측 4). 그래서 경계도 격자에 올리고 strict 부등호로 자기 자리를 배제한다.
//
// 방향에 경계가 없으면(마지막 단어 밖·전사 부재) 원시 ±fallbackStep 넛지로 물러난다 —
// "눌렀는데 안 움직임"을 여기서도 없앤다.
export function snapToAdjacentBoundary(
  value: number,
  boundaries: number[],
  direction: "back" | "forward",
  fallbackStep: number,
): number {
  const current = roundTenth(value);
  const grid = boundaries.map(roundTenth);

  if (direction === "back") {
    const behind = grid.filter((b) => b < current);
    return behind.length > 0
      ? Math.max(...behind)
      : roundTenth(current - fallbackStep);
  }

  const ahead = grid.filter((b) => b > current);
  return ahead.length > 0
    ? Math.min(...ahead)
    : roundTenth(current + fallbackStep);
}
```

### ③ 시계 표기 파서 — `format-duration.ts`에 추가

`formatSecondsAsClock`(`:10-26`)은 그대로 두고 파서만 더한다:

```ts
/**
 * `m:ss`·`m:ss.s`·맨숫자(초)를 초로 파싱한다. 편집 입력의 표시 레이어 전용이다 —
 * 넛지·자동저장·isClipDurationWithinLimits 판정은 초 기반을 유지한다.
 * 읽을 수 없으면 null(호출부가 마지막 유효값을 유지한다).
 */
export function parseClockToSeconds(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === "") return null;

  const colonIndex = trimmed.indexOf(":");
  if (colonIndex === -1) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
  }

  const minutesPart = trimmed.slice(0, colonIndex);
  const secondsPart = trimmed.slice(colonIndex + 1);
  const minutes = Number(minutesPart);
  const seconds = Number(secondsPart);

  if (
    minutesPart.trim() === "" ||
    secondsPart.trim() === "" ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds) ||
    minutes < 0 ||
    seconds < 0 ||
    seconds >= 60
  ) {
    return null;
  }
  return minutes * 60 + seconds;
}
```

### ClipDraftCard.tsx 배선 (바뀌는 줄만)

**임포트** — `:14` 교체, 두 모델 임포트 추가(기존 `../../model/use-clip-draft-review` 임포트 옆, `:15-19`):

```ts
import {
  formatSecondsAsClock,
  parseClockToSeconds,
} from "~/fsd/shared/lib/format-duration";
// …기존 타입 임포트 유지…
import { getPreviewRange } from "../../model/preview-range";
import { snapToAdjacentBoundary } from "../../model/boundary-snap";
```

**로컬 `nearestBoundary` 삭제** (`:62-79` 전체). `roundTenth`(`:58-60`)·`STEP_SECONDS`(`:22`)는 유지한다.

**넛지 재작성** — `:124-138`:

```ts
const adjustStart = (direction: "back" | "forward") => {
  const next = snapToAdjacentBoundary(
    startSeconds,
    transcriptWords.map((word) => word.start),
    direction,
    STEP_SECONDS,
  );
  setStartSeconds(Math.max(0, next));
};

const adjustEnd = (direction: "back" | "forward") => {
  const next = snapToAdjacentBoundary(
    endSeconds,
    transcriptWords.map((word) => word.end),
    direction,
    STEP_SECONDS,
  );
  setEndSeconds(Math.max(0, next));
};
```

버튼 onClick 넷: `:353` → `onClick={() => adjustStart("back")}`, `:379` → `adjustStart("forward")`,
`:395` → `adjustEnd("back")`, `:415` → `adjustEnd("forward")`. (aria-label·마이너스 기호 마크업은 그대로.)

**프리뷰 버튼 1→3** — `:319-331`의 `<div className="flex shrink-0 items-center gap-2">` 안
단일 Preview 버튼(`:323-330`)을 세 버튼으로 교체한다. `isSaving` 표시는 유지:

```tsx
<div className="flex items-center gap-1">
  <Button
    type="button"
    size="sm"
    variant="outline"
    className="h-7 px-2 text-xs"
    aria-label="Preview clip start"
    onClick={() => onPreview(getPreviewRange("start", startSeconds, endSeconds))}
  >
    Start
  </Button>
  <Button
    type="button"
    size="sm"
    variant="outline"
    className="h-7 px-2 text-xs"
    aria-label="Preview whole clip"
    onClick={() => onPreview(getPreviewRange("full", startSeconds, endSeconds))}
  >
    Full
  </Button>
  <Button
    type="button"
    size="sm"
    variant="outline"
    className="h-7 px-2 text-xs"
    aria-label="Preview clip end"
    onClick={() => onPreview(getPreviewRange("end", startSeconds, endSeconds))}
  >
    End
  </Button>
</div>
```

**입력 텍스트 버퍼 state** — `:96-97` 아래에 추가:

```ts
// 편집 중에만 원시 텍스트를 담는다. null = 편집 아님(초 state에서 포맷). 커밋은 blur에서만.
const [startText, setStartText] = useState<string | null>(null);
const [endText, setEndText] = useState<string | null>(null);
```

**라벨** — `:341` `Start (s)` → `Start`, `:388` `End (s)` → `End`. 필드 위 주석(`:336-339`)은
"배지는 m:ss, 이 필드는 초"를 설명하므로 다음으로 교체한다:

```tsx
{/* 입력도 배지(:285-286)·플레이어와 같은 m:ss.s 시계 표기다. 파싱은
    parseClockToSeconds가 하고, 넛지·자동저장·길이 판정은 초 기반을 유지한다. */}
```

**Start 입력 교체** — `:359-374`:

```tsx
<input
  type="text"
  aria-label="Start time (m:ss.s)"
  value={startText ?? formatSecondsAsClock(startSeconds, { decimals: 1 })}
  onChange={(event) => setStartText(event.target.value)}
  onBlur={() => {
    const parsed = startText === null ? null : parseClockToSeconds(startText);
    if (parsed !== null) {
      setStartSeconds(Math.max(0, roundTenth(parsed)));
    }
    setStartText(null);
  }}
  className="w-24 border-x px-2 py-1.5 text-center text-sm tabular-nums focus-visible:outline-none"
/>
```

**End 입력 교체** — `:399-410`을 위와 대칭으로(`endText`/`setEndText`/`setEndSeconds`,
`aria-label="End time (m:ss.s)"`).

편집 중 넛지 버튼을 누르면 mousedown→input blur(커밋/복원)→button click 순서라, blur가 먼저 초 state를
확정한 뒤 넛지가 그 값에서 움직인다. `startText`가 null일 때만 초 state에서 재포맷되므로 넛지·리셋·프리뷰
갱신이 표시에 그대로 반영된다.

## 테스트

- **덮는 것**
  - `format-duration.test.mjs`: `parseClockToSeconds` — `"2:47.9"→167.9`, `"2:47"→167`, 맨숫자 `"167.9"→167.9`,
    `"0:05.5"→5.5`, 공백 `"  2:47  "→167`, 무효(`"2:60"`·`"2:"`·`":30"`·`"abc"`·`""`·`"-3"`·`"2:-5"`·**`"-1:30"`**)→null,
    왕복(`parseClockToSeconds(formatSecondsAsClock(x,{decimals:1}))≈x`). `formatSecondsAsClock`도 함께 커버 —
    `65→"1:05"`, `167.9→"2:47.9"`(decimals:1), 음수 클램프 `-5→"0:00"`, 패딩 `9.1→"0:09.1"`.
    `"-1:30"`은 **분** 음수 가드(`minutes < 0`)를 지키는 케이스다 — `"2:-5"`는 초 가드만 덮어서, 분 가드를 지워도
    나머지 목록이 전부 통과한다(계획 검증 돌연변이 P4 생존, `"-1:30"` 없으면 `-30`이 그대로 반환된다).
  - `boundary-snap.test.mjs`: **no-op 회귀** — value 167.9, boundaries `[165.2, 167.893, 170.3]`, "back" → 165.2
    (nearestBoundary였다면 167.9로 남던 값). "forward" → 170.3. 격자 strict 배제(167.893이 167.9로 반올림돼도 자기 자리 제외).
    2회 연속 "back" 각각 이동(170.3→167.9→165.2). 빈 경계(전사 부재) → 폴백.
    - **원시(비격자) 현재값** — value `167.893`(초기 AI 값 그대로), boundaries `[165.2, 167.893, 170.3]`,
      "forward" → `170.3`, "back" → `165.2`. **이 케이스가 없으면 `const current = roundTenth(value)`의 반올림을
      지운 구현이 위 목록을 전부 통과한다**(계획 검증 돌연변이 M5 생존). 그 구현은 원시값에서 "forward"가 자기
      단어의 격자값(`167.9`)으로 가는데, 167.893도 167.9도 화면에는 똑같이 `2:47.9`로 그려지므로(검증 라운드의
      실물 렌더로 확인) **눌러도 아무 일이 안 일어나는 것처럼 보인다 — 이 항목이 없애려는 바로 그 증상이다.**
      위 케이스가 전부 격자값(167.9·170.3)만 써서 이 회귀를 못 잡는다.
    - **폴백은 격자-부정확 값으로** — `snap(0.6, [], "back", 0.5)` → `0.1`. `0.6 - 0.5`는 부동소수점에서
      `0.09999999999999998`이라, 폴백의 `roundTenth`를 지우면 이 케이스가 실패한다. 기존 `(167.9,"back",0.5→167.4)`는
      뺄셈이 정확해 반올림을 지워도 통과한다(돌연변이 M4 생존).
  - `preview-range.test.mjs`: `getPreviewRange` — `("start",167.9,252.5)→{166.4,171.4}`, `("full",…)→{167.9,252.5}`,
    `("end",167.9,252.5)→{249.0,254.0}`, 0 클램프(`("start",1.0,…)` startSeconds→0).
    (이 네 케이스는 검증 라운드의 돌연변이 4종을 전부 사멸시켰다 — 추가 불필요.)
- **`apps/web/CLAUDE.md` 갱신 보고(구현 단계)**: 테스트 파일이 3개 늘어난다. 그 파일의 테스트 목록 표에 3행이 필요하고,
  머리말 `:69` `현재 15개 파일, 19 suite, 88개 테스트`의 수치도 낡는다. `apps/web/CLAUDE.md`는 web-dev의 읽기 전용이므로
  고치지 말고 **추가할 행과 새 수치를 `비고:`에 적어 보고한다**(에이전트 정의 B-4).
- **못 덮는 범위**: `npm test`는 Node 내장 러너라 DOM·React 테스트 도구가 없다. 실제 `video.currentTime`/`play`/`pause`/
  `timeupdate` 재생 동작과, 입력 텍스트 버퍼의 blur 커밋/복원·focus↔click 순서는 순수 함수 밖이라 이 러너로 확인할 수
  없다 — 배포 후 검토 화면에서 수동 확인 대상이다.
  세 버튼 렌더·aria-label·입력 `type="text"`·시계 표기 초기값(`167.893`→`2:47.9`, `252.493`→`4:12.5`)·옛 라벨 제거는
  계획 검증 라운드에서 패치본을 `renderToStaticMarkup`으로 렌더해 13/13 확인했다(마크업 계약에 한함 — 클릭 이후 동작은 위 그대로 미확인).

## 범위 밖 의존

없음. 요구 ①②③은 전부 `apps/web` 안(이 위젯 + `shared/lib`)에서 닫히며, `packages/db`·다른 워크스페이스·
서버 액션·백엔드 계약을 건드리지 않는다. `handlePreview`가 이미 임의 구간 재생기라 ①도 카드 안에 갇힌다.

백로그가 「범위 밖 의존 (a)(b)(c)」로 적은 셋은 **교차 경계 차단이 아니라 이 반복에서 의도적으로 빼는 후속 범위**다
(전부 같은 워크스페이스 안 판단). 아래 「대안」에 결정을 남긴다.

## 대안

- **넛지: 방향 스냅 vs "0.5 넛지 후 진행 방향 최근접"** — 후자도 no-op을 없앨 수 있으나 착지점이 delta와 경계
  분포에 함께 의존해 예측이 어렵다. 백로그 요구 ②가 "현재값보다 작은 것 중 최대 / 큰 것 중 최소"를 명시하므로
  현재값 기준 인접 경계를 택했다. 폴백(±STEP)은 방향에 경계가 없을 때만 작동해 전사 부재·끝단 미세조정을 보존한다.
- **입력: 자유 텍스트 버퍼 vs 포맷 즉시 반영** — 컨트롤드 입력에 매 키 입력마다 포맷을 다시 씌우면 `"2:4"` 같은
  중간 상태를 칠 수 없다(기존 `"272."` 문제, `:370-371` 주석). null-버퍼 + blur 커밋 패턴으로 편집 중 자유 입력·
  커밋 시 재포맷을 얻는다.
- **(c) pre-roll 라벨** — pre-roll이 클립 밖 오디오를 들려주므로 안내를 붙일지 판단 대상이었다. 세 버튼 라벨
  (Start/Full/End)과 aria-label("Preview clip start"…)이 의도를 전하고, 실제 클립 범위는 배지(`:285-286`)가
  이미 보여준다. 밀도 높은 카드에 카드마다 상시 문구를 더하면 hook 비교를 방해하므로 이 반복에서는 넣지 않는다.
- **(a) 커스텀 스크러버 · (b) "현재 위치를 Start/End로"** — (a)는 네이티브 `controls`(`ui/index.tsx:394-398`)를
  버리고 드래그·터치·접근성을 떠안아야 하고, (b)는 큰 이동이라 같은 위젯의 `AddCustomClipPanel` 몫이다. ①②로
  경계 루프가 닫힌 뒤 필요가 남는지 보고 별 항목으로 판단한다 — 이 계획에는 넣지 않는다.
