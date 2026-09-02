export const uploadedFileKeys = {
  all: ["uploadedFiles"] as const,

  // lists() 아래에는 UploadedFileSummary[] 형태만 둔다. 활성 큐는 객체라
  // 같은 접두사에 섞이면 (a) 목록 프룬이 그것까지 filter하고 (b) 무관한
  // invalidate가 7.5초 폴을 함께 깨운다.
  lists: () => [...uploadedFileKeys.all, "list"] as const,
  currentUserList: (userId: string) =>
    [...uploadedFileKeys.lists(), "current-user", userId] as const,

  activeQueues: () => [...uploadedFileKeys.all, "active-queue"] as const,
  currentUserActiveQueue: (userId: string) =>
    [...uploadedFileKeys.activeQueues(), userId] as const,

  details: () => [...uploadedFileKeys.all, "detail"] as const,
  detail: (uploadedFileId: string) =>
    [...uploadedFileKeys.details(), uploadedFileId] as const,
  transcript: (uploadedFileId: string) =>
    [...uploadedFileKeys.details(), uploadedFileId, "transcript"] as const,
};
