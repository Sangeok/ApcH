# FEAT-47 — 메인 루프 기록

## 게이트① (2026-09-16)

소유자 직접 발주(pm 미경유) — 세션 지시 "FEAT-47 수행". FEAT-46·FEAT-49 배포 확인 뒤 메인 루프가 다음 개발 항목 1순위로 추천한 항목이다. `계획지시`로 보드에 기록했다.
발주 시점 보드 미결은 0건이다(`보류` FEAT-01 제외). `dev` = `origin/dev`(`d2da959`). 병행 세션은 모두 유휴.

담당은 `main-loop`다 — `packages/db/prisma/schema.prisma` 수정이 web-dev 금지 목록(`.claude/agents/web-dev.md:54` `` - `packages/db/prisma/schema.prisma` 수정 ``)에 있고, DB를 바꾸는 `db:push`·`db:generate`·`db:migrate`(및 `prisma` 직접 호출)도 `:53`이 금지한다. FEAT-38 전례대로 계획·구현 모두 메인 루프가 하고, 검증은 같은 절차(메인 루프 라운드 + `plan-verifier` 독립 패스)를 따른다.

선행 FEAT-46은 완료·배포(Modal v27)됐고 필드명이 확정됐다 — `apps/backend/reference_translation.py:117` `        {**moment, "referenceTranslation": reference_translations[index]}`(값 `str | None`, Korean analyze에서만 키가 실린다). 이 항목은 FEAT-48의 선행이다.

**발주 전 앵커 실측**
- `ClipDraft`: `packages/db/prisma/schema.prisma:163` `model ClipDraft {` ~ `:196` `}`. 후보 AI 텍스트는 `:179` `    clipType       String?`·`:180` `    hook           String?`·`:181` `    payoff         String?`, 스타일은 `:187` `    captionStyle   Json?`. 참고 번역 컬럼은 없다.
- `Clip` 주석(백로그 요구 ③): `:133` `    // 백엔드가 클립마다 생성해 성공 콜백에 싣는 선택 근거다(main.py:1182-1184).` — 가리키는 코드는 이제 `apps/backend/main.py:1172` `                    clip_result["clipType"] = moment.get("type")`~`:1174`이고, 함수는 `:1000` `    def _do_process_video(`다. **같은 주석 `:134`의 자기 인용 `ClipDraft의 동명 필드(아래 :162-164)`도 낡았다** — 실제 `:179-181`. 백로그 ③은 `:133`만 적었다.
- 그 주석 문자열의 사본: 생성 클라이언트 4곳(`packages/db/generated/prisma/schema.prisma`·`index.js`·`edge.js`·`wasm.js`)이 스키마를 품고 있어 `prisma generate`로 따라 바뀐다. 문서 쪽 인용은 `TASK_BACKLOG.md` FEAT-44 「제외」(줄을 `:116`으로 오기 — 11차 감사 어긋남 1)와 FEAT-47 ③, 완료 제안서 `apps/web/docs/proposals/completed/2026-07-28-custom-clip-segments.md`(작성 시점 기록이라 제외).
- 마이그레이션: 최신 디렉터리 `20260909000000_user_default_settings`. `git grep -l "ClipDraft" -- packages/db/prisma/migrations` **0건** — FEAT-38이 찾은 드리프트(`ClipDraft`가 `db:push`로만 존재)가 그대로다. 그때 「후속 항목 후보」로 제시했지만 백로그에 등재되지 않았다.
- 명령: `packages/db/package.json`의 `"db:migrate": "prisma migrate deploy"`·`"db:generate": "prisma migrate dev"`·`"db:generate:client": "prisma generate"`. FEAT-38 구현에서 `db:migrate`는 루트 `.env`를 못 읽어 `P1012`로 실패했고, 실제 적용은 `packages/db`에서 `node --env-file=../../.env ../../node_modules/prisma/build/index.js migrate deploy`였다(`docs/agents/main-loop/FEAT-38.md` 「마이그레이션 적용」).
- `ClipDraft` 타입 소비자(`@repo/db` 경유, `apps/web/src`): `entities/clip-draft/model/types.ts:1`·`entities/uploaded-file/model/types.ts:1`·`widgets/clip-draft-review/model/selection-budget.ts:1`(`Pick`)·`use-clip-draft-review.ts:5`·`ui/_component/ClipDraftCard.tsx:4`·`ui/index.tsx:5`. `apps/admin/src`에는 0건. raw SQL은 `apps/web/src`·`apps/admin/src` 전체에서 `entities/user/api/index.ts:131` `$executeRaw` 한 곳.

