# FEAT-39 — 메인 루프 기록

## 게이트① (2026-09-14)

소유자 직접 발주(pm 미경유) — 세션 지시 "FEAt-39 수행". FEAT-38이 같은 날 완료(프로덕션 마이그레이션 적용, 커밋 `d93095b`)되어 선행이 풀린 직후
지목했다. `계획지시`로 보드에 기록. 보드 미결 0건이었다.

담당은 `web-dev` — area가 전부 `apps/web` 안이다(백로그 "범위 밖 의존 없음"). 필요한 DB 컬럼(`User.defaultLanguage`·`defaultClipCount`·
`defaultReviewBeforeGenerate`)과 이벤트 이름(`settings_viewed`·`settings_defaults_saved`)·허용 키(`["source", "preset"]`)는 FEAT-38이 이미 만들었다.

### 계획 단계에서 반드시 다룰 것

- **서버 액션의 인가와 검증.** `apps/web/CLAUDE.md` 「서버 액션」대로 인가는 액션 본문 최상단에서 강제한다(Server Action은 직접 POST 가능한 독립
  엔드포인트). 사용자는 **자기** `User` 행의 기본값만 읽고 쓴다. 값은 서버에서 검증한다 — 언어는 `SUPPORTED_LANGUAGES`의 값, 클립 수는
  `CLIP_COUNT_OPTIONS`의 값, 생성 모드는 boolean, 그리고 **`null`은 "설정 안 함 = 시스템 기본"으로 비우기**(백로그 요구 ②). 범위 밖 값이 DB에
  들어가면 업로드 폼 초기값이 깨지므로 거부 방식(에러 반환 vs 무시)을 정하고 근거를 적는다.
- **라우트 보호.** `/dashboard/settings`가 미들웨어 보호 경로에 실제로 포섭되는지 확인한다 — `middleware.test.mjs`가 지키는 "목록에 있어도 matcher가
  통과시켜야 보호된다" 계약(`apps/web/CLAUDE.md` 테스트 표). 새 경로를 목록에 더해야 하는지, 기존 패턴이 이미 덮는지 실측으로 적는다.
- **사용자가 설정 화면에 도달하는 길.** 백로그는 라우트·슬라이스 신설만 적고 진입점(대시보드 헤더·메뉴의 링크 등)은 적지 않았다. 링크 없이는
  가치가 나지 않으므로 어디에 두는지 정한다. 기존 대시보드 네비게이션 구조를 따르고, 새 UI 요소가 사용자에게 보이는 문구를 정확히 적는다.
- **업로드 폼 초기값의 데이터 흐름.** `UploadPodcast.tsx`는 클라이언트 컴포넌트다. 사용자 기본값을 서버에서 어떻게 읽어 초기 state로 넘기는지
  (페이지 서버 컴포넌트 → props 등), 로딩·실패 시 `?? DEFAULT_LANGUAGE` 등 시스템 기본으로 떨어지는지, 그리고 클립 수가 영상 길이 상한에 걸리면
  기존 `getMaxFeasibleClipCount` 하향 클램프가 기본값에도 그대로 적용되는지를 적는다. **업로드 폼에 "기본으로 저장" 버튼은 붙이지 않는다**(백로그).
- **계측.** `settings_viewed`(기존 `*_viewed` 발신 패턴을 따름)와 `settings_defaults_saved`(`source: "settings_page"`). `preset` 키는 캡션 기본값(FEAT-42)
  몫이라 이 항목에서는 싣지 않는다. 계측 실패가 저장을 막지 않게 한다.
- **캡션 섹션.** 백로그는 "캡션 섹션 자리는 비워두고 FEAT-42가 채운다"고 했다. 사용자에게 빈 섹션을 보여줄지, 아예 렌더하지 않을지 정한다
  (빈 제목만 있는 섹션은 사용자에게 의미가 없다는 점을 고려).
- **FSD 경계.** 새 `pages/settings` 슬라이스, `entities/user`의 서버 전용 API는 `server.ts` barrel 경유(루트 barrel 분할 규약,
  `apps/web/CLAUDE.md` 「Feature-Sliced Design」). `npm run check -w apps/web`의 `verify:fsd`로 확인한다.
