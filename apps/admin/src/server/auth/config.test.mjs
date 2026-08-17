import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";

const fakeEnv = { ADMIN_EMAILS: "admin@example.com, SECOND@example.com" };

mock.module("server-only", { namedExports: {} });
mock.module("~/env", { namedExports: { env: fakeEnv } });

const { authConfig, getAdminEmailSet } = await import("./config.ts");

after(() => mock.restoreAll());
beforeEach(() => {
  fakeEnv.ADMIN_EMAILS = "admin@example.com, SECOND@example.com";
});

describe("Node auth allowlist", () => {
  it("normalizes the configured allowlist", () => {
    assert.deepEqual(
      [...getAdminEmailSet()].sort(),
      ["admin@example.com", "second@example.com"],
    );
  });

  it("allows only allowlisted emails", () => {
    const signIn = authConfig.callbacks.signIn;
    assert.equal(signIn({ user: { email: "ADMIN@example.com" } }), true);
    assert.equal(signIn({ user: { email: "outsider@example.com" } }), false);
  });

  it("denies a missing email", () => {
    assert.equal(authConfig.callbacks.signIn({ user: {} }), false);
  });
});
