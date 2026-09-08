import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  reviewLanguageNotice,
  showsEnglishSourceForTranslation,
} from "./review-language-notice.ts";

// 골든 문자열 — 사용자에게 보이는 카피라 정확값이 계약이다.
const KOREAN_NOTICE =
  "Subtitles will be translated to Korean when you generate. This review shows the English transcript.";

describe("reviewLanguageNotice", () => {
  it("returns the exact notice for a non-English language, with the value name embedded", () => {
    assert.equal(reviewLanguageNotice("Korean"), KOREAN_NOTICE);
  });

  it("returns null for English (the transcript is already the final subtitle)", () => {
    assert.equal(reviewLanguageNotice("English"), null);
  });

  it("returns null for nullish input", () => {
    assert.equal(reviewLanguageNotice(null), null);
    assert.equal(reviewLanguageNotice(undefined), null);
  });

  it("returns null for empty or whitespace-only input", () => {
    assert.equal(reviewLanguageNotice(""), null);
    assert.equal(reviewLanguageNotice("  "), null);
  });

  it("trims a padded language value before deciding and building the notice", () => {
    // trim()의 존재 이유를 밟는 단언 — 공백이 붙은 값도 안내를 내야 하고,
    // trim 제거 돌연변이는 " Korean "이 "English"와 다르니 안내는 나오되
    // 문구에 공백이 박혀 골든 문자열과 어긋나므로 잡힌다.
    assert.equal(reviewLanguageNotice(" Korean "), KOREAN_NOTICE);
  });

  it("covers any language that is not English (allow-list 아님)", () => {
    // 허용목록이 아니라 "English 아님"으로 판정 = 언어 추가 시 자동 커버를 못박는다.
    assert.equal(
      reviewLanguageNotice("Spanish"),
      "Subtitles will be translated to Spanish when you generate. This review shows the English transcript.",
    );
  });
});

describe("showsEnglishSourceForTranslation", () => {
  it("matches reviewLanguageNotice(x) !== null for every input", () => {
    // 헤더 안내와 카드 라벨이 반드시 같은 조건으로 켜짐을 잡는다:
    // 비영어 true / 영어·nullish·공백 false.
    const inputs = ["Korean", " Korean ", "Spanish", "English", "", "  "];
    for (const input of inputs) {
      assert.equal(
        showsEnglishSourceForTranslation(input),
        reviewLanguageNotice(input) !== null,
      );
    }
    assert.equal(
      showsEnglishSourceForTranslation(null),
      reviewLanguageNotice(null) !== null,
    );
    assert.equal(
      showsEnglishSourceForTranslation(undefined),
      reviewLanguageNotice(undefined) !== null,
    );

    // 대응이 실제로 켜짐/꺼짐 양쪽을 밟는지 확인 — 전부 false거나 전부 true면
    // 위 루프가 항진명제로 통과할 수 있다.
    assert.equal(showsEnglishSourceForTranslation("Korean"), true);
    assert.equal(showsEnglishSourceForTranslation("English"), false);
  });
});
