# FEAT-40: 캡션 편집기를 `features/caption-style` 슬라이스로 이동 — 동작 무변경 순수 리팩터링

agent: web-dev

## 현재 동작

캡션 편집기는 검토 위젯 `widgets/clip-draft-review`의 사유(私有) 컴포넌트다.

- 위젯 barrel은 `widgets/clip-draft-review/index.ts:1` `export { default as ClipDraftReviewSection } from "./ui";` 하나만 내보낸다 — 편집기는 슬라이스 밖으로 공개되지 않는다.
- 편집기 본체 `ui/_component/CaptionStyleEditor.tsx`는 `:11` `import { matchPresetId } from "../../model/caption-presets";`, `:12` `import CaptionPreviewPlayer from "./CaptionPreviewPlayer";`, `:3` `import type { TranscriptWord } from "~/fsd/features/clip-review";`로 조립된다.
- 미리보기 `ui/_component/CaptionPreviewPlayer.tsx`는 `:7-14`에서 `../../model/caption-preview`의 `buildCaptionCues` 등을, `:4`에서 `~/fsd/features/clip-review`의 `TranscriptWord`를 가져온다.
- 순수 모델 둘: `model/caption-preview.ts`(`:1` `TranscriptWord` from clip-review, `:2` `CAPTION_RENDER`/`CaptionStyle` from `~/fsd/shared/config/constants`)와 `model/caption-presets.ts`(`:1-5` `~/fsd/shared/config/constants`에서만 임포트). 각각 테스트 `model/caption-preview.test.mjs`(`:11` `from "./caption-preview.ts"`)·`model/caption-presets.test.mjs`(`:7` `~/fsd/features/clip-review/model/schemas`, `:9-11` `~/fsd/shared/config/constants`, `:12` `from "./caption-presets.ts"`)가 지킨다.

편집기의 외부 소비자는 위젯 안 두 곳뿐이다.

- `ui/_component/CaptionStyleDialog.tsx:16` `import CaptionStyleEditor from "./CaptionStyleEditor";`
- `model/use-clip-draft-review.ts:19` `import { matchPresetId } from "./caption-presets";` (`:109`에서 `matchPresetId(style)`를 계측 메타데이터에 쓴다)

`TranscriptWord` 타입의 원천은 `features/clip-review/model/transcript.ts:1-5`의 3필드 인터페이스이고, 같은 파일 `:9`의 `parseTranscriptWords`가 이를 반환한다. `features/clip-review/index.ts:8` `export type { TranscriptWord } from "./model/transcript";`가 이를 공개한다. 이 타입을 쓰는 곳: 위 이동 대상 넷(`CaptionStyleEditor`·`CaptionPreviewPlayer`·`caption-preview.ts`가 clip-review에서 직접), 위젯 `CaptionStyleDialog.tsx:14`·`ClipDraftCard.tsx:21`·`AddCustomClipPanel.tsx:12`(뒤 둘은 `use-clip-draft-review.ts:21` `export type { TranscriptWord };` 재수출 경유), 그리고 서버 액션 `features/clip-review/api/index.ts:22`.

`parseTranscriptWords`의 테스트 `features/clip-review/model/transcript.test.mjs`는 `:4` `from "./transcript.ts"`로 함수만 가져오며 `"Transcript payload was not an array"` 메시지까지 단언한다(`:32-43`). 이 파일은 `TranscriptWord` 타입을 임포트하지 않는다.

FSD 경계 검출기(`apps/web/scripts/verify-fsd-boundaries.mjs`, `npm run check`의 `verify:fsd`)의 관련 규칙: W2는 `features` peer 슬라이스 임포트 금지(`:202-204`), W6은 크로스 슬라이스가 public entry 경유를 요구하되 대상이 `shared`면 면제(`:210-212`), `features`의 public entry는 슬라이스 루트 `index.ts` 또는 `api/index.ts`(`:68-73`). 테스트 파일은 분석에서 제외된다(`:155`, `:262`).

## 문제

백로그 FEAT-40의 원천: 설정 화면(FEAT-42)에서 캡션 편집기를 재사용해야 하는데, 지금은 검토 위젯의 사유 컴포넌트라 재사용 경로가 없다(`widgets/clip-draft-review/index.ts:1`이 `ClipDraftReviewSection`만 공개). 배럴 추가 수출은 설정 페이지가 검토 위젯에 의존하게 만들고, `shared/ui`로 내리면 atoms 자리에 언어별 기본값·프리셋 매칭·libass 픽셀 환산을 아는 300줄 편집기가 들어간다. 두 소비자(검토 위젯·설정 페이지)가 대등하게 아래를 보는 유일한 구조는 `features/caption-style` 신설이다.

