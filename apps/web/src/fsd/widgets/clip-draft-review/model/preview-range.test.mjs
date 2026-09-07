import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getPreviewRange } from "./preview-range.ts";

// pre/post-roll이 순수 뺄셈이라 부동소수점 오차를 담을 수 있다 — 근사 비교한다.
function approx(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 1e-9,
    `expected ${actual} ≈ ${expected}`,
  );
}

describe("getPreviewRange", () => {
  it("brackets the start boundary with pre/post-roll", () => {
    // 경계 앞 1.5초 · 뒤 3.5초.
    const range = getPreviewRange("start", 167.9, 252.5);
    approx(range.startSeconds, 166.4);
    approx(range.endSeconds, 171.4);
  });

  it("plays the whole clip unchanged for 'full'", () => {
    const range = getPreviewRange("full", 167.9, 252.5);
    approx(range.startSeconds, 167.9);
    approx(range.endSeconds, 252.5);
  });

  it("brackets the end boundary with post/pre-roll", () => {
    // 끝 경계 앞 3.5초(클립 내용) · 뒤 1.5초(잘린 뒷말).
    const range = getPreviewRange("end", 167.9, 252.5);
    approx(range.startSeconds, 249.0);
    approx(range.endSeconds, 254.0);
  });

  it("clamps a negative start to zero", () => {
    // startSeconds - 1.5 < 0 → 0.
    const range = getPreviewRange("start", 1.0, 252.5);
    assert.equal(range.startSeconds, 0);
  });
});
