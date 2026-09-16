import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeAnalyzedMoment } from "./modal-contract.ts";

// 유효 moment의 최소 필드 — index·startSeconds·endSeconds가 있어야 정규화가 통과한다.
function rawMoment(overrides) {
  return {
    index: 0,
    startSeconds: 10,
    endSeconds: 40,
    ...overrides,
  };
}

describe("normalizeAnalyzedMoment — referenceTranslation (요구 ①의 조용한 null 가드)", () => {
  it("copies referenceTranslation from the raw moment", () => {
    // 이 단언이 없으면 정규화기의 복사 줄을 지워도(선택 필드라) TS·기존 테스트가
    // 통과한다 — 조용한 null 회귀. 프로덕션 웹훅 경로가 이 함수를 거친다.
    const result = normalizeAnalyzedMoment(
      rawMoment({ referenceTranslation: "한국어 참고 번역" }),
    );
    assert.equal(result?.referenceTranslation, "한국어 참고 번역");
  });

  it("yields null when the key is absent (English·번역 실패 경로)", () => {
    const result = normalizeAnalyzedMoment(rawMoment({}));
    assert.equal(result?.referenceTranslation, null);
  });

  it("yields null for non-string referenceTranslation (toNullableString 경유)", () => {
    assert.equal(
      normalizeAnalyzedMoment(rawMoment({ referenceTranslation: 42 }))
        ?.referenceTranslation,
      null,
    );
    assert.equal(
      normalizeAnalyzedMoment(rawMoment({ referenceTranslation: { a: 1 } }))
        ?.referenceTranslation,
      null,
    );
  });
});

describe("normalizeAnalyzedMoment — 기존 필드 회귀 방지", () => {
  it("normalizes a valid moment and defaults referenceTranslation to null when absent", () => {
    const result = normalizeAnalyzedMoment(
      rawMoment({ clipType: "qa", hook: "hook text", payoff: "payoff text" }),
    );
    assert.deepEqual(result, {
      index: 0,
      startSeconds: 10,
      endSeconds: 40,
      clipType: "qa",
      hook: "hook text",
      payoff: "payoff text",
      referenceTranslation: null,
    });
  });

  it("returns null for a moment missing required numeric fields", () => {
    assert.equal(normalizeAnalyzedMoment({ index: 0 }), null);
    assert.equal(normalizeAnalyzedMoment(null), null);
  });
});
