# FEAT-33: widgets 슬라이스 Public API — 배럴 `index.ts` 7개 신설 + 인트라 슬라이스 절대경로 자기참조 10건 정리

agent: web-dev

## 현재 동작

`apps/web/src/fsd/widgets`의 7개 슬라이스(clip-display, clip-draft-review, dashboard-header, login-form, site-footer, site-header, uploaded-file-list)에는 루트 `index.ts`가 **하나도 없다**. `find apps/web/src/fsd/widgets -maxdepth 2 -name index.ts` 결과 0건이며, 슬라이스 세그먼트는 `ui`·`model`·`lib`·`config`뿐이다(전체 파일 목록으로 확인). 대조군으로 `entities`는 8/8(`entities/*/index.ts` 8개 직접 확인), `features`는 9/9가 배럴을 갖는다.

배럴이 없으므로 슬라이스 **밖**에서 세그먼트 내부 파일을 직접 참조한다. `grep -rn "fsd/widgets"`가 잡은 16개 참조 중 슬라이스 밖 참조는 **9곳**이며, 전부 `import X from "~/fsd/widgets/<슬라이스>/ui..."` 형태의 default import다.

- `src/app/page.tsx:8` — `import PublicHeader from "~/fsd/widgets/site-header/ui/public-header";`
- `src/app/dashboard/layout.tsx:5` — `import DashboardHeader from "~/fsd/widgets/dashboard-header/ui";`
- `src/app/login/page.tsx:3` — `import LoginForm from "~/fsd/widgets/login-form/ui";`
- `src/app/(public-marketing)/layout.tsx:1` — `import SiteFooter from "~/fsd/widgets/site-footer/ui";`
- `src/app/(public-marketing)/layout.tsx:2` — `import PublicHeader from "~/fsd/widgets/site-header/ui/public-header";`
- `src/fsd/pages/upload-detail/ui/index.tsx:21` — `import ClipDisplay from "~/fsd/widgets/clip-display/ui";`
- `src/fsd/pages/upload-detail/ui/index.tsx:22` — `import ClipDraftReviewSection from "~/fsd/widgets/clip-draft-review/ui";`
- `src/fsd/pages/dashboard/ui/index.tsx:32` — `import UploadedFileList from "~/fsd/widgets/uploaded-file-list/ui";`
- `src/fsd/pages/home/ui/index.tsx:2` — `import SiteFooter from "~/fsd/widgets/site-footer/ui";`

> **백로그 수치 정정**: 백로그는 upload-detail을 `:20,21`로 인용했으나 실제는 `:21,22`다(파일을 읽어 확인). 참조 대상·개수(9곳)는 일치한다.

6개 슬라이스의 `ui/index.tsx`가 `export default function`이다: `clip-display/ui/index.tsx:11`(ClipDisplay), `clip-draft-review/ui/index.tsx:90`(ClipDraftReviewSection), `dashboard-header/ui/index.tsx:24`(DashboardHeader), `login-form/ui/index.tsx:16`(LoginForm), `site-footer/ui/index.tsx:47`(SiteFooter), `uploaded-file-list/ui/index.tsx:8`(UploadedFileList). 각 파일을 직접 읽어 default 형태와 컴포넌트명을 확인했다.

site-header는 다른 구조다: `ui/index.tsx`가 없고 `ui/public-header.tsx:24`에 `export default function PublicHeader`가 있으며, 같은 `ui/_component/HeaderAuthMenu.tsx:31`은 named export지만 슬라이스 밖에서 참조되지 않는다(grep으로 외부 참조 0건). 즉 site-header의 공개 대상은 `PublicHeader` 하나이고, 배럴은 `./ui`가 아니라 `./ui/public-header`를 가리켜야 한다.

슬라이스 **안**에서 절대경로(`~/fsd/...`)로 자기 자신을 참조하는 곳은 **10건**이다.

