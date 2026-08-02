import Link from "next/link";
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
import {
  shortsCaptionTrack,
  shortsFaq,
  shortsReviewLoop,
  shortsSpecs,
} from "../config";

export default function YoutubeShortsGeneratorPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="YouTube Shorts Generator"
        title="YouTube Shorts Generator for Podcast Clips"
        description="Built specifically for podcast hosts who want YouTube Shorts. Vertical, captioned, and trimmed to the moments that survive without context."
        primaryCta={{ label: "Generate your first Short", href: "/login" }}
        secondaryCta={{
          label: "Compare to Reels and TikTok output",
          href: "/podcast-to-shorts",
        }}
      />

      <SeoSection
        eyebrow="Shorts-ready output"
        title="Every export already passes Shorts requirements"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {shortsSpecs.map((spec) => (
            <Card key={spec.label} className="h-full px-2 py-4">
              <CardHeader>
                <div className="text-primary flex items-center gap-3">
                  <spec.icon className="size-5" />
                  <CardTitle className="text-lg">{spec.label}</CardTitle>
                </div>
                <CardDescription>{spec.value}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  {spec.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Captions"
        title="Select English or Korean before processing"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {shortsCaptionTrack.map((track) => (
            <Card key={track.title} className="h-full px-2 py-4">
              <CardHeader>
                <CardTitle className="text-lg">{track.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  {track.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Review loop"
        title="What happens after the AI finishes"
        description="The dashboard is the single review surface - no second tool, no re-uploads."
      >
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          {shortsReviewLoop.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection
        eyebrow="Clip length"
        title="Choosing the right Short length"
        description="Podcast Shorts often need enough time for both the question and the answer. Use the length guide before deciding whether a moment should be 30, 40, or 60 seconds."
      >
        <Button asChild variant="outline">
          <Link href="/guides/best-podcast-clip-length-for-shorts">
            Read the clip length guide
          </Link>
        </Button>
      </SeoSection>

      <FaqSection items={shortsFaq} />
    </>
  );
}