### 계획 단계에서 반드시 다룰 것

- **컬럼 정의.** 이름 `referenceTranslation`(FEAT-46 필드명과 동일), `String?`, 기본값·백필 없음. null 의미("번역 없음" — English 업로드·번역 실패·커스텀 클립·기존 행)와 "참고용 — 렌더는 이 값을 쓰지 않는다" 주석(백로그 ②). 모델 안 위치를 근거와 함께 정한다.
- **마이그레이션 SQL은 수기로 쓴다**(FEAT-38과 같은 이유). 디렉터리 이름 관례, `-- AlterTable` 형식, 스키마↔SQL 구조 일치.
- **드리프트와의 결합을 명시한다.** `ClipDraft` 생성 마이그레이션이 히스토리에 없으므로, 빈 DB에 `migrate deploy`를 돌리면 이제는 이 `ALTER TABLE "ClipDraft"`가 "테이블 없음"으로 **실패**한다(지금까지는 성공한 척하고 검토 경로만 죽었다). 프로덕션 적용에는 영향이 없다. 이 사실, 이 항목에서 고치지 않는 이유, 후속 후보 재제시를 계획서에 적는다.
- **명령과 승인.** `prisma migrate dev` 금지 사유를 유지하고, 적용 명령은 FEAT-38 실측 형태로 적는다. 적용 직전 읽기 전용 `migrate status`로 미적용이 이 하나뿐인지 확인하고, 적용은 구현 단계에서 소유자 승인을 따로 받는다.
- **배포 순서.** 새 생성 클라이언트는 `ClipDraft`를 읽을 때 새 컬럼까지 SELECT한다 — 컬럼이 DB에 없는 채 새 클라이언트가 돌면 검토 화면 조회가 깨진다. "적용 → 확인 → 커밋·푸시·배포" 순서와 그 근거를 적는다. 브랜치 푸시만으로 도는 배포(프리뷰)가 같은 DB를 쓰는지도 확인할 수 있으면 적는다.
- **`Clip` 주석 두 인용**(`:133` `main.py` 줄번호, `:134` 자기 줄번호)을 함수명·코드 앵커로 바꾸고 생성 클라이언트 재생성에 태운다(FEAT-44 결정 — 줄번호 인용을 새로 만들지 않는다).
- **타입·쿼리 영향 전수.** 필드가 늘면 `ClipDraft` 객체를 리터럴로 만드는 TS 코드는 컴파일이 깨진다 — 위 소비자 열거로 그런 곳이 없는지, `$executeRaw`가 `ClipDraft`와 무관한지, 드래프트 생성 경로(`createMany` 입력은 선택 필드)가 무영향인지 보인다. 게이트는 루트 형태 `npm run check --workspaces --if-present`(FEAT-38 교훈)와 web·admin 테스트.
- **못 덮는 범위.** 프로덕션 적용 여부, 배포 뒤 기존 검토 화면 무회귀, FEAT-48 전까지 컬럼이 비어 있다는 점.
- **메인 루프 몫(인수 때).** `TASK_BACKLOG.md` FEAT-44 「제외」 줄은 이 항목이 그 주석을 고치므로 정리한다. 계획서는 필요 여부만 적는다.

## 계획서 작성 (2026-09-16, 메인 루프)

`docs/plans/FEAT-47.md` — 고칠 파일 셋(`schema.prisma` 컬럼+`Clip` 주석, 신규 `migrations/20260916000000_clip_draft_reference_translation/migration.sql`, `generated/prisma` 재생성). 컬럼 `referenceTranslation String?`을 `clipType`·`hook`·`payoff` 뒤에 둔다. 적용은 FEAT-38 실측 명령(`node --env-file=../../.env …prisma… migrate deploy`)으로, 적용 → 확인 → 커밋·푸시 순서(`select` 없는 `findMany` 셋이 새 컬럼을 SELECT, `dev` 푸시도 Vercel 빌드). 드리프트 결합(이후 빈 DB `migrate deploy`는 실패로 바뀜)과 후속 후보 재제시를 적었다. 작성 중 추가 관측: `Clip` 주석의 "ClipDraft는 analyzeVideo에서만 만들어진다"도 커스텀 추가(`createCustomClipDraft`) 때문에 부정확 → 주석 교체에 포함. 보드 `계획지시` → `검토대기`(`b943bce`).