clip-display 7건(전부 grep으로 현재 줄 확인):
- `widgets/clip-display/ui/_component/YoutubeMetadataModal.tsx:19` → `~/fsd/widgets/clip-display/model/useMetadataClipboard`
- `widgets/clip-display/ui/_component/ScriptModal.tsx:6` → `~/fsd/widgets/clip-display/model/use-script-clipboard`
- `widgets/clip-display/ui/_component/CopyButton.tsx:3` → `~/fsd/widgets/clip-display/model/useMetadataClipboard` (type import)
- `widgets/clip-display/ui/_component/ClipCard.tsx:13` → `~/fsd/widgets/clip-display/model/clip-rationale` (10~13행 다중행 import의 specifier)
- `widgets/clip-display/ui/_component/ClipCard.tsx:14` → `~/fsd/widgets/clip-display/model/subtitle-status`
- `widgets/clip-display/model/useMetadataClipboard.ts:7` → `~/fsd/widgets/clip-display/lib/copy-to-clipboard`
- `widgets/clip-display/model/useMetadataClipboard.ts:8` → `~/fsd/widgets/clip-display/lib/format-metadata`

features/billing 3건(grep으로 현재 줄 확인):
- `features/billing/ui/SubscriptionStatus.tsx:26` → `~/fsd/features/billing/api`
- `features/billing/ui/PlanCard.tsx:14` → `~/fsd/features/billing/api`
- `features/billing/ui/OrderHistory.tsx:17` → `~/fsd/features/billing/model/types` (type import)

> **백로그 수치 정정**: 백로그는 OrderHistory를 `:16`으로 인용했으나 실제는 `:17`이다. 대상 슬라이스·개수(10건)는 일치한다. ClipCard.tsx:9는 이미 `../../model/use-script-clipboard` 상대경로라 자기참조 위반에서 제외된다 — 같은 파일 안에서 상대(9행)와 절대(13·14행)가 섞여 있어 정리 대상이 되는 부류다.

이 클래스 문제의 규약 근거는 `apps/web/docs/conventions/fsd-architecture-guidelines.md`의 **§5 「의존성 규칙」 3번 「Public API」**(219-223행: "각 Slice는 반드시 `index.ts` 파일을 통해 외부로 노출할 요소만 export", "외부에서는 Slice의 내부 파일에 직접 접근하지 말고 Public API를 통해 접근")이다. 이 저장소 문서들이 쓰는 `§5.3` 표기가 가리키는 곳이며(같은 표기법으로 `§5.1`=Linear Flow, `§5.4`=도메인 데이터 접근 위임), 규약 문서에 문자 그대로의 "5.3" 소제목은 없다. 인트라 슬라이스 자기참조는 §5.3 위반은 아니고 제안서 V11b가 든 권장 사항이다.

## 문제

백로그(FEAT-33 `source`)와 제안서 3-4·V11b가 지목한 문제는 "widgets 슬라이스에 Public API 경계가 없어 상위 레이어가 위젯 내부 파일 배치에 직접 결합돼 있다"이다. 「현재 동작」에서 확인했듯 배럴 0/7이라, `site-header/ui/public-header.tsx`의 이름·위치를 바꾸면 `src/app` 두 곳(`page.tsx:8`, `(public-marketing)/layout.tsx:2`)을 함께 고쳐야 하고, `clip-display`의 `model`·`lib` 파일명 변경도 슬라이스 밖으로 새어 나간다. 배럴을 세우고 외부 참조 9곳을 배럴 경유로 돌리면 이 결합이 끊긴다.

인트라 슬라이스 자기참조 10건은 별개의 §5.3 위반이 아니라 권장 사항 미준수지만, 같은 리팩터(FSD import 경로 위생)의 같은 파일 부류라 함께 묶는다 — 근거는 「고칠 파일」 아래 스케치에 적는다.

백로그가 지목한 것과 코드에서 확인한 것 사이의 어긋남은 없다. 다만 인용 줄 두 곳(upload-detail, OrderHistory)이 낡아 「현재 동작」에서 실측치로 정정했다.

## 고칠 파일

**신규 — widgets 배럴 7개**

