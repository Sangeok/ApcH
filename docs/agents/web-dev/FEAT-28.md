# FEAT-28 — 부분 성공 클립의 메타데이터를 사용자에게 전달

## 구현 (2026-09-02)

계획서: `docs/plans/FEAT-28.md`. 보드 전이 `구현승인` → `완료`.

### 배경 확인 (B-3)

계획서 「현재 동작」의 `파일:줄`을 실제 코드와 대조해 일치를 확인한 뒤 착수했다.

- `apps/web/src/inngest/functions.ts:479-486` — `applyModalPayload`가 `!isSuccessfulModalStatus`이면 `backendFailureMessage`만 세우고 early return(`:479-484`), 그 뒤 `backendClips = normalizeBackendClips(args.clips)`(`:486`)에 도달하지 못함. 계획서와 일치.
- `apps/web/src/fsd/entities/uploaded-file/model/clip-generation-outcome.ts:36-70` — `resolveModalPollAction`: detected(`:51-53`), settle 분기는 `!hasBackendFailure` 요구(`:55-63`), failed(`:65-67`). 계획서와 일치.
- 폴링 호출 `functions.ts:546` — `backendClipCount: backendClips?.length ?? null`. 계획서와 일치.

### 고친 파일 (전수)

1. `apps/web/src/inngest/functions.ts`
   - `applyModalPayload` 본문에서 `backendClips = normalizeBackendClips(args.clips)` 한 줄을 실패 early return `if`(`:479`) **위로 이동**했다. 성공·실패와 무관하게 콜백이 실은 부분 완성 클립 메타데이터를 `backendClips`에 담고, 실패 판정(`backendFailureMessage`)은 아래 `if`에서 그대로 유지된다. `applyModalPayload`는 콜백당 1회만 호출되고 `backendClips` 초기값이 `undefined`라 성공 경로 동작은 이전과 동일하다. 왜 이 한 줄로 닫히는지 설명하는 3줄 주석을 함께 넣었다(스케치 그대로).
2. `apps/web/src/fsd/entities/uploaded-file/model/clip-generation-outcome.test.mjs`
   - `describe("resolveModalPollAction", ...)` 블록 끝에 케이스 2개 추가:
     - `keeps failing when a failure callback also carries partial clips` — `hasBackendFailure: true`, `backendClipCount: 2`(비-null)에서도 `"failed"` 유지(settle 분기 `!hasBackendFailure`를 타지 않음).
     - `still detects a full S3 set on a failure callback with partial clips` — `generatedClipCount: 3 >= clipCount: 3`이면 `hasBackendFailure: true`여도 `"detected"`가 우선.

### 스케치 대비 차이

없음. 「구현 스케치」의 before/after 블록과 두 테스트 케이스를 리터럴·주석·분기 순서까지 그대로 적용했다.

### 검증

- `npm run check -w apps/web` — EXIT 0 (next lint: No ESLint warnings or errors, `tsc --noEmit` 통과).
- `npm test -w apps/web` — EXIT 0. tests 60 / pass 60 / fail 0 (직전 58 → 신규 2 추가로 60).
- `git diff --name-only` — 변경은 위 두 파일 + `apps/web/.claude/settings.local.json`(세션 시작 시점부터 변경돼 있던 하니스 설정 파일, 이번 작업 산출 아님).

### 테스트로 못 덮은 범위

`applyModalPayload`는 `processVideo` 안의 클로저이고 Inngest 스텝 머신·`step.waitForEvent`·`persistGeneratedClips`의 DB/S3 호출에 얽혀 있다. 현재 러너(`tsx --test`, DOM·React·DB·Inngest 하니스 없음)로는 실패 콜백이 실제로 `backendClips`를 채우고 그 결과 `persistGeneratedClips`가 메타데이터 행을 생성하는 종단까지 구동할 수 없다. 이번에 추가한 테스트는 이 수정이 **의존하는** 불변식(실패 경로에 backendClips를 채워도 `resolveModalPollAction` 결정이 안 바뀜)을 잠근다. 종단 확인은 diff 대조(한 줄 이동)와 배포 후 실제 부분-실패 실행에서 클립 카드에 제목·대본·근거가 뜨는지 관측으로만 닫힌다 — 도구 부재이지 담당 범위 밖이 아니다.

### 비고

- `apps/web/CLAUDE.md`의 테스트 목록 표(`entities/uploaded-file/model/clip-generation-outcome.test.mjs` 행)는 이미 존재하고, 이번에 파일을 새로 만들지 않고 기존 파일에 케이스만 추가했으므로 표에 새 행은 필요 없다. 기존 행의 서술("부분 클립 결과 판정과 폴링 조기 탈출 판정")이 새 케이스도 포괄한다 — 표 수정 불요.
