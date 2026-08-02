import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeAnalyticsMetadata } from "./metadata.ts";

describe("sanitizeAnalyticsMetadata", () => {
  it("keeps only allowlisted primitive values for the event", () => {
    assert.deepEqual(
      sanitizeAnalyticsMetadata("upload_started", {
        fileType: "video/mp4",
        fileSizeMb: 128.4,
        language: "English",
        clipCount: 3,
        fileName: "private-file-name.mp4",
        nested: { unsafe: true },
      }),
      {
        fileType: "video/mp4",
        fileSizeMb: 128.4,
        language: "English",
        clipCount: 3,
      },
    );
  });

  it("drops allowed keys when the value type is invalid", () => {
    assert.equal(
      sanitizeAnalyticsMetadata("cta_clicked", {
        location: ["home_hero"],
        cta: { label: "Create" },
      }),
      undefined,
    );
  });

  it("returns undefined when no safe metadata remains", () => {
    assert.equal(
      sanitizeAnalyticsMetadata("login_view", { email: "user@example.com" }),
      undefined,
    );
  });
});
