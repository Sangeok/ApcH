import { FaqSection } from "~/fsd/shared/ui/atoms/faq-section";
import { SeoPageHero } from "~/fsd/shared/ui/atoms/seo-page-hero";
import { SeoSection } from "~/fsd/shared/ui/atoms/seo-section";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/fsd/shared/ui/atoms/card";
import { ResourceCardGrid } from "~/fsd/shared/ui/atoms/resource-card-grid";
import { securityCards, securityFaq } from "../config";

export function SecurityPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Security"
        title="Security and Data Handling"
        description="AI Podcast Clipper handles private podcast uploads through scoped storage, signed URLs, authenticated dashboard access, and explicit creator review before publishing."
        primaryCta={{ label: "See how it works", href: "/how-it-works" }}
        secondaryCta={{ label: "Contact support", href: "/contact" }}
      />

      <SeoSection
        eyebrow="File handling"
        title="How uploaded media is protected"
        description="Uploads and generated clips are treated as private workflow assets, not public media pages."
      >
        <ResourceCardGrid cards={securityCards} />
      </SeoSection>

      <SeoSection
        eyebrow="Boundaries"
        title="What this security page does and does not claim"
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="px-2 py-4">
            <CardHeader>
              <CardTitle>Current protections</CardTitle>
              <CardDescription>
                Per-user S3 prefixes, signed URLs, authenticated dashboard
                access, and delete controls are part of the product workflow.
              </CardDescription>
            </CardHeader>
          </Card>
          <Card className="px-2 py-4">
            <CardHeader>
              <CardTitle>Creator responsibility</CardTitle>
              <CardDescription>
                Creators remain responsible for source rights, guest consent,
                publishing context, and final review before distributing clips.
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </SeoSection>

      <FaqSection items={securityFaq} />
    </>
  );
}
