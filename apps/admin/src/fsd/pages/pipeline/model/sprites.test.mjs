import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  appearanceFor,
  bubbleColorFor,
  gridToRects,
  PROP_GRIDS,
  resolveCell,
  SPRITE_ROWS,
} from "./sprites.ts";

describe("resolveCell", () => {
  it("maps '.' to null (transparent)", () => {
    assert.equal(resolveCell(".", {}), null);
  });

  it("maps palette letters to their hex", () => {
    assert.equal(resolveCell("k", {}), "#2b2420");
    assert.equal(resolveCell("s", {}), "#f2c9a0");
  });

  it("resolves H/T from extra (hair/shirt)", () => {
    assert.equal(resolveCell("H", { H: "#111111", T: "#222222" }), "#111111");
    assert.equal(resolveCell("T", { H: "#111111", T: "#222222" }), "#222222");
  });

  it("returns null for unknown characters", () => {
    assert.equal(resolveCell("z", {}), null);
  });

  it("lets extra override the palette", () => {
    assert.equal(resolveCell("k", { k: "#ffffff" }), "#ffffff");
  });
});

describe("SPRITE_ROWS", () => {
  it("is a 12x12 grid", () => {
    assert.equal(SPRITE_ROWS.length, 12);
    for (const row of SPRITE_ROWS) {
      assert.equal(row.length, 12);
    }
  });

  it("places the two eye pixels at columns 3 and 8 on the eye row", () => {
    const eyeRow = SPRITE_ROWS[4];
    assert.equal(eyeRow, ".kskssssksk.");
    assert.equal(eyeRow[3], "k");
    assert.equal(eyeRow[8], "k");
  });
});

describe("gridToRects", () => {
  it("skips '.' cells and emits one rect per opaque cell", () => {
    const rects = gridToRects(["k.", ".k"], {}, 6);
    assert.deepEqual(rects, [
      { x: 0, y: 0, size: 6, color: "#2b2420" },
      { x: 6, y: 6, size: 6, color: "#2b2420" },
    ]);
  });

  it("applies origin and cell size to coordinates", () => {
    const rects = gridToRects(["k"], {}, 6, 10, 20);
    assert.deepEqual(rects, [{ x: 10, y: 20, size: 6, color: "#2b2420" }]);
  });

  it("contributes zero rects for a fully transparent grid", () => {
    assert.deepEqual(gridToRects(["..", ".."], {}, 6), []);
  });
});

describe("PROP_GRIDS", () => {
  it("has all five props with the mockgen dy offsets", () => {
    assert.equal(Object.keys(PROP_GRIDS).length, 5);
    assert.equal(PROP_GRIDS.laptop.dy, -3);
    assert.equal(PROP_GRIDS.papers.dy, -3);
    assert.equal(PROP_GRIDS.glass.dy, -4);
    assert.equal(PROP_GRIDS.compass.dy, -4);
    assert.equal(PROP_GRIDS.ledger.dy, -4);
  });
});

describe("appearanceFor", () => {
  it("returns a fixed identity for every roster agent", () => {
    assert.deepEqual(appearanceFor("pm"), {
      hair: "#2b2420",
      shirt: "#4a4080",
      prop: "papers",
    });
    assert.deepEqual(appearanceFor("admin-dev"), {
      hair: "#5a3b28",
      shirt: "#5f8a5a",
      prop: "laptop",
    });
    assert.deepEqual(appearanceFor("web-dev"), {
      hair: "#7a5230",
      shirt: "#8a6b4f",
      prop: "laptop",
    });
    assert.deepEqual(appearanceFor("doc-auditor"), {
      hair: "#8f8a80",
      shirt: "#7a6296",
      prop: "glass",
    });
    assert.deepEqual(appearanceFor("feature-scout"), {
      hair: "#3c4a3a",
      shirt: "#4f7d78",
      prop: "compass",
    });
    assert.deepEqual(appearanceFor("backend-dev"), {
      hair: "#52504b",
      shirt: "#37617a",
      prop: "laptop",
    });
    assert.deepEqual(appearanceFor("plan-verifier"), {
      hair: "#443a4a",
      shirt: "#8a4a52",
      prop: "ledger",
    });
  });

  it("falls back for unknown agents", () => {
    assert.deepEqual(appearanceFor("mystery"), {
      hair: "#5a3b28",
      shirt: "#6b7f96",
      prop: "papers",
    });
  });
});

describe("bubbleColorFor", () => {
  it("returns null for muted (silence rule: no bubble)", () => {
    assert.equal(bubbleColorFor("muted"), null);
  });

  it("returns the tone color for signalling tones", () => {
    assert.equal(bubbleColorFor("pending"), "#976014");
    assert.equal(bubbleColorFor("active"), "#3e5a86");
    assert.equal(bubbleColorFor("done"), "#6f6b64"); // 게이트 조정값
    assert.notEqual(bubbleColorFor("hold"), null);
  });
});