## 검증 필수 경로 (카탈로그 대조)

| 경로 | 채택 | 근거 |
| --- | --- | --- |
| 1 인용 전수 대조 | ○ | 전 항목 필수 — schema·migration·web API·backend·agent 정의·선례 기록 인용 30여 곳 |
| 2 스케치 추출·실행 | ○ | prisma 조각 2쌍 + SQL 1. 적용본으로 `prisma validate`·`generate`·web `tsc`(새 생성 타입으로) |
| 3 before/after 기계 적용 | ○ | 기존 파일(`schema.prisma`) before 블록 2 |
| 4 전칭 여집합 | ○ | "그런 조회가 셋", "리터럴 생성·손 SQL 둘 다 없다", "`apps/*` 소스 무변경", "raw SQL 한 곳", "admin 0건" |
| 5 돌연변이 | × | 순수 함수 신설·변경 없음 |
| 6 실제 사건 재생 | × | 외부 신호 해석 없음 |
| 7 음성 시험 | ○ | 계획서가 "새 필드는 생성 입력에서 선택이라 기존 생성 경로가 그대로 컴파일된다"에 기댄다 — 필수로 바꾸면 `tsc`가 정말 그 자리에서 깨지는가(게이트가 장식이 아닌가) |
| 8 실물 렌더 | × | 화면 변경 없음 |
| 9 구조적 아티팩트 | ◎ | schema·migration·생성 파일 변경. SQL과 스키마의 구조 일치를 `migrate diff`로 |

## 검증 1라운드 (2026-09-16) — 편집 라운드

**격리**: `git worktree add --detach scratchpad/wt47 0e7180b`(대상 파일은 계획서 커밋 전후 동일) + `node_modules` 정션 셋(루트·`apps/web`·`packages/db`). 하니스는 스크래치패드 `feat47/`(`apply47.mjs`·`planedit47.mjs`·`schema.head.prisma`), web 전용 `wt47/apps/web/tsconfig47.json`(`@repo/db` → wt의 `packages/db/src/index.ts` — 루트 `node_modules/@repo/db`가 실제 저장소 `packages/db`로 링크돼 있어, 그대로 `tsc`를 돌리면 옛 생성 클라이언트를 본다). Prisma CLI에는 가짜 `DATABASE_URL`·`DATABASE_URL_UNPOOLED`(`127.0.0.1:1`)를 줬다 — DB 접속 없는 명령만 돌렸다. 실제 저장소 `node_modules/.prisma`·`@prisma/client` 최종 수정 시각(2026-08-01 21:58) 전후 불변, 실제 트리 `packages`·`apps/web/src` 변경 0.

**실행한 경로와 결과**
- **3**: before 2블록(`ClipDraft` `:179-182`, `Clip` 주석 `:133-136`)이 wt 스키마에 각 1회 바이트 일치, 손 개입 없이 적용.
- **2·9**: 적용본 `prisma validate` → valid. `migrate diff --from-schema-datamodel <HEAD 사본> --to-schema-datamodel <적용본> --script` → `-- AlterTable` / `ALTER TABLE "ClipDraft" ADD COLUMN     "referenceTranslation" TEXT;` — **계획서 SQL과 바이트 일치**. `prisma generate` EXIT 0 → 생성 파일 **7개** 실내용 변경(`--ignore-cr-at-eol --numstat`: `edge.js` 6/5 · `index-browser.js` 1/0 · `index.d.ts` 37/1 · `index.js` 6/5 · `package.json` 1/1 · `schema.prisma` 15/8 · `wasm.js` 6/5). `index.d.ts`에 `referenceTranslation: string | null`. 새 생성 타입으로 web `tsc --noEmit -p tsconfig47.json` **EXIT 0**.
- **7 음성**: 적용본의 `referenceTranslation String?`을 `String`(필수)으로 바꿔 재생성 → `tsc` **EXIT 2**, 오류가 정확히 두 생성 경로에서 났다 — `entities/clip-draft/api/index.ts(135,7) TS2322`(커스텀 드래프트 `create`), `inngest/functions.ts(930,11) TS2345`(`createClipDraftsBulk` 매핑). 원복·재생성 확인. 계획서가 기대는 "선택 필드라 기존 생성 경로 무영향"은 참이고, 게이트(`tsc`)가 그 결합을 실제로 지킨다.
- **4 여집합**: `apps/web/src`의 `ClipDraft` 모델 호출 전수 8개 — `createMany`(`:24`)·`findMany`(`:35`)·`findFirst`+`select`(`:46`)·`update`(`:80`)·`findMany`(`:98`)·`aggregate`(`:127`)·`create`+`select {id}`(`:134`)·`uploaded-file/api` `findMany`(`:357`). 관계 `include`/`select`로 `clipDrafts`를 읽는 곳 0(`clipDrafts:`는 타입·테스트·클라이언트 상태뿐). `apps/admin`·`scripts`·`packages/db/src` 0. raw SQL `entities/user/api/index.ts:131` 한 곳(`UPDATE "User"`).
- **1 인용**: `.claude/agents/web-dev.md:53·54`, `reference_translation.py:117`, `schema.prisma:12·133·134·163·179-181·187·196`, `main.py:1000·1172-1174`, `functions.ts:929·930-947·938-940`, `clip-draft/api/index.ts:17·35·46·80·98·117·134`, `uploaded-file/api/index.ts:357`, `user/api/index.ts:131`, 선례 migration SQL, `vercel.json`, `package.json` `postinstall`, `0e7180b` 커밋 상태(Vercel 두 개 pending — `dev` 푸시도 빌드), FEAT-38 기록·계획서 절 이름 — 대조.

