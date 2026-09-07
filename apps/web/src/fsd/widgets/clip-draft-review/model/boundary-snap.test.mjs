import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { snapToAdjacentBoundary } from "./boundary-snap.ts";

// 백로그 관측 4의 실제 형상: 저장값은 0.1초 격자(167.9)이고 단어 경계는 원시 소수다.
const WORDS = [165.2, 167.893, 170.3];

describe("snapToAdjacentBoundary", () => {
  it("moves to the adjacent boundary, not the nearest (no-op regression)", () => {
    // nearestBoundary였다면 167.9(자기 자리)로 남던 값.
    assert.equal(snapToAdjacentBoundary(167.9, WORDS, "back", 0.5), 165.2);
    assert.equal(snapToAdjacentBoundary(167.9, WORDS, "forward", 0.5), 170.3);
  });

  it("excludes its own seat on the grid (167.893 → 167.9)", () => {
    // 167.893이 167.9로 반올림돼도 strict 부등호가 자기 자리를 배제한다.
    // 위 케이스가 이미 이를 실증하지만, 두 번 "back"이 각각 이동하는지 확인한다.
    const once = snapToAdjacentBoundary(170.3, WORDS, "back", 0.5);
    assert.equal(once, 167.9);
    assert.equal(snapToAdjacentBoundary(once, WORDS, "back", 0.5), 165.2);
  });

  it("snaps a raw (non-grid) current value onto the grid before comparing", () => {
    // value 167.893(초기 AI 값 그대로). const current = roundTenth(value)를
    // 지우면 "forward"가 자기 단어의 격자값(167.9)으로 가고 — 167.893도 167.9도
    // 화면에는 똑같이 2:47.9라 눌러도 안 움직이는 것처럼 보인다(돌연변이 M5).
    assert.equal(snapToAdjacentBoundary(167.893, WORDS, "forward", 0.5), 170.3);
    assert.equal(snapToAdjacentBoundary(167.893, WORDS, "back", 0.5), 165.2);
  });

  it("chooses the minimum ahead when several boundaries lie forward", () => {
    // 앞에 경계가 둘 이상 — Math.min을 Math.max로 바꾼 구현("가장 먼 단어로 건너뜀")을
    // 잡는다(돌연변이 MB4). forward 케이스가 앞에 하나뿐이면 min/max가 같은 결과다.
    assert.equal(snapToAdjacentBoundary(165.2, WORDS, "forward", 0.5), 167.9);
  });

  it("falls back to a rounded nudge when no boundary lies in the direction", () => {
    // 빈 경계(전사 부재) → 폴백.
    assert.equal(snapToAdjacentBoundary(167.9, [], "back", 0.5), 167.4);
    // 폴백은 격자-부정확 값으로: 0.6 - 0.5 = 0.09999999999999998이라
    // 폴백의 roundTenth를 지우면 이 케이스가 실패한다(돌연변이 M4).
    assert.equal(snapToAdjacentBoundary(0.6, [], "back", 0.5), 0.1);
  });

  it("forward fallback nudges forward, not backward", () => {
    // 마지막 단어 밖에서 "+"를 누르면 앞으로 가야 한다. 부호를 뒤집은 구현
    // (current - fallbackStep)은 뒤로 간다 — 폴백이 없애려는 증상(돌연변이 MB9).
    assert.equal(snapToAdjacentBoundary(170.3, WORDS, "forward", 0.5), 170.8);
  });
});
