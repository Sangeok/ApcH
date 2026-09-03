import { type Metadata } from "next";
import { supportEmail } from "~/fsd/shared/config/product-copy";
import { ContactPage } from "~/fsd/pages/contact/ui";
import { SITE_NAME, absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";

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
      <JsonLd data={jsonLd} />
      <ContactPage />
    </>
  );
}
