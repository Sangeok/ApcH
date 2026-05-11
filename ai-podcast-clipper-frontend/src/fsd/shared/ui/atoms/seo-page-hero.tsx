import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { Button } from "~/fsd/shared/ui/atoms/button";

interface SeoPageHeroCta {
  label: string;
  href: string;
}

interface SeoPageHeroProps {
  eyebrow?: string;
  title: string;
  description: string;
  primaryCta?: SeoPageHeroCta;
  secondaryCta?: SeoPageHeroCta;
}

export function SeoPageHero({
  eyebrow,
  title,
  description,
  primaryCta,
  secondaryCta,
}: SeoPageHeroProps) {
  return (
    <section className="space-y-8">
      {eyebrow ? (
        <Badge variant="secondary" className="w-fit">
          {eyebrow}
        </Badge>
      ) : null}
      <div className="space-y-6">
        <h1 className="text-foreground text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
          {title}
        </h1>
        <p className="text-muted-foreground max-w-2xl text-lg">{description}</p>
      </div>
      {primaryCta ?? secondaryCta ? (
        <div className="flex flex-wrap gap-3">
          {primaryCta ? (
            <Button asChild size="lg" className="gap-2">
              <Link href={primaryCta.href}>
                {primaryCta.label}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : null}
          {secondaryCta ? (
            <Button asChild variant="outline" size="lg">
              <Link href={secondaryCta.href}>{secondaryCta.label}</Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
