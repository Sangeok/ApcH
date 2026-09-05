# FEAT-34: apps/web FSD 경계 자동 검출 도입

agent: web-dev

## 현재 동작

`apps/web`에는 FSD 경계를 강제하는 어떤 자동 검사도 없다. 사람 감사(`fsd-architecture-compliance-proposal.md`의 Audit)만 재발을 막고 있다.

- `apps/web/package.json:8` `"check": "next lint && tsc --noEmit"` — lint와 타입체크뿐이다. 경계 검사 스크립트가 없다. `scripts/`에 `verify:fsd*`가 없고 `package.json`의 scripts는 dev·inngest-dev·build·start·check·format:check·format:write·lint·lint:fix·preview·typecheck·dev:polar·ngrok·test뿐이다(전수 확인).
- `apps/web/eslint.config.js` — `tseslint.config(...)` flat config이나 `no-restricted-imports` 룰이 없다(전수 확인: `no-restricted-imports` 0건). 규칙은 `@typescript-eslint/*` 스타일 룰과 `next/core-web-vitals`만 있다.
- `apps/web`에 `steiger.config.*`가 없고, `package.json`의 dependencies·devDependencies에 `steiger`·`@feature-sliced/steiger-plugin`·`@feature-sliced/eslint-config`가 없다(전수 확인). `typescript@5.9.3`은 devDependencies에 이미 있어 AST 파서로 즉시 쓸 수 있다.

현재 FSD 트리는 실측상 아래 불변식을 이미 지키고 있다(FEAT-31·FEAT-33·클린코드 개선의 결과). 각 수치는 이 계획서를 쓰며 재측정했다.

- **레이어 선형 흐름(상위→하위만)**: `src/fsd` 내부 상향 임포트 **0건**.
- **슬라이스 격리(peer 임포트 금지)**: 같은 레이어 다른 슬라이스 임포트 **0건**.
- **자기 배럴 임포트 금지**: 슬라이스가 자기 루트 배럴을 임포트 **0건**.
- **widgets Public API 경유**: `~/fsd/widgets/<슬라이스>` 소비 8곳 전부 슬라이스 루트 배럴 경유(clip-display·clip-draft-review·dashboard-header·login-form·uploaded-file-list 각 1, site-footer·site-header 각 2). 위젯 세그먼트(`.../ui`, `.../model` 등) 직접 참조 **0건**.
- **엔티티 클라이언트 배럴 순수성**: `entities/*/index.ts` 8개 전부 `./api`(server-only)를 재수출하지 않는다(`entities/uploaded-file/index.ts`는 model·ui만 재수출; 나머지 7개는 `export {}` 또는 model만). server-only 접근은 `entities/*/server.ts`가 `./api`를 재수출한다(예: `entities/uploaded-file/server.ts:1` `import "server-only";`).

두 감시 지점은 지금 `check`·`build`로 잡히지 않는다.

- `docs/release-checks.md:43`(FEAT-31 절 「회귀 방어선 부재(감시 지점)」): "새 `api/index.ts` 심볼이 다시 `index.ts`로 재수출돼도 **클라이언트 임포터가 생기기 전까지 CI가 못 잡는다** … FEAT-34(경계 자동 검출)가 도입되면 `대체(FEAT-34)`로 닫는다".
- `docs/release-checks.md:32`(FEAT-33 절 「경계가 유지되는지(감시 지점)」): "누군가 다시 `~/fsd/widgets/<슬라이스>/ui`로 직접 임포트해도 `check`·`build`가 통과한다 … FEAT-34(경계 자동 검출)가 도입되면 `대체(FEAT-34)`로 닫는다".

저장소 선례는 `apps/admin/scripts/verify-fsd-boundaries.mjs`(731줄)다. 구조를 실제로 읽었다.

- `analyzeFsdBoundaries({ files, mode })`를 **export**해 순수 함수로 테스트 가능하게 하고(`:232`), CLI는 그 결과를 소비한다.
- `typescript`로 각 파일을 AST 파싱(`ts.createSourceFile`, `:242`)해 import/export 지정자·호출식·directive를 순회한다. 정규식이 주석·문자열에서 오탐하는 문제를 피한다.
- 규칙마다 **ID**(R1~R13)와 메시지를 붙이고(`addViolation`, `:215`), 위반을 `path:line [RULE] message`로 stderr에 출력(`:717-721`).
- CLI는 위반이 있으면 `process.exitCode = 1`(`:722`), 없으면 `FSD boundary check passed`(`:714`).
- `--final` 모드(`:708`)는 admin의 **진행 중 마이그레이션 완결성**을 검사한다 — `REQUIRED_FINAL_FILES` 존재(`:47-68`), `LEGACY_TOP_LEVEL` 잔존 금지(`:70-77`), effect-owner 드리프트(`:670-681`). admin은 legacy 최상위 디렉터리(`src/analytics/`·`src/pipeline/` 등)를 아직 걷어내는 중이라 이 모드가 필요하다.
- 셀프테스트 `verify-fsd-boundaries.test.mjs`(208줄)는 **음성 픽스처**를 인메모리 파일맵으로 넣어 각 규칙이 실제로 위반을 낸다는 것을 고정한다(예: `:38-48` 상향·peer, `:100-109` wildcard/private export, `:111-123` public directive/server leak, `:177-194` owner 등록이 장식이 아님을 mutation으로 증명). `apps/admin/package.json:16-18`이 `verify:fsd`·`verify:fsd:test`·`verify:fsd:final` 세 스크립트를 두고 `check`(`:11`)가 `verify:fsd:test && verify:fsd`를 앞세운다.

