# FEAT-47 — `ClipDraft`에 참고 번역 컬럼 추가 (마이그레이션 1회)

> 담당: main-loop — dev 로스터의 쓰기 범위 밖이다. `.claude/agents/web-dev.md:54` `` - `packages/db/prisma/schema.prisma` 수정 ``이 금지 목록에 있고, `:53`이 `db:push`·`db:generate`·`db:migrate`(및 `prisma` 직접 호출) 실행도 금지한다. FEAT-38 전례를 따른다.
> 선행: FEAT-46(완료·배포) · 이 항목은 FEAT-48의 선행이다.

## 현재 동작

FEAT-46이 배포된 뒤(Modal v27) Korean analyze 콜백의 moment마다 참고 번역이 실린다 — `apps/backend/reference_translation.py:117` `        {**moment, "referenceTranslation": reference_translations[index]}`. 값은 `str | None`이고, Korean이 아닌 업로드에는 키 자체가 없다.

web은 그 값을 받을 자리가 없다. 검토 후보를 담는 `ClipDraft`(`packages/db/prisma/schema.prisma:163` `model ClipDraft {` ~ `:196` `}`)가 AI 텍스트로 가진 것은 셋뿐이다 — `:179` `    clipType       String?`, `:180` `    hook           String?`, `:181` `    payoff         String?`. 드래프트 저장 매핑도 그 셋까지만 옮긴다(`apps/web/src/inngest/functions.ts:938` `            clipType: moment.clipType ?? null,`~`:940` `            payoff: moment.payoff ?? null,`). 그래서 지금은 백엔드가 만든 번역이 전부 버려진다.

같은 스키마의 `Clip` 주석 두 인용이 낡았다(백로그 요구 ③).
- `:133` `    // 백엔드가 클립마다 생성해 성공 콜백에 싣는 선택 근거다(main.py:1182-1184).` — 그 코드는 이제 `apps/backend/main.py:1172` `                    clip_result["clipType"] = moment.get("type")`~`:1174` `                    clip_result["payoff"] = moment.get("payoff")`이고, 함수는 `:1000` `    def _do_process_video(`다.
- `:134` `    // ClipDraft의 동명 필드(아래 :162-164)와 같은 값이지만, ClipDraft는 analyzeVideo` — 동명 필드는 이제 `:179-181`이다. 같은 줄의 "ClipDraft는 analyzeVideo에서만 만들어진다"도 정확하지 않다 — 검토 화면의 커스텀 추가(`apps/web/src/fsd/entities/clip-draft/api/index.ts:117` `export async function createCustomClipDraft(`)도 드래프트를 만든다. 주석이 말하려는 요점("auto 경로 클립에는 대응 드래프트가 없다")은 그대로 참이다.

## 문제

참고 번역을 담을 컬럼이 없다. 이 항목은 **저장소만 만든다** — 콜백 계약·정규화기·저장 매핑·카드 표시는 FEAT-48 몫이다. 그래서 인수 기준은 "화면이 달라졌는가"가 아니라 **"컬럼이 FEAT-48이 요구하는 모양으로 DB와 생성 클라이언트에 존재하고, 기존 것이 하나도 안 깨졌는가"**다.

## 고칠 파일

| # | 파일 | 변경 |
| --- | --- | --- |
| 1 | `packages/db/prisma/schema.prisma` | `ClipDraft`에 `referenceTranslation String?` 1컬럼 + 주석, `Clip` 주석 두 인용 교체 |
| 2 | `packages/db/prisma/migrations/20260916000000_clip_draft_reference_translation/migration.sql` | 신규 |
| 3 | `packages/db/generated/prisma/**` | `npm run db:generate:client -w @repo/db`(= `prisma generate`) 재생성 — 손으로 고치지 않는다 |

`apps/*` 소스는 고치지 않는다(아래 「타입·쿼리 영향 전수」).

## 구현 스케치

### 1. `schema.prisma` — `ClipDraft` 컬럼

before (`:179`~`:182`):

```prisma
    clipType       String?
    hook           String?
    payoff         String?
    selected       Boolean  @default(true)
```

after:

