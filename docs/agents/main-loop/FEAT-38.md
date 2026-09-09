# FEAT-38 — 메인 루프 기록

## 게이트① (2026-09-09)

소유자가 `승인대기` → `계획지시` 개방. BUG-09과 함께 둘 다 개방했다.

담당은 `main-loop`다 — `packages/db/prisma/schema.prisma` 수정이 web-dev의 금지
목록(`.claude/agents/web-dev.md:54`)에 있고 `db:push`/`db:migrate` 실행도
금지(`:53`)라 dev 로스터의 쓰기 범위 밖이다. FEAT-19·FEAT-26 전례를 따른다.

### 계획 단계에서 반드시 다룰 것

- **analytics 계약의 컴파일 결합.** `ANALYTICS_METADATA_KEYS_BY_EVENT`는
  `as const satisfies Record<AnalyticsEventName, readonly string[]>`로 전체 이벤트에
  대한 Record다. `packages/db/src/analytics-contract.ts`에 이름만 추가하고
  `apps/web/src/fsd/shared/analytics/lib/metadata.ts`의 키를 안 넣으면 컴파일 오류다.
  워크스페이스가 갈렸다는 이유로 쪼개면 중간 상태가 빌드되지 않는다.
- **마이그레이션은 1회.** 캡션 컬럼(`UploadedFile.captionStyle`)도 여기서 함께 만들고
  FEAT-42까지 안 쓴 채 둔다. 둘로 나누면 Neon 작업이 두 번이 된다.
- **DB를 실제로 바꾸는 명령은 구현 단계에서 소유자 승인을 따로 받는다.**

## 필수 경로 확정 (2026-09-09)

계획서(`docs/plans/FEAT-38.md`)가 `검토대기`가 된 시점에 카탈로그(`docs/plans/verification-paths.md`)에서 확정했다. 메인 루프의 편집 라운드와 `plan-verifier`의 독립 패스가 같은 목록을 쓴다.

| 경로 | 채택 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | ○ | 전 항목 필수. 계획서 인용 20여 곳(schema·contract·metadata·test·agent 정의) |
| 2 스케치 추출·실행 | ○ | prisma 조각 2 + SQL 전문 1 + TS 조각 2 + JS 테스트 케이스 1. 단독 컴파일이 안 되는 조각이라 **적용 후 `check`·`test`가 실제 검사**다 |
| 3 before/after 기계 적용 | ○ | 기존 파일 수정 4개, before 블록 4개. 바이트 일치가 핵심 |
| 4 전칭 여집합 | ○ | 전칭이 여럿 — "User에 설정 컬럼이 하나도 없다", "캡션 스타일만 그 대칭에서 빠져 있다", "`apps/web` 중에서는 analytics 두 파일만 건드린다", "범위 밖 의존 없음", "이 항목은 화면을 바꾸지 않는다" |
| 5 돌연변이 | × | 순수 함수의 신설·변경이 없다. `sanitizeAnalyticsMetadata`는 기존 함수이고 이 항목은 그 **입력 데이터(허용 키 맵)**만 늘린다. 새 테스트 케이스가 장식인지는 경로 7이 답한다 |
| 6 실제 사건 재생 | × | 외부 신호 해석 없음 |
| 7 음성 시험 | ◎ **본체** | 계획서의 **중심 주장**이 화이트리스트 결합이다 — "이벤트 이름만 추가하고 metadata 키를 빼면 컴파일 오류 + `event-catalog.test.mjs` 실패". 빼도 통과하면 그 주장이 거짓이고 3·4번을 쪼개도 된다는 뜻이 된다. 새 `metadata.test.mjs` 케이스도 같은 방식으로 — 허용 키에서 `source`를 빼면 정말 죽는가 |
| 8 실물 렌더 | × | 화면 변경 없음 (이 항목의 정의상 소비자가 없다) |
| 9 구조적 아티팩트 | ◎ | 트리거가 **"schema·config·생성 파일 변경이 있으면"**으로 이 항목이 정확히 그것이다. prisma schema 2블록 + migration SQL. 텍스트가 아니라 구조로 파싱해 확인한다 — 컬럼명·타입·nullable 여부, Prisma `Json` → Postgres `JSONB` 매핑, 마이그레이션 SQL과 스키마의 일치. **카탈로그가 "실증 사례 대기"로 비워둔 행이라 여기가 첫 실증이 된다** |

