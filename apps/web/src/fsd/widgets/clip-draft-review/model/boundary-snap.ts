function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

// "가장 가까운 경계"(nearestBoundary)를 "진행 방향의 인접 경계"로 바꾼다.
// - "back": 현재값보다 작은 경계 중 최대 - "forward": 현재값보다 큰 경계 중 최소.
//
// 경계는 원시 소수(예: 167.893)지만 저장값은 0.1초 격자(167.9)다. 격자에서 비교하지 않으면
// 현재값이 앉은 그 경계(167.893<167.9)로 다시 스냅해 roundTenth 후 167.9로 돌아오는 no-op이 생긴다
// (백로그 관측 4). 그래서 경계도 격자에 올리고 strict 부등호로 자기 자리를 배제한다.
//
// 방향에 경계가 없으면(마지막 단어 밖·전사 부재) 원시 ±fallbackStep 넛지로 물러난다 —
// "눌렀는데 안 움직임"을 여기서도 없앤다.
export function snapToAdjacentBoundary(
  value: number,
  boundaries: number[],
  direction: "back" | "forward",
  fallbackStep: number,
): number {
  const current = roundTenth(value);
  const grid = boundaries.map(roundTenth);

  if (direction === "back") {
    const behind = grid.filter((b) => b < current);
    return behind.length > 0
      ? Math.max(...behind)
      : roundTenth(current - fallbackStep);
  }

  const ahead = grid.filter((b) => b > current);
  return ahead.length > 0
    ? Math.min(...ahead)
    : roundTenth(current + fallbackStep);
}
