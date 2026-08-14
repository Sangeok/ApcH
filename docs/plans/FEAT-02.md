# FEAT-02: 업로드 영상 길이에 맞춰 클립 개수 기본값 제안

agent: web-dev

> 이 항목은 이전에 두 번 "매번 드롭다운을 손봐야 한다"는 **편의** 문제로 다시 쓰였다
> (PROJECT_BOARD.md / template.md에 기록됨). 백로그가 지목한 것은 **실패 예방**이다:
> "원본 길이에 대한 안내도 검증도 없어 유저가 무리한 개수를 고르는 것을 막지 못한다"
> (`TASK_BACKLOG.md:36`). 이 계획은 그 원천 문제(안내 + 검증)를 푼다.
> 제목의 "기본값 제안"은 편의 기능이 아니라, **소스 길이로 상한을 좁혀 무리한 선택을 막는**
> 가드로 해석한다.

## 현재 동작

- 클립 개수 옵션은 고정 배열이다. `shared/config/constants.ts:20-25`의
  `CLIP_COUNT_OPTIONS`는 `[1, 2, 3, 4]`이고, 소스 영상과 무관하게 항상 네 개가 노출된다.
- 기본 선택값은 항상 3이다. `constants.ts:28` `DEFAULT_CLIP_COUNT = CLIP_COUNT_OPTIONS[2].value`.
- 각 클립 길이는 30~90초다. `constants.ts:37-40` `CLIP_DURATION_LIMITS = { MIN_SECONDS: 30, MAX_SECONDS: 90 }`.
- 업로드 UI는 파일의 **재생 길이를 읽지 않는다.** `UploadPodcast.tsx:48-61`의
  `handleFileDrop`은 `setFiles`와 애널리틱스 기록만 하고, 영상 길이를 계산하거나 저장하지 않는다.
- 클립 개수 드롭다운(`UploadPodcast.tsx:199-219`)은 `CLIP_COUNT_OPTIONS`를 조건 없이
  전부 렌더하고(`:208-217`), 어떤 옵션도 비활성화하지 않는다. 소스 길이 안내 문구도 없다.
- 선택값은 그대로 서버로 넘어간다. `UploadPodcast.tsx:63-67` `handleUpload` →
  `useUploadPodcast.ts:71-76` `upload(file, language, clipCount, ...)` →
  `features/upload/api/index.ts:225-263` `prepareUpload`가 `targetClipCount: clipCount`(`:263`)로 저장.
- 서버 검증은 **개수가 1~4에 드는지만** 본다. `features/upload/model/schemas.ts:19-22`의
  `clipCount` refine은 `SUPPORTED_CLIP_COUNT_SET.has(value)`뿐이고, 영상 길이와의 관계는 검사하지 않는다.
- 유일한 개수 상한 가드는 **생성 시점**에 있다. `features/upload/api/index.ts:438-440`은
  `selectedDrafts.length > file.targetClipCount`일 때 거부하는데, 이는 검토 모드에서 이미
  정해진 target을 넘는 선택을 막는 것이지 target 자체가 소스 길이에 맞는지는 보지 않는다.

## 문제

백로그(`TASK_BACKLOG.md:36`)가 지목한 문제: 소스 길이에 대한 **안내도 검증도 없어**, 유저가
소스가 감당하지 못하는 클립 개수를 골라도 UI가 막지 못한다. 위 「현재 동작」에서 확인한 대로
클라이언트는 파일 재생 길이를 아예 읽지 않으므로(`UploadPodcast.tsx:48-61`), 개수 드롭다운은
소스와 무관하게 네 옵션을 그대로 연다(`:208-217`).