**결함 3 — 전부 문서 위생, 통합 편집 1회(`planedit47.mjs`, 산문만 · 코드 블록 불변)**
- **H1 (경로 4)**: 「순서」가 "`select` 없는 조회가 셋"이라 했고 표가 `update`(`:80`)를 "무관"으로 적었다. `update`도 `select`가 없어 갱신된 행 전체를 돌려받으므로 새 컬럼을 읽는다 — 쿼리는 **넷**이다. 결론(적용 → 푸시 순서)은 그대로라 구현 영향은 없다. → 넷으로 정정, 편집 저장 경로 추가, 표 행 정정.
- **H2 (경로 1)**: "확정 번역을 기각한 결정은 `TASK_BACKLOG.md` FEAT-48의 원천 대화(FEAT-46 결정 ②)에 있다" — 현행 백로그에 그 결정 문장이 없다(「확정 번역」 0건). FEAT-46 항목이 완료로 빠지면서 사라졌고, `git show 227cb7f^:TASK_BACKLOG.md`의 FEAT-46 「결정(대화에서 확정)」 ②에 있다. 현행은 FEAT-48 요구 ② 「(렌더는 따로 번역한다)」(`TASK_BACKLOG.md:42`). → 출처 정정.
- **H3 (경로 2)**: generate가 바꾸는 파일을 다섯(사본 넷+`index.d.ts`)으로 적었으나 실제 일곱(`index-browser.js` 스칼라 enum, `package.json` 스키마 해시 이름 추가). → 7파일로 정정.

편집 커밋 `d70dc07`. 편집이 있었으므로 2라운드 무편집 재실행.

## 검증 2라운드 (2026-09-16) — 무편집, 무소득

편집한 계획서(`d70dc07`)를 처음부터 끝까지 다시 읽고, wt47을 `0e7180b`로 되돌린 뒤(`git checkout -- packages/db` + 임시 마이그레이션 디렉터리 삭제) 같은 하니스로 다시 적용·실행했다. 계획서는 고치지 않았다.

- **1 인용**: 편집으로 새로 들어간 인용 — `clip-draft/api/index.ts:80`(「순서」·표), `git show 227cb7f^:TASK_BACKLOG.md`의 FEAT-46 「결정(대화에서 확정)」 ②(확정 번역 기각 문장 실재), `TASK_BACKLOG.md:42` 「(렌더는 따로 번역한다)」, 생성 파일 일곱 이름 — 일치. 나머지 인용은 1라운드 대조 그대로(해당 문장 불변).
- **2·3·9**: 코드 블록 5개(펜스 10) — 편집은 산문뿐이라 1라운드와 같다. before 2블록 각 1회 바이트 일치, 적용본 `validate` valid, `migrate diff` → 계획서 SQL과 바이트 일치, `generate` EXIT 0 · 변경 7파일(1라운드와 같은 numstat), web `tsc -p tsconfig47.json` **EXIT 0**.
- **4**: 편집이 만든 전칭 "그런 쿼리가 넷" — 1라운드 8호출 전수 열거로 성립(`select` 없음: `update :80`·`findMany :35·:98·uploaded-file :357` / 결과 없음·제한: `createMany :24`(count)·`create :134`(`select {id}`)·`findFirst :46`(`select`)·`aggregate :127`(`_max.index`)).
- **7**: 대상 코드 블록과 그 블록이 기대는 생성 경로 코드가 1라운드 이후 바뀌지 않아 결과가 같다(재검증은 계획서 코드나 인용 코드가 바뀔 때만 — 보드 안내).

