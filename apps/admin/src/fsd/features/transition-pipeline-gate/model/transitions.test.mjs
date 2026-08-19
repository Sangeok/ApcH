import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBoard } from "~/fsd/entities/pipeline";
import {
  applyBounceTransition,
  applyDiscard,
  applyGateTransition,
  applyHoldTransition,
  gateCommitMessage,
  gateNextActionHint,
  holdResultLine,
  rejectActionsFor,
  rejectCommitMessage,
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

// ── FEAT-09: 반려(거절) 경로 ──────────────────────────────────────────────

describe("rejectActionsFor — 반려 액션 화이트리스트(보안 경계)", () => {
  it("승인대기는 되돌리기 없이 보류·폐기만", () => {
    assert.deepEqual(rejectActionsFor("승인대기"), ["hold", "discard"]);
  });

  it("검토대기는 되돌리기·보류·폐기 셋 다", () => {
    assert.deepEqual(rejectActionsFor("검토대기"), [
      "bounce",
      "hold",
      "discard",
    ]);
  });

  it("화이트리스트 밖 status·프로토타입 오염 키는 전부 빈 배열", () => {
    for (const s of [
      "완료",
      "보류",
      "계획지시",
      "구현승인",
      "arbitrary",
      "",
      "__proto__",
    ]) {
      assert.deepEqual(rejectActionsFor(s), []);
    }
  });
});

describe("applyBounceTransition — 되돌리기(검토대기 → 계획지시)", () => {
  it("해피패스 + 파서 왕복: 그 항목 status만 계획지시로, 나머지 동일", () => {
    const before = parseBoard(BOARD);
    const res = applyBounceTransition(BOARD, "FEAT-05", "검토대기");
    assert.ok(res.ok);
    assert.equal(res.to, "계획지시");
    const after = parseBoard(res.markdown);

    for (let s = 0; s < before.length; s++) {
      for (let i = 0; i < before[s].items.length; i++) {
        const b = before[s].items[i];
        const a = after[s].items[i];
        if (b.id === "FEAT-05") {
          assert.equal(a.status, "계획지시");
          assert.deepEqual({ ...a, status: null }, { ...b, status: null });
        } else {
          assert.deepEqual(a, b);
        }
      }
    }
  });

  it("최소 diff: status 한 줄만 바뀐다", () => {
    const res = applyBounceTransition(BOARD, "FEAT-05", "검토대기");
    assert.ok(res.ok);
    const beforeLines = BOARD.split("\n");
    const afterLines = res.markdown.split("\n");
    assert.equal(afterLines.length, beforeLines.length);
    const changed = [];
    for (let i = 0; i < beforeLines.length; i++) {
      if (beforeLines[i] !== afterLines[i]) changed.push(i);
    }
    assert.equal(changed.length, 1);
    assert.equal(beforeLines[changed[0]], "  status: 검토대기");
    assert.equal(afterLines[changed[0]], "  status: 계획지시");
  });

  it("거부: 승인대기에서 bounce는 not-whitelisted(bounce는 검토대기만)", () => {
    const res = applyBounceTransition(BOARD, "FEAT-01", "승인대기");
    assert.deepEqual(res, { ok: false, reason: "not-whitelisted" });
  });

  it("거부: 스테일(값 불일치) → stale", () => {
    // FEAT-01의 실제 status는 승인대기지만 검토대기(bounce 화이트리스트엔 있음)를 넘긴다.
    const res = applyBounceTransition(BOARD, "FEAT-01", "검토대기");
    assert.deepEqual(res, { ok: false, reason: "stale" });
  });

  it("거부: 미발견 → not-found", () => {
    const res = applyBounceTransition(BOARD, "NOPE-99", "검토대기");
    assert.deepEqual(res, { ok: false, reason: "not-found" });
  });

  it("거부: status 줄 없음 → format", () => {
    const res = applyBounceTransition(BOARD, "FEAT-09", "검토대기");
    assert.deepEqual(res, { ok: false, reason: "format" });
  });

  it("검증 줄이 있는 항목을 bounce하면 status 교체 + 검증 줄 제거", () => {
    // 되돌리기 = 계획 재작성. 옛 검증 판정이 남으면 재작성된 계획서에 거짓 「검증 통과」가
    // 붙는다(FEAT-13). BOARD의 검토대기 FEAT-05 블록에 검증 줄을 더해 만든다.
    const withValidation = BOARD.replace(
      "  status: 검토대기\n  근거: 실사용 관찰.",
      "  status: 검토대기\n  근거: 실사용 관찰.\n  검증: 클린 패스 (2026-08-16, 무편집 2라운드)",
    );
    const res = applyBounceTransition(withValidation, "FEAT-05", "검토대기");
    assert.ok(res.ok);
    assert.equal(res.to, "계획지시");

    // 파서상 status는 계획지시가 되고 검증 판정은 사라진다(null).
    const feat05 = parseBoard(res.markdown)
      .flatMap((s) => s.items)
      .find((it) => it.id === "FEAT-05");
    assert.equal(feat05.status, "계획지시");
    assert.equal(feat05.validation, null);

    // 변경 줄 = status 1줄 값 교체 + 검증 1줄 제거 → 전체 줄 수 -1, 검증 줄 잔존 0.
    const beforeLines = withValidation.split("\n");
    const afterLines = res.markdown.split("\n");
    assert.equal(afterLines.length, beforeLines.length - 1);
    assert.ok(!afterLines.some((l) => l.includes("검증:")));
    assert.ok(afterLines.includes("  status: 계획지시"));
  });

  it("검증 줄이 2개면 bounce가 둘 다 지운다 (g 플래그 고정)", () => {
    // 규약 위반으로 검증 줄이 둘 남은 항목(보류 재개 시 청소를 잊고 재검증). 비전역 제거는
    // 첫 줄만 지워 옛 판정이 살아남으므로, 둘 다 사라지는지가 g 플래그를 고정한다.
    const withTwo = BOARD.replace(
      "  status: 검토대기\n  근거: 실사용 관찰.",
      "  status: 검토대기\n  근거: 실사용 관찰.\n  검증: 클린 패스 (첫째).\n  검증: 클린 패스 (둘째).",
    );
    const res = applyBounceTransition(withTwo, "FEAT-05", "검토대기");
    assert.ok(res.ok);

    const afterLines = res.markdown.split("\n");
    assert.equal(afterLines.length, withTwo.split("\n").length - 2);
    assert.ok(!afterLines.some((l) => l.includes("검증:")));
    const feat05 = parseBoard(res.markdown)
      .flatMap((s) => s.items)
      .find((it) => it.id === "FEAT-05");
    assert.equal(feat05.status, "계획지시");
    assert.equal(feat05.validation, null);
  });
});

describe("applyHoldTransition — 보류(승인대기·검토대기 → 보류) + 결과 줄 기록", () => {
  it("승인대기 해피패스 + 파서 왕복: status 보류 + result 일치, 다른 항목 동일", () => {
    const before = parseBoard(BOARD);
    const res = applyHoldTransition(BOARD, "FEAT-01", "승인대기", "보류 사유 A");
    assert.ok(res.ok);
    assert.equal(res.to, "보류");
    const after = parseBoard(res.markdown);

    for (let s = 0; s < before.length; s++) {
      for (let i = 0; i < before[s].items.length; i++) {
        const b = before[s].items[i];
        const a = after[s].items[i];
        if (b.id === "FEAT-01") {
          assert.equal(a.status, "보류");
          assert.equal(a.result, "보류 사유 A");
        } else {
          assert.deepEqual(a, b);
        }
      }
    }
  });

  it("검토대기 해피패스 + 최소 diff: 결과 줄이 근거 바로 뒤 같은 들여쓰기로 삽입(줄 수 +1)", () => {
    const before = parseBoard(BOARD);
    const res = applyHoldTransition(BOARD, "FEAT-05", "검토대기", "보류 사유 B");
    assert.ok(res.ok);
    const beforeLines = BOARD.split("\n");
    const afterLines = res.markdown.split("\n");
    assert.equal(afterLines.length, beforeLines.length + 1);

    // 결과 줄이 FEAT-05의 근거 줄 바로 다음, 같은 들여쓰기로 삽입됐다.
    const reasonIdx = afterLines.indexOf("  근거: 실사용 관찰.");
    assert.ok(reasonIdx >= 0);
    assert.equal(afterLines[reasonIdx + 1], "  결과: 보류 사유 B");

    // 그 항목만 바뀌고 나머지는 파서상 동일(최소 diff).
    const after = parseBoard(res.markdown);
    for (let s = 0; s < before.length; s++) {
      for (let i = 0; i < before[s].items.length; i++) {
        const b = before[s].items[i];
        const a = after[s].items[i];
        if (b.id === "FEAT-05") {
          assert.equal(a.status, "보류");
          assert.equal(a.result, "보류 사유 B");
        } else {
          assert.deepEqual(a, b);
        }
      }
    }
  });

  it("리터럴 삽입: resultText의 `$`가 정규식 치환 특수문자로 해석되지 않는다", () => {
    const res = applyHoldTransition(BOARD, "FEAT-05", "검토대기", "a$1b");
    assert.ok(res.ok);
    const after = parseBoard(res.markdown);
    const feat05 = after
      .flatMap((s) => s.items)
      .find((it) => it.id === "FEAT-05");
    assert.equal(feat05.result, "a$1b");
  });

  it("재보류(옛 결과 줄 존재): 삽입이 아니라 교체 — 줄 수 +0, 파서가 새 사유", () => {
    // 검토대기 항목이 이미 `결과:` 줄을 가진 상태(보류 재개 후 재보류).
    // 실제 보드의 검토대기 FEAT-09 행이 이 형태다. BOARD의 FEAT-05 블록에 결과 줄을 더해 만든다.
    const reheldInput = BOARD.replace(
      "  status: 검토대기\n  근거: 실사용 관찰.",
      "  status: 검토대기\n  근거: 실사용 관찰.\n  결과: 옛 사유(재개 전).",
    );
    const beforeLineCount = reheldInput.split("\n").length;
    const res = applyHoldTransition(
      reheldInput,
      "FEAT-05",
      "검토대기",
      "새 보류 사유",
    );
    assert.ok(res.ok);
    // 줄 수 +0 — 삽입이 아니라 교체.
    assert.equal(res.markdown.split("\n").length, beforeLineCount);
    // 파서가 옛 사유가 아니라 새 사유를 읽는다.
    const after = parseBoard(res.markdown);
    const feat05 = after
      .flatMap((s) => s.items)
      .find((it) => it.id === "FEAT-05");
    assert.equal(feat05.status, "보류");
    assert.equal(feat05.result, "새 보류 사유");
  });

  it("거부: 완료에서 hold → not-whitelisted", () => {
    const res = applyHoldTransition(BOARD, "BUG-06", "완료", "x");
    assert.deepEqual(res, { ok: false, reason: "not-whitelisted" });
  });

  it("거부: 스테일 → stale", () => {
    const res = applyHoldTransition(BOARD, "FEAT-01", "검토대기", "x");
    assert.deepEqual(res, { ok: false, reason: "stale" });
  });

  it("거부: 미발견 → not-found", () => {
    const res = applyHoldTransition(BOARD, "NOPE-99", "승인대기", "x");
    assert.deepEqual(res, { ok: false, reason: "not-found" });
  });

  it("거부: status 줄 없음 → format", () => {
    const res = applyHoldTransition(BOARD, "FEAT-09", "승인대기", "x");
    assert.deepEqual(res, { ok: false, reason: "format" });
  });
});

describe("applyDiscard — 폐기(항목 블록 통째 제거)", () => {
  it("승인대기 항목 제거 + 파서 왕복: 그 항목만 사라지고 나머지 동일", () => {
    const before = parseBoard(BOARD);
    const res = applyDiscard(BOARD, "FEAT-01", "승인대기");
    assert.ok(res.ok);
    const after = parseBoard(res.markdown);

    assert.equal(after.length, before.length);
    const beforeItems = before
      .flatMap((s) => s.items)
      .filter((it) => it.id !== "FEAT-01");
    const afterItems = after.flatMap((s) => s.items);
    assert.deepEqual(afterItems, beforeItems);
  });

  it("검토대기 항목도 제거된다", () => {
    const res = applyDiscard(BOARD, "FEAT-05", "검토대기");
    assert.ok(res.ok);
    const after = parseBoard(res.markdown);
    assert.ok(
      !after.flatMap((s) => s.items).some((it) => it.id === "FEAT-05"),
    );
  });

  it("최소 diff(행 제거): 원본에서 그 항목 블록 줄들만 정확히 빠진다", () => {
    const res = applyDiscard(BOARD, "FEAT-01", "승인대기");
    assert.ok(res.ok);
    const beforeLines = BOARD.split("\n");
    const start = beforeLines.indexOf("- [ ] FEAT-01: Credit System 마무리");
    assert.ok(start >= 0);
    const expected = [...beforeLines];
    expected.splice(start, 5); // 헤더 + agent·area·status·근거 4줄
    assert.deepEqual(res.markdown.split("\n"), expected);
  });

  it("다중 등장: 최신(위) 행만 제거하고 이력 행은 그대로", () => {
    const res = applyDiscard(BOARD, "FEAT-08", "검토대기");
    assert.ok(res.ok);
    const after = parseBoard(res.markdown);

    // FEAT-08은 이제 이력(완료) 한 번만 남는다.
    const remaining = after
      .flatMap((s) => s.items)
      .filter((it) => it.id === "FEAT-08");
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].status, "완료");

    // 최소 diff: 최신 FEAT-08 블록 5줄만 빠진다.
    const beforeLines = BOARD.split("\n");
    const start = beforeLines.indexOf("- [ ] FEAT-08: 게이트 버튼 — 원격 게이트 개방");
    assert.ok(start >= 0);
    const expected = [...beforeLines];
    expected.splice(start, 5);
    assert.deepEqual(res.markdown.split("\n"), expected);
  });

  it("거부: 완료에서 discard → not-whitelisted", () => {
    const res = applyDiscard(BOARD, "BUG-06", "완료");
    assert.deepEqual(res, { ok: false, reason: "not-whitelisted" });
  });

  it("거부: 스테일 → stale", () => {
    const res = applyDiscard(BOARD, "FEAT-01", "검토대기");
    assert.deepEqual(res, { ok: false, reason: "stale" });
  });

  it("거부: 미발견 → not-found", () => {
    const res = applyDiscard(BOARD, "NOPE-99", "승인대기");
    assert.deepEqual(res, { ok: false, reason: "not-found" });
  });
});

