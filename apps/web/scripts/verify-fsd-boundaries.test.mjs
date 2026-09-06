import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeFsdBoundaries } from "./verify-fsd-boundaries.mjs";

function analyze(files) {
  return analyzeFsdBoundaries({
    files: Object.entries(files).map(([path, sourceText]) => ({
      path,
      sourceText,
    })),
  });
}

function rules(files) {
  return analyze(files).map((violation) => violation.rule);
}

describe("FSD boundary analyzer (web)", () => {
  it("W1: rejects an entity importing upward from a feature", () => {
    const found = rules({
      "src/fsd/entities/a/model/thing.ts":
        'import { feature } from "~/fsd/features/x";',
      "src/fsd/features/x/index.ts": "export const feature = 1;",
    });
    assert.ok(found.includes("W1"));
  });

  it("W2: rejects a peer-slice import within the same layer", () => {
    const found = rules({
      "src/fsd/entities/a/model/thing.ts":
        'import { other } from "~/fsd/entities/b";',
      "src/fsd/entities/b/index.ts": "export const other = 1;",
    });
    assert.ok(found.includes("W2"));
  });

  it("W3: rejects a slice importing its own root barrel (index and server)", () => {
    const fromIndex = rules({
      "src/fsd/pages/a/model/thing.ts": 'import { x } from "~/fsd/pages/a";',
      "src/fsd/pages/a/index.ts": "export const x = 1;",
    });
    assert.ok(fromIndex.includes("W3"));

    const fromServer = rules({
      "src/fsd/entities/a/model/thing.ts":
        'import { s } from "~/fsd/entities/a/server";',
      "src/fsd/entities/a/server.ts": 'import "server-only"; export const s = 1;',
    });
    assert.ok(fromServer.includes("W3"));
  });

  it("W4: rejects a non-fsd source importing widget internals, allows the barrel (FEAT-33 entry side)", () => {
    const found = rules({
      "src/app/x/page.tsx": 'import { X } from "~/fsd/widgets/w/ui";',
      "src/fsd/widgets/w/ui/index.tsx": "export const X = 1;",
      "src/fsd/widgets/w/index.ts": 'export { X } from "./ui";',
    });
    assert.ok(found.includes("W4"));

    assert.deepEqual(
      analyze({
        "src/app/x/page.tsx": 'import { X } from "~/fsd/widgets/w";',
        "src/fsd/widgets/w/ui/index.tsx": "export const X = 1;",
        "src/fsd/widgets/w/index.ts": 'export { X } from "./ui";',
      }),
      [],
    );
  });

  it("W5: rejects an entity client barrel re-exporting server-only ./api (FEAT-31 watchpoint)", () => {
    const found = rules({
      "src/fsd/entities/foo/index.ts": 'export { q } from "./api";',
      "src/fsd/entities/foo/api/index.ts":
        'import "server-only"; export const q = 1;',
    });
    assert.ok(found.includes("W5"));

    // 정상: index.ts는 model만 재수출하고 server 전용은 server.ts가 ./api를 재수출한다.
    assert.deepEqual(
      analyze({
        "src/fsd/entities/foo/index.ts": 'export { m } from "./model/m";',
        "src/fsd/entities/foo/model/m.ts": "export const m = 1;",
        "src/fsd/entities/foo/server.ts":
          'import "server-only"; export { q } from "./api";',
        "src/fsd/entities/foo/api/index.ts":
          'import "server-only"; export const q = 1;',
      }),
      [],
    );
  });

  it("W6: rejects a cross-slice deep import, allows public entries (FEAT-33 pages side)", () => {
    const found = rules({
      "src/fsd/pages/p/ui/index.tsx":
        'import { X } from "~/fsd/widgets/w/ui";',
      "src/fsd/widgets/w/ui/index.tsx": "export const X = 1;",
      "src/fsd/widgets/w/index.ts": 'export { X } from "./ui";',
    });
    assert.ok(found.includes("W6"));

    // 세 종류의 Public entry 경유는 통과: widgets index, entities server.ts, features api/index.ts.
    assert.deepEqual(
      analyze({
        "src/fsd/pages/p/ui/index.tsx": 'import { X } from "~/fsd/widgets/w";',
        "src/fsd/widgets/w/index.ts": 'export { X } from "./ui";',
        "src/fsd/widgets/w/ui/index.tsx": "export const X = 1;",
      }),
      [],
    );
    assert.deepEqual(
      analyze({
        "src/fsd/pages/dashboard/model/hook.ts":
          'import { action } from "~/fsd/features/upload/api";',
        "src/fsd/features/upload/api/index.ts":
          '"use server"; export const action = 1;',
      }),
      [],
    );
    assert.deepEqual(
      analyze({
        "src/fsd/features/upload/api/reconcile.ts":
          'import "server-only"; import { q } from "~/fsd/entities/uploaded-file/server";',
        "src/fsd/entities/uploaded-file/server.ts":
          'import "server-only"; export const q = 1;',
      }),
      [],
    );
  });

  it("W7: rejects internal imports that cannot be resolved (static and dynamic)", () => {
    const found = rules({
      "src/fsd/shared/lib/x.ts": 'import "~/missing"; import("./also-missing");',
    });
    assert.ok(found.includes("W7"));
    assert.equal(found.filter((rule) => rule === "W7").length, 2);
  });

  it("W8: rejects db client value imports outside owners, allows every owner", () => {
    const found = rules({
      "src/fsd/pages/a/model/x.ts": 'import { db } from "~/server/db";',
      "src/fsd/shared/lib/y.ts": 'import * as database from "@repo/db";',
    });
    assert.equal(found.filter((rule) => rule === "W8").length, 2);

    assert.deepEqual(
      analyze({
        "src/server/db.ts": 'import { db } from "@repo/db";',
        "src/server/auth/config.ts": 'import { db } from "@repo/db";',
        "src/fsd/features/upload/api/dispatch-processing.ts":
          'import { db } from "@repo/db";',
        "src/fsd/features/upload/api/complete-processing-attempt.ts":
          'import { db } from "@repo/db";',
        "src/fsd/features/upload/api/index.ts":
          'import { db } from "@repo/db";',
        "src/fsd/entities/uploaded-file/api/index.ts":
          'import { db } from "@repo/db";',
      }),
      [],
    );
  });

  it("W8: the owner registration is load-bearing — a sibling non-owner path violates", () => {
    // 정확한 owner 경로는 통과한다.
    assert.deepEqual(
      analyze({
        "src/fsd/features/upload/api/dispatch-processing.ts":
          'import { db } from "@repo/db";',
      }),
      [],
    );
    // 같은 슬라이스라도 owner 목록·접두사(entities/**/api/**) 밖 경로면 W8이 발화한다.
    // owner 목록에서 위 파일을 빼면 그 파일이 곧바로 이 위반을 받는다는 것을 고정한다.
    const found = rules({
      "src/fsd/features/upload/model/dispatch.ts":
        'import { db } from "@repo/db";',
    });
    assert.equal(found.filter((rule) => rule === "W8").length, 1);
  });

  it("W8: type-only db imports are elided and do not violate", () => {
    assert.deepEqual(
      analyze({
        "src/fsd/pages/a/model/x.ts": 'import type { db } from "@repo/db";',
        "src/fsd/pages/a/model/y.ts": 'import { type db } from "@repo/db";',
      }),
      [],
    );
  });

  it("CLI signal: a violating fixture yields a non-empty result (runCli exits 1)", () => {
    const violations = analyze({
      "src/fsd/entities/foo/index.ts": 'export { q } from "./api";',
      "src/fsd/entities/foo/api/index.ts":
        'import "server-only"; export const q = 1;',
    });
    assert.ok(violations.length > 0);
  });
});
