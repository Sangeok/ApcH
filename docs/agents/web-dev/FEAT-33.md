# FEAT-33 — widgets 슬라이스 Public API 배럴 7개 신설 + 인트라 슬라이스 절대경로 자기참조 10건 정리

## 2026-09-05 구현 (web-dev)

계획서 `docs/plans/FEAT-33.md`를 파일에서 다시 읽고, 「현재 동작」이 코드와 일치함을 구현 전에 확인한 뒤 스케치 그대로 구현했다. 스케치와의 차이 없음(분기·조건·리터럴·문구 모두 동일 — 이 항목은 import specifier 교체와 배럴 재수출뿐이라 로직 변경이 없다).

### 고친 파일 전수 (신규 7 + 수정 15 = 22)

**신규 — widgets 배럴 7개**

| 파일 | 내용 |
| --- | --- |
| `apps/web/src/fsd/widgets/clip-display/index.ts` | `export { default as ClipDisplay } from "./ui";` |
| `apps/web/src/fsd/widgets/clip-draft-review/index.ts` | `export { default as ClipDraftReviewSection } from "./ui";` |
| `apps/web/src/fsd/widgets/dashboard-header/index.ts` | `export { default as DashboardHeader } from "./ui";` |
| `apps/web/src/fsd/widgets/login-form/index.ts` | `export { default as LoginForm } from "./ui";` |
| `apps/web/src/fsd/widgets/site-footer/index.ts` | `export { default as SiteFooter } from "./ui";` |
| `apps/web/src/fsd/widgets/uploaded-file-list/index.ts` | `export { default as UploadedFileList } from "./ui";` |
| `apps/web/src/fsd/widgets/site-header/index.ts` | `export { default as PublicHeader } from "./ui/public-header";` (그 슬라이스엔 `ui/index.tsx`가 없어 `./ui/public-header`를 가리킴) |

**수정 — 슬라이스 밖 참조 9곳 (7개 파일): default import → 배럴 named import**

- `apps/web/src/app/page.tsx:8` — `PublicHeader` → `import { PublicHeader } from "~/fsd/widgets/site-header";`
- `apps/web/src/app/dashboard/layout.tsx:5` — `DashboardHeader` → `~/fsd/widgets/dashboard-header`
- `apps/web/src/app/login/page.tsx:3` — `LoginForm` → `~/fsd/widgets/login-form`
- `apps/web/src/app/(public-marketing)/layout.tsx:1,2` — `SiteFooter`·`PublicHeader` → 각 배럴
- `apps/web/src/fsd/pages/upload-detail/ui/index.tsx:21,22` — `ClipDisplay`·`ClipDraftReviewSection` → 각 배럴
- `apps/web/src/fsd/pages/dashboard/ui/index.tsx:32` — `UploadedFileList` → `~/fsd/widgets/uploaded-file-list`
- `apps/web/src/fsd/pages/home/ui/index.tsx:2` — `SiteFooter` → `~/fsd/widgets/site-footer`

**수정 — 인트라 슬라이스 자기참조 10건 (8개 파일): 절대경로 → 상대경로**

clip-display 7건:
- `ui/_component/ClipCard.tsx:13,14` — `clip-rationale`·`subtitle-status` → `../../model/...`
- `ui/_component/YoutubeMetadataModal.tsx:19` — `../../model/useMetadataClipboard`
- `ui/_component/ScriptModal.tsx:6` — `../../model/use-script-clipboard`
- `ui/_component/CopyButton.tsx:3` — `../../model/useMetadataClipboard` (type import)
- `model/useMetadataClipboard.ts:7,8` — `copy-to-clipboard`·`format-metadata` → `../lib/...`

features/billing 3건:
- `ui/SubscriptionStatus.tsx:26` — `../api`
- `ui/PlanCard.tsx:14` — `../api`
- `ui/OrderHistory.tsx:17` — `../model/types` (type import)

계획서가 범위 밖으로 명시한 `pages/pricing/ui/index.tsx:3`의 `~/fsd/features/billing/config/plan-tiers` 크로스 슬라이스 참조는 **건드리지 않았다**(FEAT-34 선행 대상으로 백로그 기록됨).

### 검증 (네 검증의 실제 출력)

1. **`npm run check -w apps/web`** (`next lint && tsc --noEmit`) — EXIT 0
   ```
   ✔ No ESLint warnings or errors
   check exit: 0
   ```
2. **`npm test -w apps/web`** — EXIT 0, 77 pass / 0 fail (로직 무변경으로 77개 유지)
   ```
   # tests 77
   # pass 77
   # fail 0
   test exit: 0
   ```
3. **`npm run build -w apps/web`** — EXIT 0 (전 라우트 프리렌더/번들 정상, RSC 경계 통과)
   ```
   build exit: 0
   ```
   빌드 산출물 `.next/`는 검증 후 제거해 트리를 청결히 남겼다(gitignore 대상, 프로브 없음).
4. **계획서가 정한 기계 검증** (변경 후):
   - 배럴 존재: `find apps/web/src/fsd/widgets -maxdepth 2 -name index.ts | wc -l` → **7** (현재 0에서)
   - 외부 세그먼트 직접 참조 소멸: `grep -rn '~/fsd/widgets/[a-z-]\+/\(ui\|model\|lib\|config\)' apps/web/src` → **0** (grep exit 1, 매치 없음)
   - billing 자기참조 소멸: `grep -rn '~/fsd/features/billing/\(api\|model\|config\)' apps/web/src/fsd/features/billing` → **0** (grep exit 1)

### 테스트로 못 덮은 범위 (배포 확인 원장 이관 대상)

- `npm test`는 tsx Node 러너로 DOM·React 테스트 도구가 없어 **위젯의 실제 렌더를 확인하지 못한다.** import 경로만 바뀌고 컴포넌트 본문은 불변이므로 렌더 결과는 동일해야 하지만, 그 동일성은 `tsc`의 모듈 해석 + `npm run build`의 RSC 경계 통과로만 간접 확인된다. 배포 실물에서 확인할 화면: 홈(`/`, PublicHeader·SiteFooter), 마케팅 레이아웃(`(public-marketing)`, PublicHeader·SiteFooter), 로그인(`/login`, LoginForm), 대시보드(`/dashboard`, DashboardHeader·UploadedFileList), 업로드 상세(`/dashboard/uploads/[id]`, ClipDisplay·ClipDraftReviewSection), 결제(`/dashboard/billing`, billing UI 3종). 이 여섯 지점이 배럴 경유로 정상 마운트되는지가 배포 후 육안 확인 대상이다.
- **배럴이 앞으로도 유일한 경로로 강제되는지**(세그먼트 직접 참조 재발 자동 차단)는 이 항목이 아니라 FEAT-34(경계 자동 검출)의 몫이라 여기서 덮지 않는다. 현재는 위의 grep 스냅샷(0건)이 시점 증거일 뿐이다.

### 스케치 대비 차이 / 보류 지점

없음. 계획서 「구현 스케치」와 문자 그대로 일치한다. 범위 밖 의존 없음(모든 변경이 `apps/web/src` 안, `packages/db`·다른 워크스페이스·스키마 무관).
