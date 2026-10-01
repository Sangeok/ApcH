import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  generationModeHint,
  uploadButtonLabel,
} from "./upload-options-copy.ts";

describe("uploadButtonLabel", () => {
  it("labels the auto path", () => {
    assert.equal(uploadButtonLabel(false), "Upload and generate clips");
  });

  it("labels the review path", () => {
    assert.equal(uploadButtonLabel(true), "Upload and review clips");
  });
});

describe("generationModeHint", () => {
  it("describes the auto path", () => {
    assert.equal(generationModeHint(false), "Generates clips immediately.");
  });

  it("describes the review path", () => {
    assert.equal(generationModeHint(true), "Edit clips before generating.");
  });
});
