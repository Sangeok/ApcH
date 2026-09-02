"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { createOptimisticUploadId } from "~/fsd/entities/uploaded-file/model/optimistic-id";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file/model/query-keys";
import { toast } from "sonner";
import { trackAnalyticsEvent } from "~/fsd/shared/analytics";
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

function getSafeUploadMetadata(
  file: File,
  language: string,
  clipCount: number,
  reviewBeforeGenerate: boolean,
) {
  return {
    fileType: file.type,
    fileSizeMb: Math.round((file.size / 1024 / 1024) * 10) / 10,
    language,
    clipCount,
    reviewBeforeGenerate,
  };
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
  const queryClient = useQueryClient();
  const router = useRouter();

  const markUploadVisible = async () => {
    await queryClient.invalidateQueries({
      queryKey: uploadedFileKeys.lists(),
    });
    router.refresh();
    onSuccess?.();
  };

  const refreshRecoverableDrafts = () => {
    router.refresh();
  };

  const upload = (
    file: File,
    language: string,
    clipCount: number,
    reviewBeforeGenerate: boolean,
  ) => {
    startUploading(async () => {
      const optimisticFile: UploadedFileSummary = {
        id: createOptimisticUploadId(),
        fileName: file.name,
        status: "pending_enqueue",
        createdAt: new Date(),
        visibleClipsCount: 0,
      };
      onOptimisticAdd(optimisticFile);

      const toastId = toast.loading("Preparing upload...");
      let createdFileId: string | null = null;
      let canAutoDeleteDraft = true;
      const uploadMetadata = getSafeUploadMetadata(
        file,
        language,
        clipCount,
        reviewBeforeGenerate,
      );

      void trackAnalyticsEvent("upload_started", uploadMetadata);

      try {
        const uploadResult = await prepareUpload({
          fileName: file.name,
          contentType: file.type,
          language,
          clipCount,
          reviewBeforeGenerate,
        });

        if (!uploadResult.success) {
          void trackAnalyticsEvent("upload_prepare_failed", {
            stage: "prepare_upload",
          });
          toast.error(uploadResult.error, { id: toastId });
          return;
        }

        createdFileId = uploadResult.data.uploadedFileId;

        toast.loading("Uploading file to server...", { id: toastId });
        await uploadFileToS3(file, uploadResult.data.signedUrl);
        void trackAnalyticsEvent("upload_s3_completed", {
          fileType: file.type,
          fileSizeMb: uploadMetadata.fileSizeMb,
        });
        canAutoDeleteDraft = false;

        toast.loading("Confirming upload...", { id: toastId });
        const confirmResult = await confirmUploadObjectExists(createdFileId);

        if (!confirmResult.success) {
          const reconcileResult =
            await reconcileUploadConfirmation(createdFileId);

          if (!reconcileResult.success || !reconcileResult.data.uploaded) {
            void trackAnalyticsEvent("upload_confirmation_failed", {
              uploadedFileId: createdFileId,
              stage: "confirm_upload",
            });
            toast.error(
              "Upload finished, but confirmation could not be verified.",
              {
                id: toastId,
                description:
                  "The upload draft was kept. Retry later from Recoverable Uploads.",
              },
            );
            refreshRecoverableDrafts();
            return;
          }
        }

        void trackAnalyticsEvent("upload_confirmed", {
          uploadedFileId: createdFileId,
        });

        toast.loading("Scheduling processing...", { id: toastId });
        const processResult =
          await scheduleUploadedFileProcessing(createdFileId);

        if (!processResult.success) {
          const reconcileResult =
            await reconcileProcessingRequest(createdFileId);

          if (
            reconcileResult.success &&
            reconcileResult.data.status !== "upload_pending"
          ) {
            void trackAnalyticsEvent("processing_scheduled", {
              uploadedFileId: createdFileId,
              recoveredByReconciliation: true,
            });
            createdFileId = null;
            toast.error("Video uploaded, but processing could not start.", {
              id: toastId,
              description: "Open the upload detail page and retry processing.",
              duration: 5000,
            });
            await markUploadVisible();
            return;
          }

          void trackAnalyticsEvent("processing_schedule_failed", {
            uploadedFileId: createdFileId,
            stage: "schedule_processing",
          });
          toast.error(processResult.error, {
            id: toastId,
            description:
              "The upload draft was kept. Resume processing from Recoverable Uploads.",
          });
          refreshRecoverableDrafts();
          return;
        }

        void trackAnalyticsEvent("processing_scheduled", {
          uploadedFileId: createdFileId,
          recoveredByReconciliation: false,
        });
        createdFileId = null;
        toast.success("Video uploaded successfully", {
          id: toastId,
          description:
            "Your video has been scheduled for processing. Check the status below.",
          duration: 5000,
        });
        await markUploadVisible();
      } catch (error) {
        console.error("Failed to upload video", error);

        if (createdFileId && canAutoDeleteDraft) {
          void trackAnalyticsEvent("upload_s3_failed", {
            stage: "upload_to_s3",
          });
        }

        if (createdFileId && !canAutoDeleteDraft) {
          const reconcileResult = await reconcileUploadConfirmation(
            createdFileId,
          ).catch(() => null);

          if (reconcileResult?.success && reconcileResult.data.uploaded) {
            const processState = await reconcileProcessingRequest(
              createdFileId,
            ).catch(() => null);

            if (
              processState?.success &&
              processState.data.status !== "upload_pending"
            ) {
              createdFileId = null;
              toast.error("Video uploaded, but processing could not start.", {
                id: toastId,
                description:
                  "Open the upload detail page and retry processing.",
                duration: 5000,
              });
              await markUploadVisible();
              return;
            }
          }
        }

        if (!canAutoDeleteDraft) {
          refreshRecoverableDrafts();
        }

        toast.error("Failed to upload video", {
          id: toastId,
          description: canAutoDeleteDraft
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