```prisma
    clipType       String?
    hook           String?
    payoff         String?
    // Korean analyze의 참고 번역 — FEAT-46이 analyze 콜백 moment에 싣는 referenceTranslation.
    // 검토 화면에서 영어 원문 옆에 뜻을 보여주는 읽기 보조일 뿐이다. 렌더는 이 값을 쓰지 않고
    // 자막을 따로 번역한다(apps/backend/main.py create_korean_subtitles_with_ffmpeg).
    // null = 번역 없음: English 업로드·번역 실패·커스텀 클립·이 컬럼 이전 행.
    // 원문은 AI 구간(aiStartSeconds~aiEndSeconds) 기준이라 사용자가 구간을 옮기면 낡는다.
    referenceTranslation String?
    selected       Boolean  @default(true)
```

**위치**: `clipType`·`hook`·`payoff` 바로 뒤다. 넷 다 같은 analyze 콜백 moment에서 오는 AI 원안 텍스트이고 사용자가 편집하지 않는다. 그 아래 `selected`·`captionStyle`은 사용자 편집값이라 섞지 않는다.

**타입과 이름**: `String?`, 기본값 없음. 이름은 FEAT-46 콜백 필드와 같은 `referenceTranslation`이다 — FEAT-48의 저장 매핑이 `moment.referenceTranslation ?? null` 한 줄이 되고, 이름 변환 층이 생기지 않는다.

**주석이 "렌더는 쓰지 않는다"를 적는 이유**(백로그 요구 ②): 렌더가 쓰는 값으로 오독하면 "검토 번역 = 최종 자막"을 기대하게 되고, 미리보기-실렌더 일치 논의가 되살아난다. 확정 번역(렌더가 재사용)을 기각한 결정은 FEAT-46 백로그 항목의 「**결정(대화에서 확정)**」 ②였고, 그 항목은 FEAT-46 완료로 백로그에서 빠졌다(`git show 227cb7f^:TASK_BACKLOG.md`의 FEAT-46 항목). 현행 백로그에는 FEAT-48 요구 ②의 「(렌더는 따로 번역한다)」로 남아 있다.

### 2. `schema.prisma` — `Clip` 주석 두 인용

before (`:133`~`:136`):

```prisma
    // 백엔드가 클립마다 생성해 성공 콜백에 싣는 선택 근거다(main.py:1182-1184).
    // ClipDraft의 동명 필드(아래 :162-164)와 같은 값이지만, ClipDraft는 analyzeVideo
    // 에서만 만들어지므로 auto 경로 클립에는 대응 행이 없다 — 여기 저장하지
    // 않으면 유실된다.
```

after:

```prisma
    // 백엔드가 클립마다 생성해 성공 콜백에 싣는 선택 근거다
    // (apps/backend/main.py _do_process_video — clip_result["clipType"]·["hook"]·["payoff"]).
    // ClipDraft의 동명 필드(아래 model ClipDraft)와 같은 값이지만, ClipDraft는 검토 경로
    // (analyzeVideo의 후보·검토 화면의 커스텀 추가)에서만 만들어지므로 auto 경로 클립에는
    // 대응 행이 없다 — 여기 저장하지 않으면 유실된다.
```

줄번호 대신 함수명·키 이름·모델 이름으로 가리킨다 — FEAT-44 결정(교차 파일 줄번호 인용은 원천이 한 줄만 바뀌어도 조용히 낡는다)을 따른다. 두 번째 인용 `:162-164`는 같은 파일 안인데도 모델이 늘면서 이미 17줄 밀렸다.

### 3. 마이그레이션 (신규 파일 전문)

`packages/db/prisma/migrations/20260916000000_clip_draft_reference_translation/migration.sql`

```sql
-- AlterTable
ALTER TABLE "ClipDraft" ADD COLUMN     "referenceTranslation" TEXT;
```

형식은 같은 모양의 선례를 그대로 따른다 — `packages/db/prisma/migrations/20260826000000_clip_subtitle_status/migration.sql`의 `-- AlterTable` + `ALTER TABLE "Clip" ADD COLUMN     "subtitleStatus" TEXT;`(nullable `String?` 1컬럼 → `TEXT`, 스키마 한정 없는 테이블 이름). 디렉터리 이름은 날짜 + `000000` + snake_case 관례이고, 현재 최신은 `20260909000000_user_default_settings`라 충돌이 없다.

nullable·무기본이라 **기존 행 백필이 없고** 테이블 재작성 없이 카탈로그만 바뀐다.

**파일은 수기로 쓴다. `prisma migrate dev`로 만들지 않는다** — 아래 「드리프트」.

