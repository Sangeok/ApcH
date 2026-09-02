# FEAT-28 — 메인 루프 기록 (게이트 결정·검증 라운드)

## 선정과 게이트① 개방 (2026-09-02)

pm이 미결 0건 상태에서 FEAT-29와 함께 선정(`c36f48c`). 사용자가 세션에서 "FEAT-28부터 수행"에 이어 "지금 FEAT-28에 대해 승인"으로 게이트① 개방 — 메인 루프가 보드를 편집했고(`43da7ff`) 결정은 사용자의 것이다. 계획서가 없는 시점이라 열 수 있는 게이트는 `계획지시` 하나뿐이므로 "승인"의 지시 대상이 모호하지 않다. 병렬 미결: FEAT-29(같은 담당, `승인대기`로 유지 — 사용자가 순차 진행을 택함).

- 요구 원천: `TASK_BACKLOG.md`의 FEAT-28 `source` — BUG-08 계획서 「범위 밖 의존」 + 인수 기록(`docs/agents/main-loop/BUG-08.md`, 2026-08-29)이 남긴 두 절반 구조의 두 번째 절반. BUG-08 검증 1라운드가 경로 6에서 잡은 결함("backend 절반만으로는 사용자 가시 효과가 없고 web 절반이 필수 후속")이 그대로 이 항목의 요구다.

## 필수 검증 경로 확정 (2026-09-02)

카탈로그(`docs/plans/verification-paths.md`) 트리거 판정:

| 경로 | 필수 여부 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | 필수 | 모든 항목 |
| 2 스케치 추출·실행 | 필수 | 스케치에 ts·mjs 코드 블록 3개 |
| 3 before/after 기계 적용 | 필수 | 기존 파일 수정(`functions.ts`) |
| 4 전칭 여집합 열거 | 필수 | "콜백당 1회만 호출" · "범위 밖 의존 없음" · "행 개수를 바꾸지 않는다" |
| 5 돌연변이 검사 | 필수 | 판정 로직(`resolveModalPollAction`)에 기대는 명세를 테스트로 신설 |
| 6 실제 사건 재생 | 필수 | 외부 신호 해석(Modal `status: error` 웹훅 콜백) |
| 7 음성 시험 | 필수 | 수정이 불변식(실패 지배)에 기대고 그 불변식을 테스트로 잠근다 |
| 8 실물 렌더 | 필수(애매→넣는 쪽) | 화면 변경은 없으나 「범위 밖 의존 없음」의 UX 논거가 ClipCard 렌더 동작에 기댄다 |
| 9 구조적 아티팩트 | 미해당 | schema·config·생성 파일 변경 없음 |

하니스: 스크래치패드 `feat28-harness/`(`orig.ts`·`mut1.ts`·`mut2.ts`·`mutation.mjs`·`replay.mjs`·`render.mjs`).

## 검증 1라운드 (2026-09-02, 메인 루프 — 무편집)

**경로 1 (인용 전수 대조)** — 계획서의 `파일:줄` 22곳 전수 재독, 전부 내용까지 일치. `functions.ts:471-487`·`:479-483`·`:486`·`:464`·`:546`·`:183-277`·`:215-232`·`:241-246`·`:643`·`:692-708`, `clip-generation-outcome.ts:36-70`·`:55-63`·`:51`·`:65-67`·`:18-32`, `route.ts:269-279`, `uploaded-file/api/index.ts:827`, `ClipCard.tsx:41-57`·`:99-104`·`:105-121`, `clip/api/index.ts:14-125`, before 블록 `:477-486`. 템플릿 7절 순서까지 일치(`template.md`).

**경로 3 (before/after 기계 적용)** — before 블록이 트리에 **바이트 그대로 1회** 등장(offset 13114, `:477-486`), after는 미등장(중복 적용 아님), 치환 1회로 적용. 줄바꿈은 작업트리 CRLF/계획서 LF 차이뿐(git 정규화 범위, 계획서 결함 아님).

