import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_METADATA_KEYS_BY_EVENT,
} from "./event-catalog.ts";

test("shim이 이벤트 이름을 그대로 내보낸다", () => {
  // 개수를 박으면 이벤트를 하나 추가할 때 무관한 테스트가 깨진다.
  // 계약은 "재수출이 살아 있는가"이고, 그건 아래 includes가 증명한다.
  assert.ok(ANALYTICS_EVENT_NAMES.length > 0);
  assert.ok(ANALYTICS_EVENT_NAMES.includes("clip_review_confirmed"));
  assert.ok(ANALYTICS_EVENT_NAMES.includes("landing_view"));
  // 숫자를 품은 이름이라 [a-z_]+ 류의 순진한 카운트가 조용히 놓친다.
  assert.ok(ANALYTICS_EVENT_NAMES.includes("upload_s3_completed"));
});

test("shim이 web 전용 metadata 재수출을 유지한다", () => {
  assert.ok(
    ANALYTICS_METADATA_KEYS_BY_EVENT,
    "재수출이 빠지면 계측이 타입 에러 없이 조용히 멈춘다",
  );
});

test("모든 이벤트 이름에 metadata 정의가 있다", () => {
  for (const name of ANALYTICS_EVENT_NAMES) {
    assert.ok(
      name in ANALYTICS_METADATA_KEYS_BY_EVENT,
      `metadata 정의 누락: ${name}`,
    );
  }
});
