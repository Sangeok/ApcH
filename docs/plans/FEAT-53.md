# FEAT-53: `ClipDraft.captionStyle` 컬럼 제거 (마이그레이션 1회)

agent: main-loop

## 현재 동작

- 컬럼과 주석이 `packages/db/prisma/schema.prisma`에 남아 있다 — `:191` `    // Per-clip caption style override. null = language defaults (backend hardcoded values).` · `:192` `    // Shape: shared CaptionStyle type (src/fsd/shared/config/constants.ts),` · `:193` `    // validated by captionStyleSchema (features/clip-review/model/schemas.ts).` · `:194` `    captionStyle   Json?`.
- **코드의 활성 참조는 0이다.** FEAT-52(`daeaa56`, 2026-09-17 배포)가 읽기·쓰기 경로를 전부 지웠다 — `updateClipDraftEdit`의 쓰기, `getSelectedRenderMomentsForAttempt`의 per-moment 페이로드, `createCustomClipDraft`의 시드, `inngest/functions.ts`의 드래프트 시드가 모두 사라졌다. 메인 루프가 인수 때, 그리고 15차 감사가 독립적으로 각각 grep으로 확인했다.
- **그러나 생성 클라이언트는 여전히 이 컬럼을 안다.** 프로덕션에 떠 있는 빌드의 Prisma 클라이언트는 `captionStyle`을 가진 스키마에서 생성됐고, `select`가 없는 `ClipDraft` 쿼리는 **스칼라 컬럼을 전부** SELECT한다. 그런 쿼리가 **다섯**이다:
  - `apps/web/src/fsd/entities/clip-draft/api/index.ts:33` `  return getClient(options?.tx).clipDraft.findMany({`(`listClipDraftsForAttempt`)
  - `:74` `  return getClient(options?.tx).clipDraft.update({`(`updateClipDraftEdit` — 갱신된 행을 돌려받는다)
  - `:87` `  const drafts = await db.clipDraft.findMany({`(`getSelectedRenderMomentsForAttempt` — 렌더 디스패치)
  - `:124` `    return tx.clipDraft.create({`(`createCustomClipDraft`)
  - `apps/web/src/fsd/entities/uploaded-file/api/index.ts:357` `      ? await db.clipDraft.findMany({`(업로드 상세)

  **여집합을 전수로 적는다**(검증 라운드 1에서 처음 셋만 적었다가 보강했다). `clipDraft.*` 호출부는 저장소 전체에 **여덟**이고, 위 다섯 외 셋은 전부 이 컬럼을 SELECT하지 않는다:
  - `:22` `  return getClient(options?.tx).clipDraft.createMany({` — `createMany`는 행을 돌려주지 않는다(count만).
  - `:44` `  return db.clipDraft.findFirst({` — `select`를 갖는다.
  - `:117` `    const aggregate = await tx.clipDraft.aggregate({` — `:119` `      _max: { index: true },`만 읽는다. 집계라 스칼라 행이 없다.
- 마이그레이션 히스토리에 **`ClipDraft`를 만드는 파일이 없다** — 이 테이블은 `db:push`로만 존재한다(FEAT-38이 처음 기록, FEAT-47이 재확인). 최신 마이그레이션은 `packages/db/prisma/migrations/20260916000000_clip_draft_reference_translation/`이고 내용은 `ALTER TABLE "ClipDraft" ADD COLUMN     "referenceTranslation" TEXT;` 한 줄이다.

## 문제

백로그 FEAT-53이 요구하는 대로, 이 컬럼은 **아무도 읽지 않고 아무도 쓰지 않는** 데이터가 됐다. 사용자가 닿을 UI도 없어 되살아날 경로가 없다. 죽은 채 남으면 스키마가 "클립별 스타일이 존재한다"는 잘못된 인상을 계속 준다.

그리고 이 항목은 **FEAT-55(백엔드 죽은 per-clip 경로 정리)를 여는 유일한 문**이다 — 그 항목의 선행이 "FEAT-52 배포 + FEAT-53"이다.

**시급성의 근거는 전제의 취약성이다.** "활성 참조 0"은 지금 참이지만 **앞으로의 작업이 조용히 깨뜨릴 수 있는 상태**다. `ClipDraft`를 건드리는 다음 항목이 무심코 그 컬럼을 다시 쓰면 이 항목과 FEAT-55가 함께 막힌다.

## ⚠️ 적용 순서 — 이 계획의 핵심이고, FEAT-47과 **반대**다

