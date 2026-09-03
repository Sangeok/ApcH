import { type Metadata } from "next";
import { getHomeUserProfile } from "~/fsd/entities/user";
import HomePage from "~/fsd/pages/home/ui";
import { generateWebApplicationJsonLd } from "~/fsd/shared/lib/seo";
import { SITE_NAME, absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { auth } from "~/server/auth";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";
import PublicHeader from "~/fsd/widgets/site-header/ui/public-header";

export const metadata: Metadata = {
  title: "AI Podcast Clipper for YouTube Shorts",
  description:
    "Upload your podcast video and AI finds the best Q&A highlights, adds captions, and exports vertical short-form clips. Powered by Gemini 2.5 + WhisperX. English or Korean captions are selected per processing run.",
  alternates: {
    canonical: absoluteSiteUrl("/"),
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_NAME,
    title: "AI Podcast Clipper for YouTube Shorts",
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
      <JsonLd data={jsonLd} />
      <HomePage
        header={
          <PublicHeader isLoggedIn={isLoggedIn} email={email} image={image} />
        }
      />
    </>
  );
}
