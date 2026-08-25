# FEAT-21: 번역 폴백 안내의 웹 절반 — `subtitleStatus` 소비·클립 카드 안내

agent: web-dev

> area 참고: 보드/백로그의 `area`는 `apps/web/src/app/api/webhooks/modal + src/inngest +
> src/fsd/entities/clip + src/fsd/widgets/clip-display`이고, 유실 지점 다섯은 전부 그 안에 있다
> (`route.ts`·`client.ts`·`functions.ts`·`entities/clip/api`·`ClipCard.tsx`). 모두 `apps/web/src/**`라
> web-dev 담당이다. **다만 값을 영구 저장할 `Clip.subtitleStatus` 컬럼이 스키마에 없다** —
> 이 하나가 `packages/db`(범위 밖)이고 「범위 밖 의존」에 경계를 긋는다. FEAT-16이 정확히 같은
> 부류(파이프라인이 보내는데 웹이 버리는 값)의 선례이며, 그때는 스키마가 선행 적용된 상태로 발주됐다.

## 현재 동작

백엔드는 클립마다 `subtitleStatus`(camelCase, 값 `"ok"`/`"partial-fallback"`/`"full-fallback"`)를
성공 콜백 `clips[]`에 싣는다 — BUG-02 구현이 `process_clip` 반환 dict의 `language` 아래에
`"subtitleStatus": subtitle_status`를 추가했고(`docs/agents/backend-dev/BUG-02.md` §4,
`docs/plans/BUG-02.md` 스케치 §4의 `main.py:859-869` after), 이 dict가 `clip_results`에
누적되어 성공 콜백 `clips` 배열로 나간다. 상태 리터럴 세 값은 `translation_fallback.py`의
`TRANSLATION_OK="ok"`·`TRANSLATION_PARTIAL_FALLBACK="partial-fallback"`·
`TRANSLATION_FULL_FALLBACK="full-fallback"`이다(`docs/plans/BUG-02.md` §1). 영어 클립은
백엔드가 `subtitle_status = TRANSLATION_OK`로 초기화 후 Korean 분기에 들어가지 않아 항상 `"ok"`다.

이 값이 웹의 render/auto 저장·표시 경로에서 **다섯 지점에 걸쳐 유실된다**(FEAT-16의
`clipType`·`hook`·`payoff`와 동형).

1. **웹훅 정규화** — `src/app/api/webhooks/modal/route.ts`. 콜백 원본을 처음 정규화하는
   `normalizeClip`(`route.ts:131-154`)이 반환하는 `ModalWebhookClip`(`route.ts:10-23`) 필드에
   `subtitleStatus`가 없고, 입력 타입 `RawModalWebhookClip`(`route.ts:25-46`)에도 없어 읽지도 않는다.
   정규화 결과는 `modal/video.processed` 이벤트로 나가고(`route.ts:249-259`, `clips: body.clips`)
   동시에 `updateClipMetadataFromBackendClips(body.clips)`로도 직접 반영된다(`route.ts:266-276`) —
   두 소비처 모두 이미 벗겨진 값을 받는다.

2. **이벤트 타입** — `src/inngest/client.ts`. `modal/video.processed` 이벤트의 `clips` 원소
   타입(`client.ts:84`)인 `ProcessVideoBackendClip`(`client.ts:4-17`)에 `subtitleStatus`가 없다.

3. **워커 재정규화** — `src/inngest/functions.ts`. `normalizeBackendClip`(`functions.ts:126-154`)이
   반환하는 `ProcessVideoBackendClip`(`functions.ts:39-52`)·입력 `RawProcessVideoBackendClip`
   (`functions.ts:54-75`)에 `subtitleStatus`가 없다. `backendClips`는 `normalizeBackendClips`가
   `applyModalPayload` 안에서 대입하는 `functions.ts:482` 한 곳에서만 만들어지고(그 payload는
   sync 응답 `:492`·폴링 콜백 `:518`·메타데이터 유예 콜백 `:557` 세 호출처로 수렴), 그 값으로
   `persistGeneratedClips`가 Clip을 만든다.

