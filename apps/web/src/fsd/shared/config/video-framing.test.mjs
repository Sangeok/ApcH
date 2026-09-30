import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getVideoFrameLayout,
  parseVideoPaddingPercent,
  resolveVideoPaddingPercent,
  VIDEO_PADDING_PERCENT_RANGE,
  videoFramingSummary,
} from "./video-framing.ts";

// 여백 비율(한쪽, 정수 0~25)의 입력 계약과 픽셀 계약(FEAT-58).
// 픽셀 골든값은 백엔드 video_framing.py frame_layout과 같은 값이다 — 한쪽만 바꾸면
// 설정 화면이 보여 주는 px와 실렌더가 어긋난다.
const INVALID = [-1, 26, 0.5, "10", true, false, null, undefined, NaN, Infinity];

describe("parseVideoPaddingPercent", () => {
  it("accepts every integer from 0 to 25", () => {
    for (let percent = 0; percent <= 25; percent += 1) {
      assert.equal(parseVideoPaddingPercent(percent), percent);
    }
  });

  // 강제 변환 없이 거부한다 — 설정 저장 액션의 유일한 검증이다.
  it("rejects out-of-range and non-integer values without coercion", () => {
    for (const value of INVALID) {
      assert.equal(parseVideoPaddingPercent(value), null, String(value));
    }
  });
});

describe("resolveVideoPaddingPercent", () => {
  it("falls back to 0 for invalid or missing values", () => {
    assert.equal(VIDEO_PADDING_PERCENT_RANGE.DEFAULT, 0);
    for (const value of INVALID) {
      assert.equal(resolveVideoPaddingPercent(value), 0, String(value));
    }
  });

  it("keeps a valid value", () => {
    assert.equal(resolveVideoPaddingPercent(10), 10);
  });
});

describe("getVideoFrameLayout", () => {
  const layout = (percent) => {
    const { paddingPx, width, contentHeight } = getVideoFrameLayout(percent);
    return [paddingPx, width, contentHeight];
  };

  // 반올림(+50)을 floor로 바꾸면 3%가 57이 되고, 비율을 합계로 읽으면 10%가 96이 된다.
  it("matches the golden pixel values", () => {
    assert.deepEqual(layout(0), [0, 1080, 1920]);
    assert.deepEqual(layout(1), [19, 1080, 1882]);
    assert.deepEqual(layout(3), [58, 1080, 1804]);
    assert.deepEqual(layout(10), [192, 1080, 1536]);
    assert.deepEqual(layout(25), [480, 1080, 960]);
  });

  it("is symmetric, sums to 1920, and keeps an even center of at least 960", () => {
    for (let percent = 0; percent <= 25; percent += 1) {
      const { height, paddingPx, contentHeight } = getVideoFrameLayout(percent);
      assert.equal(height, 1920);
      assert.equal(2 * paddingPx + contentHeight, 1920);
      assert.equal(contentHeight % 2, 0);
      assert.ok(contentHeight >= 960, String(percent));
    }
  });
});

// 업로드 폼 Video style 라벨의 덧붙임 문구(REQ-FRAMING-009). 사용자에게 보이는 카피라
// 정확값이 계약이다. 0이면 null이어야 라벨이 여백 도입 전과 한 글자도 다르지 않다.
describe("videoFramingSummary", () => {
  it("is null for 0 and invalid values", () => {
    for (const value of [0, ...INVALID]) {
      assert.equal(videoFramingSummary(value), null, String(value));
    }
  });

  it("matches the golden copy", () => {
    assert.equal(videoFramingSummary(10), "10% top & bottom");
    assert.equal(videoFramingSummary(25), "25% top & bottom");
  });
});
