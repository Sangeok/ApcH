"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file";
import { scheduleUploadedFileProcessing } from "../api";

/**
 * 복구 가능한 드래프트의 처리 재개 mutation과 그 무효화 정책의 단일 소유자.
 * 페이지 슬라이스가 `useQueryClient`를 직접 잡지 않도록 한다(규약 §8.1).
 */
export function useResumeUploadDraft() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (uploadedFileId: string) => {
      const result = await scheduleUploadedFileProcessing(uploadedFileId);

      if (!result.success) {
        throw new Error(result.error);
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: uploadedFileKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: uploadedFileKeys.activeQueues(),
        }),
      ]);
    },
  });
}