admin 스크립트가 web에 주는 것과 web에 맞춰 조정할 것:

- **주는 것**: AST 파싱·규칙 ID·종료코드·evidence 출력·인메모리 음성 픽스처 패턴은 그대로 이식할 수 있다. 신규 의존성이 없다(`typescript` 재사용).
- **조정할 것(규칙 셋은 web 관례에 맞춘다)**: admin의 R1~R13은 admin 전용 owner(analytics `findMany` 유일 owner, pipeline private export 목록, legacy 디렉터리)에 묶여 있어 그대로 쓸 수 없다. web의 Public entry 관례가 다르다 — admin은 엔티티 server query를 `entities/<슬라이스>/api`(api/index.ts)로 두지만, **web은 `entities/<슬라이스>/server.ts`**로 둔다(§4 「슬라이스 공개 API를 런타임 기준으로 나눈다」, guidelines `docs/conventions/fsd-architecture-guidelines.md:108`). feature server action은 `features/<슬라이스>/api`로 둔다. 따라서 규칙은 web-특화로 다시 쓴다(아래 W1~W8).
- **`--final` 모드는 web에 불필요**: web은 FSD 마이그레이션이 사실상 끝났다 — legacy 최상위 소스 디렉터리가 없고(`src/fsd`가 유일한 제품 코드 홈), 모든 엔티티·배럴이 이미 존재한다. 걷어낼 잔재가 없으므로 완결성 게이트가 검사할 대상이 없다. web은 단일 `verify:fsd`가 게이트다.

## 문제

`TASK_BACKLOG.md`의 FEAT-34 `source`가 지목한 문제(진단): **사람 감사만으로는 재발을 못 막는다.** 실측 사례로 2026-08-03 감사가 잡은 「크로스 슬라이스 세그먼트 직접 참조」는 클린코드 개선(C-06·07·08)으로 닫혔지만, 같은 부류의 위반이 widgets에 그대로 남아 FEAT-33이 됐다 — 한 곳을 닫는 동안 다른 곳이 열려 있어도 아무도 못 본다.

구체적으로 두 감시 지점이 `check`·`build`로 잡히지 않는다(위 「현재 동작」의 `release-checks.md:43`·`:32`). ① 엔티티 클라이언트 배럴이 server-only `./api`를 재수출하는 회귀는 `build`로만, 그마저 클라이언트 임포터가 생겨야 터진다. ② widgets 슬라이스 내부를 배럴 우회로 직접 임포트해도 통과한다. 이 계획서가 도입하는 검사는 **이 둘을 실제로 잡아야** 하고(W5·W4/W6), 잡지 못하면 `release-checks.md`의 두 줄은 `대체(FEAT-34)`로 닫히지 않는다.

## 고칠 파일

| 파일 | 변경 |
| --- | --- |
| `scripts/verify-fsd-boundaries.mjs` `(신규)` | AST 기반 경계 분석기(`analyzeFsdBoundaries` export) + CLI(종료코드). 규칙 W1~W8 |
| `scripts/verify-fsd-boundaries.test.mjs` `(신규)` | 인메모리 음성 픽스처 셀프테스트. 두 감시 지점(W5·W4/W6) 포함 |
| `package.json` | scripts에 `verify:fsd`·`verify:fsd:test` 추가, `check`를 `verify:fsd:test && verify:fsd && next lint && tsc --noEmit`로 |
| `src/fsd/pages/pricing/ui/index.tsx` | `plan-tiers` 딥 임포트를 billing 배럴 경유로(W6 선행 정리) |
| `src/fsd/pages/dashboard/ui/index.tsx` | `query-options` 딥 임포트를 upload 배럴 경유로(W6 선행 정리) |
| `src/fsd/pages/dashboard/ui/_component/RecoverableUploadDrafts.tsx` | 훅 딥 임포트 둘을 upload 배럴 경유로(W6 선행 정리) |
| `src/fsd/entities/uploaded-file/index.ts` | `PROCESSING_STALE_POLICY` 재수출 추가(배럴에 없어서 아래 파일이 딥 임포트 중) |
| `src/fsd/features/upload/api/reconcile-stale-processing.ts` | `stale-policy` 딥 임포트를 uploaded-file 배럴 경유로(W6 선행 정리) |
| `apps/web/docs/proposals/active/fsd-architecture-compliance-proposal.md` → `completed/` **(담당: 메인 루프)** | 마지막 남은 항목이 0이 되므로 완료 이동 + frontmatter 갱신 + 「Completion or Closure Notes」 절 신설. web-dev 쓰기 범위 밖이라 인수 시 메인 루프가 처리한다(「범위 밖 의존」의 담당 확정 참조) |

여기 적히지 않은 파일은 구현 단계에서 고치지 않는다.

**전수 확인한 W6 위반은 정확히 5건**이고 전부 fsd→fsd 크로스 슬라이스 딥 임포트다(엔트리 포인트 `src/app`·`src/inngest`는 W6 대상 밖 — 「구현 스케치」 규칙 스코프 참조). 다섯을 위 표의 파일 교체로 닫는다. 같은 부류를 다른 레이어·슬라이스까지 전수 탐색한 결과 이 5건 외에는 없다(측정 근거: fsd 소스의 크로스 슬라이스 딥 임포트 27건 중 21건은 `entities/<슬라이스>/server` 정당 배럴, 1건은 `features/upload/api` 정당 server-action 표면, 나머지 5건이 위반).

