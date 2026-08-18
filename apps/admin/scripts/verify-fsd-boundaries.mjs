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

const LEGACY_EFFECT_OWNERS = {
  db: new Set(["src/analytics/queries.ts"]),
  fetch: new Set([
    "src/pipeline/queries.ts",
    "src/pipeline/command-action.ts",
    "src/pipeline/commit-transition.ts",
  ]),
  sentry: new Set([
    "src/instrumentation.ts",
    "src/sentry.server.config.ts",
    "src/observability/report-error.ts",
  ]),
};

const FSD_EFFECT_OWNERS = {
  db: new Set(["src/fsd/entities/analytics-event/api/queries.ts"]),
  fetch: new Set([
    "src/fsd/entities/pipeline/api/queries.ts",
    "src/fsd/features/run-pipeline-command/api/post-pipeline-command.ts",
    "src/fsd/features/run-pipeline-command/api/get-pipeline-progress.ts",
    "src/fsd/features/transition-pipeline-gate/api/commit-gate-transition.ts",
    "src/fsd/entities/agent-report/api/queries.ts",
  ]),
  sentry: new Set([
    "src/instrumentation.ts",
    "src/sentry.server.config.ts",
    "src/fsd/shared/observability/report-error.ts",
  ]),
};

const REQUIRED_FINAL_FILES = [
  "src/app/(protected)/layout.tsx",
  "src/app/(protected)/analytics/page.tsx",
  "src/app/(protected)/observability/page.tsx",
  "src/app/(protected)/pipeline/page.tsx",
  "src/server/auth/index.ts",
  "src/fsd/pages/analytics/index.ts",
  "src/fsd/pages/pipeline/index.ts",
  "src/fsd/widgets/admin-header/index.ts",
  "src/fsd/features/admin-sign-in/index.ts",
  "src/fsd/features/run-pipeline-command/index.ts",
  "src/fsd/features/transition-pipeline-gate/index.ts",
  "src/fsd/features/send-observability-test/index.ts",
  "src/fsd/entities/analytics-event/index.ts",
  "src/fsd/entities/analytics-event/api/index.ts",
  "src/fsd/entities/pipeline/index.ts",
  "src/fsd/entities/pipeline/api/index.ts",
];

const LEGACY_TOP_LEVEL = [
  "src/analytics/",
  "src/auth/",
  "src/lib/",
  "src/observability/",
  "src/pipeline/",
  "src/ui/",
];

const NETWORK_MODULES = new Set([
  "node:http",
  "node:https",
  "node:http2",
  "undici",
  "node-fetch",
  "cross-fetch",
  "axios",
  "gaxios",
  "got",
  "ky",
  "@octokit",
]);

const PROHIBITED_PIPELINE_EXPORTS = new Set([
  "AgentAvatar",
  "PixelSprite",
  "PixelOffice",
  "OwnerBanner",
  "BoardWarningBanner",
]);

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function withoutQuery(value) {
  return value.split("?")[0];
}

