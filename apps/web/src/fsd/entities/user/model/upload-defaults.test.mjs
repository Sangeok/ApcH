import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_REVIEW_BEFORE_GENERATE,
  normalizeUploadDefaults,
  resolveUploadDefaults,
} from "./upload-defaults.ts";

describe("resolveUploadDefaults", () => {
  it("falls back to system defaults when every field is null", () => {
    assert.deepEqual(
      resolveUploadDefaults({
        defaultLanguage: null,
        defaultClipCount: null,
        defaultReviewBeforeGenerate: null,
      }),
      { language: "English", clipCount: 3, reviewBeforeGenerate: false },
    );
  });

  it("passes through valid stored values", () => {
    assert.deepEqual(
      resolveUploadDefaults({
        defaultLanguage: "Korean",
        defaultClipCount: 2,
        defaultReviewBeforeGenerate: true,
      }),
      { language: "Korean", clipCount: 2, reviewBeforeGenerate: true },
    );
  });

  it("drops an out-of-range clip count to the system default", () => {
    // 지원 목록이 줄어든 뒤 옛 저장값을 읽는 경우를 방어한다.
    assert.equal(
      resolveUploadDefaults({
        defaultLanguage: null,
        defaultClipCount: 5,
        defaultReviewBeforeGenerate: null,
      }).clipCount,
      3,
    );
  });

  it("drops an unsupported language to the system default", () => {
    assert.equal(
      resolveUploadDefaults({
        defaultLanguage: "French",
        defaultClipCount: null,
        defaultReviewBeforeGenerate: null,
      }).language,
      "English",
    );
  });

  it("resolves the review mode flag from nullable storage", () => {
    assert.equal(
      resolveUploadDefaults({
        defaultLanguage: null,
        defaultClipCount: null,
        defaultReviewBeforeGenerate: null,
      }).reviewBeforeGenerate,
      DEFAULT_REVIEW_BEFORE_GENERATE,
    );
    assert.equal(
      resolveUploadDefaults({
        defaultLanguage: null,
        defaultClipCount: null,
        defaultReviewBeforeGenerate: true,
      }).reviewBeforeGenerate,
      true,
    );
  });
});

describe("normalizeUploadDefaults", () => {
  it("passes all-null through as a clearing payload", () => {
    assert.deepEqual(
      normalizeUploadDefaults({
        defaultLanguage: null,
        defaultClipCount: null,
        defaultReviewBeforeGenerate: null,
      }),
      {
        defaultLanguage: null,
        defaultClipCount: null,
        defaultReviewBeforeGenerate: null,
      },
    );
  });

  it("passes valid concrete values through unchanged", () => {
    assert.deepEqual(
      normalizeUploadDefaults({
        defaultLanguage: "Korean",
        defaultClipCount: 2,
        defaultReviewBeforeGenerate: true,
      }),
      {
        defaultLanguage: "Korean",
        defaultClipCount: 2,
        defaultReviewBeforeGenerate: true,
      },
    );
  });

  it("rejects an out-of-range clip count", () => {
    assert.equal(
      normalizeUploadDefaults({
        defaultLanguage: null,
        defaultClipCount: 5,
        defaultReviewBeforeGenerate: null,
      }),
      null,
    );
  });

  it("rejects an unsupported language", () => {
    assert.equal(
      normalizeUploadDefaults({
        defaultLanguage: "French",
        defaultClipCount: null,
        defaultReviewBeforeGenerate: null,
      }),
      null,
    );
  });

  it("rejects a string clip count (wrong type)", () => {
    assert.equal(
      normalizeUploadDefaults({
        defaultLanguage: null,
        defaultClipCount: "3",
        defaultReviewBeforeGenerate: null,
      }),
      null,
    );
  });

  it("rejects a non-boolean review mode", () => {
    assert.equal(
      normalizeUploadDefaults({
        defaultLanguage: null,
        defaultClipCount: null,
        defaultReviewBeforeGenerate: "true",
      }),
      null,
    );
  });

  it("rejects a missing language field", () => {
    // undefined는 null이 아니므로 거부된다. `!= null`로 바꾼 구현이면 여기서 통과해
    // Prisma update가 그 컬럼을 조용히 건너뛰는 부분 갱신이 된다.
    assert.equal(
      normalizeUploadDefaults({
        defaultClipCount: null,
        defaultReviewBeforeGenerate: null,
      }),
      null,
    );
  });

  it("rejects a missing clip count field", () => {
    assert.equal(
      normalizeUploadDefaults({
        defaultLanguage: null,
        defaultReviewBeforeGenerate: null,
      }),
      null,
    );
  });

  it("rejects a missing review mode field", () => {
    assert.equal(
      normalizeUploadDefaults({
        defaultLanguage: null,
        defaultClipCount: null,
      }),
      null,
    );
  });
});
