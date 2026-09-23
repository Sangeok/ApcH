"use server";

import { revalidatePath } from "next/cache";
import { normalizeUploadDefaults } from "~/fsd/entities/user";
import {
  updateUserDefaultCaptionStyle,
  updateUserUploadDefaults,
} from "~/fsd/entities/user/server";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { type ActionResult, failure, success } from "~/fsd/shared/api/result";
import { captionStyleSchema } from "~/fsd/shared/config/caption-style-schema";
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

export async function saveDefaultCaptionStyle(
  input: CaptionStyleDefaults,
): Promise<ActionResult<void>> {
  const authResult = await requireAuth();
  if (!authResult.success) return authResult;

  // null = 언어 기본값으로 비우기(검증 안 함). 값이 있으면 write-time 단일 검증.
  // 원본 input이 아니라 파싱 결과를 쓴다 — z.object는 모르는 키를 결과에서 떨구므로 조작된 요청이 붙인
  // 여분 키가 저장·스냅샷·Modal 페이로드로 흘러가지 않는다(saveClipDraftEdit도 validated.data를 쓴다).
  const validate = (
    value: CaptionStyle | null,
  ): { ok: true; style: CaptionStyle | null } | { ok: false } => {
    if (value === null) return { ok: true, style: null };
    const parsed = captionStyleSchema.safeParse(value);
    return parsed.success ? { ok: true, style: parsed.data } : { ok: false };
  };

  const english = validate(input.english);
  const korean = validate(input.korean);
  if (!english.ok || !korean.ok) return failure("Invalid caption style");

  await updateUserDefaultCaptionStyle(authResult.data.userId, {
    english: english.style,
    korean: korean.style,
  });
  revalidatePath("/dashboard/settings");
  return success();
}
