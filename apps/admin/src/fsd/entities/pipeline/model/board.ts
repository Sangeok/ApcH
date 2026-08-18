// 순수 함수. 임포트가 하나도 없다 — analytics/reporting.ts와 같은 이유로
// DB·fetch를 여기에 들이지 않는다(그래야 board.test.mjs로 덮인다).

export type BoardItem = {
  checked: boolean;
  id: string;
  title: string;
  agent: string | null;
  area: string | null;
  status: string | null;
  reason: string | null; // 근거
  result: string | null; // 결과
};

export type BoardSection = {
  heading: string;
  items: BoardItem[];
};

const HEADING_RE = /^##\s+(.+)$/;
const ITEM_RE = /^- \[([ xX])\] ([A-Z]+-\d+): (.+)$/;
const FIELD_RE = /^\s+(agent|area|status|근거|결과):\s*(.+)$/;

export function parseBoard(markdown: string): BoardSection[] {
  const sections: BoardSection[] = [];
  let currentSection: BoardSection | null = null;
  let currentItem: BoardItem | null = null;

  for (const line of markdown.split(/\r?\n/)) {
    // 상단 안내 블록(인용문)은 항목이 아니다.
    if (line.startsWith(">")) continue;

    const heading = HEADING_RE.exec(line);
    if (heading) {
      // 캡처 그룹은 정규식상 필수지만 타입은 string | undefined다.
      const headingText = heading[1];
      if (headingText !== undefined) {
        currentSection = { heading: headingText.trim(), items: [] };
        sections.push(currentSection);
        currentItem = null;
      }
      continue;
    }

    const item = ITEM_RE.exec(line);
    if (item) {
      if (!currentSection) continue; // 헤딩 이전의 항목은 무시
      const mark = item[1];
      const id = item[2];
      const title = item[3];
      if (mark === undefined || id === undefined || title === undefined) {
        continue;
      }
      currentItem = {
        checked: mark.toLowerCase() === "x",
        id,
        title: title.trim(),
        agent: null,
        area: null,
        status: null,
        reason: null,
        result: null,
      };
      currentSection.items.push(currentItem);
      continue;
    }

    const field = FIELD_RE.exec(line);
    if (field && currentItem) {
      const rawValue = field[2];
      if (rawValue === undefined) continue;
      const value = rawValue.trim();
      switch (field[1]) {
        case "agent":
          currentItem.agent = value;
          break;
        case "area":
          currentItem.area = value;
          break;
        case "status":
          currentItem.status = value;
          break;
        case "근거":
          currentItem.reason = value;
          break;
        case "결과":
          // 한 항목에 `결과:`가 두 번 나올 수 있다(계획 완료 → 구현 완료, 보류 후 재개).
          // 덮어쓰면 앞 기록이 투영에서 사라진다 — 실측으로 FEAT-10에서 약 790자가 없어졌다.
          currentItem.result =
            currentItem.result === null
              ? value
              : currentItem.result + " " + value;
          break;
      }
    }
  }

  // 항목이 없는 섹션(예: "## 파이프라인 구조")은 버린다.
  return sections.filter((section) => section.items.length > 0);
}
