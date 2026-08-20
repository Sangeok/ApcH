# FEAT-16 — 최종 클립에 선택 근거(hook·payoff·clipType) 저장·표시

## 2026-08-21 — 구현 (게이트②, 구현승인)

계획서 `docs/plans/FEAT-16.md`의 「구현 스케치」를 그대로 이식했다. 「현재 동작」 1~5 지점이
착수 시점 코드와 전부 일치함을 먼저 확인했다(route.ts·client.ts·functions.ts·entities/clip/api·ClipCard.tsx
모두 세 필드 부재, `Clip` 모델에는 `clipType/hook/payoff` 컬럼 존재 — schema.prisma:120-122).

### 고친 파일 (수정 5 · 신규 2)

계획서 「고칠 파일」 표 7개와 정확히 일치. 그 밖의 파일은 건드리지 않았다.

**신규**
- `apps/web/src/fsd/widgets/clip-display/model/clip-rationale.ts` — 순수 함수 `clipTypeLabel`(qa→Q&A·insight→Insight·모르는 값 원본·nullish/공백 null)과 `hasClipRationale`(세 필드 중 하나라도 비공백이면 true). `CLIP_TYPE_LABELS` 상수는 스케치대로 슬라이스 안에 둠(FSD peer 임포트 금지로 clip-draft-review와 공유 안 함).
- `apps/web/src/fsd/widgets/clip-display/model/clip-rationale.test.mjs` — 위 두 함수 테스트. `./clip-rationale.ts` 명시 확장자 임포트(selection-budget.test.mjs 선례).

**수정**
- `apps/web/src/app/api/webhooks/modal/route.ts` — `ModalWebhookClip`에 세 필드, `RawModalWebhookClip`에 세 필드(+`clip_type` snake 방어), `normalizeClip` 반환에 `clipType: rawClip.clipType ?? rawClip.clip_type ?? null`·`hook`·`payoff` 보존.
- `apps/web/src/inngest/client.ts` — 이벤트 페이로드 타입 `ProcessVideoBackendClip`에 세 필드.
- `apps/web/src/inngest/functions.ts` — `ProcessVideoBackendClip`·`RawProcessVideoBackendClip`(+`clip_type`) 타입, `normalizeBackendClip` 반환 보존, `persistGeneratedClips` create 데이터에 `clipType`/`hook`/`payoff` 세 필드.
- `apps/web/src/fsd/entities/clip/api/index.ts` — `ClipMetadataPatch`에 세 필드, `toClipMetadataUpdateData`에 기존 `!= null` 가드 규칙 그대로 세 스프레드 추가(존재값 안 지움). 이 패치는 웹훅(route.ts:258)·워커(functions.ts) 두 호출부를 함께 덮는다.
- `apps/web/src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx` — 임포트 추가, `usePlayUrl` 파생값 4개(`typeLabel`·`hook`·`payoff`·`showRationale`), 비디오와 액션 사이에 선택 근거 블록 렌더. `showRationale` false면 블록 부재로 카드가 기존과 동일. hook/payoff는 clamp 2줄, `block` 미사용(ClipDraftCard.tsx:314-320 실측 근거).

### 스케치 대비 차이

분기·조건·리터럴 값·사용자 노출 문구 모두 스케치와 동일하게 바이트 이식. 실질적 차이 없음.
사소한 것 둘(사용자 판단 대상 아님): (1) 신규 모듈 주석의 「대안」 참조를 `FEAT-16 계획서 「대안」`으로 명시. (2) 테스트 파일은 스케치가 코드를 주지 않아 「테스트」 절 명세대로 자작 — 6 케이스(clipTypeLabel 3 it·hasClipRationale 3 it).

### 검증 (직접 실행, 둘 다 EXIT 0)

- `npm run check -w apps/web` → EXIT 0 (next lint: No ESLint warnings or errors · tsc --noEmit 0)
- `npm test -w apps/web` → EXIT 0 (# tests 51 / # suites 12 / # pass 51 / # fail 0). 기존 45 + 신규 6.

### 테스트로 못 덮은 범위 (Node 러너·DOM/외부 I/O 없음 — 계획서 「테스트」 절 그대로)

- `route.ts`·`functions.ts` 파서(`normalizeClip`/`normalizeBackendClip`) — `~/env`·`server-only`·Prisma 의존으로 tsx 러너 로드 불가. 기존 파서도 같은 이유로 무테스트(현 상태 유지).
- `persistGeneratedClips` create·`toClipMetadataUpdateData` update의 실제 DB 반영(Prisma·외부 I/O).
- `ClipCard`의 선택 근거 블록 렌더·clamp 시각·`showRationale` 분기(React/DOM 없음) — 수동 확인.
  **배포 직후엔 기존 Clip 행 세 컬럼이 전부 NULL이라 모든 카드가 `showRationale===false`로 떨어져 새 블록이 렌더되지 않는다.** 값 있는 경로 확인은 (a) 파이프라인 1회 실주행 또는 (b) 기존 행에 임시 값 주입 후 되돌리기 중 하나가 필요하며 어느 쪽을 할지는 사용자가 정한다.
- 백엔드→웹훅→이벤트→DB 전 구간 wire 왕복.

### 범위 밖 의존

없음. 선행 스키마·마이그레이션·Prisma 클라이언트는 커밋 544ac12로 적용 완료(`Clip` 타입에 세 필드 존재). `packages/db` 무접근 순수 apps/web 작업.

### 읽기 전용 파일에 대한 비고 (메인 루프 처리 대상)

`apps/web/CLAUDE.md`는 web-dev 수정 범위 밖(읽기 전용)이라 직접 고치지 않았다. 갱신 필요:
- "현재 7개 파일, 45개 테스트" → "8개 파일, 51개 테스트".
- 테스트 목록 표에 행 추가:
  `| widgets/clip-display/model/clip-rationale.test.mjs | 최종 클립 선택 근거 표시 헬퍼. clipType 라벨 매핑(qa→Q&A·insight→Insight·모르는 값 원본·nullish/공백 null)과 hasClipRationale 존재 판정(비공백 하나라도 있으면 true). 백엔드가 clipType에 강제하는 enum이 없어 라벨 매핑이 미지의 값을 삼키지 않는 것과, 세 근거가 전부 비면 카드 블록이 렌더되지 않는 것을 잡는다 |`
