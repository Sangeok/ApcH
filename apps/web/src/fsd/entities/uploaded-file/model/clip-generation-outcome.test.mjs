import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PARTIAL_CLIPS_AFTER_BACKEND_ERROR,
  PARTIAL_CLIPS_INSUFFICIENT,
  isPartialClipResultCode,
  resolveModalPollAction,
  resolvePartialClipNoteCode,
} from "./clip-generation-outcome.ts";

describe("resolvePartialClipNoteCode", () => {
  it("returns null when nothing was produced", () => {
    // clipsFound <= 0 은 부분 성공이 아니라 0-가드 경로가 처리한다.
    assert.equal(
      resolvePartialClipNoteCode({
        clipsFound: 0,
        expectedClipCount: 3,
        backendFailureMessage: null,
      }),
      null,
    );
  });

  it("marks a clean partial as insufficient when no backend error", () => {
    assert.equal(
      resolvePartialClipNoteCode({
        clipsFound: 2,
        expectedClipCount: 3,
        backendFailureMessage: null,
      }),
      PARTIAL_CLIPS_INSUFFICIENT,
    );
  });

  it("marks a partial after a backend error distinctly", () => {
    assert.equal(
      resolvePartialClipNoteCode({
        clipsFound: 2,
        expectedClipCount: 3,
        backendFailureMessage: "Modal crashed mid-render",
      }),
      PARTIAL_CLIPS_AFTER_BACKEND_ERROR,
    );
  });

  it("returns null when the full request was met", () => {
    // 완전(또는 초과)이면 노트를 남기지 않는다 — 평범한 완료다.
    assert.equal(
      resolvePartialClipNoteCode({
        clipsFound: 3,
        expectedClipCount: 3,
        backendFailureMessage: null,
      }),
      null,
    );
  });
});

describe("isPartialClipResultCode", () => {
  it("recognizes both partial-result codes", () => {
    assert.equal(isPartialClipResultCode(PARTIAL_CLIPS_INSUFFICIENT), true);
    assert.equal(
      isPartialClipResultCode(PARTIAL_CLIPS_AFTER_BACKEND_ERROR),
      true,
    );
  });

  it("rejects null, undefined, and unrelated failure codes", () => {
    assert.equal(isPartialClipResultCode(null), false);
    assert.equal(isPartialClipResultCode(undefined), false);
    assert.equal(isPartialClipResultCode("incomplete_clips_generated"), false);
    assert.equal(isPartialClipResultCode("no_clips_generated"), false);
  });
});

describe("resolveModalPollAction", () => {
  it("detects when S3 already holds the full requested count", () => {
    assert.equal(
      resolveModalPollAction({
        generatedClipCount: 3,
        clipCount: 3,
        modalCallbackReceived: false,
        hasBackendFailure: false,
        backendClipCount: null,
      }),
      "detected",
    );
  });

  it("detects when a success callback's partial target is already on S3", () => {
    assert.equal(
      resolveModalPollAction({
        generatedClipCount: 2,
        clipCount: 3,
        modalCallbackReceived: true,
        hasBackendFailure: false,
        backendClipCount: 2,
      }),
      "detected",
    );
  });

  it("settles when the partial target has not yet landed on S3", () => {
    assert.equal(
      resolveModalPollAction({
        generatedClipCount: 1,
        clipCount: 3,
        modalCallbackReceived: true,
        hasBackendFailure: false,
        backendClipCount: 2,
      }),
      "settle",
    );
  });

  it("fails on a backend failure callback", () => {
    assert.equal(
      resolveModalPollAction({
        generatedClipCount: 1,
        clipCount: 3,
        modalCallbackReceived: true,
        hasBackendFailure: true,
        backendClipCount: null,
      }),
      "failed",
    );
  });

  it("continues while no callback has arrived", () => {
    assert.equal(
      resolveModalPollAction({
        generatedClipCount: 1,
        clipCount: 3,
        modalCallbackReceived: false,
        hasBackendFailure: false,
        backendClipCount: null,
      }),
      "continue",
    );
  });

  it("continues on a success callback without clip metadata", () => {
    // backendClipCount=null: 확정 목표가 없어 기존 clipCount 기준 폴링을 유지한다.
    assert.equal(
      resolveModalPollAction({
        generatedClipCount: 1,
        clipCount: 3,
        modalCallbackReceived: true,
        hasBackendFailure: false,
        backendClipCount: null,
      }),
      "continue",
    );
  });

  it("continues on a success callback that promised zero clips", () => {
    // backendClipCount=0 은 [1, clipCount) 밖 → no_clips_generated 경로가 처리한다.
    assert.equal(
      resolveModalPollAction({
        generatedClipCount: 0,
        clipCount: 3,
        modalCallbackReceived: true,
        hasBackendFailure: false,
        backendClipCount: 0,
      }),
      "continue",
    );
  });

  it("continues defensively when the promised count exceeds the request", () => {
    // backendClipCount >= clipCount 은 부분 조기 탈출 대상이 아니다.
    assert.equal(
      resolveModalPollAction({
        generatedClipCount: 2,
        clipCount: 3,
        modalCallbackReceived: true,
        hasBackendFailure: false,
        backendClipCount: 5,
      }),
      "continue",
    );
  });
});