**경로 4 (전칭 여집합 열거)** — 열거로 확인한 전칭 셋:
- "`backendClips`를 채우는 곳은 그 한 줄" → `grep "backendClips ="` 결과 `functions.ts:486` **단 1곳**. `normalizeBackendClips` 사용처도 정의(`:159`)와 그 호출(`:486`) 둘뿐.
- "`applyModalPayload`는 실행당 1회" → 호출부는 `:496`(`!shouldWaitForCallback`)·`:522`(`shouldWaitForCallback && !modalCallbackReceived`)·`:561`(`!modalCallbackReceived`) **3곳뿐**이고, 함수 첫 문장이 `modalCallbackReceived = true`(`:477`)라 셋의 가드가 서로를 닫는다.
- "행 개수 불변" → `createDataByS3Key`의 키 집합은 `cappedClipKeys ∪ (backendClip s3Key ∩ allowedClipKeys)`이고 `allowedClipKeys = new Set(cappedClipKeys)`라 후자가 전자의 부분집합 → 키 집합은 어느 경우든 `cappedClipKeys`. 경로 6에서 실측으로도 2→2 확인.
- `persistGeneratedClips` 호출부도 `:632` 1곳.

**경로 5·7 (돌연변이·음성 시험)** — 순수 모듈 사본에 돌연변이 2종 주입: ①settle 분기의 `!hasBackendFailure` 가드 제거 ②`failed` 판정을 `detected`보다 위로. **두 돌연변이 모두 기존 테스트 8건을 통과**(기존 명세의 구멍)하고 **계획서가 추가하겠다는 새 2건에서 사멸**(①은 `failed`가 `settle`로, ②는 `detected`가 `failed`로). 새 테스트는 장식이 아니라 이번 수정이 의존하는 불변식을 실제로 잠근다.

**경로 6 (실제 사건 재생)** — 가상 예제가 아니라 백엔드가 실제로 만드는 페이로드를 재생: `process_clip` 반환 dict(`main.py:860-871`, `index`·`s3Key`·`scriptText`·`youtubeTitle`·`subtitleStatus` 포함) → `clipType`/`hook`/`payoff` 부착(`:1189-1191`) → `build_error_callback_payload`(`error_callback.py:26-33`, `status="error"`) → `route.ts normalizeClip` → `normalizeBackendClips` → `persistGeneratedClips`의 `createDataByS3Key`. 3개 요청·2개 완성 후 CUDA OOM 시나리오.

| | 수정 전 | 수정 후 |
| --- | --- | --- |
| `normalizeClip` 통과 clips | 2/2 | 2/2 |
| `backendClips` | `undefined` | 2건 |
| `backendFailureMessage` | 설정됨 | 설정됨(실패 판정 유지) |
| `resolveModalPollAction` | `failed` | `failed` |
| 생성 Clip 행 / 메타데이터 있는 행 | 2 / **0** | 2 / **2** |

결함이 재현되고 수정으로 닫힌다. **선결 위험 하나가 여기서 해소됨**: `normalizeBackendClip`은 `index`가 없으면 클립을 버리는데(`functions.ts:134-138`), `process_clip` 반환에 `"index": clip_index`가 있어(`main.py:861`) 실패 콜백의 clips가 전부 통과한다. 없었다면 계획 전체가 무효였다.

**경로 2 (스케치 추출·실행)** — 스케치 3블록을 바이트 그대로 추출해 실제 트리에 적용 후 프로젝트 설정으로 검사: `next lint` **경고·오류 0**, `tsc --noEmit` **종료코드 0**, `npm test -w apps/web` **60/60 통과**(기존 58 + 신규 2). 적용 후 `git checkout`으로 복원, `git status` 청결 확인. 특히 우려했던 `no-useless-return`(수정 후 `return;`이 if 블록 끝에 남음, FEAT-10 ⑯ 전례)은 걸리지 않았다.

**경로 8 (실물 렌더)** — `renderToStaticMarkup`으로 ClipCard를 맨행/메타데이터 행 두 입력에 실제 렌더(`server-only` require 캐시 선점 + `QueryClientProvider` 래핑). hook·payoff·clipType 라벨(`qa`→`Q&A`)·자막 폴백 안내가 **맨행에는 전부 부재, 메타행에는 전부 표시**. 계획서의 "행에 값만 채워지면 ClipCard가 별도 변경 없이 표시한다"가 확인된다. 못 덮는 범위: `ScriptModal`·`YoutubeMetadataModal` 본문과 `DropdownMenu` 항목의 `disabled`(닫힌 상태라 Radix가 렌더하지 않음) — 계획서 「못 덮는 범위」가 이미 배포 후 관측으로 넘긴 부분과 같다.

