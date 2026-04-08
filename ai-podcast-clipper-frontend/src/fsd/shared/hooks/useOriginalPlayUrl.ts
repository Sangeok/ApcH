import { usePlayUrl } from "~/fsd/shared/hooks/usePlayUrl";
import { getOriginalPlayUrl } from "~/fsd/features/upload/api";

export function useOriginalPlayUrl(fileId: string) {
  return usePlayUrl(fileId, getOriginalPlayUrl);
}
