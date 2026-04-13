"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { generateUploadUrl } from "~/fsd/features/upload/api";
import { processVideo } from "~/fsd/features/clip/api";
import type { UploadedFileSummary } from "~/fsd/pages/dashboard/model/types";

async function uploadFileToS3(file: File, signedUrl: string): Promise<void> {
  const response = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!response.ok) throw new Error("Failed to upload file to S3");
}

interface UseUploadPodcastOptions {
  onOptimisticAdd: (file: UploadedFileSummary) => void;
  onSuccess?: () => void;
}

export function useUploadPodcast({ onOptimisticAdd, onSuccess }: UseUploadPodcastOptions) {
  const [isUploading, startUploading] = useTransition();

  const upload = (file: File, language: string, clipCount: number) => {
    startUploading(async () => {
      const optimisticFile: UploadedFileSummary = {
        id: `optimistic-${Date.now()}`,
        fileName: file.name,
        status: "queued",
        createdAt: new Date(),
        clipsCount: 0,
      };
      onOptimisticAdd(optimisticFile);

      const toastId = toast.loading("Preparing upload...");

      try {
        const uploadResult = await generateUploadUrl({
          fileName: file.name,
          contentType: file.type,
          language,
        });
        if (!uploadResult.success) {
          toast.error(uploadResult.error, { id: toastId });
          return;
        }

        toast.loading("Uploading file to server...", { id: toastId });
        await uploadFileToS3(file, uploadResult.data.signedUrl);

        toast.loading("Scheduling processing...", { id: toastId });
        const processResult = await processVideo(
          uploadResult.data.uploadedFileId,
          language,
          clipCount,
        );
        if (!processResult.success) {
          toast.error(processResult.error, { id: toastId });
          return;
        }

        toast.success("Video uploaded successfully", {
          id: toastId,
          description:
            "Your video has been scheduled for processing. Check the status below",
          duration: 5000,
        });
        onSuccess?.();
      } catch (error) {
        console.error("Failed to upload video", error);
        toast.error("Failed to upload video", {
          id: toastId,
          description:
            "There was a problem uploading your video. Please try again.",
        });
      }
    });
  };

  return { upload, isUploading };
}