**부수 확인(결함 아님)**
- 계획서 「현재 동작」이 `persistGeneratedClips`의 두 번째 메타데이터 경로(`:249-266` `createClipsBulk` 후 `updateClipMetadataFromBackendClips`)를 적지 않았다. 구현을 틀리게 하지 않고(오히려 `skipDuplicates: true`로 기존 행이 있는 재시도에서도 메타데이터가 붙게 하는 보강 경로) 수정 방향과 모순되지 않아 결함으로 세우지 않는다.
- `analyzeVideo`에는 같은 결함이 없다 — `analyzedMoments`를 `isSuccessfulModalStatus` 판정 **전에** 대입한다. 이번 수정은 `processVideo`를 그 형태에 맞추는 셈이다. 후속 백로그 후보 없음.

**결함 0건 · 편집 0건.** 판정: 메인 루프 라운드 무소득 → `plan-verifier` 디스패치 자격(보드 정지 규칙상 이 라운드는 트리거이지 판정이 아니다).

## 검증 2라운드 — 독립 무편집 패스 (2026-09-02, `plan-verifier`)

새 컨텍스트에 필수 8경로 목록만 브리핑하고 메인 루프의 결론은 전달하지 않았다(검증자가 보고에서 "브리핑에 직전 라운드가 무소득이었다는 사실이 적혀 있었고, 그것을 신뢰 근거로 쓰지 않았으며 `main-loop/FEAT-28.md`는 독립성 보존을 위해 읽지 않았다"고 명시). **결함 0건.**

- **경로 1**: 인용 전수 재대조 — 전부 실측 일치, 낡은 줄번호 없음.
- **경로 2**: 트리 대신 스크래치패드 바이트 추출(FEAT-10 ⑯ 방식) — before/after를 프로젝트 strict 플래그(`--strict --noUncheckedIndexedAccess --verbatimModuleSyntax --isolatedModules` 등)로 `tsc --noEmit` → 양쪽 0 errors. in-tree `next lint`는 트리 청결 유지를 위해 생략(메인 루프 1라운드가 실행해 0건 확인 — 두 라운드 합쳐 서브면이 덮인다).
- **경로 3**: before 블록과 `functions.ts:477-486`을 `diff` → **IDENTICAL(0 diff)**, `od -c`로 말미까지 대조해 CRLF·후행공백 차이 없음.
- **경로 4**: 네 전칭 전부 여집합 열거로 성립 확인(호출 3사이트의 가드 상호 배타 · 행 집합 = `cappedClipKeys` 불변 · 실패 경로도 `persistGeneratedClips` 무조건 호출 · 크레딧은 `clipsFound` 기준이라 무영향).
- **경로 5**: 돌연변이 **3종 3/3 사멸** — M1(settle의 `!hasBackendFailure` 제거), M2(`failed` return 제거), M3(`detected`의 `>=`→`>`). 메인 루프의 2종과 겹치지 않는 M2·M3가 추가로 죽었다.
- **경로 6**: 계획서 회귀 케이스를 현행 함수에 실제 러너로 통과(`tsx --test`, pass 5 / fail 0).
- **경로 7**: 불변식이 깨졌을 때 두 케이스가 실제로 실패함을 `assert.notEqual`로 입증 — 검사가 장식이 아님.
- **경로 8**: `renderToStaticMarkup`으로 메타행 → 안내·`Q&A`·hook·payoff 전량 출력, 맨행 → **빈 문자열**. 추가로 ClipCard 렌더 트리에 상위 업로드 status/success 게이트가 없음을 grep으로 확인(매치는 delete 콜백·copy 토스트·analytics뿐) — 메인 루프 라운드가 하지 않은 확인이다.
- **경로 9**: 미해당.

