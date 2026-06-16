import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeAnalyticsPath,
  normalizeAnalyticsReferrer,
} from "./normalize-path.ts";

describe("normalizeAnalyticsPath", () => {
  it("drops query strings and hashes before storage", () => {
    assert.equal(
      normalizeAnalyticsPath("/pricing?utm_source=email#plans"),
      "/pricing",
    );
  });

  it("redacts concrete upload detail identifiers", () => {
    assert.equal(
      normalizeAnalyticsPath("/dashboard/uploads/clx123abc"),
      "/dashboard/uploads/[uploadedFileId]",
    );
  });

  it("normalizes absolute same-origin style URLs to a pathname", () => {
    assert.equal(
      normalizeAnalyticsPath("https://example.com/dashboard/billing?checkout=success"),
      "/dashboard/billing",
    );
  });

  it("returns root for invalid or empty paths", () => {
    assert.equal(normalizeAnalyticsPath(""), "/");
    assert.equal(normalizeAnalyticsPath("not a path"), "/");
  });
});

describe("normalizeAnalyticsReferrer", () => {
  it("keeps origin and pathname but drops query strings and hashes", () => {
    assert.equal(
      normalizeAnalyticsReferrer("https://google.com/search?q=private#result"),
      "https://google.com/search",
    );
  });

  it("redacts upload detail paths in same-site referrers", () => {
    assert.equal(
      normalizeAnalyticsReferrer(
        "https://example.com/dashboard/uploads/clx123abc?token=secret",
      ),
      "/dashboard/uploads/[uploadedFileId]",
    );
  });
});
