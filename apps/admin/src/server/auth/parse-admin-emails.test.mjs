import assert from "node:assert/strict";
import { test } from "node:test";

import { parseAdminEmails } from "./parse-admin-emails.ts";

test("콤마로 나누고 공백을 제거한다", () => {
  const set = parseAdminEmails("a@x.com, b@y.com");
  assert.equal(set.size, 2);
  assert.ok(set.has("a@x.com"));
  assert.ok(set.has("b@y.com"));
});

test("대문자를 소문자로 정규화한다", () => {
  const set = parseAdminEmails("Admin@Example.COM");
  assert.ok(set.has("admin@example.com"));
});

test("트레일링 콤마가 빈 항목을 만들지 않는다", () => {
  const set = parseAdminEmails("a@x.com,");
  assert.equal(set.size, 1);
  assert.ok(!set.has(""));
});

test("undefined는 빈 집합이 된다", () => {
  assert.equal(parseAdminEmails(undefined).size, 0);
});

test("빈 문자열은 빈 집합이 된다", () => {
  assert.equal(parseAdminEmails("").size, 0);
});

test("공백만 있는 항목은 버려진다", () => {
  const set = parseAdminEmails("a@x.com, , b@y.com");
  assert.equal(set.size, 2);
});

test("선행/후행 공백으로 감싼 목록을 정리한다", () => {
  const set = parseAdminEmails("  a@x.com ,  b@y.com  ");
  assert.equal(set.size, 2);
  assert.ok(set.has("a@x.com"));
  assert.ok(set.has("b@y.com"));
});

test("중복 항목은 한 번만 담긴다", () => {
  const set = parseAdminEmails("a@x.com, A@X.COM");
  assert.equal(set.size, 1);
  assert.ok(set.has("a@x.com"));
});
