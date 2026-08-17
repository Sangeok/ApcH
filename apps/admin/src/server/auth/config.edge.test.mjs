import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { authConfigEdge } from "./config.edge.ts";

const authorized = authConfigEdge.callbacks.authorized;

function request(pathname, loggedIn = false) {
  return authorized({
    auth: loggedIn ? { user: { id: "admin-1" } } : null,
    request: { nextUrl: new URL(`https://admin.example${pathname}`) },
  });
}

describe("Edge auth routing", () => {
  it("allows logged-out login routes", () => {
    assert.equal(request("/login"), true);
  });

  it("redirects logged-in login routes to analytics", () => {
    const result = request("/login", true);
    assert.ok(result instanceof Response);
    assert.equal(result.status, 302);
    assert.equal(result.headers.get("location"), "https://admin.example/analytics");
  });

  it("protects non-login routes", () => {
    assert.equal(request("/analytics"), false);
    assert.equal(request("/analytics", true), true);
  });

  it("preserves the Core prefix behavior for /login-help", () => {
    assert.equal(request("/login-help"), true);
  });
});