## 라운드 1 (편집) — 구현 영향 2건 + 위생 2건

- **경로 1 (인용 전수)**: `현재 동작`의 `User`(`:41`~`:58`)가 실제와 어긋남 → `sed -n '43p;59p;60p'`로 `model User {`(`:43`) ~ `}`(`:60`) 확정. **위생.**
- **경로 1·3 (before/after 기계 적용)**: 스케치 6의 삽입 위치가 틀렸다. 계획서가 "`:43` `});` (describe 닫기) 바로 앞"이라 했으나 `sed -n '36,44p'` 결과 `:43`은 직전 `it`을 닫고 `describe`는 `:44`가 닫는다. **그대로 따르면 `it` 안에 `it`이 중첩된다 — 구현 영향.** → `:43`과 `:44` 사이로 정정.
- **경로 9 (구조적 아티팩트)**: 테스트 명령에 `npm run db:generate -w @repo/db`(= `prisma migrate dev`)가 있었다. **구현 영향(위험).** 마이그레이션 히스토리가 스키마와 드리프트돼 있어(아래) `migrate dev`는 드리프트를 검출하고 **DB 리셋을 제안한다** — 대상이 프로덕션 Neon이면 데이터 손실 경로다. → `db:migrate`(= `migrate deploy`, 드리프트 미검사) + `db:generate:client`(= `prisma generate`)로 교체하고 근거 절 추가.
- **경로 9 (드리프트 발견)**: `grep -rho 'CREATE TABLE ...' packages/db/prisma/migrations/` + `init` 대조 결과 마이그레이션이 만드는 테이블 10개 vs 스키마 모델 11개 — **`ClipDraft`를 만드는 마이그레이션이 없다**(`grep -rl "ClipDraft" packages/db/prisma/migrations/` 0건). `db:push`로 반영된 것. FEAT-38의 결함은 아니지만 계획서에 「후속 항목 후보」로 기록하고 소유자에게 백로그 후보로 제시한다. **위생 + 후속.**

## 라운드 2 (편집) — 위생 1건

- **경로 2 (스케치 추출·실행)**: 스키마 사본(`스크래치패드/db/prisma/schema.prisma`)에 스케치 2블록을 적용하고 `prisma migrate diff --from-empty --to-schema-datamodel --script` 실행 → `"defaultLanguage" TEXT` · `"defaultClipCount" INTEGER` · `"defaultReviewBeforeGenerate" BOOLEAN` · `"defaultCaptionStyle" JSONB` · `"captionStyle" JSONB`가 계획서 SQL과 **정확히 일치**. **결함 없음.**
  - `prisma validate`는 오류 1건을 냈으나 **원본 스키마에서도 동일**하게 난다(`P1012 Environment variable not found: DATABASE_URL_UNPOOLED`) — 스케치와 무관한 환경 문제. 기준선 대조로 확정.
- **경로 9 (`JSONB` 표기)**: 위 SQL 방출로 확인 + 저장소 내 선례 `20260616000000_add_analytics_events/migration.sql:9` `    "metadata" JSONB,`.
- **경로 4 (전칭 여집합)**: 「이 항목은 화면을 바꾸지 않는다」와 「소비자 코드 변경 0」이 열거 없는 전칭이었다. `ANALYTICS_EVENT_NAMES` 소비자를 전수 열거해 **네 곳**(수집 라우트 `z.enum`, metadata Record, admin `listRangeEvents` ×2, 재수출)으로 확정하고 표로 계획서에 넣었다. 화면 불변의 근거도 "admin은 이름 목록이 아니라 **기록된 행**을 그린다"로 정확해졌다. **위생.**

## 라운드 3 (무편집) — 무소득

편집으로 새로 들어간 인용만 경로 1로 재대조: `route.ts:15` · `analytics/ui/index.tsx:196` · `metadata.test.mjs:38` · `add_analytics_events/migration.sql:9` · `schema.prisma:43·59·60` 전부 내용까지 일치.