| 파일 | 변경 |
| --- | --- |
| `src/fsd/widgets/clip-display/index.ts` `(신규)` | `ClipDisplay`(default) 재수출 배럴 |
| `src/fsd/widgets/clip-draft-review/index.ts` `(신규)` | `ClipDraftReviewSection`(default) 재수출 |
| `src/fsd/widgets/dashboard-header/index.ts` `(신규)` | `DashboardHeader`(default) 재수출 |
| `src/fsd/widgets/login-form/index.ts` `(신규)` | `LoginForm`(default) 재수출 |
| `src/fsd/widgets/site-footer/index.ts` `(신규)` | `SiteFooter`(default) 재수출 |
| `src/fsd/widgets/uploaded-file-list/index.ts` `(신규)` | `UploadedFileList`(default) 재수출 |
| `src/fsd/widgets/site-header/index.ts` `(신규)` | `PublicHeader`(default) 재수출 — `ui/index.tsx`가 없어 `./ui/public-header`를 가리킨다 |

**수정 — 슬라이스 밖 참조 9곳(7개 파일): default import → 배럴 named import**

| 파일 | 변경 |
| --- | --- |
| `src/app/page.tsx` | :8 `PublicHeader` import를 `~/fsd/widgets/site-header` 배럴 named로 |
| `src/app/dashboard/layout.tsx` | :5 `DashboardHeader` import를 `~/fsd/widgets/dashboard-header` 배럴 named로 |
| `src/app/login/page.tsx` | :3 `LoginForm` import를 `~/fsd/widgets/login-form` 배럴 named로 |
| `src/app/(public-marketing)/layout.tsx` | :1 `SiteFooter`, :2 `PublicHeader`를 각 배럴 named로 |
| `src/fsd/pages/upload-detail/ui/index.tsx` | :21 `ClipDisplay`, :22 `ClipDraftReviewSection`를 각 배럴 named로 |
| `src/fsd/pages/dashboard/ui/index.tsx` | :32 `UploadedFileList`를 배럴 named로 |
| `src/fsd/pages/home/ui/index.tsx` | :2 `SiteFooter`를 배럴 named로 |

**수정 — 인트라 슬라이스 자기참조 10건(8개 파일): 절대경로 → 상대경로**

| 파일 | 변경 |
| --- | --- |
| `src/fsd/widgets/clip-display/ui/_component/ClipCard.tsx` | :13 `clip-rationale`, :14 `subtitle-status` → `../../model/...` |
| `src/fsd/widgets/clip-display/ui/_component/YoutubeMetadataModal.tsx` | :19 → `../../model/useMetadataClipboard` |
| `src/fsd/widgets/clip-display/ui/_component/ScriptModal.tsx` | :6 → `../../model/use-script-clipboard` |
| `src/fsd/widgets/clip-display/ui/_component/CopyButton.tsx` | :3 → `../../model/useMetadataClipboard` |
| `src/fsd/widgets/clip-display/model/useMetadataClipboard.ts` | :7 `copy-to-clipboard`, :8 `format-metadata` → `../lib/...` |
| `src/fsd/features/billing/ui/SubscriptionStatus.tsx` | :26 → `../api` |
| `src/fsd/features/billing/ui/PlanCard.tsx` | :14 → `../api` |
| `src/fsd/features/billing/ui/OrderHistory.tsx` | :17 → `../model/types` |

합계: 신규 7 + 수정 15 = 22개 파일. 여기 없는 파일은 구현 단계에서 고치지 않는다.

**범위 경계에서 제외한 것 (같은 부류지만 FEAT-33 밖)**: `src/fsd/pages/pricing/ui/index.tsx:3`이 `~/fsd/features/billing/config/plan-tiers`로 billing 슬라이스의 세그먼트 내부를 직접 참조한다. 이는 §5.3 크로스 슬라이스 위반이고 `features/billing/index.ts:1`이 이미 `PLAN_TIERS`를 배럴로 내보내므로 `~/fsd/features/billing`으로 고칠 수 있다. 그러나 이는 **widgets Public API가 아니라 features/billing 공개 API 소비 문제**이며, 백로그가 FEAT-33에 열거한 "widgets 배럴 7 + 외부 참조 9 + 인트라 자기참조 10"에 들지 않는다. 이 항목에서는 손대지 않고 관측만 남긴다(FEAT-34 경계 검사가 잡을 부류다).