describe("holdResultLine — 고정 날짜 보류 문구", () => {
  it("UTC 날짜로 FEAT-01 형태 문구를 만든다", () => {
    assert.equal(
      holdResultLine(new Date(Date.UTC(2026, 7, 16))),
      "사용자 결정(2026-08-16) — 대시보드에서 보류. 폐기가 아니라 대기이며 TASK_BACKLOG.md에 남는다. 재개하려면 이 행을 계획지시 또는 구현승인으로 되돌린다.",
    );
  });
});

describe("rejectCommitMessage — 대시보드 경유 표기", () => {
  it("bounce·hold·discard 각각의 어구", () => {
    assert.equal(
      rejectCommitMessage("bounce", "FEAT-09"),
      "docs(board): bounce FEAT-09 back to planning via dashboard gate",
    );
    assert.equal(
      rejectCommitMessage("hold", "FEAT-09"),
      "docs(board): hold FEAT-09 via dashboard gate",
    );
    assert.equal(
      rejectCommitMessage("discard", "FEAT-09"),
      "docs(board): discard FEAT-09 via dashboard gate",
    );
  });
});

// ── FEAT-10: 도장 직후 다음 손잡이 안내(gate 소유 문구) ─────────────────────
describe("gateNextActionHint — 도장 성공 토스트에 잇는 안내", () => {
  it("계획지시·구현승인은 산출물을 이름으로 가리킨다(반영 지연 카피 포함)", () => {
    assert.equal(
      gateNextActionHint("계획지시"),
      "보드에 반영되면 파이프라인 실행을 눌러 계획서를 받으세요.",
    );
    assert.equal(
      gateNextActionHint("구현승인"),
      "보드에 반영되면 파이프라인 실행을 눌러 구현을 받으세요.",
    );
  });

  it("여집합(완료·임의값·프로토타입 오염 키)은 일반 안내로 물러난다", () => {
    for (const to of ["완료", "arbitrary", "__proto__", "toString"]) {
      assert.equal(
        gateNextActionHint(to),
        "보드에 반영되면 파이프라인 실행을 눌러 다음 단계를 진행하세요.",
      );
    }
  });
});
