import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  firstSampleCueText,
  koreanSampleCues,
  previewCaptionCues,
} from "./sample-captions.ts";

// 설정 화면의 정지 미리보기가 실제로 그리는 첫 큐 텍스트를 못박는다. firstSampleCueText는
// 플레이어의 sample 분기와 같은 buildCaptionCues + firstCueText를 거치므로, 큐 묶기 규칙이나
// 첫 큐 선택이 바뀌면 여기서 실패한다(플레이어가 자체 식을 쓰던 초안에선 어떤 변이도 통과했다).
describe("firstSampleCueText", () => {
  it("groups English sample words up to maxWords for the first cue", () => {
    assert.equal(
      firstSampleCueText("English", 5, false),
      "Style your captions the way",
    );
  });

  it("uppercases the English first cue when uppercase is on", () => {
    assert.equal(
      firstSampleCueText("English", 5, true),
      "STYLE YOUR CAPTIONS THE WAY",
    );
  });

  it("groups Korean sample words up to maxWords for the first cue", () => {
    assert.equal(firstSampleCueText("Korean", 3, false), "지금 자막 스타일을");
  });

  it("fills the Korean first cue up to maxWords 8", () => {
    assert.equal(
      firstSampleCueText("Korean", 8, false),
      "지금 자막 스타일을 원하는 대로 화면에서 미리 확인해",
    );
  });

  it("returns Korean (Hangul) text for the Korean sample", () => {
    const text = firstSampleCueText("Korean", 3, false);
    // 한국어 샘플이 영어 폴백으로 새지 않는지: 한글 음절이 있어야 한다.
    assert.ok(/[가-힣]/u.test(text));
  });

  it("has at least 8 sample words so maxWords 8 fills a full line", () => {
    // 누가 샘플 단어를 8개 미만으로 줄이면 이 큐는 8단어가 안 되어 실패한다.
    const text = firstSampleCueText("English", 8, false);
    assert.equal(text.split(" ").length, 8);
    assert.equal(text, "Style your captions the way you want them");
  });
});

// 라이브 Korean 미리보기의 큐 텍스트를 KR_WORDS 순환으로 채우는 후처리. buildCaptionCues가
// 만든 큐의 타이밍·개수는 그대로 두고, 큐별 영어 단어 수만큼 한국어 토큰을 이어 붙인다.
describe("koreanSampleCues", () => {
  it("returns an empty array for empty cues", () => {
    assert.deepEqual(koreanSampleCues([]), []);
  });

  it("preserves each cue's start and end timing", () => {
    const result = koreanSampleCues([{ start: 1.5, end: 2.5, text: "one two" }]);
    assert.equal(result[0].start, 1.5);
    assert.equal(result[0].end, 2.5);
  });

  it("fills one Korean token per English word, cursor continuing across cues", () => {
    const result = koreanSampleCues([
      { start: 0, end: 1, text: "one two three" },
      { start: 1, end: 2, text: "four" },
    ]);
    assert.equal(result[0].text, "지금 자막 스타일을");
    assert.equal(result[1].text, "원하는");
  });

  it("wraps to the start of KR_WORDS after all nine are used", () => {
    const result = koreanSampleCues([
      { start: 0, end: 1, text: "a b c d e f g h i" },
      { start: 1, end: 2, text: "j" },
    ]);
    assert.equal(
      result[0].text,
      "지금 자막 스타일을 원하는 대로 화면에서 미리 확인해 보세요",
    );
    assert.equal(result[1].text, "지금");
  });

  it("returns only Hangul tokens with no English leaking through", () => {
    const result = koreanSampleCues([{ start: 0, end: 1, text: "We shipped it" }]);
    assert.ok(/[가-힣]/u.test(result[0].text));
    assert.notEqual(result[0].text, "We shipped it");
  });
});

// 미리보기 플레이어가 그릴 큐를 고른다. Korean 라이브(sample false)만 치환하고,
// English 라이브와 Korean 샘플(설정 화면)은 입력 그대로 둔다.
describe("previewCaptionCues", () => {
  it("replaces the cue text for Korean live preview", () => {
    const result = previewCaptionCues(
      [{ start: 0, end: 1, text: "We shipped it" }],
      "Korean",
      false,
    );
    assert.equal(result[0].text, "지금 자막 스타일을");
    assert.equal(result[0].start, 0);
    assert.equal(result[0].end, 1);
  });

  it("leaves English live preview cues unchanged", () => {
    const cues = [{ start: 0, end: 1, text: "We shipped it" }];
    assert.deepEqual(previewCaptionCues(cues, "English", false), cues);
  });

  it("leaves Korean settings-screen sample cues unchanged", () => {
    const cues = [{ start: 0, end: 1, text: "지금 자막 스타일을" }];
    assert.deepEqual(previewCaptionCues(cues, "Korean", true), cues);
  });
});
