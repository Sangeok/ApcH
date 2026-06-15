import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Clock } from "lucide-react";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { FaqSection } from "~/fsd/shared/ui/atoms/faq-section";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import { guidePages } from "../config";
import type { GuidePageData } from "../model/types";

export function GuidesIndexPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Guides"
        title="Podcast Clipping Guides for Short-Form Video"
        description="Practical guides for podcast creators turning long-form episodes into YouTube Shorts, Reels, and TikTok-ready clips."
        primaryCta={{ label: "Try it free", href: "/login" }}
        secondaryCta={{ label: "How it works", href: "/how-it-works" }}
      />

      <SeoSection
        eyebrow="Resource library"
        title="Start with the workflow question you have now"
        description="Each guide is written around a specific creator decision: what to clip, how long it should be, how captions should work, and how to review before publishing."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {guidePages.map((guide) => (
            <Card key={guide.slug} className="h-full px-2 py-4">
              <CardHeader>
                <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
                  <span className="flex items-center gap-1">
                    <BookOpen className="size-3.5" />
                    {guide.primaryIntent}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="size-3.5" />
                    {guide.readingTime}
                  </span>
                </div>
                <CardTitle className="text-xl">{guide.title}</CardTitle>
                <CardDescription>{guide.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button asChild variant="outline" className="gap-2">
                  <Link href={`/guides/${guide.slug}`}>
                    Read guide
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>
    </>
  );
}

export function GuideDetailPage({ guide }: { guide: GuidePageData }) {
  return (
    <>
      <SeoPageHero
        eyebrow="Guide"
        title={guide.title}
        description={guide.description}
        primaryCta={{ label: "Try it free", href: "/login" }}
        secondaryCta={{ label: "All guides", href: "/guides" }}
      />

      <article className="space-y-12">
        <div className="text-muted-foreground flex flex-wrap gap-3 text-sm">
          <Badge variant="secondary">{guide.primaryIntent}</Badge>
          <span className="flex items-center gap-1">
            <Clock className="size-4" />
            {guide.readingTime}
          </span>
          <span className="flex items-center gap-1">
            <CalendarDays className="size-4" />
            Updated {guide.updatedAt}
          </span>
        </div>

        {guide.sections.map((section) => (
          <section key={section.title} className="space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              {section.title}
            </h2>
            <div className="text-muted-foreground space-y-3 leading-relaxed">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
            {section.bullets ? (
              <ul className="text-muted-foreground list-disc space-y-1 pl-5">
                {section.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </article>

      <SeoSection
        eyebrow="Checklist"
        title="Before publishing a generated clip"
      >
        <ul className="grid gap-3 sm:grid-cols-2">
          {guide.checklist.map((item) => (
            <li
              key={item}
              className="border-border/80 bg-card/80 rounded-xl border p-4 text-sm"
            >
              {item}
            </li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection
        eyebrow="Related"
        title="Next pages to compare with this guide"
      >
        <div className="flex flex-wrap gap-3">
          {guide.relatedPaths.map((path) => (
            <Button key={path.href} asChild variant="outline">
              <Link href={path.href}>{path.label}</Link>
            </Button>
          ))}
        </div>
      </SeoSection>

      <FaqSection items={guide.faq} />
    </>
  );
}
