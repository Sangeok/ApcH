import assert from "node:assert/strict";
import test from "node:test";
import { countCardNewsTextCodePoints } from "./text-length.ts";

test("wire text counts code points across ASCII, Korean and astral characters", () => {
  assert.equal(countCardNewsTextCodePoints(""), 0);
  assert.equal(countCardNewsTextCodePoints("abc"), 3);
  assert.equal(countCardNewsTextCodePoints("한글😀A"), 4);
  assert.equal(countCardNewsTextCodePoints("😀".repeat(80)), 80);
});
test("wire length does not collapse combining sequences or joined emoji into graphemes", () => {
  assert.equal(countCardNewsTextCodePoints("e\u0301"), 2);
  assert.equal(countCardNewsTextCodePoints("👩‍👩‍👧‍👦"), 7);
});