### 4. 생성 클라이언트 재생성

`npm run db:generate:client -w @repo/db`(= `prisma generate`, DB에 접속하지 않는다). `packages/db/generated/prisma`는 git 추적 대상이고, **7파일**이 실제 내용으로 바뀐다 — 스키마를 품은 사본 넷(`schema.prisma`·`index.js`·`edge.js`·`wasm.js`), 타입(`index.d.ts` — `ClipDraft` 결과 타입에 `referenceTranslation: string | null`, 생성 입력에서는 선택 필드), 스칼라 필드 enum(`index-browser.js`), 스키마 해시가 든 패키지 이름(`package.json`). 그 diff는 커밋 대상이다. `git diff --ignore-cr-at-eol --numstat`이 0인 파일만 CRLF 찌꺼기다(FEAT-38 구현 기록과 같은 판정).

## ⚠️ 마이그레이션 히스토리 드리프트와의 결합

`ClipDraft`를 만드는 마이그레이션이 히스토리에 없다 — `git grep -l "ClipDraft" -- packages/db/prisma/migrations`가 0건이다. 이 테이블은 `db:push`로만 존재한다(FEAT-38 계획서 「마이그레이션 히스토리 드리프트」가 처음 기록했고, 그 뒤 해소되지 않았다).

그래서:
- **`prisma migrate dev`(= `npm run db:generate -w @repo/db`)를 쓰면 안 된다.** 드리프트를 검출하고 데이터베이스 리셋을 제안한다 — 대상이 프로덕션 Neon이면 데이터 손실 경로다. 적용은 드리프트를 검사하지 않는 `migrate deploy`로 한다.
- **이 마이그레이션은 히스토리를 한 단계 더 재현 불가능하게 만든다.** 빈 DB에 `migrate deploy`를 돌리면 지금까지는 모두 성공하고 `ClipDraft`만 없는 채 끝났다(검토 경로가 조용히 죽음). 이 파일이 들어가면 그 자리에서 `relation "ClipDraft" does not exist`로 **실패한다**. 프로덕션(테이블이 이미 있음)에는 영향이 없다. 이 항목에서 고치지 않는 이유는 FEAT-38과 같다 — 드리프트 해소는 `ClipDraft` 생성 마이그레이션을 소급 작성하고 기적용 표시하는 별개 작업이며, 잘못하면 프로덕션 스키마를 건드린다. 실패가 오히려 드리프트를 조용히 묻어 두지 않는다는 점에서 지금보다 나쁘지 않다.
- **후속 후보로 다시 제시한다**(「범위 밖 의존」).

## 적용 — 명령·승인·순서

**Neon Postgres를 실제로 바꾸는 명령이다. 구현 단계에서 적용 직전 소유자 승인을 따로 받는다.**

`npm run db:migrate`는 이 저장소에서 그대로 돌지 않는다 — `packages/db`에서 도는 Prisma CLI가 루트 `.env`를 읽지 못해 `P1012 Environment variable not found: DATABASE_URL_UNPOOLED`로 실패한다(`docs/agents/main-loop/FEAT-38.md` 「마이그레이션 — 적용 전 상태」 실측, 스키마 `:12` `    directUrl = env("DATABASE_URL_UNPOOLED")`). FEAT-38이 실제로 적용한 형태를 쓴다. 전부 `packages/db`에서:

| 단계 | 명령 | 성격 |
| --- | --- | --- |
| 적용 전 확인 | `node --env-file=../../.env ../../node_modules/prisma/build/index.js migrate status` | 읽기 전용. 대상 호스트와 **미적용이 `20260916000000_clip_draft_reference_translation` 하나뿐**인지 본다 |
| 적용 | `node --env-file=../../.env ../../node_modules/prisma/build/index.js migrate deploy` | DB 변경 — 소유자 승인 뒤 |
| 적용 후 확인 | `… migrate status` → `Database schema is up to date!` / `… db pull --print` → `model ClipDraft` 안에 `referenceTranslation String?` | 읽기 전용(`--print`는 파일을 쓰지 않는다) |

