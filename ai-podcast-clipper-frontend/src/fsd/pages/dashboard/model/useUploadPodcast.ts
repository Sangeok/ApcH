"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  confirmUploadObjectExists,
  deleteUploadedFile,
  prepareUpload,
  reconcileProcessingRequest,
  reconcileUploadConfirmation,
  scheduleUploadedFileProcessing,
} from "~/fsd/features/upload/api";
import type { UploadedFileSummary } from "~/fsd/pages/dashboard/model/types";

async function uploadFileToS3(file: File, signedUrl: string): Promise<void> {
  const response = await fetch(signedUrl, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });

  if (!response.ok) {
    throw new Error("Failed to upload file to S3");
  }
}

interface UseUploadPodcastOptions {
  onOptimisticAdd: (file: UploadedFileSummary) => void;
  onSuccess?: () => void;
}

export function useUploadPodcast({
  onOptimisticAdd,
  onSuccess,
}: UseUploadPodcastOptions) {
  const [isUploading, startUploading] = useTransition();

  const upload = (file: File, language: string, clipCount: number) => {
    startUploading(async () => {
      const optimisticFile: UploadedFileSummary = {
        id: `optimistic-${Date.now()}`,
        fileName: file.name,
        status: "pending_enqueue",
        createdAt: new Date(),
        visibleClipsCount: 0,
      };
      onOptimisticAdd(optimisticFile);

      const toastId = toast.loading("Preparing upload...");
      let createdFileId: string | null = null;
      let canAutoDeleteDraft = true;

      try {
        const uploadResult = await prepareUpload({
          fileName: file.name,
          contentType: file.type,
          language,
          clipCount,
        });

        if (!uploadResult.success) {
          toast.error(uploadResult.error, { id: toastId });
          return;
        }

        createdFileId = uploadResult.data.uploadedFileId;

        toast.loading("Uploading file to server...", { id: toastId });
        await uploadFileToS3(file, uploadResult.data.signedUrl);
        canAutoDeleteDraft = false;

        toast.loading("Confirming upload...", { id: toastId });
        const confirmResult = await confirmUploadObjectExists(createdFileId);

        if (!confirmResult.success) {
          const reconcileResult = await reconcileUploadConfirmation(createdFileId);

          if (!reconcileResult.success || !reconcileResult.data.uploaded) {
            toast.error("Upload finished, but confirmation could not be verified.", {
              id: toastId,
              description:
                "The upload draft was kept. Retry later from Recoverable Uploads.",
            });
            return;
          }
        }

        toast.loading("Scheduling processing...", { id: toastId });
        const processResult = await scheduleUploadedFileProcessing(createdFileId);

        if (!processResult.success) {
          const reconcileResult = await reconcileProcessingRequest(createdFileId);

          if (reconcileResult.success && reconcileResult.data.status !== "upload_pending") {
            createdFileId = null;
            toast.success("Video uploaded successfully", {
              id: toastId,
              description:
                "Your video has been scheduled for processing. Check the status below.",
              duration: 5000,
            });
            onSuccess?.();
            return;
          }

          toast.error(processResult.error, {
            id: toastId,
            description:
              "The upload draft was kept. Resume processing from Recoverable Uploads.",
          });
          return;
        }

        createdFileId = null;
        toast.success("Video uploaded successfully", {
          id: toastId,
          description:
            "Your video has been scheduled for processing. Check the status below.",
          duration: 5000,
        });
        onSuccess?.();
      } catch (error) {
        console.error("Failed to upload video", error);

        if (createdFileId && !canAutoDeleteDraft) {
          const reconcileResult = await reconcileUploadConfirmation(createdFileId).catch(
            () => null,
          );

          if (reconcileResult?.success && reconcileResult.data.uploaded) {
            const processState = await reconcileProcessingRequest(createdFileId).catch(
              () => null,
            );

            if (processState?.success && processState.data.status !== "upload_pending") {
              createdFileId = null;
            }
          }
        }

        toast.error("Failed to upload video", {
          id: toastId,
          description:
            canAutoDeleteDraft
              ? "There was a problem uploading your video. Please try again."
              : "The upload draft was kept. Resume later from Recoverable Uploads if needed.",
        });
      } finally {
        if (createdFileId && canAutoDeleteDraft) {
          await deleteUploadedFile(createdFileId).catch(console.error);
        }
      }
    });
  };

  return { upload, isUploading };
}
