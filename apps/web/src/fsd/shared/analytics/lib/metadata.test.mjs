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

  it("drops an allowed key whose value type is invalid, keeping the valid ones", () => {
    // 유효한 키를 섞어야 "키별 폐기"가 관측된다. 전부 무효면 다음 테스트와
    // 같은 것(전체 undefined)만 증명하고 허용 목록 필터는 검증되지 않는다.
    assert.deepEqual(
      sanitizeAnalyticsMetadata("cta_clicked", {
        location: "home_hero",
        cta: { label: "Create" },
      }),
      { location: "home_hero" },
    );
  });

  it("returns undefined when no safe metadata remains", () => {
    assert.equal(
      sanitizeAnalyticsMetadata("login_view", { email: "user@example.com" }),
      undefined,
    );
  });
});