FEAT-47(컬럼 **추가**)은 「순서: 적용 → 확인 → 커밋·푸시」였다. **컬럼이 코드보다 먼저**여야 했다 — 새 클라이언트가 없는 컬럼을 SELECT하면 깨지기 때문이다.

**삭제는 반대다.** 지금 프로덕션에 떠 있는 클라이언트는 `captionStyle`을 SELECT한다(위 다섯 쿼리). DB에서 먼저 컬럼을 지우면 그 순간 **검토 화면·편집 저장·렌더 디스패치·업로드 상세가 `column "captionStyle" does not exist`로 깨진다.**

```
금지 (FEAT-47의 순서를 그대로 쓰면 장애):
  migrate deploy → 프로덕션 즉시 깨짐 → 그 뒤에 코드 배포

올바른 순서:
  ① schema.prisma에서 컬럼 제거 + 마이그레이션 파일 추가 → 커밋·푸시
  ② Vercel 빌드가 postinstall의 prisma generate로 새 클라이언트를 만들어 배포
     (packages/db/package.json `"postinstall": "prisma generate"`)
  ③ 새 클라이언트가 프로덕션에 뜬 것을 확인한 뒤 → migrate deploy
```

②와 ③ 사이의 상태는 **안전하다** — DB에는 컬럼이 있고 코드는 그걸 SELECT하지 않는다. 쓰지 않는 컬럼이 남아 있는 것뿐이다. 반대 순서에는 안전한 중간 상태가 없다.

**그래서 이 항목은 커밋·푸시가 마이그레이션보다 먼저다.** 적용은 배포가 끝난 뒤 별도 단계로, 소유자 승인을 받아 실행한다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `packages/db/prisma/schema.prisma` | ① `ClipDraft`에서 `:191-193` 주석 3줄과 `:194` `    captionStyle   Json?` 제거. ② **`User.defaultCaptionStyle`의 주석 한 줄도 고친다** — `:60` `    // ClipDraft.captionStyle과 같은 CaptionStyle 모양이다.`가 이 항목이 지우는 컬럼을 가리킨다. `UploadedFile.captionStyle`을 가리키도록 바꾼다(그건 남는다) |
| `packages/db/prisma/migrations/20260917000000_drop_clip_draft_caption_style/migration.sql` `(신규)` | `ALTER TABLE "ClipDraft" DROP COLUMN "captionStyle";` |

여기 적히지 않은 파일은 고치지 않는다. **`apps/web`·`apps/backend` 소스는 한 줄도 바뀌지 않는다** — 활성 참조가 이미 0이기 때문이다. 이 사실이 이 항목의 전제이자 인수 조건이다.

## 구현 스케치

### 1. `schema.prisma`

before (`:189`~`:196`):

```prisma
    selected       Boolean  @default(true)

    // Per-clip caption style override. null = language defaults (backend hardcoded values).
    // Shape: shared CaptionStyle type (src/fsd/shared/config/constants.ts),
    // validated by captionStyleSchema (features/clip-review/model/schemas.ts).
    captionStyle   Json?

    createdAt      DateTime @default(now())
```

after:

```prisma
    selected       Boolean  @default(true)

    createdAt      DateTime @default(now())
```

**주석을 대체 문구로 남기지 않는다.** "여기 있던 컬럼이 FEAT-52에서 폐기됐다"를 스키마에 적으면, 스키마가 현재 상태가 아니라 이력을 담게 된다. 그 이력은 이 계획서·`docs/agents/main-loop/FEAT-52.md`·마이그레이션 파일이 갖는다.

### 2. 마이그레이션 (신규 파일 전문)

경로: `packages/db/prisma/migrations/20260917000000_drop_clip_draft_caption_style/migration.sql`

```sql
-- AlterTable
ALTER TABLE "ClipDraft" DROP COLUMN "captionStyle";
```

선례(`20260916000000_clip_draft_reference_translation/migration.sql`)와 같은 형식이다 — `-- AlterTable` 주석 한 줄 + SQL 한 줄.

### 3. 생성 클라이언트

`packages/db`의 `"postinstall": "prisma generate"`가 Vercel 빌드에서 돈다. 로컬에서도 확인용으로 `npm run db:generate:client -w @repo/db`를 돌려 타입에서 `captionStyle`이 사라졌는지 본다 — **읽기 전용이다**(DB에 닿지 않는다).

## 마이그레이션 히스토리 드리프트 — 이 항목이 바꾸지 않는 것

