# FEAT-38 — 사용자 기본값 스키마

> 담당: main-loop — dev 로스터의 쓰기 범위 밖이다. `.claude/agents/web-dev.md:54` `- \`packages/db/prisma/schema.prisma\` 수정` 이 금지 목록에 있고, `:53`이 `db:push`/`db:migrate` 실행도 금지한다. FEAT-19·FEAT-26 전례를 따른다.
> 선행: 없음 · 이 항목은 FEAT-39·FEAT-42의 선행이다.

## 현재 동작

업로드 옵션 셋은 매 페이지 로드마다 상수로 리셋된다.

- `apps/web/src/fsd/pages/dashboard/ui/_component/UploadPodcast.tsx:69` `const [language, setLanguage] = useState<string>(DEFAULT_LANGUAGE);`
- `:70` `const [clipCount, setClipCount] = useState<number>(DEFAULT_CLIP_COUNT);`
- `:75` `    useState<boolean>(false);` (`reviewBeforeGenerate`)

그 상수는 `apps/web/src/fsd/shared/config/constants.ts:27` `export const DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES[0].value;` 와 `:28` `export const DEFAULT_CLIP_COUNT = CLIP_COUNT_OPTIONS[2].value;` 이고, **사용자별 저장소가 없다** — `packages/db/prisma/schema.prisma`의 `User`(`:43` `model User {` ~ `:60` `}`)에 설정 컬럼이 하나도 없다.

선택한 값은 업로드 행에 박힌다: `:78` `    language              String   @default("English")`, `:79` `    targetClipCount       Int      @default(3)`, `:81` `    reviewBeforeGenerate  Boolean  @default(false)`.

캡션 스타일만 그 대칭에서 빠져 있다 — `:170` `    captionStyle   Json?` 은 `ClipDraft`에만 있고 `UploadedFile`엔 대응 컬럼이 없다.

이벤트는 29개다(`packages/db/src/analytics-contract.ts:9`~`:39`).

## 문제

기본값을 담을 자리가 없다.

**이 항목은 사용자 화면을 바꾸지 않는다.** FEAT-39(스칼라 기본값)와 FEAT-42(캡션 기본값)가 쓸 저장소와 계측 계약만 만든다. 그래서 인수 기준도 "화면이 달라졌는가"가 아니라 **"스키마와 계약이 두 소비자가 요구하는 모양으로 존재하고, 기존 것이 하나도 안 깨졌는가"**다.

## 고칠 파일

| # | 파일 | 변경 |
| --- | --- | --- |
| 1 | `packages/db/prisma/schema.prisma` | `User`에 4컬럼, `UploadedFile`에 1컬럼 |
| 2 | `packages/db/prisma/migrations/20260909000000_user_default_settings/migration.sql` | 신규 |
| 3 | `packages/db/src/analytics-contract.ts` | 이벤트 이름 2개 |
| 4 | `apps/web/src/fsd/shared/analytics/lib/metadata.ts` | 허용 키 2개 |
| 5 | `apps/web/src/fsd/shared/analytics/lib/metadata.test.mjs` | 케이스 1개 추가 |

**3번과 4번은 같은 커밋이어야 한다.** 아래 「컴파일·런타임 결합」 참조.

## 구현 스케치

### 1. `schema.prisma` — `User`

before (`:51`~`:52`):

```prisma
    image           String?
    accounts        Account[]
```

after:

```prisma
    image           String?

    // 업로드 폼의 기본값. null = 설정 안 함 → 시스템 상수를 따른다
    // (shared/config/constants.ts DEFAULT_LANGUAGE / DEFAULT_CLIP_COUNT).
    // Json 블롭 한 칸으로 묶지 않은 이유는 아래 「대안」(A) 참조.
    defaultLanguage             String?
    defaultClipCount            Int?
    defaultReviewBeforeGenerate Boolean?
    // 검증은 captionStyleSchema(features/clip-review/model/schemas.ts) 한 곳.
    // ClipDraft.captionStyle과 같은 CaptionStyle 모양이다.
    defaultCaptionStyle         Json?

    accounts        Account[]
```

### 2. `schema.prisma` — `UploadedFile`

before (`:81`~`:82`):

