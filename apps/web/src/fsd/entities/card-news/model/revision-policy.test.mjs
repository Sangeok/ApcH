import assert from "node:assert/strict";
import test from "node:test";
import {
  advancePublishedRevision,
  planDraftRevision,
  pendingRenderRevision,
} from "./revision-policy.ts";

test("an old completion cannot move the published revision backwards", () => {
  assert.equal(advancePublishedRevision(4, 2), 4);
});
test("two tabs sharing an expected revision receive a conflict rather than overwrite", () => {
  assert.deepEqual(
    planDraftRevision({
      currentRevision: 4,
      expectedRevision: 3,
      snapshots: {},
      document: {},
    }),
    { conflict: true, currentRevision: 4 },
  );
});
test("queued revisions coalesce but every stored document remains immutable", () => {
  const document = { caption: "revision two" };
  const old = { 1: { caption: "revision one" } };
  const next = planDraftRevision({
    currentRevision: 1,
    expectedRevision: 1,
    snapshots: old,
    document,
  });
  document.caption = "changed later";
  assert.equal(next.snapshots[2].caption, "revision two");
  assert.equal(old[2], undefined);
  assert.equal(pendingRenderRevision(3, 4), 4);
  assert.equal(pendingRenderRevision(4, 3), 4);
});
test("generation revision zero cannot be edited", () => {
  assert.throws(() =>
    planDraftRevision({
      currentRevision: 0,
      expectedRevision: 0,
      snapshots: {},
      document: {},
    }),
  );
});
