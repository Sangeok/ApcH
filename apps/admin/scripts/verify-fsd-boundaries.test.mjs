import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { analyzeFsdBoundaries } from "./verify-fsd-boundaries.mjs";

function analyze(files, mode = "migration") {
  return analyzeFsdBoundaries({
    files: Object.entries(files).map(([path, sourceText]) => ({
      path,
      sourceText,
    })),
    mode,
  });
}

function rules(files, mode) {
  return analyze(files, mode).map((violation) => violation.rule);
}

describe("FSD boundary analyzer", () => {
  it("accepts a page importing feature and entity public APIs", () => {
    assert.deepEqual(
      analyze({
        "src/fsd/pages/pipeline/index.ts":
          'export { PipelinePage } from "./ui";',
        "src/fsd/pages/pipeline/ui.ts":
          'import { Button } from "~/fsd/features/run-command"; import type { BoardItem } from "~/fsd/entities/pipeline";',
        "src/fsd/features/run-command/index.ts":
          'export { Button } from "./ui";',
        "src/fsd/features/run-command/ui.ts": "export const Button = 1;",
        "src/fsd/entities/pipeline/index.ts":
          "export type BoardItem = { id: string };",
      }),
      [],
    );
  });

  it("rejects upward and peer-slice imports", () => {
    const found = rules({
      "src/fsd/entities/a/index.ts": 'export { value } from "./model";',
      "src/fsd/entities/a/model.ts":
        'import { feature } from "~/fsd/features/x"; import { other } from "~/fsd/entities/b";',
      "src/fsd/entities/b/index.ts": "export const other = 1;",
      "src/fsd/features/x/index.ts": "export const feature = 1;",
    });
    assert.ok(found.includes("R1"));
    assert.ok(found.includes("R2"));
  });

  it("rejects deep imports and self-barrel imports", () => {
    const found = rules({
      "src/fsd/pages/a/index.ts": 'export { value } from "./model";',
      "src/fsd/pages/a/model.ts":
        'import { value } from "~/fsd/pages/a"; export { value };',
      "src/fsd/pages/b/index.ts":
        'export { value } from "~/fsd/pages/a/model";',
    });
    assert.ok(found.includes("R3"));
    assert.ok(found.includes("R4"));
  });

  it("rejects client-to-server runtime imports but allows same-feature actions", () => {
    const blocked = rules({
      "src/fsd/features/a/ui.tsx":
        '"use client"; import { requireAdmin } from "~/server/auth/guard";',
      "src/server/auth/guard.ts": 'import "server-only"; export const requireAdmin = 1;',
    });
    assert.ok(blocked.includes("R5"));

    const allowed = analyze({
      "src/fsd/features/a/ui.tsx":
        '"use client"; import { action } from "./api/action";',
      "src/fsd/features/a/api/action.ts":
        '"use server"; export async function action() {}',
    });
    assert.deepEqual(allowed, []);
  });

  it("enforces middleware and Edge-safe auth imports", () => {
    const found = rules({
      "src/middleware.ts": 'import { auth } from "~/server/auth";',
      "src/server/auth/index.ts": "export const auth = 1;",
      "src/server/auth/config.edge.ts":
        'import "server-only"; import { env } from "~/env";',
      "src/env.js": "export const env = {};",
    });
    assert.ok(found.includes("R6"));
    assert.ok(found.includes("R7"));
  });

  it("rejects non-literal dynamic imports and unresolved internal imports", () => {
    const found = rules({
      "src/fsd/shared/lib/x.ts":
        'const name = "./missing"; import(name); import "~/missing";',
    });
    assert.ok(found.includes("R8"));
    assert.ok(found.includes("R9"));
  });

  it("rejects wildcard and page-private public exports", () => {
    const found = rules({
      "src/fsd/pages/pipeline/index.ts":
        'export * from "./ui"; export { OwnerBanner } from "./ui/_component/owner-banner";',
      "src/fsd/pages/pipeline/ui/index.tsx": "export const Page = 1;",
      "src/fsd/pages/pipeline/ui/_component/owner-banner.tsx":
        "export const OwnerBanner = 1;",
    });
    assert.ok(found.filter((rule) => rule === "R10").length >= 2);
  });

  it("rejects public directives and server implementation leaks", () => {
    const found = rules({
      "src/fsd/features/a/index.ts":
        '"use client"; export { action } from "./api/action";',
      "src/fsd/features/a/api/action.ts":
        '"use server"; export async function action() {}',
      "src/fsd/entities/a/index.ts":
        'export { query } from "./api/query";',
      "src/fsd/entities/a/api/query.ts":
        'import "server-only"; export const query = 1;',
    });
    assert.ok(found.filter((rule) => rule === "R11").length >= 3);
  });

  it("allows only the exact DB owner and findMany call", () => {
    assert.deepEqual(
      analyze({
        "src/fsd/entities/analytics-event/api/queries.ts":
          'import { db } from "@repo/db"; db.analyticsEvent.findMany({});',
      }),
      [],
    );
    const found = rules({
      "src/fsd/pages/a/model.ts":
        'import * as database from "@repo/db"; database.db.user.findMany();',
      "src/fsd/entities/analytics-event/api/queries.ts":
        'import { db } from "@repo/db"; db.analyticsEvent.create({});',
      "src/fsd/shared/lib/deep.ts": 'import { db } from "@repo/db/generated";',
    });
    assert.ok(found.filter((rule) => rule === "R12").length >= 3);
  });

  it("rejects fetch, browser primitives, network clients and Sentry outside owners", () => {
    const found = rules({
      "src/fsd/pages/a/model.ts":
        'import axios from "axios"; import * as Sentry from "@sentry/nextjs"; fetch("x"); window.fetch("x"); new WebSocket("x");',
    });
    assert.ok(found.filter((rule) => rule === "R13").length >= 5);
  });

  it("accepts fetch in all four production fetch owners but rejects it elsewhere", () => {
    // 승인된 네 owner(진행 GET을 네 번째로 포함)에서의 fetch는 통과한다.
    assert.deepEqual(
      analyze({
        "src/fsd/entities/pipeline/api/queries.ts":
          'export const q = () => fetch("a");',
        "src/fsd/features/run-pipeline-command/api/post-pipeline-command.ts":
          '"use server"; export const post = () => fetch("b");',
        "src/fsd/features/run-pipeline-command/api/get-pipeline-progress.ts":
          '"use server"; export const get = () => fetch("c");',
        "src/fsd/features/transition-pipeline-gate/api/commit-gate-transition.ts":
          '"use server"; export const commit = () => fetch("d");',
      }),
      [],
    );
    // 같은 fetch가 page·shared·client 등 owner 밖 파일에 있으면 계속 R13으로 거부된다.
    const found = rules({
      "src/fsd/pages/pipeline/model/poll.ts":
        'export const poll = () => fetch("x");',
      "src/fsd/shared/lib/net.ts": 'export const net = () => fetch("y");',
      "src/fsd/features/run-pipeline-command/ui/leak.tsx":
        '"use client"; export const leak = () => fetch("z");',
    });
    assert.equal(found.filter((rule) => rule === "R13").length, 3);
  });

  it("accepts fetch in the repo-doc query owner but rejects it at a non-owner repo-doc path", () => {
    // 등록된 owner에서의 fetch 둘(getDocContent·getPlanDocIds)은 통과한다.
    assert.deepEqual(
      analyze({
        "src/fsd/entities/repo-doc/api/queries.ts":
          'export const a = () => fetch("x"); export const b = () => fetch("y");',
      }),
      [],
    );
    // 음성 시험(mutation): 같은 fetch를 owner가 아닌 repo-doc 경로(순수여야 하는 model)에 두면 R13.
    // repo-doc owner 등록을 FSD_EFFECT_OWNERS.fetch에서 빼면 실제 queries.ts의 fetch가 바로 이
    // 위반을 받는다 — 등록이 장식이 아님을 고정한다.
    const found = rules({
      "src/fsd/entities/repo-doc/model/markdown.ts":
        'export const leak = () => fetch("z");',
    });
    assert.equal(found.filter((rule) => rule === "R13").length, 1);
  });

  it("final mode rejects missing entries, legacy files, and effect-owner drift", () => {
    const found = rules(
      {
        "src/pipeline/queries.ts": "fetch('x');",
      },
      "final",
    );
    assert.ok(found.includes("FINAL"));
    assert.ok(found.includes("R12"));
    assert.ok(found.includes("R13"));
  });
});
