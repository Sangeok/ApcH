import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { toCaptionStyle } from "./caption-style-from-json.ts";

describe("toCaptionStyle", () => {
  it("maps null to null (no stored style = language default)", () => {
    assert.equal(toCaptionStyle(null), null);
  });

  it("maps undefined to null", () => {
    assert.equal(toCaptionStyle(undefined), null);
  });

  it("fills missing new keys with null and keeps DEFAULT_POSITION", () => {
    // 필드가 늘기 전에 저장된 행: 신규 키가 없다. position은 DEFAULT_POSITION,
    // 나머지 신규 키는 null(= 백엔드 언어 기본값), 기존 값은 보존.
    assert.deepEqual(toCaptionStyle({ color: "#ffffff" }), {
      position: "middle",
      fontSize: null,
      color: "#ffffff",
      maxWordsPerLine: null,
      outlineColor: null,
      outlineWidth: null,
      uppercase: null,
    });
  });

  it("passes a complete object through unchanged", () => {
    const full = {
      position: "top",
      fontSize: 122,
      color: "#FFE45E",
      maxWordsPerLine: 5,
      outlineColor: "#000000",
      outlineWidth: 2,
      uppercase: true,
    };
    assert.deepEqual(toCaptionStyle(full), full);
  });

  it("keeps a stored position instead of overriding with the default", () => {
    const result = toCaptionStyle({ position: "bottom" });
    assert.equal(result.position, "bottom");
  });

  it("preserves uppercase: false (falsy is not missing)", () => {
    // clean-white·mint-pop 프리셋이 uppercase: false를 싣는다. `??`가 아니라
    // `||`로 쓴 구현은 이 false를 null로 갈아치워 백엔드 언어 기본값으로
    // 렌더되는데, 화면에는 "기본값 적용"으로 보여 크레딧을 쓴 뒤에야 안다.
    const result = toCaptionStyle({ uppercase: false });
    assert.equal(result.uppercase, false);
  });

  it("preserves outlineWidth: 0 (falsy is not missing)", () => {
    // OUTLINE_WIDTH_RANGE.MIN 이 0이라 편집기 「−」 한 번으로 0에 닿고 저장도
    // 통과한다(.int().min(0)). `||`로 쓴 구현은 이 0을 null로 갈아치운다.
    const result = toCaptionStyle({ outlineWidth: 0 });
    assert.equal(result.outlineWidth, 0);
  });
});