- **테스트.** 판단 로직(값 검증, 기본값 → 폼 초기값 해석 등)은 순수 함수로 빼 `*.test.mjs`로 덮는다. 새 테스트 파일이 생기면 `apps/web/CLAUDE.md` 테스트 표
  행은 메인 루프가 인수 때 추가한다(web-dev는 그 파일을 못 쓴다). 현재 기준선: `npm test -w apps/web` **131**.
- **못 덮는 범위.** 실제 화면 렌더·저장 후 업로드 폼 반영·계측 행 생성은 배포 후 확인 — `docs/release-checks.md` FEAT-38 절의 "(FEAT-39 배포 후) 새 컬럼
  실사용" 줄이 이 항목에서 함께 닫힌다.

## 검증 필수 경로 확정 (2026-09-14, 카탈로그 `docs/plans/verification-paths.md`)

계획서 `8b0a31c`(수정 8 / 신규 6, 전부 `apps/web`). 항목 성격 → 경로:

- **1 인용 전수 대조** — 모든 항목.
- **2 스케치 추출·실행** — 신규 파일 6개 전체 스케치 + 기존 파일 수정 조각. 실제 트리에 적용해 `npm run check -w apps/web`·`npm test -w apps/web`, 끝나면 원복.
  `SettingsView`의 드롭다운 마크업은 계획서가 생략(`// ...`)했으므로 그 부분만 하니스가 `UploadPodcast.tsx:216-288` 패턴으로 채우고 그 사실을 적는다.
- **3 before/after 기계 적용** — `UploadPodcast.tsx`·`pages/dashboard/ui/index.tsx`·`app/dashboard/page.tsx` 수정.
- **4 전칭 여집합 열거** — "세 컬럼을 읽거나 쓰는 코드가 없다", "`app/dashboard/` 라우트는 `page`·`billing`·`uploads`뿐", `DashboardView`·`UploadPodcast` 소비자,
  `entities/user` 배럴 소비자, 라우트 보호 포섭.
- **5 돌연변이 검사** — 순수 함수 `resolveUploadDefaults`·`normalizeUploadDefaults` 신설. 「테스트」 명세를 실행 가능하게 옮겨 돌연변이를 심는다.
- **7 음성 시험** — FSD 경계 주장(W5·W6·W8 비위반)과 라우트 보호 근거(`middleware.test.mjs`)에 기댄다. 규칙을 어기게 심으면 검사가 실제로 실패하는지.
- **8 실물 렌더** — 새 화면(`SettingsView`)·헤더 링크·업로드 폼 초기값 표시.
- 6(외부 신호 해석 없음)·9(schema·config·생성 파일 변경 없음 — 계획서가 `schema.prisma` 무변경을 명시) 트리거 없음.

## 1라운드 (2026-09-14, 메인 루프 — 결함 5건, 일괄 편집)

하니스는 스크래치패드 `feat39/`에 있다(`apply.mjs` 추출·적용, `mutate.mjs`, `neg.mjs`, `render.mjs`, `restore.mjs` 원복). 계획서 코드 블록 13개를 바이트 그대로 뽑아 실제 트리에 적용했다.
`SettingsView`에서 계획서가 생략한 두 줄(atom 임포트 주석, 마크업 `// ...`)만 하니스가 채웠다.

- **경로 1 (인용 전수)** — 다시 읽고 내용까지 대조한 인용:
  - `UploadPodcast.tsx:3-15,29-37,63-65,67-75,102-106,216-288,278,284`, `constants.ts:27-28`, `clip-count-budget.ts:23`
  - `entities/user/api/index.ts:12-40,71-83`, `server.ts:4-15`, `index.ts:1-4`
  - `dashboard-header/ui/index.tsx:71-87,76-78`, `metadata.ts:58,63`, `AnalyticsTracker.tsx:18-31,22-24,26`
  - `middleware.ts:11-13`, `config.edge.ts:11,32-36`, `middleware.test.mjs:16-20`, `layout.tsx:20-24`, `auth-guard.ts:18`
  - `pages/dashboard/ui/index.tsx:37-43,45-50,122`, `app/dashboard/page.tsx:25-29,32-38`
  - `features/upload/model/schemas.ts:12` `prepareUploadSchema`, 원장 FEAT-38 절의 인용 줄 문구

  불일치는 하나다. 스케치 주석이 "Button atoms — `UploadPodcast.tsx:3-15`"인데 `Button` 임포트는 `:20`에 있다(**결함 E**).
