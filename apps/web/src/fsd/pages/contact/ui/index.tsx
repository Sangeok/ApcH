import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import { ResourceCardGrid } from "~/fsd/shared/ui/atoms/resource-card-grid";
import { contactCards } from "../config";
import { supportEmail } from "~/fsd/shared/config/product-copy";

export function ContactPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Contact"
        title="Contact AI Podcast Clipper"
        description="Use the support email for account, upload, processing, billing, and security questions. Include enough context to reproduce the issue without sharing private keys or passwords."
        primaryCta={{
          label: "Email support",
          href: `mailto:${supportEmail}`,
        }}
        secondaryCta={{ label: "Read security notes", href: "/security" }}
      />

      <SeoSection
        eyebrow="Support routes"
        title="What to include in your message"
        description={`Send support questions to ${supportEmail}. The more specific the report, the faster it can be investigated.`}
      >
        <ResourceCardGrid cards={contactCards} />
      </SeoSection>

      <SeoSection
        eyebrow="Useful context"
        title="A short checklist before sending"
      >
        <ul className="text-muted-foreground list-disc space-y-2 pl-5">
          <li>Account email used to sign in with Google.</li>
          <li>Approximate upload time and file size.</li>
          <li>
            Whether the issue is upload, processing, playback, billing, or
            deletion.
          </li>
          <li>
            Browser and device if the issue is visual or playback related.
          </li>
          <li>Do not send passwords, private keys, or full payment details.</li>
        </ul>
      </SeoSection>
    </>
  );
}
