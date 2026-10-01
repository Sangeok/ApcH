import { resolveVideoPaddingPercent } from "~/fsd/shared/config/video-framing";

export function requestVideoFraming(snapshot: unknown) {
  return { video_padding_percent: resolveVideoPaddingPercent(snapshot) };
}
