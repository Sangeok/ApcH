import assert from "node:assert/strict";
import { after, describe, it, mock } from "node:test";

mock.module("server-only", { namedExports: {} });

const {
  VERIFIER_PROVIDER_ID,
  VERIFIER_ROLE,
  verifyVerifierSecret,
  authorizeVerifier,
  buildVerifierProvider,
} = await import("./verifier.ts");

after(() => mock.restoreAll());

describe("verifyVerifierSecret", () => {
  it("rejects an undefined expected secret", () => {
    assert.equal(verifyVerifierSecret(undefined, "anything"), false);
  });

  it("rejects an empty expected secret", () => {
    assert.equal(verifyVerifierSecret("", ""), false);
  });

  it("rejects a non-string provided value", () => {
    assert.equal(verifyVerifierSecret("secret", 123), false);
    assert.equal(verifyVerifierSecret("secret", undefined), false);
    assert.equal(verifyVerifierSecret("secret", null), false);
  });

  it("rejects a length mismatch without throwing", () => {
    assert.equal(verifyVerifierSecret("secret", "sec"), false);
  });

  it("rejects a same-length mismatch", () => {
    assert.equal(verifyVerifierSecret("secret", "secreT"), false);
  });

  it("accepts an exact match", () => {
    assert.equal(verifyVerifierSecret("secret", "secret"), true);
  });
});

describe("authorizeVerifier", () => {
  it("returns null when the expected secret is absent", () => {
    assert.equal(authorizeVerifier(undefined, "x"), null);
  });

  it("returns null on mismatch", () => {
    assert.equal(authorizeVerifier("secret", "wrong"), null);
  });

  it("returns the fixed identity on a match", () => {
    assert.deepEqual(authorizeVerifier("secret", "secret"), {
      id: VERIFIER_PROVIDER_ID,
      role: VERIFIER_ROLE,
    });
  });
});

describe("buildVerifierProvider", () => {
  it("returns null when the secret is undefined", () => {
    assert.equal(buildVerifierProvider(undefined), null);
  });

  it("returns null when the secret is an empty string", () => {
    assert.equal(buildVerifierProvider(""), null);
  });

  it("registers a credentials provider carrying the verifier id", () => {
    const provider = buildVerifierProvider("secret");
    assert.notEqual(provider, null);
    assert.equal(provider.type, "credentials");
    // Credentials() 팩토리는 사용자 설정을 provider.options로 옮긴다(§1).
    assert.equal(provider.options.id, VERIFIER_PROVIDER_ID);
    assert.equal(typeof provider.options.authorize, "function");
  });

  it("authorizes the correct secret and rejects wrong / missing input", async () => {
    const provider = buildVerifierProvider("secret");
    assert.deepEqual(await provider.options.authorize({ secret: "secret" }), {
      id: VERIFIER_PROVIDER_ID,
      role: VERIFIER_ROLE,
    });
    assert.equal(await provider.options.authorize({ secret: "wrong" }), null);
    assert.equal(await provider.options.authorize(undefined), null);
  });
});
