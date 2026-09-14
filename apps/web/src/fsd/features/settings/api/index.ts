"use server";

import { revalidatePath } from "next/cache";
import { normalizeUploadDefaults } from "~/fsd/entities/user";
import { updateUserUploadDefaults } from "~/fsd/entities/user/server";
import { requireAuth } from "~/fsd/shared/api/auth-guard";
import { type ActionResult, failure, success } from "~/fsd/shared/api/result";

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
