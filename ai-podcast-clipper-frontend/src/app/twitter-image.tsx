import { ImageResponse } from "next/og";
import { OG_IMAGE_ALT, OG_IMAGE_SIZE, OgCard } from "./_metadata/og-card";

export const alt = OG_IMAGE_ALT;
export const size = OG_IMAGE_SIZE;
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(<OgCard />, size);
}
