/**
 * 공개(마케팅·법률) 라우트 경로의 정본 목록.
 *
 * 같은 문자열이 푸터 그룹 15개 href, 헤더 nav 4개, sitemap 표에 흩어져 있어서
 * 라우트 하나를 개명하면 컴파일은 통과하고 링크만 조용히 404가 됐다.
 * 여기 없는 경로는 아래 두 표에 넣을 수 없다.
 *
 * ⚠️ `src/app/(public-marketing)/` 아래 디렉터리 이름과 짝을 이룬다.
 * 디렉터리를 옮기면 여기도 함께 고칠 것 — 파일 시스템 라우팅은 타입이 없다.
 *
 * sitemap과 robots는 의도적으로 여기에 묶지 않는다. sitemap은 동적 경로
 * (`/guides/<slug>`·`/compare/<slug>`)를 함께 싣고, robots는 **비공개** 경로를
 * 열거한다 — 세 관심사를 한 목록에 과결합하지 않는다.
 */
export const PUBLIC_ROUTES = [
  "/",
  "/features",
  "/pricing",
  "/product-tour",
  "/guides",
  "/compare",
  "/how-it-works",
  "/changelog",
  "/about",
  "/security",
  "/contact",
  "/ai-podcast-clipper",
  "/podcast-to-shorts",
  "/youtube-shorts-generator",
  "/terms",
  "/privacy",
] as const;

export type PublicRoutePath = (typeof PUBLIC_ROUTES)[number];

/** 푸터·헤더 nav 항목의 공통 형태. */
export type PublicNavLink = {
  label: string;
  href: PublicRoutePath;
};
