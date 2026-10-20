"use server";

import { revalidatePath } from "next/cache";
import { normalizeUploadDefaults } from "~/fsd/entities/user";
import {
  updateUserUploadDefaults,
  updateUserVideoStyle,
} from "~/fsd/entities/user/server";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { type ActionResult, failure, success } from "~/fsd/shared/api/result";
import { captionStyleSchema } from "~/fsd/shared/config/caption-style-schema";
import { parseVideoPaddingPercent } from "~/fsd/shared/config/video-framing";
import type {
  CaptionStyle,
  CaptionStyleDefaults,
} from "~/fsd/shared/config/constants";

export async function saveUploadDefaults(input: {
  defaultLanguage: string | null;
  defaultClipCount: number | null;
  defaultReviewBeforeGenerate: boolean | null;
}): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) {
    return authResult;
  }

  const normalized = normalizeUploadDefaults(input);
  if (normalized === null) {
    return failure("Invalid upload defaults");
  }

  await updateUserUploadDefaults(authResult.data.userId, normalized);

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/settings");

  return success();
}

export async function saveVideoStyle(input: {
  paddingPercent: unknown;
  captionStyles: CaptionStyleDefaults;
}): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  const percent = parseVideoPaddingPercent(input.paddingPercent);
  if (percent === null) return failure("Invalid video padding percent");

  // null = 언어 기본값으로 비우기(검증 안 함). 값이 있으면 write-time 단일 검증.
  // 파싱 결과를 쓴다 — z.object가 모르는 키를 떨궈 조작된 여분 키가 저장·스냅샷·
  // Modal 페이로드로 흘러가지 않게(기존 saveDefaultCaptionStyle과 같은 관용).
  const validate = (
    value: CaptionStyle | null,
  ): { ok: true; style: CaptionStyle | null } | { ok: false } => {
    if (value === null) return { ok: true, style: null };
    // 옛 저장값에는 marginV 키가 없다(타입은 필수지만 런타임엔 undefined). z.number().nullable()은 undefined를
    // 거부하므로 null로 받는다. 저장은 parsed.data라 null로 정규화되어 앞으로 키가 생긴다.
    const parsed = captionStyleSchema.safeParse({
      ...value,
      marginV: value.marginV ?? null,
    });
    return parsed.success ? { ok: true, style: parsed.data } : { ok: false };
  };

  const english = validate(input.captionStyles.english);
  const korean = validate(input.captionStyles.korean);
  if (!english.ok || !korean.ok) return failure("Invalid caption style");

  try {
    await updateUserVideoStyle(authResult.data.userId, {
      paddingPercent: percent,
      english: english.style,
      korean: korean.style,
    });
  } catch (error) {
    console.error("Failed to save video style", error);
    return failure("Could not save video style. Try again.");
  }

  revalidatePath("/dashboard/settings");
  return success();
}
