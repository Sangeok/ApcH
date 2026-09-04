# BUG-11: 클립 검토 화면이 S3 transcript를 브라우저에서 직접 받다가 CORS로 차단되고 무한 재시도한다

agent: web-dev

## 현재 동작

- 검토 화면(`review_pending`)의 위젯 훅이 트랜스크립트를 `useQuery`로 읽는다
  (`widgets/clip-draft-review/model/use-clip-draft-review.ts:66-100`). queryFn은 두
  단계다: ① 서버 액션 `getTranscriptUrl(uploadedFileId)`로 **presign URL을 받고**
  (`:76`), ② `const response = await fetch(result.data.url);`로 **브라우저가 그 S3
  URL을 직접 GET**한다(`:81`). 응답을 `response.json()` → 배열이면
  `{start,end,word}`만 필터해 `TranscriptWord[]`로 돌려준다(`:86-98`).
- `getTranscriptUrl`은 서버 액션이다(`features/clip-review/api/index.ts:25`). 인증
  확인(`:28`) → `findUploadedFileReviewState`로 `transcriptS3Key` 조회(`:32`,
  없으면 `failure`) → `generatePresignedGetUrl(file.transcriptS3Key, …)`로 서명
  URL 생성(`:41`) → `success({ url })`(`:46`). **presign 생성 자체는 서버에서 성공
  한다.** 막히는 것은 ②의 브라우저 크로스 오리진 GET이다.
- presign은 `shared/api/s3.ts:35-45`의 `getSignedUrl(...GetObjectCommand...)`이다.
  서명만 붙일 뿐 응답의 CORS 헤더는 만들지 않는다. `GetObjectCommand`는 이 파일이
  이미 임포트한다(`s3.ts:6`).
- **재시도 정책**: 이 `useQuery`에는 `retry`가 명시돼 있지 않다(`:66-100`에 없음).
  전역 기본값도 `retry`를 덮지 않는다 — `app/providers.tsx:37-45`의
  `makeQueryClient`는 `defaultOptions.queries.staleTime: 60_000`만 설정한다. 따라서
  react-query 기본값 `retry: 3`(초기 1회 + 재시도 3회, 지수 백오프 1s·2s·4s)이
  적용된다. 트랜스크립트 쿼리는 `staleTime: Infinity`이나(`:72`),
  `refetchOnWindowFocus`는 전역 미설정이라 기본값 `true`이고, `providers.tsx:17-35`
  가 `visibilitychange`·`focus`를 focus 이벤트로 연결한다 — 에러 상태 쿼리는 포커스
  때마다 재시도 라운드가 다시 돈다. 또한 `invalidateDetail`(`:60`)이 무효화하는
  `detailKey = uploadedFileKeys.detail(id)`(`entities/uploaded-file/model/query-keys.ts:16`)
  는 트랜스크립트 키 `[...details(), id, "transcript"]`(`:18`)의 **접두사**라, 저장·
  선택 뮤테이션의 `invalidateQueries({ queryKey: detailKey })`가 트랜스크립트 쿼리도
  함께 무효화한다. 즉 한 번 마운트당 재시도는 유한(3회)이지만, 포커스·뮤테이션마다
  라운드가 재점화된다.
- **실패 안내**: 훅은 `transcriptErrorMessage`를 반환한다(`:334-338`,
  `isTranscriptError`일 때만 non-null). `AddCustomClipPanel.tsx:85-93`이 이 값이
  non-null이면 "Transcript unavailable — custom clips are disabled." 카드를 렌더한다.
  그러나 `isError`는 **재시도가 모두 소진된 뒤에야** true가 된다(재시도 중 상태는
  pending). 재시도 중에는 `transcriptWords.length === 0`이라 패널이 `null`을 렌더한다
  (`AddCustomClipPanel.tsx:96-98`). 그래서 관측된 15초 창 동안 화면에 실패 문구가
  나타나지 않는다.
- `review_pending`은 활성 상태가 아니다(`entities/uploaded-file/model/processing-status.ts:16-20`
  의 `ACTIVE_PROCESSING_STATUSES`에 없음). 따라서 상세 페이지의 7.5초 폴
  (`pages/upload-detail/model/use-live-uploaded-file-detail.ts:23-26`)은 이 화면에서
  돌지 않는다 — 재시도 반복의 원천은 폴이 아니라 위 react-query retry + 포커스/무효화
  재점화다.
