import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { identityFor, initialOf } from "./agents.ts";
import { parseBoard } from "./board.ts";
import { buildBriefing, daysOnBoard, firstSentence } from "./briefing.ts";

// 실제 PROJECT_BOARD.md 형식을 축약한 대표 문자열:
// - 상단 `>` 안내 블록
// - 결재함(승인대기·검토대기) / 보고(계획지시·구현승인·완료·보류) 각 상태
// - 같은 ID(FEAT-02)가 최신 섹션엔 완료, 옛 섹션엔 승인대기로 두 번 등장(이력 dedupe)
const BOARD = `# PROJECT_BOARD

> PM 에이전트가 오늘 처리할 항목을 여기에 기록한다.
> - [ ] 이건 인용문 안이라 항목이 아니다: FAKE-99

## 2026-08-14
- [ ] FEAT-05: 새 기능 선정
  agent: web-dev
  area: apps/web
  status: 승인대기
  근거: pm이 오늘 고른 항목.
- [ ] FEAT-04: 파이프라인 개편
  agent: admin-dev
  area: apps/admin
  status: 검토대기
  근거: 계획을 올렸다.
  결과: 계획서 초안 완료.
- [ ] FEAT-06: 계획 단계 항목
  agent: admin-dev
  area: apps/admin
  status: 계획지시
  근거: 계획을 지시받음.
- [ ] FEAT-07: 구현 단계 항목
  agent: web-dev
  area: apps/web
  status: 구현승인
  근거: 구현을 승인받음.
- [x] BUG-06: 완료된 버그
  agent: web-dev
  area: apps/web
  status: 완료
  근거: 정합성 결함.
  결과: pricingFaq 두 답변을 교체했다. 수정: apps/web/src/fsd/pages/pricing/config/index.ts.
- [ ] BUG-05: 보류된 버그
  agent: admin-dev
  area: apps/admin
  status: 보류
  근거: 계획대로 막힘.
  결과: 계획서가 코드와 어긋남. 구현하지 않고 멈춘다.
- [x] FEAT-02: 예전에 완료된 항목
  agent: web-dev
  area: apps/web
  status: 완료
  근거: 길이 기반 제안.
  결과: 순수 함수와 테스트를 추가했다.

## 2026-08-06
- [ ] FEAT-02: 같은 ID의 옛 승인대기 이력
  agent: web-dev
  area: apps/web
  status: 승인대기
  근거: 이건 이력 행이라 무시돼야 한다.

## 2026-08-03
- [ ] FEAT-01: Credit System 마무리
  agent: web-dev
  area: apps/web
  status: 승인대기
  근거: 결제 흐름의 기반.
`;

const TODAY = new Date("2026-08-15T00:00:00Z");

describe("daysOnBoard", () => {
  it("counts UTC day difference from section date", () => {
    assert.equal(daysOnBoard("2026-08-15", TODAY), 0); // 같은 날
    assert.equal(daysOnBoard("2026-08-14", TODAY), 1); // +1일
    assert.equal(daysOnBoard("2026-08-01", TODAY), 14); // 여러 날
  });

  it("clamps future section dates to 0", () => {
    assert.equal(daysOnBoard("2026-09-01", TODAY), 0);
  });

  it("returns null for non-date headings", () => {
    assert.equal(daysOnBoard("파이프라인 구조", TODAY), null);
    assert.equal(daysOnBoard("2026-8-1", TODAY), null); // 형식 불일치
  });
});

describe("firstSentence", () => {
  it("cuts at the first terminator followed by space or end", () => {
    assert.equal(
      firstSentence("계획서가 코드와 어긋남. 구현하지 않고 멈춘다."),
      "계획서가 코드와 어긋남.",
    );
    assert.equal(firstSentence("정말요? 네."), "정말요?");
    assert.equal(firstSentence("완료! 다음."), "완료!");
  });

  it("ignores a period inside a token like board.ts", () => {
    assert.equal(firstSentence("board.ts는 순수 파서다."), "board.ts는 순수 파서다.");
  });

  it("returns the whole string when there is no terminator", () => {
    assert.equal(firstSentence("종결부호 없는 문자열"), "종결부호 없는 문자열");
  });

  it("returns empty string for empty input", () => {
    assert.equal(firstSentence(""), "");
    assert.equal(firstSentence("   "), "");
  });
});

