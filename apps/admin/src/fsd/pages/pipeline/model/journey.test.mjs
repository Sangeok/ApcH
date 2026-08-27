import assert from "node:assert/strict";
import { describe, it } from "node:test";

// journey.ts는 임포트가 없어(board.ts와 동종) mock.module 없이 직접 import한다.
import { deriveJourney } from "./journey.ts";

const CATALOG_LABELS = [
  "선정",
  "게이트①",
  "계획서",
  "검증",
  "게이트②",
  "구현",
  "인수",
];
const CATALOG_ACTORS = [
  "pm",
  "user",
  "agent",
  "verifier",
  "user",
  "agent",
  "loop",
];

// 진행 중 넷 + 검토대기 이분 = 매핑되는 다섯 경우. [status, validation, 기대 currentIndex]
const PROGRESS_CASES = [
  ["승인대기", null, 1],
  ["계획지시", null, 2],
  ["검토대기", null, 3],
  ["검토대기", "클린 패스 (2026-08-27, 무편집 1라운드)", 4],
  ["구현승인", null, 5],
];

describe("deriveJourney — 전 status 매핑", () => {
  it("승인대기 → 게이트①(1), user 당신 차례, 다음 계획서", () => {
    const v = deriveJourney("승인대기", null);
    assert.equal(v.currentIndex, 1);
    assert.equal(v.currentLabel, "게이트①");
    assert.equal(v.waitingActor, "user");
    assert.equal(v.waitingLabel, "당신 차례");
    assert.equal(v.nextLabel, "계획서");
    assert.equal(v.stages[0].state, "done");
    assert.equal(v.stages[1].state, "current");
    for (let i = 2; i <= 6; i++) assert.equal(v.stages[i].state, "upcoming");
  });

  it("계획지시 → 계획서(2), agent 작업 중, 다음 검증", () => {
    const v = deriveJourney("계획지시", null);
    assert.equal(v.currentIndex, 2);
    assert.equal(v.currentLabel, "계획서");
    assert.equal(v.waitingActor, "agent");
    assert.equal(v.waitingLabel, "작업 중");
    assert.equal(v.nextLabel, "검증");
    assert.deepEqual(
      v.stages.map((s) => s.state),
      ["done", "done", "current", "upcoming", "upcoming", "upcoming", "upcoming"],
    );
  });

  it("검토대기(판정 없음) → 검증(3), verifier 검증 중, 다음 게이트②", () => {
    const v = deriveJourney("검토대기", null);
    assert.equal(v.currentIndex, 3);
    assert.equal(v.currentLabel, "검증");
    assert.equal(v.waitingActor, "verifier");
    assert.equal(v.waitingLabel, "검증 중");
    assert.equal(v.nextLabel, "게이트②");
    assert.deepEqual(
      v.stages.map((s) => s.state),
      ["done", "done", "done", "current", "upcoming", "upcoming", "upcoming"],
    );
  });

  it("구현승인 → 구현(5), agent 작업 중, 다음 인수", () => {
    const v = deriveJourney("구현승인", null);
    assert.equal(v.currentIndex, 5);
    assert.equal(v.currentLabel, "구현");
    assert.equal(v.waitingActor, "agent");
    assert.equal(v.waitingLabel, "작업 중");
    assert.equal(v.nextLabel, "인수");
    assert.deepEqual(
      v.stages.map((s) => s.state),
      ["done", "done", "done", "done", "done", "current", "upcoming"],
    );
  });

  it("완료·보류·null·미지 status → 모두 null(여정 밖·미렌더)", () => {
    // 완료를 build(5)로, 보류를 어느 단계로 매핑하는 오구현을 잡는다.
    assert.equal(deriveJourney("완료", null), null);
    assert.equal(deriveJourney("보류", null), null);
    assert.equal(deriveJourney(null, null), null);
    assert.equal(deriveJourney("검증완료", null), null);
  });
});

describe("deriveJourney — 검토대기 이분(검증 판정으로 갈린다)", () => {
  it("판정 없으면 검증(3), 있으면 게이트②(4)", () => {
    // 두 단언이 함께 있어야 "항상 3" / "항상 4" 오구현이 둘 다 사멸한다.
    assert.equal(deriveJourney("검토대기", null).currentIndex, 3);
    assert.equal(
      deriveJourney("검토대기", "클린 패스 (2026-08-27, 무편집 1라운드)")
        .currentIndex,
      4,
    );
  });

  it("판정은 내용이 아니라 존재다 — 다른 비-null 문자열도 게이트②(4)", () => {
    // 검증 값 내용을 파싱하는 오구현을 잡는다(FEAT-13 계약 계승 — "존재=통과").
    assert.equal(deriveJourney("검토대기", "x").currentIndex, 4);
  });
});

describe("deriveJourney — state 부여 불변식(off-by-one 방어)", () => {
  for (const [status, validation, expectedIndex] of PROGRESS_CASES) {
    it(`${status}/${validation ?? "null"}: 길이 7·current 1개·앞 done·뒤 upcoming·waitingActor 일치`, () => {
      const v = deriveJourney(status, validation);
      assert.equal(v.stages.length, 7);
      assert.equal(v.currentIndex, expectedIndex);

      const currents = v.stages.filter((s) => s.state === "current");
      assert.equal(currents.length, 1); // 정확히 1개
      assert.equal(v.stages[expectedIndex].state, "current");

      for (let i = 0; i < 7; i++) {
        const expected =
          i < expectedIndex ? "done" : i === expectedIndex ? "current" : "upcoming";
        assert.equal(v.stages[i].state, expected);
      }
      assert.equal(v.waitingActor, v.stages[v.currentIndex].actor);
    });
  }
});

describe("deriveJourney — 단계 카탈로그 고정", () => {
  it("label·actor 시퀀스가 결재선 순서로 고정", () => {
    // 단계 순서·주체를 바꾸는 오구현(예 게이트②를 agent로)을 잡는다 —
    // "게이트=사용자" 색 매핑의 근원이라 고정한다.
    const v = deriveJourney("승인대기", null);
    assert.deepEqual(
      v.stages.map((s) => s.label),
      CATALOG_LABELS,
    );
    assert.deepEqual(
      v.stages.map((s) => s.actor),
      CATALOG_ACTORS,
    );
  });
});

describe("deriveJourney — 다음 라벨", () => {
  it("nextLabel = stages[currentIndex+1].label (진행 중 넷은 next가 항상 존재)", () => {
    // 모델 총체성상 마지막 단계(인수)가 현재가 되는 status는 없어 진행 중 넷은
    // next가 항상 있다. 매핑은 그 경우 nextLabel: null을 내는 계약이다(마지막 단계).
    for (const [status, validation, expectedIndex] of PROGRESS_CASES) {
      const v = deriveJourney(status, validation);
      assert.equal(v.nextLabel, v.stages[expectedIndex + 1].label);
      assert.notEqual(v.nextLabel, null);
    }
  });
});

describe("deriveJourney — 대기 낱말 매핑", () => {
  it("user→당신 차례, verifier→검증 중, agent→작업 중", () => {
    // "누구를 기다리는지"의 화면 문구를 고정한다.
    assert.equal(deriveJourney("승인대기", null).waitingLabel, "당신 차례");
    assert.equal(deriveJourney("검토대기", null).waitingLabel, "검증 중");
    assert.equal(deriveJourney("계획지시", null).waitingLabel, "작업 중");
  });
});
