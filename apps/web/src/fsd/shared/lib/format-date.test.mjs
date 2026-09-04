import assert from "node:assert/strict";
import { describe, it } from "node:test";

// 포매터는 모듈 스코프에서 만들어지므로 process.env.TZ 설정이 임포트보다 먼저여야
// 한다. 비-UTC로 강제한 뒤 동적 임포트한다 — TZ=UTC 러너(CI·Vercel)에서
// `timeZone: "UTC"`를 지운 돌연변이가 골든 대조만으로는 생존하기 때문이다.
process.env.TZ = "Asia/Seoul";
const { formatDate, formatDateTime, DATE_FORMATTER, DATE_TIME_FORMATTER } =
  await import("./format-date.ts");

describe("format-date", () => {
  it("renders date+time in UTC regardless of process timezone", () => {
    // 골든 문자열(ICU 의존, Node v22 계열). 프로세스 TZ가 Asia/Seoul이어도
    // UTC 고정이라 KST(07:55 AM)가 아니라 UTC(10:55 PM)로 나온다 — 타임존
    // 돌연변이(옵션 제거)는 여기서 사멸한다.
    assert.equal(
      formatDateTime("2026-07-30T22:55:46Z"),
      "Jul 30, 2026, 10:55 PM",
    );
  });

  it("renders date-only in UTC regardless of process timezone", () => {
    assert.equal(formatDate("2026-09-27T00:00:00Z"), "Sep 27, 2026");
  });

  it("locks both formatters to timeZone UTC", () => {
    assert.equal(DATE_FORMATTER.resolvedOptions().timeZone, "UTC");
    assert.equal(DATE_TIME_FORMATTER.resolvedOptions().timeZone, "UTC");
  });

  it("locks both formatters to locale exactly en", () => {
    // startsWith가 아니라 완전 일치 — 로케일 인자를 지운 구현은 en 계열 CI에서
    // "en-US"로 해석되는데 고정 옵션에서 출력이 "en"과 같아 골든으로는 못 잡는다.
    assert.equal(DATE_FORMATTER.resolvedOptions().locale, "en");
    assert.equal(DATE_TIME_FORMATTER.resolvedOptions().locale, "en");
  });
});