4. **DB 쓰기** — `persistGeneratedClips`의 create 데이터(`functions.ts:212-228`)와,
   `updateClipMetadataFromBackendClips`가 쓰는 `ClipMetadataPatch`
   (`src/fsd/entities/clip/api/index.ts:51-62`)·`toClipMetadataUpdateData`
   (`index.ts:65-83`) 어디에도 `subtitleStatus`가 없다. 설령 위 1~3을 통과해도 여기서 컬럼에
   안 담긴다. (이 패치는 웹훅 `route.ts:268`과 워커 `functions.ts:257` 두 호출부를 함께 덮는다.)

5. **표시** — 최종 클립 조회는 `src/fsd/entities/uploaded-file/api/index.ts:413-424`의
   `db.clip.findMany`가 `select` 없이 전체 `Clip`을 읽어 `UploadedFileDetail.clips: Clip[]`
   (`entities/uploaded-file/model/types.ts:44`)로 담고, `ClipDisplay`(`clip-display/ui/index.tsx:30-38`)
   → `ClipCard`로 넘긴다. `ClipCard`(`clip-display/ui/_component/ClipCard.tsx:28-138`)는 `clip: Clip`
   전체를 받지만 비디오·선택 근거(FEAT-16)·액션·모달만 렌더하고 `subtitleStatus`는 화면에 쓰지 않는다.

**스키마 상태**: `Clip` 모델에 `clipType`·`hook`·`payoff`(FEAT-16, `schema.prisma:120-122`)는 있다.
`subtitleStatus` 컬럼은 계획 작성 시점(2026-08-25)에는 없었으나, **2026-08-26 선행 적용이 완료됐다**
— 커밋 `19dda69`: `subtitleStatus String?` 추가(`schema.prisma:124-127` 부근), 마이그레이션
`20260826000000_clip_subtitle_status` Neon 적용, Prisma 클라이언트 재생성(생성 타입 반영 검산).
「범위 밖 의존」의 전제가 충족된 상태다 — 구현은 순수 apps/web 작업으로 착수 가능하다.

## 문제

백로그(`TASK_BACKLOG.md` FEAT-21, source: BUG-02 구현 「범위 밖 의존」)가 지목한 대로,
백엔드는 번역 실패 신호(`subtitleStatus`)를 클립마다 콜백에 실어 보내지만 웹 정규화
`normalizeClip`(`route.ts:131-154`)이 알려진 키만 담아 이 값을 버려(위 「현재 동작」 1),
정규화·타입·DB 쓰기·표시 다섯 지점에 필드가 전부 없다(위 1~5). 그 결과 한국어 자막을 요청한
사용자가 번역이 실패해 영어 자막으로 렌더된 영상을 받아도 **화면에 아무 안내가 없다** —
BUG-02가 백엔드에서의 조용한 유실은 멈췄으나 사용자에게 보이는 알림은 아직 없다.