## 구현 스케치

**배럴 7개 전문.** 6개는 `./ui` default를, site-header만 `./ui/public-header` default를 named로 승격한다. 선례는 `features/upload/index.ts:26`의 `export { default as UploadedFileActions } from "./ui";`이며 이 형태가 `next lint`·`tsc`를 통과함을 확인했다.

```ts
// src/fsd/widgets/clip-display/index.ts
export { default as ClipDisplay } from "./ui";
```
```ts
// src/fsd/widgets/clip-draft-review/index.ts
export { default as ClipDraftReviewSection } from "./ui";
```
```ts
// src/fsd/widgets/dashboard-header/index.ts
export { default as DashboardHeader } from "./ui";
```
```ts
// src/fsd/widgets/login-form/index.ts
export { default as LoginForm } from "./ui";
```
```ts
// src/fsd/widgets/site-footer/index.ts
export { default as SiteFooter } from "./ui";
```
```ts
// src/fsd/widgets/uploaded-file-list/index.ts
export { default as UploadedFileList } from "./ui";
```
```ts
// src/fsd/widgets/site-header/index.ts
export { default as PublicHeader } from "./ui/public-header";
```

배럴은 컴포넌트 하나씩만 내보낸다. widgets 슬라이스가 밖으로 내보내야 할 타입·상수는 없다 — grep이 잡은 16개 `fsd/widgets` 참조가 전부 default 컴포넌트 import(외부 9) 또는 clip-display 내부 자기참조(7)여서, 슬라이스 밖에서 위젯의 타입/모델을 소비하는 곳이 0건임을 여집합으로 확인했다(`clip-draft-review`가 export하는 `BlockKind`(ui/index.tsx:46)·`selection-budget`의 타입도 밖에서 안 쓴다).

**외부 참조 9곳 — default → named (before/after는 specifier만 바뀐다).**

```ts
// src/app/page.tsx:8
- import PublicHeader from "~/fsd/widgets/site-header/ui/public-header";
+ import { PublicHeader } from "~/fsd/widgets/site-header";

// src/app/dashboard/layout.tsx:5
- import DashboardHeader from "~/fsd/widgets/dashboard-header/ui";
+ import { DashboardHeader } from "~/fsd/widgets/dashboard-header";

// src/app/login/page.tsx:3
- import LoginForm from "~/fsd/widgets/login-form/ui";
+ import { LoginForm } from "~/fsd/widgets/login-form";

// src/app/(public-marketing)/layout.tsx:1,2
- import SiteFooter from "~/fsd/widgets/site-footer/ui";
- import PublicHeader from "~/fsd/widgets/site-header/ui/public-header";
+ import { SiteFooter } from "~/fsd/widgets/site-footer";
+ import { PublicHeader } from "~/fsd/widgets/site-header";

// src/fsd/pages/upload-detail/ui/index.tsx:21,22
- import ClipDisplay from "~/fsd/widgets/clip-display/ui";
- import ClipDraftReviewSection from "~/fsd/widgets/clip-draft-review/ui";
+ import { ClipDisplay } from "~/fsd/widgets/clip-display";
+ import { ClipDraftReviewSection } from "~/fsd/widgets/clip-draft-review";

// src/fsd/pages/dashboard/ui/index.tsx:32
- import UploadedFileList from "~/fsd/widgets/uploaded-file-list/ui";
+ import { UploadedFileList } from "~/fsd/widgets/uploaded-file-list";

// src/fsd/pages/home/ui/index.tsx:2
- import SiteFooter from "~/fsd/widgets/site-footer/ui";
+ import { SiteFooter } from "~/fsd/widgets/site-footer";
```

