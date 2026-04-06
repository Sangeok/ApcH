"use server";

import { auth } from "~/server/auth";
import { db } from "~/server/db";

export async function getUploadedFileDetails(uploadedFileId: string) {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const uploadedFile = await db.uploadedFile.findUniqueOrThrow({
    where: { id: uploadedFileId, userId: session.user.id },
    select: {
      id: true,
      displayName: true,
      createdAt: true,
      updatedAt: true,
      status: true,
      language: true,
      clips: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return uploadedFile;
}