실제 트리 `packages`·`apps/web/src` 변경 0, 실제 `node_modules/.prisma` 수정 시각 불변. → `plan-verifier` 1사이클 디스패치(브리핑은 항목ID, 계획서 경로, 필수 경로 1·2·3·4·7·9만).

## plan-verifier 1사이클 (2026-09-16) — 결함 0건, 실행하지 못한 경로 없음 → 클린 패스

- **브리핑**: 항목ID, 계획서 경로, 필수 경로 1·2·3·4·7·9만 전달했다. 검증자가 계약 준수를 확인했다(세션 환경 스냅샷의 커밋 제목 언급은 브리핑이 아니라고 스스로 구분).
- **경로별 증거 실질**
  - 1: `schema.prisma`(`:12`·`:133-136`·`:163`·`:179-182`·`:196`), `reference_translation.py:117`, `main.py:1000`·`:1172-1174`, `functions.ts:929`·`:938`·`:940`·`:930-947`, `clip-draft/api/index.ts`(17·35·46·80·98·117·134), `uploaded-file/api/index.ts:357`, `user/api/index.ts:131`, 선례 SQL, `vercel.json`, `package.json`, 타입 소비자 6곳, `web-dev.md:53-54`, FEAT-38 기록(`:180`·`:204`·`:222`), 커밋 `227cb7f` — 전부 일치. 계획서가 낡았다고 지목한 두 인용(`main.py:1182-1184`→`:1172-1174`, `:162-164`→`:179-181`)도 독립 재확인.
  - 2: 계획서 바이트에서 블록 추출·조립한 적용본 `prisma validate` valid, `prisma generate` 성공(v6.19.1).
  - 3: before 두 블록 라이브 스키마에 각 1회 바이트 일치, 손 개입 없이 치환.
  - 4: 마이그레이션의 `ClipDraft` 0건, `clipDraft.*` 8곳 전수 — 새 컬럼을 읽는 넷(`:35`·`:80`·`:98`·`uploaded-file :357`)과 안 읽는 넷, raw SQL 한 곳, admin·`.mjs` 0건, 타입 소비자 6곳에 완전 객체 리터럴 없음.
  - 7: HEAD·AFTER 스키마로 각각 클라이언트를 생성해 대조 — AFTER 결과 타입 `referenceTranslation: string | null`, 생성 입력 4종(`ClipDraftCreateInput`·`UncheckedCreateInput`·`CreateManyInput`·`CreateManyUploadedFileInput`) 모두 선택. 타입이 실제로 바뀌어 `tsc` 게이트가 실검사임을 확인.
  - 9: `migrate diff` 출력이 수기 SQL과 바이트 일치(`ADD COLUMN` 뒤 공백 5칸까지), 생성 트리 diff로 내용이 바뀌는 파일 정확히 7개 — 계획서 열거와 일치.
