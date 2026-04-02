import { type MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ?? "https://apc-h.vercel.app/";

export default function sitemap(): MetadataRoute.Sitemap {
  // 페이지 내용이 실제로 변경될 때 이 날짜를 갱신한다.
  // new Date()를 사용하면 빌드/요청마다 날짜가 바뀌어
  // 검색엔진이 정적 페이지를 불필요하게 재크롤링한다.
  const LAST_UPDATED = new Date("2026-03-22");

  return [
    {
      url: SITE_URL,
      lastModified: LAST_UPDATED,
      changeFrequency: "weekly",
      priority: 1.0,
    },
    {
      url: `${SITE_URL}terms`,
      lastModified: LAST_UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
    {
      url: `${SITE_URL}privacy`,
      lastModified: LAST_UPDATED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  ];
}