백로그가 지목한 유실 지점(`normalizeClip`이 미지 키를 버림)은 코드와 일치했다. FEAT-16과 같은
부류이므로 그 선례대로 유실 지점을 다섯으로 세워 값을 콜백→정규화→이벤트→DB→화면까지 잇는다.
다만 FEAT-16과 달리 **저장 컬럼(`Clip.subtitleStatus`)이 스키마에 없어**, 이 apps/web 작업은
그 컬럼의 선행 적용을 전제로만 성립한다(웹 코드가 `clip.subtitleStatus`를 참조하는 순간
`tsc`가 통과하려면 컬럼·재생성이 먼저 있어야 한다). 이 경계는 「범위 밖 의존」이 그린다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/app/api/webhooks/modal/route.ts` | `ModalWebhookClip`·`RawModalWebhookClip` 타입과 `normalizeClip` 반환에 `subtitleStatus` 추가 |
| `src/inngest/client.ts` | `ProcessVideoBackendClip`(이벤트 페이로드 타입)에 `subtitleStatus` 추가 |
| `src/inngest/functions.ts` | `ProcessVideoBackendClip`·`RawProcessVideoBackendClip` 타입, `normalizeBackendClip` 반환, `persistGeneratedClips` create 데이터에 `subtitleStatus` 추가 |
| `src/fsd/entities/clip/api/index.ts` | `ClipMetadataPatch`·`toClipMetadataUpdateData`에 `subtitleStatus` 추가 |
| `src/fsd/widgets/clip-display/model/subtitle-status.ts` `(신규)` | `subtitleFallbackNotice` 순수 함수 (상태 → 사용자 안내 문구) |
| `src/fsd/widgets/clip-display/model/subtitle-status.test.mjs` `(신규)` | 위 함수 테스트 |
| `src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx` | 비디오 아래에 폴백 안내 블록 렌더 |

여기 없는 파일(특히 `packages/db/prisma/schema.prisma`·`ClipDraftCard.tsx`·표시 조회
`uploaded-file/api/index.ts`·`clip-rationale.ts`)은 구현 단계에서 고치지 않는다. 조회 경로와
`Clip[]` 타입은 스키마에 컬럼이 생기면 전체 Clip을 읽으므로(위 「현재 동작」 5) 코드 변경이
필요 없다.

## 구현 스케치

### 신규 순수 모듈 — `src/fsd/widgets/clip-display/model/subtitle-status.ts`

`clip-rationale.ts`(FEAT-16)와 같은 슬라이스 `model/`에 두는 별개 관심사(선택 근거가 아니라
자막 폴백 상태). `clipTypeLabel`이 미지 값을 원본 그대로 돌리는 것과 달리, 여기서는 **명시적
폴백 상태 둘만** 안내를 낸다 — `"ok"`·미지 값·nullish/공백은 전부 `null`(안내 없음)이다.
정상 자막이나 예상 밖 값에 "번역 실패" 경고를 붙이지 않기 위해서다.

```ts
// 백엔드가 클립마다 콜백에 싣는 subtitleStatus(BUG-02)를 사용자 안내 문구로 매핑한다.
// 키는 translation_fallback.py의 상태 상수와 일치해야 한다(콜백 wire 계약):
//   "partial-fallback" = 일부 줄이 영어로 폴백, "full-fallback" = 전량 영어 폴백.
// "ok"·미지 값·nullish/공백은 안내 없음(null) — 정상 자막에 경고 배지를 붙이지 않는다.
// 앱 UI 언어는 영어다(ClipCard/ClipActions/ScriptModal 전부 영어) — 문구도 영어.
const SUBTITLE_FALLBACK_NOTICES: Record<string, string> = {
  "partial-fallback": "Some subtitles couldn't be translated — shown in English.",
  "full-fallback": "Translation failed — subtitles shown in English.",
};

export function subtitleFallbackNotice(
  subtitleStatus: string | null | undefined,
): string | null {
  if (subtitleStatus == null) return null;
  const trimmed = subtitleStatus.trim();
  if (trimmed.length === 0) return null;
  return SUBTITLE_FALLBACK_NOTICES[trimmed] ?? null;
}
```

### `route.ts` — `normalizeClip`이 값을 보존

`ModalWebhookClip`(`route.ts:10-23`)의 `payoff?: string | null;` 아래, 닫는 괄호 앞에 추가:

```ts
  payoff?: string | null;
  subtitleStatus?: string | null;
}
```

`RawModalWebhookClip`(`route.ts:25-46`)의 `payoff?: string | null;` 아래, 닫는 괄호 앞에 추가
(백엔드가 camelCase만 보내므로 snake 변형은 두지 않는다 — `hook`/`payoff`와 동일. `clipType`만
snake를 둔 것은 `normalizeAnalyzedMoment`의 기존 `clip_type` 선례 때문이고 여기 해당 없음):

```ts
  payoff?: string | null;
  subtitleStatus?: string | null;
}
```

`normalizeClip` 반환(`route.ts:138-153`)의 `payoff: rawClip.payoff ?? null,` 아래, 닫는 괄호 앞에 추가:

```ts
    payoff: rawClip.payoff ?? null,
    subtitleStatus: rawClip.subtitleStatus ?? null,
  };
