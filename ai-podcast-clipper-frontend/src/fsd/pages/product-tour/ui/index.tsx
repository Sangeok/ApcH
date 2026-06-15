import { Card, CardContent } from "~/fsd/shared/ui/atoms/card";
import { FaqSection } from "~/fsd/shared/ui/atoms/faq-section";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import {
  productTourFaq,
  productTourOutcomes,
  productTourSteps,
} from "../config";

export default function ProductTourPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Product tour"
        title="See How AI Podcast Clipper Turns Podcasts Into Shorts"
        description="Walk through the full pipeline before you sign up: upload, AI highlight detection, captioned vertical framing, and dashboard review."
        primaryCta={{ label: "Try it free", href: "/login" }}
        secondaryCta={{ label: "How it works", href: "/how-it-works" }}
      />

      <SeoSection
        eyebrow="Workflow"
        title="Four steps from upload to publishable clip"
        description="The processing pipeline is fully automated. You only interact with the upload and the review screen."
      >
        <ol className="space-y-4">
          {productTourSteps.map((step) => (
            <li
              key={step.index}
              className="border-border/80 bg-card/80 rounded-2xl border p-5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-2xl font-semibold">
                  {step.index}
                </div>
                <div className="flex items-center gap-2">
                  <step.icon className="text-primary size-5" />
                  <p className="text-foreground text-base font-semibold">
                    {step.title}
                  </p>
                </div>
              </div>
              <p className="text-muted-foreground mt-3">{step.description}</p>
            </li>
          ))}
        </ol>
      </SeoSection>

      <SeoSection
        eyebrow="Output"
        title="What you actually get"
        description="The output is shaped for short-form publishing. No extra crop, caption, or rendering tools are required afterwards."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {productTourOutcomes.map((outcome) => (
            <Card key={outcome.title} className="h-full px-2 py-4">
              <CardContent className="space-y-3">
                <outcome.icon className="text-primary size-5" />
                <p className="text-foreground text-base font-semibold">
                  {outcome.title}
                </p>
                <p className="text-muted-foreground text-sm">
                  {outcome.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>

      <FaqSection items={productTourFaq} />
    </>
  );
}