**인트라 슬라이스 자기참조 10건 — 절대 → 상대. 같은 항목에 묶는 이유:** 셋 다(배럴 7 + 외부 9 + 자기참조 10) 동일한 FSD import-경로 위생 리팩터이고, 특히 clip-display 자기참조 7건은 지금 배럴을 세우는 바로 그 슬라이스 안에 있다 — 배럴을 만들면서 같은 슬라이스가 자기 세그먼트를 절대경로로 참조하는 것을 남겨두면 경계 도입이 반쪽이 된다. billing 3건은 위젯이 아니지만 제안서 V11b가 든 같은 위반 클래스이고(그 문서는 billing만 열거했다), 상대경로 한 토큰 교체라 별도 항목으로 떼면 알려진 자명한 정리가 미아가 된다. 모두 런타임 동작 무변경(해석되는 모듈이 동일)이다.

```ts
// clip-display: ui/_component/ 파일들은 슬라이스 루트로 두 단계(../../), model→lib는 한 단계(../)
// ClipCard.tsx:13 (10~13행 다중행 import의 from)
-} from "~/fsd/widgets/clip-display/model/clip-rationale";
+} from "../../model/clip-rationale";
// ClipCard.tsx:14
- import { subtitleFallbackNotice } from "~/fsd/widgets/clip-display/model/subtitle-status";
+ import { subtitleFallbackNotice } from "../../model/subtitle-status";
// YoutubeMetadataModal.tsx:19
- import { useMetadataClipboard } from "~/fsd/widgets/clip-display/model/useMetadataClipboard";
+ import { useMetadataClipboard } from "../../model/useMetadataClipboard";
// ScriptModal.tsx:6
- import { useScriptClipboard } from "~/fsd/widgets/clip-display/model/use-script-clipboard";
+ import { useScriptClipboard } from "../../model/use-script-clipboard";
// CopyButton.tsx:3
- import type { CopiedField } from "~/fsd/widgets/clip-display/model/useMetadataClipboard";
+ import type { CopiedField } from "../../model/useMetadataClipboard";
// model/useMetadataClipboard.ts:7,8
- import { copyToClipboard } from "~/fsd/widgets/clip-display/lib/copy-to-clipboard";
- import { formatAllMetadataForCopy } from "~/fsd/widgets/clip-display/lib/format-metadata";
+ import { copyToClipboard } from "../lib/copy-to-clipboard";
+ import { formatAllMetadataForCopy } from "../lib/format-metadata";
```
```ts
// billing: ui/ 파일들은 슬라이스 루트로 한 단계(../)
// SubscriptionStatus.tsx:26
- import { cancelSubscription } from "~/fsd/features/billing/api";
+ import { cancelSubscription } from "../api";
// PlanCard.tsx:14
- import { getCheckoutUrl } from "~/fsd/features/billing/api";
+ import { getCheckoutUrl } from "../api";
// OrderHistory.tsx:17
- import type { OrderInfo } from "~/fsd/features/billing/model/types";
+ import type { OrderInfo } from "../model/types";
```

## 테스트