**백로그가 든 예("10분 소스에 4개 요청 시 가끔 4개보다 적게 생성됨")와 코드가 어긋나는 지점을
그대로 적는다.** 클립은 30초 이상 비겹침이므로 10분(600초) 소스의 구조적 상한은
`floor(600 / 30) = 20`으로 4를 훨씬 넘는다 — 즉 10분/4개는 **구조적으로 불가능한 요청이 아니다.**
그 경우의 미달 생성은 백엔드 하이라이트 탐지가 충분한 구간을 못 찾는 것이며, 이는 `apps/backend`
소관이라 web-dev가 고칠 수 없다. 따라서 이 항목의 web 범위 결과물은 **소스 길이로 계산되는
구조적 상한을 UI에 도입해 (1) 짧은 소스에서 불가능한 개수를 못 고르게 막고(검증), (2) 소스가
감당 가능한 상한과 "개수는 상한일 뿐 보장이 아니다"를 알린다(안내)**로 좁힌다. 백엔드 미달
생성 자체는 이 항목으로 해결되지 않으며, 그 사실을 「테스트 · 못 덮는 범위」에 남긴다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/pages/dashboard/model/clip-count-budget.ts` `(신규)` | 재생 길이(초)로 구조적 상한(최소 길이 비겹침 클립 개수, 옵션 최댓값으로 클램프)을 계산하는 순수 함수 |
| `src/fsd/pages/dashboard/model/clip-count-budget.test.mjs` `(신규)` | 경계값 테스트 |
| `src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx` `(수정)` | 드롭 시 재생 길이를 읽어 상태에 저장, 상한을 넘는 개수 옵션 비활성화·선택값 하향, 안내 문구, 상한 0일 때 업로드 차단 |

여기 없는 파일은 구현 단계에서 고치지 않는다. `constants.ts`는 읽기만 한다(값을 옮기지 않음).

## 구현 스케치

### 1. 순수 함수 — `pages/dashboard/model/clip-count-budget.ts` (신규, 전체)

```ts
import {
  CLIP_COUNT_OPTIONS,
  CLIP_DURATION_LIMITS,
} from "~/fsd/shared/config/constants";

/** 선택 가능한 최대 옵션. CLIP_COUNT_OPTIONS가 1..4이므로 현재는 4. */
const MAX_CLIP_COUNT_OPTION =
  CLIP_COUNT_OPTIONS[CLIP_COUNT_OPTIONS.length - 1]!.value;

/**
 * 소스 재생 길이(초)로 구조적으로 확보 가능한 최대 클립 개수를 계산한다.
 *
 * - 클립은 최소 CLIP_DURATION_LIMITS.MIN_SECONDS(30초)이고 비겹침이므로,
 *   길이 D 소스에 들어갈 수 있는 최소 길이 클립 수의 상한은 floor(D / MIN_SECONDS)다.
 * - 옵션 최댓값(4)으로 클램프한다. 10분 소스의 구조적 상한은 20이지만 옵션은 4까지뿐이다.
 * - 길이 미상(null·비유한·0 이하)이면 가드하지 않고 옵션 최댓값을 그대로 허용한다.
 * - MIN_SECONDS 미만인 소스는 0을 반환한다(클립 한 개도 불가능). 이 값을 1로
 *   끌어올리지 않는 이유: 사실을 감추면 UI가 만들 수 없는 개수를 허용하게 된다.
 *
 * 서버는 duration을 저장·검사하지 않으므로(schemas.ts:19-22) 이 규칙에 대응하는
 * 서버 가드가 없다 — 동기화해야 할 상대가 없어 shared/config가 아니라 이 슬라이스에 둔다.
 */