```

### `client.ts` — 이벤트 페이로드 타입(`client.ts:4-17`)

`payoff?: string | null;` 아래, 닫는 괄호 앞에 추가:

```ts
  payoff?: string | null;
  subtitleStatus?: string | null;
};
```

### `functions.ts`

`ProcessVideoBackendClip`(`functions.ts:39-52`)·`RawProcessVideoBackendClip`(`functions.ts:54-75`)
각각의 `payoff?: string | null;` 아래, 닫는 괄호 앞에 `subtitleStatus?: string | null;` 추가
(raw에도 camelCase만 — snake 변형 없음).

`normalizeBackendClip` 반환(`functions.ts:138-153`)의 `payoff: rawClip.payoff ?? null,` 아래,
닫는 괄호 앞에 추가:

```ts
    payoff: rawClip.payoff ?? null,
    subtitleStatus: rawClip.subtitleStatus ?? null,
  };
```

`persistGeneratedClips` create 데이터(`functions.ts:212-228`)의 `payoff: clip.payoff ?? null,`
아래, 닫는 괄호 앞에 추가:

```ts
        payoff: clip.payoff ?? null,
        subtitleStatus: clip.subtitleStatus ?? null,
      });
```

### `entities/clip/api/index.ts`

`ClipMetadataPatch`(`index.ts:51-62`)의 `payoff?: string | null;` 아래, 닫는 괄호 앞에
`subtitleStatus?: string | null;` 추가.

`toClipMetadataUpdateData`(`index.ts:65-83`)의 마지막 스프레드(`payoff`) 뒤에 추가 — 기존
`!= null` 가드 규칙(존재하는 값 안 지움)을 그대로 따른다:

```ts
    ...(clip.payoff != null ? { payoff: clip.payoff } : {}),
    ...(clip.subtitleStatus != null
      ? { subtitleStatus: clip.subtitleStatus }
      : {}),
  };
```

### `ClipCard.tsx` — 폴백 안내 블록 렌더

파생값 추가(`ClipCard.tsx:54`, `const showRationale = hasClipRationale(clip);` 아래):

```tsx
  const showRationale = hasClipRationale(clip);
  const fallbackNotice = subtitleFallbackNotice(clip.subtitleStatus);