```prisma
    reviewBeforeGenerate  Boolean  @default(false)
    // The analysis attempt whose ClipDrafts are currently under review / were confirmed.
```

after:

```prisma
    reviewBeforeGenerate  Boolean  @default(false)
    // 업로드 시점에 User.defaultCaptionStyle을 복사한 스냅샷 (FEAT-42가 채운다).
    // 라이브 참조가 아니라 스냅샷인 이유: 검토 중 기본값을 바꾸면 미리보기와
    // 실렌더가 어긋나고, 그 회귀는 크레딧을 쓴 뒤에야 드러난다
    // (widgets/clip-draft-review/model/caption-preview.test.mjs가 지키는 계약).
    // 재처리 결과가 원본과 달라지는 것도 같은 이유로 막는다.
    captionStyle          Json?
    // The analysis attempt whose ClipDrafts are currently under review / were confirmed.
```

### 3. 마이그레이션 (신규 파일 전문)

`packages/db/prisma/migrations/20260909000000_user_default_settings/migration.sql`

```sql
-- AlterTable
ALTER TABLE "User" ADD COLUMN     "defaultLanguage" TEXT,
ADD COLUMN     "defaultClipCount" INTEGER,
ADD COLUMN     "defaultReviewBeforeGenerate" BOOLEAN,
ADD COLUMN     "defaultCaptionStyle" JSONB;

-- AlterTable
ALTER TABLE "UploadedFile" ADD COLUMN     "captionStyle" JSONB;
```

디렉터리 이름은 기존 관례를 따른다 — `20260820000000_clip_selection_rationale`·`20260826000000_clip_subtitle_status` 처럼 날짜 + `000000` + snake_case. SQL 본문 형식도 그 둘과 같은 `-- AlterTable` + `ADD COLUMN` 나열이고, 테이블 이름은 스키마 한정 없이 `"User"`·`"UploadedFile"`이다(`init` 마이그레이션만 `"public"."User"` 형식을 쓴다).

전 컬럼이 nullable이라 **기존 행에 백필이 필요 없고 기본값도 없다** — 테이블 재작성 없이 카탈로그만 바뀌므로 잠금이 짧다.

**`JSONB` 표기 근거(구조 확인).** `prisma migrate diff --from-empty --to-schema-datamodel ./prisma/schema.prisma --script`(DB 접속 없는 로컬 실행)가 `Json?`을 `"captionStyle" JSONB,`로 방출하는 것을 확인했다. 저장소 내 선례도 있다 — `packages/db/prisma/migrations/20260616000000_add_analytics_events/migration.sql:9` `    "metadata" JSONB,`.

**파일은 수기로 쓴다. `prisma migrate dev`로 생성하지 않는다.** 아래 「마이그레이션 히스토리 드리프트」 참조.

### 4. `analytics-contract.ts` — 이벤트 2개

before (`:37`~`:39`):

```typescript
  "checkout_returned_success",
  "page_exited",
] as const;
```

after:

```typescript
  "checkout_returned_success",
  "settings_viewed",
  "settings_defaults_saved",
  "page_exited",
] as const;
```

`ANALYTICS_FUNNELS`(`:93`~`:120`)에는 **넣지 않는다.** 넷 중 어느 퍼널의 단계도 아니고, `buildFunnelReportFromEvents`가 엄격 순차 매처라 무관한 단계를 끼우면 그 뒤 스텝이 영구히 0이 된다 — `:115`~`:118` 주석이 `review` 퍼널에서 실제로 겪은 사례를 적어놨다.

### 5. `metadata.ts` — 허용 키 2개

before (`:57`~`:59`):

```typescript
  checkout_returned_success: [],
  page_exited: ["dwellTimeMs"],
} as const satisfies Record<AnalyticsEventName, readonly string[]>;
```

after:

```typescript
  checkout_returned_success: [],
  settings_viewed: [],
  // source는 "settings_page" | "review_dialog". 기본값을 어디서 저장하는지가
  // FEAT-42의 인라인 저장 진입점이 실제로 쓰이는지에 답한다.
  // preset은 matchPresetId의 결과(프리셋 id | "custom" | "default")로
  // clip_review_caption_style_edited의 동명 키와 같은 의미다.
  settings_defaults_saved: ["source", "preset"],
  page_exited: ["dwellTimeMs"],
} as const satisfies Record<AnalyticsEventName, readonly string[]>;
```

