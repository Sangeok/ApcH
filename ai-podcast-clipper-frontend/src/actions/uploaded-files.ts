"use server";

import { revalidatePath } from "next/cache";
import { db } from "~/server/db";

export async function getUploadedFileDetails(uploadedFileId: string) {
  return db.uploadedFile.findUniqueOrThrow({
    where: { id: uploadedFileId },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      clips: {
        orderBy: { createdAt: "desc" },
      },
    },
  });
}

export async function deleteUploadedFile(uploadedFileId: string) {
  await db.uploadedFile.delete({ where: { id: uploadedFileId } });
  revalidatePath("/dashboard");
  return { success: true };
}

export async function deleteUploadedFileWithClips(uploadedFileId: string) {
  await db.$transaction([
    db.clip.deleteMany({ where: { uploadedFileId } }),
    db.uploadedFile.delete({ where: { id: uploadedFileId } }),
  ]);
  revalidatePath("/dashboard");
  return { success: true };
}

export async function reprocessUploadedFile(uploadedFileId: string) {
  // enqueue new processing job …
  revalidatePath(`/dashboard/uploads/${uploadedFileId}`);
  return { success: true };
}
