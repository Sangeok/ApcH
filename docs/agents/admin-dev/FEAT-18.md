# FEAT-18 — 대시보드 로스터를 현행 파이프라인 7인 체제로 동기화

## 2026-08-24 — 구현 (게이트②)

### 착수 전 확인 (계획서 「현재 동작」 ↔ 현재 코드)

계획서 「현재 동작」의 인용 전수를 파일에서 대조했다. 어긋남 0건 — 계획대로 구현했다.

- `roster.ts:5-11` `ROSTER_AGENT_IDS` = 5인 `as const`, `:24-25` backend-dev 배제 주석 실재. `:15-33` 가드 함수들 로직 그대로.
- `known-agents.ts:11-32` `ROSTER` 5인, `:34` `ROSTER_ORDER = ROSTER_AGENT_IDS`, `:36-43` `identityFor` 폴백(`:40`) 실재.
- `sprites.ts:36` `Prop` 4유니온, `:39-45` `PROP_GRIDS` 4개(compass `:44`), `:49-55` `APPEARANCE` 5인(feature-scout `:54`), `:56-63` fallback·`appearanceFor`.
- `commands.ts:3-9` `PipelineCommandKey` 6키, `:13-14` `GATE_GUARD`, `:16-25` `PIPELINE_COMMANDS`(web-work `:24`), `:27-32` `resolvePipelineCommand`.
- `desk-commands.ts:6-12` `DESK_COMMANDS` 5책상(web-dev `:9`), `:14-16` `deskCommandFor`.
- `briefing.ts:193-218` `teamState` — pm 특별분기 `:197-202`, `const mine` `:203`, `:260-263` team = `ROSTER_ORDER.map`.
- 실측: `.claude/agents/`에 7개 정의 파일 모두 실재(pm·admin-dev·web-dev·backend-dev·doc-auditor·feature-scout·plan-verifier). 보드 2026-08-23 섹션에 `agent: backend-dev`의 BUG-03·BUG-02가 승인대기로 실재.

### 고친 파일 (계획 「고칠 파일」 표 12개 그대로 — 코드 6 + 테스트 6, 신규 0)

코드:
1. `src/fsd/shared/agents/roster.ts` — `ROSTER_AGENT_IDS`에 backend-dev·plan-verifier(web-dev 뒤·doc-auditor 앞, 7인); 만료된 배제 주석을 main-loop 기준으로 갱신. 가드·경로 조립 함수는 무변경(상수에서 7인 자동 조립).
2. `src/fsd/pages/pipeline/model/known-agents.ts` — `ROSTER`에 backend-dev(role "백엔드 개발"·emoji ⚙️)·plan-verifier(role "계획 검증"·emoji 🔬) 추가.
3. `src/fsd/pages/pipeline/model/sprites.ts` — `Prop`에 `ledger` 추가; `PROP_GRIDS`에 `ledger: {rows:["kkkkk","kwGwk","kGwwk","kkkkk"], dy:-4}`; `APPEARANCE`에 backend-dev `{hair:#52504b,shirt:#37617a,prop:laptop}`·plan-verifier `{hair:#443a4a,shirt:#8a4a52,prop:ledger}`.
4. `src/fsd/features/run-pipeline-command/model/commands.ts` — `PipelineCommandKey`에 `| "backend-work"`; `PIPELINE_COMMANDS`에 backend-work 본문(admin/web-work와 동형, "backend-dev로서" 시작 + `GATE_GUARD`).
5. `src/fsd/pages/pipeline/model/desk-commands.ts` — `DESK_COMMANDS`에 `"backend-dev": {key:"backend-work", label:"작업 진행"}`. plan-verifier는 미추가(요구 3).
6. `src/fsd/pages/pipeline/model/briefing.ts` — `teamState`의 pm 분기 뒤에 plan-verifier 파생 분기(검토대기 존재→state "검증 중"·heldId=그 계획서·tone "active"; 없으면 "대기 중"·null·"muted").

테스트:
7. `src/fsd/shared/agents/roster.test.mjs` — 수용 7인 deepEqual, 거부 목록에서 backend-dev 제거(plan-verifier도 이제 수용), 정의 경로 거부에서 backend-dev.md 제거·주석 main-loop 기준 교체, `agentDefinitionPath`에 backend-dev·plan-verifier 정확 경로 단언.
8. `src/fsd/pages/pipeline/model/briefing.test.mjs` — team 순서 7인, backend-dev(대기 중·muted)·plan-verifier(검증 중·heldId FEAT-04·active) 단언, 검토대기 없는 소형 보드로 plan-verifier 여집합(대기 중·muted) 신규 `it`, `identityFor` 신규 2인.
9. `src/fsd/pages/pipeline/model/sprites.test.mjs` — `appearanceFor` 신규 2인, `PROP_GRIDS` 개수 5 + `ledger.dy === -4`.
10. `src/fsd/features/run-pipeline-command/model/commands.test.mjs` — `KEYS`에 backend-work, dev 작업 진행 루프에 backend-work + `startsWith("backend-dev로서")`.
11. `src/fsd/pages/pipeline/model/desk-commands.test.mjs` — backend-dev 매핑, 해석 루프에 backend-dev 추가, `deskCommandFor("plan-verifier") === null` 신규 `it`.
12. `src/fsd/entities/repo-doc/api/queries.test.mjs` — 비-roster 음성 케이스를 backend-dev.md → main-loop.md로 교체 + backend-dev.md 양성 fetch 케이스 신규 `it`(로스터 실개방 검출기).

