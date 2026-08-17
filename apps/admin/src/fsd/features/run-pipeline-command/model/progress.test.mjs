import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { deriveProgress, SILENCE_THRESHOLD_MS } from "./progress.ts";

const NOW = new Date("2026-08-15T15:00:00Z");
function ago(minutes) {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}
// 명령(비-[claude]) / 답글([claude] 접두)
function command(iso) {
  return { body: "파이프라인을 진행해 주세요.", createdAt: iso };
}
function reply(iso) {
  return { body: "[claude] 처리했습니다.", createdAt: iso };
}

describe("deriveProgress — 코멘트 → 진행 상태", () => {
  it("빈 배열 → idle", () => {
    assert.deepEqual(deriveProgress([], NOW), { kind: "idle" });
  });

  it("답글만 있으면 → idle(추적할 명령 없음)", () => {
    assert.deepEqual(deriveProgress([reply(ago(5)), reply(ago(2))], NOW), {
      kind: "idle",
    });
  });

  it("명령 뒤 답글 → responded(sinceIso=명령 시각)", () => {
    const cmdIso = ago(4);
    assert.deepEqual(deriveProgress([command(cmdIso), reply(ago(3))], NOW), {
      kind: "responded",
      sinceIso: cmdIso,
    });
  });

  it("이중 명령 + 답글 1건 → awaiting(sinceIso=뒤 명령) — 삼킴 사건 형태", () => {
    // 2026-08-15: 명령 2건 연속 뒤 답글 1건. 답글은 앞 명령만 갚고 뒤 명령은 미응답.
    // 여기서 responded가 나오면 삼킴이 성공으로 보인다(요구 4가 없애려는 상태).
    const cmd2Iso = ago(2);
    assert.deepEqual(
      deriveProgress([command(ago(10)), command(cmd2Iso), reply(ago(1))], NOW),
      { kind: "awaiting", sinceIso: cmd2Iso, minutes: 2 },
    );
  });

  it("미응답 2건 동시 → silent(가장 오래된 미응답 기준)", () => {
    // 명령1 10분 전 · 명령2 1분 전, 답글 없음. 경과는 가장 오래된 명령1로 잰다.
    // "가장 최근 미응답 기준" 오구현은 awaiting(0분)을 띄워 핵심 신호를 잃는다(돌연변이 검사 실측).
    const cmd1Iso = ago(10);
    assert.deepEqual(deriveProgress([command(cmd1Iso), command(ago(1))], NOW), {
      kind: "silent",
      sinceIso: cmd1Iso,
      minutes: 10,
    });
  });

  it("명령 2건 + 답글 2건 → responded(sinceIso=최신 명령)", () => {
    const lastCmdIso = ago(3);
    assert.deepEqual(
      deriveProgress(
        [command(ago(8)), command(lastCmdIso), reply(ago(2)), reply(ago(1))],
        NOW,
      ),
      { kind: "responded", sinceIso: lastCmdIso },
    );
  });

  it("창 밖 명령의 답글이 앞에 와도 뒤 명령을 갚지 않는다 → silent", () => {
    const cmdIso = ago(5);
    assert.deepEqual(deriveProgress([reply(ago(6)), command(cmdIso)], NOW), {
      kind: "silent",
      sinceIso: cmdIso,
      minutes: 5,
    });
  });

  it("명령만·경과 1분(<3분) → awaiting{minutes:1}", () => {
    const iso = ago(1);
    assert.deepEqual(deriveProgress([command(iso)], NOW), {
      kind: "awaiting",
      sinceIso: iso,
      minutes: 1,
    });
  });

  it("명령만·경과 5분(≥3분) → silent{minutes:5}", () => {
    const iso = ago(5);
    assert.deepEqual(deriveProgress([command(iso)], NOW), {
      kind: "silent",
      sinceIso: iso,
      minutes: 5,
    });
  });

  it("명령1 → 답글1 → 명령2(무응답) → silent(명령2 기준)", () => {
    const cmd2Iso = ago(4);
    assert.deepEqual(
      deriveProgress([command(ago(9)), reply(ago(8)), command(cmd2Iso)], NOW),
      { kind: "silent", sinceIso: cmd2Iso, minutes: 4 },
    );
  });

  it("경과 정확히 3분(180,000ms) → silent(경계 포함)", () => {
    const iso = new Date(NOW.getTime() - SILENCE_THRESHOLD_MS).toISOString();
    assert.deepEqual(deriveProgress([command(iso)], NOW), {
      kind: "silent",
      sinceIso: iso,
      minutes: 3,
    });
  });

  it("minutes는 내림(floor)한다", () => {
    const iso = new Date(NOW.getTime() - 160_000).toISOString(); // 2분 40초
    assert.deepEqual(deriveProgress([command(iso)], NOW), {
      kind: "awaiting",
      sinceIso: iso,
      minutes: 2,
    });
  });

  it("createdAt 파싱 불가 → unknown", () => {
    assert.deepEqual(
      deriveProgress([{ body: "명령", createdAt: "not-a-date" }], NOW),
      { kind: "unknown" },
    );
  });

  it("코멘트 시각이 미래(시계 어긋남)면 minutes는 0으로 클램프", () => {
    // Math.max(0, …) 클램프가 없으면 "−1분째 응답 대기"가 뜬다.
    const future = new Date(NOW.getTime() + 5 * 60_000).toISOString();
    assert.deepEqual(deriveProgress([command(future)], NOW), {
      kind: "awaiting",
      sinceIso: future,
      minutes: 0,
    });
  });

  it("본문 중간의 [claude]는 답글이 아니라 명령이다(startsWith 접두 판정)", () => {
    // includes로 판정하면 이 코멘트를 답글로 오인해 idle이 된다(거짓 초록).
    const iso = ago(5);
    const midClaude = { body: "메모: [claude] 관련 작업 부탁", createdAt: iso };
    assert.deepEqual(deriveProgress([midClaude], NOW), {
      kind: "silent",
      sinceIso: iso,
      minutes: 5,
    });
  });

  it("선행 공백이 있는 [claude] 답글도 접두로 인식된다(trimStart) — isReply 간접 확인", () => {
    const cmdIso = ago(4);
    const spacedReply = { body: "  [claude] 처리 완료", createdAt: ago(3) };
    assert.deepEqual(deriveProgress([command(cmdIso), spacedReply], NOW), {
      kind: "responded",
      sinceIso: cmdIso,
    });
  });

  it("SILENCE_THRESHOLD_MS는 180000(3분)이다", () => {
    assert.equal(SILENCE_THRESHOLD_MS, 180_000);
  });
});
