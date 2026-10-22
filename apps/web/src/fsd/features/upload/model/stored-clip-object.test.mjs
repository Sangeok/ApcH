import assert from "node:assert/strict";
import test from "node:test";
import { isStoredClipObject } from "./stored-clip-object.ts";

const stored = (contentType, contentLength = 100) =>
  isStoredClipObject({ contentLength, contentType });

test("a clip uploaded without ContentType settles: S3 stores binary/octet-stream", () => {
  assert.equal(stored("binary/octet-stream"), true);
});

test("explicit MP4 and generic octet-stream types settle", () => {
  assert.equal(stored("video/mp4"), true);
  assert.equal(stored("application/octet-stream"), true);
});

test("media-type parameters, a space before the semicolon and case are ignored", () => {
  assert.equal(stored("video/mp4; codecs=avc1"), true);
  assert.equal(stored("video/mp4 ; codecs=avc1"), true);
  assert.equal(stored("Video/MP4"), true);
});

test("other types, a missing type and empty objects do not settle", () => {
  assert.equal(stored("text/html"), false);
  assert.equal(stored(""), false);
  assert.equal(stored("video/mp4", 0), false);
});
