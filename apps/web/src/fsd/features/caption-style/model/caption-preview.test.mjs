import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildCaptionCues,
  getPreviewFontPx,
  getPreviewLineHeightPx,
  getPreviewShadowPx,
  getPreviewStrokePx,
  getPreviewVerticalInset,
  pickActiveCue,
} from "./caption-preview.ts";

// 미리보기 컨테이너 높이(px). CaptionPreviewPlayer가 쓰는 값과 같다.
const H = 320;

describe("buildCaptionCues", () => {
  it("groups words into cues of max_word and flushes the remainder", () => {
    // max_word=3, 7단어 → 3+3+1 (main.py create_subtitles_with_ffmpeg 루프 뒤 if current_words: 잔여 flush).
    const words = [
      { start: 0, end: 1, word: "one" },
      { start: 1, end: 2, word: "two" },
      { start: 2, end: 3, word: "three" },
      { start: 3, end: 4, word: "four" },
      { start: 4, end: 5, word: "five" },
      { start: 5, end: 6, word: "six" },
      { start: 6, end: 7, word: "seven" },
    ];

    const cues = buildCaptionCues(words, 0, 100, 3, false);

    assert.deepEqual(cues, [
      { start: 0, end: 3, text: "one two three" },
      { start: 3, end: 6, text: "four five six" },
      { start: 6, end: 7, text: "seven" },
    ]);
    // 두 번째 큐의 start는 4번째 단어의 start_rel(3)이다. flush 뒤 curStart
    // 재설정을 빼면 텍스트는 맞아도 이 값이 첫 큐 start(0)로 남는다.
    assert.equal(cues[1].start, 3);
  });

  it("uses clip-relative cue times (start_rel / end_rel)", () => {
    // clipStart=100 → 원시 시각에서 100을 뺀다. 100.5→0.5, 167.9→67.9.
    const words = [
      { start: 100.5, end: 101.5, word: "a" },
      { start: 101.5, end: 167.9, word: "b" },
    ];

    const cues = buildCaptionCues(words, 100, 200, 5, false);

    assert.deepEqual(cues, [{ start: 0.5, end: 67.9, text: "a b" }]);
  });

  it("filters to words inside the clip range and includes end === clipEnd", () => {
    // main.py create_subtitles_with_ffmpeg의 clip_segments 필터 — start >= clipStart && end <= clipEnd. 경계는 포함(<=).
    const words = [
      { start: 99.5, end: 100.5, word: "before" }, // start < clipStart → 제외
      { start: 100.5, end: 150.5, word: "inside" }, // 포함
      { start: 150.5, end: 200, word: "atEnd" }, // end === clipEnd → 포함
      { start: 199.5, end: 200.5, word: "after" }, // end > clipEnd → 제외
    ];

    const cues = buildCaptionCues(words, 100, 200, 10, false);

    // atEnd가 빠지면(<로 바꾼 돌연변이) 텍스트가 "inside"로, end가 50.5로 줄어든다.
    assert.deepEqual(cues, [{ start: 0.5, end: 100, text: "inside atEnd" }]);
  });

  it("skips blank words and zero-length segments at clipStart", () => {
    const words = [
      { start: 100, end: 100, word: "zero" }, // endRel <= 0 → 스킵
      { start: 100.5, end: 101.5, word: "  " }, // trim 후 빈 문자열 → 스킵
      { start: 101.5, end: 102.5, word: "real" }, // 유지
    ];

    const cues = buildCaptionCues(words, 100, 200, 5, false);

    assert.deepEqual(cues, [{ start: 1.5, end: 2.5, text: "real" }]);
  });

  it("uppercases cue text when uppercase is true, otherwise keeps it", () => {
    const words = [
      { start: 0, end: 1, word: "hello" },
      { start: 1, end: 2, word: "world" },
    ];

    assert.equal(
      buildCaptionCues(words, 0, 10, 5, true)[0].text,
      "HELLO WORLD",
    );
    assert.equal(
      buildCaptionCues(words, 0, 10, 5, false)[0].text,
      "hello world",
    );
  });

  it("emits one cue per word when max_word is 1", () => {
    const words = [
      { start: 0, end: 1, word: "a" },
      { start: 1, end: 2, word: "b" },
      { start: 2, end: 3, word: "c" },
    ];

    const cues = buildCaptionCues(words, 0, 10, 1, false);

    assert.deepEqual(cues, [
      { start: 0, end: 1, text: "a" },
      { start: 1, end: 2, text: "b" },
      { start: 2, end: 3, text: "c" },
    ]);
  });
});

