import { type MetadataRoute } from "next";
import { absoluteSiteUrl } from "~/fsd/shared/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/dashboard", "/api/", "/login"],
      },
    ],
    sitemap: absoluteSiteUrl("/sitemap.xml"),
  };
}