- **경로 2 (스케치 실행)** — 신규 6, 수정 8 적용.
  - `npm run check -w apps/web` **EXIT 1**. `upload-defaults.ts:95-97`에서 `@typescript-eslint/no-unnecessary-type-assertion` 에러 3건이 났다. `normalizeUploadDefaults` 반환의 `as string | null` 등이 원인이다 —
    앞선 세 거부 분기가 이미 타입을 좁혀서 단언이 아무것도 바꾸지 않는다. lint 실패로 tsc까지 가지 못했다(**결함 A**, FEAT-10 ⑯과 같은 종류).
  - `npm test -w apps/web` 142/142 = 기준선 131 + 명세 11.
- **경로 3 (before/after)**
  - 바이트 일치: `UploadPodcast.tsx` interface, 시그니처(`...` 사이 두 조각), `pages/dashboard/ui/index.tsx:37-43`.
  - **`app/dashboard/page.tsx` Promise.all before는 바이트 일치 0회.** 스케치가 들여쓰기 2칸을 뺀 채 적혀 있었다(2칸 보정 시 1회)(**결함 D**).
  - `entities/user/index.ts`의 현재 내용은 "`export {}`(및 위 3줄 주석)" 서술과 정확히 같다.
- **경로 4 (여집합)**
  - 세 컬럼 참조: `apps/**`·`packages/db/src`에서 0건(스키마·생성물 제외) → "읽거나 쓰는 코드 없음" 성립.
  - `app/dashboard/` 라우트: `page.tsx`·`billing/`·`uploads/[uploadedFileId]/`. 그 밖엔 비라우트 `layout`·`error`·`loading`만 있다.
  - `DashboardView` 소비자는 `app/dashboard/page.tsx` 하나, `UploadPodcast` 소비자는 `pages/dashboard/ui/index.tsx` 하나 → 필수 prop 추가 안전.
  - `~/fsd/entities/user` 루트 배럴 임포트 0건(전부 `/server`, 8건) → `export {}` 교체 안전.
  - 기존 transition의 실패 처리: `SubscriptionStatus`·`PlanCard`가 스케치와 같이 try 없이 쓴다(액션이 throw하면 `app/dashboard/error.tsx`가 받는다). 패턴이 일치한다.
- **경로 5 (돌연변이)** — 명세 11케이스를 옮긴 테스트에 돌연변이 23종을 심었다. 16 사멸, 7 생존.
  - 생존 중 4(R8·R9 resolve의 null 검사 제거, N10·N11 typeof 제거)는 등가다. `Set.has`가 null·타입 불일치에 이미 false를 돌려주고, tsc도 `has(unknown)`을 거부한다.
  - **N4~N6(`!== null` → `!= null`) 생존은 명세 구멍이다.** 누락(`undefined`) 필드가 검증을 통과하면 Prisma `update`가 그 컬럼을 조용히 건너뛰는 부분 갱신이 된다.
    스케치 주석은 "잘못된 타입은 거부"라고 하는데 이를 고정하는 케이스가 없다(**결함 B**).
- **경로 7 (음성 시험)**
  - FSD: 네 규칙을 일부러 어겨 모두 exit 1로 검출됐다.
    - W5 — `entities/user/index.ts`가 `./api`를 재수출
    - W6 — `pages/settings`가 `entities/user/model/…`을 직접 임포트
    - W8 — `features/settings/api`가 `db` 값을 임포트
    - W1 — `entities/user/api`가 `features/settings`를 임포트

    대조군(적용 트리 그대로, 계획서 경로 `features/settings/api`)은 exit 0.
  - `middleware.test.mjs`: matcher 접두사를 잃게 하면(`/dash/:path*`) fail 1로 검출된다.
  - **그러나 matcher를 정확 경로 `"/dashboard"`로 좁혀도 pass 3/3이다.** 「현재 동작」의 "`matchesPattern`이 … 이미 보장한다"는 `/dashboard/settings` 보호의 근거로는 과장이다.
    결론(변경 불필요)은 `middleware.ts:12`의 실제 `:path*` 패턴과 레이아웃·페이지 가드로 성립한다(**결함 C**, 근거 서술).
