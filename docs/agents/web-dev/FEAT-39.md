# FEAT-39 — 설정 화면 + 업로드 기본값(언어·클립 수·생성 모드) (web-dev)

## 2026-09-14 구현

계획서 `docs/plans/FEAT-39.md`의 「고칠 파일」·「구현 스케치」를 그대로 구현했다.
전부 `apps/web` 안이며 「범위 밖 의존」은 "없음"이라 넘어간 지점이 없다.

### 구현 전 「현재 동작」 대조 (B-3)

코드가 계획서 「현재 동작」과 일치함을 확인했다:
- `UploadPodcast.tsx:67-75` — `useState<string>(DEFAULT_LANGUAGE)`·`useState<number>(DEFAULT_CLIP_COUNT)`·
  `useState<boolean>(false)`가 상수로 초기 state를 잡음. 드롭 클램프(`:102-106`)는 `prev > max` 형태 그대로.
- `shared/config/constants.ts:27-28` `DEFAULT_LANGUAGE = SUPPORTED_LANGUAGES[0].value`(English)·
  `DEFAULT_CLIP_COUNT = CLIP_COUNT_OPTIONS[2].value`(3). 언어 2개(English/Korean), 클립 1..4.
- `entities/user/api/index.ts` — 세 컬럼을 읽/쓰는 함수 없음. `server.ts:4-15` 재수출 목록에도 없음.
  `entities/user/index.ts`는 `export {}`.
- `packages/db/prisma/schema.prisma:56-58` — `defaultLanguage String?`·`defaultClipCount Int?`·
  `defaultReviewBeforeGenerate Boolean?` 존재(FEAT-38). 스키마는 건드리지 않음.
- `metadata.ts:58,63` — `settings_viewed: []`·`settings_defaults_saved: ["source","preset"]` 준비됨.
- `AnalyticsTracker.tsx:22-28` — `/dashboard/billing`까지만 매핑, `/dashboard/settings`는 `startsWith`
  캐치로 `null`.
- `dashboard-header/ui/index.tsx:76-78` — 드롭다운에 Billing·Sign out만.
- `shared/api/auth-guard.ts:18` `requireAuth()`, `shared/api/result.ts` `ActionResult`/`failure`/`success`,
  `shared/analytics/index.ts:12` `trackAnalyticsEvent` 재수출, `server/auth` `auth`, layout에 `<Toaster/>` 존재.

### 고친 파일 (전수, 14개)

신규 8:
1. `entities/user/model/upload-defaults.ts` — 순수 함수 `resolveUploadDefaults`(저장값→폼 초기값,
   null·범위 밖은 시스템 기본으로 폴백)·`normalizeUploadDefaults`(폼 입력→DB 페이로드, null 통과·
   범위 밖·잘못된 타입은 null 거부) + `StoredUploadDefaults`/`ResolvedUploadDefaults` 타입 +
   `DEFAULT_REVIEW_BEFORE_GENERATE = false`. 스케치 전문 그대로.
2. `entities/user/model/upload-defaults.test.mjs` — 두 순수 함수 분기 테스트 14개(아래 참조).
3. `features/settings/api/index.ts` — `"use server"` 액션 `saveUploadDefaults`(requireAuth →
   normalizeUploadDefaults → updateUserUploadDefaults → revalidatePath 2). 스케치 전문 그대로.
4. `features/settings/index.ts` — `export {}` 자기문서화 배럴(클라이언트 안전 표면 없음).
5. `pages/settings/ui/index.tsx` — `SettingsView`(클라이언트), 세 드롭다운 + Save/Reset + 계측.
   스케치 전문 그대로.
6. `app/dashboard/settings/page.tsx` — 라우트(auth → getUserUploadDefaults → resolveUploadDefaults →
   SettingsView). 스케치 전문 그대로.

수정 8(위 표 순서):
7. `entities/user/api/index.ts` — 파일 끝에 `getUserUploadDefaults`(세 컬럼 select)·
   `updateUserUploadDefaults`(세 컬럼 update) 추가.
8. `entities/user/server.ts` — 재수출 목록 알파벳 위치에 두 이름 삽입.
9. `entities/user/index.ts` — `export {}` → `./model/upload-defaults`의 순수 함수·타입 재수출.
10. `pages/settings/ui/index.tsx`(신규, 위 5).
11. `pages/dashboard/ui/_component/UploadPodcast.tsx` — props에 `defaults: ResolvedUploadDefaults`,
    초기 state 상수→`defaults.*`, 미사용 `DEFAULT_LANGUAGE`·`DEFAULT_CLIP_COUNT` 임포트 제거 +
    `import type { ResolvedUploadDefaults } from "~/fsd/entities/user"` 추가. 드롭 클램프 미변경.
12. `pages/dashboard/ui/index.tsx` — `DashboardViewProps`에 `uploadDefaults`, 구조분해 추가,
    `<UploadPodcast ... defaults={uploadDefaults} />`, 타입 임포트 추가.
13. `app/dashboard/page.tsx` — `getUserUploadDefaults`를 `Promise.all`에 추가, `DashboardView`에
    `uploadDefaults={resolveUploadDefaults(userDefaults)}` 전달, 임포트 2 추가.