- **이력**: 브라우저의 presign 직접 GET 패턴은 검토 기능 최초 커밋
  `8ab82e5`부터 존재한다(당시 경로
  `ai-podcast-clipper-frontend/src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts:60`
  에 `const response = await fetch(result.data.url);`). 이후 리팩터(`6af3eb2` 워크스페이스
  이동, `3744025`·`8789f26` 등)가 도입한 회귀가 아니다.

## 문제

백로그(`BUG-11` source)가 지목한 것: 검토 화면이 S3 transcript를 **브라우저에서
직접** 받다가 `a-pch.com` 오리진에 대한 CORS 허용이 없어 GET이 전부 차단되고
(`net::ERR_FAILED`), 실패 안내 없이 재시도가 반복된다. 코드에서 확인한 원인은 둘로
갈린다:

1. **CORS 차단** — `fetch(result.data.url)`(`use-clip-draft-review.ts:81`)는 브라우저가
   S3 오리진으로 보내는 크로스 오리진 요청이다. presign은 서명만 하고 CORS 응답
   헤더를 만들지 않으므로, 버킷에 오리진 허용 규칙이 없으면 항상 막힌다. 규칙 존재
   여부는 저장소 밖(AWS 설정)이라 코드로는 확인할 수 없다.
2. **실패가 화면에 늦게·거의 안 뜬다** — 실패 문구(`AddCustomClipPanel.tsx:88-91`)는
   재시도 소진 후에만 나타나고, 재시도는 포커스·뮤테이션마다 재점화되므로 사용자
   입장에서는 "끝없이 재시도하는데 아무 안내가 없는" 화면이 된다.

**백로그와 코드가 어긋난 지점**: 백로그는 "무한 재시도"라 적었으나, 코드 기본값은
`retry: 3`(유한)이다. 관측이 무한처럼 보인 것은 (a) 지수 백오프 + 서버 액션 왕복
지연으로 4번의 시도가 ~15초에 퍼지고, (b) 포커스/무효화가 라운드를 재점화하며,
(c) 소진 전에는 안내가 없기 때문이다. 따라서 실제로 고칠 것은 "무한 루프"가 아니라
**재시도 상한을 명시하고 실패를 즉시 드러내는 것** + **CORS를 근본에서 없애는 것**이다.

## 고칠 파일

방향 선택: **(b) 서버 라우트가 transcript를 대신 받아 넘긴다.** 근거는 「대안」 절.
이 방향은 전부 `apps/web` 안에서 끝나며 범위 밖 의존이 없다.

| 파일 | 변경 |
| --- | --- |
| `src/fsd/shared/api/s3.ts` | S3 객체 본문을 서버에서 문자열로 읽는 `getS3ObjectText(key)` 헬퍼 추가(`GetObjectCommand` + `Body.transformToString()`) |
| `src/fsd/features/clip-review/model/transcript.ts` `(신규)` | `TranscriptWord` 타입 + `parseTranscriptWords(payload: unknown): TranscriptWord[]` 순수 함수를 feature 레이어에 둔다(서버 액션과 위젯이 공유) |
| `src/fsd/features/clip-review/model/transcript.test.mjs` `(신규)` | `parseTranscriptWords` 분기 테스트 |
| `src/fsd/features/clip-review/api/index.ts` | `getTranscriptUrl`(presign+URL 반환)을 `getTranscript`(서버에서 S3 읽어 파싱한 `{ words }` 반환)로 교체 |
| `src/fsd/features/clip-review/index.ts` | 배럴 재수출을 `getTranscriptUrl` → `getTranscript`로 교체 **+ `export type { TranscriptWord } from "./model/transcript";` 추가**(아래 검증 라운드 결함 ① — 없으면 위젯의 재수출이 TS2305로 깨진다) |
| `src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts` | queryFn을 `getTranscript` 호출 + `parseTranscriptWords` 결과 직접 사용으로 교체(브라우저 `fetch` 제거), `retry`·`refetchOnWindowFocus` 명시. `TranscriptWord`는 feature에서 재수출 |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다. `AddCustomClipPanel.tsx`·
`ClipDraftCard.tsx`는 `TranscriptWord`를 `../../model/use-clip-draft-review`에서
임포트하므로, 위젯 훅이 그 타입을 계속 재수출하면 수정이 필요 없다(재수출 상용구는
스케치에 적지 않는다).

## 구현 스케치

**`shared/api/s3.ts` — 서버 측 객체 읽기 헬퍼 추가** (`GetObjectCommand`는 `:6`에서
이미 임포트됨)