function scriptKind(filePath) {
  if (filePath.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (filePath.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function fsdLocation(filePath) {
  const parts = normalizePath(filePath).split("/");
  if (parts[0] !== "src" || parts[1] !== "fsd") return null;
  const layer = parts[2];
  if (!LAYER_LEVEL.has(layer)) return null;
  return { layer, slice: parts[3] ?? null, parts };
}

function isTestFile(filePath) {
  return /(?:^|\.)test\.[^.]+$/.test(path.posix.basename(filePath));
}

function isSliceRootIndex(filePath) {
  const location = fsdLocation(filePath);
  return (
    location !== null &&
    location.parts.length === 5 &&
    location.parts[4].startsWith("index.")
  );
}

function isSegmentIndex(filePath) {
  const location = fsdLocation(filePath);
  return (
    location !== null &&
    location.parts.length === 6 &&
    location.parts[5].startsWith("index.")
  );
}

function isPublicEntry(filePath) {
  return (
    isSliceRootIndex(filePath) ||
    isSegmentIndex(filePath) ||
    filePath === "src/server/auth/index.ts"
  );
}

function firstDirective(sourceFile) {
  const statement = sourceFile.statements[0];
  return statement &&
    ts.isExpressionStatement(statement) &&
    ts.isStringLiteral(statement.expression)
    ? statement.expression.text
    : null;
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

function resolveInternal(sourcePath, specifier, fileMap) {
  let base;
  if (specifier.startsWith("~/")) {
    base = `src/${specifier.slice(2)}`;
  } else if (specifier.startsWith(".")) {
    base = path.posix.normalize(
      path.posix.join(path.posix.dirname(sourcePath), specifier),
    );
  } else {
    return null;
  }

  const clean = withoutQuery(normalizePath(base));
  const candidates = SOURCE_EXTENSIONS.includes(path.posix.extname(clean))
    ? [clean]
    : [
        ...SOURCE_EXTENSIONS.map((extension) => `${clean}${extension}`),
        ...SOURCE_EXTENSIONS.map((extension) =>
          path.posix.join(clean, `index${extension}`),
        ),
      ];
  return candidates.find((candidate) => fileMap.has(candidate)) ?? undefined;
}

function propertyChain(node) {
  const names = [];
  let current = node;
  while (ts.isPropertyAccessExpression(current)) {
    names.unshift(current.name.text);
    current = current.expression;
  }
  if (ts.isIdentifier(current)) names.unshift(current.text);
  return names;
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

function allowedOwners(kind, mode) {
  if (mode === "final") return FSD_EFFECT_OWNERS[kind];
  return new Set([
    ...LEGACY_EFFECT_OWNERS[kind],
    ...FSD_EFFECT_OWNERS[kind],
  ]);
}

export function analyzeFsdBoundaries({ files, mode = "migration" }) {
  const fileMap = new Map(
    files.map(({ path: filePath, sourceText }) => [
      normalizePath(filePath),
      sourceText,
    ]),
  );
  const parsed = new Map(
    [...fileMap].map(([filePath, sourceText]) => [
      filePath,
      ts.createSourceFile(
        filePath,
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        scriptKind(filePath),
      ),
    ]),
  );
  const violations = [];
  const actualEffects = {
    db: new Set(),
    fetch: new Set(),
    sentry: new Set(),
  };

  for (const [filePath, sourceFile] of parsed) {
    const sourceLocation = fsdLocation(filePath);
    const sourceDirective = firstDirective(sourceFile);
    const production = !isTestFile(filePath);

    if (isPublicEntry(filePath) && sourceDirective !== null) {
      addViolation(
        violations,
        sourceFile,
        sourceFile.statements[0],
        "R11",
        `public entry must be directive-free, found ${sourceDirective}`,
      );
    }

    function visit(node) {
      const specifier = importSpecifier(node);
      if (specifier !== null) {
        const resolved = resolveInternal(filePath, specifier, fileMap);
        const targetLocation =
          resolved === undefined || resolved === null ? null : fsdLocation(resolved);

        if (
          (specifier.startsWith("~/") || specifier.startsWith(".")) &&
          !specifier.endsWith(".css") &&
          resolved === undefined
        ) {
          addViolation(
            violations,
            sourceFile,
            node,
            "R9",
            `internal import cannot be resolved: ${specifier}`,
          );
        }

        if (sourceLocation !== null && targetLocation !== null) {
          const sourceLevel = LAYER_LEVEL.get(sourceLocation.layer);
          const targetLevel = LAYER_LEVEL.get(targetLocation.layer);
          if (sourceLevel < targetLevel) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R1",
              `${sourceLocation.layer} cannot import upward from ${targetLocation.layer}`,
            );
          }
          if (
            sourceLocation.layer === targetLocation.layer &&
            sourceLocation.layer !== "shared" &&
            sourceLocation.slice !== targetLocation.slice
          ) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R2",
              `peer slice import is forbidden: ${targetLocation.slice}`,
            );
          }
          if (
            sourceLocation.layer === targetLocation.layer &&
            sourceLocation.slice === targetLocation.slice &&
            resolved !== null &&
            isSliceRootIndex(resolved) &&
            filePath !== resolved
          ) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R4",
              "a slice must not import its own root barrel",
            );
          }
        }

        if (
          resolved &&
          targetLocation !== null &&
          targetLocation.layer !== "shared"
        ) {
          const sameSlice =
            sourceLocation !== null &&
            sourceLocation.layer === targetLocation.layer &&
            sourceLocation.slice === targetLocation.slice;
          const publicTarget =
            isSliceRootIndex(resolved) ||
            (targetLocation.layer === "entities" &&
              targetLocation.parts[4] === "api" &&
              isSegmentIndex(resolved));
          if (!sameSlice && !publicTarget) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R3",
              `slice internals require a public entry: ${specifier}`,
            );
          }
        }

        if (sourceDirective === "use client" && resolved) {
          const targetDirective = firstDirective(parsed.get(resolved));
          const sameFeatureAction =
            sourceLocation?.layer === "features" &&
            targetLocation?.layer === "features" &&
            sourceLocation.slice === targetLocation.slice &&
            targetDirective === "use server";
          const serverTarget =
            resolved.startsWith("src/server/auth/") ||
            resolved === "src/env.js" ||
            resolved.includes("/entities/") && resolved.includes("/api/") ||
            resolved.startsWith("src/fsd/shared/observability/");
          if (serverTarget && !sameFeatureAction) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R5",
              `client module imports server runtime: ${specifier}`,
            );
          }
        }

        if (
          filePath === "src/middleware.ts" &&
          resolved?.includes("/auth/") &&
          resolved !== "src/server/auth/config.edge.ts" &&
          resolved !== "src/auth/config.edge.ts"
        ) {
          addViolation(
            violations,
            sourceFile,
            node,
            "R6",
            `middleware may import only config.edge: ${specifier}`,
          );
        }

        if (
          filePath.endsWith("/config.edge.ts") &&
          (specifier === "server-only" ||
            specifier.startsWith("~/env") ||
            specifier === "next-auth/providers/google")
        ) {
          addViolation(
            violations,
            sourceFile,
            node,
            "R7",
            `Edge auth config imports Node-only module: ${specifier}`,
          );
        }

        if (isPublicEntry(filePath) && ts.isExportDeclaration(node)) {
          if (!node.exportClause) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R10",
              "public entries must not use export *",
            );
          }
          if (specifier.includes("/_component")) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R10",
              "page-private UI must not be re-exported",
            );
          }
          if (node.exportClause && ts.isNamedExports(node.exportClause)) {
            for (const element of node.exportClause.elements) {
              if (PROHIBITED_PIPELINE_EXPORTS.has(element.name.text)) {
                addViolation(
                  violations,
                  sourceFile,
                  element,
                  "R10",
                  `private pipeline symbol is public: ${element.name.text}`,
                );
              }
            }
          }
          if (
            sourceLocation?.layer === "features" &&
            resolved?.includes("/api/")
          ) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R11",
              "feature roots must not re-export Server Actions",
            );
          }
          if (
            sourceLocation?.layer === "entities" &&
            isSliceRootIndex(filePath) &&
            resolved?.includes("/api/")
          ) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R11",
              "entity roots must not re-export server APIs",
            );
          }
          if (
            filePath === "src/server/auth/index.ts" &&
            resolved?.endsWith("/config.edge.ts")
          ) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R11",
              "Node auth entry must not re-export Edge config",
            );
          }
        }

        if (production && specifier === "@sentry/nextjs") {
          actualEffects.sentry.add(filePath);
          if (!allowedOwners("sentry", mode).has(filePath)) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R13",
              "direct Sentry SDK import is outside the approved owners",
            );
          }
        }

        if (production && NETWORK_MODULES.has(specifier)) {
          addViolation(
            violations,
            sourceFile,
            node,
            "R13",
            `unapproved network client: ${specifier}`,
          );
        }

        if (production && specifier.startsWith("@repo/db/")) {
          addViolation(
            violations,
            sourceFile,
            node,
            "R12",
            `database deep import is forbidden: ${specifier}`,
          );
        }

        if (production && specifier === "@repo/db" && ts.isImportDeclaration(node)) {
          const clause = node.importClause;
          const bindings = clause?.namedBindings;
          const importsDb =
            bindings && ts.isNamespaceImport(bindings)
              ? true
              : bindings && ts.isNamedImports(bindings)
                ? bindings.elements.some(
                    (element) => (element.propertyName?.text ?? element.name.text) === "db",
                  )
                : false;
          if (importsDb) {
            actualEffects.db.add(filePath);
            if (!allowedOwners("db", mode).has(filePath)) {
              addViolation(
                violations,
                sourceFile,
                node,
                "R12",
                "runtime db import is outside the analytics query owner",
              );
            }
            if (bindings && ts.isNamespaceImport(bindings)) {
              addViolation(
                violations,
                sourceFile,
                node,
                "R12",
                "namespace DB imports are not statically attributable",
              );
            }
          }
        }
      }

      if (ts.isCallExpression(node)) {
        if (
          node.expression.kind === ts.SyntaxKind.ImportKeyword &&
          !(
            node.arguments.length === 1 &&
            ts.isStringLiteralLike(node.arguments[0])
          )
        ) {
          addViolation(
            violations,
            sourceFile,
            node,
            "R8",
            "dynamic import specifier must be a string literal",
          );
        }

        if (production) {
          const chain = propertyChain(node.expression);
          const isBareFetch =
            ts.isIdentifier(node.expression) && node.expression.text === "fetch";
          const isKnownGlobalFetch =
            chain.length === 2 &&
            ["globalThis", "window", "self"].includes(chain[0]) &&
            chain[1] === "fetch";
          const isUnresolvedGlobalComputed =
            ts.isElementAccessExpression(node.expression) &&
            ts.isIdentifier(node.expression.expression) &&
            ["globalThis", "window", "self"].includes(
              node.expression.expression.text,
            ) &&
            !ts.isStringLiteralLike(node.expression.argumentExpression);
          if (isBareFetch || isKnownGlobalFetch || isUnresolvedGlobalComputed) {
            actualEffects.fetch.add(filePath);
            if (!allowedOwners("fetch", mode).has(filePath)) {
              addViolation(
                violations,
                sourceFile,
                node,
                "R13",
                "network call is outside the approved fetch owners",
              );
            }
          }

          if (
            chain[0] === "db" &&
            chain.join(".") !== "db.analyticsEvent.findMany"
          ) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R12",
              `only db.analyticsEvent.findMany is allowed, found ${chain.join(".")}`,
            );
          }

          if (
            ts.isIdentifier(node.expression) &&
            ["require", "createRequire"].includes(node.expression.text)
          ) {
            addViolation(
              violations,
              sourceFile,
              node,
              "R13",
              `${node.expression.text} cannot bypass effect provenance`,
            );
          }
        }
      }

      if (
        production &&
        ts.isNewExpression(node) &&
        ts.isIdentifier(node.expression) &&
        ["XMLHttpRequest", "WebSocket", "EventSource"].includes(
          node.expression.text,
        )
      ) {
        addViolation(
          violations,
          sourceFile,
          node,
          "R13",
          `browser network primitive is forbidden: ${node.expression.text}`,
        );
      }

      ts.forEachChild(node, visit);
    }

    visit(sourceFile);
  }

  if (mode === "final") {
    for (const required of REQUIRED_FINAL_FILES) {
      if (!fileMap.has(required)) {
        violations.push({
          path: required,
          line: 1,
          rule: "FINAL",
          message: "required final FSD entry is missing",
        });
      }
    }
    for (const filePath of fileMap.keys()) {
      if (LEGACY_TOP_LEVEL.some((prefix) => filePath.startsWith(prefix))) {
        violations.push({
          path: filePath,
          line: 1,
          rule: "FINAL",
          message: "legacy top-level source remains",
        });
      }
    }
    for (const kind of ["db", "fetch", "sentry"]) {
      const expected = [...FSD_EFFECT_OWNERS[kind]].sort();
      const actual = [...actualEffects[kind]].sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        violations.push({
          path: "src",
          line: 1,
          rule: kind === "db" ? "R12" : "R13",
          message: `${kind} owners mismatch: expected ${expected.join(", ")}; actual ${actual.join(", ")}`,
        });
      }
    }
  }

  return violations;
}

function readSourceFiles(root) {
  const files = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        walk(absolute);
      } else if (SOURCE_EXTENSIONS.includes(path.extname(entry.name))) {
        files.push({
          path: normalizePath(path.relative(root, absolute)),
          sourceText: fs.readFileSync(absolute, "utf8"),
        });
      }
    }
  }
  walk(path.join(root, "src"));
  return files;
}

function runCli() {
  const root = process.cwd();
  const mode = process.argv.includes("--final") ? "final" : "migration";
  const violations = analyzeFsdBoundaries({
    files: readSourceFiles(root),
    mode,
  });
  if (violations.length === 0) {
    process.stdout.write(`FSD boundary check passed (${mode}).\n`);
    return;
  }
  for (const violation of violations) {
    process.stderr.write(
      `${violation.path}:${violation.line} [${violation.rule}] ${violation.message}\n`,
    );
  }
  process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  runCli();
}
