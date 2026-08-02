"use client";

import { useQuery } from "@tanstack/react-query";
import { ACTIVE_UPLOAD_POLLING_INTERVAL_MS } from "~/fsd/entities/uploaded-file/model/polling";
import { isActiveProcessingStatus } from "~/fsd/entities/uploaded-file/model/processing-status";
import type { UploadedFileDetail } from "~/fsd/entities/uploaded-file/model/types";
import { uploadedFileDetailQueryOptions } from "~/fsd/features/upload";

export function useLiveUploadedFileDetail(
  initialUploadedFileData: UploadedFileDetail,
) {
  const shouldRefetchWhileProcessing = (
    statusToCheck?: UploadedFileDetail["status"],
  ) =>
    isActiveProcessingStatus(statusToCheck ?? initialUploadedFileData.status);

  return useQuery({
    ...uploadedFileDetailQueryOptions(initialUploadedFileData.id),
    initialData: initialUploadedFileData,
    staleTime: ACTIVE_UPLOAD_POLLING_INTERVAL_MS,
    refetchInterval: (query) =>
      shouldRefetchWhileProcessing(query.state.data?.status)
        ? ACTIVE_UPLOAD_POLLING_INTERVAL_MS
        : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: (query) =>
      shouldRefetchWhileProcessing(query.state.data?.status) ? "always" : false,
    refetchOnReconnect: (query) =>
      shouldRefetchWhileProcessing(query.state.data?.status) ? "always" : false,
  });
}
