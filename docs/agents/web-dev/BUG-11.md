# BUG-11 구현 보고 (web-dev)

## 2026-09-04 — 구현 (구현승인 → 완료)

계획서 `docs/plans/BUG-11.md`대로 구현했다. 브라우저가 S3 transcript를 직접 GET하던
경로(CORS 차단·무한 재시도 원인)를, 서버 액션이 S3에서 읽어 파싱한 `{ words }`를
넘기는 동일 오리진 경로로 바꿨다.

### 시작 전 대조 (계획서 「현재 동작」 ↔ 코드)

- `features/clip-review/api/index.ts:10`이 `generatePresignedGetUrl, S3_CONFIG`를
  임포트, `getTranscriptUrl`(:25-51)이 `:41·:43`에서만 사용 — 일치.
- 배럴(`features/clip-review/index.ts`)이 `addCustomClipDraft·getTranscriptUrl·
  saveClipDraftEdit·captionStyleSchema·CaptionStyleInput`만 수출 — 일치.
- `shared/api/s3.ts:6`이 `GetObjectCommand` 기존 임포트 — 일치.
- `use-clip-draft-review.ts` 배럴 값 임포트 블록에 `getTranscriptUrl`, 로컬
  `interface TranscriptWord`(:27-31), `useQuery<TranscriptWord[]>`(:70), queryFn이
  `getTranscriptUrl → fetch(url) → response.json() → 인라인 필터`, `retry` 미설정 — 일치.

### 고친 파일 (전수)

수정 4 / 신규 2.

- `apps/web/src/fsd/shared/api/s3.ts` — `getS3ObjectText(key)` 추가(`GetObjectCommand`
  + `Body` 널 가드 + `transformToString()`). 기존 export(`generatePresignedGetUrl`·
  `S3_CONFIG` 등)는 `features/clip`·`features/upload`가 쓰므로 그대로 둠.
- `apps/web/src/fsd/features/clip-review/model/transcript.ts` `(신규)` — `TranscriptWord`
  타입 + `parseTranscriptWords(payload: unknown): TranscriptWord[]` 순수 함수(배열
  가드는 메시지 `"Transcript payload was not an array"`로 throw).
- `apps/web/src/fsd/features/clip-review/model/transcript.test.mjs` `(신규)` — 3 케이스.
- `apps/web/src/fsd/features/clip-review/api/index.ts` — s3 임포트를 `getS3ObjectText`로
  교체, `import { type TranscriptWord, parseTranscriptWords } from "../model/transcript";`
  추가, `getTranscriptUrl`을 `getTranscript`(서버에서 S3 읽어 `{ words }` 반환)로 교체.
  `generatePresignedGetUrl`·`S3_CONFIG` 임포트는 제거(이 파일 내 사용처가 교체 대상뿐).
- `apps/web/src/fsd/features/clip-review/index.ts` — 배럴에서 `getTranscriptUrl` →
  `getTranscript`, `export type { TranscriptWord } from "./model/transcript";` 추가.
- `apps/web/src/fsd/widgets/clip-draft-review/model/use-clip-draft-review.ts` — 배럴 값
  임포트 블록에 `getTranscript` + `type TranscriptWord`를 합치고 별도 줄
  `export type { TranscriptWord };`로 재수출, 로컬 `interface TranscriptWord` 삭제,
  queryFn을 `getTranscript` 호출 + `result.data.words` 직접 사용으로 교체(브라우저
  `fetch` 제거), `retry: 2`·`refetchOnWindowFocus: false` 명시.

### 스케치 대비 차이

없음. 분기 순서·조건·리터럴 값(`retry: 2`, 에러 메시지, 문구)·사용자 가시 문구
(`AddCustomClipPanel.tsx`의 "Transcript unavailable …"는 미변경) 전부 스케치와 동일.

계획서 「검증 라운드 기록」의 함정 셋을 그대로 회피:
- 결함 ①⑧: 위젯의 `TranscriptWord`를 순수 재수출(`export type { X } from …`)이 아니라
  배럴 값 임포트 블록에 `type TranscriptWord`를 합쳐 로컬 바인딩을 만든 뒤 별도 줄로
  재수출. `useQuery<TranscriptWord[]>`가 로컬 심볼을 계속 참조하므로 TS2304 회피.
- 결함 ②: `generatePresignedGetUrl`·`S3_CONFIG` 임포트를 조건부가 아니라 확정 제거.
- 결함 ③: 테스트 명세 ③이 에러 메시지까지 단언(throw 여부만 보면 배열 가드 제거가
  `payload.filter is not a function` TypeError로 생존).

### 검증

- `npm run check -w apps/web` → EXIT 0 (next lint 경고/에러 0, tsc --noEmit 통과).
- `npm test -w apps/web` → 70 → 73 pass / 0 fail(신규 `transcript.test.mjs` 3 케이스).

### 테스트로 못 덮은 범위 (배포 후 수동 확인)

- 서버 액션 `getTranscript`의 실제 S3 읽기(`getS3ObjectText`)와 인증/소유권 경로 —
  DB·S3 I/O라 Node 내장 러너로 못 덮는다.
- 브라우저에서 CORS/`net::ERR_FAILED`가 사라졌는지 — 배포 후 프로덕션에서
  `Review Needed` 업로드를 열어 콘솔로 확인해야 한다.
- 재시도 상한(`retry: 2`)과 실패 시 "Transcript unavailable — custom clips are
  disabled." 문구가 몇 초 안에 뜨는지 — react-query 브라우저 동작이라 러너로 못 덮는다.
- 큰 전사 payload에서 Vercel 함수 응답 한도(4.5MB) 안인지 — 실측 필요.

### 비고

- 새 테스트 파일 `features/clip-review/model/transcript.test.mjs`는 `apps/web/CLAUDE.md`
  테스트 목록 표에 행이 필요할 수 있다. 그 파일은 web-dev 쓰기 범위 밖(읽기 전용)이라
  고치지 않았다 — 메인 루프가 처리할 사항.