`ClipDraft`를 만드는 마이그레이션이 히스토리에 없다. 그 결과는 FEAT-47이 이미 기록했다 — 빈 DB에 `migrate deploy`를 돌리면 `20260916000000_clip_draft_reference_translation`에서 `relation "ClipDraft" does not exist`로 **실패한다**.

**이 항목은 그 상태를 나쁘게 만들지 않는다.** 재생 실패 지점이 앞당겨지지도, 새로 생기지도 않는다 — 이미 실패하는 지점보다 뒤에 붙는 파일이다. 프로덕션(테이블이 이미 있음)에는 영향이 없다.

**`prisma migrate dev`(= `npm run db:generate -w @repo/db`)를 쓰면 안 된다.** 드리프트를 검출하고 데이터베이스 리셋을 제안한다 — 대상이 프로덕션 Neon이면 데이터 손실 경로다. 적용은 드리프트를 검사하지 않는 `migrate deploy`로 한다.

드리프트 해소(생성 마이그레이션 소급 작성 + 기적용 표시)는 FEAT-38·FEAT-47이 두 번 미룬 별개 작업이다. 「범위 밖 의존」에서 다시 제시한다.

## 적용 — 명령·승인·순서

**Neon Postgres를 실제로 바꾸는 명령이다. 적용 직전 소유자 승인을 따로 받는다.**

`npm run db:migrate`는 이 저장소에서 그대로 돌지 않는다 — `packages/db`에서 도는 Prisma CLI가 루트 `.env`를 읽지 못해 `P1012 Environment variable not found: DATABASE_URL_UNPOOLED`로 실패한다(FEAT-38 실측, 스키마 `:12` `    directUrl = env("DATABASE_URL_UNPOOLED")`). FEAT-38·FEAT-47이 실제로 쓴 형태를 그대로 쓴다. 전부 `packages/db`에서:

| 단계 | 명령 | 성격 |
| --- | --- | --- |
| 적용 전 확인 | `node --env-file=../../.env ../../node_modules/prisma/build/index.js migrate status` | 읽기 전용. 대상 호스트와 **미적용이 `20260917000000_drop_clip_draft_caption_style` 하나뿐**인지 본다 |
| 적용 | `node --env-file=../../.env ../../node_modules/prisma/build/index.js migrate deploy` | **DB 변경 — 소유자 승인 뒤, 그리고 새 클라이언트 배포가 끝난 뒤** |
| 적용 후 확인 | `… migrate status` → `Database schema is up to date!` / `… db pull --print` 출력의 `model ClipDraft`에 `captionStyle`이 **없음** | 읽기 전용(`--print`는 파일을 쓰지 않는다) |

**순서: 커밋·푸시 → 배포 확인 → 적용 → 적용 후 확인.** 위 「적용 순서」 절의 이유로 FEAT-47과 반대다.

**되돌리기.** 이 마이그레이션은 **데이터를 지운다** — 되돌려도 값은 돌아오지 않는다. 컬럼 자체는 `ALTER TABLE "ClipDraft" ADD COLUMN "captionStyle" JSONB;`로 다시 만들 수 있고, 그러면 옛 클라이언트도 다시 돈다(값은 전부 null). 다만 **지워지는 값이 무엇인지 알고 지운다**: FEAT-52 배포 전까지 저장된 클립별 스타일이다. 그 값들은 이미 어떤 코드도 읽지 않으며, 사용자가 볼 UI도 없다. 적용 전 확인 단계에서 `SELECT count(*) FROM "ClipDraft" WHERE "captionStyle" IS NOT NULL;`로 **몇 행이 값을 갖고 있는지 소유자에게 보고한 뒤** 승인을 받는다.

## 테스트 · 게이트

