import {
  Captions,
  Download,
  ScanFace,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import type { ResourceCard } from "~/fsd/shared/ui/atoms/resource-card-grid";

/**
 * 라우트 하나에 속하지 않는 제품 카피.
 *
 * `pages/resources`가 라우트 다섯의 페이지를 한 슬라이스에 담고 있던 동안에는
 * 그 슬라이스의 config가 이 자리였다. 슬라이스를 나누면서, 둘 이상의 라우트가
 * 쓰는 것만 여기로 올린다.
 */
export const supportEmail = "hamsoo159@gmail.com";

export const productCapabilities: ResourceCard[] = [
  {
    title: "Upload",
    description: "Accepts podcast-style .mp4 files up to 900 MB per upload.",
    icon: UploadCloud,
  },
  {
    title: "Highlight selection",
    description:
      "Scores transcript segments and selects 1-4 clips per upload based on the requested run settings.",
    icon: Sparkles,
  },
  {
    title: "Captions",
    description:
      "Supports English or Korean captions selected per processing run.",
    icon: Captions,
  },
  {
    title: "Vertical output",
    description:
      "Exports 1080x1920 .mp4 clips for YouTube Shorts, Instagram Reels, and TikTok review workflows.",
    icon: ScanFace,
  },
  {
    title: "Download",
    description:
      "Generated clips are played and downloaded from the authenticated dashboard through signed URLs.",
    icon: Download,
  },
];
