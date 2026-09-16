import type { ClipDraft } from "@repo/db";
import {
  CAPTION_STYLE_OPTIONS,
  type CaptionStyle,
} from "~/fsd/shared/config/constants";

// draft.captionStyle / uploadedFile.captionStyle(Prisma JsonValue) → shared CaptionStyle 강제 변환의
// 단일 지점. 필드가 늘기 전에 저장된 행에는 신규 키가 없다. 그대로 다이얼로그에 넣으면
// 아무것도 고치지 않고 Apply 했을 때 zod(required-but-nullable)가 거부하므로 누락 키를
// null(= 백엔드 언어별 기본값)로 채운다.
export function toCaptionStyle(
  raw: ClipDraft["captionStyle"],
): CaptionStyle | null {
  if (raw === null || raw === undefined) return null;
  // Partial로 받는다 — 저장된 행에 신규 키가 없을 수 있다는 사실을 타입에도
  // 남겨야 아래 기본값이 죽은 코드로 취급되지 않는다.
  const stored = raw as Partial<CaptionStyle>;
  return {
    position: stored.position ?? CAPTION_STYLE_OPTIONS.DEFAULT_POSITION,
    fontSize: stored.fontSize ?? null,
    color: stored.color ?? null,
    maxWordsPerLine: stored.maxWordsPerLine ?? null,
    outlineColor: stored.outlineColor ?? null,
    outlineWidth: stored.outlineWidth ?? null,
    uppercase: stored.uppercase ?? null,
  };
}
