import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scrubString, scrubEvent } from "./scrub-event.ts";

describe("scrubString", () => {
  it("redacts each S3 signature parameter individually", () => {
    assert.equal(
      scrubString("X-Amz-Signature=deadbeef1234"),
      "X-Amz-Signature=[REDACTED]",
    );
    assert.equal(
      scrubString("X-Amz-Credential=AKIAEXAMPLE"),
      "X-Amz-Credential=[REDACTED]",
    );
    assert.equal(
      scrubString("X-Amz-Security-Token=FwoGZXIvYXdz"),
      "X-Amz-Security-Token=[REDACTED]",
    );
  });

  it("redacts all three secrets present in one string", () => {
    const url =
      "https://x.s3/y?X-Amz-Credential=AKIA123&X-Amz-Signature=abc123&X-Amz-Security-Token=tok987";
    assert.equal(
      scrubString(url),
      "https://x.s3/y?X-Amz-Credential=[REDACTED]&X-Amz-Signature=[REDACTED]&X-Amz-Security-Token=[REDACTED]",
    );
  });

  it("stops the signature match at &, whitespace, quote, and backslash boundaries", () => {
    // & 경계: 뒤따르는 쿼리 파라미터는 남는다.
    assert.equal(
      scrubString("?X-Amz-Signature=abc123&next=1"),
      "?X-Amz-Signature=[REDACTED]&next=1",
    );
    // 공백 경계.
    assert.equal(
      scrubString("X-Amz-Signature=abc def"),
      "X-Amz-Signature=[REDACTED] def",
    );
    // 따옴표 경계.
    assert.equal(
      scrubString(`X-Amz-Signature=abc"tail`),
      `X-Amz-Signature=[REDACTED]"tail`,
    );
    // 백슬래시 경계(결함 ① 수정): abc 뒤 \ 에서 멈춘다.
    assert.equal(
      scrubString(`X-Amz-Signature=abc\\tail`),
      `X-Amz-Signature=[REDACTED]\\tail`,
    );
  });

  it("keeps slashes inside the signature value (does not stop at /)", () => {
    assert.equal(
      scrubString("X-Amz-Signature=AKIA/2026/ap/s3/aws4_request"),
      "X-Amz-Signature=[REDACTED]",
    );
  });

  it("applies literal replacements to every occurrence", () => {
    const out = scrubString("host a.example host again a.example done", [
      ["a.example", "[HOST]"],
    ]);
    assert.equal(out, "host [HOST] host again [HOST] done");
  });

  it("applies only rules when the literals array is empty", () => {
    assert.equal(
      scrubString("X-Amz-Signature=abc a.example", []),
      "X-Amz-Signature=[REDACTED] a.example",
    );
  });

  it("leaves strings without any secret untouched", () => {
    const plain = "just a normal log line with no secrets";
    assert.equal(scrubString(plain), plain);
  });
});

describe("scrubEvent", () => {
  it("scrubs signatures anywhere in a nested event object (round-trip)", () => {
    const event = {
      message: "boom X-Amz-Signature=msgsig123",
      exception: {
        values: [{ value: "failed at X-Amz-Signature=excsig456" }],
      },
      contexts: {
        report: { url: "https://x.s3/y?X-Amz-Signature=ctxsig789" },
      },
    };

    const scrubbed = scrubEvent(event);

    assert.equal(scrubbed.message, "boom X-Amz-Signature=[REDACTED]");
    assert.equal(
      scrubbed.exception.values[0].value,
      "failed at X-Amz-Signature=[REDACTED]",
    );
    assert.equal(
      scrubbed.contexts.report.url,
      "https://x.s3/y?X-Amz-Signature=[REDACTED]",
    );
  });

  it("scrubs a value even when an escaped quote follows the signature (결함 ①)", () => {
    // 원본 경계 [^&\s"']는 백슬래시에서 멈추지 않아 JSON.stringify가 만든
    // \" 의 닫는 따옴표까지 삼켜 깨진 JSON을 만든다 → JSON.parse throw →
    // fail-open으로 원본이 스크럽 없이 나간다. \\ 를 경계에 넣어 이를 막는다.
    const scrubbed = scrubEvent({ message: `X-Amz-Signature=abc"tail` });

    assert.equal(scrubbed.message, `X-Amz-Signature=[REDACTED]"tail`);
    // 회귀 못박기: \\ 를 경계에서 빼면 fail-open으로 원본이 그대로 반환된다.
    assert.ok(scrubbed.message.includes("[REDACTED]"));
    assert.ok(!scrubbed.message.includes("abc"));
  });

  it("passes endpoint-host literal replacements through to the event", () => {
    const scrubbed = scrubEvent(
      { message: "hit modal.example.run/process" },
      [["modal.example.run", "[PROCESS_VIDEO_ENDPOINT]"]],
    );

    assert.equal(scrubbed.message, "hit [PROCESS_VIDEO_ENDPOINT]/process");
  });

  it("fails open (returns the original) when JSON.stringify throws", () => {
    const circular = { message: "X-Amz-Signature=abc123" };
    circular.self = circular;

    const result = scrubEvent(circular);

    // 스로우하지 않고 동일 객체를 그대로 반환한다(fail-open).
    assert.equal(result, circular);
  });
});
