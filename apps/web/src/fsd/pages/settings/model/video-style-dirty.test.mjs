import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hasUnsavedVideoStyle } from "./video-style-dirty.ts";

// CaptionStyle의 여덟 필드를 모두 가진 기준값. 테스트는 이 위에서 한 필드씩 바꾼다.
const baseStyle = {
  position: "bottom",
  fontSize: 122,
  color: "#ffffff",
  maxWordsPerLine: 5,
  outlineColor: "#000000",
  outlineWidth: 1,
  uppercase: false,
  marginV: 200,
};

const style = (overrides = {}) => ({ ...baseStyle, ...overrides });
const snap = (paddingPercent, english, korean) => ({
  paddingPercent,
  captionStyles: { english, korean },
});

describe("hasUnsavedVideoStyle", () => {
  it("returns false when padding and both caption styles match", () => {
    assert.equal(
      hasUnsavedVideoStyle(
        snap(10, style(), style()),
        snap(10, style(), style()),
      ),
      false,
    );
  });

  it("returns true when only the padding differs", () => {
    assert.equal(
      hasUnsavedVideoStyle(
        snap(10, style(), style()),
        snap(15, style(), style()),
      ),
      true,
    );
  });

  it("returns true when an english caption field differs", () => {
    assert.equal(
      hasUnsavedVideoStyle(
        snap(10, style(), style()),
        snap(10, style({ fontSize: 130 }), style()),
      ),
      true,
    );
  });

  it("returns true when a korean caption field differs", () => {
    assert.equal(
      hasUnsavedVideoStyle(
        snap(10, style(), style()),
        snap(10, style(), style({ fontSize: 130 })),
      ),
      true,
    );
  });

  it("returns false when both saved and current captions are null", () => {
    assert.equal(
      hasUnsavedVideoStyle(snap(10, null, null), snap(10, null, null)),
      false,
    );
  });

  it("returns true when saved is null and current sets a caption", () => {
    assert.equal(
      hasUnsavedVideoStyle(snap(10, null, null), snap(10, style(), null)),
      true,
    );
  });

  it("returns true when saved is non-null and current is null (Default pressed)", () => {
    assert.equal(
      hasUnsavedVideoStyle(snap(10, style(), null), snap(10, null, null)),
      true,
    );
  });

  it("treats a missing marginV key the same as marginV null (old saved value)", () => {
    // 옛 저장값엔 marginV 키가 없다(undefined). current는 편집기 emit으로 marginV: null.
    // 나머지가 같으면 불러오자마자 거짓 미저장이 뜨지 않아야 한다.
    const savedNoMarginV = style();
    delete savedNoMarginV.marginV;
    assert.equal(
      hasUnsavedVideoStyle(
        snap(10, savedNoMarginV, null),
        snap(10, style({ marginV: null }), null),
      ),
      false,
    );
  });

  it("returns true when marginV differs", () => {
    assert.equal(
      hasUnsavedVideoStyle(
        snap(10, style({ marginV: 433 }), null),
        snap(10, style({ marginV: 200 }), null),
      ),
      true,
    );
  });

  it("compares by value, not object reference", () => {
    assert.equal(
      hasUnsavedVideoStyle(snap(10, style(), null), snap(10, style(), null)),
      false,
    );
  });

  it("detects a change in every CaptionStyle field individually", () => {
    // 여덟 필드 각각을 하나만 바꾼 current → true. 한 필드라도 비교에서 빠지면
    // 그 필드만 바꾼 편집이 미저장으로 안 잡혀 저장 버튼이 켜지지 않는다.
    const changes = {
      position: "top",
      fontSize: 130,
      color: "#ff0000",
      maxWordsPerLine: 3,
      outlineColor: "#111111",
      outlineWidth: 2,
      uppercase: true,
      marginV: 433,
    };
    for (const [field, value] of Object.entries(changes)) {
      assert.equal(
        hasUnsavedVideoStyle(
          snap(10, style(), null),
          snap(10, style({ [field]: value }), null),
        ),
        true,
        `changing ${field} should be detected as unsaved`,
      );
    }
  });
});