- **코드 게이트**: `npm run check -w apps/web`(= `verify:fsd:test` → `verify:fsd` → `next lint` → `tsc --noEmit`) EXIT 0 · `npm test -w apps/web`. **착수 시점 기준선을 실측해 기대값을 못박는다** — FEAT-52 인수 시점 기준선은 `tests 178 / suites 42 / pass 178`, 파일 25였다. 이 항목은 테스트를 더하거나 빼지 않으므로 **같은 숫자가 나와야 한다.** 다른 숫자면 이 계획 밖의 무언가가 함께 바뀐 것이다.
- **`tsc`가 이 항목의 진짜 게이트다.** 생성 클라이언트를 재생성한 뒤 `ClipDraft` 타입에서 `captionStyle`이 사라지므로, 남은 참조가 하나라도 있으면 타입 오류로 드러난다. 「활성 참조 0」 주장을 기계가 판정하는 자리다.
- **백엔드는 영향이 없다** — `apps/backend`는 Prisma를 쓰지 않는다. `PYTHONUTF8=1 python -m unittest discover -s apps/backend -p "test_*.py"`는 불변(FEAT-51 인수 시점 `Ran 113 tests ... OK`).
- **착수 전 재확인**: `ClipDraft.captionStyle` 경유 활성 참조가 0임을 grep으로 다시 보인다(백로그 요구 ④). 계획 시점에 참이어도 구현 시점에 다시 본다 — 그 사이 다른 작업이 들어올 수 있다.

## 못 덮는 범위

- **DB의 실제 상태** — 컬럼이 정말 사라졌는지는 `migrate status`·`db pull --print`로만 보인다. 러너 밖이고 배포 실물이다.
- **적용 후 프로덕션 동작** — 검토 화면·편집 저장·렌더 디스패치·업로드 상세가 여전히 도는지. 위 다섯 쿼리가 새 클라이언트로 도는 것을 실물에서 확인해야 한다. 특히 **컬럼을 지운 직후**가 위험 구간이다.
- 지워지는 행 수 — 적용 전 `SELECT count(*)`로만 알 수 있다.

## 범위 밖 의존

- **FEAT-55(백엔드 죽은 per-clip 경로)가 이 항목 뒤에 열린다.** 그 항목의 선행이 「FEAT-52 배포 + FEAT-53」이다. 이 항목이 끝나면 곧바로 착수 가능해진다.
- **`apps/web`에 이 컬럼을 가리키는 주석이 하나 남는다 — 내 쓰기 범위 밖이다.** `apps/web/src/fsd/shared/config/caption-style-schema.ts:7` `// User.defaultCaptionStyle / UploadedFile.captionStyle / ClipDraft.captionStyle JSON의` · `:8` `// 공용 검증기. 세 컬럼이 같은 CaptionStyle 모양을 공유하므로 하위 레이어(shared)에 둬` — 이 항목 뒤 **`ClipDraft.captionStyle`은 없고 컬럼은 셋이 아니라 둘**이 된다. `apps/web` 소스는 web-dev 몫이므로 여기서 고치지 않고 **FEAT-56(FEAT-52가 남긴 잔재 정리)에 추가한다** — 같은 부류이고 이미 같은 성격의 잔여 문구(`constants.ts:114`)를 그 항목이 들고 있다. 검증 라운드 1에서 발견했다(내 계획서가 FEAT-52에서 내가 지적했던 것과 같은 실수를 반복했다).
- **마이그레이션 히스토리 드리프트는 이 항목이 해소하지 않는다.** `ClipDraft` 생성 마이그레이션이 없어 빈 DB 재생이 실패하는 상태가 그대로 남는다. FEAT-38·FEAT-47이 두 번 미뤘고 이번이 세 번째다 — **백로그 후보로 다시 제시한다.** 세 번 미룬 것은 신호다.
- **배포·마이그레이션 실행은 소유자 승인 사항.** Vercel 배포(`main` 합류)와 `migrate deploy` 둘 다.

## 대안

- **(A) 컬럼을 남기고 스키마에서만 지운다 — 기각.** Prisma 스키마에서 빼고 마이그레이션을 안 만들면 클라이언트는 깨끗해지지만 DB에 고아 컬럼이 남는다. 다음에 누가 `db pull`을 돌리면 되살아나고, 드리프트가 하나 더 쌓인다. 이 항목의 목적이 "죽은 것을 없애는 것"인데 절반만 하는 셈이다.
- **(B) FEAT-55와 한 항목으로 묶기 — 기각.** 쓰기 범위가 `packages/db`(main-loop)와 `apps/backend`(backend-dev)로 갈리고, 무엇보다 **FEAT-55는 이 항목의 적용이 끝나야 안전하다**(전이 구간). 한 사이클로 묶으면 그 순서를 게이트가 아니라 사람의 기억이 지키게 된다.
- **(C) 적용을 코드 배포보다 먼저 — 기각.** 「적용 순서」 절의 이유. 프로덕션 즉시 장애다. FEAT-47의 순서를 습관적으로 따르면 이 함정에 빠진다는 점을 계획서 앞쪽에 박아 둔 이유다.
