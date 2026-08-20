# FEAT-16: 최종 클립에 선택 근거(hook·payoff·clipType) 저장·표시

agent: web-dev

> area 참고: 보드/백로그의 `area`는 `apps/web/src/inngest + entities/clip + widgets/clip-display`이지만,
> 실제 render/auto(최종 Clip) 경로의 유실 지점은 그 밖의 두 파일에도 있다 —
> `src/app/api/webhooks/modal/route.ts`(App Router)와 `src/inngest/client.ts`(이벤트 페이로드 타입).
> 둘 다 `apps/web/src/**` 범위 안이라 web-dev 담당이다. area는 출발점이었을 뿐 실호출 경로를 따라간다.

## 현재 동작

백엔드는 auto·render 두 경로 모두 클립마다 `clipType`·`hook`·`payoff`를 성공 콜백의 `clips[]`에 싣는다
(`apps/backend/main.py:1118-1120`이 `clip_result["clipType"/"hook"/"payoff"] = moment.get("type"/"hook"/"payoff")`로 세팅,
`main.py:1124-1132`이 `clips: clip_results`로 콜백 POST). 키는 전부 camelCase(`clipType`)이고 값은 없을 수 있다(`.get()`).

이 셋이 웹의 render/auto 저장 경로에서 **네 지점에 걸쳐 유실된다.**

1. **웹훅 정규화** — `src/app/api/webhooks/modal/route.ts:124-144`의 `normalizeClip`이 반환하는
   `ModalWebhookClip`(`route.ts:10-20`) 9개 필드에 이 셋이 없다. 콜백 원본을 여기서 처음 정규화하는데,
   `RawModalWebhookClip`(`route.ts:22-39`)에도 세 키가 없어 읽지도 않는다. 정규화 결과는
   `modal/video.processed` 이벤트로 나가고(`route.ts:239-249`, `data.clips: body.clips`) 동시에
   `updateClipMetadataFromBackendClips(body.clips)`로도 직접 반영된다(`route.ts:256-262`) — 두 소비처 모두 이미 벗겨진 값을 받는다.
   (대조: 같은 파일의 `normalizeAnalyzedMoment`(`route.ts:146-169`)는 analyze 경로 moment에서
   `clipType ?? clip_type`·`hook`·`payoff`를 **이미 보존**한다. 그래서 ClipDraft에는 값이 들어간다.)

2. **이벤트 타입** — `src/inngest/client.ts:4-14`의 `ProcessVideoBackendClip`(=`modal/video.processed` 이벤트의
   `clips` 원소 타입, `client.ts:81`)에도 이 셋이 없다. (같은 파일 `AnalyzedMoment`(`client.ts:33-40`)에는 세 필드가 이미 있다.)

3. **워커 재정규화** — `src/inngest/functions.ts:119-144`의 `normalizeBackendClip`이 반환하는 9개 필드에 없다.
   `ProcessVideoBackendClip`(`functions.ts:39-49`)·`RawProcessVideoBackendClip`(`functions.ts:51-68`) 타입에도 없다.
   이 함수가 `backendClips`를 만드는 유일한 지점이고(`functions.ts:469`, sync 응답 `functions.ts:482`·
   이벤트 폴링 `functions.ts:508,547` 모두 이곳으로 수렴), 그 값으로 `persistGeneratedClips`가 Clip을 만든다.

4. **DB 쓰기** — `persistGeneratedClips`의 create 데이터(`functions.ts:202-215`)와,
   `updateClipMetadataFromBackendClips`가 쓰는 `ClipMetadataPatch`(`src/fsd/entities/clip/api/index.ts:51-59`)·
   `toClipMetadataUpdateData`(`index.ts:62-77`) 어디에도 이 셋이 없다. 설령 위 1~3을 통과해도 여기서 컬럼에 안 담긴다.

스키마에는 컬럼이 이미 있다 — `Clip.clipType/hook/payoff` 전부 `String?`(`packages/db/prisma/schema.prisma:120-122`,
주석이 "auto 경로 클립엔 대응 ClipDraft 행이 없어 여기 저장 안 하면 유실"이라고 명시). `ClipDraft`도 동명 컬럼을 가진다(`schema.prisma:157-159`).

