# FEAT-14 — `/pipeline` 기록 열람을 대시보드 안에서

## 2026-08-20 — 구현 (게이트②, 완료)

계획서 `docs/plans/FEAT-14.md`(검증 클린 패스본)를 그대로 이식했다. `/pipeline` 브리핑 안에
내부 문서 뷰어 catch-all 라우트를 추가하고, 항목 카드에 실재하는 문서 링크(계획서·행위자 기록)를
얹고, 책상 아래 파일명 나열을 "기록 N건"으로 줄였다. 의존성 추가 없음(순수 GFM 렌더러).

### 고친 파일 (신규 14 / 수정 11)

신규:
- `src/fsd/entities/repo-doc/config/github.ts` — raw 내용·plans 목록·blob 원문 URL 상수(owner/repo/branch는 pipeline과 동일).
- `src/fsd/entities/repo-doc/model/doc-location.ts` — 순수: `locationFromSlug`·`isWhitelistedDocPath`·href 빌더·`docLinksForItem`.
- `src/fsd/entities/repo-doc/model/doc-location.test.mjs` — 위 순수 함수 계약.
- `src/fsd/entities/repo-doc/model/markdown.ts` — 순수: `escapeHtml`·`renderInline`·`renderMarkdown`(GFM 부분집합 → sanitized HTML).
- `src/fsd/entities/repo-doc/model/markdown.test.mjs` — 렌더·이스케이프·XSS·표 파이프 이스케이프·자리표시자/NUL 충돌 회귀.
- `src/fsd/entities/repo-doc/api/queries.ts` — 서버: `getDocContent`·`getPlanDocIds`. **신규 fetch owner.**
- `src/fsd/entities/repo-doc/api/queries.test.mjs` — `server-only`·`~/env` module mock + `globalThis.fetch` stub/restore.
- `src/fsd/entities/repo-doc/api/index.ts` — api segment public entry.
- `src/fsd/entities/repo-doc/index.ts` — slice root(model·config만 재수출, api는 안 함 — agent-report 패턴).
- `src/fsd/pages/doc-viewer/model/build-doc-view.ts` — 순수: `dossierTabs`·`buildDocView`.
- `src/fsd/pages/doc-viewer/model/build-doc-view.test.mjs` — 탭·배지·상태/게이트/반려·고정명 계약.
- `src/fsd/pages/doc-viewer/ui/index.tsx` — `DocViewer` 서버 컴포넌트(서류철 헤더 + `dangerouslySetInnerHTML` 시트).
- `src/fsd/pages/doc-viewer/index.ts` — page root.
- `src/app/(protected)/pipeline/docs/[...slug]/page.tsx` — 뷰어 라우트(`requireAdmin`·`force-dynamic`·slug 검증·fetch·렌더).

수정:
- `src/fsd/entities/pipeline/model/board.ts` — `latestItemById` 추가(첫 등장=최신).
- `src/fsd/entities/pipeline/model/board.test.mjs` — `latestItemById` 케이스(+1 suite).
- `src/fsd/entities/pipeline/index.ts` — `latestItemById` 재수출.
- `src/fsd/pages/pipeline/model/briefing.ts` — `SpeechItem.docs`·`buildBriefing` 선택 `docs` 인자·`docResolver`.
- `src/fsd/pages/pipeline/model/briefing.test.mjs` — docs 링크 단언(안 넘기면 `[]`, 넘기면 항목 링크).
- `src/fsd/pages/pipeline/ui/index.tsx` — `DocLinks` 렌더(InboxCard·FeedZone), `next/link` 임포트.
- `src/fsd/pages/pipeline/ui/_component/pixel-office.tsx` — `DeskReports`를 "기록 N건" 텍스트로 교체.
- `src/app/(protected)/pipeline/page.tsx` — `getPlanDocIds()` 병렬 추가, `buildBriefing`에 `{ planDocIds, reports }` 전달.
- `src/styles/globals.css` — `@layer components`에 `.doc-prose` 요소 규칙(기존 토큰만 사용).
- `scripts/verify-fsd-boundaries.mjs` — `FSD_EFFECT_OWNERS.fetch`에 repo-doc owner(5→6), `REQUIRED_FINAL_FILES`에 신규 index·뷰어 라우트 4개.
- `scripts/verify-fsd-boundaries.test.mjs` — repo-doc owner 전용 contract test + owner 밖 fetch → R13 mutation fixture.

### 스케치 대비 차이

프로덕션 코드는 스케치대로 바이트 이식했다(분기·조건·리터럴·사용자 노출 문구 전부 그대로). 예외/보완:

