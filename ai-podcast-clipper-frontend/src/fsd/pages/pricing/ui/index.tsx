import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { PLAN_TIERS } from "~/fsd/features/billing/config/plan-tiers";
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
  pricingFaq,
  pricingHighlights,
  pricingIncluded,
  pricingLimits,
} from "../config";

export default function PricingPage() {
  const free = PLAN_TIERS.free;
  const pro = PLAN_TIERS.pro;

  return (
    <>
      <SeoPageHero
        eyebrow="Pricing"
        title="AI Podcast Clipper Pricing"
        description="Start free with 3 credits. Credits are deducted after a successful processing run, one per generated clip with captions and vertical framing."
        primaryCta={{ label: "Start free with 3 credits", href: "/login" }}
        secondaryCta={{ label: "See product tour", href: "/product-tour" }}
      />

      <SeoSection
        eyebrow="Free trial at a glance"
        title="What you get without paying"
        description="The free trial mirrors the paid pipeline. Same models, same outputs, same dashboard."
      >
        <div className="grid gap-4 md:grid-cols-3">
          {pricingHighlights.map((highlight) => (
            <Card key={highlight.label} className="h-full px-2 py-4">
              <CardContent className="space-y-2">
                <p className="text-muted-foreground text-sm">
                  {highlight.label}
                </p>
                <p className="text-2xl font-semibold tracking-tight">
                  {highlight.value}
                </p>
                <p className="text-muted-foreground text-xs">
                  {highlight.footnote}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </SeoSection>

      <SeoSection
        eyebrow="Plans"
        title="Free trial and plan details"
        description="Create a free account to use trial credits. Paid checkout, when enabled for your account, is handled from the authenticated billing dashboard."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="h-full px-2 py-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{free.name}</CardTitle>
                <Badge variant="secondary">Trial</Badge>
              </div>
              <CardDescription>{free.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <span className="text-3xl font-bold">{free.price}</span>
              </div>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>{free.monthlyCredits} credits on signup</li>
                <li>Same pipeline as paid plans</li>
                <li>No credit card required</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-primary/40 h-full border-2 px-2 py-4">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{pro.name}</CardTitle>
                <Badge>Dashboard billing</Badge>
              </div>
              <CardDescription>{pro.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{pro.price}</span>
                <span className="text-muted-foreground text-sm">/month</span>
              </div>
              <ul className="text-muted-foreground space-y-1 text-sm">
                <li>{pro.monthlyCredits} credits / month</li>
                <li>Checkout and subscription management in dashboard</li>
                {pro.yearlyPrice ? <li>Yearly: {pro.yearlyPrice}</li> : null}
              </ul>
            </CardContent>
          </Card>
        </div>
      </SeoSection>

      <SeoSection eyebrow="Included" title="Every plan includes">
        <ul className="grid gap-3 sm:grid-cols-2">
          {pricingIncluded.map((item) => (
            <li
              key={item}
              className="text-muted-foreground flex items-start gap-2 text-sm"
            >
              <CheckCircle2 className="text-primary mt-0.5 size-4 shrink-0" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection
        eyebrow="Limits"
        title="Fair-use boundaries"
        description="These limits keep processing queues healthy. They apply to all plans."
      >
        <ul className="text-muted-foreground list-disc space-y-1 pl-5 text-sm">
          {pricingLimits.map((limit) => (
            <li key={limit}>{limit}</li>
          ))}
        </ul>
      </SeoSection>

      <SeoSection
        eyebrow="Caption planning"
        title="Before spending credits, check the caption workflow"
        description="The caption guide explains why timing, mobile readability, and language choice matter for podcast clips."
      >
        <Button asChild variant="outline">
          <Link href="/guides/podcast-clips-with-captions">
            Read the caption guide
          </Link>
        </Button>
      </SeoSection>

      <FaqSection items={pricingFaq} />
    </>
  );
}
