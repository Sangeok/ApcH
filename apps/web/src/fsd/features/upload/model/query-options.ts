import { queryOptions } from "@tanstack/react-query";
import {
  ACTIVE_UPLOAD_POLLING_INTERVAL_MS,
  type ActiveUploadedFileQueueState,
  uploadedFileKeys,
  type UploadedFileSummary,
} from "~/fsd/entities/uploaded-file";
import {
  getUploadedFileDetails,
  listCurrentUserActiveUploadedFileQueueState,
  listCurrentUserUploadedFileSummaries,
} from "../api";

export const uploadedFileDetailQueryOptions = (uploadedFileId: string) =>
  queryOptions({
    queryKey: uploadedFileKeys.detail(uploadedFileId),
    queryFn: async () => {
      const uploadedFileData = await getUploadedFileDetails(uploadedFileId);

      if (!uploadedFileData) {
        throw new Error("Upload detail not found");
      }

      return uploadedFileData;
    },
  });

export const currentUserUploadedFileListQueryOptions = (
  userId: string,
  initialData: UploadedFileSummary[],
) =>
  queryOptions({
    queryKey: uploadedFileKeys.currentUserList(userId),
    queryFn: async () => listCurrentUserUploadedFileSummaries(),
    initialData,
    staleTime: 60_000,
  });

export const currentUserActiveUploadQueueQueryOptions = (
  userId: string,
  initialData: ActiveUploadedFileQueueState,
) =>
  queryOptions({
    queryKey: uploadedFileKeys.currentUserActiveQueue(userId),
    queryFn: async () => listCurrentUserActiveUploadedFileQueueState(),
    initialData,
    refetchInterval: (query) => {
      const queueState = query.state.data;

      if (!queueState?.activeUploadedFileIds.length) {
        return false;
      }

      return ACTIVE_UPLOAD_POLLING_INTERVAL_MS;
    },
    refetchIntervalInBackground: false,
  });
