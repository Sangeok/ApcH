import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { autoRequestCaptionStyle } from "./caption-style-request.ts";

const SNAPSHOT = {
  position: "bottom",
  fontSize: 120,
  color: "#ffffff",
  maxWordsPerLine: 4,
  outlineColor: "#000000",
  outlineWidth: 2,
  uppercase: false,
};

// "render는 moment 스타일만, auto만 요청 단위, null은 언어 기본값" 계약을 못박는다.
describe("autoRequestCaptionStyle", () => {
  it("returns undefined for render mode even with a snapshot", () => {
    // render는 moments[].caption_style만 쓰므로 요청 단위 스타일을 무효화한다.
    assert.equal(autoRequestCaptionStyle(true, SNAPSHOT), undefined);
  });

  it("returns the snapshot for auto mode", () => {
    assert.equal(autoRequestCaptionStyle(false, SNAPSHOT), SNAPSHOT);
  });

  it("returns undefined for auto mode when the snapshot is null", () => {
    // 키 생략 → 백엔드 언어 기본값.
    assert.equal(autoRequestCaptionStyle(false, null), undefined);
  });
});
