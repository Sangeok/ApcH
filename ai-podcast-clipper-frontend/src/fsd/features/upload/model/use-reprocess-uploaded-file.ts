"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file/model/query-keys";
import { reprocessUploadedFile } from "../api";

export function useReprocessUploadedFile(uploadedFileId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const result = await reprocessUploadedFile(uploadedFileId);

      if (!result.success) {
        throw new Error(result.error ?? "Failed to reprocess file");
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: uploadedFileKeys.detail(uploadedFileId),
        }),
        queryClient.invalidateQueries({
          queryKey: uploadedFileKeys.lists(),
        }),
      ]);
    },
  });
}