describe("pickActiveCue", () => {
  const cues = [
    { start: 0, end: 2, text: "first" },
    { start: 3, end: 5, text: "second" }, // 2~3 사이는 공백(자막 없음)
  ];

  it("returns the cue when start <= t < end", () => {
    assert.equal(pickActiveCue(cues, 1)?.text, "first");
    assert.equal(pickActiveCue(cues, 4)?.text, "second");
  });

  it("returns null in the gap between cues", () => {
    assert.equal(pickActiveCue(cues, 2.5), null);
  });

  it("returns null before the first start and after the last end", () => {
    assert.equal(pickActiveCue(cues, -1), null);
    assert.equal(pickActiveCue(cues, 5), null); // t == last end → 제외
  });

  it("includes t == start but excludes t == end", () => {
    assert.equal(pickActiveCue(cues, 0)?.text, "first"); // t == start → 포함
    assert.equal(pickActiveCue(cues, 3)?.text, "second"); // t == start → 포함
    assert.equal(pickActiveCue(cues, 2), null); // t == first end → 제외(공백으로)
  });
});

describe("getPreviewFontPx", () => {
  it("scales ASS fontsize by EM_SCALE and previewScale (English = Anton)", () => {
    // 122 × 2048/3550 × 320/1920 ≈ 11.73
    assert.equal(getPreviewFontPx(122, "English", H), 122 * (2048 / 3550) * (320 / 1920));
  });

  it("uses the Korean EM_SCALE for Korean (Noto Sans KR)", () => {
    // 130 × 1000/1448 × 320/1920 ≈ 14.96
    assert.equal(getPreviewFontPx(130, "Korean", H), 130 * (1000 / 1448) * (320 / 1920));
  });

  it("treats non-Korean languages as English scale", () => {
    // 미지 언어는 English 분기로 떨어진다(Korean vs 그 외).
    assert.equal(
      getPreviewFontPx(122, "Spanish", H),
      getPreviewFontPx(122, "English", H),
    );
  });

  it("clamps to a lower bound of 8", () => {
    // 10 × 2048/3550 × 320/1920 ≈ 0.96 → 8로 클램프.
    assert.equal(getPreviewFontPx(10, "English", H), 8);
  });
});

describe("getPreviewStrokePx", () => {
  it("scales outline width and doubles it (ASS outer vs CSS centered)", () => {
    // 3 × 320/1920 × 2 = 1.0
    assert.equal(getPreviewStrokePx(3, H), 1);
    assert.equal(getPreviewStrokePx(0, H), 0);
  });
});

describe("getPreviewShadowPx", () => {
  it("scales the ASS shadow (6.5) by previewScale", () => {
    // 6.5 × 320/1920 ≈ 1.083
    assert.equal(getPreviewShadowPx(H), 6.5 * (320 / 1920));
  });
});

describe("getPreviewVerticalInset", () => {
  it("places top with the preset marginv (marginV null) and no bottom", () => {
    // 200 × 320/1920 ≈ 33.33
    assert.deepEqual(getPreviewVerticalInset("top", null, H), {
      top: 200 * (320 / 1920),
      bottom: null,
    });
  });

  it("places bottom with the preset marginv (marginV null) and no top", () => {
    // 260 × 320/1920 ≈ 43.33
    assert.deepEqual(getPreviewVerticalInset("bottom", null, H), {
      top: null,
      bottom: 260 * (320 / 1920),
    });
  });

  it("centers middle with neither inset (marginV ignored)", () => {
    assert.deepEqual(getPreviewVerticalInset("middle", null, H), {
      top: null,
      bottom: null,
    });
    // middle은 marginV를 무시한다 — 값이 있어도 중앙.
    assert.deepEqual(getPreviewVerticalInset("middle", 400, H), {
      top: null,
      bottom: null,
    });
  });

  it("uses a specified marginV instead of the preset for top and bottom", () => {
    // 400 × 320/1920 — 프리셋(200/260)이 아니라 저장값을 축척한다.
    assert.deepEqual(getPreviewVerticalInset("top", 400, H), {
      top: 400 * (320 / 1920),
      bottom: null,
    });
    assert.deepEqual(getPreviewVerticalInset("bottom", 400, H), {
      top: null,
      bottom: 400 * (320 / 1920),
    });
  });

  it("keeps a saved marginV of 0 instead of the preset (?? not ||)", () => {
    // 0 = 끌어서 가장자리에 붙인 값. `??`를 `||`로 바꾸면 0이 프리셋(200/260)으로 되돌아간다.
    assert.deepEqual(getPreviewVerticalInset("top", 0, H), {
      top: 0,
      bottom: null,
    });
    assert.deepEqual(getPreviewVerticalInset("bottom", 0, H), {
      top: null,
      bottom: 0,
    });
  });
});

describe("getPreviewLineHeightPx", () => {
  it("returns the libass line box height (assFontSize × previewScale), font-agnostic", () => {
    // libass는 ASS fontsize를 줄 상자 높이(REAL_DIM)로 요청 → 폰트와 무관하게 fontsize × scale.
    assert.equal(getPreviewLineHeightPx(122, H), 122 * (320 / 1920));
    assert.equal(getPreviewLineHeightPx(130, H), 130 * (320 / 1920));
  });
});
