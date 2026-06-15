import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "~/fsd/shared/ui/atoms/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { FaqSection } from "~/fsd/shared/ui/atoms/faq-section";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import { comparePages, manualEditingComparison } from "../config";
import type { ComparePageData } from "../model/types";

export function CompareIndexPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Compare"
        title="Compare Podcast Clipping Workflows"
        description="Use these comparisons to decide when manual editing, AI-assisted clipping, or a hybrid workflow makes sense for podcast clips."
        primaryCta={{ label: "Read guides", href: "/guides" }}
        secondaryCta={{ label: "How it works", href: "/how-it-works" }}
      />

      <SeoSection
        eyebrow="Workflow comparison"
        title="Start with the tradeoff, not the tool"
        description="The first comparison is intentionally not a competitor page. It focuses on the operational choice creators make before picking a workflow."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {comparePages.map((page) => (
            <Card key={page.slug} className="h-full px-2 py-4">
              <CardHeader>
                <CardTitle>{page.title}</CardTitle>
                <CardDescription>{page.description}</CardDescription>
              </CardHeader>
              <div className="px-6">
                <Button asChild variant="outline" className="gap-2">
                  <Link href={page.href}>
                    Read comparison
                    <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </SeoSection>
    </>
  );
}

function ComparisonTable({ page }: { page: ComparePageData }) {
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="bg-muted/40 text-muted-foreground text-left">
            <th className="px-4 py-3 font-medium">Criterion</th>
            <th className="px-4 py-3 font-medium">Manual editing</th>
            <th className="px-4 py-3 font-medium">AI-assisted clipping</th>
          </tr>
        </thead>
        <tbody>
          {page.rows.map((row) => (
            <tr key={row.criterion} className="border-t align-top">
              <td className="text-foreground px-4 py-3 font-medium">
                {row.criterion}
              </td>
              <td className="text-muted-foreground px-4 py-3">{row.manual}</td>
              <td className="text-muted-foreground px-4 py-3">
                {row.aiAssisted}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ManualEditingComparisonPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Workflow comparison"
        title={manualEditingComparison.title}
        description={manualEditingComparison.description}
        primaryCta={{ label: "Try AI Podcast Clipper", href: "/login" }}
        secondaryCta={{ label: "How it works", href: "/how-it-works" }}
      />

      <SeoSection
        eyebrow="Decision table"
        title="Where each workflow fits"
        description="This comparison is about workflow fit, not a claim that one method is always better."
      >
        <ComparisonTable page={manualEditingComparison} />
      </SeoSection>

      <SeoSection
        eyebrow="Practical recommendation"
        title="Use a hybrid workflow when quality matters"
        description="For recurring podcast publishing, use AI to create the first set of rendered candidates, then apply human judgment to decide which clips deserve publishing."
      >
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link href="/guides/how-to-make-podcast-clips-for-youtube-shorts">
              Read the clipping workflow guide
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/how-it-works">See the processing pipeline</Link>
          </Button>
        </div>
      </SeoSection>

      <FaqSection items={manualEditingComparison.faq} />
    </>
  );
}
