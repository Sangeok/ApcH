// 순수 함수. 임포트가 하나도 없다 — board.ts와 같은 이유로 DB·fetch를 여기 들이지 않는다.

export type AgentReport = {
  name: string; // 파일명 (FEAT-10.md, 감사기록.md)
  label: string; // 확장자 뗀 표시용 이름
  size: number; // 바이트
};

type ContentsEntry = { type?: unknown; name?: unknown; size?: unknown };

/**
 * GitHub contents API의 디렉터리 응답을 보고서 목록으로 좁힌다.
 * 배열이 아니거나(단일 파일 응답) 형태가 어긋나면 빈 목록이다 — 부분 집계는 하지 않는다.
 */
export function parseReportIndex(value: unknown): AgentReport[] {
  if (!Array.isArray(value)) return [];
  const out: AgentReport[] = [];
  for (const raw of value as ContentsEntry[]) {
    if (raw === null || typeof raw !== "object") return [];
    const { type, name, size } = raw;
    if (type !== "file") continue; // 하위 디렉터리는 보고서가 아니다
    if (typeof name !== "string" || typeof size !== "number") return [];
    if (!name.endsWith(".md")) continue;
    if (name === "README.md") continue; // 규약 문서지 보고서가 아니다
    out.push({ name, label: name.slice(0, -3), size });
  }
  // 코드포인트 정렬이다 — localeCompare는 로캘 의존이라 환경마다 순서가 달라진다.
  return out.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
