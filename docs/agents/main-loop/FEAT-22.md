# FEAT-22 — 메인 루프 기록 (게이트 결정·검증 라운드)

## 발주와 게이트① 개방 (2026-08-26)

발단은 사용자 관측 — "계획 지시도 안 했는데 책상 버튼(선정 실행·작업 진행 등)이 전부 활성인 게
맞나?" 조사 결과 책상 버튼 상시 활성은 FEAT-06/07의 의도(안전장치는 명령 본문의 게이트 가드)로
확인됐으나, 후보 대응(책상 버튼 상태 게이팅)을 재검토하는 과정에서 **낡은 보드(raw CDN
max-age=300)로 버튼을 잠그면 도장 직후 주 흐름이 최대 5분 차단**되는 역설이 드러났다. 전역
실행 버튼의 기존 잠김·FEAT-20 잠금 칩의 "보드 반영 대기" 문구·이번 버튼 활성 의문 — 세 증상의
공통 원인이 보드 읽기 지연 하나이므로, 근본 해결(contents API 전환)을 등재하기로 했다.

- 백로그 등재: `3920986` (관측/진단 분리, 진단은 `queries.ts:8` 코드 확정, 수정 방향·후속 포함)
- 게이트①: 사용자가 세션에서 "FEAT-22부터 수행"으로 지시 — 선정(소유자 직접 발주)과
  `계획지시` 전이를 함께 결정했다. 메인 루프가 보드를 편집했고 결정은 사용자의 것이다.
- 병렬 미결: BUG-07 `승인대기` 잔류(사용자 결정 대기). 미결 2건은 소유자 결정으로 기록.

admin-dev를 계획서 작성에 디스패치한다. 핵심 판단 지점(계획 단계에서 다뤄야 할 것):
인증 헤더(`GITHUB_PIPELINE_TOKEN` 재사용 — 비인증은 IP당 60회/시라 Vercel 공유 IP 위험) ·
base64 디코드 · 토큰 부재 시 raw CDN 폴백 유지 여부 · read owner(`entities/pipeline/api/
queries.ts`) 불변 원칙 · FEAT-20 칩 문구("보드 반영 대기")와 run-plan 5분 안내 문구의 시효.
책상 버튼 게이팅은 이 항목 범위 밖 후속(백로그 등재문에 명시).

## 계획서 접수 (2026-08-26)

admin-dev → `docs/plans/FEAT-22.md`, 보드 행 `검토대기`(커밋 `cb6ceef`). 수정 6(프로덕션 3 +
테스트 3)·신규 0. 설계 결정: 토큰 부재 → raw 폴백 / shape 실패 → fail-closed throw(런타임
폴백은 조용한 stale 재발이라 기각) / fetch owner 6개 불변(경계 스크립트 무수정) / 5분 문구
두 곳(run-plan 설명·잠금 칩) 이 항목에 포함. 범위 밖 의존 없음, 승계 후속으로 책상 버튼
게이팅 기록.

## 검증 필수 경로 확정 (2026-08-26, 카탈로그)

| # | 경로 | 판정 | 근거 |
| --- | --- | --- | --- |
| 1 | 인용 전수 대조 | **필수** | 모든 항목 |
| 2 | 스케치 추출·실행 | **필수** | check·test·verify:fsd:final 조립 게이트 |
| 3 | before/after 기계 적용 | **필수** | 수정 6파일 |
| 4 | 전칭 여집합 열거 | **필수** | "지연 문구 전수"·"owner 6개 불변"·변경 심볼 소비자 전수 |
| 5 | 돌연변이 검사 | **필수** | queries.test 재작성 명세의 분별력 |
| 6 | 실제 사건 재생 | **필수(변형)** | 라이브 contents API 응답(base64 래핑)을 디코드 경로에 통과 |
| 7 | 음성 시험 | 제외 | 경계·화이트리스트 신설 없음(owner 불변 — 조립 check가 덮음) |
| 8 | 실물 렌더 | 제외(원장) | 문구는 순수 모듈 리터럴로 테스트가 덮고 칩·콘솔 렌더는 배포 후 수동(FEAT-20 선례) |
| 9 | 구조적 아티팩트 | 제외 | 스키마·설정 신설 없음(env.js 무변경) |

## 검증 1라운드 (2026-08-26, reconciling — Standard 프로파일·전체 증거) — 결함 2건, 편집 1회

