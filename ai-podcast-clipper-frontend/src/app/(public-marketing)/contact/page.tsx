import { type Metadata } from "next";
import { supportEmail } from "~/fsd/pages/resources/config";
import { ContactPage } from "~/fsd/pages/resources/ui";
import { SITE_NAME, absoluteSiteUrl } from "~/fsd/shared/lib/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact AI Podcast Clipper for account, upload, processing, billing, security, and playback support.",
  alternates: { canonical: absoluteSiteUrl("/contact") },
  openGraph: {
    title: "Contact AI Podcast Clipper",
    description:
      "Support route for AI Podcast Clipper account, upload, processing, billing, and security questions.",
    locale: "en_US",
    url: absoluteSiteUrl("/contact"),
    type: "website",
  },
};

export default function Page() {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ContactPage",
    name: "Contact AI Podcast Clipper",
    url: absoluteSiteUrl("/contact"),
    about: {
      "@type": "SoftwareApplication",
      name: SITE_NAME,
      url: absoluteSiteUrl("/"),
    },
    email: supportEmail,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ContactPage />
    </>
  );
}
