# BUG-11 — 메인 루프 기록

## 검증 라운드 1 (2026-09-04, 메인 루프 편집 라운드)

### 필수 경로 확정

`docs/plans/verification-paths.md`의 트리거로 고른 목록. 이 목록은 `plan-verifier`
독립 패스 브리핑에도 그대로 쓴다.

| 항목 | 필수 경로 | 트리거 근거 |
| --- | --- | --- |
| BUG-11 | 1,2,3,4,5,6,7,8 | 1=전 항목 · 2=스케치에 코드 3블록 · 3=기존 파일 4개 수정 · 4="전역 기본값도 retry를 덮지 않는다"·"여기 적히지 않은 파일은 고치지 않는다" 전칭 · 5=순수함수 `parseTranscriptWords` 신설 · 6=외부 신호(S3 transcript JSON) 해석 · 7=파서 가드·재시도 상한이라는 불변식 신설 · 8=실패 문구 노출 타이밍이 바뀌는 화면 변경 |
| BUG-10 | 1,2,3,4,5,7,8 | 1=전 항목 · 2=포매터 스케치 · 3=기존 파일 7개 수정 · 4="다섯 호출부"·"전부 use client" 전칭 · 5=순수함수 `formatDate`/`formatDateTime` 신설 · 7=골든 테스트가 회귀를 잡는다는 주장 · 8=표시 문구가 바뀌는 화면 변경. 6은 제외 — 외부 신호 해석이 없다 |

### 실행한 경로와 증거 (BUG-11)

**경로 1 인용 전수 대조** — 본문의 `파일:줄` 인용을 전부 다시 읽어 내용까지 대조.
`use-clip-draft-review.ts:66-100`(queryFn 2단계·`retry` 부재 확인), `:27-31`
(`TranscriptWord` 정의), `:332-340`(`transcriptErrorMessage` 반환),
`features/clip-review/api/index.ts:1`(`"use server"`)·`:10`(presign·S3_CONFIG 임포트)·
`:25-51`(`getTranscriptUrl` 본문), `shared/api/s3.ts:1`(`server-only`)·`:6`
(`GetObjectCommand` 기존 임포트)·`:35-45`(`generatePresignedGetUrl`),
`app/providers.tsx:17-35`(focus 리스너)·`:37-45`(`staleTime`만 설정),
`entities/uploaded-file/model/query-keys.ts:14-20`(detail이 transcript의 접두사),
`processing-status.ts:16-20`(`review_pending` 부재),
`use-live-uploaded-file-detail.ts:23-26`(폴 조건),
`AddCustomClipPanel.tsx:84-98`(실패 카드 문구와 빈 배열 null 렌더). **전부 일치.**

**경로 2 스케치 추출·실행** — 스케치 코드 블록 3개를 바이트 그대로 `apps/web/src/__verify/`
에 놓고 프로젝트 실제 설정으로 돌렸다. `npx tsc --noEmit` **EXIT 0** — 특히
`response.Body.transformToString()`이 AWS SDK 타입에서 해석되고, `JSON.parse(raw)`(any)를
`parseTranscriptWords(payload: unknown)`에 넘기는 것도 통과. `npx eslint src/__verify`
**0건**.

**경로 7 음성 시험** — 위 lint 0건이 "규칙이 안 돈 것"이 아님을 확인. 같은 디렉터리에
`JSON.parse` 결과를 그대로 반환하는 파일을 넣으니 `no-unsafe-assignment`·
`no-unsafe-return`·`no-unsafe-member-access` 3건, 종료코드 1. 규칙은 실제로 돈다.
같은 방식으로 **결함 ①을 확정**했다 — 스케치가 지시한 재수출 줄을 그대로 컴파일하니
`error TS2305: Module '"~/fsd/features/clip-review"' has no exported member 'TranscriptWord'`.

**경로 4 전칭 여집합** — ⓐ `TranscriptWord` 소비처 전수: `AddCustomClipPanel.tsx:12`·
`ClipDraftCard.tsx:18` 둘 다 `../../model/use-clip-draft-review` 상대 임포트 →
"훅이 재수출을 유지하면 수정 불요"라는 본문 주장 성립. ⓑ `generatePresignedGetUrl`·
`S3_CONFIG`의 파일 내 사용처 전수: `:41`·`:43`뿐 → **결함 ②**(제거가 조건부가 아님).

**경로 5 돌연변이 검사** — 명세 ①②③을 실행 가능한 테스트로 옮기고 구현에 오류를 넷 심었다.
`w !== null` 제거 → 사멸(② TypeError), `start` 타입검사 완화 → 사멸(② 필터 수),
필터 전체 제거 → 사멸(② 필터 수), **배열 가드 제거 → 생존**. 가드가 없어도 비배열은
`payload.filter is not a function`으로 throw하므로 "throw 여부"만 보는 명세 ③은 통과한다.
**결함 ③**.

**경로 3 before/after** — 스케치가 엄밀한 before/after диff 형식이 아니라 "요지 + 교체 후"
형식이다. 인용된 before 범위(`:25-51`, `:66-100`)가 현재 트리와 일치함을 경로 1에서
확인했고, 교체 후 블록은 경로 2에서 컴파일·lint를 통과했다. 기계 적용 가능성 확인은
구현 단계의 diff에서 다시 본다.

**경로 6 실제 사건 재생** — 프로덕션 관측(2026-09-04 스윕)의 실제 실패 신호를 모델에
통과시켰다. 관측된 것은 CORS 차단 + `net::ERR_FAILED`이고, 계획서 모델은 그 경로를
서버 액션으로 대체해 실패 자체를 없앤다. 실제 transcript.json 본문은 CORS로 못 받아
파서에 재생할 실측 payload를 얻지 못했다 — **이 부분은 미검증으로 남긴다**(구현 후
서버에서 처음으로 실물 payload를 읽게 된다).

**경로 8 실물 렌더** — 이번 변경은 마크업을 바꾸지 않는다(기존 실패 카드 문구 재사용).
프로덕션 스냅샷에서 그 카드가 현재 렌더되지 않음(재시도 중 `null` 렌더)을 확인한 것이
현재 동작 근거다. 렌더 구조 변경이 없어 별도 하니스는 만들지 않았다.

### 결과

편집 라운드였다(계획서 수정 있음). 결함 3건을 본문에 반영: ① 배럴 타입 재수출 누락
(블로커), ② 임포트 제거가 조건부로 남음(정밀도), ③ 테스트 명세 ③이 돌연변이를 못 잡음
(블로커). **무소득 라운드가 아니므로 `plan-verifier` 디스패치 자격이 아직 없다** —
다음은 메인 루프의 무편집 패스다.
