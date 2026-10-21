import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canAcceptCardNews,
  isCardNewsEnabledForUser,
  CARD_NEWS_CONFIG,
} from "./card-news.ts";

test("paid generation requires enablement and complete HTTPS backend configuration", () => {
  const settings = {
    enabled: false,
    allowedUserIds: "alice, bob",
    endpoint: "https://cpu.invalid",
    endpointAuth: "test",
    webhookSecret: "test",
    siteUrl: "https://web.invalid",
  };
  assert.equal(canAcceptCardNews(settings, "alice"), true);
  assert.equal(canAcceptCardNews(settings, "mallory"), false);
  for (const key of ["endpoint", "endpointAuth", "webhookSecret", "siteUrl"]) {
    assert.equal(
      canAcceptCardNews({ ...settings, [key]: undefined }, "alice"),
      false,
    );
  }
  assert.equal(
    canAcceptCardNews({ ...settings, endpoint: "http://cpu.invalid" }, "alice"),
    false,
  );
  assert.equal(
    canAcceptCardNews(
      { ...settings, endpoint: "https://user:secret@cpu.invalid" },
      "alice",
    ),
    false,
  );
});

test("allowlist checks complete user IDs and enabled permits other authenticated users", () => {
  assert.equal(
    isCardNewsEnabledForUser(
      { enabled: false, allowedUserIds: "alice" },
      "ali",
    ),
    false,
  );
  assert.equal(
    isCardNewsEnabledForUser({ enabled: true, allowedUserIds: "" }, "bob"),
    true,
  );
  assert.equal(CARD_NEWS_CONFIG.price, 1);
});
