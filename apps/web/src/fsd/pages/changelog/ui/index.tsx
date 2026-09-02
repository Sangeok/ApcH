import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import { changelogEntries } from "../config";

export function ChangelogPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Changelog"
        title="AI Podcast Clipper Changelog"
        description="Public product updates, SEO surface changes, and workflow improvements for AI Podcast Clipper."
        primaryCta={{ label: "Read guides", href: "/guides" }}
        secondaryCta={{ label: "Read how it works", href: "/how-it-works" }}
      />

      <SeoSection
        eyebrow="Updates"
        title="Recent public changes"
        description="Only visible product, content, or workflow changes are listed here."
      >
        <div className="space-y-4">
          {changelogEntries.map((entry) => (
            <article
              key={`${entry.date}-${entry.title}`}
              className="border-border/80 bg-card/80 rounded-xl border p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{entry.date}</Badge>
                <h2 className="text-foreground text-lg font-semibold">
                  {entry.title}
                </h2>
              </div>
              <ul className="text-muted-foreground mt-4 list-disc space-y-1 pl-5 text-sm">
                {entry.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Next"
        title="Follow the public roadmap"
        description="The next public improvements should be based on Search Console data and real creator workflow feedback."
      >
        <Button asChild variant="outline" className="gap-2">
          <Link href="/guides">
            Read creator guides
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </SeoSection>
    </>
  );
}
