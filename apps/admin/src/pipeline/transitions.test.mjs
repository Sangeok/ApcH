import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBoard } from "./board.ts";
import {
  applyGateTransition,
  gateCommitMessage,
  resolveGateTransition,
} from "./transitions.ts";

// 실제 PROJECT_BOARD.md 형식을 축약한 대표 문자열:
// - 상단 `>` 안내 블록(항목이 아니다)
// - 두 날짜 섹션 + 항목 없는 mermaid 섹션
// - 승인대기 / 검토대기(유니크) / 완료 / status 줄 없는 항목
// - 같은 ID(FEAT-08)가 두 섹션에 등장(최신 검토대기 / 이력 완료) — 다중 등장 테스트용
const BOARD = `# PROJECT_BOARD

> 안내 블록입니다. 여기 항목은 무시됩니다.
> - [ ] GHOST-00: 인용문 안 항목이라 파싱되지 않는다.

## 2026-08-16
- [ ] FEAT-08: 게이트 버튼 — 원격 게이트 개방
  agent: admin-dev
  area: apps/admin
  status: 검토대기
  근거: 사용자 직접 발주 — pm 경유 없음.
- [ ] FEAT-01: Credit System 마무리
  agent: web-dev
  area: apps/web
  status: 승인대기
  근거: 결제 흐름의 기반이 되는 항목.
- [ ] FEAT-05: 클립 검토 프리뷰
  agent: web-dev
  area: apps/web
  status: 검토대기
  근거: 실사용 관찰.
- [ ] FEAT-09: status 줄 없는 항목
  agent: admin-dev
  area: apps/admin
  근거: status 줄이 빠졌다.

## 2026-08-15
- [x] BUG-06: pricing FAQ 문구 모순
  agent: web-dev
  area: apps/web
  status: 완료
  근거: 정합성 결함이라 이를 고른다.
  결과: 답변 두 개를 교체했다.
- [x] FEAT-08: 게이트 버튼 (이전 이력 행)
  agent: admin-dev
  area: apps/admin
  status: 완료
  근거: 옛 이력 행.
  결과: 옛 결과.

## 파이프라인 구조

정적 구조도다.
`;

describe("resolveGateTransition — 전이 화이트리스트(보안 경계)", () => {
  it("승인대기 → 계획지시, 검토대기 → 구현승인", () => {
    assert.equal(resolveGateTransition("승인대기"), "계획지시");
    assert.equal(resolveGateTransition("검토대기"), "구현승인");
  });

  it("화이트리스트 밖 status는 전부 null (이미 전이된 것·완료·보류·임의값)", () => {
    for (const s of ["완료", "보류", "계획지시", "구현승인", "arbitrary", ""]) {
      assert.equal(resolveGateTransition(s), null);
    }
  });

  it("프로토타입 오염 키도 null (Object.hasOwn 멤버십 검사)", () => {
    for (const s of ["__proto__", "toString", "constructor", "hasOwnProperty"]) {
      assert.equal(resolveGateTransition(s), null);
    }
  });
});

describe("applyGateTransition — 해피패스 + 파서 왕복", () => {
  it("승인대기 항목 전이 후, 그 항목 status만 계획지시로 바뀌고 나머지는 파서상 동일", () => {
    const before = parseBoard(BOARD);
    const res = applyGateTransition(BOARD, "FEAT-01", "승인대기");
    assert.ok(res.ok);
    assert.equal(res.to, "계획지시");
    const after = parseBoard(res.markdown);

    assert.equal(after.length, before.length);
    for (let s = 0; s < before.length; s++) {
      assert.equal(after[s].heading, before[s].heading);
      assert.equal(after[s].items.length, before[s].items.length);
      for (let i = 0; i < before[s].items.length; i++) {
        const b = before[s].items[i];
        const a = after[s].items[i];
        if (b.id === "FEAT-01") {
          assert.equal(a.status, "계획지시");
          // status를 뺀 나머지 필드는 그대로여야 한다.
          assert.deepEqual({ ...a, status: null }, { ...b, status: null });
        } else {
          assert.deepEqual(a, b);
        }
      }
    }
  });

  it("검토대기 항목 전이 후, 그 항목 status만 구현승인으로 바뀐다", () => {
    const before = parseBoard(BOARD);
    const res = applyGateTransition(BOARD, "FEAT-05", "검토대기");
    assert.ok(res.ok);
    assert.equal(res.to, "구현승인");
    const after = parseBoard(res.markdown);

    for (let s = 0; s < before.length; s++) {
      for (let i = 0; i < before[s].items.length; i++) {
        const b = before[s].items[i];
        const a = after[s].items[i];
        if (b.id === "FEAT-05") {
          assert.equal(a.status, "구현승인");
          assert.deepEqual({ ...a, status: null }, { ...b, status: null });
        } else {
          assert.deepEqual(a, b);
        }
      }
    }
  });
});