`settings_viewed: []`는 의도적이다 — `sanitizeAnalyticsMetadata`가 `:85` `  if (allowedKeys.length === 0) {` 에서 `undefined`를 반환하므로 메타데이터가 아예 실리지 않는다. `billing_viewed`(`:54`)·`dashboard_viewed`(`:11`)와 같은 모양이다.

### 6. `metadata.test.mjs` — 케이스 추가

**삽입 위치는 `:43`과 `:44` 사이다.** `:43` `  });` 는 직전 `it`(`:38` `  it("returns undefined when no safe metadata remains", () => {`)을 닫고, `:44` `});` 가 `describe`를 닫는다. `:43` **앞**에 넣으면 새 `it`이 이전 `it` 안에 중첩된다.

```javascript
  it("keeps source and preset for settings_defaults_saved, dropping the rest", () => {
    // 이 이벤트는 User만 바꾼다. clip_review_caption_style_edited로 재사용하면
    // 그쪽 appliedToAll 집계가 오염되므로 별 이벤트로 두고, 그 사실을
    // 허용 키 목록이 지킨다.
    assert.deepEqual(
      sanitizeAnalyticsMetadata("settings_defaults_saved", {
        source: "review_dialog",
        preset: "bold-yellow",
        uploadedFileId: "should-be-dropped",
      }),
      { source: "review_dialog", preset: "bold-yellow" },
    );
  });
```

## 컴파일·런타임 결합 — 3번과 4번을 쪼개면 안 되는 이유

`ANALYTICS_METADATA_KEYS_BY_EVENT`는 `metadata.ts:59` `} as const satisfies Record<AnalyticsEventName, readonly string[]>;` 로 **모든 이벤트 이름에 대한 Record**다. `packages/db`에 이름만 추가하고 `apps/web`의 키를 안 넣으면 `satisfies`가 **컴파일 오류**를 낸다.

같은 계약을 런타임에서도 지키는 테스트가 따로 있다 — `apps/web/src/fsd/shared/analytics/event-catalog.test.mjs:26` `test("모든 이벤트 이름에 metadata 정의가 있다", () => {` 가 `ANALYTICS_EVENT_NAMES` 전수를 돌며 `name in ANALYTICS_METADATA_KEYS_BY_EVENT`를 단언한다.

**두 겹 다 이 항목 안에서 통과해야 한다.** 워크스페이스가 갈렸다는 이유로 3번과 4번을 다른 항목으로 나누면 중간 상태가 빌드되지 않는다.

이 테스트는 새 이벤트 2개를 **자동으로 커버하므로 수정이 필요 없다** — 개수를 박지 않은 설계이고 `:10`~`:11` 주석이 그 이유를 적어놨다(`// 개수를 박으면 이벤트를 하나 추가할 때 무관한 테스트가 깨진다.`).

## 테스트

| 명령 | 지키는 것 |
| --- | --- |
| `npm run check --workspaces` | `satisfies` 두 절(계약↔metadata, 퍼널↔이벤트 이름)의 컴파일 통과 |
| `npm test -w apps/web` | `event-catalog.test.mjs` 전수 단언 + 새 `metadata.test.mjs` 케이스 |
| `npm run db:generate:client -w @repo/db` | 생성 클라이언트 재생성 (`prisma generate`. DB에 접속하지 않는다) |
| `npm run db:migrate` | 마이그레이션 **적용** (`prisma migrate deploy`. 아래 「소유자 승인」) |

### ⚠️ 마이그레이션 히스토리 드리프트 — `migrate dev`를 쓰지 않는 이유

**`npm run db:generate -w @repo/db`(= `prisma migrate dev`)를 이 항목에서 실행하면 안 된다.**

마이그레이션 디렉터리가 스키마와 어긋나 있다. 마이그레이션이 만드는 테이블은 10개인데(`init`의 Account·Clip·Order·Session·Subscription·UploadedFile·User·VerificationToken + `20260616000000_add_analytics_events`의 AnalyticsEvent + `20260630000000_one_processing_per_user_index` 이전의 ProcessingDispatch) 스키마 모델은 11개다 — **`ClipDraft`를 만드는 마이그레이션이 없다.** `grep -rl "ClipDraft" packages/db/prisma/migrations/` 가 0건이고, 그 모델의 `captionStyle Json?`도 마이그레이션 어디에도 없다. `db:push`로 반영된 것이다.

