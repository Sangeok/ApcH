import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clipTypeLabel } from "./clip-type-label.ts";

// 이 매핑은 백엔드 clipType 값과의 wire 계약이다. 백엔드가 enum을 강제하지
// 않으므로(프롬프트의 요청일 뿐) 미지의 값을 빈 칸으로 삼키지 않는 것이 계약의 핵심이고,
// 그건 타입이 아니라 이 테스트만 지킨다.
describe("clipTypeLabel", () => {
  it("maps the two known backend values to display labels", () => {
    assert.equal(clipTypeLabel("qa"), "Q&A");
    assert.equal(clipTypeLabel("insight"), "Insight");
  });

  it("returns unknown values unchanged instead of swallowing them", () => {
    assert.equal(clipTypeLabel("story"), "story");
  });

  it("returns null for nullish, empty, or whitespace-only input", () => {
    assert.equal(clipTypeLabel(null), null);
    assert.equal(clipTypeLabel(undefined), null);
    assert.equal(clipTypeLabel(""), null);
    assert.equal(clipTypeLabel("  "), null);
  });
});
