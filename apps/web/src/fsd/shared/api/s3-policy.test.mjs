import assert from "node:assert/strict";
import { test } from "node:test";
import { attachmentDisposition, chunkS3Keys } from "./s3-policy.ts";

test("bulk deletion de-duplicates and never exceeds 1000 keys", () => {
  const keys = Array.from({ length: 2005 }, (_, index) => `key-${index}`);
  const batches = chunkS3Keys([...keys, keys[0]]);
  assert.deepEqual(
    batches.map((batch) => batch.length),
    [1000, 1000, 5],
  );
  assert.deepEqual(batches.flat(), keys);
  assert.throws(() => chunkS3Keys(keys, 1001));
});

test("download names cannot inject headers or path separators", () => {
  const result = attachmentDisposition('01-한글/cover\r\n".jpg');
  assert.equal(/[\r\n]/.test(result), false);
  assert.match(result, /filename\*=UTF-8''/);
});
