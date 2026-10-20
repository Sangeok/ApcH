import assert from "node:assert/strict";
import test from "node:test";
import { toCreditBalance, creditBalanceKeys } from "./credit-balance.ts";

test("held credits reduce available balance without consuming owned credits", () => {
  assert.deepEqual(toCreditBalance(3, 1), {
    owned: 3,
    reserved: 1,
    available: 2,
  });
  assert.deepEqual(toCreditBalance(0, 0), {
    owned: 0,
    reserved: 0,
    available: 0,
  });
});
test("invalid money states fail instead of silently clamping", () => {
  for (const amounts of [
    [-1, 0],
    [1, 2],
    [1, -1],
    [1.5, 0],
    [Infinity, 0],
    [2, NaN],
  ]) {
    assert.throws(
      () => toCreditBalance(...amounts),
      /Invalid stored credit balance/,
    );
  }
});
test("live balance caches are separated by authenticated user", () => {
  assert.notDeepEqual(creditBalanceKeys.user("a"), creditBalanceKeys.user("b"));
});
