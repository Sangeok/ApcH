import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { firstSampleCueText } from "./sample-captions.ts";

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