```ts
export async function getS3ObjectText(key: string): Promise<string> {
  const response = await getS3Client().send(
    new GetObjectCommand({ Bucket: env.S3_BUCKET_NAME, Key: key }),
  );
  if (!response.Body) {
    throw new Error(`S3 object has no body: ${key}`);
  }
  // AWS SDK v3 Node 스트림. 트랜스크립트는 1회/세션 읽고 캐시되므로 전량 문자열화 허용.
  return response.Body.transformToString();
}
```

**`features/clip-review/model/transcript.ts` (신규) — 타입 + 파서**

```ts
export interface TranscriptWord {
  start: number;
  end: number;
  word: string;
}

// 백엔드 transcribe_video가 저장한 단어 단위 JSON을 검증·필터한다. 배열이 아니면
// 던진다(빈 배열로 접으면 실패가 "단어 스냅이 조용히 꺼진 화면"으로만 나타난다).
export function parseTranscriptWords(payload: unknown): TranscriptWord[] {
  if (!Array.isArray(payload)) {
    throw new Error("Transcript payload was not an array");
  }
  return payload.filter(
    (word): word is TranscriptWord =>
      typeof word === "object" &&
      word !== null &&
      typeof (word as TranscriptWord).start === "number" &&
      typeof (word as TranscriptWord).end === "number" &&
      typeof (word as TranscriptWord).word === "string",
  );
}
```

**`features/clip-review/api/index.ts` — `getTranscriptUrl`(`:25-51`) 교체**

현재(`:25-51`, 요지): `getTranscriptUrl`가 presign URL을 만들어 `success({ url })`.
교체 후:

```ts
import { getS3ObjectText } from "~/fsd/shared/api/s3";
import {
  type TranscriptWord,
  parseTranscriptWords,
} from "../model/transcript";

// 검토 UI가 단어 경계 스냅·미리보기에 쓰는 단어 단위 전사를 서버에서 읽어 넘긴다.
// 브라우저가 S3를 직접 GET하지 않으므로 크로스 오리진(CORS)이 없고 presign URL도
// 노출되지 않는다.
export async function getTranscript(
  uploadedFileId: string,
): Promise<ActionResult<{ words: TranscriptWord[] }>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  try {
    const file = await findUploadedFileReviewState(
      uploadedFileId,
      authResult.data.userId,
    );

    if (!file?.transcriptS3Key) {
      return failure("Transcript is not available for this upload");
    }

    const raw = await getS3ObjectText(file.transcriptS3Key);
    return success({ words: parseTranscriptWords(JSON.parse(raw)) });
  } catch (error) {
    console.error("Failed to load transcript", error);
    return failure("Failed to load transcript");
  }
}
```

`generatePresignedGetUrl`·`S3_CONFIG` 임포트(`:10`)는 **제거한다** — 검증 라운드에서
이 파일 전체를 열거해 두 심볼의 사용처가 `getTranscriptUrl` 내부(`:41`·`:43`)뿐임을
확인했다(결함 ②). 조건부가 아니다.

**`use-clip-draft-review.ts` — queryFn 교체 + 재시도 옵션** (현재 `:66-100`)

before(`:66-100`, 요지): `queryFn`이 `getTranscriptUrl` → `fetch(result.data.url)` →
`response.json()` → 인라인 필터. `retry`·`refetchOnWindowFocus` 미설정.

after(옵션 부분만; 필터 로직은 서버로 이동했으므로 queryFn이 짧아진다):

```ts
  const {
    data: transcriptWords = [],
    isError: isTranscriptError,
    error: transcriptError,
  } = useQuery<TranscriptWord[]>({
    queryKey: uploadedFileKeys.transcript(uploadedFileId),
    staleTime: Infinity,
    // 실패한 전사는 같은 결과로 반복되기 쉽다(키 부재·권한). 소량 재시도 후
    // 즉시 에러 상태로 보내 안내를 띄운다. 포커스 재점화는 끈다 — 브로큰
    // 리소스를 focus마다 다시 때리면 콘솔만 오염된다.
    retry: 2,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const result = await getTranscript(uploadedFileId);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data.words;
    },
  });
```

배럴 값 임포트 블록(`:10-15`)에서 `getTranscriptUrl`을 `getTranscript`로 바꾸고,
**같은 블록에 `type TranscriptWord`를 함께 들인 뒤** 별도 줄로 재수출한다:

```ts
import {
  addCustomClipDraft,
  getTranscript,
  saveClipDraftEdit,
  type CaptionStyleInput,
  type TranscriptWord,
} from "~/fsd/features/clip-review";

export type { TranscriptWord };
```

`export interface TranscriptWord {...}`(`:27-31`)는 삭제한다.

**순수 재수출 한 줄(`export type { TranscriptWord } from "~/fsd/features/clip-review";`)로
바꾸면 안 된다** — 재수출은 **로컬 바인딩을 만들지 않아** 같은 파일에 남는
`useQuery<TranscriptWord[]>`(`:70`)가 깨진다. 실측:
`error TS2304: Cannot find name 'TranscriptWord'` / `EXIT=2`. 위 교정형(로컬 임포트 +
재수출)은 같은 컴파일 플래그에서 `EXIT=0`이다(검증 라운드 결함 ⑧). 반환부의
`transcriptErrorMessage`(`:334-338`)는 그대로 둔다.

**사용자에게 보이는 문구**: 실패 시 노출되는 문구는 기존
`AddCustomClipPanel.tsx:88-91`의 "Transcript unavailable — custom clips are disabled."
를 그대로 쓴다(앱의 실제 문구). 재시도 상한을 낮춰 이 문구가 몇 초 안에 뜨게 하는
것이 이번 변경의 사용자 가시 효과다. 새 배너는 추가하지 않는다(범위 최소화).

## 테스트

- **덮는 것**: `features/clip-review/model/transcript.test.mjs`로 `parseTranscriptWords`
  분기 — ① 유효 배열은 그대로, ② `start/end/word` 타입이 틀린 원소·`null`·비객체는
  필터, ③ 배열이 아니면(`{}`·`null`·문자열) **`"Transcript payload was not an array"` 메시지로**
  throw. **메시지까지 단언한다** — "throw 여부"만 보면 배열 가드를 지운 구현도 통과한다
  (`payload.filter is not a function` TypeError도 throw이기 때문. 결함 ③의 실측 근거).
  이 함수는 순수하고 Node 내장 러너로 확인 가능하다.
- **못 덮는 범위**(배포 후 수동 확인으로 이관):
  - 서버 액션 `getTranscript`의 실제 S3 읽기(`getS3ObjectText`)와 인증/소유권 경로 —
    DB·S3 I/O라 러너로 못 덮는다.
  - 브라우저에서 CORS가 사라졌는지(동일 오리진 서버 액션 호출로 바뀌었으므로 콘솔
    CORS·`net::ERR_FAILED` 소멸) — **배포 후 프로덕션에서** `Review Needed` 업로드를
    열어 콘솔로 확인해야 한다.
  - 재시도 상한(`retry: 2`)과 실패 시 "Transcript unavailable …" 문구가 몇 초 안에
    뜨는지 — react-query 브라우저 동작이라 러너로 못 덮는다.
  - 전사 payload 크기가 큰 업로드에서 Vercel 함수 응답 한도(4.5MB) 안인지 — 실측
    필요(파이프라인이 같은 파일을 서버에서 이미 읽으므로 관리 가능하다고 판단하나
    실물 확인 대상).

## 범위 밖 의존

없음. 방향 (b)는 새 서버 액션·S3 헬퍼·위젯 훅 수정 모두 `apps/web` 안이다.
`packages/db`·다른 워크스페이스·AWS 콘솔 설정에 닿지 않는다. (방향 (a)를 골랐다면
S3 버킷 CORS 설정이 범위 밖 의존이 됐을 것이다 — 「대안」 참조.)

## 대안

- **(a) S3 버킷에 CORS 규칙 추가** — 브라우저 직접 GET을 유지하되 버킷이
  `https://a-pch.com` 오리진에 `Access-Control-Allow-Origin`을 내주게 한다. 트레이드
  오프:
  - 장점: 코드 변경이 거의 없다(재시도 상한 + 문구만). presign이 원래 노리는 "S3→
    브라우저 직접 전송"이라 Vercel 함수 대역폭을 안 쓴다.
  - 단점: **버킷 설정은 저장소 밖(AWS 콘솔/IaC)이라 담당 범위 밖 의존이 된다.** 이
    저장소에는 S3 IaC가 없어 버전 관리되지 않고, 버킷 재생성·마이그레이션 시 조용히
    회귀한다(소유자가 매번 기억해야 함). presign URL도 계속 브라우저에 노출된다.
    구현 단계에서 이 지점에 닿으면 `보류`가 된다.
  - 채택하지 않은 이유: 1인 운영에서 "코드 밖 설정을 기억해야 유지되는 수정"은
    보이지 않는 운영 의존을 남긴다. (b)는 같은 결함을 코드 안에서 닫고(버전 관리),
    CORS 부류를 근본에서 없애며, presign 노출도 제거한다. 전사는 세션당 1회 읽고
    캐시(`staleTime: Infinity`)되며, 백엔드 파이프라인이 이미 같은
    `transcript.json`을 서버에서 읽으므로(render 모드) payload 크기는 관리 가능하다.
