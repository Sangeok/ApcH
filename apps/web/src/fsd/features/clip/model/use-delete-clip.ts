"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  uploadedFileKeys,
  type UploadedFileDetail,
} from "~/fsd/entities/uploaded-file";
import { deleteClip } from "../api";

/**
 * 클립 삭제 mutation과 그 캐시 정책의 소유자.
 *
 * 이전에는 leaf `_component`(ClipActions)가 setQueryData와 invalidateQueries를
 * 직접 들고 있어 재사용도 단독 테스트도 불가능했다(규약 §8.1).
 *
 * @param uploadedFileId 상세 캐시를 함께 손볼 대상. 클립이 업로드에 묶여 있지
 *   않으면 null이며, 그 경우 목록만 무효화한다.
 */
export function useDeleteClip(uploadedFileId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (clipId: string) => {
      const result = await deleteClip(clipId);

      if (!result.success) {
        throw new Error(result.error);
      }

      return clipId;
    },
    onSuccess: async (clipId) => {
      if (uploadedFileId) {
        queryClient.setQueryData<UploadedFileDetail>(
          uploadedFileKeys.detail(uploadedFileId),
          (old) =>
            old
              ? {
                  ...old,
                  clips: old.clips.filter((item) => item.id !== clipId),
                }
              : old,
        );
      }

      await Promise.all([
        uploadedFileId
          ? queryClient.invalidateQueries({
              queryKey: uploadedFileKeys.detail(uploadedFileId),
            })
          : Promise.resolve(),
        queryClient.invalidateQueries({ queryKey: uploadedFileKeys.lists() }),
      ]);
    },
  });
}
