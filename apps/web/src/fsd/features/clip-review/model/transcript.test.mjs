import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseTranscriptWords } from "./transcript.ts";

describe("parseTranscriptWords", () => {
  it("keeps a valid word array unchanged", () => {
    const words = [
      { start: 0, end: 0.5, word: "hello" },
      { start: 0.5, end: 1, word: "world" },
    ];

    // 유효 배열은 그대로 통과한다(같은 원소 수·같은 값).
    assert.deepEqual(parseTranscriptWords(words), words);
  });

  it("filters out elements with wrong-typed fields, null, and non-objects", () => {
    const parsed = parseTranscriptWords([
      { start: 0, end: 0.5, word: "keep" },
      { start: "0", end: 0.5, word: "bad-start" },
      { start: 0, end: "0.5", word: "bad-end" },
      { start: 0, end: 0.5, word: 42 },
      null,
      "not-an-object",
      { start: 0, end: 0.5 },
    ]);

    // start/end/word 타입이 틀린 원소·null·비객체·필드 누락은 전부 필터된다.
    assert.deepEqual(parsed, [{ start: 0, end: 0.5, word: "keep" }]);
  });

  it("throws with the array-guard message on non-array payloads", () => {
    // 메시지까지 단언한다 — "throw 여부"만 보면 배열 가드를 지운 구현
    // (payload.filter is not a function TypeError도 throw)도 통과한다.
    for (const payload of [{}, null, "a string", 42, undefined]) {
      assert.throws(
        () => parseTranscriptWords(payload),
        (error) =>
          error instanceof Error &&
          error.message === "Transcript payload was not an array",
      );
    }
  });
});
