import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { FaqSection } from "~/fsd/shared/ui/atoms/faq-section";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import {
  clipperAudiences,
  clipperCapabilities,
  clipperFaq,
} from "../config";

export default function AiPodcastClipperPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="AI Podcast Clipper"
        title="AI Podcast Clipper for Long-Form Podcast Video"
        description="An AI podcast clipper is a tool that turns long conversational episodes into short-form clips automatically. This page explains what that actually means in practice - the model, the workflow, and who it is built for."
        primaryCta={{ label: "Try it free", href: "/login" }}
        secondaryCta={{ label: "See product tour", href: "/product-tour" }}
      />

      <SeoSection
        eyebrow="Definition"
        title="What an AI podcast clipper actually does"
        description="Three jobs that used to be three separate tools - highlight selection, vertical cropping, and captioning - collapse into one upload."
      >
        <ul className="text-muted-foreground list-disc space-y-2 pl-5">
          <li>Reads a long-form podcast .mp4 and transcribes it word-by-word.</li>
          <li>
            Scores conversational segments and picks 1-4 clips between 40 and 60
            seconds each.
          </li>
          <li>
            Renders each clip vertically with active-speaker framing and
            burned-in captions.
          </li>
        </ul>
      </SeoSection>

      <SeoSection
        eyebrow="Audience"
        title="Who AI Podcast Clipper is built for"
      >
        <div className="grid gap-4 md:grid-cols-2">
          {clipperAudiences.map((audience) => (
            <Card key={audience.audience} className="h-full px-2 py-4">
              <CardHeader>
                <div className="text-primary flex items-center gap-3">
                  <audience.icon className="size-5" />
                  <CardTitle className="text-lg">
                    {audience.audience}
                  </CardTitle>
                </div>
                <CardDescription>{audience.description}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </SeoSection>

      <SeoSection eyebrow="What is in the box" title="Capabilities at a glance">
        <ul className="space-y-3">
          {clipperCapabilities.map((row) => (
            <li
              key={row.capability}
              className="border-border/80 bg-card/80 rounded-2xl border p-4 shadow-sm"
            >
              <p className="text-foreground font-medium">{row.capability}</p>
              <p className="text-muted-foreground mt-1 text-sm">
                {row.description}
              </p>
            </li>
          ))}
        </ul>
      </SeoSection>

      <FaqSection items={clipperFaq} />
    </>
  );
}
