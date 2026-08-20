import assert from "node:assert/strict";
import { describe, it } from "node:test";

const {
  locationFromSlug,
  isWhitelistedDocPath,
  docLinksForItem,
  planDocHref,
  reportDocHref,
} = await import("./doc-location.ts");

describe("locationFromSlug", () => {
  it("maps a plan slug to a plan location with itemId", () => {
    assert.deepEqual(locationFromSlug(["plans", "FEAT-14"]), {
      path: "docs/plans/FEAT-14.md",
      kind: "plan",
      itemId: "FEAT-14",
      agent: null,
    });
  });

  it("maps an agent report slug to a report location with agent and itemId", () => {
    assert.deepEqual(locationFromSlug(["agents", "admin-dev", "FEAT-14"]), {
      path: "docs/agents/admin-dev/FEAT-14.md",
      kind: "report",
      itemId: "FEAT-14",
      agent: "admin-dev",
    });
  });

  it("leaves itemId null for a fixed-name report (감사기록)", () => {
    assert.deepEqual(locationFromSlug(["agents", "doc-auditor", "감사기록"]), {
      path: "docs/agents/doc-auditor/감사기록.md",
      kind: "report",
      itemId: null,
      agent: "doc-auditor",
    });
  });

  it("leaves itemId null when the plan file is not an item id (README)", () => {
    assert.equal(locationFromSlug(["plans", "README"])?.itemId, null);
  });

  it("rejects path traversal segments", () => {
    assert.equal(locationFromSlug(["plans", "..", "secrets"]), null);
  });

  it("rejects a lone dot segment in either root", () => {
    assert.equal(locationFromSlug(["plans", "."]), null);
    assert.equal(locationFromSlug(["agents", ".", "FEAT-14"]), null);
  });

  it("rejects an unknown root", () => {
    assert.equal(locationFromSlug(["config", "x"]), null);
  });

  it("rejects a length violation for plans", () => {
    assert.equal(locationFromSlug(["plans", "a", "b"]), null);
  });

  it("accepts a Korean segment", () => {
    assert.equal(
      locationFromSlug(["agents", "doc-auditor", "감사기록"])?.path,
      "docs/agents/doc-auditor/감사기록.md",
    );
  });
});

describe("isWhitelistedDocPath", () => {
  it("allows plan and report paths under docs/", () => {
    assert.equal(isWhitelistedDocPath("docs/plans/FEAT-14.md"), true);
    assert.equal(isWhitelistedDocPath("docs/agents/main-loop/FEAT-14.md"), true);
  });

  it("rejects traversal, out-of-tree, wrong folder, and dot segments", () => {
    assert.equal(isWhitelistedDocPath("docs/../env"), false);
    assert.equal(isWhitelistedDocPath("src/env.js"), false);
    assert.equal(isWhitelistedDocPath("docs/other/x.md"), false);
    assert.equal(isWhitelistedDocPath("docs/plans/..md"), false);
    assert.equal(isWhitelistedDocPath("docs/agents/./FEAT-14.md"), false);
  });
});

describe("docLinksForItem", () => {
  it("returns only the plan link when there is a plan and no reports", () => {
    assert.deepEqual(docLinksForItem("FEAT-14", true, new Set()), [
      { label: "계획서", href: "/pipeline/docs/plans/FEAT-14", kind: "plan" },
    ]);
  });

  it("orders links plan→검증→구현(admin→web→backend)→감사→정찰", () => {
    const links = docLinksForItem(
      "FEAT-14",
      true,
      new Set([
        "feature-scout",
        "backend-dev",
        "doc-auditor",
        "web-dev",
        "admin-dev",
        "main-loop",
      ]),
    );
    assert.deepEqual(
      links.map((l) => l.label),
      ["계획서", "검증 기록", "구현 보고", "구현 보고", "구현 보고", "감사 보고", "정찰 보고"],
    );
  });

  it("labels a backend-dev report as 구현 보고", () => {
    assert.deepEqual(docLinksForItem("BUG-01", false, new Set(["backend-dev"])), [
      { label: "구현 보고", href: "/pipeline/docs/agents/backend-dev/BUG-01", kind: "report" },
    ]);
  });

  it("labels doc-auditor and feature-scout reports distinctly", () => {
    assert.equal(
      docLinksForItem("X-1", false, new Set(["doc-auditor"]))[0].label,
      "감사 보고",
    );
    assert.equal(
      docLinksForItem("X-1", false, new Set(["feature-scout"]))[0].label,
      "정찰 보고",
    );
  });

  it("returns no links when there is neither plan nor report", () => {
    assert.deepEqual(docLinksForItem("X-1", false, new Set()), []);
  });

  it("excludes pm which has no report folder", () => {
    assert.deepEqual(docLinksForItem("X-1", false, new Set(["pm"])), []);
  });

  it("builds hrefs in the expected form", () => {
    assert.equal(planDocHref("FEAT-14"), "/pipeline/docs/plans/FEAT-14");
    assert.equal(
      reportDocHref("main-loop", "FEAT-14"),
      "/pipeline/docs/agents/main-loop/FEAT-14",
    );
  });
});
