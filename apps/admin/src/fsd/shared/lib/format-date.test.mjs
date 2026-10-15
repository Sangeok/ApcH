import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.TZ = "Asia/Seoul";
const { formatDateTime, DATE_TIME_FORMATTER } = await import("./format-date.ts");

describe("format-date", () => {
  it("renders date+time in UTC regardless of process timezone", () => {
    // 프로세스 TZ가 Asia/Seoul이어도 UTC 고정이라 KST(07:55 AM)가 아니라
    // UTC(10:55 PM)로 나온다 — timeZone 옵션 제거 돌연변이가 여기서 사멸한다.
    assert.equal(formatDateTime("2026-07-30T22:55:46Z"), "Jul 30, 2026, 10:55 PM");
  });

  it("locks the formatter to timeZone UTC", () => {
    assert.equal(DATE_TIME_FORMATTER.resolvedOptions().timeZone, "UTC");
  });

  it("locks the formatter to locale exactly en", () => {
    // 완전 일치 — 로케일 인자를 지운 구현은 en 계열 CI에서 "en-US"로 해석되는데
    // 고정 옵션에서 출력이 "en"과 같아 골든으로는 못 잡는다.
    assert.equal(DATE_TIME_FORMATTER.resolvedOptions().locale, "en");
  });
});