- **[실행하지 못한 경로]**: 없음. 검증자가 경로 7의 하위 항목 하나 — "컬럼이 없는 실 DB에서 `select` 없는 쿼리가 `column does not exist`로 깨지는가"의 DB 레벨 재현 — 는 라이브 Neon 접속이 필요해 읽기 전용 패스에서 못 했다고 밝혔다.
- **범위 메모(판정 근거의 투명성)**: 이 항목의 경로 7 채택 근거는 "새 필드가 생성 입력에서 선택이라 기존 생성 경로가 컴파일된다"에 대한 음성 시험이었고(위 「검증 필수 경로」 표), 그 하위는 검증자(생성물 대조)와 메인 루프 1라운드(필수화 시 `tsc` 두 곳 실패)가 모두 실행했다. DB 레벨 순서 재현은 채택 근거 밖이고 계획서가 「순서」로 명시한 운영 절차라, 구현 단계의 "적용 → 확인 → 커밋·푸시"가 그대로 지킨다. 검증자 보고가 필수 경로를 전부 실행했고 미실행 경로가 없으므로 무소득 보고로 판정한다.
- **트리 청결 직접 확인**(`git status`): `apps`·`docs`·`packages`·보드·백로그 변경 0(무관한 `settings.local.json`·`nul`만). 실제 저장소 `node_modules/.prisma`·`@prisma/client` 수정 시각 2026-08-01 21:58 불변, `packages/db/generated/prisma` 2026-09-14 21:24 불변 — 검증자의 `generate`는 스크래치패드 출력만 썼다.
- **판정**: 독립 무편집 무소득 패스 1회 → **클린 패스**. 보드에 `검증:` 줄을 기록했고 status는 `검토대기` 그대로다(게이트② `구현승인`은 소유자만 연다).
- **반영된 결함 분류**: 위생 3(H1 새 컬럼을 읽는 쿼리 수·표, H2 결정 출처, H3 생성 파일 수). 구현 영향 0.
- **구현 단계 고지**: 게이트②를 열어도 **마이그레이션 적용은 그 명령 직전에 소유자 승인을 따로 받는다**(계획서 「적용」). 격리 worktree `scratchpad/wt47`에 계획서 적용본이 남아 있어 인수 때 diff ↔ 스케치 대조 기준으로 쓴다.

## 게이트② (2026-09-16) — 구현승인

소유자 메시지 "FEAT-47 구현승인"으로 게이트②가 열렸다. 보드 status `검토대기` → `구현승인`. `검증:` 줄은 그대로 둔다 — 클린 패스 뒤 계획서는 한 글자도 바뀌지 않았다(판정 유효).

- 담당은 메인 루프다(계획서 머리말 — `.claude/agents/web-dev.md:53-54`가 `schema.prisma` 수정과 prisma 실행을 dev 로스터 금지 목록에 둔다).
- **마이그레이션 적용(`migrate deploy`)은 이 승인에 포함되지 않는다.** 계획서 「적용 — 명령·승인·순서」대로 그 명령 직전에 소유자 승인을 따로 받는다. 게이트②가 여는 것은 파일 작성(스키마·마이그레이션 SQL·생성 클라이언트 재생성)과 읽기 전용 게이트 실행까지다.
- 실행 순서: 스키마 2곳 편집 → 마이그레이션 SQL 신규 → `db:generate:client` → 구조 대조(`migrate diff`) → `check`·`test` 게이트 → **소유자 승인** → `migrate status` → `migrate deploy` → 적용 후 확인(`migrate status`·`db pull --print`) → 커밋·푸시.

## 구현·적용 (2026-09-16) — 메인 루프 직접 수행

계획서 「고칠 파일」 3항과 「적용 — 명령·승인·순서」를 그대로 따랐다. 구현 커밋 `71bf498`(9파일).

### 파일

- `packages/db/prisma/schema.prisma` — `ClipDraft`에 주석 5줄 + `referenceTranslation String?`(`payoff`와 `selected` 사이), `Clip` 주석의 낡은 인용 둘을 함수명·모델명 앵커로 교체. HEAD^ 대비 바뀐 줄은 **추가 11 / 삭제 4**뿐이고 전부 이 두 곳이다(전수 열거로 확인).
- `packages/db/prisma/migrations/20260916000000_clip_draft_reference_translation/migration.sql` — 신규. 계획서 SQL 블록과 **바이트 동일**. 파일 끝은 기존 마이그레이션 최근 3건과 같은 `;`+줄바꿈 하나다 — `migrate diff --script` 출력은 끝에 빈 줄이 하나 더 붙어 그 1바이트만 다르다(전수: 9개 중 최근 3개가 `;
`, 오래된 CRLF 파일 둘은 `

`).
- `packages/db/generated/prisma/` — `npm run db:generate:client -w @repo/db`(EXIT 0). 내용이 바뀐 파일 **정확히 7개**로 계획서 예고와 일치(`edge.js`·`index-browser.js`·`index.d.ts`·`index.js`·`package.json`·`schema.prisma`·`wasm.js`). `--ignore-cr-at-eol` numstat이 같아 CRLF 찌꺼기는 0. 손으로 고치지 않았다.

`apps/*` 소스는 한 줄도 고치지 않았다 — 계획서 「타입·쿼리 영향 전수」의 예측 그대로다.

### 게이트 (메인 루프가 직접 실행)