**순서: 적용 → 확인 → 커밋·푸시 → `main` 합류.** 코드보다 컬럼이 먼저여야 한다.
- 새 생성 클라이언트는 `select` 없는 `ClipDraft` 쿼리에서 스칼라 컬럼을 전부 고르므로 `referenceTranslation`도 읽는다. 그런 쿼리가 넷이다 — 갱신된 행을 돌려받는 `select` 없는 `update` 하나(`apps/web/src/fsd/entities/clip-draft/api/index.ts:80` `  return getClient(options?.tx).clipDraft.update({`, 검토 카드 편집 저장)와 `findMany` 셋: `apps/web/src/fsd/entities/clip-draft/api/index.ts:35` `  return getClient(options?.tx).clipDraft.findMany({`(`listClipDraftsForAttempt`), `:98` `  const drafts = await db.clipDraft.findMany({`(`getSelectedRenderMomentsForAttempt`, 렌더 디스패치), `apps/web/src/fsd/entities/uploaded-file/api/index.ts:357` `      ? await db.clipDraft.findMany({`(업로드 상세의 드래프트). 컬럼이 DB에 없는 채 새 클라이언트가 돌면 검토 화면·편집 저장·렌더 디스패치가 `column does not exist`로 깨진다.
- `dev` 푸시도 Vercel 빌드를 돌린다(`0e7180b`의 커밋 상태에 `Vercel – apc-h`·`Vercel – apch-admin`이 붙는다). 그 프리뷰가 같은 DB를 쓰는지는 이 계획에서 확인하지 않았다 — 그래서 **푸시 전에** 적용한다.
- 배포 파이프라인은 마이그레이션을 자동 적용하지 않는다 — `apps/web/vercel.json`에 빌드 커맨드 오버라이드가 없고(`"framework": "nextjs"`, `"regions": ["icn1"]`뿐), `packages/db/package.json`의 `"postinstall": "prisma generate"`는 클라이언트 생성뿐이다.

**되돌리기**(쓸 일이 생기면): 컬럼이 nullable이고 FEAT-48 전까지 아무도 쓰지 않으므로 `ALTER TABLE "ClipDraft" DROP COLUMN "referenceTranslation";`로 데이터 영향 없이 걷어낼 수 있다. 다만 `_prisma_migrations`의 적용 기록이 남으므로 다시 적용하려면 그 기록도 정리해야 한다 — 되돌리기를 실제로 할 때 그 절차를 소유자와 정한다.

## 타입·쿼리 영향 전수 — `apps/*` 소스를 고치지 않아도 되는 이유

필드가 늘면 `ClipDraft` 타입에 `referenceTranslation: string | null`이 더해진다. 깨질 수 있는 곳은 "그 타입의 객체를 리터럴로 만드는 TS 코드"와 "컬럼 목록을 손으로 쓴 SQL"이다. 둘 다 없다.

| 사용처 | 형태 | 영향 |
| --- | --- | --- |
| `apps/web/src/inngest/functions.ts:929` `        await createClipDraftsBulk(` → `entities/clip-draft/api/index.ts:17` `  data: Prisma.ClipDraftCreateManyInput[],` | 생성 입력 | 새 필드는 입력 타입에서 선택이다 — 기존 매핑(`:930-947`) 그대로 컴파일. FEAT-48이 `referenceTranslation`을 더한다 |
| `entities/clip-draft/api/index.ts:134` `    return tx.clipDraft.create({` | 커스텀 드래프트 생성 | 선택 필드 — 생략 시 null(의도: 커스텀 클립은 번역 없음) |
| `:80` `  return getClient(options?.tx).clipDraft.update({` | 편집 저장(`select` 없음) | 입력 쪽은 무관. 갱신된 행 전체를 돌려받으므로 새 컬럼을 읽는다 — 위 「순서」의 이유 |
| `:46` `  return db.clipDraft.findFirst({` | 명시 `select` | 새 컬럼을 고르지 않는다 |
| `:35`·`:98`·`uploaded-file/api/index.ts:357` | `select` 없는 `findMany` | 새 필드가 결과에 실린다(값 null). 위 「순서」의 이유 |
| `ClipDraft` 타입 소비자 — `entities/clip-draft/model/types.ts:1`·`entities/uploaded-file/model/types.ts:1`·`widgets/clip-draft-review/model/selection-budget.ts:1`(`Pick<ClipDraft, …>`)·`use-clip-draft-review.ts:5`·`ui/_component/ClipDraftCard.tsx:4`·`ui/index.tsx:5` | 타입 재수출·props·`Pick` | 리터럴 생성이 없어 필드 추가로 깨지지 않는다. 서버→클라이언트 전달도 `string \| null`이라 직렬화 문제가 없다 |
| raw SQL — `apps/web/src`·`apps/admin/src` 전체에서 `entities/user/api/index.ts:131` `  return getClient(options?.tx).$executeRaw` 한 곳 | `UPDATE "User"` | `ClipDraft` 무관 |
| `apps/admin/src` | `ClipDraft` 0건 | 무관 |
| `apps/backend` | Prisma를 쓰지 않는다 | 무관 |

