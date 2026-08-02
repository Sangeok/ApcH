import { ArrowRight } from "lucide-react";
import { TrackedLink } from "~/fsd/shared/analytics";
import { Badge } from "~/fsd/shared/ui/atoms/badge";
import { Button } from "~/fsd/shared/ui/atoms/button";

export default function CtaSection() {
  return (
    <section className="from-primary/10 via-background to-background rounded-3xl border bg-gradient-to-br p-10 text-center shadow-md">
      <Badge variant="secondary" className="mx-auto mb-4 w-fit">
        Ready when you are
      </Badge>
      <h2 className="text-3xl font-semibold tracking-tight">
        Turn every episode into an always-on growth engine.
      </h2>
      <p className="text-muted-foreground mx-auto mt-3 max-w-2xl text-lg">
        Launch your workspace, invite collaborators, and see your first AI
        clip in less than five minutes.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Button asChild size="lg" className="gap-2">
          <TrackedLink
            href="/login"
            metadata={{ location: "home_cta", cta: "start_free_trial" }}
          >
            Start free trial
            <ArrowRight className="size-4" />
          </TrackedLink>
        </Button>
      </div>
    </section>
  );
}