describe("buildBriefing", () => {
  const briefing = buildBriefing(parseBoard(BOARD), TODAY);

  it("puts only 승인대기·검토대기 in the inbox, in board order", () => {
    assert.deepEqual(
      briefing.inbox.map((s) => s.id),
      ["FEAT-05", "FEAT-04", "FEAT-01"],
    );
    assert.equal(briefing.pendingCount, briefing.inbox.length);
    assert.equal(briefing.pendingCount, 3);
  });

  it("puts the complement in the feed, preserving order", () => {
    assert.deepEqual(
      briefing.feed.map((s) => s.id),
      ["FEAT-06", "FEAT-07", "BUG-06", "BUG-05", "FEAT-02"],
    );
  });

  it("keeps only the latest row when an ID repeats across sections", () => {
    // FEAT-02는 최신 섹션에서 완료, 옛 섹션에서 승인대기다. 완료만 반영돼야 한다.
    const feat02 = briefing.feed.filter((s) => s.id === "FEAT-02");
    assert.equal(feat02.length, 1);
    assert.equal(feat02[0].status, "완료");
    // 결재함에도, pm 결재 요청 건수에도 옛 승인대기 행이 끼지 않는다.
    assert.ok(!briefing.inbox.some((s) => s.id === "FEAT-02"));
    const pm = briefing.team.find((m) => m.identity.id === "pm");
    assert.equal(pm.state, "2건 결재 요청 중"); // FEAT-05, FEAT-01만
    assert.equal(pm.heldId, null); // pm은 항목을 들지 않는다
  });

  it("voices inbox items: pm for 승인대기, item agent for 검토대기, with 일째 tag", () => {
    const [feat05, feat04, feat01] = briefing.inbox;

    assert.equal(feat05.speaker.id, "pm");
    assert.equal(feat05.line, "FEAT-05, 2일째 계획 지시를 기다립니다.");
    assert.equal(feat05.detail, "pm이 오늘 고른 항목.");
    assert.equal(feat05.tone, "pending");

    assert.equal(feat04.speaker.id, "admin-dev");
    assert.equal(
      feat04.line,
      "FEAT-04 계획서를 올렸습니다 — 2일째 검토 대기 중입니다.",
    );
    assert.equal(feat04.detail, "계획서 초안 완료."); // 결과 우선

    assert.equal(feat01.speaker.id, "pm");
    assert.equal(feat01.line, "FEAT-01, 13일째 계획 지시를 기다립니다.");
  });

  it("voices feed items by status with deterministic lines and tones", () => {
    const byId = new Map(briefing.feed.map((s) => [s.id, s]));

    assert.equal(byId.get("FEAT-06").line, "FEAT-06 계획을 작성하고 있습니다.");
    assert.equal(byId.get("FEAT-06").tone, "active");
    assert.equal(byId.get("FEAT-06").detail, "계획을 지시받음."); // 근거

    assert.equal(byId.get("FEAT-07").line, "FEAT-07 구현에 착수했습니다.");
    assert.equal(byId.get("FEAT-07").tone, "active");

    // 완료: firstSentence(결과)
    assert.equal(byId.get("BUG-06").line, "pricingFaq 두 답변을 교체했다.");
    assert.equal(byId.get("BUG-06").tone, "done");
    assert.equal(
      byId.get("BUG-06").detail,
      "pricingFaq 두 답변을 교체했다. 수정: apps/web/src/fsd/pages/pricing/config/index.ts.",
    );

    // 보류: firstSentence(결과)
    assert.equal(byId.get("BUG-05").line, "계획서가 코드와 어긋남.");
    assert.equal(byId.get("BUG-05").tone, "hold");
  });

  it("derives team roster in fixed order with state per agent", () => {
    assert.deepEqual(
      briefing.team.map((m) => m.identity.id),
      ["pm", "admin-dev", "web-dev", "doc-auditor", "feature-scout"],
    );

    const byId = new Map(briefing.team.map((m) => [m.identity.id, m]));
    assert.equal(byId.get("pm").state, "2건 결재 요청 중");
    assert.equal(byId.get("pm").heldId, null);
    assert.equal(byId.get("pm").tone, "pending");
    // admin-dev: 검토대기(FEAT-04)가 최우선 — ID는 heldId로 분리, state는 짧아진다
    assert.equal(byId.get("admin-dev").state, "검토 요청 중");
    assert.equal(byId.get("admin-dev").heldId, "FEAT-04");
    assert.equal(byId.get("admin-dev").tone, "pending");
    // web-dev: 검토대기 없음 → 작업 중(구현승인 FEAT-07)
    assert.equal(byId.get("web-dev").state, "작업 중");
    assert.equal(byId.get("web-dev").heldId, "FEAT-07");
    assert.equal(byId.get("web-dev").tone, "active");
    // 항목 없는 감사·스카우트 → 대기 중, 든 항목 없음
    assert.equal(byId.get("doc-auditor").state, "대기 중");
    assert.equal(byId.get("doc-auditor").heldId, null);
    assert.equal(byId.get("doc-auditor").tone, "muted");
    assert.equal(byId.get("feature-scout").state, "대기 중");
    assert.equal(byId.get("feature-scout").heldId, null);
  });

  it("formats today as M월 D일", () => {
    assert.equal(briefing.today, "8월 15일");
  });
});

describe("identityFor / initialOf", () => {
  it("returns roster identity for known ids", () => {
    assert.deepEqual(identityFor("pm"), {
      id: "pm",
      handle: "PM",
      role: "선정·발주",
      emoji: "📋",
    });
    assert.equal(identityFor("admin-dev").emoji, "🛠️");
  });

  it("falls back to the raw handle with empty emoji for unknown ids", () => {
    assert.deepEqual(identityFor("scout-x"), {
      id: "scout-x",
      handle: "scout-x",
      role: "에이전트",
      emoji: "",
    });
  });

  it("returns the system identity for null", () => {
    assert.deepEqual(identityFor(null), {
      id: "system",
      handle: "시스템",
      role: "미지정",
      emoji: "•",
    });
  });

  it("initials uppercase the first char, falling back to ? for blank handles", () => {
    assert.equal(initialOf({ id: "x", handle: "web-dev", role: "", emoji: "" }), "W");
    assert.equal(initialOf({ id: "x", handle: "PM", role: "", emoji: "" }), "P");
    assert.equal(initialOf({ id: "x", handle: "   ", role: "", emoji: "" }), "?");
    assert.equal(initialOf({ id: "x", handle: "", role: "", emoji: "" }), "?");
  });
});
