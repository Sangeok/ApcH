import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseBoard } from "./board.ts";

// 실제 PROJECT_BOARD.md 형식을 축약한 대표 문자열:
// - 상단 `>` 안내 블록
// - 두 날짜 섹션(각각 항목을 가짐)
// - 결과가 있는 완료 항목 / 결과가 없는 미완료 항목
// - `- [x]`와 `- [ ]`
// - 제목에 `—`·`+`·`:`가 섞인 항목
// - 항목이 없는 `## 파이프라인 구조`(mermaid) 섹션
const BOARD = `# PROJECT_BOARD

> PM 에이전트가 오늘 처리할 항목을 여기에 기록한다.
> - [ ] 이건 인용문 안이라 항목이 아니다: FAKE-99

## 2026-08-14
- [ ] FEAT-03: 파이프라인 대시보드 — 보드 카드 뷰 + 원격 명령 버튼
  agent: admin-dev
  area: apps/admin
  status: 구현승인
  근거: 사용자 직접 발주 — pm 경유 없음.
- [x] BUG-06: pricing FAQ 문구가 실제 차감 동작과 모순됨
  agent: web-dev
  area: apps/web/src/fsd/pages/pricing/config
  status: 완료
  근거: 정합성 결함이라 이를 고른다.
  결과: pricingFaq 두 답변을 교체했다. 수정: apps/web/src/fsd/pages/pricing/config/index.ts.

## 2026-08-03
- [ ] FEAT-01: Credit System 마무리
  agent: web-dev
  area: apps/web/src/fsd/features/billing
  status: 승인대기
  근거: 결제 흐름의 기반이 되는 항목.

## 파이프라인 구조

정적 구조도다.

\`\`\`mermaid
flowchart LR
    BL --> PM
\`\`\`
`;

describe("pipeline board parser", () => {
  it("splits into date sections, dropping the guide block and empty sections", () => {
    const sections = parseBoard(BOARD);

    // "# PROJECT_BOARD"는 h1(단일 #)이라 섹션이 아니고,
    // "## 파이프라인 구조"는 항목이 없어 제외된다.
    assert.deepEqual(
      sections.map((section) => section.heading),
      ["2026-08-14", "2026-08-03"],
    );
  });

  it("extracts checked/id/title/agent/area/status for the first item", () => {
    const [firstSection] = parseBoard(BOARD);
    const feat03 = firstSection.items[0];

    assert.equal(feat03.checked, false); // `- [ ]`
    assert.equal(feat03.id, "FEAT-03");
    // 제목의 `—`·`+`·`:`가 온전히 잡힌다.
    assert.equal(
      feat03.title,
      "파이프라인 대시보드 — 보드 카드 뷰 + 원격 명령 버튼",
    );
    assert.equal(feat03.agent, "admin-dev");
    assert.equal(feat03.area, "apps/admin");
    assert.equal(feat03.status, "구현승인");
    assert.equal(feat03.result, null);
    assert.equal(feat03.reason, "사용자 직접 발주 — pm 경유 없음.");
  });

  it("fills result on completed items and leaves it null otherwise", () => {
    const [firstSection] = parseBoard(BOARD);
    const bug06 = firstSection.items[1];

    assert.equal(bug06.checked, true); // `- [x]`
    assert.equal(bug06.id, "BUG-06");
    assert.equal(bug06.status, "완료");
    // 값 안의 콜론(수정: ...)까지 통째로 잡힌다.
    assert.equal(
      bug06.result,
      "pricingFaq 두 답변을 교체했다. 수정: apps/web/src/fsd/pages/pricing/config/index.ts.",
    );
    assert.equal(bug06.reason, "정합성 결함이라 이를 고른다.");
  });

  it("accumulates a repeated 결과 field instead of overwriting it", () => {
    // 실측 결함: FEAT-10 행에 `결과:`가 두 줄이라 앞의 약 790자가 투영에서 사라졌다.
    // 한 항목에 두 번 쓰이는 것은 정상 경로다(계획 완료 → 구현 완료, 보류 후 재개).
    const md = [
      "## 2026-08-18",
      "- [x] FEAT-99: 두 번 기록되는 항목",
      "  agent: admin-dev",
      "  status: 완료",
      "  근거: 발주 근거.",
      "  결과: 계획서 작성 완료.",
      "  결과: 구현 완료.",
    ].join(String.fromCharCode(10));

    const [item] = parseBoard(md)[0].items;
    assert.equal(item.result, "계획서 작성 완료. 구현 완료.");
    assert.equal(item.reason, "발주 근거."); // 근거는 한 번뿐이라 그대로
  });

  it("keeps a single 결과 field byte-identical", () => {
    // 누적 로직이 중복 없는 행을 건드리지 않는지 — 회귀 가드.
    const bug06 = parseBoard(BOARD)
      .flatMap((section) => section.items)
      .find((item) => item.id === "BUG-06");

    assert.equal(
      bug06.result,
      "pricingFaq 두 답변을 교체했다. 수정: apps/web/src/fsd/pages/pricing/config/index.ts.",
    );
  });

  it("does not create items from the quoted guide block", () => {
    const ids = parseBoard(BOARD).flatMap((section) =>
      section.items.map((item) => item.id),
    );

    assert.ok(!ids.includes("FAKE-99"));
    assert.deepEqual(ids, ["FEAT-03", "BUG-06", "FEAT-01"]);
  });
});