export function getMaxFeasibleClipCount(durationSeconds: number | null): number {
  if (
    durationSeconds === null ||
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    return MAX_CLIP_COUNT_OPTION;
  }

  const structuralMax = Math.floor(
    durationSeconds / CLIP_DURATION_LIMITS.MIN_SECONDS,
  );

  return Math.min(MAX_CLIP_COUNT_OPTION, structuralMax);
}
```

### 2. UI — `UploadPodcast.tsx` (수정, 바뀌는 줄만)

**임포트** — `:24-30`의 config 임포트 아래에 새 함수 임포트를 추가한다. (`cn`은 `:18`에서 이미
임포트됨.) `:21`의 `import { useState } from "react";`는 `useRef`를 함께 받도록 바꾼다 —
아래 「드롭 핸들러」의 경합 가드에 쓴다.

```ts
// before (:21)
import { useState } from "react";
// after
import { useRef, useState } from "react";
```

```ts
// after (추가)
import { getMaxFeasibleClipCount } from "~/fsd/pages/dashboard/model/clip-count-budget";
```

**상태** — `:40` 아래에 재생 길이 상태를 추가한다.

```ts
// before (:38-40)
const [files, setFiles] = useState<File[]>([]);
const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);
const [clipCount, setClipCount] = useState<number>(DEFAULT_CLIP_COUNT);

// after (두 줄 추가)
const [durationSeconds, setDurationSeconds] = useState<number | null>(null);
// 드롭마다 증가시키는 요청 번호. 늦게 도착한 이전 파일의 측정 결과를 버리는 데 쓴다.
const durationRequestId = useRef(0);
```

**재생 길이 읽기 헬퍼** — 컴포넌트 밖(파일 상단, `useUploadPodcast`의 `uploadFileToS3`처럼)에
DOM I/O 헬퍼를 둔다. 순수하지 않고 DOM에 의존하므로 테스트로 덮지 않는다(「테스트」 참조).

```ts
function readVideoDurationSeconds(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    video.src = url;
  });
}
```

**드롭 핸들러** — `:48-61` `handleFileDrop`에서 길이를 초기화하고 비동기로 읽어 저장한다.
길이를 알아낸 뒤 현재 선택값이 상한을 넘으면(상한 ≥ 1일 때만) **하향 클램프**한다.
이 클램프는 `handleClipCountChange`가 아니라 `setClipCount`로 직접 한다 — 유저 조작이 아니라
시스템 보정이므로 `upload_options_changed` 이벤트를 발생시키지 않기 위함이다(계측 의미 보존).

**클램프는 반드시 함수형 갱신으로 한다.** 이 `.then` 콜백은 드롭 시점 렌더의 `clipCount`를
클로저로 붙잡고 있는데, 메타데이터를 읽는 동안에는 `durationSeconds`가 아직 `null`이라
상한이 4로 계산돼 **모든 옵션이 열려 있다**. 그 사이 유저가 드롭다운을 올리면 클로저의 낡은
값으로 판정해 클램프가 건너뛰어지고, 상한을 넘는 선택이 그대로 남는다 — 이 기능이 막으려는
바로 그 상태다.

**그리고 늦게 도착한 측정 결과를 버려야 한다.** `Dropzone`은 `disabled={isUploading}`만 걸려
있어(`:134`) 파일을 고른 뒤에도 **다시 드롭할 수 있고**, 허용 크기가 900MB까지다
(`UPLOAD_CONFIG.MAX_FILE_SIZE`). 큰 파일은 `moov`가 뒤에 있으면 메타데이터 읽기가 눈에 띄게
걸린다. 긴 A를 드롭한 직후 짧은 B를 드롭하면 **B가 먼저 끝나고 A가 나중에 도착해**
`durationSeconds`를 A의 길이로 덮는다. 그러면 선택된 파일은 B(20초)인데 UI는 A의 길이를
띄우고 상한을 4로 열며, 업로드 버튼도 안 막힌다 — **틀린 값이 조용히 통과한다.**
`durationRequestId`로 자기 요청이 최신일 때만 반영한다.

```ts
// after (:49 setFiles(acceptedFiles); 직후에 추가, 그리고 file 블록 안에서 길이 읽기)
setFiles(acceptedFiles);
setDurationSeconds(null);

const file = acceptedFiles[0];

