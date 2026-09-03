import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import { ResourceCardGrid } from "~/fsd/shared/ui/atoms/resource-card-grid";
import { aboutCards } from "../config";
import { productCapabilities } from "~/fsd/shared/config/product-copy";

export function AboutPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="About"
        title="About AI Podcast Clipper"
        description="AI Podcast Clipper is a focused web app for turning long-form podcast videos into short-form, captioned, vertical clips that creators can review and publish."
        primaryCta={{ label: "See how it works", href: "/how-it-works" }}
        secondaryCta={{ label: "Contact support", href: "/contact" }}
      />

      <SeoSection
        eyebrow="Product focus"
        title="A narrow tool for a specific creator workflow"
        description="The product is intentionally focused on podcast-style dialogue. It does not try to replace a full editing suite or publish automatically on your behalf."
      >
        <ResourceCardGrid cards={aboutCards} />
      </SeoSection>

      <SeoSection
        eyebrow="What it does"
        title="The current public product surface"
        description="These are the product capabilities described across the public pages and reflected in the app workflow."
      >
        <ResourceCardGrid cards={productCapabilities} />
      </SeoSection>

      <SeoSection
        eyebrow="Transparency"
        title="What creators should still review"
        description="AI can find and render useful moments, but final publishing judgment remains with the creator."
      >
        <ul className="text-muted-foreground grid gap-3 sm:grid-cols-2">
          {[
            "Whether the clip has enough context for a new viewer.",
            "Whether the speaker, source material, and brand have publishing rights.",
            "Whether captions are accurate enough for the target channel.",
            "Whether the selected moment matches the creator's positioning.",
          ].map((item) => (
            <li key={item} className="rounded-lg border p-4 text-sm">
              {item}
            </li>
          ))}
        </ul>
      </SeoSection>
    </>
  );
}
