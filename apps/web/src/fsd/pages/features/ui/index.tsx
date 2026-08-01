import Link from "next/link";
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
import { detailedFeatures, featureComparison, featuresFaq } from "../config";

export default function FeaturesPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Features"
        title="Podcast Clipper Features Built for Short-Form Video Workflows"
        description="Highlight detection, word-level captions, vertical framing, selectable caption language, and a single dashboard to review every result."
        primaryCta={{ label: "Try it free", href: "/login" }}
        secondaryCta={{ label: "See pricing", href: "/pricing" }}
      />

      <SeoSection
        eyebrow="Capabilities"
        title="Six pieces that replace a five-tab workflow"
        description="Each feature is automated end-to-end so you never need to leave the app for a separate transcription or cropping tool."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {detailedFeatures.map((feature) => (
            <Card key={feature.title} className="h-full px-2 py-4">
              <CardHeader className="space-y-3">
                <div className="text-primary flex items-center gap-3">
                  <feature.icon className="size-5" />
                  <Badge variant="outline" className="text-xs uppercase">
                    {feature.badge}
                  </Badge>
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
                <CardDescription>{feature.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
                  {feature.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Manual vs automated"
        title="Where the time actually goes"
        description="Manual short-form workflows fan out into multiple tools. The AI pipeline collapses them into one upload."
      >
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-muted/40 text-muted-foreground text-left">
                <th className="px-4 py-3 font-medium">Capability</th>
                <th className="px-4 py-3 font-medium">Manual workflow</th>
                <th className="px-4 py-3 font-medium">AI Podcast Clipper</th>
              </tr>
            </thead>
            <tbody>
              {featureComparison.map((row) => (
                <tr key={row.capability} className="border-t align-top">
                  <td className="text-foreground px-4 py-3 font-medium">
                    {row.capability}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {row.manual}
                  </td>
                  <td className="text-muted-foreground px-4 py-3">
                    {row.automated}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Pipeline"
        title="Want the processing details?"
        description="The how-it-works page explains upload storage, transcription, highlight selection, active speaker framing, captions, rendering, and dashboard review."
      >
        <Button asChild variant="outline">
          <Link href="/how-it-works">Read how it works</Link>
        </Button>
      </SeoSection>

      <FaqSection items={featuresFaq} />
    </>
  );
}