```

`<ClipVideoPlayer … />`(`ClipCard.tsx:90-95`)와 `{showRationale && (`(`:96`) 사이에 삽입.
안내는 graceful degradation(영상은 정상, 자막만 영어)이라 hard error(red)가 아닌 amber로 낸다
— `ProcessingTimeline.tsx:169-176`의 `AlertTriangle` + `CharacterCountBar.tsx:3`의 amber 톤 선례.
`fallbackNotice`가 null이면(정상·미지·과거 NULL 행) 블록 자체가 없어 카드가 지금과 동일하다:

```tsx
      {fallbackNotice && (
        <p className="flex items-start gap-1 text-xs leading-snug text-amber-600 dark:text-amber-500">
          <AlertTriangle className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          <span>{fallbackNotice}</span>
        </p>
      )}
```

임포트 추가(상용구): `import { AlertTriangle } from "lucide-react";`,
`import { subtitleFallbackNotice } from "~/fsd/widgets/clip-display/model/subtitle-status";`
(`clip-rationale` 임포트가 이미 `ClipCard.tsx:10-13`에 있으니 같은 자리 규칙을 따른다).

## 테스트

- **덮는 것** (`subtitle-status.test.mjs`, `./subtitle-status.ts`를 명시 확장자로 임포트 —
  `clip-rationale.test.mjs`·`selection-budget.test.mjs:7` 선례):
  - `subtitleFallbackNotice`:
    - `"partial-fallback"` → `"Some subtitles couldn't be translated — shown in English."`
    - `"full-fallback"` → `"Translation failed — subtitles shown in English."`
    - `"ok"` → `null` (정상 — 안내 없음)
    - 미지 값(`"weird"`) → `null`
    - `null`·`undefined` → `null`
    - 빈 문자열·공백(`"  "`) → `null`
    - **앞뒤 공백이 붙은 상태값(`" partial-fallback "`) → 안내** — `trim()`의 존재 이유를 밟는
      단언이다. 검증 돌연변이에서 trim 제거가 이 단언 없이는 살아남았다(공백-only 케이스는 맵
      조회 실패가 대신 null을 주어 못 잡는다)
    - (기록) `trimmed.length === 0` 가드는 맵 조회 폴백(`?? null`)과 동작 등가라 제거 돌연변이가
      사멸 불가능하다(등가 돌연변이 — 명세 구멍 아님). 의도 문서화용으로 유지한다
  - 상태 리터럴 회귀 가드: `"partial-fallback"`/`"full-fallback"`이 정확히 매핑에 있고
    `"ok"`는 없는 것을 단언한다(콜백 wire 계약과 어긋나면 안내가 조용히 꺼진다 —
    `clip-generation-outcome.test.mjs`가 노트 코드에 두는 것과 같은 이유).
- **못 덮는 범위** (현재 Node 러너·DOM/외부 I/O 없음):
  - `route.ts`·`functions.ts`의 파서(`normalizeClip`/`normalizeBackendClip`) — 순수 함수로
    내보내지 않고 `~/env`·`server-only`·Prisma를 끌어와 tsx 러너로 로드 불가. 기존 파서도 같은
    이유로 무테스트(현 상태 유지).
  - `persistGeneratedClips` create·`toClipMetadataUpdateData` update의 실제 DB 반영(Prisma·외부 I/O).
  - `ClipCard`의 안내 블록 렌더·amber 색·`AlertTriangle`·null 분기(React/DOM 없음) — 수동 확인.
    **배포만으로는 안내가 뜨는 경로를 볼 수 없다.** ① 기존 `Clip` 행은 새 컬럼이 NULL이라
    `fallbackNotice === null`로 떨어지고, ② 새 클립도 번역이 **실제로 실패해야** `"partial-fallback"`/
    `"full-fallback"`이 실린다 — FEAT-16의 선택 근거(모든 클립에 존재)보다도 재현이 까다롭다.
    안내가 뜬 화면을 확인하려면 둘 중 하나가 필요하다(어느 쪽을 할지는 사용자가 정한다):
    (a) 번역이 실패하는 소스로 파이프라인을 1회 실주행(L40S GPU + 크레딧, 실패 자체가 비결정적),
    (b) 기존 `Clip` 행 하나의 `subtitleStatus`에 `"partial-fallback"`/`"full-fallback"`을 임시
    주입해 확인 후 되돌리기(프로덕션 DB 쓰기). 배포 직후 확인되는 것은 "정상 클립 카드가
    지금과 동일하다"는 회귀 없음뿐이다.
  - 백엔드→웹훅→이벤트→DB 전 구간 wire 왕복.

## 범위 밖 의존

**`Clip.subtitleStatus` 저장 컬럼이 스키마에 없다.** 값을 영구 저장해 화면에서 읽으려면
`packages/db/prisma/schema.prisma`의 `Clip` 모델에 컬럼을 추가하고 마이그레이션을 적용한 뒤
Prisma 클라이언트를 재생성해야 한다 — 전부 `packages/db`이고 web-dev 담당 범위 밖이다.
**계획서에 적어도 담당 범위는 넓어지지 않는다.** 구현 단계에서 이 지점(스키마·마이그레이션·
`db:generate`/`db:push`)에 닿으면 그 항목은 `보류`가 된다.

필요한 컬럼 정의(`Clip` 모델, `clipType`/`hook`/`payoff` 옆 `schema.prisma:120-122` 부근):

```prisma
    subtitleStatus String?
```

- `String?`(nullable): 기존 행은 NULL로 남고 `subtitleFallbackNotice(null) → null`이라 안내가
  안 뜬다 — **백필 불필요.** 영어·정상 한국어 클립은 백엔드가 `"ok"`를 실어 역시 안내 없음.
- 이 필드는 순증분이라 웹을 깨지 않지만, **apps/web 구현은 이 컬럼이 선행 적용돼야만 검증을
  통과한다.** 웹 코드가 `persistGeneratedClips` create·`toClipMetadataUpdateData`·
  `ClipCard`에서 `subtitleStatus`를 참조하는데, 컬럼이 없으면 `Prisma.ClipCreateManyInput`·
  `Prisma.ClipUpdateManyMutationInput`·`Clip` 타입에 그 키가 없어 `npm run check`(tsc)가 실패한다.

**전제(사용자/메인 루프가 선행 적용)**: FEAT-16과 동일하게, 이 컬럼 추가 + 마이그레이션 +
Prisma 클라이언트 재생성을 **구현 착수 전에** 적용한다(FEAT-16은 커밋 `544ac12`,
마이그레이션 `20260820000000_clip_selection_rationale`으로 적용 완료 상태에서 web-dev에게
발주됐다). 이 전제가 서면 이후 작업은 `packages/db`를 건드리지 않는 순수 `apps/web` 작업이다.

**전제 충족(2026-08-26)**: 사용자 승인("적용") 후 메인 루프가 선행 적용을 완료했다 — 커밋
`19dda69`(컬럼 + 마이그레이션 `20260826000000_clip_subtitle_status` Neon 적용 + 클라이언트
재생성). 검증 라운드의 조립 게이트(check EXIT 0·tsc 통과)가 이 상태에서 실측됐다.

## 대안

- **폴백 안내를 `clip-rationale.ts`에 합치기** — 기각. 선택 근거(clipType/hook/payoff, 왜 이
  클립인가)와 자막 폴백 상태(번역이 실패했나)는 별개 관심사다. `clipTypeLabel`은 미지 값을
  원본 그대로 돌리지만 `subtitleFallbackNotice`는 미지 값을 null로 삼켜야 해 규칙도 반대다.
  같은 슬라이스 `model/`의 별 파일로 둔다.
- **미지 값에도 안내 표시** — 기각. 백엔드가 예상 밖 값을 보낼 때 "번역 실패"라고 단정하면
  거짓 경고가 된다. 명시적 폴백 상태 둘만 안내를 낸다.
- **`subtitleStatus`를 bool(`translationFallback`)로 좁혀 저장** — 기각. 백엔드(BUG-02)가 이미
  3-상태 문자열로 확정해 콜백에 싣는다. 웹이 bool로 좁히면 부분/전량 폴백을 구분하는 두
  안내 문구를 만들 근거를 잃는다. wire 계약대로 3-상태를 그대로 저장·소비한다.
- **area대로 `functions.ts`만 고치고 `route.ts`·`client.ts`는 두기** — 기각. 비동기(프로덕션)
  경로는 콜백이 `route.ts`의 `normalizeClip`을 먼저 지나며 값을 벗기므로(위 「현재 동작」 1),
  `functions.ts`만 고치면 프로덕션에서 값이 여전히 null이다. FEAT-16과 같은 이유.
