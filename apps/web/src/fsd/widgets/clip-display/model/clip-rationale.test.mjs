import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { clipTypeLabel, hasClipRationale } from "./clip-rationale.ts";

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

describe("hasClipRationale", () => {
  it("returns false when all three fields are null", () => {
    assert.equal(
      hasClipRationale({ clipType: null, hook: null, payoff: null }),
      false,
    );
  });

  it("returns true when any single field carries a value", () => {
    assert.equal(
      hasClipRationale({ clipType: null, hook: "Why now?", payoff: null }),
      true,
    );
    assert.equal(
      hasClipRationale({ clipType: null, hook: null, payoff: "The reveal" }),
      true,
    );
    assert.equal(
      hasClipRationale({ clipType: "qa", hook: null, payoff: null }),
      true,
    );
  });

  it("returns false when all three fields are empty or whitespace", () => {
    assert.equal(
      hasClipRationale({ clipType: "", hook: "  ", payoff: "" }),
      false,
    );
  });
});
