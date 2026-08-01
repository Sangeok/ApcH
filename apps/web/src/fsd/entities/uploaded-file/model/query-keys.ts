export interface UploadedFileListFilters {
  status?: string;
  page?: number;
  sort?: string;
}

export const uploadedFileKeys = {
  all: ["uploadedFiles"] as const,
  lists: () => [...uploadedFileKeys.all, "list"] as const,
  list: (filters: UploadedFileListFilters = {}) =>
    [...uploadedFileKeys.lists(), filters] as const,
  currentUserList: (userId: string) =>
    [...uploadedFileKeys.lists(), "current-user", userId] as const,
  currentUserActiveQueue: (userId: string) =>
    [...uploadedFileKeys.lists(), "current-user-active-queue", userId] as const,
  details: () => [...uploadedFileKeys.all, "detail"] as const,
  detail: (uploadedFileId: string) =>
    [...uploadedFileKeys.details(), uploadedFileId] as const,
};
