import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  captionHeightPercent,
  clampMarginV,
  resolveVerticalDrop,
  verticalDropToCenterPx,
} from "./caption-vertical-drag.ts";

// 미리보기 컨테이너 높이(px). CaptionPreviewPlayer가 쓰는 값과 같다. ASS PlayResY 1920 → assPerPx = 6.
const H = 320;

describe("clampMarginV", () => {
  it("clamps below 0 up to 0 and above 960 down to 960", () => {
    assert.equal(clampMarginV(-5), 0);
    assert.equal(clampMarginV(-0.4), 0);
    assert.equal(clampMarginV(1000), 960);
    assert.equal(clampMarginV(960), 960);
    assert.equal(clampMarginV(0), 0);
  });

  it("rounds to an integer", () => {
    assert.equal(clampMarginV(288.4), 288);
    assert.equal(clampMarginV(288.6), 289);
  });

  it("maps non-finite values to the minimum (0)", () => {
    assert.equal(clampMarginV(Number.NaN), 0);
    assert.equal(clampMarginV(Number.POSITIVE_INFINITY), 0);
    assert.equal(clampMarginV(Number.NEGATIVE_INFINITY), 0);
  });
});

describe("resolveVerticalDrop", () => {
  it("resolves a center in the top half to top with the top-edge distance in ASS px", () => {
    // centerPx 60, blockH 24 → topEdge 48 px → 48 × 6 = 288 ASS px.
    assert.deepEqual(resolveVerticalDrop(60, 24, H), { position: "top", marginV: 288 });
  });

  it("resolves a center in the bottom half to bottom with the bottom-edge distance in ASS px", () => {
    // centerPx 260, blockH 24 → bottomEdge 320 − 272 = 48 px → 288 ASS px.
    assert.deepEqual(resolveVerticalDrop(260, 24, H), { position: "bottom", marginV: 288 });
  });

  it("treats the exact middle (centerPx === H/2) as bottom", () => {
    // 160 < 160 이 false라 bottom 분기. bottomEdge = 320 − 172 = 148 → 888.
    assert.deepEqual(resolveVerticalDrop(160, 24, H), { position: "bottom", marginV: 888 });
  });

  it("clamps a negative edge distance to 0", () => {
    // centerPx 5, blockH 24 → topEdge −7 px → clamp → 0.
    assert.deepEqual(resolveVerticalDrop(5, 24, H), { position: "top", marginV: 0 });
  });
});

describe("verticalDropToCenterPx", () => {
  it("places top at preset marginv + half block when marginV is null", () => {
    // inset.top = 200 × 320/1920, center = inset.top + 12.
    assert.equal(verticalDropToCenterPx("top", null, 24, H), 200 * (H / 1920) + 12);
  });

  it("places bottom at H − preset marginv − half block when marginV is null", () => {
    assert.equal(
      verticalDropToCenterPx("bottom", null, 24, H),
      H - 260 * (H / 1920) - 12,
    );
  });

  it("centers middle regardless of marginV", () => {
    assert.equal(verticalDropToCenterPx("middle", null, 24, H), H / 2);
    assert.equal(verticalDropToCenterPx("middle", 400, 24, H), H / 2);
  });

  it("keeps marginV 0 at the edge (not the preset) for top and bottom", () => {
    // top → blockH/2, bottom → H − blockH/2. `??`를 `||`로 바꾸면 0이 프리셋으로 되돌아간다.
    assert.equal(verticalDropToCenterPx("top", 0, 24, H), 12);
    assert.equal(verticalDropToCenterPx("bottom", 0, 24, H), H - 12);
  });
});

describe("resolveVerticalDrop ↔ verticalDropToCenterPx round-trip", () => {
  it("returns approximately the original center across both halves", () => {
    const blockH = 24;
    for (const centerPx of [60, 100, 140, 180, 220, 280]) {
      const drop = resolveVerticalDrop(centerPx, blockH, H);
      const back = verticalDropToCenterPx(drop.position, drop.marginV, blockH, H);
      assert.ok(
        Math.abs(back - centerPx) <= 1,
        `center ${centerPx} round-tripped to ${back}`,
      );
    }
  });
});

describe("captionHeightPercent", () => {
  it("returns golden percent-from-bottom values at font size 122", () => {
    assert.equal(captionHeightPercent("top", null, 122), 86);
    assert.equal(captionHeightPercent("bottom", null, 122), 17);
    assert.equal(captionHeightPercent("bottom", 0, 122), 3);
    assert.equal(captionHeightPercent("middle", null, 122), 50);
  });

  it("never increases as the caption center sweeps from top to bottom", () => {
    // 블록을 아래로 옮길수록(= centerPx 증가) 아래에서의 % 는 줄기만 한다. 경계에서도 튀지 않는다.
    const assFontSize = 122;
    const blockH = assFontSize * (H / 1920); // 미리보기 줄 상자 높이 → ASS 블록과 연속
    let prev = Number.POSITIVE_INFINITY;
    for (let centerPx = 20; centerPx <= 300; centerPx += 5) {
      const drop = resolveVerticalDrop(centerPx, blockH, H);
      const pct = captionHeightPercent(drop.position, drop.marginV, assFontSize);
      assert.ok(pct <= prev, `pct rose to ${pct} at center ${centerPx} (prev ${prev})`);
      prev = pct;
    }
  });
});
