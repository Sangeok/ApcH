"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  uploadedFileKeys,
  type UploadedFileSummary,
} from "~/fsd/entities/uploaded-file";
import { deleteUploadedFile } from "../api";

/**
 * 업로드 삭제 mutation과 그 캐시 정책의 단일 소유자.
 *
 * 이전에는 같은 액션을 세 슬라이스에서 호출하면서 캐시 반응이 셋 다 달랐다
 * (목록 프룬 + detail 제거 + invalidate / invalidate만 / invalidate만).
 * 규약 §8.1: `useQueryClient()`는 mutation을 소유한 feature model 훅 안에서 부른다.
 */
export function useDeleteUploadedFile(options?: { onDeleted?: () => void }) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (uploadedFileId: string) => {
      const result = await deleteUploadedFile(uploadedFileId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return uploadedFileId;
    },
    onSuccess: async (uploadedFileId) => {
      queryClient.setQueriesData<UploadedFileSummary[]>(
        { queryKey: uploadedFileKeys.lists() },
        (old) => old?.filter((file) => file.id !== uploadedFileId),
      );
      queryClient.removeQueries({
        queryKey: uploadedFileKeys.detail(uploadedFileId),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: uploadedFileKeys.lists() }),
        queryClient.invalidateQueries({
          queryKey: uploadedFileKeys.activeQueues(),
        }),
      ]);
      options?.onDeleted?.();
    },
  });
}