**표시 쪽**: 최종 클립 조회는 `src/fsd/entities/uploaded-file/api/index.ts:413-424`의 `db.clip.findMany`가
`select` 없이 전체 `Clip`을 읽어 `ClipDisplay`(`upload-detail/ui/index.tsx:187`)→`ClipCard`로 넘긴다.
`ClipCard`(`src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx:79-111`)는 `clip: Clip` 전체를 받지만
비디오·액션·모달만 렌더하고 `clipType/hook/payoff`는 **화면에 쓰지 않는다.**
반면 리뷰 카드 `ClipDraftCard.tsx:288-328`은 같은 값을 이미 표시한다 — 유형 라벨(`CLIP_TYPE_LABELS` 매핑, 없으면 원본; `:27-30,292-296`),
hook(`line-clamp-2` semibold; `:321-323`), payoff(`line-clamp-2` muted; `:324-328`). `:314-320` 주석은
`line-clamp-*`와 `block`을 같이 쓰면 clamp가 죽는다는 실측을 남겨 둔다.

## 문제

백엔드가 클립마다 계산해 보내는 선택 근거 세 값(`clipType`·`hook`·`payoff`)이 render/auto 경로에서
정규화·타입·DB 쓰기 네 지점에 전부 필드가 없어 웹이 통째로 버린다(위 「현재 동작」 1~4). 그 결과 최종 클립 카드가
"왜 이 클립인가"를 못 보여주고, 사용자는 여러 클립 중 무엇을 먼저 올릴지 정하려면 하나씩 재생해야 한다.
같은 정보를 리뷰 카드는 표시하지만 리뷰는 `reviewBeforeGenerate @default(false)`라 주 경로가 아니다(백로그 FEAT-16 source, 실측 auto 14 : analyze 5).

백로그가 지목한 유실 지점 셋(`functions.ts:119-144` 파서 / `entities/clip/api/index.ts:51-77` 패치 타입 /
표시 부재)은 코드와 일치했다. 다만 백로그가 명시하지 않은 **네 번째·다섯 번째 지점**(웹훅 `route.ts`의
`normalizeClip`과 `client.ts`의 이벤트 타입)이 render/auto 경로에 먼저 있어, 그 둘을 빼면 프로덕션(비동기)에서
값이 여전히 null이 된다. 백로그의 문제 정의는 유지하되 유실 지점을 다섯으로 확장해 세운다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `src/app/api/webhooks/modal/route.ts` | `ModalWebhookClip`·`RawModalWebhookClip` 타입과 `normalizeClip` 반환에 세 필드 추가 |
| `src/inngest/client.ts` | `ProcessVideoBackendClip`(이벤트 페이로드 타입)에 세 필드 추가 |
| `src/inngest/functions.ts` | `ProcessVideoBackendClip`·`RawProcessVideoBackendClip` 타입, `normalizeBackendClip` 반환, `persistGeneratedClips` create 데이터에 세 필드 추가 |
| `src/fsd/entities/clip/api/index.ts` | `ClipMetadataPatch`·`toClipMetadataUpdateData`에 세 필드 추가 |
| `src/fsd/widgets/clip-display/model/clip-rationale.ts` `(신규)` | `clipTypeLabel`·`hasClipRationale` 순수 함수 |
| `src/fsd/widgets/clip-display/model/clip-rationale.test.mjs` `(신규)` | 위 두 함수 테스트 |
| `src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx` | 비디오 아래·액션 위에 선택 근거 블록 렌더 |

여기 없는 파일(특히 `ClipDraftCard.tsx`·`packages/db`)은 구현 단계에서 고치지 않는다.

## 구현 스케치

### 신규 순수 모듈 — `src/fsd/widgets/clip-display/model/clip-rationale.ts`

```ts
// 백엔드 프롬프트가 열거하는 clipType 값은 "qa"|"insight" 둘뿐이나 강제 장치가 없어
// 다른 값이 올 수 있다(ClipDraftCard.tsx:22-30 주석과 같은 사실). 매핑에 없으면 원본을
// 그대로 돌려 빈 칸으로 삼키지 않는다. widgets/clip-draft-review의 동명 상수와 규칙이 같지만
// FSD 동일 레이어 peer 임포트 금지라 공유하지 않고 여기 둔다(「대안」 참조).
const CLIP_TYPE_LABELS: Record<string, string> = {
  qa: "Q&A",
  insight: "Insight",
};

export function clipTypeLabel(
  clipType: string | null | undefined,
): string | null {
  if (clipType == null) return null;
  const trimmed = clipType.trim();
  if (trimmed.length === 0) return null;
  return CLIP_TYPE_LABELS[trimmed] ?? trimmed;
}

export function hasClipRationale(clip: {
  clipType: string | null;
  hook: string | null;
  payoff: string | null;
}): boolean {
  return (
    (clip.clipType?.trim().length ?? 0) > 0 ||
    (clip.hook?.trim().length ?? 0) > 0 ||
    (clip.payoff?.trim().length ?? 0) > 0
  );
}
```