**소득 0 → `plan-verifier` 독립 무편집 패스 디스패치 자격 획득.** 클린 패스 판정은 그쪽 결과로만 한다(자기 라운드의 무소득은 트리거지 판정이 아니다).

## 라운드 4 (무편집) — 경로 7 음성 시험, 무소득

라운드 3에서 **경로 7을 빠뜨린 것을 발견**했다(◎ 본체로 지정해놓고 실행하지 않음). 목록 소진이 독립 패스 디스패치의 전제라 되돌아가 실행했다.

**시험 설계**: `packages/db/src/analytics-contract.ts`에 이벤트 이름 2개만 추가하고 `metadata.ts`의 허용 키는 **일부러 누락**시킨 뒤, 계획서가 주장하는 두 방어선이 정말 걸리는지 본다. 실행 후 `git checkout --`로 복원.

**결과 — 양쪽 다 걸렸다. 주장은 참이다.**

- 컴파일(`npm run typecheck -w apps/web`):
  `src/fsd/shared/analytics/lib/metadata.ts(59,12): error TS1360: ... is missing the following properties from type 'Record<...>': settings_viewed, settings_defaults_saved`
  추가로 `metadata.ts(83,23): error TS7053` — `allowedKeys` 인덱싱이 `any`로 무너진다.
- 런타임(`npm test -w apps/web`):
  `not ok 10 - 모든 이벤트 이름에 metadata 정의가 있다` / `error: 'metadata 정의 누락: settings_viewed'` / `# pass 129  # fail 1`

**복원 확인**: `git status --short packages/db/` 무출력 + `grep -c "settings_viewed" packages/db/src/analytics-contract.ts` = 0.

계획서 수정 없음 → 준비 상태가 리셋되지 않는다.

## 필수 경로 소진 현황

| 경로 | 실행 라운드 | 결과 |
| --- | --- | --- |
| 1 인용 전수 | 1, 3 | 위생 1건 교정, 3라운드 재대조 일치 |
| 2 스케치 추출·실행 | 2 | 결함 없음 (방출 SQL이 계획서와 일치) |
| 3 before/after | 1 | **구현 영향 1건** 교정 (테스트 삽입 위치) |
| 4 전칭 여집합 | 2 | 위생 1건 (소비자 4곳 열거로 전환) |
| 7 음성 시험 | 4 | 결함 없음 (두 방어선 모두 실증) |
| 9 구조적 아티팩트 | 1, 2 | **구현 영향 1건**(migrate dev 위험) + 드리프트 발견 + JSONB 확인 |

여섯 경로 전부 소진. 마지막 두 라운드(3·4)가 무편집·무소득 → `plan-verifier` 디스패치.

## 라운드 5 (독립 패스 #1) — 판정 불가, 결함 1건

`plan-verifier` 디스패치. **내 브리핑이 계약을 위반했다.**

`plan-verifier.md:19-21`은 브리핑이 주는 것을 **셋**으로 못 박는다 — 항목ID, 계획서 경로, 필수 경로 목록. "넷째는 없다"(`:25`). 내가 실은 것 중 둘이 금지 항목이었다:

- `:27` 「직전 라운드의 결함 목록·내용·성격·영향 평가」 — 내가 "메인 루프가 고쳤다고 주장하는 것들: 테스트 삽입 위치, `migrate dev`→`migrate deploy`, User 줄범위, 소비자 4곳 열거"를 나열했다.
- `:29` 「어디를 보라고 좁혀 주는 안내」 — 위가 그대로 그것이다. 어디가 바뀌었는지 알면 그 지점만 진짜로 재독하고 나머지는 회상으로 때운다. **그 회상을 막으려고 그 에이전트가 존재하는데 내가 그 근거를 없앴다.**
- `:30` 「이 항목의 성격 요약」 — "nullable 컬럼 4개 + captionStyle + 이벤트 2개, 화면을 바꾸지 않는다"를 미리 틀 지웠다.
- `:31` 「이미 계약된 요구의 반복」 — 결함 분류(구현/위생)와 무수정 제약을 다시 말했다. 둘 다 그 파일에 이미 있다(`:47`).

계약대로 **이 패스는 무소득/클린 판정의 근거가 될 자격이 없다.** 검증 자체는 끝까지 수행됐고 여섯 경로 전부 실행됐으므로 결함은 유효한 소득으로 받는다.