if (file) {
  void trackAnalyticsEvent("upload_file_selected", { /* 기존 그대로 :55-59 */ });

  const requestId = ++durationRequestId.current;

  void readVideoDurationSeconds(file).then((seconds) => {
    // 이 드롭 이후에 다른 파일이 떨어졌으면 이 결과는 버린다 (위 설명 참조)
    if (requestId !== durationRequestId.current) return;

    setDurationSeconds(seconds);
    const max = getMaxFeasibleClipCount(seconds);
    if (max >= 1) {
      // 클로저의 clipCount가 아니라 prev를 본다 (위 설명 참조)
      setClipCount((prev) => (prev > max ? max : prev));
    }
  });
}
```

**파생값** — 렌더 본문에서 상한을 계산한다(예: `handleReviewModeChange` 정의 아래).

```ts
const maxFeasibleClips = getMaxFeasibleClipCount(durationSeconds);
```

**개수 드롭다운** — `:208-217`의 map을 상한 초과 옵션 비활성화로 바꾼다. Radix `Item`은
`disabled`를 받아 `data-[disabled]` 스타일(포인터 차단·흐림)을 자동 적용한다
(`shared/ui/atoms/dropdown-menu.tsx:77`).

```tsx
// after
{CLIP_COUNT_OPTIONS.map((option) => {
  const disabled = maxFeasibleClips >= 1 && option.value > maxFeasibleClips;
  return (
    <DropdownMenuItem
      key={option.value}
      disabled={disabled}
      onClick={() => handleClipCountChange(option.value)}
      className="cursor-pointer"
    >
      {option.label}
    </DropdownMenuItem>
  );
})}
```

**안내 문구** — 개수 컨트롤을 감싸는 `flex gap-x-4` 블록(`:175-244`) 바로 아래,
`flex flex-col gap-y-4`(`:166`) 안에 안내 `<p>`를 추가한다. `files.length > 0`일 때만
렌더되는 영역이다. mm:ss 포맷은 표시용이라 인라인으로 둔다.

```tsx
// after (컨트롤 행 아래 추가)
{files.length > 0 && durationSeconds !== null && (
  <p className="text-muted-foreground text-xs">
    {maxFeasibleClips === 0
      ? `Source is shorter than ${CLIP_DURATION_LIMITS.MIN_SECONDS}s — too short to generate a clip. Try a longer video.`
      : `Source length ${formatSourceLength(durationSeconds)}. This fits up to ${maxFeasibleClips} ${maxFeasibleClips === 1 ? "clip" : "clips"}; the AI may return fewer.`}
  </p>
)}
```

`formatSourceLength`는 컴포넌트 밖 인라인 헬퍼:

```ts
function formatSourceLength(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds);
  const minutes = Math.floor(rounded / 60);
  const seconds = rounded % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
