# FEAT-23 — 항목 카드에 파이프라인 여정 스테퍼

## 2026-08-27 — 구현 (admin-dev, B단계)

계획서 `docs/plans/FEAT-23.md`(게이트② 승인판)를 파일에서 읽고 「고칠 파일」·「구현 스케치」대로 구현했다.

### 고친 파일 (신규 3 · 수정 1)

| 파일 | 종류 | 내용 |
| --- | --- | --- |
| `apps/admin/src/fsd/pages/pipeline/model/journey.ts` | 신규(순수) | status(+검증 판정)→여정 위치 결정적 매핑. `deriveJourney(status, validation): JourneyView \| null` + `JOURNEY_STAGES` 7단계 카탈로그 + `WAITING_LABEL`. 임포트 없음(board.ts 동종). |
| `apps/admin/src/fsd/pages/pipeline/model/journey.test.mjs` | 신규 | `deriveJourney` 전 경우 결정성. `./journey.ts` 직접 import(mock.module 없음 — 임포트-프리 subject). |
| `apps/admin/src/fsd/pages/pipeline/ui/_component/journey-stepper.tsx` | 신규(서버 컴포넌트) | `JourneyView`→노드 레일 + 단계 라벨(sm↑) + 캡션. `"use client"` 없음. `dotClass` 색/형태 매핑. |
| `apps/admin/src/fsd/pages/pipeline/ui/index.tsx` | 수정 | 임포트 2줄(`deriveJourney`·`JourneyStepper`) + `InboxCard`에 `const journey = deriveJourney(...)` 1줄 + 발화 아래·`GateCardLock` 위 조건부 렌더 1줄. |

### 스케치 대비 차이

- **구현 코드**: 스케치를 그대로 옮겼다. 분기 순서·조건·리터럴 값·사용자에게 보이는 문구(단계 라벨·대기 낱말·캡션) 모두 스케치와 동일 — `journey.ts`·`journey-stepper.tsx`는 스케치 전문(全文)을 그대로, `index.tsx`는 스케치의 3 hunk를 그대로 적용했다.
- **테스트 파일**: 계획서 「테스트」 절이 명세만 산문으로 담고 코드 본문은 주지 않아, 그 명세를 `node:test`(describe/it) + `node:assert/strict`로 옮겨 새로 작성했다(형식은 sibling `sprites.test.mjs`를 따름). 명세 전부를 덮었다:
  - 전 status 매핑(표 전 행): 승인대기→1·계획지시→2·검토대기(null)→3·구현승인→5, 각 currentLabel/waitingActor/waitingLabel/nextLabel과 stages state 배열.
  - 완료·보류·null·미지(`검증완료`) → 모두 null.
  - 검토대기 이분: null→3, 클린 패스 문자열→4, 그리고 `"x"`도→4(존재=통과, 내용 파싱 아님).
  - state 부여 불변식: PROGRESS_CASES 5경우 각각 길이 7·current 정확히 1개·앞 done·뒤 upcoming·`waitingActor === stages[currentIndex].actor`.
  - 단계 카탈로그 고정: label 시퀀스 `[선정,게이트①,계획서,검증,게이트②,구현,인수]`, actor 시퀀스 `[pm,user,agent,verifier,user,agent,loop]`.
  - 다음 라벨: `nextLabel === stages[currentIndex+1].label`(진행 중 넷은 next 항상 존재).
  - 대기 낱말 매핑: user→당신 차례·verifier→검증 중·agent→작업 중.

계획서 「고칠 파일」 표 밖(`board.ts`·`briefing.ts`·`pages/pipeline/index.ts` public API·`scripts/verify-fsd-boundaries.mjs`)은 손대지 않았다. FSD: `journey.ts`는 UI가 상대 import, `journey-stepper.tsx`는 page-private `_component`라 재수출 없음. 새 fetch/DB/Sentry owner 없음.

### 검증 (실제 출력)

| 명령 | 결과 |
| --- | --- |
| `npm run check -w apps/admin` | exit 0 — verify:fsd:test(13 pass) → verify:fsd → next lint(0 warn/err) → `tsc --noEmit`(0) 전부 통과 |
| `npm test -w apps/admin` | exit 0 — tests 307 / suites 68 / pass 307 / fail 0 |
| `npm run verify:fsd:final -w apps/admin` | exit 0 — "FSD boundary check passed (final)" (owner 집합 불변 통과) |

테스트 총계: 직전 292 test·62 suite → **307 test·68 suite**(journey.test.mjs가 +15 test·+6 suite). 파일 수 27→28.

### 테스트로 못 덮은 범위 (배포 후 데스크톱+폰 수동 smoke)

Node 러너에 DOM이 없어 아래는 실빌드 후 육안 확인으로 남긴다(`보류` 사유 아님 — test-runtime-contract):

- `JourneyStepper` 실물 렌더: 노드 색/형태(done 흑연 채움 `bg-silence`·current·user 호박 빈 링 `border-2 border-stamp`·current·팀 남색 채움 `bg-active`·upcoming 옅은 빈 링), 연결선 색(`bg-silence/50` vs `bg-muted-foreground/25`), 현재 노드 크기 강조(size-2.5 vs 1.5).
- 반응형: 단계 라벨의 `hidden sm:block`(폰 숨김·sm↑ 노출), 캡션의 `flex-wrap`·`text-xs`·호박/남색 색 공유.
- 신규 Tailwind 유틸 조합 방출: `bg-silence`·`bg-active`·`border-stamp`·`border-2`·`border-active/50`·`border-stamp/50`(기존 방출 토큰의 새 유틸 조합) — 실빌드 후 확인.
- `InboxCard` 통합: 발화↔레일↔게이트 순서, `GateCardLock` 밖 배치, `ValidationMark`와 시각 일관(줄 있으면 칩=통과·레일=게이트②, 없으면 칩=검증 전·레일=검증).

### handoff (읽기 전용 파일 — 직접 수정 안 함)

`apps/admin/CLAUDE.md`의 「테스트 인벤토리」(현재 문서상 27파일·60suite·281test로 표기 — FEAT-24 반영 전 수치로 보임)를 실측 최종치 **28파일·68suite·307test**로 동기화 필요. 추가 행:
`src/fsd/pages/pipeline/model/journey.test.mjs | status→여정 단계 결정적 매핑(검토대기 이분·완료/보류/미지 여정 밖·단계 카탈로그·대기 낱말 고정)`