이동을 막는 경계 결합: 이동 대상 넷이 `TranscriptWord`를 `features/clip-review`에서 가져오는데(`CaptionStyleEditor.tsx:3`·`CaptionPreviewPlayer.tsx:4`·`caption-preview.ts:1`), 새 슬라이스도 `features`라 그대로 옮기면 W2(peer 슬라이스) 위반이 된다. 그래서 `TranscriptWord` 인터페이스를 `shared`로 한 계단 내리고 `features/clip-review`는 재수출만 남긴다. `parseTranscriptWords`와 그 테스트는 제자리 유지(테스트가 에러 문구까지 단언하는 회귀 방어라 건드리지 않는다).

이 항목은 **동작 무변경**이 성공 기준이다. 옮기는 순수 모듈·테스트의 내용이 한 글자도 바뀌면 안 된다 — `caption-preview.test.mjs`가 지키는 `EM_SCALE` 분모·큐 묶기는 백엔드 자막과 묶인 계약이라, 흔들리면 미리보기가 실렌더와 어긋나고 사용자는 크레딧을 쓴 뒤에야 안다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/fsd/shared/lib/transcript.ts` `(신규)` | `TranscriptWord` 인터페이스(3필드)를 여기로 내린다 |
| `src/fsd/features/caption-style/index.ts` `(신규)` | 새 슬라이스 barrel — `CaptionStyleEditor`·`matchPresetId`만 공개 |
| `src/fsd/features/caption-style/ui/CaptionStyleEditor.tsx` `(이동 — git mv는 메인 루프가 선행)` | `widgets/.../ui/_component/CaptionStyleEditor.tsx`에서 이동 + 임포트 2줄만 재배선 |
| `src/fsd/features/caption-style/ui/CaptionPreviewPlayer.tsx` `(이동 — git mv는 메인 루프가 선행)` | `widgets/.../ui/_component/CaptionPreviewPlayer.tsx`에서 이동 + 임포트 2줄만 재배선 |
| `src/fsd/features/caption-style/model/caption-preview.ts` `(이동 — git mv는 메인 루프가 선행)` | `widgets/.../model/caption-preview.ts`에서 이동 + 임포트 1줄만 재배선 |
| `src/fsd/features/caption-style/model/caption-presets.ts` `(이동 — git mv는 메인 루프가 선행)` | `widgets/.../model/caption-presets.ts`에서 이동 — **내용 무변경** |
| `src/fsd/features/caption-style/model/caption-preview.test.mjs` `(이동 — git mv는 메인 루프가 선행)` | `widgets/.../model/caption-preview.test.mjs`에서 이동 — **내용 무변경** |
| `src/fsd/features/caption-style/model/caption-presets.test.mjs` `(이동 — git mv는 메인 루프가 선행)` | `widgets/.../model/caption-presets.test.mjs`에서 이동 — **내용 무변경** |
| `src/fsd/features/clip-review/model/transcript.ts` | `TranscriptWord` 인터페이스를 shared 임포트+재수출로 교체. `parseTranscriptWords`는 그대로 |
| `src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx` | `:16` `CaptionStyleEditor` 임포트를 새 슬라이스 barrel로 |
| `src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts` | `:19` `matchPresetId` 임포트를 새 슬라이스 barrel로 |

**제거되는 옛 경로(위 6개 `git mv`의 출발지)** — 구현 후 이 자리에 파일이 남아 있으면 안 된다(남으면 중복 테스트로 개수가 늘고 "동작 무변경"이 깨진다):

- `src/fsd/widgets/clip-draft-review/ui/_component/CaptionStyleEditor.tsx`
- `src/fsd/widgets/clip-draft-review/ui/_component/CaptionPreviewPlayer.tsx`
- `src/fsd/widgets/clip-draft-review/model/caption-preview.ts`
- `src/fsd/widgets/clip-draft-review/model/caption-presets.ts`
- `src/fsd/widgets/clip-draft-review/model/caption-preview.test.mjs`
- `src/fsd/widgets/clip-draft-review/model/caption-presets.test.mjs`

여기 적히지 않은 파일(`ClipDraftCard.tsx`·`AddCustomClipPanel.tsx`·`caption-preview.ts` 등의 `main.py:NNN` 주석·`ui/index.tsx`의 프로즈 주석)은 고치지 않는다.

## 구현 스케치

**이동(`git mv <옛경로> <새경로>` 6건)은 게이트② 개방 직후 메인 루프가 수행하고 커밋하지 않은 채 넘긴다** — web-dev 정의 파일이 Bash를 읽기·검증 전용으로 묶어 파일 이동·삭제를 할 수 없기 때문이다(「범위 밖 의존」 끝 문단). `git mv`는 blob을 그대로 두고 경로만 스테이징해 rename 추적을 보존한다. web-dev는 옮겨진 새 경로에서 아래 임포트 줄만 Edit한다 — B-3의 「현재 동작」 대조도 새 경로의 같은 줄로 한다(이동은 내용을 바꾸지 않는다). **본문·주석·`main.py:NNN` 줄번호 인용은 한 글자도 바꾸지 않는다**(줄번호 인용 교정은 FEAT-44의 몫이며, 여기서 건드리면 "테스트 diff는 경로 변경뿐" 기준이 깨진다).

**신규 `src/fsd/shared/lib/transcript.ts`** — 현재 `features/clip-review/model/transcript.ts:1-5`의 인터페이스를 그대로 옮긴다:

```ts
export interface TranscriptWord {
  start: number;
  end: number;
  word: string;
}
```

**신규 `src/fsd/features/caption-style/index.ts`** (슬라이스 public entry):

```ts
export { default as CaptionStyleEditor } from "./ui/CaptionStyleEditor";
export { matchPresetId } from "./model/caption-presets";
```

`CaptionPreviewPlayer`·`buildCaptionCues` 등은 슬라이스 내부 전용이라 공개하지 않는다(현재 외부 소비자가 없다 — 그 공개는 필요해지면 FEAT-42가 추가한다).

**`features/clip-review/model/transcript.ts`** — 인터페이스 선언(`:1-5`)을 아래로 교체하고, `parseTranscriptWords`(`:9-21`) 본문은 그대로 둔다:

```ts
import type { TranscriptWord } from "~/fsd/shared/lib/transcript";

