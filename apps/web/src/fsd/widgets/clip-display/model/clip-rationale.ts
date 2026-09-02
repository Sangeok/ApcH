// clipTypeLabel은 두 위젯이 공유하는 wire 계약이라 entities/clip으로 내렸다.
// 여기서는 기존 임포트 경로를 유지하기 위해 재수출만 한다.
export { clipTypeLabel } from "~/fsd/entities/clip";

export function hasClipRationale(clip: {
  clipType: string | null;
  hook: string | null;
  payoff: string | null;
}): boolean {
  return (
    (clip.clipType?.trim().length ?? 0) > 0 ||
    (clip.hook?.trim().length ?? 0) > 0 ||
    (clip.payoff?.trim().length ?? 0) > 0
  );
}