- **§3 `markdown.ts`의 코드 슬롯 자리표시자 치환**: 스케치는 `.replaceAll(CODE_SLOT, "�")`로 적혀 있고, 소스에는 동일 런타임 값인 U+FFFD 리터럴 문자를 넣었다. 내부 sentinel이라 사용자에게 보이지 않고 런타임 문자열이 동일해 동작 차이 없음(markdown.test.mjs의 NUL 충돌 회귀 단언이 이 동등성을 고정).
- **§6 `doc-viewer/ui/index.tsx`는 프로세 명세**라 마크업을 직접 작성했다. 구조·리터럴 요점은 명세대로: `bg-stamp-soft`/`font-briefing-display` 서류철 헤더, 뒤로가기 `/pipeline`, 종류 배지(plan=`border-stamp text-stamp`/report=`border-hold text-hold`), 상태 칩(text-xs muted), `GateTransitionButton`/`RejectActions`(둘 다 gate feature public root, `itemId`·`status`·`gateLabel`은 `?? ""`로 non-null 좁힘 — 기존 pipeline ui:169 패턴), 탭 스트립(`next/link`·active면 `bg-briefing`·`border-b-0`), 시트 `<article className="doc-prose ..." dangerouslySetInnerHTML>`. 스케치가 지시한 `status={status!}` 대신 `?? ""`를 썼다(기존 pipeline ui 관례, 비-null 어서션 회피). 사용자 노출 문구·분기는 명세대로.
- **FeedZone `DocLinks`**: `<details>` 내부 detail 아래에 `pl-11` 래퍼로 감싸 아바타 들여쓰기와 정렬(구조 정합, 분기·문구 불변).
- **boundary test mutation fixture**: `FSD_EFFECT_OWNERS`가 주입 불가라(모듈 상수), 기존 테스트 line 151 패턴대로 "owner 밖 repo-doc 경로의 fetch → R13" 픽스처로 등록의 필요성을 고정했다. `--final` owner 집합 정확 일치는 실제 `verify:fsd:final` 실행이 검증한다.

### 검증 (직접 실행, 넷 다 EXIT 0)

- `npm run check -w apps/admin` — EXIT 0. verify:fsd:test 13/13, verify:fsd(migration) 통과, ESLint 0 warnings/errors, `tsc --noEmit` 0.
- `npm test -w apps/admin` — EXIT 0. **247 pass / 51 suites / 0 fail**(마이그레이션 전 187/40에서 증가). src 테스트 파일 25개(신규 4).
- `npm run verify:fsd:final -w apps/admin` — EXIT 0. fetch owner 정확히 6.
- `SENTRY_DISABLE_AUTO_UPLOAD=true npm run build -w apps/admin` — EXIT 0. route 목록에 `ƒ /pipeline/docs/[...slug]`(366 B, First Load 128 kB) 존재.

첫 ESLint 실행에서 잡힐 수 있던 항목(startsWith/includes/옵셔널 체이닝)은 스케치가 이미 그렇게 작성돼 있어 무수정 통과.

### 테스트로 못 덮은 범위 (Node 러너·DOM/외부 I/O 없음 — 배포 후 데스크톱+폰 수동 smoke, 미실행)

- `DocViewer` 서버 렌더·`dangerouslySetInnerHTML` 시각 결과·`.doc-prose` 요소 스타일(명조 제목·표 하드라인·오커 인용·모노 코드)·서류철 탭 활성 시각·반응형(`max-w-3xl`·375px).
- 헤더 `GateTransitionButton`/`RejectActions` 클라 상호작용(useTransition·toast·router.refresh) — 기존 컴포넌트(FEAT-08/09에서 이미 못 덮음).
- `next/link` 카드 링크 네비게이션·`DocLinks` 렌더.
- 실제 raw CDN fetch·contents API 응답(module-mock로 호출 계약만 확인).
- raw CDN 잔상: max-age=300이라 게이트 커밋 후 최대 5분간 뷰어 상태 칩·문서 본문이 옛 값이거나 404(→ Next 404)일 수 있음(FEAT-10 결정 6, 범위 밖·후속).
- 계획서 「테스트」 절의 배포 후 smoke 목적지 1~6(인가 보호·카드 링크·plan/report 렌더·화이트리스트 밖 404·게이트 가시성)은 인가된 브라우저가 있는 배포 후 검증 대상. 구현 세션에서 실행 불가 — 미실행 handoff. 6의 게이트/반려 클릭은 실제 `PROJECT_BOARD.md` 외부 효과라 승인 없이 실행하지 않았다.

### handoff — 읽기 전용 `apps/admin/CLAUDE.md` (메인 루프가 동기화)

수정 권한 밖이라 직접 고치지 않고 두 갱신을 보고한다:

1. 「테스트 인벤토리」(:35) — `21개 파일, 40개 suite, 187개 test` → **25개 파일, 51개 suite, 247개 test**. 신규 4행:
   - `…/entities/repo-doc/model/doc-location.test.mjs`(slug 화이트리스트·traversal 차단·형제 링크 순서)
   - `…/entities/repo-doc/model/markdown.test.mjs`(GFM 렌더·XSS escape·표 이스케이프 파이프·자리표시자/NUL 회귀)
   - `…/entities/repo-doc/api/queries.test.mjs`(화이트리스트 가드·raw 404→null·비-OK throw·plan ID 필터·Bearer)
   - `…/pages/doc-viewer/model/build-doc-view.test.mjs`(배지·게이트②만·형제 탭·고정명 단독)
   그리고 기존 `board.test.mjs`에 `latestItemById`, `briefing.test.mjs`에 docs 링크 단언 추가.
2. 「데이터와 외부 효과 소유권」(:99-107)에 여섯 번째 fetch owner 한 줄 추가 — `repo-doc GET owner는 src/fsd/entities/repo-doc/api/queries.ts다(FEAT-14, 읽기 전용: 문서 raw 내용 + docs/plans 목록)`. 바로 아래 "GitHub 쓰기 두 경로…" 문장은 새 owner가 읽기라 그대로 둔다.
