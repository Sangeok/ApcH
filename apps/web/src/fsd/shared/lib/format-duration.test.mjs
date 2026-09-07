import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatSecondsAsClock, parseClockToSeconds } from "./format-duration.ts";

describe("parseClockToSeconds", () => {
  it("parses m:ss.s / m:ss / bare-number forms to seconds", () => {
    assert.equal(parseClockToSeconds("2:47.9"), 167.9);
    assert.equal(parseClockToSeconds("2:47"), 167);
    // 콜론 없는 맨숫자는 초 그대로다(입력 편의).
    assert.equal(parseClockToSeconds("167.9"), 167.9);
    assert.equal(parseClockToSeconds("0:05.5"), 5.5);
    // 양끝 공백은 trim 후 파싱한다.
    assert.equal(parseClockToSeconds("  2:47  "), 167);
  });

  it("returns null for unreadable input instead of NaN", () => {
    // seconds >= 60 가드.
    assert.equal(parseClockToSeconds("2:60"), null);
    // 콜론 한쪽이 비면 null.
    assert.equal(parseClockToSeconds("2:"), null);
    assert.equal(parseClockToSeconds(":30"), null);
    // 맨숫자 경로의 비수치.
    assert.equal(parseClockToSeconds("abc"), null);
    assert.equal(parseClockToSeconds(""), null);
    // 맨숫자 음수.
    assert.equal(parseClockToSeconds("-3"), null);
    // 초 음수 가드.
    assert.equal(parseClockToSeconds("2:-5"), null);
    // 분 음수 가드 — "2:-5"는 초 가드만 덮으므로 minutes<0을 지워도 통과한다.
    // 이 케이스가 없으면 "-1:30"이 -30을 반환한다(돌연변이 P4).
    assert.equal(parseClockToSeconds("-1:30"), null);
    // 콜론 경로 유한성 가드 — "abc"는 콜론이 없어 이 가드를 시험하지 않는다.
    // 빠지면 파서가 null이 아니라 NaN을 돌려 초 state를 오염시킨다.
    assert.equal(parseClockToSeconds("x:30"), null);
    assert.equal(parseClockToSeconds("2:xy"), null);
  });

  it("round-trips through formatSecondsAsClock(decimals:1)", () => {
    for (const x of [167.9, 5.5, 65, 9.1]) {
      const parsed = parseClockToSeconds(
        formatSecondsAsClock(x, { decimals: 1 }),
      );
      assert.ok(parsed !== null && Math.abs(parsed - x) < 1e-9);
    }
  });
});

describe("formatSecondsAsClock", () => {
  it("formats integer seconds as m:ss", () => {
    assert.equal(formatSecondsAsClock(65), "1:05");
  });

  it("formats decimal seconds with padding", () => {
    assert.equal(formatSecondsAsClock(167.9, { decimals: 1 }), "2:47.9");
    assert.equal(formatSecondsAsClock(9.1, { decimals: 1 }), "0:09.1");
  });

  it("clamps negatives to zero", () => {
    assert.equal(formatSecondsAsClock(-5), "0:00");
  });
});
