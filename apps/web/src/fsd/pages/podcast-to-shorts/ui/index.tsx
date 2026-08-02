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
  podcastToShortsFaq,
  podcastToShortsPlatforms,
  podcastToShortsWorkflow,
} from "../config";

export default function PodcastToShortsPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Podcast to Shorts"
        title="Turn Podcasts Into Shorts With AI"
        description="A 90 minute podcast does not become Shorts in a vacuum. AI Podcast Clipper finds the moments that survive in a 60 second window and ships them captioned and vertical."
        primaryCta={{ label: "Try it free", href: "/login" }}
        secondaryCta={{ label: "See features", href: "/features" }}
      />

      <SeoSection
        eyebrow="Why podcasts are hard to clip manually"
        title="Manual clipping fails on long-form conversation"
        description="Podcast hosts move between setup, joke, and payoff. Picking a clip that lands without context is a separate skill - and it does not scale across an entire show."
      >
        <ul className="text-muted-foreground list-disc space-y-2 pl-5">
          <li>
            Most highlight tools target keynote talks, not back-and-forth
            dialogue.
          </li>
          <li>
            Hand-editing a single Short can take 20-30 minutes per clip once you
            include cropping and captioning.
          </li>
          <li>
            Multi-language publishing doubles the manual cost without adding new
            highlights.
          </li>
        </ul>
      </SeoSection>

      <SeoSection
        eyebrow="Workflow"
        title="From upload to published-ready in one pass"
      >
        <ol className="space-y-4">
          {podcastToShortsWorkflow.map((step, index) => (
            <li
              key={step.title}
              className="border-border/80 bg-card/80 rounded-2xl border p-5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-2xl font-semibold">
                  {index + 1}
                </div>
                <p className="text-foreground text-base font-semibold">
                  {step.title}
                </p>
              </div>
              <p className="text-muted-foreground mt-3">{step.description}</p>
            </li>
          ))}
        </ol>
      </SeoSection>

      <SeoSection
        eyebrow="Where the clips ship"
        title="One export, every short-form surface"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {podcastToShortsPlatforms.map((platform) => (
            <Card key={platform.platform} className="h-full px-2 py-4">
              <CardHeader>
                <div className="text-primary flex items-center gap-3">
                  <platform.icon className="size-5" />
                  <CardTitle className="text-lg">{platform.platform}</CardTitle>
                </div>
                <CardDescription>{platform.spec}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">
                  {platform.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Review"
        title="Treat generated clips as review candidates"
        description="Before publishing a Short, confirm source rights, guest consent, caption accuracy, and whether the selected moment still makes sense outside the full episode."
      >
        <Button asChild variant="outline">
          <Link href="/guides/how-to-make-podcast-clips-for-youtube-shorts">
            Read the clipping workflow guide
          </Link>
        </Button>
      </SeoSection>

      <SeoSection
        eyebrow="YouTube focus"
        title="Need a YouTube-specific workflow?"
        description="If YouTube Shorts is the primary channel, use the YouTube Shorts generator page for Shorts-specific requirements and review steps."
      >
        <Button asChild variant="outline">
          <Link href="/youtube-shorts-generator">
            See the YouTube Shorts generator
          </Link>
        </Button>
      </SeoSection>

      <FaqSection items={podcastToShortsFaq} />
    </>
  );
}
