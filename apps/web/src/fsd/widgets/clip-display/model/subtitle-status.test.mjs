import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { subtitleFallbackNotice } from "./subtitle-status.ts";

describe("subtitleFallbackNotice", () => {
  it("maps the two fallback states to their English notices", () => {
    assert.equal(
      subtitleFallbackNotice("partial-fallback"),
      "Some subtitles couldn't be translated — shown in English.",
    );
    assert.equal(
      subtitleFallbackNotice("full-fallback"),
      "Translation failed — subtitles shown in English.",
    );
  });

  it("returns null for the ok state (no warning on healthy subtitles)", () => {
    assert.equal(subtitleFallbackNotice("ok"), null);
  });

  it("returns null for unknown values instead of asserting a failure", () => {
    assert.equal(subtitleFallbackNotice("weird"), null);
  });

  it("returns null for nullish input", () => {
    assert.equal(subtitleFallbackNotice(null), null);
    assert.equal(subtitleFallbackNotice(undefined), null);
  });

  it("returns null for empty or whitespace-only input", () => {
    assert.equal(subtitleFallbackNotice(""), null);
    assert.equal(subtitleFallbackNotice("  "), null);
  });

  it("trims a padded state value before mapping", () => {
    // trim()의 존재 이유를 밟는 단언 — 공백이 붙은 상태값도 안내를 내야 한다.
    // 공백-only 케이스는 맵 조회 실패가 대신 null을 주므로 이 단언이 있어야
    // trim 제거 돌연변이가 잡힌다.
    assert.equal(
      subtitleFallbackNotice(" partial-fallback "),
      "Some subtitles couldn't be translated — shown in English.",
    );
  });
});

describe("subtitle status wire contract", () => {
  it("keeps the two fallback literals mapped and ok unmapped", () => {
    // 콜백 wire 계약(translation_fallback.py)과 어긋나면 안내가 조용히 꺼진다:
    // 폴백 두 상태는 반드시 안내를 내고, "ok"는 반드시 내지 않아야 한다.
    assert.notEqual(subtitleFallbackNotice("partial-fallback"), null);
    assert.notEqual(subtitleFallbackNotice("full-fallback"), null);
    assert.equal(subtitleFallbackNotice("ok"), null);
  });
});