```

이 블록은 `CLIP_DURATION_LIMITS`를 참조하므로 `:24-30` 임포트에 `CLIP_DURATION_LIMITS`를 추가한다.

**업로드 버튼** — `:248-250`의 `disabled` 조건에 상한 0(생성 불가능한 짧은 소스)을 더한다.

```tsx
// before (:249)
disabled={files.length === 0 || isUploading}
// after
disabled={files.length === 0 || isUploading || maxFeasibleClips === 0}
```

## 테스트

- **덮는 것**: `clip-count-budget.test.mjs`가 `getMaxFeasibleClipCount`의 분기를 덮는다.
  - `null` → 4 (옵션 최댓값, 가드 없음)
  - `NaN`·`Infinity` → 4 (비유한 가드)
  - `0`·음수 → 4 (미상 취급)
  - `20`(30초 미만) → 0
  - `30`(정확히 최소) → 1
  - `59` → 1, `60` → 2, `90` → 3, `120` → 4 (floor 경계)
  - `600`(10분) → 4 — **백로그 예시가 구조적으로는 막히지 않음을 코드로 못박는 회귀 테스트.**
    이 값이 4가 아니게 되면 계획이 말한 것과 실제 동작이 갈라진 것이다.
- **`~` 별칭은 테스트 러너에서 풀린다 — 선례가 있다.** `clip-count-budget.ts`는
  `~/fsd/shared/config/constants`를 임포트하는데, `caption-presets.test.mjs`가 덮는
  `caption-presets.ts:1-5`와 `features/clip-review/model/schemas.ts:2-7`이 **같은 임포트를
  이미 쓰고 있고 통과한다.** `tsconfig.json:29-31`의 `"~/*": ["./src/*"]`를 tsx 4.23.1이
  해석한다.
  > 검증 이력: 이 항목의 1차 대조에서 테스트 대상 모듈을 **다섯 개로 잘못 열거해**
  > `caption-presets`를 빠뜨렸고, 그 결과 "선례가 없다"는 거짓 전제로 파라미터화 폴백을
  > 적어두었다. 실제 구현에서 별칭은 정상 동작했다. **포함된 항목을 세어 전칭을 증명하면
  > 이렇게 된다** — 열거는 `find`로 전수하고 개수를 확인한다.
- **못 덮는 범위**:
  - `readVideoDurationSeconds`(DOM `<video>`·`URL.createObjectURL`)와 `UploadPodcast`의
    렌더·클램프·비활성화·안내 문구. `npm test`는 Node 내장 러너라 DOM이 없다. 새 도구는 깔지 않는다.
  - `upload_file_selected` 계측의 `clipCount` 값(`UploadPodcast.tsx:55-59`). 이 이벤트는 길이를
    읽기 **전에** 발사되므로 클램프 이전 값이 기록된다. 의도된 순서다(파일 선택 시점의 선택값이
    맞다) — 다만 분석에서 이 이벤트의 `clipCount`를 최종 요청 개수로 읽으면 안 된다. 최종 값은
    `upload_options_changed`와 업로드 호출에 남는다.
  - 백로그의 대표 사례(10분 소스에 4개 요청 시 미달 생성) 자체. 이는 백엔드 하이라이트
    탐지가 충분한 구간을 못 찾는 것이며 `getMaxFeasibleClipCount(600) === 4`가 증언하듯
    구조적 가드로는 막히지 않는다. `apps/backend` 소관이라 이 항목으로 해결되지 않는다.

## 범위 밖 의존

없음. 결과물은 전부 `apps/web/src/fsd/pages/dashboard`(신규 모델·테스트, UI 수정) 안에서
끝나고, `shared/config`는 읽기만 한다. 서버측 이중 방어(duration 저장·검사)는 담당 범위 밖이자
이 항목의 문제(UI 선택 가드)에 필요치 않다 — 「대안」에서 다룬다.

## 대안

- **A. 상한 초과 시 업로드 자체를 하드 차단** (상한 0뿐 아니라 모든 초과에서). 기각:
  구조적 상한을 넘지 않는 미달 생성은 확률적이라(하이라이트 부족) 하드 벽이 과하고,
  서버는 어차피 1~4를 전부 받으므로(schemas.ts:19-22) UI만 더 엄격해져
  `selection-budget.ts` 주석이 경고한 "UI가 허용한 걸 서버가 거부"의 반대 형태(UI가 서버보다
  엄격)를 만든다. 옵션 비활성화 + 하향 클램프로 무리한 **선택**은 이미 막힌다.
- **B. `DEFAULT_CLIP_COUNT`를 길이에 따라 가변으로.** 기각: 이것이 보드·template이 기록한
  과거의 편의 드리프트다. 백로그의 실패 예방이 아니라 편의를 풀고, 소스 길이라는 이유를
  유저에게 알리지 않은 채 기본값을 조용히 바꾼다.
- **C. duration을 DB에 저장해 서버에서 개수-길이 관계를 강제(이중 방어).** 기각(이 항목 한정):
  `packages/db` 스키마 변경이 필요해 담당 범위 밖이고, 문제는 UI 선택 가드라 서버 강제가
  필수는 아니다. 필요해지면 별도 항목으로 올린다.
