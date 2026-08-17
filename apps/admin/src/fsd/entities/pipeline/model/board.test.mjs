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

  it("does not create items from the quoted guide block", () => {
    const ids = parseBoard(BOARD).flatMap((section) =>
      section.items.map((item) => item.id),
    );

    assert.ok(!ids.includes("FAKE-99"));
    assert.deepEqual(ids, ["FEAT-03", "BUG-06", "FEAT-01"]);
  });
});