그래서:

- `prisma migrate dev`는 **드리프트를 검출하고 데이터베이스 리셋을 제안한다.** 대상이 프로덕션 Neon이면 데이터 손실 경로다.
- `prisma migrate deploy`(= `npm run db:migrate`)는 드리프트를 검사하지 않고 **미적용 마이그레이션만 적용한다.** 이 항목이 쓸 명령은 이쪽이다.

저장소가 이미 같은 교훈을 적어놨다 — `apps/web/docs/proposals/completed/2026-05-25-neon-db-idle-cost-optimization-plan.md:434`가 "`migrate dev`만 실행하면 migration 파일 생성뿐 아니라 연결된 DB 적용까지 수행할 수 있다"며 `--create-only` + `db:migrate` 분리를 처방한다. 이 계획서는 한 걸음 더 가서 **파일을 수기로 작성**한다(기존 디렉터리들이 전부 `000000` 타임스탬프인 것이 수기 작성의 흔적이다).

배포 파이프라인은 마이그레이션을 자동 적용하지 않는다 — `apps/web/vercel.json`에 빌드 커맨드 오버라이드가 없고 `packages/db`의 `postinstall`은 `prisma generate`(클라이언트 생성)뿐이다. 적용은 소유자가 손으로 한다.

`packages/db/generated/prisma`가 재생성되어 파일 다수가 변경으로 뜬다. CLAUDE.md 관례는 `git diff --ignore-cr-at-eol --numstat`이 0이면 CRLF 찌꺼기이므로 되돌리는 것인데, **이번에는 새 컬럼 때문에 실제 내용이 바뀌므로 0이 아닌 것이 정상**이고 그 diff는 커밋 대상이다(생성 클라이언트는 git 추적 대상 27파일).

## 소유자 승인이 필요한 지점

**마이그레이션 적용은 Neon Postgres를 실제로 바꾼다.** 구현 단계에서 그 명령을 돌리기 직전에 별도로 승인을 받는다. 컬럼 추가가 전부 nullable이라 되돌리기가 쉽고(`DROP COLUMN`) 기존 데이터를 건드리지 않지만, DB 변경이라는 사실 자체가 승인 대상이다.

## 범위 밖 의존

없음. `apps/backend`·`apps/admin`에 닿지 않는다. `apps/web` 중에서는 analytics 두 파일(+테스트)만 건드린다.

**소비자 코드는 이 항목에서 만들지 않는다** — 설정 화면·업로드 폼 초기값·`prepareUpload` 스냅샷 복사·드래프트 시드는 전부 FEAT-39·FEAT-42의 몫이다.

### `ANALYTICS_EVENT_NAMES` 소비자 전수 (어디까지 따라 움직이나)

이벤트 이름을 늘리면 무엇이 따라 움직이는지 열거해 확인했다. **소비자는 네 곳이고, 그중 셋은 목록에서 파생되므로 수정이 필요 없다. 나머지 하나(`metadata.ts`)가 이 항목이 함께 고치는 파일이다** — 그 하나가 「고칠 파일」 #4이자 아래 「컴파일·런타임 결합」의 대상이다.

| 소비자 | 이름을 어떻게 쓰나 | 이 항목의 영향 |
| --- | --- | --- |
| `apps/web/src/app/api/analytics/events/route.ts:15` `  name: z.enum(ANALYTICS_EVENT_NAMES),` | 수집 엔드포인트의 허용 enum | 새 이름 2개가 자동으로 수용된다. 이게 없으면 FEAT-39의 발신이 400으로 거부된다 |
| `apps/web/src/fsd/shared/analytics/lib/metadata.ts:59` | 허용 키 Record | **이 항목에서 함께 고친다**(위 결합) |
| `apps/admin/src/fsd/entities/analytics-event/api/queries.ts:74`·`:90` `listRangeEvents(input, ANALYTICS_EVENT_NAMES)` | 이탈·실패 집계의 대상 목록 | 자동 포함 |
| `apps/web/src/fsd/shared/analytics/event-catalog.ts:1` / `index.ts:2` | 재수출 | 파생 |