### `route.ts` — `normalizeClip`이 세 값을 보존

`ModalWebhookClip`(`route.ts:10-20`) 닫는 괄호 앞에 추가:

```ts
  youtubeHashtags?: string[] | null;
  clipType?: string | null;
  hook?: string | null;
  payoff?: string | null;
}
```

`RawModalWebhookClip`(`route.ts:22-39`) 닫는 괄호 앞에 추가(세 키 중 clipType만 snake 변형 방어 — `normalizeAnalyzedMoment`와 동일):

```ts
  youtubeHashtags?: string[] | null;
  youtube_hashtags?: string[] | null;
  clipType?: string | null;
  clip_type?: string | null;
  hook?: string | null;
  payoff?: string | null;
}
```

`normalizeClip` 반환(`route.ts:131-143`) 닫는 괄호 앞에 추가:

```ts
    youtubeHashtags:
      rawClip.youtubeHashtags ?? rawClip.youtube_hashtags ?? null,
    clipType: rawClip.clipType ?? rawClip.clip_type ?? null,
    hook: rawClip.hook ?? null,
    payoff: rawClip.payoff ?? null,
  };
```

### `client.ts` — 이벤트 페이로드 타입(`client.ts:4-14`) 닫는 괄호 앞에 추가

```ts
  youtubeHashtags?: string[] | null;
  clipType?: string | null;
  hook?: string | null;
  payoff?: string | null;
};
```

### `functions.ts`

`ProcessVideoBackendClip`(`functions.ts:39-49`)·`RawProcessVideoBackendClip`(`functions.ts:51-68`) 닫는 괄호 앞에 `client.ts`/`route.ts`와 동일한 세(그리고 raw엔 `clip_type` 포함) 필드 추가.

`normalizeBackendClip` 반환(`functions.ts:131-143`) 닫는 괄호 앞에 추가:

```ts
    youtubeHashtags:
      rawClip.youtubeHashtags ?? rawClip.youtube_hashtags ?? null,
    clipType: rawClip.clipType ?? rawClip.clip_type ?? null,
    hook: rawClip.hook ?? null,
    payoff: rawClip.payoff ?? null,
  };
```

`persistGeneratedClips` create 데이터(`functions.ts:212-215`, youtubeHashtags 다음) 닫는 괄호 앞에 추가:

```ts
        youtubeHashtags: clip.youtubeHashtags
          ? JSON.stringify(clip.youtubeHashtags)
          : null,
        clipType: clip.clipType ?? null,
        hook: clip.hook ?? null,
        payoff: clip.payoff ?? null,
      });
```

### `entities/clip/api/index.ts`

`ClipMetadataPatch`(`index.ts:51-59`) 닫는 괄호 앞에 `clipType?`/`hook?`/`payoff?: string | null;` 추가.

`toClipMetadataUpdateData`(`index.ts:65-76`)의 마지막 스프레드 뒤에 추가 — 기존 `!= null` 가드 규칙(존재하는 값 안 지움)을 그대로 따른다:

```ts
    ...(clip.youtubeHashtags != null
      ? { youtubeHashtags: JSON.stringify(clip.youtubeHashtags) }
      : {}),
    ...(clip.clipType != null ? { clipType: clip.clipType } : {}),
    ...(clip.hook != null ? { hook: clip.hook } : {}),
    ...(clip.payoff != null ? { payoff: clip.payoff } : {}),
  };
```

### `ClipCard.tsx` — 선택 근거 블록 렌더

`usePlayUrl` 아래 파생값 추가(`ClipCard.tsx:30` 부근):

```tsx
  const typeLabel = clipTypeLabel(clip.clipType);
  const hook = clip.hook?.trim() ?? "";
  const payoff = clip.payoff?.trim() ?? "";
  const showRationale = hasClipRationale(clip);
```

`<ClipVideoPlayer … />`(`ClipCard.tsx:81-86`)와 `<ClipActions … />` 사이에 삽입.
`showRationale`이 false면(과거 102행·백엔드가 값을 안 보낸 경우) 블록 자체가 없어 카드가 지금과 동일하다.
hook/payoff는 clamp 2줄이며 `block`을 붙이지 않는다(`ClipDraftCard.tsx:314-320` 실측 근거):

```tsx
      {showRationale && (
        <div className="flex flex-col gap-0.5">
          {typeLabel && (
            <span className="text-muted-foreground text-xs">{typeLabel}</span>
          )}
          {hook && (
            <span className="line-clamp-2 text-sm leading-snug font-semibold">
              {hook}
            </span>
          )}
          {payoff && (
            <span className="text-muted-foreground line-clamp-2 text-xs leading-snug">
              {payoff}
            </span>
          )}
        </div>
      )}
```

