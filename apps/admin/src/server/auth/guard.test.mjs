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
});
