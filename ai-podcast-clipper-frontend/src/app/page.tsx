import { type Metadata } from "next";
import { getHomeUserProfile } from "~/fsd/entities/user";
import HomePage from "~/fsd/pages/home/ui";
import { generateWebApplicationJsonLd } from "~/fsd/shared/lib/seo";
import { SITE_NAME, absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { auth } from "~/server/auth";

export const metadata: Metadata = {
  title: "Turn Your Podcast into Short-Form Clips with AI",
  description:
    "Upload your podcast video and AI finds the best Q&A highlights, adds captions, and exports vertical short-form clips. Powered by Gemini 2.5 + WhisperX. English & Korean subtitles supported.",
  alternates: {
    canonical: absoluteSiteUrl("/"),
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    alternateLocale: "ko_KR",
    siteName: SITE_NAME,
    title: "AI Podcast Clipper",
    description:
      "AI automatically detects podcast highlights and creates captioned vertical clips in minutes.",
    url: absoluteSiteUrl("/"),
  },
};

export default async function Home() {
  const session = await auth();
  const userId = session?.user?.id;
  const isLoggedIn = !!userId;

  let email: string | null = null;
  let image: string | null = null;

  if (userId) {
    const user = await getHomeUserProfile(userId);

    email = user.email;
    image = user.image;
  }

  const jsonLd = generateWebApplicationJsonLd();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <HomePage isLoggedIn={isLoggedIn} email={email} image={image} />
    </>
  );
}