## 구현 스케치

### 규칙 셋(web 관례)과 스코프

Public entry(슬라이스 외부가 써도 되는 파일):

- 모든 레이어: 슬라이스 루트 `index.ts`
- `entities`: 추가로 슬라이스 루트 `server.ts`(server-only 배럴)
- `features`: 추가로 `api/index.ts`(server action 표면 — 클라이언트 배럴이 `"use server"` 제약으로 재수출 못 함, proposal 3-4/P15)

| ID | 규칙 | 소스 스코프 | 현재 위반 |
| --- | --- | --- | --- |
| W1 | 상위 레이어 임포트 금지(선형 흐름) | fsd 소스 | 0 |
| W2 | peer 슬라이스 임포트 금지(슬라이스 격리) | fsd 소스 | 0 |
| W3 | 자기 슬라이스 루트 배럴(index/server) 임포트 금지 | fsd 소스 | 0 |
| W4 | 비-fsd 소스(엔트리 포인트)가 widgets 내부 직접 임포트 금지 | 비-fsd 소스 | 0 |
| W5 | `entities/<슬라이스>/index.ts`가 `./api` 재수출 금지(server-only는 `server.ts`) | 엔티티 index.ts | 0 |
| W6 | 크로스 슬라이스는 Public entry 경유(딥 임포트 금지) | fsd 소스 | 5 → 0(선행 정리) |
| W7 | 내부(`~/`·상대) 임포트가 해석 불가 | 전역 | 0 |
| W8 | `db` 클라이언트 값 임포트는 승인 owner만 | 전역(프로덕션) | 0 |

**두 감시 지점의 검출 경로**:

- FEAT-31 = **W5**. 규칙이 배럴 **정의**를 보므로 임포터 유무와 무관하게 잡는다.
- FEAT-33 = **W6**(fsd 소스 → `~/fsd/widgets/<슬라이스>/ui`, 예: pages) + **W4**(비-fsd 소스 → widgets 내부, 예: `src/app`). 둘이 겹치지 않게 W4는 비-fsd 소스에만, W6은 fsd 소스에만 발화한다. 합쳐서 "누가 어디서 임포트하든 widgets 내부 직접 참조는 위반"을 보장한다.