## 테스트 · 게이트

| 명령 | 지키는 것 |
| --- | --- |
| `npm run db:generate:client -w @repo/db` | 생성 클라이언트 재생성, EXIT 0 |
| `npm run check --workspaces --if-present` | web·admin의 `verify:fsd`·ESLint·`tsc` — 새 타입으로 전 소비자 컴파일. `@repo/db`에는 `check` 스크립트가 없어 `--if-present`가 필요하다(FEAT-38 구현 기록, 루트 `package.json`의 `"check": "npm run check --workspaces --if-present"`) |
| `npm test -w apps/web` · `npm test -w apps/admin` | 기존 테스트 수·통과 불변(이 항목은 테스트를 더하지 않는다 — 순수 로직이 없다) |
| 구조 대조 | 적용 전: HEAD 스키마 → 새 스키마의 `prisma migrate diff --from-schema-datamodel … --to-schema-datamodel … --script`(DB 미접속)가 위 SQL과 같은 컬럼·타입(`"referenceTranslation" TEXT`)을 방출하는지. 적용 후: `db pull --print`의 `ClipDraft` |

## 못 덮는 범위

- 마이그레이션이 프로덕션 Neon에 실제로 적용됐는지 — 구현 단계의 적용 후 확인(`migrate status`·`db pull --print`)이 닫는다.
- 새 클라이언트 배포 뒤 기존 검토 화면(드래프트 목록)·렌더 디스패치가 그대로 도는지 — 배포 후 실제 `review_pending` 업로드로 확인한다.
- 컬럼이 실제로 채워지는지 — 이 항목에서는 확인할 수 없다. FEAT-48이 저장 매핑을 붙이기 전까지 모든 행이 null이다.

## 범위 밖 의존

- **FEAT-48**(백로그 등재됨): 콜백 계약 타입 둘·`normalizeAnalyzedMoment`·`createClipDraftsBulk` 매핑·검토 카드 표시가 이 컬럼을 채우고 쓴다.
- **후속 항목 후보 — `ClipDraft` 마이그레이션 드리프트 해소**: 위 「드리프트」대로 이 항목 뒤에는 빈 DB `migrate deploy`가 실패한다. FEAT-38 때 제시했지만 등재되지 않았다. 인수 때 소유자에게 다시 제시한다(등재는 승인 뒤).

**메인 루프 몫(인수 때)**: `TASK_BACKLOG.md` FEAT-44 「제외」 줄(`schema.prisma` `Clip` 주석을 "다음에 스키마를 바꾸는 항목에서 함께 고친다"며 넘긴 것)은 이 항목이 고치므로 정리한다.

## 대안

**(A) `ClipDraft` 대신 `Clip`에도 컬럼을 둔다.** 기각한다. 참고 번역은 검토 단계의 읽기 보조이고, 렌더된 클립은 실제 자막(렌더 번역)을 가진다. `Clip`에 두면 "이 클립의 한국어 = 참고 번역"으로 오독될 자리가 하나 더 생긴다. auto 경로는 analyze를 거치지 않아 값도 없다.

**(B) 번역을 moment별 JSON 한 칸(`aiTexts Json?` 등)에 묶는다.** 기각한다. `clipType`·`hook`·`payoff`가 이미 타입 있는 컬럼이라 대칭이 깨지고, FEAT-48 저장 매핑이 대입이 아니라 조립이 된다.

**(C) FEAT-48과 한 항목으로 합친다.** 기각한다. 스키마 수정·DB 적용은 메인 루프 몫이고 web 배선은 web-dev 몫이라 담당이 갈린다. 게다가 **컬럼이 코드보다 먼저 DB에 있어야 한다**(위 「순서」) — 따로 두면 FEAT-48은 이미 적용된 컬럼 위에서 시작한다.
