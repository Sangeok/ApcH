import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { describePipelineRun } from "./run-plan.ts";

// describePipelineRun은 status·id만 읽으므로 BoardItem을 최소 객체로 인라인 구성한다.
function item(id, status) {
  return { id, status };
}

const NO_ACTIONABLE_DESC = "지금 파이프라인이 진행할 항목이 없습니다.";
const GATE_WAITING_DESC =
  "결재함 항목에 도장을 찍으면 실행할 작업이 생깁니다. 방금 찍었다면 보드 반영까지 최대 5분 걸립니다.";

describe("describePipelineRun — 동적 라벨", () => {
  it("빈 배열 → 비활성, 진행할 작업 없음", () => {
    assert.deepEqual(describePipelineRun([]), {
      enabled: false,
      label: "진행할 작업 없음",
      description: NO_ACTIONABLE_DESC,
    });
  });

  it("완료·보류만 → 비활성(게이트 대기 아님)", () => {
    assert.deepEqual(
      describePipelineRun([item("FEAT-01", "완료"), item("BUG-02", "보류")]),
      {
        enabled: false,
        label: "진행할 작업 없음",
        description: NO_ACTIONABLE_DESC,
      },
    );
  });

  // 승인대기만 / 검토대기만은 각각 단언한다 — 한 케이스로 묶으면 GATE_WAITING에서
  // 한쪽이 빠져도 나머지 하나가 플래그를 세워 통과한다(돌연변이 검사 실측).
  it("승인대기만 → 비활성 + 도장 안내(반영 지연 포함)", () => {
    assert.deepEqual(describePipelineRun([item("FEAT-01", "승인대기")]), {
      enabled: false,
      label: "진행할 작업 없음",
      description: GATE_WAITING_DESC,
    });
  });

  it("검토대기만 → 비활성 + 도장 안내(이 계획서를 쓰는 시점의 실제 보드 상태)", () => {
    assert.deepEqual(describePipelineRun([item("FEAT-10", "검토대기")]), {
      enabled: false,
      label: "진행할 작업 없음",
      description: GATE_WAITING_DESC,
    });
  });

  it("계획지시 1건 → 활성, 계획서 작성 라벨", () => {
    assert.deepEqual(describePipelineRun([item("FEAT-09", "계획지시")]), {
      enabled: true,
      label: "FEAT-09 계획서 작성",
      description: "실행하면 FEAT-09 계획서 작성 작업을 진행합니다.",
    });
  });

  it("구현승인 1건 → 활성, 구현 라벨", () => {
    assert.deepEqual(describePipelineRun([item("FEAT-09", "구현승인")]), {
      enabled: true,
      label: "FEAT-09 구현",
      description: "실행하면 FEAT-09 구현 작업을 진행합니다.",
    });
  });

  it("복수(계획지시+구현승인, 보드 순서) → 외 N건 라벨 + 전체 나열", () => {
    assert.deepEqual(
      describePipelineRun([
        item("FEAT-06", "계획지시"),
        item("FEAT-07", "구현승인"),
      ]),
      {
        enabled: true,
        label: "FEAT-06 계획서 작성 외 1건",
        description:
          "실행하면 FEAT-06 계획서 작성, FEAT-07 구현 작업을 진행합니다.",
      },
    );
  });

  it("status:null·미지 status·프로토타입 오염 키는 무시된다(라벨에 undefined 안 샘)", () => {
    // 오염 키를 actionable 앞에 두어, 인덱스 접근 오구현이면 head가 "X-3 undefined"가 되게.
    assert.deepEqual(
      describePipelineRun([
        item("X-1", null),
        item("X-2", "미지의상태"),
        item("X-3", "__proto__"),
        item("X-4", "toString"),
        item("FEAT-06", "계획지시"),
      ]),
      {
        enabled: true,
        label: "FEAT-06 계획서 작성",
        description: "실행하면 FEAT-06 계획서 작성 작업을 진행합니다.",
      },
    );
  });

  it("프로토타입 오염 키만 있으면 비활성(게이트 대기도 아님)", () => {
    assert.deepEqual(
      describePipelineRun([item("X-3", "__proto__"), item("X-4", "toString")]),
      {
        enabled: false,
        label: "진행할 작업 없음",
        description: NO_ACTIONABLE_DESC,
      },
    );
  });
});
