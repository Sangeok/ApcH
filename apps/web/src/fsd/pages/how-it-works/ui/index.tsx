import { FaqSection } from "~/fsd/shared/ui/atoms/faq-section";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import { ResourceCardGrid } from "~/fsd/shared/ui/atoms/resource-card-grid";
import { howItWorksSteps, howItWorksFaq } from "../config";
import { productCapabilities } from "~/fsd/shared/config/product-copy";

export function HowItWorksPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="How it works"
        title="How AI Podcast Clipper Turns Podcasts Into Shorts"
        description="The pipeline combines upload storage, transcription, AI highlight selection, active speaker framing, captions, rendering, and dashboard review."
        primaryCta={{ label: "Try it free", href: "/login" }}
        secondaryCta={{ label: "See security", href: "/security" }}
      />

      <SeoSection
        eyebrow="Pipeline"
        title="The processing flow"
        description="Each stage has a narrow job. That makes the output easier to understand, inspect, and improve."
      >
        <ol className="space-y-4">
          {howItWorksSteps.map((step, index) => (
            <li
              key={step.title}
              className="border-border/80 bg-card/80 rounded-xl border p-5 shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary flex size-10 items-center justify-center rounded-lg font-semibold">
                  {index + 1}
                </div>
                <h2 className="text-foreground text-base font-semibold">
                  {step.title}
                </h2>
              </div>
              <p className="text-muted-foreground mt-3 leading-relaxed">
                {step.description}
              </p>
            </li>
          ))}
        </ol>
      </SeoSection>

      <SeoSection
        eyebrow="Best fit"
        title="When results tend to work best"
        description="The app is strongest when the source episode contains clear, self-contained conversation moments."
      >
        <ResourceCardGrid cards={productCapabilities} />
      </SeoSection>

      <FaqSection items={howItWorksFaq} />
    </>
  );
}
