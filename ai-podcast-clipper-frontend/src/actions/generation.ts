"use server";

import { revalidatePath } from "next/cache";
import { inngest } from "~/inngest/client";
import { db } from "~/server/db";

export async function processVideo(uploadedFileId: string) {
  console.log(
    "processVideo function called with uploadedFileId:",
    uploadedFileId,
  );
  const uploadedVideo = await db.uploadedFile.findUniqueOrThrow({
    where: {
      id: uploadedFileId,
    },
    select: {
      uploaded: true,
      id: true,
      userId: true,
    },
  });

  if (uploadedVideo.uploaded) return;

  await inngest.send({
    name: "process-video-events",
    data: { uploadedFileId: uploadedVideo.id, userId: uploadedVideo.userId },
  });

  await db.uploadedFile.update({
    where: {
      id: uploadedVideo.id,
    },
    data: {
      uploaded: true,
    },
  });

  revalidatePath("/dashboard");
}
