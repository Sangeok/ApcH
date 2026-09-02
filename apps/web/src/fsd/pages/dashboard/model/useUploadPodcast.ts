"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  createOptimisticUploadId,
  uploadedFileKeys,
  type UploadedFileSummary,
} from "~/fsd/entities/uploaded-file";
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

/**
 * 이 실행이 끝날 때 업로드 드래프트를 어떻게 할 것인가.
 *
 * 이전에는 이 계약이 서로 모순되는 두 플래그로 인코딩돼 있었다.
 * `createdFileId = null`은 "드래프트가 없다"가 아니라 "삭제하지 말고 남겨라"를
 * 뜻했고, `canAutoDeleteDraft`는 S3 객체가 **있을 때** false였다. 그래서
 * "실패하면 이 업로드의 DB 행이 지워지나?"에 답하려면 출구 여섯을 전부
 * 시뮬레이션해야 했고, `createdFileId = null`을 빠뜨린 early return을 하나
 * 추가하면 사용자가 방금 "Resume 하라"고 안내받은 드래프트가 조용히 삭제됐다.
 */
/** 분석 페이로드의 파일 크기 필드. 소수 첫째 자리까지의 MB. */
export function toFileSizeMb(file: File): number {
  return Math.round((file.size / 1024 / 1024) * 10) / 10;
}

type DraftDisposition =
  /** 아직 드래프트를 만들지 않았거나, 처리 파이프라인에 넘겼다 */
  | "none"
  /** 이 실행이 만들었고 실패하면 정리해야 한다 */
  | "delete-on-exit"
  /** S3에 원본이 올라갔다. 지우면 사용자가 다시 올려야 하므로 남긴다 */
  | "keep-for-recovery";

// 위치 인자 넷은 호출부에서 뜻이 보이지 않는다 — 특히 마지막 boolean이
// dispatch 종류("analyze" vs "auto")를 고르는데 `upload(file, "English", 3, true)`
// 로는 그 사실을 읽을 수 없었다.
interface UploadPodcastInput {
  file: File;
  language: string;
  clipCount: number;
  reviewBeforeGenerate: boolean;
}

export function toUploadAnalyticsMetadata({
  file,
  language,
  clipCount,
  reviewBeforeGenerate,
}: UploadPodcastInput) {
  return {
    fileType: file.type,
    fileSizeMb: toFileSizeMb(file),
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
    await queryClient.invalidateQueries({
      queryKey: uploadedFileKeys.activeQueues(),
    });
    router.refresh();
    onSuccess?.();
  };

  const refreshRecoverableDrafts = () => {
    router.refresh();
  };

  const upload = ({
    file,
    language,
    clipCount,
    reviewBeforeGenerate,
  }: UploadPodcastInput) => {
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
      let draftId: string | null = null;
      let disposition: DraftDisposition = "none";
      // disposition과는 다른 사실이다 — 드래프트를 넘긴 뒤("none")에도
      // S3 객체는 남아 있다. 사용자에게 무엇을 안내할지가 여기에 달려 있다.
      let hasUploadedSourceObject = false;
      const uploadMetadata = toUploadAnalyticsMetadata({
        file,
        language,
        clipCount,
        reviewBeforeGenerate,
      });

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

        draftId = uploadResult.data.uploadedFileId;
        disposition = "delete-on-exit";

        toast.loading("Uploading file to server...", { id: toastId });
        await uploadFileToS3(file, uploadResult.data.signedUrl);
        void trackAnalyticsEvent("upload_s3_completed", {
          fileType: file.type,
          fileSizeMb: uploadMetadata.fileSizeMb,
        });
        hasUploadedSourceObject = true;
        disposition = "keep-for-recovery";

        toast.loading("Confirming upload...", { id: toastId });
        const confirmResult = await confirmUploadObjectExists(draftId);

        if (!confirmResult.success) {
          const reconcileResult = await reconcileUploadConfirmation(draftId);

          if (!reconcileResult.success || !reconcileResult.data.uploaded) {
            void trackAnalyticsEvent("upload_confirmation_failed", {
              uploadedFileId: draftId,
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
          uploadedFileId: draftId,
        });

        toast.loading("Scheduling processing...", { id: toastId });
        const processResult = await scheduleUploadedFileProcessing(draftId);

        if (!processResult.success) {
          const reconcileResult = await reconcileProcessingRequest(draftId);

          if (
            reconcileResult.success &&
            reconcileResult.data.status !== "upload_pending"
          ) {
            void trackAnalyticsEvent("processing_scheduled", {
              uploadedFileId: draftId,
              recoveredByReconciliation: true,
            });
            // 파이프라인이 이 행을 넘겨받았다. 더는 이 실행의 정리 대상이 아니다.
            disposition = "none";
            toast.error("Video uploaded, but processing could not start.", {
              id: toastId,
              description: "Open the upload detail page and retry processing.",
              duration: 5000,
            });
            await markUploadVisible();
            return;
          }

          void trackAnalyticsEvent("processing_schedule_failed", {
            uploadedFileId: draftId,
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
          uploadedFileId: draftId,
          recoveredByReconciliation: false,
        });
        disposition = "none";
        toast.success("Video uploaded successfully", {
          id: toastId,
          description:
            "Your video has been scheduled for processing. Check the status below.",
          duration: 5000,
        });
        await markUploadVisible();
      } catch (error) {
        console.error("Failed to upload video", error);

        // 드래프트는 만들었지만 S3 업로드 전에 터졌다.
        if (disposition === "delete-on-exit") {
          void trackAnalyticsEvent("upload_s3_failed", {
            stage: "upload_to_s3",
          });
        }

        // 원본은 올라갔다 — 서버가 이미 앞서 나갔는지 확인해 본다.
        if (draftId && disposition === "keep-for-recovery") {
          const reconcileResult = await reconcileUploadConfirmation(
            draftId,
          ).catch(() => null);

          if (reconcileResult?.success && reconcileResult.data.uploaded) {
            const processState = await reconcileProcessingRequest(
              draftId,
            ).catch(() => null);

            if (
              processState?.success &&
              processState.data.status !== "upload_pending"
            ) {
              disposition = "none";
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

        // 안내 문구는 "S3에 원본이 있는가"로 갈린다 — 있으면 사용자는 다시
        // 올릴 필요가 없다. disposition이 아니라 이 사실을 봐야 한다.
        if (hasUploadedSourceObject) {
          refreshRecoverableDrafts();
        }

        toast.error("Failed to upload video", {
          id: toastId,
          description: hasUploadedSourceObject
            ? "The upload draft was kept. Resume later from Recoverable Uploads if needed."
            : "There was a problem uploading your video. Please try again.",
        });
      } finally {
        // 정리 조건이 한 줄로 읽힌다. 새 early return을 추가할 때
        // disposition을 정하지 않으면 그것이 곧 컴파일 대상 실수가 된다.
        if (draftId && disposition === "delete-on-exit") {
          await deleteUploadedFile(draftId).catch(console.error);
        }
      }
    });
  };

  return { upload, isUploading };
}