| 명령 | 결과 |
| --- | --- |
| `prisma validate` | The schema at prismaschema.prisma is valid |
| `migrate diff --from-schema-datamodel <HEAD 사본> --to-schema-datamodel <현재>` (DB 미접속) | 수기 SQL과 같은 `ALTER TABLE "ClipDraft" ADD COLUMN     "referenceTranslation" TEXT;` |
| `npm run db:generate:client -w @repo/db` | EXIT 0 · 7파일 |
| `npm run check --workspaces --if-present` | EXIT 0 (admin 단독 재실행도 EXIT 0) |
| `npm test -w apps/web` | 162/0 |
| `npm test -w apps/admin` | 334/0 |

생성 타입 실측: `index.d.ts`에 `referenceTranslation` 37회 — 결과 타입 `string | null`, `ClipDraftOmit` 목록, `FieldRef`, 필터·정렬·집계, 스칼라 enum(`index-browser.js:220`). 생성 입력에서는 선택이라 기존 생성 경로가 그대로 컴파일된다(`check`가 실검사였음은 검증 단계 경로 7에서 확인).

### 적용 — 소유자 승인 뒤 (`packages/db`에서)

소유자 지시 "적용 진행". 계획서 표의 세 명령을 그 순서로 돌렸다.

- 적용 전 `migrate status` — 대상 Neon `neondb`(`ep-wild-pine-a4avujag.us-east-1.aws.neon.tech`), 미적용은 **이 한 건뿐**.
- `migrate deploy` — EXIT 0. `Applying migration 20260916000000_clip_draft_reference_translation` → `All migrations have been successfully applied.`
- 적용 후 `migrate status` — `Database schema is up to date!`
- `db pull --print`(파일을 쓰지 않는다) — `model ClipDraft` 안에 `referenceTranslation String?` 1건. 내성 결과에서는 `updatedAt` 뒤에 온다(ADD COLUMN이라 물리 순서가 마지막이다).
- **순서 준수**: 적용 → 확인 → 커밋·푸시. 새 생성 클라이언트가 `dev` 푸시로 Vercel 빌드에 실리기 전에 컬럼이 DB에 있었다.

### 인수 — 다섯 조건 (메인 루프가 직접 재현)

1. **변경 파일 ↔ 계획서 「고칠 파일」**: 3항 그대로. 커밋 스테이징을 9경로로 명시하고 스테이징 수를 9로 검산해 다른 변경이 섞이지 않았음을 확인했다(무관한 `settings.local.json`·`nul`은 그대로 둔다).
2. **diff ↔ 「구현 스케치」**: 계획서 펜스 블록 5개를 기계 추출해 대조 — before 2블록은 HEAD^에 각 1회·현재 0회, after 2블록은 현재 각 1회, SQL 블록은 파일 전문과 바이트 동일. 검증 단계의 격리 worktree `wt47`(계획 적용본)의 스키마와 `diff` 결과도 **동일**.
3. **검증 명령 직접 재실행**: 위 게이트 표 — 전부 내가 돌린 출력이다.
4. **백로그 제거**: `TASK_BACKLOG.md`에서 FEAT-47 항목 제거. 함께 FEAT-44의 「제외」(스키마 주석을 "다음에 스키마를 바꾸는 항목"으로 넘긴 줄)를 이 항목이 처리했다고 정리했다 — 계획서 「메인 루프 몫(인수 때)」.
5. **상세 기록 실재**: 이 문서.

### 원장

`docs/release-checks.md`에 FEAT-47 절 등재. 첫 줄(마이그레이션이 프로덕션 Neon에 실제 적용됐는가)은 위 적용 후 확인으로 **등재와 동시에 닫았다**. 나머지 둘은 배포 뒤 실물에서만 판정된다.

### 범위 밖 의존 — 소유자에게 제시할 후속 후보

계획서 「⚠️ 마이그레이션 히스토리 드리프트」: `ClipDraft`를 만드는 마이그레이션이 히스토리에 없다(`db:push`로만 생긴 테이블). 이 항목이 들어가면서 **빈 DB에 `migrate deploy`를 돌리면 이 마이그레이션에서 `relation "ClipDraft" does not exist`로 실패한다** — 프로덕션(테이블 존재)에는 영향이 없다. FEAT-38 때 제시했다가 등재되지 않았고, 이번 인수 보고에서 다시 제시한다. 등재는 소유자 승인 뒤에만 한다.
