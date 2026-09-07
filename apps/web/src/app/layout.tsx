import "~/styles/globals.css";

import { type Metadata } from "next";
import { Anton, Geist, Noto_Sans_KR } from "next/font/google";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  absoluteSiteUrl,
} from "~/fsd/shared/lib/site";
import Providers from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s | ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: [
    "podcast clipper",
    "AI podcast clips",
    "podcast to shorts",
    "podcast highlight generator",
    "short-form video from podcast",
    "podcast clip maker",
    "auto subtitles podcast",
    "AI video editor",
    "podcast shorts creator",
    "podcast highlights reel",
  ],
  authors: [{ name: "SangEok" }],
  creator: "SangEok",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: absoluteSiteUrl("/"),
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: absoluteSiteUrl("/"),
  },
};

const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

const anton = Anton({
  subsets: ["latin"],
  weight: "400", // main.py:360 Anton-Regular
  variable: "--font-anton",
});

// 미리보기는 영어 원문만 표시(한국어는 렌더 시 번역)하므로 latin 서브셋으로 충분하다.
// 한글 서브셋은 크므로 preload하지 않는다 — 필요한 것은 폰트 메트릭(EM_SCALE)과 패밀리다.
const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: "700", // main.py:74 NotoSansKR-Bold
  variable: "--font-noto-sans-kr",
  preload: false,
});

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geist.variable} ${anton.variable} ${notoSansKr.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
