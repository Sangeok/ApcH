import assert from "node:assert/strict";
import test from "node:test";
import { parseLocalVerificationProxy } from "./card-news-verification-runtime.mts";

const localDatabase = new URL(
  "postgresql://postgres@127.0.0.1:55439/card_news_test",
);

test("optional local proxy leaves the normal PrismaNeon transport untouched", () => {
  assert.equal(
    parseLocalVerificationProxy(
      undefined,
      new URL("postgresql://example.invalid/isolated"),
    ),
    null,
  );
});
test("local proxy accepts only explicit loopback IP endpoints", () => {
  assert.equal(
    parseLocalVerificationProxy("ws://127.0.0.1:55440", localDatabase)?.host,
    "127.0.0.1:55440",
  );
  assert.equal(
    parseLocalVerificationProxy(
      "ws://[::1]:55440/v2",
      new URL("postgresql://postgres@[::1]:55439/test"),
    )?.pathname,
    "/v2",
  );
});
test("local proxy rejects remote or ambiguous transports before DB import", () => {
  for (const value of [
    "",
    "127.0.0.1:55440",
    "http://127.0.0.1:55440",
    "wss://127.0.0.1:55440",
    "ws://localhost:55440",
    "ws://example.invalid:55440",
    "ws://127.0.0.1",
    "ws://127.0.0.1:0",
    "ws://user:secret@127.0.0.1:55440",
    "ws://127.0.0.1:55440?address=example.invalid",
    "ws://127.0.0.1:55440/#fragment",
    "ws://127.0.0.1:55440/private",
    " ws://127.0.0.1:55440",
    "ws://127.1:55440",
    "ws://127.0.0.1:55440/v2/../",
  ]) {
    assert.throws(
      () => parseLocalVerificationProxy(value, localDatabase),
      value,
    );
  }
});
test("an insecure local proxy can never target a remote or overridden DB", () => {
  for (const value of [
    "postgresql://postgres@example.invalid:55439/test",
    "postgresql://postgres@localhost:55439/test",
    "postgresql://postgres@127.0.0.1/test",
    "postgresql://postgres@127.0.0.1:0/test",
    "postgresql://postgres@127.0.0.1:55439/",
    "postgresql://postgres@127.0.0.1:55439/test?host=example.invalid",
    "postgresql://postgres@127.0.0.1:55439/test?port=5432",
    "https://127.0.0.1:55439/test",
  ]) {
    assert.throws(
      () => parseLocalVerificationProxy("ws://127.0.0.1:55440", new URL(value)),
      value,
    );
  }
  assert.ok(
    parseLocalVerificationProxy(
      "ws://127.0.0.1:55440",
      new URL(`${localDatabase.href}?sslmode=disable`),
    ),
  );
});
