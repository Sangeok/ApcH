import { usePlayUrl } from "~/fsd/shared/hooks/usePlayUrl";
import { getClipPlayUrl } from "~/fsd/features/clip/api";

export function useClipPlayUrl(clipId: string) {
  return usePlayUrl(clipId, getClipPlayUrl);
}