- **1 인용 전수**: queries.ts(전문)·config/github.ts:7·페이지 호출 2곳·briefing.ts:282·
  run-plan.ts:20/:43-44·transitions.ts:162-177(before 바이트 일치)·gate-transition-button.tsx:42-43·
  reject-actions.tsx:53-56·gate-card-lock.tsx:8-11/:26-27/:41-45·commit-gate-transition.ts:45-60·
  선례 owner 2곳(agent-report:15-22·repo-doc:20-27)·env.js:37-45·verify-fsd-boundaries.mjs:32-39
  (6 owner)·테스트 인용 3곳 — 전부 일치.
- **2·3 조립 실행**: 수정 6파일 기계 적용(queries.test.mjs는 명세에서 5케이스 자작 — repo-doc
  `~/env` getter 모의 패턴) → `npm run check` EXIT 0 · `npm test` **281/281**(278→281, suite
  59→60) · `verify:fsd:final` 통과.
- **5 돌연변이 7종**: Authorization 제거·shape 실패→raw 폴백·토큰 분기가 raw 호출·`?ref` 누락·
  no-store 제거·utf-8 디코드·토큰 가드 반전 — **전부 사멸**, 원복 후 기준선 EXIT 0.
- **6 실사건 재생**: 라이브 contents API GET(비인증 1회) → `encoding: base64`·본문에 개행 래핑
  실재 → `Buffer.from(..., "base64")` 디코드가 dev HEAD와 **바이트 동일**. 방금 푸시한 FEAT-22
  `검토대기` 행이 응답에 이미 실려 있어(raw CDN이라면 잔상 창) 신선도 주장 자체를 실물로 확인.
- **4 여집합 → 결함 ②**: `반영` 전수 grep에서 지연 전제 문구가 계획 주장(두 곳)과 달리 **세 곳**
  — 도장 토스트 힌트(`transitions.ts:24-25` "보드에 반영되면 …")가 미기술. 전칭 구멍.
- **결함 ①**: 스케치 3 근거가 FEAT-20 잠금을 "페이지 전역 단일 lock"이라 서술 — 실제는 **카드
  단위**(`gate-card-lock.tsx:8` "카드 단위 잠금", 카드마다 Provider·`:26-27` useState). 인용된
  코드와 모순되는 거짓 서술.

**편집 (일괄 1회)**: ① 카드 단위로 정정(정확 줄 `:26-27` 검산 포함). ② 「현재 동작」에 지연
문구 3곳 전수 명시 + 「대안」에 토스트 유지 결정·근거 추가(칩 "대기"는 지속 상태 표식이라
거짓이 되지만 토스트 "반영되면"은 조건 서술로 refresh 왕복 전까지 여전히 참 — 지우면 refresh
착지 전 클릭 혼란을 새로 만든다). 스케치·고칠 파일 무변경. 원복 후 `git status` 트리 청결 검산.

Pass State: editing pass · source changed=yes · blockers resolved=2 · remaining=0 · next=무편집 최종 패스.

## 검증 2라운드 (2026-08-26) — 무편집 클린 패스 (편집 0건, 결함 0건)

최신 저장본 재독 — 편집 3곳이 검증 증거와 정합(스케치 무변경이라 조립·돌연변이·재생 증거가
현재 계획서에 그대로 대응). Coverage Stability 2차 레시피 — **변경 심볼 소비자 전수 스윕**:
`GATE_LOCK_LABEL`·`rejectLockLabel` 소비처 4파일 = 계획 2 + UI 통과 전달 2(단언 없음),
`describePipelineRun` 소비처 4파일 = 계획 2 + index 재수출 + briefing 통과 전달, 옛 리터럴
("보드 반영 대기"·"최대 5분") 계획 밖 잔존처 **0건** — 문구 전칭이 두 번째 경로로 폐쇄.

**판정: 메인 루프 무편집 클린 패스.** plan-verifier 독립 패스 디스패치.

Minimal Replay Anchor (적용성 증거일 뿐): 원천 docs/plans/FEAT-22.md(1라운드 편집 반영본) ·
경계 apps/admin/src/fsd/{entities/pipeline, features/run-pipeline-command, features/
transition-pipeline-gate} + scripts/verify-fsd-boundaries.mjs(불변 확인) · 레시피 조립 게이트
3종 + 돌연변이 7 + 라이브 contents API 재생 + `반영` 전수 grep + 소비자 스윕 · 프로파일
Standard(전체 증거) · 최종 패스 무편집.