- **경로 8 (실물 렌더)** — tsx에 `jsx: react-jsx` 임시 tsconfig를 주고, 서버 전용·Next 런타임·드롭다운 atom만 스텁하는 resolve 훅을 걸어 `renderToStaticMarkup`으로 렌더했다.
  - `SettingsView`: 초기값 Korean/2/true → 트리거 `Korean`·`2 clips`·`Review first`. English/1/false → `English`·`1 clip`·`Auto`. 계획서 문구 15개 전부 존재, 캡션 섹션 없음.
  - `DashboardHeader`: 메뉴가 `email|Settings|Billing|Sign out` 순서, `href="/dashboard/settings"`.
  - `UploadPodcast`: 렌더 성공. 옵션 행이 `files.length > 0`일 때만 그려져 초기값은 정적 렌더로 볼 수 없다 — prop 배선은 경로 2의 tsc가 덮는다.
  - `getRouteEventName`: 트리 파일의 본문을 트랜스파일해 실행했다. `/dashboard/settings`(끝 `/`·쿼리 포함) → `settings_viewed`. `/dashboard`·`/dashboard/billing`·`/dashboard/uploads/abc`(→ null)·`/pricing`은 기존 값 그대로.

**수정안 실측(계획서 편집 전)**: A·B를 적용 트리에 시험 적용했다.
- `npm run check -w apps/web` **EXIT 0** — verify:fsd 통과, ESLint 경고·에러 0, tsc 0.
- `npm test -w apps/web` **143/143**.
- 돌연변이 23종 중 생존 4, 전부 위의 등가. N4~N6은 사멸.

**일괄 편집 1회** (계획서):
- A: 반환 단언 제거 → `return { defaultLanguage, defaultClipCount, defaultReviewBeforeGenerate };`, 왜 단언이 없는지 주석.
- B: 「테스트」에 필드 누락 거부 케이스(세 필드 각각)와 그 근거.
- C: 라우트 보호 근거 서술을 정밀화(포섭 근거는 `middleware.ts:12` 실제 패턴, 테스트의 한계는 실측값과 함께).
- D: `app/dashboard/page.tsx` before/after를 트리 들여쓰기로 맞추고 인용을 `:25` → `:25-29`로.
- E: Button 인용 `:3-15` → `:3-15·20`.

원복은 `restore.mjs`. 편집이 있었으므로 준비 상태가 리셋됐다 → 2라운드 무편집 재실행.

## 2라운드 (2026-09-14, 메인 루프 — 무편집, 무소득)

편집한 계획서(`0e25125`)를 1라운드와 같은 하니스로 처음부터 다시 적용·실행했다. 계획서는 고치지 않았다.

- **경로 1**: 편집으로 새로 생긴 인용 `middleware.ts:12`(`matcher: ["/dashboard/:path*", "/login"]`), `app/dashboard/page.tsx:25-29`, `UploadPodcast.tsx:3-15·20`(`Button`은 `:20`) 일치.
  나머지 인용은 1라운드 대조 뒤 트리 변경이 없다(`apps/web/src` 커밋 무변경).
- **경로 2**: 신규 6, 수정 8 적용. `npm run check -w apps/web` **EXIT 0**(verify:fsd 통과, ESLint 경고·에러 0, tsc 0), `npm test -w apps/web` **143/143**(131 + 명세 12).
- **경로 3**: `app/dashboard/page.tsx` Promise.all before가 이제 **바이트 일치 1회**(들여쓰기 보정 0회). 나머지 before도 1라운드와 같이 일치.
- **경로 4**: 1라운드 열거 뒤 해당 트리 변경 없음. 편집이 새 전칭을 들이지 않았다(C는 반대로 전칭을 좁혔다).
- **경로 5**: 돌연변이 23종, 생존 4(R8·R9·N10·N11 — 전부 등가). N4~N6은 새 누락 케이스로 사멸.
- **경로 7**: W5·W6·W8·W1 위반 모두 exit 1로 검출, 대조군 exit 0. middleware 접두사 상실은 검출되고, 정확 경로로 좁히는 경우는 통과 — 계획서가 이제 이 한계를 그대로 적는다.
- **경로 8**: 렌더 실패 0(`SettingsView` 초기값·문구, 헤더 `Settings` 순서, `UploadPodcast` 렌더, 라우트 이벤트 매핑).