**「화면을 바꾸지 않는다」의 정확한 근거**: admin 분석 화면은 이벤트 이름 목록이 아니라 **기록된 행**을 그린다(`apps/admin/src/fsd/pages/analytics/ui/index.tsx:196` `                    <TableCell className="font-medium">{row.eventName}</TableCell>`). 이 항목은 발신부를 만들지 않으므로 기록이 0건이고, 따라서 새 행도 0건이다. 화면이 바뀌는 것은 FEAT-39가 발신을 붙인 뒤다.

## 후속 항목 후보 (이 항목에서 고치지 않는다)

**마이그레이션 히스토리에 `ClipDraft`가 없다.** 위 「드리프트」에서 확인한 사실의 귀결이다 — 빈 데이터베이스에 `prisma migrate deploy`만 돌리면 `ClipDraft` 테이블이 생기지 않아 검토 경로 전체가 죽는다. 현재 프로덕션은 `db:push`로 만들어져 있어 동작하지만, 마이그레이션 히스토리는 재현 가능한 스키마 정의가 아니다.

이 항목에서 고치지 않는 이유: 드리프트 해소는 `ClipDraft` 생성 마이그레이션을 소급 작성하고 `prisma migrate resolve --applied`로 기적용 표시하는 별개의 작업이고, 잘못하면 프로덕션 스키마를 건드린다. FEAT-38의 5컬럼 추가와 위험 성격이 다르다.

**소유자에게 백로그 후보로 제시한다.** 등재되지 않으면 pm의 입력에서 증발한다.

## 못 덮는 범위

- 마이그레이션이 프로덕션 Neon에 실제로 적용됐는지는 배포 후 확인이다.
- 새 컬럼이 실제로 읽고 쓰이는지는 이 항목에서 검증할 수 없다 — 소비자가 아직 없다. FEAT-39가 첫 소비자다.
- 새 이벤트 2개가 실제로 기록되는지도 마찬가지다. 계약만 생기고 발신부는 FEAT-39가 만든다.

## 대안

**(A) `User.preferences Json?` 한 칸에 넷 다.** 스키마와 마이그레이션이 한 줄로 줄지만 기각한다. 목적지 컬럼(`UploadedFile.language`·`targetClipCount`·`reviewBeforeGenerate`)이 이미 타입 있는 컬럼이라 FEAT-42의 `prepareUpload` 복사가 **파싱이 아니라 대입**이어야 하고, 블롭이 한 번 망가지면 업로드 준비 자체가 막힌다 — 결제 파이프라인 앞단에 그 위험을 두지 않는다. `apps/admin`이 "몇 명이 Korean을 기본으로 두나"를 쿼리하는 것도 컬럼이라야 한 줄이다.

**(B) 컬럼을 non-nullable + `@default`로.** `UploadedFile` 쪽과 모양이 같아져 대칭적이지만 기각한다. 그러면 "설정 안 함"과 "시스템 기본과 같은 값으로 설정함"이 구분되지 않아 설정 화면이 「시스템 기본값 사용 중」을 정직하게 표시할 수 없고, 시스템 상수를 바꿔도 전파되지 않는다. 읽는 쪽 비용은 `?? DEFAULT_LANGUAGE` 세 줄뿐이다.

**(C) 마이그레이션 2회로 분할** — 스칼라 먼저, 캡션 컬럼은 FEAT-42 때. 기각한다. 캡션 컬럼은 FEAT-42까지 안 쓰이지만, 나누면 Neon 작업과 소유자 승인이 두 번이 된다. 미사용 nullable 컬럼이 한동안 비어 있는 비용이 그보다 싸다.

**(D) 이벤트를 `settings_defaults_saved` 하나로** (`settings_viewed` 없이). 코인 플립에 가깝다. 대시보드의 다른 페이지엔 전부 `*_viewed`가 있어(`dashboard_viewed`·`billing_viewed`·`upload_detail_viewed`) 일관성 때문에 둘로 갔다. 줄이면 "설정 화면을 열고 저장하지 않은 비율"만 잃는다.
