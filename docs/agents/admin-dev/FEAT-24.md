# FEAT-24 — 원격 실행의 진행 과정을 대시보드에서 본다 (실행 로그 + 버튼 잠금)

## 구현 (2026-08-27, 게이트②)

계획서 `docs/plans/FEAT-24.md`를 파일에서 다시 읽고(B-1), 「현재 동작」이 지금 코드와 일치함을
확인한 뒤(B-3) 「고칠 파일」·「구현 스케치」대로만 구현했다. 화면 생김새 변경(pill running·실행 로그·버튼
잠금)이라 구현 전 `frontend-design` 스킬을 로드하고 계획서 「디자인 방향」을 따랐다 — 신규 토큰·서체·keyframe
없이 FEAT-10 실행 콘솔에 running 상태 하나와 잠금 어포던스를 더하는 델타.

### 고친 파일 (5, 신규 0)

계획서 「고칠 파일」 표와 정확히 일치. `git diff --name-only`로 5개만 만졌음을 확인.

1. `apps/admin/src/fsd/features/run-pipeline-command/model/progress.ts` (수정, 순수)
   - 스케치 §1의 **전체 새 본문**을 이식. `ProgressState`에 `running{sinceIso,lastEventIso,minutes,steps[]}`
     추가, `RUNNING_STALE_THRESHOLD_MS = 600_000`(10분) 추가.
   - `isProgress`(`[claude][진행]` 접두)·`progressText`(접두 제거 후 단계 텍스트) 추가,
     `isReply`를 `startsWith("[claude]") && !startsWith(PROGRESS_PREFIX)`로 강화(진행 코멘트 상환 제외).
   - `deriveProgress` 루프에서 진행 코멘트를 세 번째 종류로 가르고(**분기 순서: `isProgress`를 `isReply`보다
     먼저**), 가장 오래된 미응답 명령에 FIFO 귀속(`stepsForOldest`). 답글이 명령을 갚으면 `stepsForOldest=[]`
     + `lastEventIso=null`로 귀속 리셋. 진행 있으면 마지막 진행 코멘트 시각 기준으로 `running`(≥10분이면 `silent`),
     진행 0건이면 명령 시각 기준 기존 로직(`awaiting`/`silent`, 삼킴 탐지 보존).
   - 순수 `isRunLocked(state)` 추가(`awaiting`·`running`만 true). 임포트 없음 유지.
2. `apps/admin/src/fsd/features/run-pipeline-command/api/post-pipeline-command.ts` (수정, 주석만)
   - 명령 필터 계약 주석(`:19` 뒤)에 진행 코멘트 접두(`[claude][진행]`) 규약 두 줄 추가(계약 사본 정합). 코드 무변경.
3. `apps/admin/src/fsd/features/run-pipeline-command/ui/pipeline-run-control.tsx` (수정, "use client")
   - 임포트를 `import { isRunLocked, type ProgressState }`로(값 import, inline-type-imports 규칙 준수).
   - `ProgressPill`에 `running` 케이스(파랑 점 `bg-active`+맥박, `text-foreground`, 낱말 "진행 중 · N분째",
     N=0이면 "진행 중") — `responded` 앞에 삽입.
   - `ProgressLog({steps})` 컴포넌트 추가: `<ol className="flex flex-col items-end gap-0.5">`, 각 줄은
     점(`size-1`, `aria-hidden`) + 단계 텍스트, 마지막 단계만 `text-foreground` 나머지 `text-muted-foreground`.
   - 버튼 `disabled={isPending || !plan.enabled || isRunLocked(progress)}`.
   - pill 아래 `{progress.kind === "running" && <ProgressLog steps={progress.steps} />}`.
   - 폴링·`progressRequestRef` 가드·`handleClick`·토스트·레이아웃 클래스는 불변.
4. `apps/admin/src/fsd/features/run-pipeline-command/model/progress.test.mjs` (수정)
   - 임포트에 `isRunLocked`·`RUNNING_STALE_THRESHOLD_MS` 추가, `progress(text, iso)` 헬퍼 추가.
   - 기존 17 단언 전부 유지. 새 describe 둘: "진행 코멘트(running)" 9건 + "isRunLocked" 1건.
5. `apps/admin/src/fsd/features/run-pipeline-command/api/get-pipeline-progress.test.mjs` (수정)
   - 기존 describe에 통합 단언 1건 추가: 진행 코멘트가 든 payload가 창 필터를 통과해 `running`·`steps=["접수"]`로
     도출됨(=`get-pipeline-progress.ts` 무변경 실증). 기존 17 단언 불변.

**안 고친 것(계획서가 명시한 「고칠 파일」 표 밖):** `get-pipeline-progress.ts`(진행 코멘트도 `{body,created_at}`
라 기존 shape·창 필터·FIFO 전달 그대로 통과), `scripts/verify-fsd-boundaries.mjs`(새 fetch/DB/Sentry owner 없음,
public boundary 불변 — `running`·`isRunLocked`는 feature 내부 상대 import), `run-plan.ts`·`briefing.ts`·`env.js`,
게이트 잠금(`gate-card-lock.tsx`). fetch owner 6개 그대로 통과 확인(`verify:fsd:final` 0 exit).

### 스케치 대비 차이

