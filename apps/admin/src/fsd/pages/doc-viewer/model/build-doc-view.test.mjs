import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";

// build-doc-view는 gate feature root를 임포트하고, 그 root는 client UI → server action을
// 전이 로드한다(briefing.test.mjs와 같은 사슬). 실제 I/O 없이 로드만 되도록 세 모듈을 mock한다.
mock.module("server-only", { namedExports: {} });
mock.module("~/env", {
  namedExports: { env: { GITHUB_PIPELINE_TOKEN: undefined } },
});
mock.module("~/server/auth/guard", {
  namedExports: {
    requireAdmin: async () => ({
      userId: "admin-test-user",
      email: "admin@example.com",
    }),
  },
});

const { buildDocView, dossierTabs } = await import("./build-doc-view.ts");
const { locationFromSlug, planDocHref, docSourceUrl } = await import(
  "~/fsd/entities/repo-doc"
);

after(() => mock.restoreAll());

const item = (status) => ({
  checked: false,
  id: "FEAT-14",
  title: "t",
  agent: "admin-dev",
  area: "apps/admin",
  status,
  reason: "r",
  result: null,
  validation: null,
});

const reportsWith = (...agents) =>
  new Map(agents.map((a) => [a, [{ name: "FEAT-14.md", label: "FEAT-14", size: 1 }]]));

describe("dossierTabs", () => {
  it("shows only existing siblings, marks one active, in deterministic order", () => {
    const reports = reportsWith("main-loop", "admin-dev", "doc-auditor");
    const tabs = dossierTabs("FEAT-14", planDocHref("FEAT-14"), true, reports);
    assert.deepEqual(
      tabs.map((t) => t.label),
      ["계획서", "검증 기록", "구현 보고", "감사 보고"],
    );
    assert.deepEqual(
      tabs.map((t) => t.active),
      [true, false, false, false],
    );
  });

  it("excludes agents whose report does not match this item", () => {
    const reports = new Map([
      ["main-loop", [{ name: "FEAT-13.md", label: "FEAT-13", size: 1 }]],
    ]);
    const tabs = dossierTabs("FEAT-14", planDocHref("FEAT-14"), true, reports);
    assert.deepEqual(tabs.map((t) => t.label), ["계획서"]);
  });
});

describe("buildDocView", () => {
  const planLoc = locationFromSlug(["plans", "FEAT-14"]);
  const reportLoc = locationFromSlug(["agents", "admin-dev", "FEAT-14"]);
  const fixedLoc = locationFromSlug(["agents", "doc-auditor", "감사기록"]);

  it("labels a plan document", () => {
    const view = buildDocView(planLoc, "# T", null, new Set(), new Map());
    assert.equal(view.kind, "plan");
    assert.equal(view.kindLabel, "계획서 · 현재 계약");
    assert.equal(view.title, "FEAT-14");
  });

  it("labels a report document", () => {
    const view = buildDocView(reportLoc, "# T", null, new Set(), new Map());
    assert.equal(view.kind, "report");
    assert.equal(view.kindLabel, "보고서 · 누적 기록");
  });

  it("exposes gate②(구현승인) and reject actions for a 검토대기 item", () => {
    const view = buildDocView(planLoc, "# T", item("검토대기"), new Set(["FEAT-14"]), new Map());
    assert.equal(view.gateLabel, "구현승인");
    assert.deepEqual(view.rejectActions, ["bounce", "hold", "discard"]);
  });

  it("does not expose gate①(승인대기) — that belongs to the inbox", () => {
    const view = buildDocView(planLoc, "# T", item("승인대기"), new Set(), new Map());
    assert.equal(view.gateLabel, null);
    assert.deepEqual(view.rejectActions, []);
  });

  it("exposes no gate for a 완료 item", () => {
    const view = buildDocView(planLoc, "# T", item("완료"), new Set(), new Map());
    assert.equal(view.gateLabel, null);
    assert.deepEqual(view.rejectActions, []);
  });

  it("has null status but keeps sibling tabs when there is no board item", () => {
    const view = buildDocView(planLoc, "# T", null, new Set(["FEAT-14"]), reportsWith("main-loop"));
    assert.equal(view.status, null);
    assert.deepEqual(view.tabs.map((t) => t.label), ["계획서", "검증 기록"]);
  });

  it("renders a fixed-name doc standalone even if a 검토대기 item is wrongly injected", () => {
    const view = buildDocView(fixedLoc, "# T", item("검토대기"), new Set(["FEAT-14"]), reportsWith("main-loop"));
    assert.equal(view.itemId, null);
    assert.equal(view.gateLabel, null);
    assert.deepEqual(view.rejectActions, []);
    assert.deepEqual(view.tabs, []);
  });

  it("includes rendered html and a blob source URL", () => {
    const view = buildDocView(planLoc, "# Title\n\nbody", null, new Set(), new Map());
    assert.ok(view.html.includes("<h1>Title</h1>"));
    assert.equal(view.sourceUrl, docSourceUrl("docs/plans/FEAT-14.md"));
    assert.ok(view.sourceUrl.includes("/blob/"));
  });
});
