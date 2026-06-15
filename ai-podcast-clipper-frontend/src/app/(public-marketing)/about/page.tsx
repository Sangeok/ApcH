import { type Metadata } from "next";
import { AboutPage } from "~/fsd/pages/resources/ui";
import { SITE_NAME, absoluteSiteUrl } from "~/fsd/shared/lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Learn what AI Podcast Clipper is, who operates it, and how it helps podcast creators turn long-form episodes into reviewable short-form clips.",
  alternates: { canonical: absoluteSiteUrl("/about") },
  openGraph: {
    title: "About AI Podcast Clipper",
    description:
      "A focused SaaS for turning podcast uploads into short-form, captioned, vertical clips.",
    locale: "en_US",
    url: absoluteSiteUrl("/about"),
    type: "website",
  },
};

export default function Page() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: absoluteSiteUrl("/"),
    founder: {
      "@type": "Person",
      name: "SangEok",
    },
    sameAs: [absoluteSiteUrl("/")],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <AboutPage />
    </>
  );
}
