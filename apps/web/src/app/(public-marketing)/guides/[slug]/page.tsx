import { type Metadata } from "next";
import { notFound } from "next/navigation";
import { getGuideBySlug, guidePages } from "~/fsd/pages/guides/config";
import { GuideDetailPage } from "~/fsd/pages/guides/ui";
import { generateFaqJsonLd } from "~/fsd/shared/lib/seo";
import { SITE_NAME, absoluteSiteUrl } from "~/fsd/shared/lib/site";
import { JsonLd } from "~/fsd/shared/ui/atoms/json-ld";

interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return guidePages.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({
  params,
}: GuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);

  if (!guide) {
    return {
      title: "Guide Not Found",
    };
  }

  const canonical = absoluteSiteUrl(`/guides/${guide.slug}`);

  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical },
    openGraph: {
      title: guide.title,
      description: guide.description,
      locale: "en_US",
      url: canonical,
      type: "article",
      publishedTime: guide.updatedAt,
      modifiedTime: guide.updatedAt,
    },
  };
}

export default async function Page({ params }: GuidePageProps) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);

  if (!guide) {
    notFound();
  }

  const articleJsonLd = {
    "@type": "Article",
    headline: guide.title,
    description: guide.description,
    datePublished: guide.updatedAt,
    dateModified: guide.updatedAt,
    author: {
      "@type": "Organization",
      name: SITE_NAME,
      url: absoluteSiteUrl("/"),
    },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      url: absoluteSiteUrl("/"),
    },
    mainEntityOfPage: absoluteSiteUrl(`/guides/${guide.slug}`),
  };

  const breadcrumbJsonLd = {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Guides",
        item: absoluteSiteUrl("/guides"),
      },
      {
        "@type": "ListItem",
        position: 2,
        name: guide.title,
        item: absoluteSiteUrl(`/guides/${guide.slug}`),
      },
    ],
  };

  const faqJsonLd = generateFaqJsonLd(guide.faq);

  return (
    <>
      <JsonLd data={{
            "@context": "https://schema.org",
            "@graph": [articleJsonLd, breadcrumbJsonLd, faqJsonLd],
          }} />
      <GuideDetailPage guide={guide} />
    </>
  );
}
