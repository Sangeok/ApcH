import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { stuckAlertElapsedMinutes } from "./stuck-alert.ts";

const NOW = new Date("2026-09-02T12:00:00.000Z");

function claimedAtMinutesAgo(minutes) {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

describe("stuckAlertElapsedMinutes", () => {
  it("returns whole minutes elapsed since claim", () => {
    assert.equal(stuckAlertElapsedMinutes(claimedAtMinutesAgo(90), NOW), 90);
  });

  it("rounds a fractional minute up at the .5 boundary", () => {
    // 89.6m 경과 → 90으로 반올림
    assert.equal(stuckAlertElapsedMinutes(claimedAtMinutesAgo(89.6), NOW), 90);
  });

  it("rounds a fractional minute down below the .5 boundary", () => {
    // 89.4m 경과 → 89로 반올림
    assert.equal(stuckAlertElapsedMinutes(claimedAtMinutesAgo(89.4), NOW), 89);
  });

  it("returns 0 when claimed at exactly now", () => {
    assert.equal(stuckAlertElapsedMinutes(NOW.toISOString(), NOW), 0);
  });

  it("returns 0 for a future claim time (negative elapsed)", () => {
    assert.equal(stuckAlertElapsedMinutes(claimedAtMinutesAgo(-10), NOW), 0);
  });

  it("returns 0 for an unparseable string", () => {
    assert.equal(stuckAlertElapsedMinutes("not-a-date", NOW), 0);
  });

  it("returns 0 for an empty or whitespace string", () => {
    assert.equal(stuckAlertElapsedMinutes("", NOW), 0);
    assert.equal(stuckAlertElapsedMinutes("   ", NOW), 0);
  });
});