`scripts/verify-fsd-boundaries.mjs`·`doc-location.ts`·`agent-report/api/queries.ts`는 고치지 않았다(신규 fetch/DB/Sentry owner·public export 없음; 「이미 맞는 곳」).

### 스케치 대비 차이

프로덕션 코드: 분기·조건·리터럴·사용자 노출 문구 전부 스케치대로 바이트 이식. 차이 없음.

테스트: 스케치 「테스트」 절의 "덮는 것"을 그대로 구현하되, 명세가 산문이라 실행 코드로 옮기며 명세에 나열된 케이스를 다음과 같이 배치했다(분기·리터럴 값은 명세와 동일):
- roster.test.mjs의 수용·거부·정의경로는 기존 `it` 안에서 갱신(신규 `it` 없음).
- plan-verifier 여집합 단언은 briefing.test.mjs의 신규 `it`("shows plan-verifier 대기 중·muted when no 검토대기 item exists")로, 소형 보드 픽스처(FEAT-30 구현승인 단건)를 인라인 구성 — 검토대기가 없어 파생 여집합을 밟는다.
- desk-commands.test.mjs의 plan-verifier null은 신규 `it`로 분리(요구 3 고정), 기존 "returns null for unknown agents"와 별개.
- queries.test.mjs backend-dev 양성 케이스는 신규 `it`로 추가하고 기존 음성 케이스는 main-loop.md로 교체.
신규 describe는 없어 suite 수는 불변, 신규 `it` 3건(briefing·desk-commands·queries 각 1)으로 test 수만 증가.

### 검증 게이트 (직접 실행, 넷 다 EXIT 0)

- `npm run check -w apps/admin` — EXIT 0. verify:fsd:test 13/13, verify:fsd migration 통과, ESLint 0 warnings/errors, `tsc --noEmit` 0.
- `npm test -w apps/admin` — 276 pass / 58 suites / 0 fail, EXIT 0. (구현 전 273 → +3 신규 `it`; suite 58 불변 — 계획 예측대로.)
- `npm run verify:fsd:final -w apps/admin` — EXIT 0. "FSD boundary check passed (final)." fetch owner 4 불변(새 owner 없음).
- `SENTRY_DISABLE_AUTO_UPLOAD=true npm run build -w apps/admin` — EXIT 0. 8/8 static pages, `/pipeline` 1.63 kB / First Load 130 kB. (Sentry global-error 경고는 기존 권고문으로 이 변경과 무관.)

라인엔딩 보존 확인: roster.ts·roster.test.mjs·queries.test.mjs는 LF(변경 전 LF), 나머지 9개는 CRLF(변경 전 CRLF) — `tr -cd '\r'|wc -c`와 `git diff --stat`(각 파일이 의도한 추가 줄 수만 변경, 전면 재작성 없음)로 확인.

### 테스트가 덮는 것

- 로스터 7인 멤버십·정의 경로 화이트리스트 7건(roster.test.mjs).
- backend-dev·plan-verifier 정체성(handle·role·emoji)과 team 순서 7인, plan-verifier 파생 양쪽(검증 중/대기 중)·backend-dev 자기항목 필터(briefing.test.mjs).
- 두 신규 외형(hex·prop)·ledger 소품 격자·dy(sprites.test.mjs).
- backend-work 본문 불변식([claude] 비시작·GATE_GUARD 포함·"backend-dev로서" 접두)과 화이트리스트 해석(commands.test.mjs).
- backend-dev 책상 매핑·plan-verifier null 고정(desk-commands.test.mjs).
- 정의 파일 열람 개방의 직접 증거 = backend-dev.md 양성 fetch, main-loop.md 여전히 음성(queries.test.mjs). backend-dev를 로스터에서 빼면 이 양성 케이스가 실패해 실개방을 잡는 검출기다.

### 못 덮는 범위 (Node 러너·DOM/외부 I/O 없음 → 배포 후 데스크톱+폰 수동 smoke)

새 두 책상의 픽셀 SVG 실제 렌더(스프라이트·ledger 소품 격자·명패 폭), 말풍선 색·"검증 중"/"작업 중" 문구의 시각 결과, 폰 2열/데스크톱 flex-wrap에서 7책상 줄바꿈, backend-work 명령 버튼의 useTransition·토스트·GitHub POST, 프로필 라우트(`/pipeline/agents/backend-dev`·`/pipeline/agents/plan-verifier`)의 라이브 fetch 실개방, 새 hex 색의 픽셀 대비.

### 비고 — 읽기 전용 `apps/admin/CLAUDE.md` 동기화 대상 (메인 루프가 처리)

「테스트 인벤토리」(`:35-37`)의 총계 **273 test → 276 test**로 갱신. **파일 27개·suite 58개는 불변**(신규 파일·신규 describe 없음). 표의 행은 그대로이나 다음 세 파일에 `it`이 늘었다:
- `src/fsd/pages/pipeline/model/briefing.test.mjs` — plan-verifier 파생 여집합 `it` 1건.
- `src/fsd/pages/pipeline/model/desk-commands.test.mjs` — plan-verifier null `it` 1건.
- `src/fsd/entities/repo-doc/api/queries.test.mjs` — backend-dev.md 양성 fetch `it` 1건.

「앱 개요」(`:7`)·「데이터와 외부 효과 소유권」·경계 스크립트는 갱신 불필요 — DB 접근·외부 쓰기 경로·fetch owner 수(4) 모두 불변이다.
