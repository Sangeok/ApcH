import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { Button } from "~/fsd/shared/ui/atoms/button";
import { heroHighlights } from "../../config";

export default function HeroSection() {
  return (
    <section className="space-y-8">
      <div className="space-y-8">
        <Badge className="border-primary/30 bg-primary/5 text-primary w-fit gap-2 border">
          <Sparkles className="size-3.5" />
          Creator-first automation - Nov 2025
        </Badge>
        <div className="space-y-6">
          <h1 className="text-foreground text-4xl leading-tight font-semibold tracking-tight text-balance sm:text-5xl">
            AI Podcast Clipper for YouTube Shorts
          </h1>
          <p className="text-muted-foreground max-w-2xl text-lg">
            Podcast Clipper finds the high-converting moments inside every
            episode, trims them with studio precision, and ships them to
            every channel before the conversation goes stale.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg" className="gap-2">
            <Link href="/login">
              Create a free workspace
              <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/product-tour">See product tour</Link>
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {heroHighlights.map((highlight) => (
            <div
              key={highlight.label}
              className="border-border/80 bg-card/80 rounded-2xl border p-4 shadow-sm"
            >
              <p className="text-muted-foreground text-sm">
                {highlight.label}
              </p>
              <p className="mt-2 text-2xl font-semibold tracking-tight">
                {highlight.value}
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                {highlight.footnote}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