프로덕션 코드: **차이 없음.** 분기 순서·조건·리터럴 값·사용자 노출 문구를 스케치대로 바이트 이식했다
(running 낱말 "진행 중"/"진행 중 · N분째", `bg-active`+맥박, `SILENCE_THRESHOLD_MS=180_000`,
`RUNNING_STALE_THRESHOLD_MS=600_000`, `isRunLocked`=awaiting|running, 분기 순서 `isProgress`→`isReply`→명령,
귀속 리셋 두 문장, 버튼 `disabled` 3항 OR). `running` 반환 라인은 스케치대로 80자 초과 단일 라인이나 ESLint에
formatting/`max-len` 규칙이 없어(config 확인) 통과.

테스트: 스케치가 코드를 주지 않으므로 계획서 「테스트」 절 명세대로 자작. 필수 벡터 전부 포함 —
- 분기 순서 고정(full-shape running, responded 아님), running 단계 목록·순서, minutes가 마지막 진행 기준,
  running→silent 경계(정확히 10분 `silent{10}` / 9분 `running{9}`),
- **귀속 리셋 강한 벡터**: `[명령1, 진행1"접수", 답글1, 명령2, 진행2"구현중"]` → `running{steps:["구현중"]}` +
  `steps`에 "접수" 부재 단언(약한 벡터로는 오구현 생존, 검증에서 실측된 부분),
- 고아 진행 무시, `isProgress` startsWith(본문 중간 접두는 명령), `isRunLocked` 6종, `RUNNING_STALE` 리터럴,
- get-pipeline-progress 통합(진행 코멘트 → running).

### 검증 (직접 실행, 넷 다 0 exit)

- `npm run check -w apps/admin` — EXIT 0 (verify:fsd:test 13/13, verify:fsd migration, ESLint 0경고, `tsc --noEmit` 0).
- `npm test -w apps/admin` — 292 pass / 0 fail (62 suites). 281/60에서 +11 test·+2 suite
  (progress.test.mjs +10 test·+2 suite, get-pipeline-progress.test.mjs +1 test).
- `npm run verify:fsd:final -w apps/admin` — EXIT 0 (fetch owner 불변, final tree 통과).
- `SENTRY_DISABLE_AUTO_UPLOAD=true npm run build -w apps/admin` — EXIT 0 (`/pipeline` 1.78 kB / First Load 130 kB).

### 테스트로 못 덮은 범위 (Node 러너·DOM/외부 I/O 없음 — 배포 후 데스크톱+폰 수동 확인)

- `ProgressPill` running 시각(파랑 점·`animate-pulse`·`motion-reduce`)과 `ProgressLog` 실화면(로그 줄 `text-xs`·
  마지막 단계 foreground 대비·`items-end` 우측 정렬·`<ol>` 스크린리더 순서·점 `aria-hidden`).
- 실행 버튼 `disabled`의 실화면 잠금/해제 전환(awaiting·running→회색, responded·silent·idle→다시 활성).
  `useTransition`·폴링·토스트는 FEAT-10과 동일하게 러너로 못 덮는다.
- **RUNNING_STALE 오경보 잔여 위험**: 루틴의 진행 코멘트 간격이 계획 전제(≤4분·커밋 직전 코멘트)보다 성기면
  10분 넘는 단일 단계가 `silent`로 잘못 넘어가 재전송→동시 실행을 유도할 수 있다. 지침(범위 밖·claude.ai)의
  실제 케이던스에 달려 코드로 못 덮음 — 실배포 실행에서 관측.
- **`per_page=100` 상한(FEAT-10 그대로)**: 6시간 100건 초과 시 최신 놓침. 진행 코멘트로 밀도 2~3배 늘어도 실측
  15~18건이라 현실 시나리오 아님 — 알려진 한계.

### CLAUDE.md handoff (읽기 전용 → 메인 루프 동기화)

`apps/admin/CLAUDE.md`의 「테스트 인벤토리」(`:37`):
- 총계 **27파일·60suite·281test → 27파일·62suite·292test**(파일 수 불변 — 새 파일 없음).
- `progress.test.mjs`(`:58`) 핵심 계약에 "running 상태·진행 코멘트 FIFO 귀속·`isRunLocked`" 추가.
- `get-pipeline-progress.test.mjs`(`:56`) 핵심 계약에 "진행 코멘트 → running 통합" 추가.

### 범위 밖 의존 (admin-dev 쓰기 범위 밖 — 반영 안 함, 보고만)

계획서 「범위 밖 의존」이 두 곳을 지목한다. 저장소 안 계약 사본 중 `post-pipeline-command.ts:12-19` 주석만
admin-dev 범위라 「고칠 파일」에 들어 반영했다. 나머지 둘은 반영하지 않았다:
1. **루틴 지침(claude.ai)** — 진행 코멘트가 없으면 이 기능은 항상 `awaiting`/`silent`만 보이고 `running`을 못
   보인다. 루틴이 실행 중 `[claude][진행]` 코멘트를 남기도록 지침을 바꿔야 실효가 난다. 새 지침 전문은 계획서
   §범위 밖 의존 (1)에 있다 — 사용자가 claude.ai에서 직접 반영할 산출물.
2. **`docs/proposals/active/remote-agent-pipeline-generalization.md`** — 정합 사본 세 곳(루틴 지침 템플릿
   `:130-144`, 읽기 ② 명령 이슈 `:120`, 알려진 약점 연속클릭 행 `:168`) 갱신 필요. admin-dev 쓰기 범위 밖
   (`docs/plans/<항목ID>.md` 하나만) — 메인 루프/사용자가 반영.