14. `widgets/dashboard-header/ui/index.tsx` — Billing 항목 위에 `Settings` 링크 + separator.
15. `shared/analytics/ui/AnalyticsTracker.tsx` — billing 분기 뒤·`startsWith` 캐치 앞에
    `/dashboard/settings` → `settings_viewed` 분기.

### 스케치 대비 차이

분기 순서·조건·리터럴 값·사용자에게 보이는 문구 모두 스케치와 동일하다.
`SettingsView`의 import 정렬만 스케치와 미세하게 달라졌다(값+타입 혼합 import를
`DEFAULT_REVIEW_BEFORE_GENERATE`/`type ResolvedUploadDefaults` 한 블록으로, 스케치의 한 줄을
여러 줄로 포맷) — prettier 정렬 차이일 뿐 의미·문구·조건에는 영향 없음.
사용자에게 보이는 문구는 계획서 「구현 스케치」와 문구 목록을 글자 그대로 사용:
카드 제목 `Upload defaults`, 설명 `These options are pre-selected each time you upload. You can still change them for a single upload.`,
행 라벨 `Subtitle language`·`Number of clips`·`Generation`, 생성 옵션 `Auto (generate immediately)`·
`Review first (edit clips before generating)`, 버튼 `Save defaults`(저장 중 `Saving...`)·
`Reset to system defaults`, 토스트 `Defaults saved`·실패는 `result.error`. 헤더 링크 문구 `Settings`.

### 검증

- `npm run check -w apps/web` → EXIT 0 (verify:fsd:test 11/11, verify:fsd "FSD boundary check passed",
  next lint "No ESLint warnings or errors", tsc --noEmit 무출력). FSD 경계 위반 없음 — W5(엔티티 클라
  배럴이 server-only ./api 재수출 금지)는 `entities/user/index.ts`가 `./model/*`만 재수출해 통과.
- `npm test -w apps/web` → 145 pass / 0 fail (33 suite). 기준선 131 + 신규 14.
- `git status --short`로 내가 만진 파일이 위 14개(수정 8 + 신규 6파일)뿐임을 확인.
  `apps/web/.claude/settings.local.json`(수정)·루트 `nul`(미추적)은 세션 시작 시점부터 있던
  내 것이 아닌 변경이라 건드리지 않음.

### 테스트 (upload-defaults.test.mjs, 14개)

- `resolveUploadDefaults` 5: 전부 null→시스템 기본(English/3/false); 유효 저장값(Korean/2/true)→그대로;
  범위 밖 클립 수(5)→3; 미지원 언어(French)→English; review 플래그 null→false·true→true.
- `normalizeUploadDefaults` 9: 전부 null→전부 null(비우기 통과); 유효 구체값→동일; 범위 밖 클립 수(5)→null;
  미지원 언어→null; 문자열 클립 수("3")→null(타입 거부); 비-boolean review→null;
  **필드 누락(undefined) 세 개 각각→null(거부)** — `!= null`로 바꾼 구현이 누락 필드를 통과시켜
  Prisma가 그 컬럼을 조용히 건너뛰는 부분 갱신이 되는 것을 각 필드에서 막는다.

### 테스트로 못 덮은 범위 (배포 후 수동 확인)

현재 러너(`tsx` Node 내장, DOM·React·DB·라우팅 없음)로 확인 불가. 계획서 「테스트」 절 그대로,
`docs/release-checks.md` FEAT-38 절의 `(FEAT-39 배포 후)` 줄에서 함께 닫힌다:
1. 설정 화면 실제 렌더·드롭다운 선택·저장/초기화 토스트, 저장이 `User` 세 컬럼에 반영,
   저장 뒤 대시보드 업로드 폼이 새 기본값으로 초기화되는지.
2. `settings_viewed`·`settings_defaults_saved`(source: settings_page) 계측 행이 실제 기록되는지.
3. 라우트 보호가 프로덕션에서 `/dashboard/settings` 미인증 리다이렉트하는지
   (middleware `matcher: /dashboard/:path*` + layout 가드 + 라우트 `auth()` 삼중).

### 비고

`apps/web/CLAUDE.md`의 테스트 목록 표(읽기 전용이라 직접 수정 안 함)에 아래 행 추가 필요:

| `entities/user/model/upload-defaults.test.mjs` | 업로드 기본값 해석·정규화. `resolveUploadDefaults`는 null·범위 밖 저장값을 시스템 기본으로 폴백하고, `normalizeUploadDefaults`는 조작된 POST(범위 밖·잘못된 타입·**필드 누락**)를 null로 거부한다. 누락 필드 거부가 요점 — `!= null`로 바꾼 구현은 누락 필드를 통과시켜 Prisma가 그 컬럼을 건너뛰는 부분 갱신이 된다 |

같은 파일 「테스트」 섹션 머리말의 총계("현재 20개 파일 … 130개 테스트")도 낡음 — 이번으로
21개 파일·145 테스트가 됐다(FEAT-40에서 131로 올랐던 것이 반영 안 된 채였음). 표 유지 담당이
정리 시 함께 갱신 권장.