임포트 추가(상용구): `import { clipTypeLabel, hasClipRationale } from "~/fsd/widgets/clip-display/model/clip-rationale";`

## 테스트

- **덮는 것** (`clip-rationale.test.mjs`, `./clip-rationale.ts`를 명시 확장자로 임포트 — `selection-budget.test.mjs:7` 선례):
  - `clipTypeLabel`: `"qa"→"Q&A"`, `"insight"→"Insight"`, 모르는 값(`"story"`)→원본 그대로, `null`·`undefined`→`null`, 빈 문자열·공백(`"  "`)→`null`
  - `hasClipRationale`: 셋 다 null→`false`, hook만 있음→`true`, payoff만 있음→`true`, clipType만 있음→`true`, 셋 다 빈 문자열/공백→`false`
- **못 덮는 범위** (현재 Node 러너·DOM/외부 I/O 없음):
  - `route.ts`·`functions.ts`의 파서(`normalizeClip`/`normalizeBackendClip`) — 순수 함수로 내보내지 않고 `~/env`·`server-only`·Prisma를 끌어와 tsx 러너로 로드 불가. 기존 `normalizeClip`/`normalizeBackendClip`도 같은 이유로 테스트가 없다(현 상태 유지)
  - `persistGeneratedClips` create·`toClipMetadataUpdateData` update의 실제 DB 반영(Prisma·외부 I/O)
  - `ClipCard`의 선택 근거 블록 렌더·clamp 시각·`showRationale` 분기(React/DOM 없음) — 수동 확인.
    **다만 배포만 해서는 값이 있는 경로를 볼 수 없다.** 기존 `Clip` 102행은 세 컬럼이 전부 NULL이라
    (선행 마이그레이션이 컬럼만 추가했고 과거 행을 채우지 않는다) 화면에 보이는 모든 클립이
    `showRationale === false`로 떨어진다. 즉 배포 직후 확인되는 것은 **"카드가 지금과 동일하다"는
    회귀 없음뿐**이고, 새로 추가한 블록 자체는 한 번도 렌더되지 않는다.
    값이 있는 경로를 보려면 둘 중 하나가 필요하다 — 어느 쪽을 할지는 사용자가 정한다:
    (a) 파이프라인을 1회 실제로 돌려 새 클립을 만든다(L40S GPU 비용 + 크레딧 소모),
    (b) 기존 `Clip` 행 하나에 세 값을 임시로 넣어 확인하고 되돌린다(프로덕션 DB 쓰기).
    이 절차를 빼면 clamp가 죽거나 레이아웃이 깨져도 아무도 모른다 — `ClipDraftCard.tsx:314-320`이
    남긴 실측이 정확히 그 사고(clamp 2줄로 적혀 있었으나 화면에는 4줄)였다.
  - 백엔드→웹훅→이벤트→DB 전 구간 wire 왕복

## 범위 밖 의존

없음. 선행 스키마·마이그레이션·Prisma 클라이언트 생성은 **완료됨**(메인 루프 커밋 `544ac12`,
마이그레이션 `20260820000000_clip_selection_rationale` 프로덕션 적용, `Clip` 타입에 세 필드 존재).
이 항목은 `packages/db`를 건드리지 않는 순수 `apps/web` 작업이다.

## 대안

- **유형 라벨 매핑을 `entities/clip/model/` 또는 `shared/`로 내려 `clip-draft-review`와 공유** — 기각.
  공유하려면 `ClipDraftCard.tsx`(clip-draft-review 슬라이스)를 함께 고쳐야 하는데 이 항목의 「고칠 파일」 밖이고,
  FSD 동일 레이어 peer 임포트 금지라 위젯끼리 직접 못 쓴다. `qa/insight` 두 줄 중복은 감수하고 clip-display 슬라이스 안에 둔다.
- **순수 함수를 위젯 `model/`이 아니라 `entities/clip/model/`에 배치** — 검토함. 라벨 텍스트("Q&A"/"Insight")는
  표시(위젯) 관심사이고 clip-display에 이미 `model/`(`useMetadataClipboard.ts`)이 있어 위젯 쪽에 둔다. 둘 다 성립하나 배치만 다르다.
- **area대로 `functions.ts`만 고치고 `route.ts`·`client.ts`는 두기** — 기각. 비동기(프로덕션) 경로는 콜백이
  `route.ts`의 `normalizeClip`을 먼저 지나며 세 값을 벗기므로, `functions.ts`만 고치면 프로덕션에서 값이 여전히 null이다.
