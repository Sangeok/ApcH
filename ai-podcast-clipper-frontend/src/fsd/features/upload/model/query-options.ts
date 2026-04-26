import { queryOptions } from "@tanstack/react-query";
import { uploadedFileKeys } from "~/fsd/entities/uploaded-file/model/query-keys";
import { getUploadedFileDetails } from "../api";

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
