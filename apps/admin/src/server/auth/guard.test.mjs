import assert from "node:assert/strict";
import { after, beforeEach, describe, it, mock } from "node:test";

const REDIRECT = new Error("NEXT_REDIRECT");
const NOT_FOUND = new Error("NEXT_NOT_FOUND");
const state = {
  session: null,
  allowed: new Set(["admin@example.com"]),
};

mock.module("server-only", { namedExports: {} });
mock.module("next/navigation", {
  namedExports: {
    redirect() {
      throw REDIRECT;
    },
    notFound() {
      throw NOT_FOUND;
    },
  },
});
mock.module("./index", {
  namedExports: {
    auth: async () => state.session,
    getAdminEmailSet: () => state.allowed,
  },
});

const { requireAdmin } = await import("./guard.ts");
// 상수는 verifier 모듈에서 실제 import한다(guard는 이 값만 참조).
const { VERIFIER_MAX_AGE_MS } = await import("./verifier.ts");

after(() => mock.restoreAll());
beforeEach(() => {
  state.session = null;
  state.allowed = new Set(["admin@example.com"]);
});

describe("requireAdmin", () => {
  it("preserves the unauthenticated redirect sentinel", async () => {
    await assert.rejects(requireAdmin(), (error) => error === REDIRECT);
  });

  it("preserves the removed-admin notFound sentinel", async () => {
    state.session = {
      user: { id: "admin-1", email: "removed@example.com" },
    };
    await assert.rejects(requireAdmin(), (error) => error === NOT_FOUND);
  });

  it("returns the normalized allowed identity", async () => {
    state.session = {
      user: { id: "admin-1", email: "ADMIN@example.com" },
    };
    assert.deepEqual(await requireAdmin(), {
      userId: "admin-1",
      email: "admin@example.com",
    });
  });

  it("admits a fresh verifier for reads with a null email", async () => {
    state.session = {
      user: { id: "verifier", role: "verifier", verifierIssuedAt: Date.now() },
    };
    assert.deepEqual(await requireAdmin(), {
      userId: "verifier",
      email: null,
    });
  });

  it("rejects a verifier from write actions", async () => {
    state.session = {
      user: { id: "verifier", role: "verifier", verifierIssuedAt: Date.now() },
    };
    await assert.rejects(
      requireAdmin({ write: true }),
      (error) => error === NOT_FOUND,
    );
  });

  it("rejects a verifier past the 1h lifetime", async () => {
    state.session = {
      user: {
        id: "verifier",
        role: "verifier",
        verifierIssuedAt: Date.now() - (VERIFIER_MAX_AGE_MS + 1000),
      },
    };
    await assert.rejects(requireAdmin(), (error) => error === NOT_FOUND);
  });

  it("rejects a verifier that lacks the issuedAt claim", async () => {
    state.session = {
      user: { id: "verifier", role: "verifier" },
    };
    await assert.rejects(requireAdmin(), (error) => error === NOT_FOUND);
  });

  it("does not consult the whitelist for a verifier", async () => {
    state.allowed = new Set();
    state.session = {
      user: { id: "verifier", role: "verifier", verifierIssuedAt: Date.now() },
    };
    assert.deepEqual(await requireAdmin(), {
      userId: "verifier",
      email: null,
    });
  });

  it("still returns an admin identity when write is requested", async () => {
    state.session = {
      user: { id: "admin-1", email: "ADMIN@example.com" },
    };
    assert.deepEqual(await requireAdmin({ write: true }), {
      userId: "admin-1",
      email: "admin@example.com",
    });
  });
});