export type { TranscriptWord };

// 백엔드 transcribe_video가 저장한 단어 단위 JSON을 검증·필터한다. 배열이 아니면
// 던진다(빈 배열로 접으면 실패가 "단어 스냅이 조용히 꺼진 화면"으로만 나타난다).
export function parseTranscriptWords(payload: unknown): TranscriptWord[] {
  // ...현재 본문 그대로...
}
```

(`features/clip-review/index.ts:8`의 `export type { TranscriptWord } from "./model/transcript";`는 재수출 경로가 유지되므로 무변경. clip-review의 소비자 전부가 계속 같은 이름을 받는다.)

**`caption-style/model/caption-preview.ts`** (이동 후) — `:1`만 교체:

```
- import type { TranscriptWord } from "~/fsd/features/clip-review";
+ import type { TranscriptWord } from "~/fsd/shared/lib/transcript";
```

`:2` `import { CAPTION_RENDER, type CaptionStyle } from "~/fsd/shared/config/constants";`는 절대경로라 무변경. 나머지(함수·`main.py:NNN` 주석)는 바이트 그대로.

**`caption-style/ui/CaptionPreviewPlayer.tsx`** (이동 후) — 임포트 2줄 교체:

```
- import type { TranscriptWord } from "~/fsd/features/clip-review";
+ import type { TranscriptWord } from "~/fsd/shared/lib/transcript";
```
```
- } from "../../model/caption-preview";
+ } from "../model/caption-preview";
```

(`ui/_component/` → `ui/`로 한 계단 얕아져 `../../model` → `../model`. `~/fsd/shared/...`·`react` 임포트는 무변경.)

**`caption-style/ui/CaptionStyleEditor.tsx`** (이동 후) — 임포트 2줄 교체:

```
- import type { TranscriptWord } from "~/fsd/features/clip-review";
+ import type { TranscriptWord } from "~/fsd/shared/lib/transcript";
```
```
- import { matchPresetId } from "../../model/caption-presets";
+ import { matchPresetId } from "../model/caption-presets";
```
`:12` `import CaptionPreviewPlayer from "./CaptionPreviewPlayer";`는 두 파일이 같은 `ui/`로 함께 옮겨지므로 **무변경**이다. `~/fsd/shared/...` 임포트도 무변경.

**`caption-style/model/caption-presets.ts`·`caption-preview.test.mjs`·`caption-presets.test.mjs`** (이동 후) — 임포트가 절대경로(`~/fsd/shared/...`, `~/fsd/features/clip-review/model/schemas`) 또는 같은 폴더 상대경로(`./caption-preview.ts`·`./caption-presets.ts`)뿐이라 **한 줄도 바꾸지 않는다.** 메인 루프의 `git mv` 뒤 Edit하지 않는다.

**`widgets/clip-draft-review/ui/_component/CaptionStyleDialog.tsx`** — `:16` 교체(default → named barrel 임포트):

```
- import CaptionStyleEditor from "./CaptionStyleEditor";
+ import { CaptionStyleEditor } from "~/fsd/features/caption-style";
```

(호출부 `:71-79`는 무변경. 위젯 → features barrel = 하향 + public entry라 W6 통과.)

**`widgets/clip-draft-review/model/use-clip-draft-review.ts`** — `:19` 교체:

```
- import { matchPresetId } from "./caption-presets";
+ import { matchPresetId } from "~/fsd/features/caption-style";
```

(`:15`의 `TranscriptWord` 임포트와 `:21` 재수출은 clip-review barrel 경유라 무변경.)

## 테스트

- **덮는 것**: 이동한 순수 모델의 계약은 함께 옮긴 `caption-preview.test.mjs`·`caption-presets.test.mjs`가 그대로 지킨다. 새 로직이 없으므로 새 테스트는 없다. `parseTranscriptWords`의 회귀 방어는 `features/clip-review/model/transcript.test.mjs`가 제자리에서 계속 지킨다.

- **기계적 인수 기준(백로그·main-loop 요구)** — 옮긴 테스트 2개의 diff가 **경로 변경뿐**임을 다음으로 확인한다. 두 테스트 파일은 임포트가 절대경로 또는 같은 폴더 상대경로뿐이라 내용이 바이트 불변이므로:
  - 메인 루프의 `git mv` 직후 `git diff --cached -M --name-status`에서 여섯 이동이 모두 `R100`으로 잡힌다(`git mv`는 blob을 그대로 두고 경로만 스테이징한다). 뒤이은 web-dev의 임포트 편집은 워킹트리에만 있으므로 이 스테이징 결과는 바뀌지 않는다.
  - 내용 대조는 **blob id로** 한다: `git rev-parse HEAD:apps/web/src/fsd/widgets/clip-draft-review/model/caption-preview.test.mjs`와 `git rev-parse :apps/web/src/fsd/features/caption-style/model/caption-preview.test.mjs`(스테이징된 새 경로)가 같고, `git diff --quiet -- apps/web/src/fsd/features/caption-style/model/caption-preview.test.mjs`가 종료코드 0이어야 한다(워킹트리≡인덱스). `caption-presets.test.mjs`도 동일. **워킹카피를 `git show HEAD:… | diff -`로 대조하지 않는다** — 이 저장소는 `core.autocrlf=true`라 `caption-presets.ts`·`caption-presets.test.mjs`의 워킹카피는 CRLF, HEAD blob은 LF여서 내용이 같아도 모든 줄이 다르다고 나온다(계획 검증에서 실측).
  - 이동한 **비테스트** 파일 중 `caption-presets.ts`도 같은 blob id 대조로 내용 불변이어야 한다. `caption-preview.ts`·`CaptionPreviewPlayer.tsx`·`CaptionStyleEditor.tsx`는 위 스케치에 적은 임포트 줄만 diff에 나타나야 하고 그 밖의 줄(특히 `main.py:NNN` 주석)은 변화가 없어야 한다.

- **동작 무변경의 증거**:
  - `npm run check -w apps/web` 통과(그 안 `verify:fsd`가 새 슬라이스 경계 — W2 없음·W6 barrel 경유·W7 임포트 해석 — 을 기계 검증).
  - `npm test -w apps/web`의 통과 수가 이동 전과 같아야 한다. **현 기준선은 131개 전부 통과**(워킹트리에 FEAT-38 보류 변경이 있어 130→131). 파일을 옮기기만 하므로 개수 불변 = 131/131.

- **못 덮는 범위**: 편집기·미리보기 컴포넌트의 실제 렌더는 Node 내장 러너로 확인할 수 없다(DOM·React 테스트 도구 없음). 다만 이 항목은 렌더 로직을 바꾸지 않고 파일 위치만 옮기므로, 시각적 동일성은 `check`·`test` 통과와 순수 모델 바이트 불변으로 충분히 뒷받침된다. 설정 화면에서의 실사용은 FEAT-42의 몫이다.

## 범위 밖 의존

담당 범위(`apps/web/src`) 안에서 전부 처리된다 — 코드 이동·재배선을 막는 `packages/db`·다른 워크스페이스 의존은 없다.

다만 web-dev가 쓸 수 없는 문서 인용 다섯이 옛 경로/슬라이스 목록을 담고 있어, **이동 후 메인 루프가 인수 때 갱신해야 한다**(여기서는 목록만 남긴다):

1. `apps/web/CLAUDE.md` 테스트 목록 표 — 두 행의 경로가 `widgets/clip-draft-review/model/caption-preview.test.mjs`·`...caption-presets.test.mjs`에서 `features/caption-style/model/...`로 바뀐다.
2. `apps/web/CLAUDE.md` FSD 레이어 표(`features/` 행) — 슬라이스 목록에 `caption-style` 추가.
3. `apps/web/CLAUDE.md` 테스트 개수 문장("20개 파일, 31 suite, 130개 테스트") — 파일 개수·테스트 개수는 이동으로 불변이라 그대로 두어도 되지만, 경로가 옮겨진 사실과의 정합은 메인 루프 판단.
4. `TASK_BACKLOG.md` — FEAT-42의 `source`가 `CaptionPreviewPlayer.tsx:53/:63/:112`·`features/caption-style 상수`를, FEAT-44의 `area`·인용이 `caption-preview.ts`·`caption-preview.test.mjs`·`CaptionPreviewPlayer.tsx`의 옛 경로를 가리킨다. FEAT-44는 "FEAT-40과 동시 진행 금지, 먼저 끝난 쪽 결과를 기준으로 삼는다"라 재-grep 시 새 경로를 잡지만, 백로그 인용 경로의 드리프트는 메인 루프가 인지할 사항.
5. `TASK_BACKLOG.md` — FEAT-38의 `source`도 `widgets/clip-draft-review/model/caption-preview.test.mjs`를 계약 근거로 인용한다(같은 이유로 인수 때 메인 루프가 경로 갱신).

`docs/plans`·`docs/agents`의 옛 경로 인용은 작성 시점 기록이라 갱신 대상이 아니다(`docs/agents/README.md` 「감사 대상이 아니다」와 FEAT-44 제외 규칙과 같은 이유).

**파일 이동은 메인 루프가 한다.** 이동에는 옛 6개 파일의 삭제가 따르는데, web-dev 정의 파일(`.claude/agents/web-dev.md:53`)이 Bash를 읽기·검증 전용으로 묶어 web-dev는 `git mv`도 파일 삭제도 할 수 없다. 그래서 게이트② 개방 직후 메인 루프가 「고칠 파일」의 이동 6건을 `git mv`로 수행하고(커밋하지 않음) web-dev에 넘긴다 — 절차의 분담일 뿐 변경 내용은 이 계획서 그대로다.

## 대안

- **`TranscriptWord`를 `shared/lib/transcript.ts` 대신 `shared/config` 또는 새 `shared/model` 세그먼트에 두기** — `config`는 상수/설정 자리라 타입 인터페이스와 어울리지 않고, `shared/model`은 현재 저장소에 없는 세그먼트를 새로 여는 것이라 최소 변경 원칙에서 벗어난다. `shared/lib`는 이미 순수 유틸·타입(`format-date.ts`·`format-duration.ts` 등)이 사는 자리라 3필드 데이터 셰이프의 가장 가까운 기존 집이다.
- **`TranscriptWord`를 clip-review에 두고 caption-style이 거기서 재수출 barrel 경유로 임포트** — features peer 임포트(W2)는 barrel을 거쳐도 금지다(`verify-fsd-boundaries.mjs:202-204`는 대상 레이어가 `shared`가 아닌 한 same-slice가 아니면 막는다). 경계상 불가.
- **슬라이스 barrel에 `CaptionPreviewPlayer`·`buildCaptionCues`까지 공개** — 현재 외부 소비자가 없어 YAGNI. 동작 무변경 원칙상 공개 표면을 현재 소비에 맞춰 최소화하고, 확장은 실제 필요가 생기는 FEAT-42에 맡긴다.
