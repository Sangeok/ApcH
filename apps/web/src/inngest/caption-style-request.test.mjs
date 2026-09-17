import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { requestCaptionStyle } from "./caption-style-request.ts";

const SNAPSHOT = {
  position: "bottom",
  fontSize: 120,
  color: "#ffffff",
  maxWordsPerLine: 4,
  outlineColor: "#000000",
  outlineWidth: 2,
  uppercase: false,
};

// "업로드 스냅샷이 요청 단위 caption_style, null은 언어 기본값" 계약을 못박는다.
// FEAT-52에서 render/auto 구분이 사라졌다(백엔드는 클립별 스타일 부재 시 이 값으로 폴백).
describe("requestCaptionStyle", () => {
  it("returns the upload snapshot when present (auto and render alike)", () => {
    assert.equal(requestCaptionStyle(SNAPSHOT), SNAPSHOT);
  });

  it("returns undefined when the snapshot is null (key omitted → language defaults)", () => {
    assert.equal(requestCaptionStyle(null), undefined);
  });
});
