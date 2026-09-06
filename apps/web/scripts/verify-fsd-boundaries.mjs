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
  // 타입 전용 임포트는 컴파일 시 소거돼 런타임 결합이 없다 — W8은 값 임포트만 본다.
  // (`verbatimModuleSyntax`가 켜져 있어 타입 사용은 반드시 `import type`/inline `type`으로 표기된다.)
  if (!clause || clause.isTypeOnly) return false;
  const bindings = clause.namedBindings;
  if (!bindings) return false;
  if (ts.isNamespaceImport(bindings)) return true;
  if (ts.isNamedImports(bindings)) {
    return bindings.elements.some(
      (el) => !el.isTypeOnly && (el.propertyName?.text ?? el.name.text) === "db",
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
