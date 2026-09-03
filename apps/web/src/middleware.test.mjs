import assert from "node:assert/strict";
import { test } from "node:test";

import { config } from "~/middleware";
import { AUTH_ROUTES, PROTECTED_ROUTES } from "~/server/auth/config.edge";

/**
 * `authorized` 콜백은 matcher가 통과시킨 요청에서만 돈다. 그래서
 * PROTECTED_ROUTES에만 경로를 추가하면 보호된 것처럼 읽히지만 미들웨어가
 * 아예 실행되지 않는 무방비 라우트가 생긴다. Next가 matcher를 정적으로
 * 추출하므로 상수에서 계산해 만들 수 없고, 타입도 둘을 묶어 주지 못한다.
 * 이 테스트가 그 조용한 드리프트를 실패로 바꾼다.
 */

/** Next matcher 패턴 하나를 경로 접두사 검사 함수로. */
function matchesPattern(pattern, routePrefix) {
  // "/dashboard/:path*" 는 "/dashboard" 와 그 하위 전부를 덮는다.
  const base = pattern.replace(/\/:path\*$/, "");
  return routePrefix === base || routePrefix.startsWith(`${base}/`);
}

function isCoveredByMatcher(routePrefix) {
  return config.matcher.some((pattern) => matchesPattern(pattern, routePrefix));
}

test("matcher covers every protected route prefix", () => {
  for (const route of PROTECTED_ROUTES) {
    assert.ok(
      isCoveredByMatcher(route),
      `${route} is in PROTECTED_ROUTES but no middleware matcher pattern covers it — the authorized() callback never runs for it`,
    );
  }
});

test("matcher covers every auth route", () => {
  for (const route of AUTH_ROUTES) {
    assert.ok(
      isCoveredByMatcher(route),
      `${route} is in AUTH_ROUTES but no middleware matcher pattern covers it — logged-in users are not redirected away from it`,
    );
  }
});

test("a route absent from the matcher is reported as uncovered", () => {
  // 검사기 자신이 무엇이든 통과시키지 않는지 확인한다.
  assert.equal(isCoveredByMatcher("/admin"), false);
  assert.equal(isCoveredByMatcher("/dashboardish"), false);
});
