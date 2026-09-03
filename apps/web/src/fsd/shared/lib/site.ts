import { env } from "~/env";

const configuredSiteUrl = env.NEXT_PUBLIC_SITE_URL?.trim();
const baseSiteUrl =
  configuredSiteUrl === undefined || configuredSiteUrl === ""
    ? "https://a-pch.com"
    : configuredSiteUrl;

export const SITE_URL = baseSiteUrl.replace(/\/+$/, "");
export const SITE_NAME = "AI Podcast Clipper";
export const SITE_DESCRIPTION =
  "Automatically turn your podcast into viral short-form clips with AI. Upload once - get highlight clips with captions in minutes.";

export const OG_IMAGE_PATH = "/opengraph-image.png";

export function absoluteSiteUrl(path = "/") {
  return new URL(path, `${SITE_URL}/`).toString();
}