**엔트리 포인트 스코프(요구사항 #4의 세 번째 예외)**: W1·W2·W3·W6은 소스가 `src/fsd`일 때만 발화한다. `src/app`·`src/inngest` 등 조합 루트는 Phase 1~2 interim으로 엔티티·feature 내부를 직접 조합한다(실측: `src/inngest/functions.ts:21`이 `entities/uploaded-file/model/stale-policy`를, `src/app/dashboard/page.tsx:8`이 `features/upload/api/reconcile-stale-processing`를 직접 임포트). proposal Phase 2 step 6의 세 번째 예외 블록(`files: ["src/app/api/webhooks/**", "src/app/api/portal/**", "src/inngest/functions.ts"]`)이 노린 "진입점의 entity 직접 조합 허용"은 **규칙 스코프로 구현**한다 — 만료 예정 예외 블록을 두지 않으므로 Phase 3에서 삭제할 잔재가 생기지 않는다. 단 W4·W5는 엔트리 포인트에도 적용된다(widgets 배럴 강제·엔티티 배럴 순수성).

**필요 없어진 예외(요구사항 #4의 첫 번째)**: proposal의 R2 예외 경로 `entities/**/api/queries/**`는 **web에 해당 디렉터리가 없다**(전수 확인: `entities/*/api/`는 `index.ts` 하나씩뿐, `queries/` 세그먼트 0개). 이 예외를 넣으면 죽은 설정이 되어 검사만 헐거워지므로 **넣지 않는다**. proposal이 권장한 기본 전략(`Prisma.<Model>GetPayload`)으로 cross-entity 타입 의존을 회피하는 구조가 이미 자리잡았다.

**필요한 예외(요구사항 #4의 두 번째)**: `features/*/api`(api/index.ts)의 server action 직접 임포트는 실재한다(`pages/dashboard/model/useUploadPodcast.ts`가 `~/fsd/features/upload/api`를 임포트). public-api 룰이 이를 오탐하지 않도록 **`features`의 Public entry에 `api/index.ts`를 포함**해 구현한다(별도 예외 블록이 아니라 규칙 정의). 확인 결과 이 경로가 web에 필요하다.

### `scripts/verify-fsd-boundaries.mjs` (신규, 전문)

```js
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

const SOURCE_EXTENSIONS = [".ts", ".tsx", ".js", ".mjs"];
const LAYER_LEVEL = new Map([
  ["shared", 0],
  ["entities", 1],
  ["features", 2],
  ["widgets", 3],
  ["pages", 4],
]);

// W8: `db` 클라이언트 값을 임포트해도 되는 파일. 실측 owner 전수.
const DB_CLIENT_OWNERS = new Set([
  "src/server/db.ts",
  "src/server/auth/config.ts",
  "src/fsd/features/upload/api/complete-processing-attempt.ts",
  "src/fsd/features/upload/api/dispatch-processing.ts",
  "src/fsd/features/upload/api/index.ts",
]);
// 위 목록 외에 `src/fsd/entities/**/api/**`도 허용(엔티티 CRUD 소유). 접두사로 판정.
const DB_CLIENT_OWNER_PREFIXES = ["src/fsd/entities/", "src/server/auth/"];
const DB_MODULES = new Set(["~/server/db", "@repo/db"]);

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}
function withoutQuery(value) {
  return value.split("?")[0];
}
function scriptKind(filePath) {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}
function fsdLocation(filePath) {
  const parts = normalizePath(filePath).split("/");
  if (parts[0] !== "src" || parts[1] !== "fsd") return null;
  const layer = parts[2];
  if (!LAYER_LEVEL.has(layer)) return null;
  return { layer, slice: parts[3] ?? null, segment: parts[4] ?? null, parts };
}
function isTestFile(filePath) {
  return /(?:^|\.)test\.[^.]+$/.test(path.posix.basename(filePath));
}
function isSliceRootIndex(filePath) {
  const l = fsdLocation(filePath);
  return l !== null && l.parts.length === 5 && l.parts[4].startsWith("index.");
}
function isSliceRootServer(filePath) {
  const l = fsdLocation(filePath);
  return l !== null && l.parts.length === 5 && l.parts[4].startsWith("server.");
}
function isFeatureApiIndex(filePath) {
  const l = fsdLocation(filePath);
  return (
    l !== null &&
    l.layer === "features" &&
    l.parts.length === 6 &&
    l.parts[4] === "api" &&
    l.parts[5].startsWith("index.")
  );
}
function isPublicEntry(resolved, targetLayer) {
  if (isSliceRootIndex(resolved)) return true;
  if (targetLayer === "entities" && isSliceRootServer(resolved)) return true;
  if (targetLayer === "features" && isFeatureApiIndex(resolved)) return true;
  return false;
}
function isDbClientOwner(filePath) {
  if (DB_CLIENT_OWNERS.has(filePath)) return true;
  if (
    DB_CLIENT_OWNER_PREFIXES.some((p) => filePath.startsWith(p)) &&
    filePath.startsWith("src/fsd/entities/") &&
    filePath.includes("/api/")
  ) {
    return true;
  }
  if (filePath.startsWith("src/server/auth/")) return true;
  return false;
}

function resolveInternal(sourcePath, specifier, fileMap) {
  let base;
  if (specifier.startsWith("~/")) base = `src/${specifier.slice(2)}`;
  else if (specifier.startsWith("."))
    base = path.posix.normalize(
      path.posix.join(path.posix.dirname(sourcePath), specifier),
    );
  else return null;

  const clean = withoutQuery(normalizePath(base));
  const candidates = SOURCE_EXTENSIONS.includes(path.posix.extname(clean))
    ? [clean]
    : [
        ...SOURCE_EXTENSIONS.map((e) => `${clean}${e}`),
        ...SOURCE_EXTENSIONS.map((e) => path.posix.join(clean, `index${e}`)),
      ];
  return candidates.find((c) => fileMap.has(c)) ?? undefined;
}
function importSpecifier(node) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    return node.moduleSpecifier.text;
  }
  return null;
}
function lineOf(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}
function addViolation(violations, sourceFile, node, rule, message) {
  violations.push({
    path: normalizePath(sourceFile.fileName),
    line: lineOf(sourceFile, node),
    rule,
    message,
  });
}
function importsDbClient(node) {
  const clause = node.importClause;
  const bindings = clause?.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return true;
  if (ts.isNamedImports(bindings)) {
    return bindings.elements.some(
      (el) => (el.propertyName?.text ?? el.name.text) === "db",
    );
  }
  return false;
}

export function analyzeFsdBoundaries({ files }) {
  const fileMap = new Map(
    files.map(({ path: filePath, sourceText }) => [normalizePath(filePath), sourceText]),
  );
  const parsed = new Map(
    [...fileMap].map(([filePath, sourceText]) => [
      filePath,
      ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, scriptKind(filePath)),
    ]),
  );
  const violations = [];

  for (const [filePath, sourceFile] of parsed) {
    if (isTestFile(filePath)) continue;
    const srcLoc = fsdLocation(filePath);
    const production = !isTestFile(filePath);

    function visit(node) {
      const specifier = importSpecifier(node);
      if (specifier !== null) {
        const resolved = resolveInternal(filePath, specifier, fileMap);
        const tgtLoc =
          resolved === undefined || resolved === null ? null : fsdLocation(resolved);

        // W7: 내부 임포트 해석 불가
        if (
          (specifier.startsWith("~/") || specifier.startsWith(".")) &&
          !specifier.endsWith(".css") &&
          resolved === undefined
        ) {
          addViolation(violations, sourceFile, node, "W7", `internal import cannot be resolved: ${specifier}`);
        }

        // W5: 엔티티 클라이언트 배럴이 ./api(server-only) 재수출
        if (
          srcLoc?.layer === "entities" &&
          isSliceRootIndex(filePath) &&
          resolved &&
          resolved.startsWith(`src/fsd/entities/${srcLoc.slice}/api/`)
        ) {
          addViolation(
            violations,
            sourceFile,
            node,
            "W5",
            "entity client barrel must not re-export server-only ./api; use server.ts",
          );
        }

        if (srcLoc !== null && tgtLoc !== null) {
          const sameSlice =
            srcLoc.layer === tgtLoc.layer && srcLoc.slice === tgtLoc.slice;
          const sL = LAYER_LEVEL.get(srcLoc.layer);
          const tL = LAYER_LEVEL.get(tgtLoc.layer);

          // W1: 상향 임포트
          if (sL < tL) {
            addViolation(violations, sourceFile, node, "W1", `${srcLoc.layer} cannot import upward from ${tgtLoc.layer}`);
          }
          // W2: peer 슬라이스
          if (srcLoc.layer === tgtLoc.layer && srcLoc.layer !== "shared" && srcLoc.slice !== tgtLoc.slice) {
            addViolation(violations, sourceFile, node, "W2", `peer slice import is forbidden: ${tgtLoc.slice}`);
          }
          // W3: 자기 루트 배럴
          if (sameSlice && filePath !== resolved && (isSliceRootIndex(resolved) || isSliceRootServer(resolved))) {
            addViolation(violations, sourceFile, node, "W3", "a slice must not import its own root barrel");
          }
          // W6: 크로스 슬라이스 Public entry 경유
          if (!sameSlice && tgtLoc.layer !== "shared" && !isPublicEntry(resolved, tgtLoc.layer)) {
            addViolation(violations, sourceFile, node, "W6", `slice internals require a public entry: ${specifier}`);
          }
        }

        // W4: 비-fsd 소스가 widgets 내부 직접 임포트
        if (srcLoc === null && tgtLoc?.layer === "widgets" && !isSliceRootIndex(resolved)) {
          addViolation(violations, sourceFile, node, "W4", `widget internals require the slice barrel: ${specifier}`);
        }

        // W8: db 클라이언트 owner
        if (
          production &&
          DB_MODULES.has(specifier) &&
          ts.isImportDeclaration(node) &&
          importsDbClient(node) &&
          !isDbClientOwner(filePath)
        ) {
          addViolation(violations, sourceFile, node, "W8", `db client import is outside approved owners: ${specifier}`);
        }
      }

      // 동적 import(문자열 리터럴)도 해석해 W7 커버
      if (
        ts.isCallExpression(node) &&
        node.expression.kind === ts.SyntaxKind.ImportKeyword &&
        node.arguments.length === 1 &&
        ts.isStringLiteralLike(node.arguments[0])
      ) {
        const spec = node.arguments[0].text;
        if ((spec.startsWith("~/") || spec.startsWith(".")) && !spec.endsWith(".css")) {
          if (resolveInternal(filePath, spec, fileMap) === undefined) {
            addViolation(violations, sourceFile, node, "W7", `internal import cannot be resolved: ${spec}`);
          }
        }
      }

      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }
  return violations;
}

function readSourceFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(absolute);
      else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
        const rel = normalizePath(path.relative(root, absolute));
        if (isTestFile(rel)) continue;
        files.push({ path: rel, sourceText: fs.readFileSync(absolute, "utf8") });
      }
    }
  }
  walk(path.join(root, "src"));
  return files;
}

function runCli() {
  const root = process.cwd();
  const violations = analyzeFsdBoundaries({ files: readSourceFiles(root) });
  if (violations.length === 0) {
    process.stdout.write("FSD boundary check passed.\n");
    return;
  }
  for (const v of violations) {
    process.stderr.write(`${v.path}:${v.line} [${v.rule}] ${v.message}\n`);
  }
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runCli();
}
```

리터럴 값 고정: 규칙 ID는 `"W1"`~`"W8"` 문자열, DB 모듈은 `"~/server/db"`·`"@repo/db"`, owner 접두사는 `"src/fsd/entities/"`·`"src/server/auth/"`, owner 파일 5개는 위 `DB_CLIENT_OWNERS` 집합의 정확 경로. 통과 문구는 `"FSD boundary check passed.\n"`.

### `scripts/verify-fsd-boundaries.test.mjs` (신규)

`analyzeFsdBoundaries`를 인메모리 파일맵으로 호출한다. `node --test`로 돈다(`node:test`·`node:assert`). 분기 목록은 「테스트」 절 참조. 핵심 픽스처(두 감시 지점)의 형태만 명시한다.

- FEAT-31(W5) 음성 픽스처: `{ "src/fsd/entities/foo/index.ts": 'export { q } from "./api";', "src/fsd/entities/foo/api/index.ts": 'import "server-only"; export const q = 1;' }` → 규칙 배열에 `"W5"` 포함.
- FEAT-33(W6, pages→widgets/ui) 음성 픽스처: `{ "src/fsd/pages/p/ui/index.tsx": 'import { X } from "~/fsd/widgets/w/ui";', "src/fsd/widgets/w/ui/index.tsx": "export const X = 1;", "src/fsd/widgets/w/index.ts": 'export { X } from "./ui";' }` → `"W6"` 포함.
- FEAT-33(W4, app→widgets/ui) 음성 픽스처: `{ "src/app/x/page.tsx": 'import { X } from "~/fsd/widgets/w/ui";', "src/fsd/widgets/w/ui/index.tsx": "export const X = 1;", "src/fsd/widgets/w/index.ts": 'export { X } from "./ui";' }` → `"W4"` 포함.
- 양성 픽스처: 위 두 widgets 임포트를 배럴(`~/fsd/widgets/w`) 경유로 바꾸면 `analyze(...)`가 `[]`.

### `package.json` (before/after)

before(`:8`): `"check": "next lint && tsc --noEmit",`

after(scripts 블록에 추가 + check 교체):
```json
"check": "npm run verify:fsd:test && npm run verify:fsd && next lint && tsc --noEmit",
"verify:fsd": "node scripts/verify-fsd-boundaries.mjs",
"verify:fsd:test": "node --test scripts/verify-fsd-boundaries.test.mjs",
```

### 선행 정리 5건(before/after)

1. `src/fsd/pages/pricing/ui/index.tsx:3`
   - before: `import { PLAN_TIERS } from "~/fsd/features/billing/config/plan-tiers";`
   - after: `import { PLAN_TIERS } from "~/fsd/features/billing";`
   - 근거: `features/billing/index.ts:1` `export { getProductIds, PLAN_TIERS } from "./config";` 이미 배럴에 있음.

2. `src/fsd/pages/dashboard/ui/index.tsx:14-17`
   - before:
     ```
     import {
       currentUserActiveUploadQueueQueryOptions,
       currentUserUploadedFileListQueryOptions,
     } from "~/fsd/features/upload/model/query-options";
     ```
   - after: `import { currentUserActiveUploadQueueQueryOptions, currentUserUploadedFileListQueryOptions } from "~/fsd/features/upload";`
   - 근거: `features/upload/index.ts`가 두 심볼 모두 재수출(`export { currentUserActiveUploadQueueQueryOptions, currentUserUploadedFileListQueryOptions, uploadedFileDetailQueryOptions } from "./model/query-options";`).

3~4. `src/fsd/pages/dashboard/ui/_component/RecoverableUploadDrafts.tsx:5-6`
   - before:
     ```
     import { useDeleteUploadedFile } from "~/fsd/features/upload/model/use-delete-uploaded-file";
     import { useResumeUploadDraft } from "~/fsd/features/upload/model/use-resume-upload-draft";
     ```
   - after: `import { useDeleteUploadedFile, useResumeUploadDraft } from "~/fsd/features/upload";`
   - 근거: `features/upload/index.ts`가 `export { useDeleteUploadedFile } from "./model/use-delete-uploaded-file";`·`export { useResumeUploadDraft } from "./model/use-resume-upload-draft";`로 둘 다 재수출.

5. `src/fsd/entities/uploaded-file/index.ts` + `src/fsd/features/upload/api/reconcile-stale-processing.ts:10`
   - entities/uploaded-file/index.ts에 재수출 추가(model/attempt-prefix 재수출 블록 근처): `export { PROCESSING_STALE_POLICY } from "./model/stale-policy";`
     - `stale-policy.ts`는 import 0(순수 상수, `export const PROCESSING_STALE_POLICY = {`)이라 클라이언트 안전. 배럴에 두어도 build 안전.
   - reconcile-stale-processing.ts:10
     - before: `import { PROCESSING_STALE_POLICY } from "~/fsd/entities/uploaded-file/model/stale-policy";`
     - after: `PROCESSING_STALE_POLICY`를 같은 파일이 이미 쓰는 `~/fsd/entities/uploaded-file` 배럴 임포트에 합류(`:3`·`:4-9`가 이미 그 배럴에서 named 임포트 중).
   - 참고: `src/inngest/functions.ts:21`도 같은 딥 임포트를 하지만 **엔트리 포인트라 W6 대상 밖**이다. 배럴에 심볼이 생기므로 정리해도 되지만 이 항목 범위에선 필수가 아니다(고칠 파일 표에 넣지 않음).

### proposal 완료 이동

`apps/web/docs/proposals/active/fsd-architecture-compliance-proposal.md`를 `completed/`로 이동하고 frontmatter를 갱신한다(`status: "completed"`, **`stage: null`**(README:45 — "`stage`는 `pending` 문서에만 사용한다. `completed` 또는 `closed` 문서는 `stage: null`로 둔다"), `completed-at: "<구현일>"`, `verification-summary: "경계 자동 검출 스크립트(verify:fsd) 도입, check 배선, 감시 지점 둘 음성 시험 통과"`). 기준은 `apps/web/docs/proposals/README.md`다. 그 파일이 요구하는 것을 전부 옮기면:

- frontmatter 넷(`status`·`stage`·`completed-at`·`verification-summary`) — 위 값
- **「Completion or Closure Notes」 절 신설**(README:249). 이 제안서에는 그 절이 없다(현재 마지막 절이 `## Audit (2026-08-03)`) — 새로 더한다. 담을 것: 어떤 항목들이 이 제안서를 닫았는지(FEAT-31·FEAT-33·FEAT-34), 원래 범위 중 **실제로 수행하지 않은 것**(제안서 Phase 1~4의 상당 부분은 2026-09-03 클린코드 개선 77건이 다른 경로로 이미 닫았고, 남았던 것이 「Audit」 절의 네 항목이었다), 검증 결과.
- 완료 이동 기준 여덟(README:279-288) 중 "문서가 더 이상 실행 전 제안서가 아니라 수행 기록으로 읽힘"을 만족하려면 **본문 앞머리에 완료 요약이 필요하다** — 제안서 본문은 여전히 미래형(「제안하는 해결책」·「마이그레이션 단계」)이다. 「Audit」·「재대조」 절이 사실상 그 역할을 하므로, Completion 절에서 그 둘을 가리키고 "본문의 Phase 서술은 당시 계획이며 실제 이행 경로는 아래와 같다"고 명시한다.

## 테스트

- **덮는 것**(`scripts/verify-fsd-boundaries.test.mjs`, `node --test`):
  - W1: 하위→상위 임포트가 `"W1"` (엔티티→feature).
  - W2: 같은 레이어 다른 슬라이스가 `"W2"`.
  - W3: 자기 슬라이스 루트 배럴(index·server) 임포트가 `"W3"`.
  - W4: 비-fsd(`src/app`) 소스의 widgets 내부 임포트가 `"W4"`, 배럴 경유는 통과(감시 지점 FEAT-33 엔트리 측).
  - W5: `entities/*/index.ts`의 `./api` 재수출이 `"W5"`(감시 지점 FEAT-31).
  - W6: fsd 소스의 크로스 슬라이스 딥 임포트가 `"W6"`, Public entry(index·`entities` server.ts·`features` api/index.ts) 경유는 통과(감시 지점 FEAT-33 pages 측 + 선행 정리 5건의 형태).
  - W7: 해석 불가 내부 임포트가 `"W7"`.
  - W8: owner 밖 파일의 `db` 값 임포트가 `"W8"`, owner(엔티티 api·feature 트랜잭션 래퍼·server/auth·db.ts) 통과. owner 등록이 장식이 아님을 mutation(owner 목록에서 빼면 실제 파일이 위반)으로 고정.
  - CLI 종료코드: 위반 픽스처로 `analyzeFsdBoundaries`가 non-empty를 반환함을 단언(→ `runCli`가 `exitCode=1`).
- **못 덮는 범위**(현재 러너로 확인 불가):
  - 실제 트리에 대한 `node scripts/verify-fsd-boundaries.mjs` 1회 실행이 EXIT 0인지는 구현 단계에서 명령으로 실증한다(단위 테스트는 인메모리 픽스처만 검증). 절차: ① `npm run verify:fsd` EXIT 0 확인, ② 감시 지점 실증 — `src/fsd/pages/pricing/ui/index.tsx`에 `import { X } from "~/fsd/widgets/clip-display/ui";` 한 줄을 임시로 넣고 `npm run verify:fsd`가 EXIT 1 + `[W6]` 출력함을 확인 후 되돌림, ③ `src/fsd/entities/user/index.ts`에 `export { getUserById } from "./api";` 임시 추가 → EXIT 1 + `[W5]` 확인 후 되돌림. `src/app`에 임시 위반을 넣어 `[W4]`도 확인.
  - `npm test`(`tsx --test "src/**/*.test.mjs"`)는 `scripts/` 밖의 `.mjs`를 잡지 않으므로 셀프테스트는 `verify:fsd:test`(`node --test`)로 별도 실행 — admin과 동일.
  - `check`·`build` 실물 게이트(EXIT 0)는 구현 단계에서 실행해 확인한다.

## 범위 밖 의존

없음. 신규 의존성이 없다(`typescript`는 devDependencies에 이미 있음). `packages/db`·다른 워크스페이스 변경 없음. 모든 대상이 `apps/web` 안이다.

**담당 확정(검증 라운드에서 결론)**: proposal 이동은 **메인 루프가 한다.** `web-dev`의 쓰기 범위는 `.claude/agents/web-dev.md:22`가 `apps/web/src/**`(FSD·Inngest·App Router·server 설정)와 `apps/web` 하위 테스트 파일로 한정한다 — `apps/web/docs/**`는 그 밖이다. "구현 단계에서 판정"으로 미룰 물음이 아니라 이미 답이 있다. 같은 전례가 있다 — FEAT-31·FEAT-33에서 `apps/web/CLAUDE.md`(역시 web-dev 범위 밖)의 갱신을 메인 루프가 인수 시 처리했다.

따라서 **「고칠 파일」의 proposal 행은 담당이 메인 루프**이고, web-dev는 나머지 여덟 파일만 건드린다. 구현 보고에 `보류`가 생기지 않는다.

## 대안

- **(a) `steiger` + `@feature-sliced/steiger-plugin` 신규 도입**: 채택하지 않음. ① 신규 의존성 둘이 필요하고 플러그인 API가 버전 결합(proposal도 "버전에 맞춰 조정"이라 단서). ② 기본 ruleset이 FSD 표준을 그대로 강제해 **web 현실과 즉시 충돌** — web `pages`는 배럴(index.ts)이 하나도 없어(16개 슬라이스 전부 `src/app`이 `ui`/`config` 세그먼트를 직접 임포트) steiger public-api 룰이 대량 위반을 낸다. 우리 커스텀 규칙은 "fsd 내부에서 pages를 임포트하는 곳이 0"임을 이용해 pages 배럴 없이도 통과하도록 스코프를 좁힐 수 있지만 steiger 기본 룰은 그 재단이 어렵다. ③ steiger는 디렉터리 스코프(`steiger src/fsd`)라 `src/app`→widgets 내부 같은 **엔트리 포인트發 위반(W4)**을 못 본다 — FEAT-33 감시 지점을 절반만 닫는다. ④ 예외를 config로 표현해도 R2 queries처럼 web에 없는 예외까지 옮기면 죽은 설정이 된다.
- **(c) ESLint `no-restricted-imports`만으로**: 채택하지 않음(단독으로는 불충분). `~/server/db` 임포트는 막을 수 있으나(W8의 일부), **widgets 내부 딥 임포트(W4/W6)와 엔티티 배럴의 `./api` 재수출(W5)은 잡지 못한다** — 후자는 "재수출 대상이 같은 슬라이스의 api 세그먼트인가"라는 AST 재수출 분석이 필요하고, 전자는 "임포터의 소속 슬라이스"를 알아야 한다. 두 감시 지점 다 ESLint 경로 룰로는 표현이 안 된다. 다만 `no-restricted-imports`는 에디터 즉시 피드백 이점이 있어 W8을 ESLint로 **보완**하는 것은 후속으로 가능하다(이 계획에선 스크립트가 owner 검사를 담당).
- **채택 (b) admin 스크립트 이식**: 저장소 선례이고 신규 의존성이 없으며(`typescript` 재사용), web-특화 관례(server.ts 배럴·features api 표면·엔트리 포인트 스코프)를 코드로 정확히 표현할 수 있다. 종료코드·규칙 ID·evidence 출력·인메모리 음성 픽스처를 그대로 얻는다. `--final` 모드만 web에 불필요해 뺀다.

## 검증 라운드 기록 (메인 루프, 2026-09-05 1라운드)

필수 경로: 1(인용 전수 대조) · 2(스케치 추출·실행) · 3(before/after) · 4(전칭 여집합) ·
**7(음성 시험 — 이 항목의 본체)** · 9(구조적 아티팩트 — 신설 설정·스크립트).
5·6·8은 제외(판정 로직은 스크립트 자신이라 5는 셀프테스트가 대신하고, 외부 신호 해석 없음,
화면 변경 없음). 증거는 `docs/agents/main-loop/FEAT-34.md`.

**결함 ① (구현 영향) — `stage: "done"`은 규약 위반.** proposals README:45가 "`completed` 또는
`closed` 문서는 `stage: null`로 둔다"고 못 박는다. 실제 completed 문서 표본도 `stage` 값을
쓰지 않는다. 그대로 구현하면 제안서가 **자기 규약을 어긴 상태로** 완료 처리된다. → `stage: null`로
정정하고 근거를 붙였다.

**결함 ② (구현 영향) — 완료 이동 요구를 절반만 옮겼다.** README:249는 frontmatter 넷과 함께
**「Completion or Closure Notes」 절 갱신**을 요구하고, README:279-288의 이동 기준 여덟 중 하나는
"문서가 더 이상 실행 전 제안서가 아니라 수행 기록으로 읽힘"이다. 계획서는 frontmatter만 적었다.
이 제안서에는 Completion 절이 아예 없고(마지막 절이 `## Audit (2026-08-03)`), 본문은 여전히
미래형이다. → 절 신설과 담을 내용을 명시했다.

**결함 ③ (정밀도) — 미뤄둔 담당 물음이 이미 답이 있다.** 계획서가 proposal 이동을 "구현 단계에서
쓰기 범위 밖으로 판정되면 그 부분만 `보류`"로 남겼는데, `.claude/agents/web-dev.md:22`가 쓰기
범위를 `apps/web/src/**`와 테스트 파일로 한정한다 — `docs/**`는 밖이다. 판정할 게 아니라 정해져
있다. → 담당을 메인 루프로 확정했다(FEAT-31·33에서 `apps/web/CLAUDE.md`를 같은 이유로 메인
루프가 처리한 전례).

**통과한 것 — 특히 경로 7(본체)**

계획서의 스크립트 전문 283줄을 **바이트 그대로 추출해 실제로 돌렸다**(스크래치패드, `process.cwd()`
루트).

- **현 트리 실행**: 정확히 **W6 5건**만 보고하고 EXIT 1. 내가 독립 열거한 5건과 파일·줄이 완전히
  일치하며 오탐 0(W1·W2·W3·W4·W5·W7·W8 전부 0 — 계획서 표와 같다).
- **음성 시험(감시 지점 둘)**: 스크래치패드에 픽스처 트리를 만들어
  ① `entities/foo/index.ts`가 `./api`(`import "server-only"`)를 재수출 →
  `[W5] entity client barrel must not re-export server-only ./api; use server.ts`,
  ② `src/app/page.tsx`가 `~/fsd/widgets/bar/ui`를 임포트 →
  `[W4] widget internals require the slice barrel` — **둘 다 발화, EXIT 1**.
- **대조군**: 같은 픽스처를 규약대로 고치니(`index.ts` → `export {};` + `server.ts` 분리,
  임포트를 배럴 경유로) `FSD boundary check passed.` **EXIT 0**.

즉 **원장의 감시 지점 두 줄을 이 검사가 실제로 닫는다**는 것이 구현 전에 실증됐다.

**경로 4 전칭 여집합** — W6 위반을 독립 열거해 **정확히 5건**, 계획서의 선행 정리 목록과 파일·줄이
일치. W5(엔티티 배럴의 `./api` 재수출) 0건, W4(비-fsd 소스의 widgets 내부 임포트) 0건 —
FEAT-31·33이 각각 닫아둔 결과다. `entities/*/api/queries/` 디렉터리 **0개**(R2 예외가 죽은 설정이
된다는 계획서 판단이 맞다), `entities/*/api/`는 `index.ts` 하나씩뿐. 계획서가 범위 밖으로 보고한
pages 인트라 자기참조도 **정확히 4건**(`UploadPodcast.tsx:26·27`, `upload-detail/ui/index.tsx:10·11`).

**경로 1·3** — 선행 정리 5건의 근거를 전수 확인: `features/billing/index.ts:1`이 `PLAN_TIERS`를,
`features/upload/index.ts:22·23·25`가 `query-options`·`useDeleteUploadedFile`·`useResumeUploadDraft`를
각각 재수출한다. `stale-policy.ts`는 임포트 **0건**의 순수 상수(`export const PROCESSING_STALE_POLICY = {`)라
배럴에 올려도 클라이언트 안전하다는 판단이 맞다.