- **덮는 것**: 이 항목은 순수 함수를 새로 만들지 않는다 — 배럴 재수출과 import 경로 교체뿐이며 런타임 로직이 없다. 따라서 새 `*.test.mjs`를 추가하지 않고, **기계적 검증**으로 경계 성립을 판정한다.
  1. 배럴 존재: `find apps/web/src/fsd/widgets -maxdepth 2 -name index.ts` → **7**(현재 0).
  2. 외부 세그먼트 직접 참조 소멸: `grep -rn "~/fsd/widgets/[a-z-]\+/\(ui\|model\|lib\|config\)" apps/web/src` → **0**. 외부 소비처는 `~/fsd/widgets/<슬라이스>`(세그먼트 없는 배럴)로만 남고, clip-display 자기참조는 상대경로(`../`, `../../`)로 바뀌므로 절대 세그먼트 참조가 전부 사라진다. 배럴 내부의 `from "./ui"`·`from "./ui/public-header"`는 `~/`가 아니라 `./`라 이 패턴에 걸리지 않는다.
  3. billing 자기참조 소멸: `grep -rn "~/fsd/features/billing/\(api\|model\|config\)" apps/web/src/fsd/features/billing` → **0**(슬라이스 안에서 자기 절대참조 없음). 슬라이스 밖 `~/fsd/features/billing/api` 소비(예: `app/dashboard/billing/page.tsx:1`)와 범위 밖으로 남긴 `pages/pricing`의 `config/plan-tiers` 참조는 이 grep 범위(billing 디렉터리 안)에 들지 않으므로 영향 없다.
  4. 기존 clip-display 모델 테스트(`clip-rationale.test.mjs`·`subtitle-status.test.mjs`)와 clip-draft-review 테스트가 **그대로 통과**: 테스트가 임포트하는 모델 소스(`clip-rationale.ts`·`subtitle-status.ts`·`selection-budget.ts`·`caption-presets.ts`)는 이 항목에서 수정하지 않는다(수정 대상은 그것들의 소비처인 ClipCard와, 자기 import를 가진 useMetadataClipboard뿐).
- **못 덮는 범위**: `npm test`(tsx Node 러너, DOM·React 도구 없음)로는 위젯의 실제 렌더를 확인할 수 없다. import 경로만 바뀌고 컴포넌트 본문은 불변이므로 렌더 결과는 동일해야 하지만, 그 동일성은 `tsc`의 모듈 해석 + `npm run build`의 RSC 경계 통과로만 간접 확인된다. 또한 **배럴이 앞으로도 유일한 경로로 강제되는지**(향후 세그먼트 직접 참조 재발 차단)는 이 항목이 아니라 FEAT-34(경계 자동 검출)의 몫이라 여기서 덮지 않는다.

## 범위 밖 의존

없음. `packages/db`·다른 워크스페이스·스키마·마이그레이션과 무관하다. 모든 변경은 `apps/web/src` 안이다.

**FEAT-31식 위험 없음(직접 확인)**: 7개 위젯 슬라이스 어디에도 `api/` 세그먼트가 없다(전체 파일 목록으로 확인 — 세그먼트는 ui·model·lib·config뿐). 따라서 배럴이 `import "server-only"` 모듈을 재수출할 경로가 없고, entities에서 필요했던 `index.ts`(클라 안전)/`server.ts`(server-only) 이원화가 여기선 불필요하다. `index.ts` 단일 배럴로 충분하며, 클라이언트 컴포넌트가 이 배럴을 임포트해도 빌드가 깨지지 않는다.

## 대안

- **site-header에 `ui/index.tsx`를 새로 만들거나 `public-header.tsx`를 `index.tsx`로 개명** — 택하지 않았다. `public-header.tsx:15-19` 주석이 "이전에 `ui/index.tsx`(SiteHeader)가 있었고 중복 때문에 제거됐다"는 이력을 담고 있어, 같은 이름을 되살리면 혼란스럽다. 서술적 파일명을 유지한 채 배럴이 `./ui/public-header`를 가리키는 편이 diff도 최소이고 의도도 분명하다.
- **default export를 named export로 변환한 뒤 배럴에서 `export { X } from "./ui"`** — 택하지 않았다. 6개 `ui/index.tsx`의 함수 선언을 바꾸고, 그 파일을 임포트하는 지점(현재는 없지만)까지 봐야 해 변경면이 넓어진다. `export { default as X }`는 원본 파일을 건드리지 않고 배럴 한 줄로 끝나며, 저장소 선례(`features/upload/index.ts:26`)와도 일치한다.
- **billing 3건·pricing 1건을 이 항목에서 함께 정리** — billing 자기참조 3건은 백로그가 FEAT-33에 명시적으로 포함해 넣었으나, pricing→billing/config 크로스 슬라이스 참조는 열거 밖이라 제외했다(「고칠 파일」 범위 경계 참조). 승인 범위를 넘지 않기 위해 관측만 보고한다.