트리 청결은 검증자 보고가 아니라 메인 루프가 직접 `git status --porcelain`으로 검산: 남은 것은 세션 시작 시점부터 있던 `M apps/web/.claude/settings.local.json`·`?? nul`과 메인 루프 자신의 기록물 `?? docs/agents/main-loop/FEAT-28.md`뿐 — 검증자가 만들거나 고친 저장소 파일 없음.

**판정: 클린 패스.** 보드 정지 규칙("`plan-verifier`의 무편집 무소득 패스 1회가 나오면 끝난 것이다")을 충족해 보드에 `검증: 클린 패스 (2026-09-02, 독립 무편집 1라운드 — plan-verifier 1사이클째)`를 기록했다. 다음은 게이트②(`구현승인`) — 사용자만 연다.

## 게이트② 개방 (2026-09-02)

사용자가 세션에서 "구현 승인"으로 게이트② 개방 — 메인 루프가 보드를 `구현승인`으로 편집했고 결정은 사용자의 것이다. 미결은 FEAT-28 하나(FEAT-29는 `승인대기` 유지). `web-dev`에 디스패치한다.

## 구현 인수 (2026-09-02, 메인 루프)

보드 안내 블록의 인수 조건 **다섯을 전부 직접 재현**했다(에이전트 보고를 근거로 쓰지 않음).

1. **변경 파일 ↔ 「고칠 파일」** — `git status --porcelain`의 코드 변경은 `apps/web/src/inngest/functions.ts`·`apps/web/src/fsd/entities/uploaded-file/model/clip-generation-outcome.test.mjs` **정확히 둘**. 계획서 표와 일치하고 범위 밖 파일 없음. `apps/web/.claude/settings.local.json`·`nul`은 세션 시작 시점부터 있던 것.
2. **diff ↔ 「구현 스케치」** — `git diff`가 after 블록과 바이트 일치(주석 4줄 + 대입 한 줄 이동, `-` 쪽은 옛 위치의 빈 줄과 대입). 테스트 2건도 이름·주석·리터럴(`generatedClipCount`·`clipCount`·`backendClipCount`·기대값)까지 스케치 그대로. 분기 순서·조건·리터럴·사용자 문구 어느 것도 달라지지 않음.
3. **검증 명령 직접 재실행** — `npm run check -w apps/web` **EXIT 0**(`✔ No ESLint warnings or errors` + `tsc --noEmit`), `npm test -w apps/web` **EXIT 0**(tests 60 / pass 60 / fail 0). 검증 라운드에서 스케치로 얻은 수치와 동일.
4. **백로그 제거** — `grep FEAT-28 TASK_BACKLOG.md` 무매치. 잔여 3항목(FEAT-29·FEAT-01·FEAT-27)은 온전.
5. **`결과`가 가리키는 상세 기록 실재** — `docs/agents/web-dev/FEAT-28.md` 40줄 실재. B-3 배경 대조·고친 파일 전수·스케치 대비 차이(없음)·검증 출력·못 덮은 범위·CLAUDE.md 표 판단까지 규약대로 담겨 있다.

「범위 밖 의존」은 계획서가 "없음"이고 구현에서도 발생하지 않아 백로그 후보 없음.

## 배포 확인 등재 (2026-09-02) — BUG-08 낡은 줄 1건 정정

`docs/release-checks.md`에 FEAT-28 절을 등재(5줄, 자동 태그 없음 — 실제 부분-실패 파이프라인 실행이 필요해 응답 상태·문구·CSS만으로 판정 불가).

등재하며 **기존 줄의 부패를 하나 잡았다.** BUG-08 절의 「웹 무회귀」 줄이 `inngest는 기존대로 실패 처리(행은 맨행)`를 정상 기대로 못 박고 있었는데, 이번 구현이 바로 그 동작을 바꿨다. 그대로 두면 확인자가 **회귀(메타데이터 유실)를 정상으로 판정**하게 된다. 원장 마감 규칙의 `대체(항목ID)`("후속 항목이 같은 확인을 재선언해 옛 줄이 무의미해졌다")에 해당해 `[x] … 대체(FEAT-28)`로 닫고, 아직 유효한 절반(200 응답·`normalizeBody` 통과)은 FEAT-28 절의 「웹훅 무회귀」 줄이 이어받게 했다.