- **재시도만 고치고 CORS는 방치** — 상한을 둬도 화면은 여전히 전사를 못 읽어
  단어 스냅·커스텀 클립이 죽는다. 백로그가 지목한 "대본 미로드"를 안 고친다.
- **클라이언트 마운트 후에만 렌더(에러 무시)** — 해당 없음. 문제는 렌더 타이밍이
  아니라 크로스 오리진 접근이다.

## 검증 라운드 기록 (메인 루프, 2026-09-04 1라운드)

`docs/plans/verification-paths.md`의 필수 경로 1·2·3·4·5·6·7·8을 돌렸다. 결함 셋을 위
본문에 반영했다. 증거는 `docs/agents/main-loop/BUG-11.md`.

**결함 ① (블로커) — 배럴에 타입 재수출이 빠져 스케치가 컴파일되지 않는다.**
스케치는 위젯 훅에 `export type { TranscriptWord } from "~/fsd/features/clip-review";`
를 지시하지만, 「고칠 파일」의 배럴 행은 액션 이름 교체만 적었다. 현재 배럴
(`features/clip-review/index.ts`)은 `addCustomClipDraft`·`getTranscriptUrl`·
`saveClipDraftEdit`·`captionStyleSchema`·`CaptionStyleInput`만 내보낸다. 그 재수출 줄을
그대로 파일에 넣고 프로젝트 tsconfig로 컴파일하니
`error TS2305: Module '"~/fsd/features/clip-review"' has no exported member 'TranscriptWord'`.
→ 배럴 행에 타입 재수출을 명시했다.

**결함 ② (정밀도) — 임포트 제거가 조건부로 남아 있었다.**
`generatePresignedGetUrl`·`S3_CONFIG`의 이 파일 내 사용처를 전수 열거하니 `:41`·`:43`
(둘 다 `getTranscriptUrl` 내부)뿐이다. 교체 후 두 심볼은 반드시 미사용이 되므로
"다른 액션이 쓰면 유지"라는 조건은 성립하지 않는다. → 확정 서술로 바꾸고 스케치의
import 줄에서 `S3_CONFIG`를 뺐다.

**결함 ③ (블로커) — 테스트 명세 ③이 돌연변이를 못 잡는다.**
명세대로 테스트를 짜고 구현에 오류를 심어 사멸을 확인했다. `w !== null` 제거·`start`
타입검사 완화·필터 제거는 전부 사멸했으나, **배열 가드 제거는 생존**했다 — 가드가 없어도
비배열 입력은 `payload.filter is not a function`(TypeError)으로 throw하므로 "throw 여부"만
보는 명세는 통과한다. → 명세 ③을 에러 메시지 단언으로 강화했다.

**통과한 것**: 인용 전수 대조(경로 1) — 본문이 인용한 `파일:줄` 전부를 다시 읽어 내용까지
일치 확인(`use-clip-draft-review.ts:66-100`의 `retry` 부재, `providers.tsx:37-45`가
`staleTime`만 설정, `query-keys.ts`의 detail↔transcript 접두사 관계,
`processing-status.ts:16-20`에 `review_pending` 없음, `AddCustomClipPanel.tsx:85-93`의
실패 카드 문구, `s3.ts:6`의 `GetObjectCommand` 기존 임포트 포함). 스케치 추출·실행(경로 2)
— `getS3ObjectText`·`parseTranscriptWords`·`getTranscript` 셋을 실제 `src/` 아래에 놓고
`npx tsc --noEmit` 통과(특히 `response.Body.transformToString()`이 타입 검사를 통과),
`npx eslint` 0건. 그 lint가 장식이 아님을 음성 시험(경로 7)으로 확인 — 같은 디렉터리에
`JSON.parse` 결과를 그대로 쓰는 파일을 넣으니 `no-unsafe-assignment`·`no-unsafe-return`·
`no-unsafe-member-access` 3건으로 종료코드 1. 전칭 여집합(경로 4) — `TranscriptWord`
소비처를 전수 열거해 `AddCustomClipPanel.tsx`·`ClipDraftCard.tsx` 둘 다 상대경로
`../../model/use-clip-draft-review`로 임포트함을 확인(훅이 재수출을 유지하면 수정 불요라는
본문 주장이 성립).

