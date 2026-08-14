import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { getMaxFeasibleClipCount } from "./clip-count-budget.ts";

describe("clip count budget", () => {
  it("allows the option maximum when duration is unknown", () => {
    // 길이 미상이면 가드하지 않는다 — 서버가 1..4를 모두 받으므로 UI도 열어 둔다.
    assert.equal(getMaxFeasibleClipCount(null), 4);
  });

  it("treats non-finite durations as unknown", () => {
    assert.equal(getMaxFeasibleClipCount(NaN), 4);
    assert.equal(getMaxFeasibleClipCount(Infinity), 4);
  });

  it("treats zero and negative durations as unknown", () => {
    assert.equal(getMaxFeasibleClipCount(0), 4);
    assert.equal(getMaxFeasibleClipCount(-30), 4);
  });

  it("returns 0 when the source is shorter than one minimum-length clip", () => {
    // 30초 미만이면 클립 한 개도 못 만든다 — 사실을 감추지 않고 0을 반환한다.
    assert.equal(getMaxFeasibleClipCount(20), 0);
  });

  it("counts non-overlapping minimum-length clips at floor boundaries", () => {
    assert.equal(getMaxFeasibleClipCount(30), 1); // 정확히 최소 길이
    assert.equal(getMaxFeasibleClipCount(59), 1);
    assert.equal(getMaxFeasibleClipCount(60), 2);
    assert.equal(getMaxFeasibleClipCount(90), 3);
    assert.equal(getMaxFeasibleClipCount(120), 4);
  });

  it("clamps to the option maximum for long sources", () => {
    // 10분(600초)의 구조적 상한은 20이지만 옵션 최댓값 4로 클램프된다.
    // 백로그 예시(10분/4개)가 구조적으로는 막히지 않음을 못박는 회귀 테스트.
    assert.equal(getMaxFeasibleClipCount(600), 4);
  });
});
