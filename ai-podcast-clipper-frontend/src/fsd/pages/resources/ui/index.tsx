import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
import {
  aboutCards,
  changelogEntries,
  contactCards,
  howItWorksFaq,
  howItWorksSteps,
  productCapabilities,
  securityCards,
  securityFaq,
  supportEmail,
} from "../config";
import type { ResourceCard } from "../model/types";

function ResourceCardGrid({ cards }: { cards: ResourceCard[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {cards.map((card) => (
        <Card key={card.title} className="h-full px-2 py-4">
          <CardHeader>
            <div className="text-primary flex items-center gap-3">
              <card.icon className="size-5" />
              <CardTitle className="text-lg">{card.title}</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm leading-relaxed">
              {card.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

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

export function ChangelogPage() {
  return (
    <>
      <SeoPageHero
        eyebrow="Changelog"
        title="AI Podcast Clipper Changelog"
        description="Public product updates, SEO surface changes, and workflow improvements for AI Podcast Clipper."
        primaryCta={{ label: "Read guides", href: "/guides" }}
        secondaryCta={{ label: "Read how it works", href: "/how-it-works" }}
      />

      <SeoSection
        eyebrow="Updates"
        title="Recent public changes"
        description="Only visible product, content, or workflow changes are listed here."
      >
        <div className="space-y-4">
          {changelogEntries.map((entry) => (
            <article
              key={`${entry.date}-${entry.title}`}
              className="border-border/80 bg-card/80 rounded-xl border p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary">{entry.date}</Badge>
                <h2 className="text-foreground text-lg font-semibold">
                  {entry.title}
                </h2>
              </div>
              <ul className="text-muted-foreground mt-4 list-disc space-y-1 pl-5 text-sm">
                {entry.changes.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Next"
        title="Follow the public roadmap"
        description="The next public improvements should be based on Search Console data and real creator workflow feedback."
      >
        <Button asChild variant="outline" className="gap-2">
          <Link href="/guides">
            Read creator guides
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </SeoSection>
    </>
  );
}
