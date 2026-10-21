import assert from "node:assert/strict";
import test from "node:test";
import { cardNewsMatchKey } from "./card-news-contract.ts";
test("wake-up keys isolate both the execution epoch and immutable revision", () => {
  assert.notEqual(
    cardNewsMatchKey({ jobId: "job", executionEpoch: 1, revision: 2 }),
    cardNewsMatchKey({ jobId: "job", executionEpoch: 2, revision: 2 }),
  );
  assert.notEqual(
    cardNewsMatchKey({ jobId: "job", executionEpoch: 1, revision: 2 }),
    cardNewsMatchKey({ jobId: "job", executionEpoch: 1, revision: 3 }),
  );
});
