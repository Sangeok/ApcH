import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveEffectiveCaptionStyle } from "./effective-caption-style.ts";

describe("resolveEffectiveCaptionStyle", () => {
  it("falls back to English language defaults when the style is null", () => {
    assert.deepEqual(resolveEffectiveCaptionStyle(null, "English"), {
      position: "middle",
      fontSize: 122,
      color: "#FFFFFF",
      maxWordsPerLine: 5,
      outlineColor: "#000000",
      outlineWidth: 1.1,
      uppercase: false,
    });
  });

  it("falls back to Korean language defaults when the style is null", () => {
    assert.deepEqual(resolveEffectiveCaptionStyle(null, "Korean"), {
      position: "middle",
      fontSize: 130,
      color: "#FFFFFF",
      maxWordsPerLine: 3,
      outlineColor: "#000000",
      outlineWidth: 1.3,
      uppercase: false,
    });
  });

  it("overrides each present field but keeps language defaults for null fields", () => {
    // 각 필드가 독립적으로 폴백한다 — 있는 값은 그대로, null만 언어 기본값으로.
    const style = {
      position: "top",
      fontSize: null,
      color: "#FFE45E",
      maxWordsPerLine: null,
      outlineColor: "#1D4ED8",
      outlineWidth: null,
      uppercase: null,
    };
    assert.deepEqual(resolveEffectiveCaptionStyle(style, "Korean"), {
      position: "top", // 있는 값 override
      fontSize: 130, // null → 한국어 기본값
      color: "#FFE45E", // 있는 값 override
      maxWordsPerLine: 3, // null → 한국어 기본값
      outlineColor: "#1D4ED8", // 있는 값 override
      outlineWidth: 1.3, // null → 한국어 기본값
      uppercase: false, // null → false
    });
  });

  it("preserves a saved outlineWidth of 0 instead of the language default", () => {
    // 0 = OUTLINE_WIDTH_RANGE.MIN, 실제 저장될 수 있는 값. `??`를 `||`로 바꾸면 이 케이스가 깨진다.
    const style = {
      position: "middle",
      fontSize: 100,
      color: "#FFFFFF",
      maxWordsPerLine: 2,
      outlineColor: "#000000",
      outlineWidth: 0,
      uppercase: false,
    };
    assert.equal(resolveEffectiveCaptionStyle(style, "English").outlineWidth, 0);
    assert.equal(resolveEffectiveCaptionStyle(style, "Korean").outlineWidth, 0);
  });

  it("maps uppercase true/false through and null to false", () => {
    const base = {
      position: "middle",
      fontSize: 122,
      color: "#FFFFFF",
      maxWordsPerLine: 5,
      outlineColor: "#000000",
      outlineWidth: 1,
    };
    assert.equal(
      resolveEffectiveCaptionStyle({ ...base, uppercase: true }, "English")
        .uppercase,
      true,
    );
    assert.equal(
      resolveEffectiveCaptionStyle({ ...base, uppercase: false }, "English")
        .uppercase,
      false,
    );
    assert.equal(
      resolveEffectiveCaptionStyle({ ...base, uppercase: null }, "English")
        .uppercase,
      false,
    );
  });

  it("treats any non-Korean language as the English branch", () => {
    // 폴백은 isKorean === false 한 분기로 갈린다 — Japanese·빈 문자열·소문자 korean 모두 영어.
    for (const language of ["Japanese", "", "korean"]) {
      const effective = resolveEffectiveCaptionStyle(null, language);
      assert.equal(effective.fontSize, 122, `${language} fontSize`);
      assert.equal(effective.maxWordsPerLine, 5, `${language} maxWordsPerLine`);
      assert.equal(effective.outlineWidth, 1.1, `${language} outlineWidth`);
    }
  });
});
