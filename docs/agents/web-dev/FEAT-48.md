# FEAT-48 — 검토 카드에 참고 번역을 저장·표시

## 2026-09-16 구현 (web-dev, 구현승인 → 완료)

계획서 `docs/plans/FEAT-48.md`의 「고칠 파일」·「구현 스케치」대로 구현했다. B-3에서
계획서 「현재 동작」이 코드와 일치함을 확인(modal-contract.ts:59-78/193-201, functions.ts:929-940,
ClipDraftCard.tsx:1-25/114-140/474-489, AnalyzedMomentPayload=functions.ts:681, 생성 클라이언트의
`ClipDraft.referenceTranslation: string | null`·`ClipDraftCreateManyInput.referenceTranslation?`
FEAT-47 재생성분 존재 확인).

### 고친 파일 (수정 4 / 신규 3 — 계획 「고칠 파일」과 정확히 일치)

수정:
- `apps/web/src/inngest/modal-contract.ts`
  - `AnalyzedMoment`에 `referenceTranslation?: string | null` (요구 ① 곳 1)
  - `RawAnalyzedMoment`에 `referenceTranslation?: string | null` (요구 ① 곳 2, snake 변형 없음)
  - `normalizeAnalyzedMoment` 반환에 `referenceTranslation: toNullableString(raw.referenceTranslation)` (요구 ① 곳 3)
- `apps/web/src/inngest/functions.ts`
  - `createClipDraftsBulk` 인자 매핑에 `referenceTranslation: moment.referenceTranslation ?? null` (요구 ① 곳 4)
- `apps/web/src/fsd/widgets/clip-draft-review/ui/_component/ClipDraftCard.tsx`
  - `resolveReferenceTranslationDisplay` 임포트 추가
  - 파생값 `referenceTranslationDisplay` 계산(현재 구간 state·AI 구간 전달)
  - 원문 블록(`{previewText && ...}`) 바로 아래 형제로 번역 블록 렌더(요구 ②·④)

신규:
- `apps/web/src/fsd/widgets/clip-draft-review/model/reference-translation.ts` — 표시 판정 순수 함수
- `apps/web/src/fsd/widgets/clip-draft-review/model/reference-translation.test.mjs` — 9 tests
- `apps/web/src/inngest/modal-contract.test.mjs` — 5 tests

### 스케치 대비 차이

분기 순서·조건·리터럴 값·사용자 문구 모두 스케치 그대로. `reference-translation.ts`의 본문(허용오차
`0.05`, `Math.abs` 양단, `FRESH_LABEL`/`STALE_LABEL` 골든), `ClipDraftCard.tsx`의 마크업 클래스와
독립 조건, `modal-contract.ts`/`functions.ts` 한 줄들은 스케치와 바이트 동일.

테스트 파일 내용은 계획 「테스트」 절의 "덮는 것"을 그대로 구현한 것으로, 스케치에 코드 전문이 없던
부분이다(계획이 케이스 목록으로만 지정). 케이스는 계획 목록과 1:1:
- reference-translation: null/undefined, 빈/공백, trim 골든, current==AI(FRESH 골든), start diff>0.05,
  end diff>0.05, 양단 drift, 음의 차이(Math.abs 가드) 2케이스(9.8/39.8), 경계 0.04→FRESH·0.1→STALE.
  골든 라벨은 review-language-notice.test.mjs 선례대로 테스트에 하드코딩(사용자 문구 계약 보호).
  허용오차 정확값(==0.05)은 계획대로 테스트하지 않음(등가 변이).
- modal-contract: referenceTranslation 복사, 키 부재→null, 비문자열→null, 유효 moment 전체 정규화
  회귀, 필수 수치 필드 누락→null.

### 검증 (직접 실행, 실제 출력 확인)

- `npm run check -w apps/web` → EXIT 0 (verify:fsd:test 11/11, verify:fsd PASS, next lint 0, tsc --noEmit 0)
- `npm test -w apps/web` → EXIT 0, tests 176 / pass 176 / fail 0 (162→176, +14; suites 37→41, +4)

### 테스트로 못 덮는 범위 (러너 밖 — DOM·DB·wire·렌더)

- `functions.ts` `createClipDraftsBulk` 매핑(요구 ① 곳 4): `step.run` 안 DB 호출이라 순수 추출 불가.
  `Prisma.ClipDraftCreateManyInput`에 `referenceTranslation`이 맞는지 tsc 정적 검사만 확인됨. 계획대로
  이 줄만 지운 변이는 check·test 둘 다 통과한다(선택 필드 + 러너 밖) — 그래서 문자열이 곧 계약이다.
- `ClipDraftCard.tsx` 렌더(번역 블록이 원문 아래 실제로 뜨는지, fresh↔stale 라벨 전환, 카드 높이):
  React 렌더라 러너 밖 — Korean 업로드 실물 육안.
- 웹훅→이벤트→Inngest 배선으로 `referenceTranslation`이 실제 DB 행에 저장되는지: 프로덕션 Korean 업로드로만.

배포 후 수동 확인 후보(메인 루프가 release-checks 등재 판단): Korean 업로드 검토 카드에서 영어 원문
아래 한국어 참고 번역 블록 표시, 넛지로 구간 편집 시 라벨이 stale로 전환.

### CLAUDE.md 테스트 표 갱신 (web-dev 읽기 전용 — 비고로 보고, 반영은 인수 때 메인 루프)

머리 수치: `현재 23개 파일, 37 suite, 162개 테스트` → `현재 25개 파일, 41 suite, 176개 테스트`

추가 행 2개:

| `widgets/clip-draft-review/model/reference-translation.test.mjs` | 참고 번역(FEAT-46 Korean analyze)의 카드 표시 판정 — 유무(null/undefined/공백→블록 없음), fresh/stale 라벨 골든, AI 구간 대비 현재 구간 허용오차(0.05초). **음의 차이(현재가 AI보다 앞선 `adjustStart("back")` 넛지)도 STALE** — 양수 차이만 밟으면 `Math.abs` 제거 변이가 전 케이스를 통과한다(계획 검증 실측). 허용오차 정확값(==0.05)은 도달 가능한 입력으로 구별 안 되는 등가 변이라 테스트하지 않는다. 골든 문자열은 사용자에게 보이는 카피라 정확값이 계약이다 |
| `inngest/modal-contract.test.mjs` | `normalizeAnalyzedMoment`가 `referenceTranslation`을 복사/누락→null 처리하는지. **이 단언이 없으면 정규화기 복사 줄을 지워도(선택 필드) TS·기존 테스트가 통과한다 — 조용한 null 회귀.** 프로덕션 웹훅 경로가 이 함수를 거쳐 값을 이벤트→Inngest→DB로 잇는다 |