**인가 경계(INV-4)**: 교체 후에도 `requireAuth()` → `findUploadedFileReviewState(id, userId)`
테넌트 스코프가 유지된다. 브라우저에 presign URL이 더는 노출되지 않으므로 접근 표면은
줄어든다. 상태 변경이 없는 읽기 경로라 멱등성·동시성 항목은 해당 없음.

## 검증 라운드 5 (2026-09-04, plan-verifier 독립 패스 반영)

`plan-verifier`가 처음 보는 컨텍스트에서 필수 경로 여덟을 전부 돌려 **블로커 1건**을
보고했다. 재현해 본문에 반영했다.

**결함 ⑧ (블로커) — 결함 ①의 수정이 절반만 맞았다.**
1라운드는 재수출의 **원천**(배럴)만 격리 검사해 TS2305를 잡고 배럴 행을 고쳤다. 그러나
위젯이 그 타입을 **로컬로 계속 소비한다**(`useQuery<TranscriptWord[]>`)는 상호작용을 함께
컴파일하지 않았다. `export type { X } from "…"`는 재수출일 뿐 로컬 바인딩을 만들지 않으므로,
계획서 지시대로 구현하면 `error TS2304: Cannot find name 'TranscriptWord'`로 `npm run check`
의 tsc 게이트가 깨진다 — 계획서 자신이 못 박은 성공 기준을 못 넘는다. **실측 재현**:
지시형 `EXIT=2`(TS2304), 교정형(`import type` + `export type { … }`) `EXIT=0`.
→ 스케치를 배럴 값 임포트 블록에 `type TranscriptWord`를 합치고 별도 줄로 재수출하는
형태로 다시 썼고, 순수 재수출이 왜 안 되는지 실측 근거와 함께 남겼다.

**독립 패스가 통과시킨 것**: 인용 전수 대조(부수 확인으로 `ACTIVE_UPLOAD_POLLING_INTERVAL_MS
= 7_500`까지 대조해 "7.5초 폴" 정확 확인, 오기 0건). 스케치 추출·실행 — 스크래치패드에
tsconfig를 복제해 **실제 `@aws-sdk/client-s3 ^3.928.0`**에 물려 `transformToString()` 타입
통과(EXIT 0), 재구성 `api/index.ts`도 실제 크로스슬라이스 모듈에 물려 EXIT 0, 타입인지
eslint 0건(특히 `parseTranscriptWords(JSON.parse(raw))`가 `no-unsafe-argument`를 내지
않음 — 파라미터가 `unknown`이라 안전). 음성 시험 — 같은 eslint 하니스에 `JSON.parse`
직사용 파일을 넣으니 `no-unsafe-*` 4건 EXIT 1(검출력 확인). 전칭 여집합 — `getTranscriptUrl`
사용처 3곳(정의·배럴·위젯) 전부 교체 대상에 포함(고아 소비자 0), `S3_CONFIG`·
`generatePresignedGetUrl` 사용처 `:41`·`:43`뿐(결함 ② 정확), `TranscriptWord` 외부 소비처
정확히 둘. 돌연변이 검사 — 강화 명세(메시지 단언)에서 돌연변이 4개 **전부 사멸**,
throw-only로 되돌리면 배열 가드 제거가 **생존**(결함 ③의 근거를 독립 재현).

**경로 6 판정 갱신**: 1라운드는 "실측 payload를 못 얻어 미검증"으로 남겼는데, 독립 패스가
**생산자 계약을 직접 추적**해 대체 실행했다 — `apps/backend/main.py:923·932·934`가
`{"start":float,"end":float,"word":str}` 배열을 만들고 `:1064·1068-1076`이 그것을
`transcript.json`에 **맨 배열**로 올린다. 그 계약대로 재구성한 배열(유니코드 포함)을
컴파일된 파서에 통과시켜 7/7 유지·유니코드 보존 확인. 진짜 캡처 파일 재생은 여전히
불가하지만(데이터가 S3에 있음), **모양 불일치 위험은 생산자 계약 확인으로 닫혔다** —
래퍼 객체가 아니라 맨 배열이라 파서가 실데이터에 throw하지 않는다.

**결과**: 편집 라운드. 다음은 무편집 패스 + 새 독립 패스.