describe("applyGateTransition — 최소 diff", () => {
  it("결과 markdown은 원본과 정확히 한 줄만 다르다(status 줄)", () => {
    const res = applyGateTransition(BOARD, "FEAT-01", "승인대기");
    assert.ok(res.ok);
    const beforeLines = BOARD.split("\n");
    const afterLines = res.markdown.split("\n");

    assert.equal(afterLines.length, beforeLines.length);
    const changed = [];
    for (let i = 0; i < beforeLines.length; i++) {
      if (beforeLines[i] !== afterLines[i]) changed.push(i);
    }
    assert.equal(changed.length, 1);
    assert.equal(beforeLines[changed[0]], "  status: 승인대기");
    assert.equal(afterLines[changed[0]], "  status: 계획지시");
  });
});

describe("applyGateTransition — 다중 등장 시 최신(위) 행만", () => {
  it("같은 ID가 두 섹션에 있으면 첫(최신) 행 status만 바꾸고 이력 행은 그대로", () => {
    const before = parseBoard(BOARD);
    const res = applyGateTransition(BOARD, "FEAT-08", "검토대기");
    assert.ok(res.ok);
    assert.equal(res.to, "구현승인");
    const after = parseBoard(res.markdown);

    // 최신(위) 행 = 2026-08-16 섹션의 FEAT-08: 검토대기 → 구현승인.
    const latestBefore = before[0].items.find((it) => it.id === "FEAT-08");
    const latestAfter = after[0].items.find((it) => it.id === "FEAT-08");
    assert.equal(latestBefore.status, "검토대기");
    assert.equal(latestAfter.status, "구현승인");

    // 이력(아래) 행 = 2026-08-15 섹션의 FEAT-08: 완료 그대로.
    const historyBefore = before[1].items.find((it) => it.id === "FEAT-08");
    const historyAfter = after[1].items.find((it) => it.id === "FEAT-08");
    assert.equal(historyBefore.status, "완료");
    assert.equal(historyAfter.status, "완료");

    // 최소 diff로 못박는다: 이력 행·다른 검토대기(FEAT-05) 포함 나머지는 손대지 않는다.
    const beforeLines = BOARD.split("\n");
    const afterLines = res.markdown.split("\n");
    assert.equal(afterLines.length, beforeLines.length);
    let changed = 0;
    for (let i = 0; i < beforeLines.length; i++) {
      if (beforeLines[i] !== afterLines[i]) changed++;
    }
    assert.equal(changed, 1);
  });
});

describe("applyGateTransition — 거부 사유(조용한 실패 금지)", () => {
  it("스테일: 화면이 읽은 status와 원격 현재값이 다르면 stale", () => {
    // FEAT-01의 실제 status는 승인대기지만 검토대기(화이트리스트엔 있음)를 기대값으로 넘긴다.
    const res = applyGateTransition(BOARD, "FEAT-01", "검토대기");
    assert.deepEqual(res, { ok: false, reason: "stale" });
  });

  it("미허용: 화이트리스트 밖 from status는 not-whitelisted", () => {
    const res = applyGateTransition(BOARD, "BUG-06", "완료");
    assert.deepEqual(res, { ok: false, reason: "not-whitelisted" });
  });

  it("미발견: 보드에 없는 ID는 not-found", () => {
    const res = applyGateTransition(BOARD, "NOPE-99", "승인대기");
    assert.deepEqual(res, { ok: false, reason: "not-found" });
  });

  it("형식: 항목 헤더는 있으나 status 줄이 없으면 format", () => {
    const res = applyGateTransition(BOARD, "FEAT-09", "승인대기");
    assert.deepEqual(res, { ok: false, reason: "format" });
  });
});

describe("gateCommitMessage — 대시보드 경유 표기", () => {
  it("계획지시·구현승인 각각의 어구", () => {
    assert.equal(
      gateCommitMessage("FEAT-08", "계획지시"),
      "docs(board): open FEAT-08 for planning via dashboard gate",
    );
    assert.equal(
      gateCommitMessage("FEAT-08", "구현승인"),
      "docs(board): approve FEAT-08 for implementation via dashboard gate",
    );
  });
});