원복 후 `git status` 결과: `apps/web/src` 변경 0. 남은 것은 무관한 `apps/web/.claude/settings.local.json`과 `nul`뿐이다(둘 다 이 작업 전부터 있었다).
메인 루프 라운드가 무소득이 됐으므로 `plan-verifier` 독립 무편집 패스를 디스패치한다. 브리핑은 항목ID, 계획서 경로, 필수 경로 목록만 담는다.

## plan-verifier 1사이클 (2026-09-14) — 결함 0건, 그러나 무판정

- **브리핑**: 항목ID, 계획서 경로, 필수 경로 1·2·3·4·5·7·8만 전달했다. 검증자도 계약 위반 없음을 확인했다. 저장소 변경은 0이다(검증 뒤 `git status`: 이 작업과 무관한 `settings.local.json`·`nul`뿐).
- **보고**: 결함 0건. 경로별 증거는 다음과 같다.
  - 1: 인용 전수 일치, W1·W5·W6·W8 서술을 검사기 본문과 대조.
  - 2: `upload-defaults.ts` 추출본을 프로젝트 strictness로 tsc exit 0. `as` 없는 반환이 대입 가능함 확인.
  - 3: before 세 블록 바이트 일치.
  - 4: 세 컬럼 참조 0, 이벤트 발신 0, 신규 슬라이스 부재.
  - 5: 누락 필드 케이스가 `!= null` 돌연변이를 사멸, 나머지 케이스는 그 돌연변이를 못 죽임을 실측.
  - 7: 라우트 보호 포섭과 테스트 사각 서술이 정확함.
- **[실행하지 못한 경로] 8 (부분)**: `SettingsView`의 마크업이 계획서에 없다(`// ... Card + 세 드롭다운 …`). 그래서 렌더할 대상이 없었다.
- **판정**: `plan-verifier.md:46` "실행하지 못한 경로가 있는 보고는 무소득 보고가 아니다" → **클린 패스 아님**.
  구현 영향 결함 보고가 아니므로 정지 규칙의 3사이클 계수에도 넣지 않는다.
- **조치**: 원인은 계획서 쪽이다 — 화면 변경의 마크업을 생략해 경로 8을 실행할 수 없게 만들었다. 1·2라운드에서 lint·tsc·렌더를 통과한 하니스 완성본을 계획서에 넣었다.
  - 원자 컴포넌트 임포트 3개(주석 1줄을 대체)
  - `return (...)` 마크업 전체
  - 절 머리 문구를 "핵심 로직·문구만" → "마크업까지 전부"로

  계획서 편집이므로 준비 상태가 리셋된다 → 메인 루프 3라운드 무편집 재실행 후 `plan-verifier`를 새로 디스패치한다.

## 3라운드 (2026-09-14, 메인 루프 — 무편집, 무소득)

마크업을 넣은 계획서를 같은 하니스로 처음부터 재적용했다. 이번엔 `apply.mjs`가 `SettingsView` 블록을 **바이트 그대로** 쓴다. 생략 표지(`// ...`)가 남아 있으면 적용이 실패하도록 가드도 걸었다. 하니스 작성분은 0이다.

- 적용 전 `git status`: `apps/web/src` 변경 0 → 검증자 무수정을 직접 확인했다.
- **경로 1**: 이번 편집은 인용을 새로 들이지 않았다(원자 임포트 경로 `shared/ui/atoms/{button,card,dropdown-menu}`는 `UploadPodcast.tsx:3-15·20`과 같은 경로, 실재).
- **경로 2·3**: 신규 6, 수정 8 적용. before 바이트 일치. `npm run check -w apps/web` **EXIT 0**(ESLint 0, tsc 0), `npm test -w apps/web` **143/143**.
- **경로 5**: 생존 4, 전부 등가(R8·R9·N10·N11).
- **경로 7**: W5·W6·W8·W1 위반 모두 검출, 대조군 통과, middleware 두 관측 동일.
- **경로 8**: 계획서 마크업 그대로 렌더. 문구·초기값 트리거·캡션 섹션 부재·헤더 순서·라우트 이벤트 매핑 전부 통과(실패 0).

원복 후 `apps/web/src` 변경 0. → `plan-verifier` 2사이클 디스패치(브리핑은 1사이클과 동일, 직전 결과는 주지 않음).
