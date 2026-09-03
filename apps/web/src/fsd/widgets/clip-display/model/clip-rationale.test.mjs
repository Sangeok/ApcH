import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { hasClipRationale } from "./clip-rationale.ts";

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