### 받은 결함 — 문서 위생 1건 (직접 재현함)

계획서 230행이 「네 곳뿐이고 **전부** 목록에서 파생되므로 수정이 필요 없다」인데, 바로 아래 표(235행)가 `metadata.ts:59`를 **「이 항목에서 함께 고친다」**로 적는다. **자기 표 안에 반례가 있는 전칭이다.** 라운드 2에서 내가 전칭을 열거로 바꾸면서 도입한 문장이고, 열거는 맞았는데 그 위의 요약 한 줄이 틀렸다. 구현 영향은 0이다 — 「고칠 파일」 #4·스케치 5·「결합」 절이 모두 그 수정을 강제하므로 구현자가 놓칠 수 없다. 문구를 "넷 중 셋"으로 좁혀 해소했다(절 제목도 「왜 소비자 코드 변경이 0인가」→「어디까지 따라 움직이나」로 정정).

### 트리 청결 검산 (보고가 아니라 직접 확인)

`git status --short` = `M apps/web/.claude/settings.local.json` + `?? nul` — 세션 시작 스냅샷과 동일. 검증자의 무수정 준수 확인.

**계획서를 고쳤으므로 준비 상태가 리셋된다. 계약에 맞는 브리핑(셋만)으로 재디스패치한다.**

## 라운드 6 (독립 패스 #2) — 클린, 결함 0건

계약대로 셋만(항목ID·계획서 경로·필수 경로 발췌) 실어 재디스패치. 검증자가 "브리핑은 계약대로 셋만 담고 있었다. 위반 없음"으로 확인.

**여섯 경로 전부 실행, 결함 0건.** 주요 증거:

- **경로 2**: 스케치 적용본이 `prisma validate` 통과(exit 0)하고 `migrate diff`가 5컬럼을 `TEXT/INTEGER/BOOLEAN/JSONB/JSONB`로 방출 — 계획서 수기 SQL과 타입 전부 일치. 계약+metadata를 함께 넣은 GOOD 세트가 워크스페이스 `tsc` exit 0, 계획서의 테스트 케이스가 `tsx --test` 2/2 통과.
- **경로 3**: before 블록 4개가 현재 트리에 **정확히 1회씩** 일치(`count==1`)하고 손 개입 없이 치환됨. 라운드 1에서 고친 테스트 삽입 위치(`:43`/`:44` 사이)도 독립적으로 재확인.
- **경로 7**: 방어선 **셋** 발화 확인 — (a) metadata 키 누락 시 `TS1360`, (b) `"preset"` 제거 시 계획서 테스트 케이스 실패, (c) 키 전체 제거 시 `metadata 정의 누락: settings_defaults_saved`. 내 라운드 4는 (a)(c)만 봤는데 (b)까지 독립적으로 추가됐다.
- **경로 4**: 내가 못 본 것을 하나 더 확인했다 — admin `queries.test.mjs:6`이 `mock.module("@repo/db")`로 자체 3개짜리 배열을 주입하는 **격리된 목**이라 계약이 커져도 안 깨진다. 「admin에 닿지 않는다」 주장의 마지막 구멍이 메워졌다.
- **경로 9**: 마이그레이션 디렉터리명 `20260909000000_user_default_settings` 충돌 없음(현재 최신 `20260826000000`).

**참고(결함 아님, 검증자 판단)**: 수기 `migration.sql`은 컬럼을 선언순으로, prisma `migrate diff`는 알파벳순으로 낸다. 전 컬럼 nullable·무기본이고 `migrate deploy`는 SQL을 그대로 실행하므로 결과 테이블이 동일하다. 계획서가 수기 작성을 명시하고 prisma 산출과의 바이트 일치를 주장하지 않으므로 위생 결함도 아니다.

### 트리 청결 검산 (직접 확인)

`git status --short` = `M apps/web/.claude/settings.local.json` + `?? nul` — 세션 시작 스냅샷과 동일. 하니스는 전부 스크래치패드에만.

**판정: 클린 패스.** 보드에 `검증:` 줄을 기록했다. 다음은 게이트②이며 **소유자만 연다.**
