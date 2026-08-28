import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";

// VERIFIER_SECRET은 import 전에 넣어야 한다 — authConfig는 모듈 로드 시 한 번
// 평가되고 buildVerifierProvider(env.VERIFIER_SECRET)가 그때 provider를 등록한다.
// beforeEach에서 넣으면 이미 평가가 끝나 provider가 등록되지 않는다.
const fakeEnv = {
  ADMIN_EMAILS: "admin@example.com, SECOND@example.com",
  VERIFIER_SECRET: "test-verifier-secret",
};

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

describe("verifier provider registration", () => {
  it("registers the credentials provider when VERIFIER_SECRET is set", () => {
    assert.equal(authConfig.providers.length, 2);
    assert.equal(authConfig.providers[1].type, "credentials");
    assert.equal(authConfig.providers[1].options.id, "verifier");
  });
});

describe("signIn provider branch", () => {
  it("admits the verifier provider without an email", () => {
    const signIn = authConfig.callbacks.signIn;
    assert.equal(
      signIn({ user: {}, account: { provider: "verifier" } }),
      true,
    );
  });

  it("keeps the whitelist for the google provider", () => {
    const signIn = authConfig.callbacks.signIn;
    assert.equal(
      signIn({
        user: { email: "outsider@example.com" },
        account: { provider: "google" },
      }),
      false,
    );
    assert.equal(
      signIn({
        user: { email: "ADMIN@example.com" },
        account: { provider: "google" },
      }),
      true,
    );
  });
});

describe("jwt claim seeding", () => {
  it("seeds role and issuedAt on verifier login only", () => {
    const jwt = authConfig.callbacks.jwt;
    const token = jwt({
      token: { sub: "verifier" },
      account: { provider: "verifier" },
    });
    assert.equal(token.role, "verifier");
    assert.equal(typeof token.verifierIssuedAt, "number");
  });

  it("leaves the token unchanged for the google provider", () => {
    const jwt = authConfig.callbacks.jwt;
    const token = jwt({
      token: { sub: "admin-1" },
      account: { provider: "google" },
    });
    assert.deepEqual(token, { sub: "admin-1" });
  });

  it("leaves the token unchanged when there is no account", () => {
    const jwt = authConfig.callbacks.jwt;
    const token = jwt({ token: { sub: "admin-1" }, account: null });
    assert.deepEqual(token, { sub: "admin-1" });
  });
});

describe("session claim round-trip", () => {
  it("copies sub, role and verifierIssuedAt onto session.user", () => {
    const session = authConfig.callbacks.session({
      session: { user: {} },
      token: { sub: "verifier", role: "verifier", verifierIssuedAt: 123 },
    });
    assert.equal(session.user.id, "verifier");
    assert.equal(session.user.role, "verifier");
    assert.equal(session.user.verifierIssuedAt, 123);
  });

  it("leaves role and verifierIssuedAt undefined for an admin token", () => {
    const session = authConfig.callbacks.session({
      session: { user: { email: "admin@example.com" } },
      token: { sub: "admin-1" },
    });
    assert.equal(session.user.id, "admin-1");
    assert.equal(session.user.role, undefined);
    assert.equal(session.user.verifierIssuedAt, undefined);
  });
});
