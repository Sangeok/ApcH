import assert from "node:assert/strict";
import { describe, it } from "node:test";

// 슬라이스 경계를 넘는 임포트는 별칭으로 쓴다(상대 경로 + .ts 확장자는 파일이
// 옮겨져도 컴파일러가 잡지 못한다). 단, 슬라이스 barrel은 "use server" api를
// 재수출하므로 모듈을 직접 가리킨다 — 그러지 않으면 이 단위 테스트가 Prisma를 깨운다.
import { captionStyleSchema } from "~/fsd/features/clip-review/model/schemas";
import {
  CAPTION_STYLE_OPTIONS,
  CAPTION_STYLE_PRESETS,
} from "~/fsd/shared/config/constants";
import { matchPresetId } from "./caption-presets.ts";

// 프리셋은 position이 없는 부분 스타일이다. 저장 경로가 받는 완전한 형태로 만든다.
function withPosition(presetStyle, position = "middle") {
  return { position, ...presetStyle };
}

describe("caption style presets", () => {
  // 프리셋 값이 계약 밖으로 나가면 Apply가 런타임에 zod로 거부된다.
  // 타입은 리터럴 범위를 못 잡으므로 이 테스트가 유일한 방어선이다.
  it("keeps every preset inside the validation contract", () => {
    for (const preset of CAPTION_STYLE_PRESETS) {
      const result = captionStyleSchema.safeParse(withPosition(preset.style));
      assert.ok(result.success, `${preset.id} failed validation`);
    }
  });

  it("keeps every preset outline width inside the allowed range", () => {
    for (const preset of CAPTION_STYLE_PRESETS) {
      assert.ok(
        preset.style.outlineWidth >= CAPTION_STYLE_OPTIONS.OUTLINE_WIDTH_RANGE.MIN &&
          preset.style.outlineWidth <= CAPTION_STYLE_OPTIONS.OUTLINE_WIDTH_RANGE.MAX,
        `${preset.id} outline width out of range`,
      );
    }
  });

  it("rejects an outline width above the range", () => {
    const result = captionStyleSchema.safeParse(
      withPosition({ ...CAPTION_STYLE_PRESETS[0].style, outlineWidth: 7 }),
    );
    assert.equal(result.success, false);
  });

  it("rejects an outline color that is not #RRGGBB", () => {
    const result = captionStyleSchema.safeParse(
      withPosition({ ...CAPTION_STYLE_PRESETS[0].style, outlineColor: "red" }),
    );
    assert.equal(result.success, false);
  });
});

describe("matchPresetId", () => {
  it("recognizes each preset by its own style", () => {
    for (const preset of CAPTION_STYLE_PRESETS) {
      assert.equal(matchPresetId(withPosition(preset.style)), preset.id);
    }
  });

  // 위치는 프리셋 소속이 아니다. 이게 깨지면 Top/Bottom을 고른 순간
  // 프리셋 칩의 활성 표시가 사라진다.
  it("ignores position when matching", () => {
    const preset = CAPTION_STYLE_PRESETS[1];
    assert.equal(matchPresetId(withPosition(preset.style, "top")), preset.id);
    assert.equal(matchPresetId(withPosition(preset.style, "bottom")), preset.id);
  });

  it("reports custom when any styled field differs", () => {
    const preset = CAPTION_STYLE_PRESETS[0];
    assert.equal(
      matchPresetId(withPosition({ ...preset.style, outlineWidth: 4 })),
      "custom",
    );
    assert.equal(
      matchPresetId(withPosition({ ...preset.style, uppercase: true })),
      "custom",
    );
  });

  it("reports default for the language-default style", () => {
    assert.equal(matchPresetId(null), "default");
  });
});
