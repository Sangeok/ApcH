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

`docs/plans/FEAT-47.md` — 고칠 파일 셋(`schema.prisma` 컬럼+`Clip` 주석, 신규 `migrations/20260916000000_clip_draft_reference_translation/migration.sql`, `generated/prisma` 재생성). 컬럼 `referenceTranslation String?`을 `clipType`·`hook`·`payoff` 뒤에 둔다. 적용은 FEAT-38 실측 명령(`node --env-file=../../.env …prisma… migrate deploy`)으로, 적용 → 확인 → 커밋·푸시 순서(`select` 없는 `findMany` 셋이 새 컬럼을 SELECT, `dev` 푸시도 Vercel 빌드). 드리프트 결합(이후 빈 DB `migrate deploy`는 실패로 바뀜)과 후속 후보 재제시를 적었다. 작성 중 추가 관측: `Clip` 주석의 "ClipDraft는 analyzeVideo에서만 만들어진다"도 커스텀 추가(`createCustomClipDraft`) 때문에 부정확 → 주석 교체에 포함. 보드 `계획지시` → `검토대기`.
