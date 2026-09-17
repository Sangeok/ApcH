import {
  CAPTION_STYLE_PRESETS,
  type CaptionStyle,
  type CaptionStylePresetId,
} from "~/fsd/shared/config/constants";

export type CaptionPresetMatch = CaptionStylePresetId | "custom" | "default";

// 스타일이 어느 프리셋에 해당하는지 판정한다. 프리셋 칩의 활성 표시와
// 분석 메타데이터가 함께 쓴다.
// position은 프리셋 소속이 아니므로 비교에서 제외된다 — 프리셋을 골라도
// 사용자가 정한 위치는 유지되기 때문이다(CAPTION_STYLE_PRESETS 주석 참고).
export function matchPresetId(style: CaptionStyle | null): CaptionPresetMatch {
  if (style === null) return "default";

  const hit = CAPTION_STYLE_PRESETS.find((preset) =>
    Object.entries(preset.style).every(
      ([key, value]) =>
        style[key as keyof Omit<CaptionStyle, "position">] === value,
    ),
  );

  return hit?.id ?? "custom";
}

// 업로드 폼·발견 경로가 쓰는 사람이 읽는 라벨. matchPresetId 위에 얹는다.
// "custom"을 따로 분기하지 않는다 — find가 못 찾으면 ?? 가 받는다. 분기를 두면
// 그 ??가 도달 불가가 되어 테스트로 고정되지 않는다(검증 라운드 1 돌연변이 실측).
export function captionStyleLabel(style: CaptionStyle | null): string {
  const match = matchPresetId(style);
  if (match === "default") return "Default";
  return (
    CAPTION_STYLE_PRESETS.find((preset) => preset.id === match)?.label ??
    "Custom"
  );
}
