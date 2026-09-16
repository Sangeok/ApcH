import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveReferenceTranslationDisplay } from "./reference-translation.ts";

// 골든 문자열 — 사용자에게 보이는 카피라 정확값이 계약이다(review-language-notice.ts 선례).
const FRESH_LABEL =
  "Korean reference — final subtitles are translated separately and may differ.";
const STALE_LABEL =
  "Korean reference for the AI-suggested range — final subtitles are translated separately and may differ.";

// AI 구간 기준값. 현재 구간을 이 값과 같게 두면 fresh, 벌리면 stale.
const AI_START = 10;
const AI_END = 40;

function display(overrides) {
  return resolveReferenceTranslationDisplay({
    referenceTranslation: "안녕하세요, 오늘의 주제입니다.",
    aiStartSeconds: AI_START,
    aiEndSeconds: AI_END,
    currentStartSeconds: AI_START,
    currentEndSeconds: AI_END,
    ...overrides,
  });
}

describe("resolveReferenceTranslationDisplay — 유무 판정 (요구 ②·④)", () => {
  it("returns null for null/undefined referenceTranslation (블록 없음)", () => {
    assert.equal(display({ referenceTranslation: null }), null);
    assert.equal(display({ referenceTranslation: undefined }), null);
  });

  it("returns null for empty or whitespace-only referenceTranslation", () => {
    assert.equal(display({ referenceTranslation: "" }), null);
    assert.equal(display({ referenceTranslation: "   " }), null);
    assert.equal(display({ referenceTranslation: "\n\t " }), null);
  });

  it("trims the reference text before comparison (골든 비교)", () => {
    // trim 제거 돌연변이는 앞뒤 공백이 박힌 채로 나오므로 골든과 어긋나 잡힌다.
    const result = display({ referenceTranslation: "  한국어 참고 번역  " });
    assert.deepEqual(result, { text: "한국어 참고 번역", label: FRESH_LABEL });
  });
});

describe("resolveReferenceTranslationDisplay — fresh/stale 라벨 (요구 ③)", () => {
  it("current range == AI range → FRESH label (골든)", () => {
    const result = display({});
    assert.deepEqual(result, {
      text: "안녕하세요, 오늘의 주제입니다.",
      label: FRESH_LABEL,
    });
  });

  it("start diff > 0.05 → STALE label (골든)", () => {
    assert.equal(display({ currentStartSeconds: 10.1 }).label, STALE_LABEL);
  });

  it("end diff > 0.05 → STALE label", () => {
    assert.equal(display({ currentEndSeconds: 40.1 }).label, STALE_LABEL);
  });

  it("both ends drifted → STALE label", () => {
    assert.equal(
      display({ currentStartSeconds: 10.1, currentEndSeconds: 40.1 }).label,
      STALE_LABEL,
    );
  });

  it("current range earlier than AI (음의 차이)도 STALE — Math.abs 제거 변이를 잡는다", () => {
    // adjustStart("back") 넛지가 매번 만드는 경우. 양수 차이만 밟으면 Math.abs를
    // 지운 구현이 모든 케이스를 통과한다(계획 검증 돌연변이 실측).
    assert.equal(display({ currentStartSeconds: 9.8 }).label, STALE_LABEL);
    assert.equal(display({ currentEndSeconds: 39.8 }).label, STALE_LABEL);
  });

  it("경계: 차이 0.04(양끝) → FRESH, 차이 0.1 → STALE", () => {
    // 허용오차 술어가 항진/항위로 무너지는 변이를 양쪽으로 잡는다.
    assert.equal(
      display({ currentStartSeconds: 10.04, currentEndSeconds: 40.04 }).label,
      FRESH_LABEL,
    );
    assert.equal(display({ currentStartSeconds: 10.1 }).label, STALE_LABEL);
  });
});
