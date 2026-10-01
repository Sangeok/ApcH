import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clipCountNotice } from "./clip-count-notice.ts";

const GENERAL = "The AI may return fewer.";

describe("clipCountNotice", () => {
  it("returns the general notice when duration is unknown (null)", () => {
    // 길이 미상 → getMaxFeasibleClipCount가 옵션 최댓값(4)을 돌려주므로 일반 안내.
    assert.equal(clipCountNotice(null), GENERAL);
  });

  it("treats non-finite, zero, and negative durations as unknown", () => {
    assert.equal(clipCountNotice(NaN), GENERAL);
    assert.equal(clipCountNotice(Infinity), GENERAL);
    assert.equal(clipCountNotice(0), GENERAL);
    assert.equal(clipCountNotice(-30), GENERAL);
  });

  it("returns null when the source is too short for one clip", () => {
    // 30초 미만 → 상한 0. 그 안내는 파일 줄에 destructive로 뜬다.
    assert.equal(clipCountNotice(20), null);
  });

  it("names the cap with a singular clip at exactly one clip of headroom", () => {
    assert.equal(
      clipCountNotice(30),
      "This video fits up to 1 clip. The AI may return fewer.",
    );
  });

  it("pluralizes clips when the cap is above one but below the option maximum", () => {
    assert.equal(
      clipCountNotice(60),
      "This video fits up to 2 clips. The AI may return fewer.",
    );
    assert.equal(
      clipCountNotice(90),
      "This video fits up to 3 clips. The AI may return fewer.",
    );
  });

  it("returns the general notice when the cap reaches the option maximum", () => {
    assert.equal(clipCountNotice(120), GENERAL);
    assert.equal(clipCountNotice(600), GENERAL);
  });
});
